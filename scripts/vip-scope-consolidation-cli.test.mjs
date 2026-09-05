import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import test from "node:test";
import { fileURLToPath } from "node:url";

const script = fileURLToPath(new URL("./migrate-vip-scope.mjs", import.meta.url));

function run(...arguments_) {
  return spawnSync(process.execPath, [script, ...arguments_], {
    encoding: "utf8",
    env: { ...process.env, GAME_DATABASE_URL: "", PORTAL_DATABASE_URL: "" },
  });
}

test("apply requires the exact migration confirmation", () => {
  const result = run("--apply", "--writers-stopped", "--confirm=wrong");
  assert.notEqual(result.status, 0);
  assert.match(result.stderr, /requires --confirm=MOVE-VIP-SCOPE-0-TO-1/);
});

test("apply requires an explicit assertion that membership writers are stopped", () => {
  const result = run("--apply", "--confirm=MOVE-VIP-SCOPE-0-TO-1");
  assert.notEqual(result.status, 0);
  assert.match(result.stderr, /requires --writers-stopped/);
});

test("the migration refuses a non-global source server", () => {
  const result = run("--from=2", "--to=1");
  assert.notEqual(result.status, 0);
  assert.match(result.stderr, /--from must be 0/);
});
