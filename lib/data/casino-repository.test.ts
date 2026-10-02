import assert from 'node:assert/strict';
import { after, before, beforeEach, test } from 'node:test';
import type { RowDataPacket } from 'mysql2/promise';
import type { BlackjackState, CardRank, PlinkoBatchResult, RouletteMultiResult } from '../casino/types.ts';
import { casinoFixture, validateCasinoTestUrl } from './casino-test-fixture.ts';

test('fixture rejects remote and non-test databases before connecting', () => {
  for (const url of ['mysql://root@host/casino_test', 'mysql://root@127.0.0.1/portal', 'postgres://root@localhost/casino_test']) assert.throws(() => validateCasinoTestUrl(url));
});
const url = process.env.CASINO_TEST_DATABASE_URL;
const enabled = Boolean(url);
let fixture: Awaited<ReturnType<typeof casinoFixture>>;
let api: typeof import('./casino-repository.ts');
const player = '76561198000000001';
const other = '76561198000000002';
const initialBalance = 1000;
let sequence = 0;
const key = () => `casino-fixture-request-${++sequence}`;
const instant = (overrides = {}) => ({ steamId: player, game: 'roulette' as const, stake: 20, selection: { kind: 'number', value: 36 }, idempotencyKey: key(), ...overrides });
async function rows(query: string, args: unknown[] = []) { return (await fixture.pool.query<RowDataPacket[]>(query, args))[0]; }
async function count(table: string) { return Number((await rows(`SELECT COUNT(*) AS n FROM ${table}`))[0].n); }
before(async () => {
  if (!enabled) return;
  fixture = await casinoFixture(url!);
  api = await import('./casino-repository.ts');
});
beforeEach(async () => {
  if (!enabled) return;
  process.env.CASINO_ENABLED = 'true'; delete process.env.CASINO_MIN_BET; delete process.env.CASINO_MAX_BET;
  fixture.control.failLedger = false; fixture.control.failPayout = false; fixture.control.random = maximum => maximum - 1;
  for (const table of ['portal_casino_reservations', 'portal_casino_actions', 'portal_casino_crash_bets', 'portal_casino_rounds', 'portal_casino_crash_rounds', 'portal_token_ledger', 'portal_economy_operations', 'portal_token_accounts']) await fixture.pool.execute(table === 'portal_token_ledger' ? `TRUNCATE TABLE ${table}` : `DELETE FROM ${table}`);
  await fixture.pool.execute('UPDATE portal_casino_clock SET current_round_id = NULL WHERE id = 1');
  for (const id of [player, other]) await fixture.pool.execute('INSERT INTO portal_token_accounts (steam_id,balance,lifetime_earned) VALUES (?,?,?)', [id, initialBalance, initialBalance]);
});
after(async () => { if (fixture) await fixture.close(); });
const integration = (name: string, fn: () => Promise<void>) => test(name, { skip: !enabled && 'Set CASINO_TEST_DATABASE_URL to isolated loopback casino_test.' }, fn);

integration('unsupported slot play never changes the wallet', async () => {
  await assert.rejects(api.playCasinoInstant({ steamId: player, game: 'slots', stake: 20, selection: {}, idempotencyKey: 'slot-unavailable-test-key' }), { code: 'slots_unavailable' });
  assert.equal((await api.getCasinoBootstrap(player)).balance, initialBalance);
  assert.equal(await count('portal_economy_operations'), 0);
});
integration('wins and losses use shared wallet ledger and persist immutable instant results', async () => {
  const win = await api.playCasinoInstant(instant());
  assert.equal(win.balance, 1700); assert.equal(win.round.payoutTokens, 720);
  assert.deepEqual((await rows('SELECT delta FROM portal_token_ledger ORDER BY id')).map(row => Number(row.delta)), [-20, 720]);
  const loss = await api.playCasinoInstant(instant({ selection: { kind: 'number', value: 0 } }));
  assert.equal(loss.balance, 1680); assert.equal(loss.round.payoutTokens, 0);
  const plinko = await api.playCasinoInstant(instant({ game: 'plinko', selection: { rows: 8, risk: 'low' } }));
  assert.equal(plinko.round.game, 'plinko'); assert.equal((plinko.round.details as {path: number[]}).path.length, 8);
});
integration('duplicate requests survive receipt pruning and reject conflicting reuse', async () => {
  const request = instant(); const result = await api.playCasinoInstant(request);
  assert.deepEqual(await api.playCasinoInstant(request), result);
  await fixture.pool.execute('DELETE FROM portal_economy_operations');
  assert.deepEqual(await api.playCasinoInstant(request), result);
  await assert.rejects(api.playCasinoInstant({ ...request, stake: 22 }), { code: 'idempotency_conflict' });
  await assert.rejects(api.playCasinoInstant({ ...request, steamId: other }), { code: 'idempotency_conflict' });
  assert.equal(await count('portal_casino_rounds'), 1); assert.equal(await count('portal_token_ledger'), 2);
});
integration('failed ledger writes roll back wallet, round and operation together', async () => {
  fixture.control.failLedger = true;
  await assert.rejects(api.playCasinoInstant(instant()), /injected ledger failure/);
  fixture.control.failLedger = false;
  assert.equal(Number((await rows('SELECT balance FROM portal_token_accounts WHERE steam_id = ?', [player]))[0].balance), 1000);
  for (const table of ['portal_casino_rounds', 'portal_token_ledger', 'portal_economy_operations', 'portal_casino_actions']) assert.equal(await count(table), 0);
});
integration('invalid stakes and selections cannot mutate wallets', async () => {
  for (const stake of [1, 2.1, 100001, Number.MAX_SAFE_INTEGER + 1]) await assert.rejects(api.playCasinoInstant(instant({ stake })), { code: 'invalid_input' });
  await assert.rejects(api.playCasinoInstant(instant({ selection: {kind: 'number', value: 37} })), { code: 'invalid_input' });
  await assert.rejects(api.startCasinoBlackjack({steamId: player, stake: 3, idempotencyKey: key()}), {code: 'invalid_input'});
  assert.equal(await count('portal_token_ledger'), 0);
});
integration('concurrent duplicate play and unaffordable competing stakes debit at most once', async () => {
  const request = instant(); const results = await Promise.all([api.playCasinoInstant(request), api.playCasinoInstant(request)]);
  assert.deepEqual(results[0], results[1]); assert.equal(await count('portal_token_ledger'), 2);
  await fixture.pool.execute('UPDATE portal_token_accounts SET balance = 20 WHERE steam_id = ?', [player]);
  const outcomes = await Promise.allSettled([api.playCasinoInstant(instant({selection: {kind:'number',value:0}})), api.playCasinoInstant(instant({selection: {kind:'number',value:0}}))]);
  assert.equal(outcomes.filter(result => result.status === 'fulfilled').length, 1);
  assert.equal(Number((await rows('SELECT balance FROM portal_token_accounts WHERE steam_id = ?', [player]))[0].balance), 0);
});
async function blackjack(ranks: CardRank[] = ['10', '8'], dealer: CardRank[] = ['10', '7']) {
  const started = await api.startCasinoBlackjack({steamId: player, stake: 20, idempotencyKey: key()});
  const card = (rank: CardRank) => ({rank, suit: 'clubs' as const});
  const state: BlackjackState = {status:'active', hands:[{cards:ranks.map(card),stakeTokens:20,status:'playing',natural:false,split:false,doubled:false}], currentHand:0,dealer:dealer.map(card),shoe:['3','10','10','10'].map(rank=>card(rank as CardRank)),totalStakeTokens:20,payoutTokens:null};
  await fixture.pool.execute('UPDATE portal_casino_rounds SET private_state = ?, public_state = ? WHERE id = ?', [JSON.stringify(state), '{}', started.round.id]);
  return {started,state};
}
integration('blackjack resumes without exposing shoe or hole card and enforces single active round', async () => {
  const first = await api.startCasinoBlackjack({steamId: player,stake:20,idempotencyKey:key()});
  const state = await api.getCasinoBootstrap(player);
  assert.equal(state.activeBlackjack?.id, first.round.id);
  assert.equal((state.activeBlackjack?.details as {dealer:{cards: unknown[]}}).dealer.cards[1], null);
  assert.ok(!JSON.stringify(state).includes('shoe'));
  await assert.rejects(api.startCasinoBlackjack({steamId:player,stake:20,idempotencyKey:key()}), {code:'round_active'});
  await assert.rejects(api.actCasinoBlackjack({steamId:other,roundId:first.round.id,action:'stand',idempotencyKey:key()}), {code:'ownership_required'});
});
integration('blackjack win, loss and push settle once and action retry survives pruning', async () => {
  for (const [ranks, payout] of [[['10','8'],40],[['10','6'],0],[['10','7'],20]] as [CardRank[],number][]) {
    const {started} = await blackjack(ranks);
    const request = {steamId:player,roundId:started.round.id,action:'stand' as const,idempotencyKey:key()};
    const result = await api.actCasinoBlackjack(request);
    assert.equal(result.round.payoutTokens,payout);
    await fixture.pool.execute('DELETE FROM portal_economy_operations');
    assert.deepEqual(await api.actCasinoBlackjack(request),result);
  }
  assert.equal(Number((await rows('SELECT balance FROM portal_token_accounts WHERE steam_id = ?', [player]))[0].balance), 1000);
});
integration('unaffordable double and split leave blackjack private state and wallet untouched', async () => {
  const {started,state} = await blackjack(['8','8']);
  await fixture.pool.execute('UPDATE portal_token_accounts SET balance = 0 WHERE steam_id = ?', [player]);
  for (const action of ['double','split'] as const) await assert.rejects(api.actCasinoBlackjack({steamId:player,roundId:started.round.id,action,idempotencyKey:key()}), {code:'insufficient_tokens'});
  const saved = (await rows('SELECT private_state FROM portal_casino_rounds WHERE id = ?', [started.round.id]))[0].private_state;
  assert.deepEqual(typeof saved === 'string' ? JSON.parse(saved) : saved, state);
  assert.equal(await count('portal_token_ledger'),1);
});
integration('blackjack timeout and disabled non-stake actions settle existing liabilities', async () => {
  const {started} = await blackjack();
  process.env.CASINO_ENABLED = 'false';
  await assert.rejects(api.playCasinoInstant(instant()), {code:'casino_disabled'});
  await fixture.pool.execute('UPDATE portal_casino_rounds SET expires_at_ms = 0 WHERE id = ?', [started.round.id]);
  const snapshot = await api.getCasinoBootstrap(player); assert.equal(snapshot.balance,1020); assert.equal(snapshot.activeBlackjack,null);
  await api.getCasinoBootstrap(player); assert.equal(await count('portal_token_ledger'),2);
  process.env.CASINO_ENABLED = 'true'; const second = await blackjack(); process.env.CASINO_ENABLED = 'false';
  const settled = await api.actCasinoBlackjack({steamId:player,roundId:second.started.round.id,action:'stand',idempotencyKey:key()});
  assert.equal(settled.round.payoutTokens,40);
});
async function flight(point: number, elapsed: number) {
  const snapshot = await api.getCasinoBootstrap(player); const id = snapshot.crash!.roundId;
  await fixture.pool.execute('UPDATE portal_casino_crash_rounds SET private_point = ?, start_at_ms = CAST(UNIX_TIMESTAMP(CURRENT_TIMESTAMP(3))*1000 AS UNSIGNED) - ? WHERE id = ?', [point,elapsed,id]);
  return id;
}
integration('crash rejects invalid targets, stale rounds and duplicate player bets', async () => {
  const roundId = (await api.getCasinoBootstrap(player)).crash!.roundId;
  for (const autoCashout of [100,10000,101.5]) await assert.rejects(api.betCasinoCrash({steamId:player,roundId,stake:20,autoCashout,idempotencyKey:key()}), {code:'invalid_input'});
  await assert.rejects(api.betCasinoCrash({steamId:player,roundId:'00000000-0000-4000-8000-000000000000',stake:20,idempotencyKey:key()}), {code:'round_unavailable'});
  await api.betCasinoCrash({steamId:player,roundId,stake:20,autoCashout:200,idempotencyKey:key()});
  await assert.rejects(api.betCasinoCrash({steamId:player,roundId,stake:20,idempotencyKey:key()}), {code:'bet_exists'});
  const snapshot = await api.getCasinoBootstrap(player); assert.equal(snapshot.crash!.crashesAt,null); assert.ok(!JSON.stringify(snapshot).includes('private_point'));
});
integration('automatic cashout survives disconnect and disabled settings with exactly one payout', async () => {
  const roundId = (await api.getCasinoBootstrap(player)).crash!.roundId;
  await api.betCasinoCrash({steamId:player,roundId,stake:20,autoCashout:200,idempotencyKey:key()});
  await flight(300,20000); process.env.CASINO_ENABLED = 'false';
  const snapshot = await api.getCasinoBootstrap(player); assert.equal(snapshot.balance,1020); assert.equal(snapshot.crash!.bet!.cashoutMultiplier,200);
  const request = {steamId:player,roundId,idempotencyKey:key()};
  const result = await api.cashoutCasinoCrash(request); assert.equal(result.round.payoutTokens,40);
  await fixture.pool.execute('DELETE FROM portal_economy_operations'); assert.deepEqual(await api.cashoutCasinoCrash(request),result);
  await api.getCasinoBootstrap(player); assert.equal(await count('portal_token_ledger'),2);
});
integration('automatic target equality loses and post-crash manual cashout never pays', async () => {
  const roundId = (await api.getCasinoBootstrap(player)).crash!.roundId;
  await api.betCasinoCrash({steamId:player,roundId,stake:20,autoCashout:200,idempotencyKey:key()});
  await flight(200,12000);
  const snapshot = await api.getCasinoBootstrap(player); assert.equal(snapshot.balance,980); assert.equal(snapshot.crash!.bet!.status,'lost');
  await assert.rejects(api.cashoutCasinoCrash({steamId:player,roundId,idempotencyKey:key()}), {code:'round_unavailable'});
  assert.equal(await count('portal_token_ledger'),1);
});
integration('manual cashout races return one payout and cashout retry survives pruning', async () => {
  const roundId = (await api.getCasinoBootstrap(player)).crash!.roundId;
  await api.betCasinoCrash({steamId:player,roundId,stake:20,idempotencyKey:key()});
  await flight(10000,1000); const request = {steamId:player,roundId,idempotencyKey:key()};
  const results = await Promise.all([api.cashoutCasinoCrash(request),api.cashoutCasinoCrash({...request,idempotencyKey:key()})]);
  assert.equal(results[0].round.payoutTokens,results[1].round.payoutTokens); assert.equal(await count('portal_token_ledger'),2);
  await fixture.pool.execute('DELETE FROM portal_economy_operations'); assert.deepEqual(await api.cashoutCasinoCrash(request),results[0]);
});
integration('disabled casino permits manual crash cashout while forbidding added blackjack stakes',async()=>{
  const bj = await blackjack(['8','8']);
  const crashId = (await api.getCasinoBootstrap(player)).crash!.roundId;
  await api.betCasinoCrash({steamId:player,roundId:crashId,stake:20,idempotencyKey:key()});
  await flight(10000,1000); process.env.CASINO_ENABLED='false';
  for(const action of ['double','split'] as const)await assert.rejects(api.actCasinoBlackjack({steamId:player,roundId:bj.started.round.id,action,idempotencyKey:key()}),{code:'casino_disabled'});
  const result=await api.cashoutCasinoCrash({steamId:player,roundId:crashId,idempotencyKey:key()});
  assert.equal(result.round.status,'settled');assert.ok(result.round.payoutTokens!>=20);assert.equal(await count('portal_token_ledger'),3);
});
integration('time is sampled after blocked wallet locks so an expired manual cashout loses', async () => {
  const roundId = (await api.getCasinoBootstrap(player)).crash!.roundId;
  await api.betCasinoCrash({steamId:player,roundId,stake:20,idempotencyKey:key()});
  await flight(101,0); const blocker = await fixture.pool.getConnection();
  await blocker.beginTransaction(); await blocker.query('SELECT steam_id FROM portal_token_accounts WHERE steam_id = ? FOR UPDATE',[player]);
  const action = api.cashoutCasinoCrash({steamId:player,roundId,idempotencyKey:key()});
  await new Promise(resolve=>setTimeout(resolve,250)); await blocker.commit(); blocker.release();
  await assert.rejects(action,{code:'round_unavailable'}); assert.equal(await count('portal_token_ledger'),1);
});
integration('disabled casino still restores canonical completed requests after pruning', async () => {
  const request = instant(); const original = await api.playCasinoInstant(request);
  await fixture.pool.execute('DELETE FROM portal_economy_operations'); process.env.CASINO_ENABLED = 'false';
  assert.deepEqual(await api.playCasinoInstant(request),original);
  assert.equal(await count('portal_token_ledger'),2);
  await assert.rejects(api.playCasinoInstant(instant()),{code:'casino_disabled'});
});
integration('accepted settings are saved and existing blackjack timeout uses its snapshot', async () => {
  const {started} = await blackjack();
  const row = (await rows('SELECT settings_snapshot,engine_version FROM portal_casino_rounds WHERE id = ?',[started.round.id]))[0];
  const saved = typeof row.settings_snapshot === 'string' ? JSON.parse(row.settings_snapshot) : row.settings_snapshot;
  assert.equal(saved.minBet,2); assert.equal(saved.maxBet,100000); assert.equal(saved.blackjackTimeoutMs,900000); assert.ok(row.engine_version);
  process.env.CASINO_MIN_BET = '100'; process.env.CASINO_MAX_BET = '200';
  const result = await api.actCasinoBlackjack({steamId:player,roundId:started.round.id,action:'stand',idempotencyKey:key()});
  assert.equal(result.round.payoutTokens,40);
});
integration('blackjack natural and affordable double/split use correct total-return ledger', async () => {
  fixture.control.random = maximum => maximum === 13 ? 2 : maximum === 9 ? 1 : maximum === 7 ? 3 : maximum-1;
  const natural = await api.startCasinoBlackjack({steamId:player,stake:20,idempotencyKey:key()});
  assert.equal(natural.round.payoutTokens,50); assert.equal(natural.balance,1030);
  fixture.control.random = maximum=>maximum-1;
  const doubled = await blackjack(['10','8']);
  const doubleResult = await api.actCasinoBlackjack({steamId:player,roundId:doubled.started.round.id,action:'double',idempotencyKey:key()});
  assert.equal(doubleResult.round.stakeTokens,40); assert.equal(doubleResult.round.payoutTokens,80);
  const split = await blackjack(['8','8']);
  const splitResult = await api.actCasinoBlackjack({steamId:player,roundId:split.started.round.id,action:'split',idempotencyKey:key()});
  assert.equal(splitResult.round.stakeTokens,40); assert.equal(splitResult.round.status,'active');
  assert.equal((splitResult.round.details as {hands:unknown[]}).hands.length,2);
  assert.deepEqual((await rows('SELECT delta FROM portal_token_ledger ORDER BY id')).map(row=>Number(row.delta)),[-20,50,-20,-20,80,-20,-20]);
});
integration('concurrent blackjack starts and repeated actions cannot create or debit twice', async () => {
  const outcomes = await Promise.allSettled([api.startCasinoBlackjack({steamId:player,stake:20,idempotencyKey:key()}),api.startCasinoBlackjack({steamId:player,stake:20,idempotencyKey:key()})]);
  assert.equal(outcomes.filter(result=>result.status==='fulfilled').length,1); assert.equal(await count('portal_token_ledger'),1);
  const started = outcomes.find(result=>result.status==='fulfilled'); assert.ok(started && started.status === 'fulfilled');
  const request = {steamId:player,roundId:started.value.round.id,action:'hit' as const,idempotencyKey:key()};
  const hits = await Promise.all([api.actCasinoBlackjack(request),api.actCasinoBlackjack(request)]); assert.deepEqual(hits[0],hits[1]);
  assert.equal((hits[0].round.details as {hands:{cards:unknown[]}[]}).hands[0].cards.length,3);
});
integration('missing casino migration fails with useful error and no wallet debit', async () => {
  await fixture.pool.query('RENAME TABLE portal_casino_clock TO casino_fixture_clock_backup');
  try {
    await assert.rejects(api.getCasinoBootstrap(player),{code:'casino_unavailable'});
    await assert.rejects(api.playCasinoInstant(instant()),{code:'casino_unavailable'});
    assert.equal(await count('portal_economy_operations'),0); assert.equal(await count('portal_token_ledger'),0);
  } finally { await fixture.pool.query('RENAME TABLE casino_fixture_clock_backup TO portal_casino_clock'); }
});
integration('oversized deferred crash returns reject without debit and other actors still settle',async()=>{
  const oversized=100000000000000;
  process.env.CASINO_MAX_BET=String(oversized);
  await fixture.pool.execute('UPDATE portal_token_accounts SET balance = ?, lifetime_earned = ? WHERE steam_id = ?',[oversized,oversized,player]);
  const roundId=(await api.getCasinoBootstrap(player)).crash!.roundId;
  for(const autoCashout of [9999,null]) {
    await assert.rejects(api.betCasinoCrash({steamId:player,roundId,stake:oversized,autoCashout,idempotencyKey:key()}),{code:'invalid_input'});
  }
  assert.equal(Number((await rows('SELECT balance FROM portal_token_accounts WHERE steam_id = ?',[player]))[0].balance),oversized);
  assert.equal(await count('portal_token_ledger'),0);assert.equal(await count('portal_casino_crash_bets'),0);assert.equal(await count('portal_economy_operations'),0);
  const first=await api.betCasinoCrash({steamId:player,roundId,stake:20,autoCashout:150,idempotencyKey:key()});
  const second=await api.betCasinoCrash({steamId:other,roundId,stake:40,autoCashout:200,idempotencyKey:key()});
  await flight(300,12000);
  const third='76561198000000003';
  const driving=await api.getCasinoBootstrap(third);assert.equal(driving.crash!.phase,'flying');assert.equal(driving.balance,0);
  assert.equal((await api.getCasinoBootstrap(player)).balance,oversized+10);assert.equal((await api.getCasinoBootstrap(other)).balance,1040);
  const payouts=await rows("SELECT account_steam_id,delta,reference_id,idempotency_key FROM portal_token_ledger WHERE line_key = 'payout' ORDER BY account_steam_id");
  assert.deepEqual(payouts.map(row=>[row.account_steam_id,Number(row.delta),row.reference_id]),[[player,30,first.round.id],[other,80,second.round.id]]);
  assert.notEqual(payouts[0].idempotency_key,payouts[1].idempotency_key);
  await api.getCasinoBootstrap(third);assert.equal(await count('portal_token_ledger'),4);
});
integration('oversized possible blackjack return rejects before accepting an active stake',async()=>{
  const oversized=4000000000000000;
  process.env.CASINO_MAX_BET=String(oversized);
  await fixture.pool.execute('UPDATE portal_token_accounts SET balance = ?, lifetime_earned = ? WHERE steam_id = ?',[oversized,oversized,player]);
  await assert.rejects(api.startCasinoBlackjack({steamId:player,stake:oversized,idempotencyKey:key()}),{code:'invalid_input'});
  assert.equal((await api.getCasinoBootstrap(player)).balance,oversized);assert.equal(await count('portal_token_ledger'),0);assert.equal(await count('portal_casino_rounds'),0);
});
integration('unrepresentable blackjack split exposure rolls back extra stake and private state',async()=>{
  const large=3000000000000000;
  process.env.CASINO_MAX_BET=String(large);
  await fixture.pool.execute('UPDATE portal_token_accounts SET balance = ? WHERE steam_id = ?',[large,player]);
  const started=await api.startCasinoBlackjack({steamId:player,stake:large,idempotencyKey:key()});
  await fixture.pool.execute('UPDATE portal_token_accounts SET balance = ? WHERE steam_id = ?',[large,player]);
  const card=(rank:CardRank)=>({rank,suit:'clubs' as const});
  const state:BlackjackState={status:'active',hands:[{cards:['8','8'].map(rank=>card(rank as CardRank)),stakeTokens:large,status:'playing',natural:false,split:false,doubled:false}],currentHand:0,dealer:['10','7'].map(rank=>card(rank as CardRank)),shoe:['2','3','10'].map(rank=>card(rank as CardRank)),totalStakeTokens:large,payoutTokens:null};
  await fixture.pool.execute('UPDATE portal_casino_rounds SET private_state = ? WHERE id = ?',[JSON.stringify(state),started.round.id]);
  await assert.rejects(api.actCasinoBlackjack({steamId:player,roundId:started.round.id,action:'split',idempotencyKey:key()}),{code:'invalid_input'});
  const saved=(await rows('SELECT private_state FROM portal_casino_rounds WHERE id = ?',[started.round.id]))[0].private_state;
  assert.deepEqual(typeof saved==='string'?JSON.parse(saved):saved,state);
  assert.equal((await api.getCasinoBootstrap(player)).balance,large);assert.equal(await count('portal_token_ledger'),1);assert.equal(await count('portal_casino_actions'),1);
});

async function credit(amount: number) {
  const {runEconomyMutation,lockTokenAccounts,applyTokenDelta} = await import('./portal-repository.ts');
  return runEconomyMutation({operationName:'fixture_credit',actorSteamId:player,idempotencyKey:key(),request:{amount},async work({connection,idempotencyKey}) {
    const wallets = await lockTokenAccounts(connection,[player]);
    return applyTokenDelta({connection,wallets,steamId:player,delta:amount,reason:'fixture_credit',referenceType:'fixture',referenceId:'credit',idempotencyKey,lineKey:'credit',actorSteamId:player});
  }});
}
integration('instant admission rejects both winning and losing draws before randomness when maximum return cannot fit',async()=>{
  await api.getCasinoBootstrap(player); // Create the shared clock before measuring game draws.
  for (const field of ['balance','lifetime_earned']) {
    await fixture.pool.execute('UPDATE portal_token_accounts SET balance = 1000, lifetime_earned = 1000 WHERE steam_id = ?',[player]);
    await fixture.pool.execute(`UPDATE portal_token_accounts SET ${field} = ? WHERE steam_id = ?`,[Number.MAX_SAFE_INTEGER-5,player]);
    for (const draw of [0,36]) {
      let draws=0; fixture.control.random=()=>{draws++;return draw;};
      await assert.rejects(api.playCasinoInstant(instant()),{code:'token_limit'});
      assert.equal(draws,0,'admission must precede random outcome');
    }
  }
  assert.equal(await count('portal_token_ledger'),0);
});
integration('ordinary credits preserve combined deferred headroom and another actor settles then releases it once',async()=>{
  const bj=await blackjack();
  const roundId=(await api.getCasinoBootstrap(player)).crash!.roundId;
  const request={steamId:player,roundId,stake:20,autoCashout:200,idempotencyKey:key()};
  await api.betCasinoCrash(request);
  // Active Blackjack reserves 40; Crash can manually return floor(20*99.99)=1999.
  const reserved=2039, amount=Number.MAX_SAFE_INTEGER-1000-reserved;
  await credit(amount);
  await assert.rejects(credit(1),{code:'token_limit'});
  await fixture.pool.execute('DELETE FROM portal_economy_operations');
  await api.betCasinoCrash(request);
  await assert.rejects(credit(1),{code:'token_limit'});
  await flight(10000,12000);
  await api.getCasinoBootstrap(other);
  await credit(1999-40); // Only the unspent portion of Crash's maximum is freed.
  await assert.rejects(credit(1),{code:'token_limit'});
  await api.actCasinoBlackjack({steamId:player,roundId:bj.started.round.id,action:'stand',idempotencyKey:key()});
  await api.getCasinoBootstrap(other);
  assert.equal(Number((await rows('SELECT lifetime_earned FROM portal_token_accounts WHERE steam_id = ?',[player]))[0].lifetime_earned),Number.MAX_SAFE_INTEGER);
  assert.equal((await rows("SELECT delta FROM portal_token_ledger WHERE reason = 'casino_payout'")).length,2);
});
integration('Blackjack natural ceiling and additional split/double headroom reject before debit',async()=>{
  await fixture.pool.execute('UPDATE portal_token_accounts SET lifetime_earned = ? WHERE steam_id = ?',[Number.MAX_SAFE_INTEGER-49,player]);
  await assert.rejects(api.startCasinoBlackjack({steamId:player,stake:20,idempotencyKey:key()}),{code:'token_limit'});
  await fixture.pool.execute('UPDATE portal_token_accounts SET lifetime_earned = 1000 WHERE steam_id = ?',[player]);
  const {started,state}=await blackjack(['8','8']);
  await credit(Number.MAX_SAFE_INTEGER-1000-79);
  for (const action of ['split','double'] as const) {
    await assert.rejects(api.actCasinoBlackjack({steamId:player,roundId:started.round.id,action,idempotencyKey:key()}),{code:'token_limit'});
  }
  const saved=(await rows('SELECT private_state FROM portal_casino_rounds WHERE id = ?',[started.round.id]))[0].private_state;
  assert.deepEqual(typeof saved==='string'?JSON.parse(saved):saved,state);
  assert.equal((await rows("SELECT delta FROM portal_token_ledger WHERE reason = 'casino_stake'")).length,1);
});
integration('partial migration and unreserved old liabilities fail closed while ordinary unmigrated credits work',async()=>{
  await fixture.pool.query('RENAME TABLE portal_casino_reservations TO casino_fixture_reservations_backup');
  try {
    assert.equal((await credit(1)).balance,1001);
    await assert.rejects(api.getCasinoBootstrap(player),{code:'casino_unavailable'});
    await assert.rejects(api.playCasinoInstant(instant()),{code:'casino_unavailable'});
  } finally { await fixture.pool.query('RENAME TABLE casino_fixture_reservations_backup TO portal_casino_reservations'); }
  await blackjack();
  await fixture.pool.execute('DELETE FROM portal_casino_reservations');
  await assert.rejects(api.getCasinoBootstrap(player),{code:'casino_unavailable'});
});
integration('ordinary credit reads new reservations after an older snapshot and a blocked wallet lock',async()=>{
  const {lockTokenAccounts,applyTokenDelta}=await import('./portal-repository.ts');
  const roundId=(await api.getCasinoBootstrap(player)).crash!.roundId;
  const connection=await fixture.pool.getConnection();
  let resume!:()=>void, reached!:()=>void;
  const gate=new Promise<void>(resolve=>{resume=resolve;});
  const entered=new Promise<void>(resolve=>{reached=resolve;});
  fixture.control.beforeCommit=async()=>{reached();await gate;};
  try {
    await connection.query('SET TRANSACTION ISOLATION LEVEL REPEATABLE READ');
    await connection.beginTransaction();
    await connection.query('SELECT * FROM portal_casino_reservations'); // Establish old snapshot.
    const bet=api.betCasinoCrash({steamId:player,roundId,stake:20,idempotencyKey:key()});
    await entered; // Real wager has reserved but holds its wallet until commit.
    let acquired=false;
    const locking=lockTokenAccounts(connection,[player]).then(wallets=>{acquired=true;return wallets;});
    await new Promise(resolve=>setTimeout(resolve,75));
    assert.equal(acquired,false,'ordinary credit waits for the casino wallet transaction');
    resume();await bet;
    const wallets=await locking;
    await assert.rejects(applyTokenDelta({connection,wallets,steamId:player,delta:Number.MAX_SAFE_INTEGER-1000,reason:'fixture',referenceType:'fixture',referenceId:'snapshot',idempotencyKey:key(),lineKey:'credit',actorSteamId:player}),{code:'token_limit'});
  } finally {resume();fixture.control.beforeCommit=null;await connection.rollback();connection.release();}
  assert.equal((await api.getCasinoBootstrap(player)).balance,980);
});
integration('deferred admission checks both destination limits and aggregate outstanding exposure',async()=>{
  const roundId=(await api.getCasinoBootstrap(player)).crash!.roundId;
  for(const field of ['balance','lifetime_earned']) {
    await fixture.pool.execute('UPDATE portal_token_accounts SET balance = 1000, lifetime_earned = 1000 WHERE steam_id = ?',[player]);
    await fixture.pool.execute(`UPDATE portal_token_accounts SET ${field} = ? WHERE steam_id = ?`,[Number.MAX_SAFE_INTEGER-5,player]);
    await assert.rejects(api.betCasinoCrash({steamId:player,roundId,stake:20,idempotencyKey:key()}),{code:'token_limit'});
    await assert.rejects(api.startCasinoBlackjack({steamId:player,stake:20,idempotencyKey:key()}),{code:'token_limit'});
  }
  await fixture.pool.execute('UPDATE portal_token_accounts SET balance = 1000, lifetime_earned = ? WHERE steam_id = ?',[Number.MAX_SAFE_INTEGER-2000,player]);
  await blackjack(); // 40 reserved leaves only 1960 for the next maximum 1999.
  await assert.rejects(api.betCasinoCrash({steamId:player,roundId,stake:20,idempotencyKey:key()}),{code:'token_limit'});
  assert.equal(await count('portal_casino_reservations'),1);
});
integration('loss timeout and manual settlement release their own reservation and replay leaves later exposure intact',async()=>{
  const bj=await blackjack();
  const roundId=(await api.getCasinoBootstrap(player)).crash!.roundId;
  await api.betCasinoCrash({steamId:player,roundId,stake:20,autoCashout:200,idempotencyKey:key()});
  assert.equal(await count('portal_casino_reservations'),2);
  await flight(200,12000);await api.getCasinoBootstrap(other);
  assert.equal(await count('portal_casino_reservations'),1);
  await fixture.pool.execute('UPDATE portal_casino_rounds SET expires_at_ms = 0 WHERE id = ?',[bj.started.round.id]);
  await api.getCasinoBootstrap(player);assert.equal(await count('portal_casino_reservations'),0);
  await flight(200,20000);
  const next=(await api.getCasinoBootstrap(player)).crash!.roundId;
  const bet={steamId:player,roundId:next,stake:20,idempotencyKey:key()};
  await api.betCasinoCrash(bet);await flight(10000,1000);
  const cashout={steamId:player,roundId:next,idempotencyKey:key()};
  const result=await api.cashoutCasinoCrash(cashout);
  assert.equal(await count('portal_casino_reservations'),0);
  await blackjack();await fixture.pool.execute('DELETE FROM portal_economy_operations');
  assert.deepEqual(await api.cashoutCasinoCrash(cashout),result);
  await api.betCasinoCrash(bet);assert.equal(await count('portal_casino_reservations'),1);
});
integration('instant configured overflow and Plinko maximum reject before drawing even a losing outcome',async()=>{
  await api.getCasinoBootstrap(player);
  let draws=0;fixture.control.random=()=>{draws++;return 0;};
  const large=1000000000000000;process.env.CASINO_MAX_BET=String(large);
  await fixture.pool.execute('UPDATE portal_token_accounts SET balance = ? WHERE steam_id = ?',[large,player]);
  await assert.rejects(api.playCasinoInstant(instant({stake:large})),{code:'invalid_input'});
  await assert.rejects(api.playCasinoInstant(instant({game:'plinko',stake:large,selection:{rows:16,risk:'high'}})),{code:'invalid_input'});
  await fixture.pool.execute('UPDATE portal_token_accounts SET balance = 1000, lifetime_earned = ? WHERE steam_id = ?',[Number.MAX_SAFE_INTEGER-5,player]);
  await assert.rejects(api.playCasinoInstant(instant({game:'plinko',selection:{rows:8,risk:'low'}})),{code:'token_limit'});
  assert.equal(draws,0);assert.equal(await count('portal_token_ledger'),0);
});
integration('ordinary balance credits stop at reserved headroom even when earned total has room',async()=>{
  await fixture.pool.execute('UPDATE portal_token_accounts SET balance = ? WHERE steam_id = ?',[Number.MAX_SAFE_INTEGER-2000,player]);
  const roundId=(await api.getCasinoBootstrap(player)).crash!.roundId;
  await api.betCasinoCrash({steamId:player,roundId,stake:20,autoCashout:200,idempotencyKey:key()});
  await credit(21);await assert.rejects(credit(1),{code:'token_limit'});
  await flight(10000,12000);await api.getCasinoBootstrap(other);
  assert.equal((await credit(1959)).balance,Number.MAX_SAFE_INTEGER);
});
integration('split replaces its reserved maximum once and settlement rollback restores it',async()=>{
  const {started}=await blackjack(['8','8']);
  const split={steamId:player,roundId:started.round.id,action:'split' as const,idempotencyKey:key()};
  await api.actCasinoBlackjack(split);
  assert.equal(Number((await rows('SELECT maximum_return FROM portal_casino_reservations'))[0].maximum_return),80);
  await fixture.pool.execute('DELETE FROM portal_economy_operations');await api.actCasinoBlackjack(split);
  assert.equal(Number((await rows('SELECT maximum_return FROM portal_casino_reservations'))[0].maximum_return),80);
  // First hand stands; second then settles. Failed payout rolls back release.
  await api.actCasinoBlackjack({steamId:player,roundId:started.round.id,action:'stand',idempotencyKey:key()});
  fixture.control.failLedger=true;
  const stand={steamId:player,roundId:started.round.id,action:'stand' as const,idempotencyKey:key()};
  await assert.rejects(api.actCasinoBlackjack(stand),/injected ledger failure/);
  fixture.control.failLedger=false;
  assert.equal(Number((await rows('SELECT maximum_return FROM portal_casino_reservations'))[0].maximum_return),80);
  await api.actCasinoBlackjack(stand);assert.equal(await count('portal_casino_reservations'),0);
});

integration('multi Roulette persists one draw and atomic total with canonical duplicate replay after pruning',async()=>{
  await api.getCasinoBootstrap(player);
  let draws=0;fixture.control.random=()=>{draws++;return 0;};
  const zero={kind:'number',value:0};const red={kind:'color',value:'red'};
  const request=instant({stake:30,selection:{bets:[{selection:zero,stakeTokens:4},{selection:red,stakeTokens:20},{selection:zero,stakeTokens:6}]}});
  const result=await api.playCasinoInstant(request);
  assert.equal(draws,1);assert.equal(result.round.stakeTokens,30);assert.equal(result.round.payoutTokens,360);assert.equal(result.balance,1330);
  assert.equal((result.round.details as RouletteMultiResult).bets.length,2);
  assert.deepEqual((await rows('SELECT delta FROM portal_token_ledger ORDER BY id')).map(row=>Number(row.delta)),[-30,360]);
  await fixture.pool.execute('DELETE FROM portal_economy_operations');
  process.env.CASINO_ENABLED='false';process.env.CASINO_MAX_BET='2';
  assert.deepEqual(await api.playCasinoInstant({...request,selection:{bets:[{selection:red,stakeTokens:20},{selection:zero,stakeTokens:10}]}}),result);
  await assert.rejects(api.playCasinoInstant({...request,selection:{bets:[{selection:red,stakeTokens:30}]}}),{code:'idempotency_conflict'});
  assert.equal(draws,1);assert.equal(await count('portal_casino_rounds'),1);
});
integration('Plinko batch debits full cost once and replays all saved paths after pruning',async()=>{
  await api.getCasinoBootstrap(player);
  let draws=0;fixture.control.random=()=>draws++%2;
  const request=instant({game:'plinko',stake:3,selection:{rows:8,risk:'low',ballCount:5}});
  const result=await api.playCasinoInstant(request);const details=result.round.details as PlinkoBatchResult;
  assert.equal(draws,40);assert.equal(result.round.stakeTokens,15);assert.equal(details.balls.length,5);
  assert.equal(result.round.payoutTokens,details.balls.reduce((sum,ball)=>sum+ball.payoutTokens,0));
  assert.equal(result.balance,1000-15+details.payoutTokens);
  assert.equal((await rows('SELECT SUM(delta) AS total FROM portal_token_ledger'))[0].total,String(result.balance-1000));
  await fixture.pool.execute('DELETE FROM portal_economy_operations');
  process.env.CASINO_ENABLED='false';process.env.CASINO_MAX_BET='2';
  assert.deepEqual(await api.playCasinoInstant(request),result);
  await assert.rejects(api.playCasinoInstant({...request,selection:{rows:8,risk:'low',ballCount:4}}),{code:'idempotency_conflict'});
  assert.equal(draws,40);assert.equal(await count('portal_casino_rounds'),1);
});
integration('whole-board and batch affordability, limits and unsafe exposure reject before RNG',async()=>{
  await api.getCasinoBootstrap(player);let draws=0;fixture.control.random=()=>{draws++;return 0;};
  const board=(stakeTokens:number)=>({bets:[{selection:{kind:'number',value:0},stakeTokens}]});
  await assert.rejects(api.playCasinoInstant(instant({stake:100001,selection:board(100001)})),{code:'invalid_input'});
  await assert.rejects(api.playCasinoInstant(instant({stake:1002,selection:board(1002)})),{code:'insufficient_tokens'});
  await assert.rejects(api.playCasinoInstant(instant({stake:20,selection:board(22)})),{code:'invalid_input'});
  await assert.rejects(api.playCasinoInstant(instant({game:'plinko',stake:100001,selection:{rows:8,risk:'low',ballCount:1}})),{code:'invalid_input'});
  for(const ballCount of [0,21,1.5,null]) await assert.rejects(api.playCasinoInstant(instant({game:'plinko',selection:{rows:8,risk:'low',ballCount}})),{code:'invalid_input'});
  await assert.rejects(api.playCasinoInstant(instant({game:'plinko',stake:100,selection:{rows:8,risk:'low',ballCount:11}})),{code:'insufficient_tokens'});
  process.env.CASINO_MAX_BET=String(Number.MAX_SAFE_INTEGER);
  for(const request of [instant({stake:1000000000000000,selection:board(1000000000000000)}),instant({game:'plinko',stake:Number.MAX_SAFE_INTEGER,selection:{rows:8,risk:'low',ballCount:2}}),instant({game:'plinko',stake:100000000000000,selection:{rows:16,risk:'high',ballCount:20}})]) {
    await assert.rejects(api.playCasinoInstant(request),{code:'invalid_input'});
  }
  assert.equal(draws,0);assert.equal(await count('portal_token_ledger'),0);assert.equal(await count('portal_casino_actions'),0);
});
integration('batch headroom includes every ball and Roulette exposure accounts for incompatible wins',async()=>{
  await api.getCasinoBootstrap(player);let draws=0;fixture.control.random=()=>{draws++;return 0;};
  await fixture.pool.execute('UPDATE portal_token_accounts SET lifetime_earned = ? WHERE steam_id = ?',[Number.MAX_SAFE_INTEGER-40,player]);
  await assert.rejects(api.playCasinoInstant(instant({game:'plinko',stake:20,selection:{rows:8,risk:'low',ballCount:2}})),{code:'token_limit'});
  assert.equal(draws,0);
  const result=await api.playCasinoInstant(instant({stake:40,selection:{bets:[{selection:{kind:'color',value:'red'},stakeTokens:20},{selection:{kind:'color',value:'black'},stakeTokens:20}]}}));
  assert.equal(result.round.payoutTokens,0);assert.equal(draws,1);
});
integration('multi wagers roll back their full debit and receipt when payout ledger insertion fails',async()=>{
  for(const request of [instant({stake:20,selection:{bets:[{selection:{kind:'number',value:36},stakeTokens:20}]}}),instant({game:'plinko',stake:10,selection:{rows:8,risk:'low',ballCount:5}})]) {
    fixture.control.failPayout=true;
    await assert.rejects(api.playCasinoInstant(request),/injected payout failure/);
    fixture.control.failPayout=false;
    assert.equal(Number((await rows('SELECT balance FROM portal_token_accounts WHERE steam_id = ?',[player]))[0].balance),1000);
    for(const table of ['portal_casino_rounds','portal_token_ledger','portal_casino_actions','portal_economy_operations']) assert.equal(await count(table),0);
  }
});
integration('maximum per-ball and whole-spin stakes are accepted and batch round cost is aggregate',async()=>{
  await fixture.pool.execute('UPDATE portal_token_accounts SET balance = 3000000 WHERE steam_id = ?',[player]);
  const board=await api.playCasinoInstant(instant({stake:100000,selection:{bets:[{selection:{kind:'number',value:0},stakeTokens:100000}]}}));
  assert.equal(board.round.stakeTokens,100000);
  const batch=await api.playCasinoInstant(instant({game:'plinko',stake:100000,selection:{rows:8,risk:'low',ballCount:20}}));
  assert.equal(batch.round.stakeTokens,2000000);assert.equal((batch.round.details as PlinkoBatchResult).balls.length,20);
});
integration('Crash exposes every public entrant through pending active cashed-out and lost phases',async()=>{
  const third='76561198000000003';
  await fixture.pool.execute('INSERT INTO portal_token_accounts (steam_id,balance,lifetime_earned) VALUES (?,1000,1000)',[third]);
  const roundId=(await api.getCasinoBootstrap(player)).crash!.roundId;
  for(const [id,autoCashout] of [[player,null],[other,150],[third,null]] as const) await api.betCasinoCrash({steamId:id,roundId,stake:20,autoCashout,idempotencyKey:key()});
  let snapshot=await api.getCasinoBootstrap(player);
  assert.equal(snapshot.crash!.participants.length,3);assert.ok(snapshot.crash!.participants.every(p=>p.status==='pending'));
  for(const participant of snapshot.crash!.participants) {
    assert.deepEqual(Object.keys(participant).sort(),['avatarUrl','betId','cashoutMultiplier','displayName','payoutTokens','stakeTokens','status','steamId'].sort());
    assert.equal(participant.displayName,participant.steamId);assert.equal(participant.avatarUrl,null);
  }
  assert.equal(snapshot.crash!.crashesAt,null);assert.ok(!JSON.stringify(snapshot).includes('private_point'));
  await flight(300,1000);snapshot=await api.getCasinoBootstrap(player);
  assert.equal(snapshot.crash!.phase,'flying');assert.ok(snapshot.crash!.participants.every(p=>p.status==='active'));
  await api.cashoutCasinoCrash({steamId:player,roundId,idempotencyKey:key()});
  await flight(300,9000);snapshot=await api.getCasinoBootstrap(player);
  assert.equal(snapshot.crash!.participants.find(p=>p.steamId===other)!.cashoutMultiplier,150);
  assert.equal(snapshot.crash!.participants.find(p=>p.steamId===other)!.payoutTokens,30);
  assert.equal(snapshot.crash!.participants.find(p=>p.steamId===third)!.status,'active');
  process.env.CASINO_ENABLED='false';await flight(300,19000);snapshot=await api.getCasinoBootstrap(player);
  assert.equal(snapshot.crash!.phase,'crashed');assert.equal(snapshot.crash!.participants.find(p=>p.steamId===third)!.status,'lost');
  assert.equal(snapshot.crash!.participants.find(p=>p.steamId===third)!.payoutTokens,0);
  assert.equal(snapshot.crash!.participants.filter(p=>p.status==='cashed_out').length,2);
});

integration('Steam identity misses never delay polls or cashout and warm only after commit',async()=>{
  const id='76561198000000088';
  await fixture.pool.execute('INSERT INTO portal_token_accounts (steam_id,balance,lifetime_earned) VALUES (?,1000,1000)',[id]);
  const roundId=(await api.getCasinoBootstrap(id)).crash!.roundId;
  await api.betCasinoCrash({steamId:id,roundId,stake:20,idempotencyKey:key()});
  let resolveProfiles!:(value:Map<string,import('../steam/profiles.ts').SteamProfile>)=>void;
  let calls=0, committed=false;
  const pending=new Promise<Map<string,import('../steam/profiles.ts').SteamProfile>>(resolve=>{resolveProfiles=resolve;});
  fixture.control.profiles=async ids=>{calls++;assert.equal(committed,true,'profile work is outside the transaction');assert.deepEqual(ids,[id]);return pending;};
  fixture.control.beforeCommit=async()=>{assert.equal(calls,0);committed=true;};
  try {
    const snapshot=await api.getCasinoBootstrap(id);
    assert.equal(snapshot.crash!.participants[0].displayName,id);
    fixture.control.beforeCommit=null;
    assert.equal(calls,1);
    const another=await api.getCasinoBootstrap(id);assert.equal(another.crash!.participants[0].displayName,id);assert.equal(calls,1);
    await fixture.pool.execute('UPDATE portal_casino_crash_rounds SET private_point = 10000, start_at_ms = CAST(UNIX_TIMESTAMP(CURRENT_TIMESTAMP(3))*1000 AS UNSIGNED)-1000 WHERE id = ?',[roundId]);
    const cashed=await api.cashoutCasinoCrash({steamId:id,roundId,idempotencyKey:key()});assert.equal(cashed.round.status,'settled');
    resolveProfiles(new Map([[id,{steamId:id,name:'Table Player',avatarFull:'https://avatars.steamstatic.com/example.jpg',presence:'online'}]]));
    await new Promise(resolve=>setImmediate(resolve));
    const enriched=(await api.getCasinoBootstrap(id)).crash!.participants[0];
    assert.equal(enriched.displayName,'Table Player');assert.equal(enriched.avatarUrl,'https://avatars.steamstatic.com/example.jpg');assert.equal(calls,1);
  } finally {resolveProfiles(new Map());fixture.control.beforeCommit=null;fixture.control.profiles=async()=>new Map();}
});

integration('identity warmup batches at most 100 with bounded cache, queue and negative retry caching',async()=>{
  const {warmCrashIdentities,cachedCrashIdentity}=await import('../casino/participant-identities.ts');
  const ids=Array.from({length:1100},(_,i)=>`76561199${String(i).padStart(9,'0')}`);
  let calls=0,concurrent=0,maximumConcurrent=0;const sizes:number[]=[];
  fixture.control.profiles=async batch=>{
    calls++;sizes.push(batch.length);maximumConcurrent=Math.max(maximumConcurrent,++concurrent);
    await new Promise(resolve=>setImmediate(resolve));concurrent--;
    return new Map(batch.map(steamId=>[steamId,{steamId,name:`Player ${steamId}`,avatarFull:'https://avatars.steamstatic.com/test.jpg',presence:'online' as const}]));
  };
  try {
    warmCrashIdentities(ids);
    for(let attempt=0;attempt<40;attempt++) await new Promise(resolve=>setImmediate(resolve));
    assert.equal(calls,10);assert.ok(sizes.every(size=>size===100));assert.equal(maximumConcurrent,1);
    assert.equal(ids.filter(id=>cachedCrashIdentity(id).displayName!==id).length,1000);
    warmCrashIdentities(ids.slice(1000));
    for(let attempt=0;attempt<10;attempt++) await new Promise(resolve=>setImmediate(resolve));
    assert.equal(calls,11);assert.equal(ids.filter(id=>cachedCrashIdentity(id).displayName!==id).length,1000);
    const unavailable='76561198000009999';
    fixture.control.profiles=async()=>{calls++;throw new Error('profile boundary unavailable');};
    warmCrashIdentities([unavailable]);await new Promise(resolve=>setImmediate(resolve));
    assert.deepEqual(cachedCrashIdentity(unavailable),{displayName:unavailable,avatarUrl:null});
    warmCrashIdentities([unavailable]);await new Promise(resolve=>setImmediate(resolve));assert.equal(calls,12);
  } finally {fixture.control.profiles=async()=>new Map();}
});
