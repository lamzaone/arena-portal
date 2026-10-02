import { assertCasinoStake, casinoRandom, casinoReturn } from './types.ts';
import type { RandomInt, PlinkoResult, PlinkoRows, PlinkoRisk } from './types.ts';

export function plinkoPaytable(rows: PlinkoRows, risk: PlinkoRisk): number[] {
  if (![8,12,16].includes(rows) || !['low','medium','high'].includes(risk)) throw new Error('Invalid Plinko settings.');
  const exponent = risk === 'low' ? 1 : risk === 'medium' ? 2 : 3;
  // Integral symmetric weights: risk steepens the tail while binomial normalization fixes RTP.
  const weights = Array.from({length:rows+1},(_,bin)=>1 + Math.abs(2*bin-rows) ** exponent);
  let combinations = 1;
  let weighted = 0;
  for(let bin=0;bin<=rows;bin++) {
    weighted += combinations * weights[bin];
    combinations = combinations * (rows-bin)/(bin+1);
  }
  const scale = 9700 * 2 ** rows / weighted;
  return weights.map(weight=>Math.floor(weight*scale));
}
export function playPlinko(stake: number, rows: PlinkoRows, risk: PlinkoRisk, randomInt: RandomInt): PlinkoResult {
  assertCasinoStake(stake);
  const paytable = plinkoPaytable(rows,risk);
  const path = Array.from({length:rows},()=>casinoRandom(randomInt,2) as 0|1);
  const bin = path.reduce<number>((sum,direction)=>sum+direction,0);
  const multiplier = paytable[bin];
  return {stakeTokens:stake,payoutTokens:casinoReturn(stake,multiplier,10000),rows,risk,path,bin,multiplier,paytable};
}
