import assert from "node:assert/strict";
import test from "node:test";

import { configuredArenaServerScopeLink } from "./arena-scope-resolution.mjs";

const ADMIN_GUID = "05eda3ad-2921-4083-adfb-2e23596c8caa";

test("links the explicitly configured Admins.Core and VIPCore server locators", () => {
  assert.deepEqual(configuredArenaServerScopeLink(ADMIN_GUID.toUpperCase(), "1"), {
    adminServerGuid: ADMIN_GUID,
    vipServerId: 1,
  });
});

test("does not turn VIPCore server zero into a physical-server scope", () => {
  assert.equal(configuredArenaServerScopeLink(ADMIN_GUID, 0), null);
});

test("rejects malformed or missing physical-server locators", () => {
  assert.equal(configuredArenaServerScopeLink("not-a-guid", 1), null);
  assert.equal(configuredArenaServerScopeLink(ADMIN_GUID, -1), null);
  assert.equal(configuredArenaServerScopeLink(ADMIN_GUID, 1.5), null);
});
