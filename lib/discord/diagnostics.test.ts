import assert from "node:assert/strict";
import test from "node:test";
import { reportDiscordFailure } from "./diagnostics.ts";

test("bridge diagnostics identify known database failures without recording raw errors or secrets", t => {
  const lines: unknown[][] = [];
  t.mock.method(console, "error", (...args: unknown[]) => { lines.push(args); });
  reportDiscordFailure("notifications.claim", { code: "ER_NO_SUCH_TABLE", message: "private-password", sql: "private-sql" });
  reportDiscordFailure("snapshot", { code: "private-token", message: "private-password" });
  assert.deepEqual(lines, [
    ["[arena-discord-bridge] notifications.claim failed: ER_NO_SUCH_TABLE"],
    ["[arena-discord-bridge] snapshot failed: internal_error"],
  ]);
});
