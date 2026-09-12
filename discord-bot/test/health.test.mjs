import assert from 'node:assert/strict';
import { mkdtempSync, readFileSync, existsSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';
import { startHealthReporter } from '../src/health.mjs';

test('deployment heartbeat records only this process readiness and cleans up on stop', async () => {
  const directory = mkdtempSync(join(tmpdir(), 'arena-bot-health-'));
  let ready = false;
  const stop = startHealthReporter({ directory, ready: () => ready, intervalMs: 10 });
  const file = join(directory, String(process.pid));
  try {
    assert.match(readFileSync(file, 'utf8'), new RegExp(`^${process.pid} \\d+ 0\\n$`));
    ready = true;
    for (let i = 0; i < 50 && !readFileSync(file, 'utf8').endsWith(' 1\n'); i++) await new Promise(resolve => setTimeout(resolve, 10));
    assert.match(readFileSync(file, 'utf8'), new RegExp(`^${process.pid} \\d+ 1\\n$`));
    stop();
    assert.equal(existsSync(file), false);
    stop();
  } finally { stop(); rmSync(directory, { recursive: true, force: true }); }
});
test('manual startup does not require a hosting health directory', () => {
  const stop = startHealthReporter({ ready: () => true });
  assert.equal(typeof stop, 'function');
  stop();
});
