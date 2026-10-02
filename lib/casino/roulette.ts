import { assertCasinoStake, casinoRandom, casinoReturn } from './types.ts';
import type { RandomInt, RouletteBet, RouletteMultiResult, RouletteResult, RouletteSelection } from './types.ts';

const RED = new Set([1,3,5,7,9,12,14,16,18,19,21,23,25,27,30,32,34,36]);
export function rouletteMaximumMultiplier(selection: RouletteSelection): number {
  if (!selection || typeof selection !== 'object') throw new Error('Invalid roulette selection.');
  const valid = selection.kind === 'number' ? Number.isInteger(selection.value) && selection.value >= 0 && selection.value <= 36
    : selection.kind === 'color' ? ['red','black'].includes(selection.value)
    : selection.kind === 'parity' ? ['odd','even'].includes(selection.value)
    : selection.kind === 'range' ? ['low','high'].includes(selection.value)
    : ['dozen','column'].includes(selection.kind) && [1,2,3].includes(selection.value as number);
  if (!valid) throw new Error('Invalid roulette selection.');
  return selection.kind === 'number' ? 36 : ['dozen','column'].includes(selection.kind) ? 3 : 2;
}
export function playRoulette(stake: number, selection: RouletteSelection, randomInt: RandomInt): RouletteResult {
  assertCasinoStake(stake);
  rouletteMaximumMultiplier(selection);
  return settleRoulette(stake,selection,casinoRandom(randomInt,37));
}
function settleRoulette(stake: number, selection: RouletteSelection, number: number): RouletteResult {
  const color = number === 0 ? 'green' : RED.has(number) ? 'red' : 'black';
  let wins = false;
  let multiplier = 2;
  switch(selection.kind) {
    case 'number': wins = number === selection.value; multiplier = 36; break;
    case 'color': wins = color === selection.value; break;
    case 'parity': wins = number !== 0 && (number % 2 === 0 ? 'even' : 'odd') === selection.value; break;
    case 'range': wins = number !== 0 && (number <= 18 ? 'low' : 'high') === selection.value; break;
    case 'dozen': wins = number !== 0 && Math.ceil(number / 12) === selection.value; multiplier = 3; break;
    case 'column': wins = number !== 0 && ((number - 1) % 3) + 1 === selection.value; multiplier = 3; break;
  }
  return {stakeTokens:stake,payoutTokens:wins ? casinoReturn(stake,multiplier) : 0,selection:{...selection},number,color};
}

/** At most 196 raw chip placements, normalized to the 49 supported positions. */
export function normalizeRouletteBets(stake: number, bets: unknown): RouletteBet[] {
  assertCasinoStake(stake);
  if (!Array.isArray(bets) || bets.length === 0 || bets.length > 196) throw new Error('Choose between 1 and 196 roulette placements.');
  const positions = new Map<string, RouletteBet>();
  let total = 0n;
  for (const bet of bets) {
    if (!bet || typeof bet !== 'object') throw new Error('Invalid roulette bet.');
    assertCasinoStake(bet.stakeTokens);
    rouletteMaximumMultiplier(bet.selection);
    const selection = {kind:bet.selection.kind,value:bet.selection.value} as RouletteSelection;
    const key = `${selection.kind}:${selection.value}`;
    total += BigInt(bet.stakeTokens);
    if (total > BigInt(Number.MAX_SAFE_INTEGER)) throw new Error('Roulette total exceeds the safe integer limit.');
    const previous = positions.get(key);
    positions.set(key,{selection,stakeTokens:(previous?.stakeTokens ?? 0)+bet.stakeTokens});
  }
  if (total !== BigInt(stake) || positions.size > 49) throw new Error('Roulette stake must equal the total placements.');
  return [...positions.entries()].sort(([a],[b])=>a.localeCompare(b)).map(([,bet])=>bet);
}
/** Exact correlated exposure: incompatible winning positions never add together. */
export function rouletteMaximumReturn(bets: readonly RouletteBet[]): number {
  const total = bets.reduce((sum,bet)=>sum+BigInt(bet.stakeTokens),0n);
  if (total > BigInt(Number.MAX_SAFE_INTEGER)) throw new Error('Roulette total exceeds the safe integer limit.');
  const normalized = normalizeRouletteBets(Number(total),bets);
  let maximum = 0n;
  for (let number=0;number<37;number++) {
    const payout = normalized.reduce((sum,bet)=>sum+BigInt(settleRoulette(bet.stakeTokens,bet.selection,number).payoutTokens),0n);
    if (payout > maximum) maximum = payout;
  }
  if (maximum > BigInt(Number.MAX_SAFE_INTEGER)) throw new Error('Roulette return exceeds the safe integer limit.');
  return Number(maximum);
}
export function playRouletteMulti(stake: number, bets: unknown, randomInt: RandomInt): RouletteMultiResult {
  const normalized = normalizeRouletteBets(stake,bets);
  rouletteMaximumReturn(normalized); // Reject unsafe exposure before drawing.
  const number = casinoRandom(randomInt,37);
  const results = normalized.map(bet=>settleRoulette(bet.stakeTokens,bet.selection,number));
  return {stakeTokens:stake,payoutTokens:results.reduce((sum,bet)=>sum+bet.payoutTokens,0),number,color:results[0].color,
    bets:results.map(({selection,stakeTokens,payoutTokens})=>({selection,stakeTokens,payoutTokens}))};
}
