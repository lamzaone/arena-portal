import assert from "node:assert/strict";
import test from "node:test";
import { groupWorkspaceTab, groupSourceForTab } from "./group-workspace.ts";

test("old assignment links retain their group type while legacy exceptions centralize", () => {
  assert.equal(groupWorkspaceTab("membership", "vip"), "vip");
  assert.equal(groupWorkspaceTab("membership", "custom"), "custom");
  assert.equal(groupWorkspaceTab("tags"), "custom-access");
  assert.equal(groupWorkspaceTab("permissions"), "custom-access");
  assert.equal(groupWorkspaceTab("create"), "custom");
  assert.equal(groupWorkspaceTab("unknown"), "admin");
  assert.equal(groupWorkspaceTab("connected", undefined, "vipcore"), "vip");
  assert.equal(groupWorkspaceTab(undefined, undefined, "custom"), "custom");
});
test("each type workspace selects exactly its definition source", () => {
  assert.equal(groupSourceForTab("admin"), "admins_core");
  assert.equal(groupSourceForTab("vip"), "vipcore");
  assert.equal(groupSourceForTab("custom"), "custom");
  assert.equal(groupSourceForTab("custom-access"), null);
});
