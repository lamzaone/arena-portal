import { mkdirSync, writeFileSync, renameSync, rmSync } from 'node:fs';
import { join } from 'node:path';

/** Local deployment heartbeat; no token, account data, HTTP listener or public port. */
export function startHealthReporter({ directory, ready, intervalMs = 5000 }) {
  if (!directory) return () => {};
  mkdirSync(directory, { recursive: true, mode: 0o700 });
  const file = join(directory, String(process.pid));
  const pending = `${file}.next`;
  const update = () => {
    writeFileSync(pending, `${process.pid} ${Math.floor(Date.now() / 1000)} ${ready() ? 1 : 0}\n`, { mode: 0o600 });
    renameSync(pending, file);
  };
  update();
  const timer = setInterval(() => {
    try { update(); } catch { /* A stale heartbeat makes deployment fail safely. */ }
  }, intervalMs);
  timer.unref();
  return () => {
    clearInterval(timer);
    rmSync(file, { force: true });
    rmSync(pending, { force: true });
  };
}
