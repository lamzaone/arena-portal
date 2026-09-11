import { readdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { join } from 'node:path';
import { spawnSync } from 'node:child_process';

const root = fileURLToPath(new URL('..', import.meta.url));
for (const directory of ['src', 'scripts', 'test']) {
  for (const name of readdirSync(join(root, directory))) {
    if (!name.endsWith('.mjs')) continue;
    const result = spawnSync(process.execPath, ['--check', join(root, directory, name)], { stdio: 'inherit' });
    if (result.error || result.status !== 0) process.exit(result.status || 1);
  }
}
console.info('Discord bot JavaScript syntax checks passed (native ESM; no transpilation required).');
