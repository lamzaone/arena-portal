import { casinoRandom } from './types.ts';
import type { RandomInt } from './types.ts';

const SAMPLE_SPACE = 2 ** 32;
const GROWTH_PER_MS = 0.00006;

/** P(C > target) approximates 99/target below the cap; equality loses at cashout. */
export function crashPoint(randomInt: RandomInt): number {
  const sample = casinoRandom(randomInt,SAMPLE_SPACE);
  return Math.max(100,Math.min(10000,Math.ceil(99 * SAMPLE_SPACE / (SAMPLE_SPACE-sample))));
}
/** First integral millisecond at which the displayed integer multiplier reaches this point. */
export function crashDuration(point: number): number {
  if (!Number.isSafeInteger(point) || point<100 || point>10000) throw new Error('Invalid crash multiplier.');
  return Math.ceil(Math.log(point/100)/GROWTH_PER_MS);
}
export function crashMultiplier(elapsedMs: number): number {
  if (!Number.isSafeInteger(elapsedMs) || elapsedMs<0) throw new Error('Invalid elapsed milliseconds.');
  // Invert the same integer boundaries used by crashDuration, avoiding float edge disagreements.
  let low=100,high=10000;
  while(low<high) {
    const middle=Math.ceil((low+high)/2);
    if(crashDuration(middle)<=elapsedMs) low=middle;
    else high=middle-1;
  }
  return low;
}
