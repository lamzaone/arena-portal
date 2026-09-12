import { setTimeout as delay } from 'node:timers/promises';
import { RuntimeError } from './validation.mjs';

/** Shared by scheduled and slash-command sync; never queue stale role snapshots. */
export function createRoleSync(job) {
  let active = false;
  return async (userId, snapshot) => {
    if (active) throw new RuntimeError('A role sync is already running. Please try again shortly.');
    active = true;
    try { return await job(userId, snapshot); }
    finally { active = false; }
  };
}

/** One awaited operation per loop; the delay starts only after it settles. */
export async function runLoop(job, { intervalMs, signal, onError }) {
  while (!signal.aborted) {
    try { await job(); } catch (error) { onError(error); }
    if (signal.aborted) break;
    try { await delay(intervalMs, undefined, { signal }); }
    catch (error) { if (error.name !== 'AbortError') throw error; }
  }
}
