import { readFileSync, writeFileSync } from 'node:fs';
import { fileURLToPath, pathToFileURL } from 'node:url';

// OpenNext issue #1305: Windows separators make the generated requireChunk
// switch empty. Normalize only the adapter's trace inputs, not app source.
const anchor = 'patchCode: async ({ code, tracedFiles, filePath }) => {';
const marker = '// TAPPED: normalize Windows traced paths (opennextjs-cloudflare#1305)';

export function normalizeTurbopackPatch(source) {
  if (source.includes(marker)) return source;
  if (source.split(anchor).length !== 2) {
    throw new Error('OpenNext adapter changed; review Windows path workaround before building.');
  }
  return source.replace(anchor, `${anchor}\n                ${marker}\n                tracedFiles = tracedFiles.map((file) => file.replace(/\\\\/g, '/'));\n                filePath = filePath.replace(/\\\\/g, '/');`);
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href && process.platform === 'win32') {
  const target = fileURLToPath(new URL('../node_modules/@opennextjs/cloudflare/dist/cli/build/patches/plugins/turbopack.js', import.meta.url));
  const source = readFileSync(target, 'utf8');
  const normalized = normalizeTurbopackPatch(source);
  if (normalized !== source) writeFileSync(target, normalized);
  console.log('OpenNext Windows trace-path normalization ready.');
}
