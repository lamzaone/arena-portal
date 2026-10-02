import { assertCasinoStake, casinoRandom, casinoReturn } from './types.ts';
import type { RandomInt, RouletteResult, RouletteSelection } from './types.ts';

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
  const number = casinoRandom(randomInt,37);
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
