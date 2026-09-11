import { setTimeout as delay } from 'node:timers/promises';

/** One awaited operation per loop; the delay starts only after it settles. */
export async function runLoop(job, { intervalMs, signal, onError }) {
  while (!signal.aborted) {
    try { await job(); } catch (error) { onError(error); }
    if (signal.aborted) break;
    try { await delay(intervalMs, undefined, { signal }); }
    catch (error) { if (error.name !== 'AbortError') throw error; }
  }
}
