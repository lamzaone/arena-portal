import 'server-only';
import { createHash, randomInt, randomUUID } from 'node:crypto';
import type { PoolConnection, RowDataPacket } from 'mysql2/promise';
import { getPortalDatabasePool } from '@/lib/data/database-pools';
import { applyTokenDelta, lockTokenAccounts, runEconomyMutation, type EconomyMutationContext, type TokenWallet } from './portal-repository.ts';
import { CasinoError, getCasinoSettings } from '../casino/settings.ts';
import { normalizeRouletteBets, playRoulette, playRouletteMulti, rouletteMaximumMultiplier, rouletteMaximumReturn } from '../casino/roulette.ts';
import { playPlinko, playPlinkoBatch, plinkoBatchExposure, plinkoPaytable } from '../casino/plinko.ts';
import { cachedCrashIdentity, warmCrashIdentities } from '../casino/participant-identities.ts';
import { actBlackjack, publicBlackjack, startBlackjack } from '../casino/blackjack.ts';
import { crashDuration, crashMultiplier, crashPoint } from '../casino/crash.ts';
import { casinoReturn, type BlackjackAction, type BlackjackState, type CasinoBootstrap, type CasinoGame, type CasinoRoundPublic, type CasinoSettings, type CrashBetPublic, type CrashPublicSnapshot, type PlinkoSettings, type RouletteBet, type RouletteSelection } from '../casino/types.ts';

const ENGINE_VERSION = 'native-v1';
type RoundRow = RowDataPacket & { id: string; steam_id: string; game: CasinoGame; request_key: string; status: 'active' | 'settled'; stake_tokens: number | string; payout_tokens: number | string | null; private_state: unknown; public_state: unknown; settings_snapshot: unknown; created_at_ms: number | string; settled_at_ms: number | string | null; expires_at_ms: number | string | null };
type CrashRow = RowDataPacket & { id: string; opens_at_ms: number | string; start_at_ms: number | string; private_point: number; completed_at_ms: number | string | null };
type BetRow = RowDataPacket & { id: string; round_id: string; steam_id: string; stake_tokens: number | string; auto_cashout: number | null; status: CrashBetPublic['status']; cashout_multiplier: number | null; payout_tokens: number | string | null };
export type CasinoMutationResult = { balance: number; round: CasinoRoundPublic };
type LockedCasino = { connection: PoolConnection; wallets: Map<string, TokenWallet>; now: number; settings: CasinoSettings; crash: CrashRow | null; bets: BetRow[]; blackjack: RoundRow | null };
type ActorRequest = { steamId: string; idempotencyKey: string };

function fail(code: string, message: string): never { throw new CasinoError(code, message); }
function whole(value: unknown, field: string): number {
  const number = Number(value);
  if (!Number.isSafeInteger(number) || number < 0) fail('casino_unavailable', `Casino ${field} is invalid.`);
  return number;
}
function parsed<T>(value: unknown): T { return (typeof value === 'string' ? JSON.parse(value) : value) as T; }
function roundPublic(row: RoundRow): CasinoRoundPublic {
  return { id: row.id, game: row.game, status: row.status, stakeTokens: whole(row.stake_tokens, 'stake'), payoutTokens: row.payout_tokens === null ? null : whole(row.payout_tokens, 'payout'), createdAt: new Date(whole(row.created_at_ms, 'created time')).toISOString(), settledAt: row.settled_at_ms === null ? null : new Date(whole(row.settled_at_ms, 'settled time')).toISOString(), details: row.game === 'blackjack' ? publicBlackjack(parsed<BlackjackState>(row.private_state)) : parsed<CasinoRoundPublic['details']>(row.public_state) };
}
function betPublic(row: BetRow): CrashBetPublic {
  return { id: row.id, roundId: row.round_id, stakeTokens: whole(row.stake_tokens, 'stake'), autoCashout: row.auto_cashout, status: row.status, cashoutMultiplier: row.cashout_multiplier, payoutTokens: row.payout_tokens === null ? null : whole(row.payout_tokens, 'payout') };
}
function actor(value: string) {
  if (typeof value !== 'string' || !/^7656119\d{10}$/.test(value)) fail('invalid_input', 'A valid Steam account is required.');
  return value;
}
function roundId(value: string) {
  if (typeof value !== 'string' || !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(value)) fail('invalid_input', 'Choose a valid casino round.');
  return value;
}
function stake(value: number, settings: CasinoSettings, blackjack = false) {
  if (!Number.isSafeInteger(value) || value < settings.minBet || value > settings.maxBet || (blackjack && value % 2 !== 0)) fail('invalid_input', blackjack ? `Blackjack requires an even stake between ${settings.minBet} and ${settings.maxBet} Tokens.` : `Stake must be a whole number between ${settings.minBet} and ${settings.maxBet} Tokens.`);
  if (!settings.enabled) fail('casino_disabled', 'New casino stakes are currently disabled.');
}
function checkedMaximumReturn(stakeTokens: number, numerator: number, denominator = 1) {
  try { return casinoReturn(stakeTokens,numerator,denominator); }
  catch { fail('invalid_input','This stake could exceed the safe Token payout limit. Choose a smaller stake.'); }
}
// All callers hold the wallet before touching reservations. Use current reads,
// not a consistent snapshot that could predate a wait for that wallet lock.
async function admitReturn(locked: LockedCasino, steamId: string, additionalStake: number, maximum: number, replacing?: string) {
  const wallet = locked.wallets.get(steamId)!;
  if (wallet.balance < additionalStake) fail('insufficient_tokens','This account does not have enough Tokens.');
  const [rows] = await locked.connection.query<Array<RowDataPacket & {round_id:string;maximum_return:string|number}>>('SELECT round_id, maximum_return FROM portal_casino_reservations WHERE steam_id = ? FOR UPDATE',[steamId]);
  let reserved = BigInt(maximum);
  for (const row of rows) if (row.round_id !== replacing) reserved += BigInt(row.maximum_return);
  const ceiling = BigInt(Number.MAX_SAFE_INTEGER);
  if (BigInt(wallet.balance)-BigInt(additionalStake)+reserved > ceiling || BigInt(wallet.lifetimeEarned)+reserved > ceiling || BigInt(wallet.lifetimeSpent)+BigInt(additionalStake) > ceiling)
    fail('token_limit','This wager could exceed the safe Token account limit.');
}
async function reserveReturn(locked: LockedCasino, steamId: string, id: string, maximum: number) {
  await locked.connection.execute('INSERT INTO portal_casino_reservations (round_id,steam_id,maximum_return) VALUES (?,?,?) ON DUPLICATE KEY UPDATE maximum_return = VALUES(maximum_return)',[id,steamId,maximum]);
}
async function releaseReturn(locked: LockedCasino, id: string) {
  await locked.connection.execute('DELETE FROM portal_casino_reservations WHERE round_id = ?',[id]);
}
function stableJson(value: unknown): string {
  if (Array.isArray(value)) return '[' + value.map(stableJson).join(',') + ']';
  if (value !== null && typeof value === 'object') { const object = value as Record<string, unknown>; return '{' + Object.keys(object).sort().map(key => JSON.stringify(key) + ':' + stableJson(object[key])).join(',') + '}'; }
  return JSON.stringify(value) ?? 'null';
}
async function available<T>(work: () => Promise<T>): Promise<T> {
  try { return await work(); } catch (error) {
    const code = (error as { code?: string })?.code;
    if (code === 'ER_NO_SUCH_TABLE' || code === 'ER_BAD_FIELD_ERROR') fail('casino_unavailable', 'Casino storage is unavailable. Apply portal migration 037_casino.sql.');
    throw error;
  }
}
async function dbTime(connection: PoolConnection) {
  const [rows] = await connection.query<Array<RowDataPacket & { now_ms: string | number }>>('SELECT CAST(UNIX_TIMESTAMP(CURRENT_TIMESTAMP(3)) * 1000 AS UNSIGNED) AS now_ms');
  return whole(rows[0].now_ms, 'database time');
}
async function lockClock(connection: PoolConnection) {
  const [rows] = await connection.query<Array<RowDataPacket & { current_round_id: string | null }>>('SELECT current_round_id FROM portal_casino_clock WHERE id = 1 FOR UPDATE');
  if (!rows[0]) fail('casino_unavailable', 'Casino clock is unavailable. Apply portal migration 037_casino.sql.');
  return rows[0].current_round_id;
}
async function delta(locked: LockedCasino, steamId: string, amount: number, id: string, line: string, operationKey = `casino-settle-${id}`) {
  if (amount === 0) return;
  await applyTokenDelta({ connection: locked.connection, wallets: locked.wallets, steamId, delta: amount, reason: amount < 0 ? 'casino_stake' : 'casino_payout', referenceType: 'casino_round', referenceId: id, idempotencyKey: operationKey, lineKey: line, actorSteamId: steamId, metadata: { engineVersion: ENGINE_VERSION } });
}
async function loadRound(connection: PoolConnection, id: string) {
  const [rows] = await connection.query<RoundRow[]>('SELECT * FROM portal_casino_rounds WHERE id = ? FOR UPDATE', [id]);
  return rows[0] ?? null;
}
async function persistBlackjack(locked: LockedCasino, row: RoundRow, state: BlackjackState) {
  row.private_state = state; row.public_state = publicBlackjack(state); row.stake_tokens = state.totalStakeTokens; row.status = state.status; row.payout_tokens = state.payoutTokens;
  row.settled_at_ms = state.status === 'settled' ? locked.now : null;
  const savedSettings = parsed<CasinoSettings>(row.settings_snapshot);
  row.expires_at_ms = state.status === 'active' ? locked.now + savedSettings.blackjackTimeoutMs : null;
  if (state.status === 'settled') {
    await releaseReturn(locked,row.id);
    await delta(locked, row.steam_id, state.payoutTokens!, row.id, 'payout');
  }
  await locked.connection.execute('UPDATE portal_casino_rounds SET status = ?, stake_tokens = ?, payout_tokens = ?, private_state = ?, public_state = ?, settled_at_ms = ?, expires_at_ms = ? WHERE id = ?', [row.status, row.stake_tokens, row.payout_tokens, JSON.stringify(state), JSON.stringify(row.public_state), row.settled_at_ms, row.expires_at_ms, row.id]);
}
async function persistCrashBet(locked: LockedCasino, row: BetRow, multiplier: number | null, settledAt: number) {
  row.status = multiplier === null ? 'lost' : 'cashed_out'; row.cashout_multiplier = multiplier;
  row.payout_tokens = multiplier === null ? 0 : casinoReturn(whole(row.stake_tokens, 'stake'), multiplier, 100);
  await releaseReturn(locked,row.id);
  await delta(locked, row.steam_id, row.payout_tokens, row.id, 'payout');
  await locked.connection.execute('UPDATE portal_casino_crash_bets SET status = ?, cashout_multiplier = ?, payout_tokens = ? WHERE id = ?', [row.status, multiplier, row.payout_tokens, row.id]);
  await locked.connection.execute("UPDATE portal_casino_rounds SET status = 'settled', payout_tokens = ?, public_state = ?, settled_at_ms = ? WHERE id = ?", [row.payout_tokens, JSON.stringify(betPublic(row)), settledAt, row.id]);
}
async function newCrash(locked: LockedCasino): Promise<CrashRow> {
  const row = { id: randomUUID(), opens_at_ms: locked.now, start_at_ms: locked.now + 8000, private_point: crashPoint(randomInt), completed_at_ms: null } as CrashRow;
  await locked.connection.execute('INSERT INTO portal_casino_crash_rounds (id,opens_at_ms,start_at_ms,private_point,settings_snapshot,engine_version) VALUES (?,?,?,?,?,?)', [row.id,row.opens_at_ms,row.start_at_ms,row.private_point,JSON.stringify(locked.settings),ENGINE_VERSION]);
  await locked.connection.execute('UPDATE portal_casino_clock SET current_round_id = ? WHERE id = 1', [row.id]);
  locked.bets = []; return row;
}
// Every casino path takes the singleton, round/bet rows, then all wallet locks in
// sorted Steam order. Read DB time only once these potentially blocking locks
// are acquired. No timer, browser timestamp, or pre-lock timestamp settles funds.
async function maintain(connection: PoolConnection, steamId: string, currentId: string | null): Promise<LockedCasino> {
  const settings = getCasinoSettings();
  const [blackjacks] = await connection.query<RoundRow[]>("SELECT * FROM portal_casino_rounds WHERE steam_id = ? AND game = 'blackjack' AND status = 'active' FOR UPDATE", [steamId]);
  let crash: CrashRow | null = null; let bets: BetRow[] = [];
  if (currentId) {
    const [crashes] = await connection.query<CrashRow[]>('SELECT * FROM portal_casino_crash_rounds WHERE id = ? FOR UPDATE', [currentId]);
    crash = crashes[0] ?? null;
    if (!crash) fail('casino_unavailable', 'Casino crash clock has no matching round.');
    const [currentBets] = await connection.query<BetRow[]>('SELECT * FROM portal_casino_crash_bets WHERE round_id = ? ORDER BY steam_id FOR UPDATE', [currentId]); bets = currentBets;
  }
  const wallets = await lockTokenAccounts(connection, [steamId, ...bets.filter(bet => ['pending','active'].includes(bet.status)).map(bet => bet.steam_id)]);
  const [reservations] = await connection.query<Array<RowDataPacket & {round_id:string;maximum_return:string|number}>>(
    `SELECT round_id, maximum_return FROM portal_casino_reservations WHERE steam_id IN (${[...wallets.keys()].map(()=>'?').join(',')}) FOR UPDATE`,[...wallets.keys()]);
  const reserved = new Map(reservations.map(row=>[row.round_id,BigInt(row.maximum_return)]));
  // An older development schema must be drained before upgrading. Never imply
  // that legacy active rounds with missing reservations have protected payouts.
  const liabilities = [
    ...blackjacks.map(row=>({id:row.id,maximum:checkedMaximumReturn(whole(row.stake_tokens,'stake'),2)})),
    ...bets.filter(bet=>['pending','active'].includes(bet.status)).map(bet=>({id:bet.id,maximum:checkedMaximumReturn(whole(bet.stake_tokens,'stake'),9999,100)})),
  ];
  if (liabilities.some(liability=>reserved.get(liability.id)!==BigInt(liability.maximum)))
    fail('casino_unavailable','Casino liability reservations are incomplete. Finish the casino migration before enabling play.');
  const locked: LockedCasino = { connection, wallets, now: await dbTime(connection), settings, crash, bets, blackjack: blackjacks[0] ?? null };
  if (locked.blackjack && whole(locked.blackjack.expires_at_ms, 'expiry') <= locked.now) {
    let state = parsed<BlackjackState>(locked.blackjack.private_state);
    while (state.status === 'active') state = actBlackjack(state, 'stand').state;
    await persistBlackjack(locked, locked.blackjack, state); locked.blackjack = null;
  }
  if (crash) {
    const starts = whole(crash.start_at_ms, 'flight start'); const point = whole(crash.private_point, 'crash point');
    const crashes = starts + crashDuration(point);
    for (const bet of bets) {
      if (!['pending','active'].includes(bet.status) || locked.now < starts) continue;
      if (bet.auto_cashout !== null && bet.auto_cashout < point && locked.now >= starts + crashDuration(bet.auto_cashout)) {
        await persistCrashBet(locked,bet,bet.auto_cashout,starts+crashDuration(bet.auto_cashout));
      } else if (locked.now >= crashes) await persistCrashBet(locked,bet,null,crashes);
      else if (bet.status === 'pending') {
        bet.status = 'active';
        await connection.execute("UPDATE portal_casino_crash_bets SET status = 'active' WHERE id = ?", [bet.id]);
        await connection.execute('UPDATE portal_casino_rounds SET public_state = ? WHERE id = ?', [JSON.stringify(betPublic(bet)), bet.id]);
      }
    }
    if (locked.now >= crashes && crash.completed_at_ms === null) {
      crash.completed_at_ms = crashes;
      await connection.execute('UPDATE portal_casino_crash_rounds SET completed_at_ms = ? WHERE id = ?', [crashes, crash.id]);
    }
    if (locked.now >= crashes + 5000 && settings.enabled) locked.crash = await newCrash(locked);
  } else if (settings.enabled) locked.crash = await newCrash(locked);
  return locked;
}
async function insertRound(locked: LockedCasino, input: {steamId:string;game:CasinoGame;requestKey:string;stakeTokens:number;details:CasinoRoundPublic['details'];privateState?:BlackjackState;status:'active'|'settled';payoutTokens:number|null;id?:string}): Promise<RoundRow> {
  const id = input.id ?? randomUUID();
  const expires = input.game === 'blackjack' && input.status === 'active' ? locked.now + locked.settings.blackjackTimeoutMs : null;
  await locked.connection.execute('INSERT INTO portal_casino_rounds (id,steam_id,game,request_key,status,stake_tokens,payout_tokens,private_state,public_state,settings_snapshot,engine_version,created_at_ms,settled_at_ms,expires_at_ms) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?)', [id,input.steamId,input.game,input.requestKey,input.status,input.stakeTokens,input.payoutTokens,input.privateState ? JSON.stringify(input.privateState) : null,JSON.stringify(input.details),JSON.stringify(locked.settings),ENGINE_VERSION,locked.now,input.status === 'settled' ? locked.now : null,expires]);
  return (await loadRound(locked.connection,id))!;
}
async function mutation(input: ActorRequest, operationName: string, request: Record<string, unknown>, work: (locked: LockedCasino, context: EconomyMutationContext) => Promise<CasinoRoundPublic>): Promise<CasinoMutationResult> {
  const steamId = actor(input.steamId);
  const hash = createHash('sha256').update(stableJson({operationName,steamId,request})).digest('hex');
  return available(() => runEconomyMutation<CasinoMutationResult>({operationName,actorSteamId:steamId,idempotencyKey:input.idempotencyKey,request,
    async work(context) {
      const currentId = await lockClock(context.connection);
      const [receipts] = await context.connection.query<Array<RowDataPacket & {steam_id:string;operation_name:string;request_hash:string;result_json:unknown}>>('SELECT steam_id, operation_name, request_hash, result_json FROM portal_casino_actions WHERE request_key = ? FOR UPDATE', [context.idempotencyKey]);
      const saved = receipts[0];
      if (saved) {
        if (saved.steam_id !== steamId || saved.operation_name !== operationName || saved.request_hash !== hash) fail('idempotency_conflict','This idempotency key was already used for a different casino request.');
        return parsed<CasinoMutationResult>(saved.result_json);
      }
      const locked = await maintain(context.connection,steamId,currentId);
      const round = await work(locked,context);
      const result = {balance:locked.wallets.get(steamId)!.balance,round};
      await context.connection.execute('INSERT INTO portal_casino_actions (request_key,steam_id,operation_name,request_hash,round_id,result_json,created_at_ms) VALUES (?,?,?,?,?,?,?)', [context.idempotencyKey,steamId,operationName,hash,round.id,JSON.stringify(result),locked.now]);
      return result;
    },
  }));
}
export async function playCasinoInstant(input: ActorRequest & {game:CasinoGame;stake:number;selection:unknown}): Promise<CasinoMutationResult> {
  if (input.game === 'slots') fail('slots_unavailable','Slots require an authorized provider wallet integration and are currently unavailable.');
  if (!['roulette','plinko'].includes(input.game)) fail('invalid_input','Choose Roulette or Plinko.');
  let selection = input.selection;
  if (!selection || typeof selection !== 'object' || Array.isArray(selection)) fail('invalid_input','Choose valid game settings.');
  const multiRoulette = input.game === 'roulette' && 'bets' in selection;
  const batchPlinko = input.game === 'plinko' && 'ballCount' in selection;
  let bets: RouletteBet[] = [];
  if (multiRoulette) {
    try { bets = normalizeRouletteBets(input.stake,(selection as {bets:unknown}).bets); }
    catch (error) { fail('invalid_input',error instanceof Error ? error.message : 'Invalid roulette bets.'); }
    selection = {bets}; // Equivalent placement orders/duplicates share one request identity.
  }
  const plinko = selection as PlinkoSettings & {ballCount:number};
  return mutation(input,`casino_${input.game}`,{game:input.game,stake:input.stake,selection},async (locked,context) => {
    stake(input.stake,locked.settings);
    let outcome;
    let maximum;
    let totalStake = input.stake;
    try {
      if (multiRoulette) maximum = rouletteMaximumReturn(bets);
      else if (batchPlinko) {
        const exposure = plinkoBatchExposure(input.stake,plinko.rows,plinko.risk,plinko.ballCount);
        totalStake = exposure.stakeTokens; maximum = exposure.maximumReturn;
      } else maximum = input.game === 'roulette'
        ? checkedMaximumReturn(input.stake,rouletteMaximumMultiplier(selection as RouletteSelection))
        : checkedMaximumReturn(input.stake,Math.max(...plinkoPaytable(plinko.rows,plinko.risk)),10000);
    } catch (error) { fail('invalid_input',error instanceof Error ? error.message : 'Invalid game settings.'); }
    await admitReturn(locked,input.steamId,totalStake,maximum);
    try {
      outcome = multiRoulette ? playRouletteMulti(input.stake,bets,randomInt)
        : batchPlinko ? playPlinkoBatch(input.stake,plinko.rows,plinko.risk,plinko.ballCount,randomInt)
        : input.game === 'roulette' ? playRoulette(input.stake, selection as RouletteSelection, randomInt)
        : playPlinko(input.stake,plinko.rows,plinko.risk,randomInt);
    } catch (error) { fail('invalid_input', error instanceof Error ? error.message : 'Invalid game settings.'); }
    const id = randomUUID();
    await delta(locked,input.steamId,-totalStake,id,'stake',context.idempotencyKey);
    await delta(locked,input.steamId,outcome.payoutTokens,id,'payout');
    return roundPublic(await insertRound(locked,{id,steamId:input.steamId,game:input.game,requestKey:context.idempotencyKey,stakeTokens:totalStake,details:outcome,status:'settled',payoutTokens:outcome.payoutTokens}));
  });
}
export async function startCasinoBlackjack(input: ActorRequest & {stake:number}): Promise<CasinoMutationResult> {
  return mutation(input,'casino_blackjack_start',{stake:input.stake},async (locked,context) => {
    stake(input.stake,locked.settings,true);
    if (locked.blackjack) fail('round_active','Finish your active Blackjack round first.');
    // Check the initial natural return before the deal can create a liability.
    await admitReturn(locked,input.steamId,input.stake,checkedMaximumReturn(input.stake,5,2));
    const state = startBlackjack(input.stake,randomInt); const id = randomUUID();
    await delta(locked,input.steamId,-input.stake,id,'stake',context.idempotencyKey);
    if (state.status === 'settled') await delta(locked,input.steamId,state.payoutTokens!,id,'payout');
    else await reserveReturn(locked,input.steamId,id,checkedMaximumReturn(input.stake,2));
    return roundPublic(await insertRound(locked,{id,steamId:input.steamId,game:'blackjack',requestKey:context.idempotencyKey,stakeTokens:input.stake,details:publicBlackjack(state),privateState:state,status:state.status,payoutTokens:state.payoutTokens}));
  });
}
export async function actCasinoBlackjack(input: ActorRequest & {roundId:string;action:BlackjackAction}): Promise<CasinoMutationResult> {
  roundId(input.roundId);
  if (!['hit','stand','double','split'].includes(input.action)) fail('invalid_input','Choose an available Blackjack action.');
  return mutation(input,'casino_blackjack_action',{roundId:input.roundId,action:input.action},async (locked,context) => {
    const row = await loadRound(locked.connection,input.roundId);
    if (!row || row.steam_id !== input.steamId || row.game !== 'blackjack') fail('ownership_required','This Blackjack round belongs to another player or does not exist.');
    if (row.status !== 'active') fail('round_unavailable','This Blackjack round has already settled.');
    let action;
    try { action = actBlackjack(parsed<BlackjackState>(row.private_state),input.action); }
    catch (error) { fail('invalid_input', error instanceof Error ? error.message : 'That Blackjack action is unavailable.'); }
    if (action.additionalStake > 0) {
      if (!locked.settings.enabled) fail('casino_disabled','Additional casino stakes are currently disabled.');
      // Active hands cannot be naturals; every hand can return twice its stake.
      // Include all hands before committing a split/double debit or private state.
      const maximum = checkedMaximumReturn(action.state.totalStakeTokens,2);
      await admitReturn(locked,input.steamId,action.additionalStake,maximum,row.id);
      await delta(locked,input.steamId,-action.additionalStake,row.id,'stake',context.idempotencyKey);
      await reserveReturn(locked,input.steamId,row.id,maximum);
    }
    await persistBlackjack(locked,row,action.state);
    return roundPublic(row);
  });
}
export async function betCasinoCrash(input: ActorRequest & {roundId:string;stake:number;autoCashout?:number|null}): Promise<CasinoMutationResult> {
  roundId(input.roundId); const autoCashout = input.autoCashout ?? null;
  if (autoCashout !== null && (!Number.isSafeInteger(autoCashout) || autoCashout < 101 || autoCashout > 9999)) fail('invalid_input','Automatic cashout must be between 1.01x and 99.99x.');
  return mutation(input,'casino_crash_bet',{roundId:input.roundId,stake:input.stake,autoCashout},async (locked,context) => {
    stake(input.stake,locked.settings);
    // Manual cashout remains possible with an automatic target. Check the
    // greatest winning multiplier; equality at the 100.00x crash cap loses.
    const maximum = checkedMaximumReturn(input.stake,9999,100);
    if (!locked.crash || locked.crash.id !== input.roundId || locked.now >= whole(locked.crash.start_at_ms,'flight start')) fail('round_unavailable','Betting has closed for this Crash round.');
    if (locked.bets.some(bet=>bet.steam_id === input.steamId)) fail('bet_exists','You already have a bet in this Crash round.');
    await admitReturn(locked,input.steamId,input.stake,maximum);
    const id = randomUUID();
    await delta(locked,input.steamId,-input.stake,id,'stake',context.idempotencyKey);
    const bet = {id,round_id:input.roundId,steam_id:input.steamId,stake_tokens:input.stake,auto_cashout:autoCashout,status:'pending',cashout_multiplier:null,payout_tokens:null} as BetRow;
    await reserveReturn(locked,input.steamId,id,maximum);
    await locked.connection.execute('INSERT INTO portal_casino_crash_bets (id,round_id,steam_id,stake_tokens,auto_cashout) VALUES (?,?,?,?,?)', [id,input.roundId,input.steamId,input.stake,autoCashout]);
    return roundPublic(await insertRound(locked,{id,steamId:input.steamId,game:'crash',requestKey:context.idempotencyKey,stakeTokens:input.stake,details:betPublic(bet),status:'active',payoutTokens:null}));
  });
}
export async function cashoutCasinoCrash(input: ActorRequest & {roundId:string}): Promise<CasinoMutationResult> {
  roundId(input.roundId);
  return mutation(input,'casino_crash_cashout',{roundId:input.roundId},async locked => {
    const [bets] = await locked.connection.query<BetRow[]>('SELECT * FROM portal_casino_crash_bets WHERE round_id = ? AND steam_id = ? FOR UPDATE',[input.roundId,input.steamId]);
    const bet = bets[0];
    if (!bet) fail('ownership_required','You have no bet in this Crash round.');
    if (bet.status === 'cashed_out') return roundPublic((await loadRound(locked.connection,bet.id))!);
    if (bet.status === 'lost' || !locked.crash || locked.crash.id !== input.roundId) fail('round_unavailable','This Crash round has already crashed.');
    const elapsed = locked.now - whole(locked.crash.start_at_ms,'flight start');
    if (elapsed < 0 || elapsed >= crashDuration(whole(locked.crash.private_point,'crash point'))) fail('round_unavailable','Cashout is available only during flight before the crash.');
    await persistCrashBet(locked,bet,crashMultiplier(elapsed),locked.now);
    return roundPublic((await loadRound(locked.connection,bet.id))!);
  });
}
async function crashSnapshot(locked: LockedCasino, steamId: string): Promise<CrashPublicSnapshot|null> {
  const crash = locked.crash; if (!crash) return null;
  const starts = whole(crash.start_at_ms,'flight start'); const crashed = crash.completed_at_ms !== null;
  const [recent] = await locked.connection.query<CrashRow[]>('SELECT * FROM portal_casino_crash_rounds WHERE completed_at_ms IS NOT NULL ORDER BY completed_at_ms DESC LIMIT 12');
  const own = locked.bets.find(bet=>bet.steam_id === steamId) ?? null;
  const participants = locked.bets.map(bet=>({betId:bet.id,steamId:bet.steam_id,displayName:bet.steam_id,avatarUrl:null,stakeTokens:whole(bet.stake_tokens,'stake'),status:bet.status,cashoutMultiplier:bet.cashout_multiplier,payoutTokens:bet.payout_tokens === null ? null : whole(bet.payout_tokens,'payout')}));
  return {roundId:crash.id,phase:locked.now < starts ? 'betting' : crashed ? 'crashed' : 'flying',serverTime:locked.now,opensAt:whole(crash.opens_at_ms,'betting start'),startAt:starts,crashesAt:crashed ? whole(crash.completed_at_ms,'crash time') : null,multiplier:crashed ? whole(crash.private_point,'crash result') : locked.now < starts ? 100 : crashMultiplier(locked.now-starts),recent:recent.map(row=>({roundId:row.id,multiplier:whole(row.private_point,'crash result'),crashedAt:whole(row.completed_at_ms,'crash time')})),bet:own ? betPublic(own) : null,participants};
}
export async function getCasinoBootstrap(steamId: string): Promise<CasinoBootstrap> {
  actor(steamId);
  const result = await available(async () => {
    const pool = getPortalDatabasePool(); if (!pool) fail('storage_unavailable','Portal Token storage is not configured.');
    const connection = await pool.getConnection();
    try {
      await connection.beginTransaction();
      const locked = await maintain(connection,steamId,await lockClock(connection));
      const [history] = await connection.query<RoundRow[]>('SELECT * FROM portal_casino_rounds WHERE steam_id = ? ORDER BY created_at_ms DESC, id DESC LIMIT 30', [steamId]);
      const result = {balance:locked.wallets.get(steamId)!.balance,settings:locked.settings,activeBlackjack:locked.blackjack ? roundPublic(locked.blackjack) : null,crash:await crashSnapshot(locked,steamId),history:history.map(roundPublic)};
      await connection.commit(); return result;
    } catch (error) { await connection.rollback(); throw error; } finally { connection.release(); }
  });
  // Both the connection and every financial lock have been released. A cache
  // miss returns the public Steam ID immediately; enrichment never delays a poll.
  if (result.crash) {
    result.crash.participants = result.crash.participants.map(participant=>({...participant,...cachedCrashIdentity(participant.steamId)}));
    warmCrashIdentities(result.crash.participants.map(participant=>participant.steamId));
  }
  return result;
}
