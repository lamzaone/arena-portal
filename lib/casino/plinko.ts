import { assertCasinoStake, casinoRandom, casinoReturn } from './types.ts';
import type { RandomInt, PlinkoBatchResult, PlinkoResult, PlinkoRows, PlinkoRisk } from './types.ts';

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
export function plinkoBatchExposure(stakePerBall: number, rows: PlinkoRows, risk: PlinkoRisk, ballCount: number): {stakeTokens:number;maximumReturn:number} {
  assertCasinoStake(stakePerBall);
  if (!Number.isSafeInteger(ballCount) || ballCount < 1 || ballCount > 20) throw new Error('Choose between 1 and 20 Plinko balls.');
  const maximum = Math.max(...plinkoPaytable(rows,risk));
  const stakeTokens = BigInt(stakePerBall)*BigInt(ballCount);
  const maximumReturn = (BigInt(stakePerBall)*BigInt(maximum)/10000n)*BigInt(ballCount);
  if (stakeTokens > BigInt(Number.MAX_SAFE_INTEGER) || maximumReturn > BigInt(Number.MAX_SAFE_INTEGER)) throw new Error('Plinko batch exceeds the safe integer limit.');
  return {stakeTokens:Number(stakeTokens),maximumReturn:Number(maximumReturn)};
}
export function playPlinkoBatch(stakePerBall: number, rows: PlinkoRows, risk: PlinkoRisk, ballCount: number, randomInt: RandomInt): PlinkoBatchResult {
  const {stakeTokens} = plinkoBatchExposure(stakePerBall,rows,risk,ballCount);
  const balls = Array.from({length:ballCount},()=>playPlinko(stakePerBall,rows,risk,randomInt));
  return {rows,risk,stakePerBall,ballCount,stakeTokens,payoutTokens:balls.reduce((sum,ball)=>sum+ball.payoutTokens,0),paytable:balls[0].paytable,balls};
}
