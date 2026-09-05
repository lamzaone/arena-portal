import assert from "node:assert/strict";
import test from "node:test";
import { parsePlayerSearchResults } from "./player-search.ts";

const badges = ["admins_core", "vipcore", "custom"].map((sourceType, index) => ({
  id: index + 1, key: sourceType, displayName: sourceType, sourceType, externalKey: null,
  badgeLabel: sourceType, badgeIconKey: "badge", badgeColor: "#ffffff", badgeSoftColor: "#111111", profilePriority: index,
}));
const player = { steamId: "76561198000000001", displayName: "Player", profileThemeKey: "beta_tester", identityGroups: badges };

test("search results retain admin, VIP and custom badges for previews and selections", () => {
  const [result] = parsePlayerSearchResults({ players: [player] });
  assert.deepEqual(result.identityGroups, badges);
  assert.equal(result.profileThemeKey, "beta_tester");
});

test("legacy results and malformed badge entries cannot break a hover preview", () => {
  assert.deepEqual(parsePlayerSearchResults({ players: [{ ...player, identityGroups: undefined }] })[0].identityGroups, []);
  assert.deepEqual(parsePlayerSearchResults({ players: [{ ...player, identityGroups: [null, {}, ...badges] }] })[0].identityGroups, badges);
  assert.deepEqual(parsePlayerSearchResults({ players: [{ ...player, steamId: "Console" }] }), []);
});
