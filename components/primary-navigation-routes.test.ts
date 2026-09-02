import assert from "node:assert/strict";
import test from "node:test";

import { isPrimaryNavigationLinkActive } from "./primary-navigation-routes.ts";

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
