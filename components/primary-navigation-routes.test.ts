import assert from "node:assert/strict";
import test from "node:test";

import { isPrimaryNavigationLinkActive, primaryLinks } from "./primary-navigation-routes.ts";

test("matches Home only at the root pathname", () => {
  assert.equal(isPrimaryNavigationLinkActive("/", "/"), true);
  assert.equal(isPrimaryNavigationLinkActive("/vip", "/"), false);
});

test("matches primary navigation sections and their nested routes", () => {
  assert.equal(isPrimaryNavigationLinkActive("/modes", "/modes"), true);
  assert.equal(isPrimaryNavigationLinkActive("/modes/competitive", "/modes"), true);
  assert.equal(isPrimaryNavigationLinkActive("/vip/perks", "/vip"), true);
  assert.equal(isPrimaryNavigationLinkActive("/ranking/season-2", "/ranking"), true);
  assert.equal(isPrimaryNavigationLinkActive("/vips", "/vip"), false);
});

test("makes the public bans page discoverable without a public warnings entry", () => {
  assert.ok(primaryLinks.some(link => link.href === "/bans" && link.label === "Bans"));
  assert.equal(primaryLinks.some(link => /warn/i.test(link.href + link.label)), false);
  assert.equal(isPrimaryNavigationLinkActive("/bans", "/bans"), true);
  assert.equal(isPrimaryNavigationLinkActive("/admin/bans", "/bans"), false);
});
