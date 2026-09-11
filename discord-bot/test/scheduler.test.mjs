import assert from 'node:assert/strict';
import test from 'node:test';
import { setTimeout as delay } from 'node:timers/promises';
import { runLoop } from '../src/scheduler.mjs';

test('periodic jobs never overlap and continue after failures until shutdown', async () => {
  const controller = new AbortController();
  let running = 0, maxRunning = 0, attempts = 0;
  const errors = [];
  await runLoop(async () => {
    running++; maxRunning = Math.max(maxRunning, running); attempts++;
    await delay(5); running--;
    if (attempts === 1) throw new Error('temporary');
    if (attempts === 3) controller.abort();
  }, { intervalMs: 1, signal: controller.signal, onError: error => errors.push(error) });
  assert.equal(maxRunning, 1);
  assert.equal(attempts, 3);
  assert.equal(errors.length, 1);
});
