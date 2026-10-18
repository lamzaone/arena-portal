import assert from "node:assert/strict";
import test from "node:test";
import { canUseModerationAction, availableProfileModerationActions } from "./profile-policy.ts";

test("each profile action requires its own current permission", () => {
  const actor = { isAdmin: true, permissions: new Set(["admins.commands.ban", "admins.commands.mute"]) };
  assert.equal(canUseModerationAction(actor, "ban"), true);
  assert.equal(canUseModerationAction(actor, "kick"), false);
  assert.equal(canUseModerationAction(actor, "silence"), false);
  assert.deepEqual(availableProfileModerationActions(actor, false), ["ban", "mute"]);
});
test("wildcard staff can kick only when the target is currently online", () => {
  const actor = { isAdmin: true, permissions: new Set(["admins.commands.*"]) };
  assert.deepEqual(availableProfileModerationActions(actor, true), ["ban", "kick", "gag", "mute", "silence"]);
  assert.ok(!availableProfileModerationActions(actor, false).includes("kick"));
  assert.equal(canUseModerationAction({ ...actor, isAdmin: false }, "ban"), false);
  assert.equal(canUseModerationAction(actor, "invented"), false);
});
