import assert from 'node:assert/strict';
import test from 'node:test';
import { normalizeTurbopackPatch } from './prepare-opennext-windows.mjs';

test('normalizes Windows paths before the adapter filters traced chunks', () => {
  const source = 'patchCode: async ({ code, tracedFiles, filePath }) => {\n return tracedFiles;\n}';
  const result = normalizeTurbopackPatch(source);
  assert.ok(result.includes('tracedFiles = tracedFiles.map'));
  assert.ok(result.includes('filePath = filePath.replace'));
  assert.equal(normalizeTurbopackPatch(result), result);
  const execute = new Function(`return ({${result}}).patchCode` )();
  return execute({ code: '', tracedFiles: ['D:\\app\\.next\\server\\chunks\\a.js'], filePath: 'D:\\app\\runtime.js' })
    .then(paths => assert.deepEqual(paths, ['D:/app/.next/server/chunks/a.js']));
});

test('rejects changed adapter source instead of silently producing a broken Worker', () => {
  assert.throws(() => normalizeTurbopackPatch('different implementation'), /adapter changed/);
});
