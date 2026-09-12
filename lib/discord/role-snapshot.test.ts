import assert from "node:assert/strict";
import test from "node:test";
import { resolveDiscordMembers, type DiscordGroup } from "./role-snapshot.ts";

const groups: DiscordGroup[] = [
  { id: "1", name: "Admin", color: "#ff0000", isAdmin: true, enabled: true, sourceType: "admins_core", externalKey: "Admin" },
  { id: "2", name: "VIP", color: null, isAdmin: false, enabled: true, sourceType: "vipcore", externalKey: "VIP" },
  { id: "3", name: "Community", color: null, isAdmin: false, enabled: true, sourceType: "custom", externalKey: null },
  { id: "4", name: "Retired", color: null, isAdmin: false, enabled: false, sourceType: "custom", externalKey: null },
];
const links = [{ steamId: "76561198000000001", discordUserId: "123456789012345678" }];

test("role membership combines authoritative custom/admin grants and scoped native groups", async () => {
  const result = await resolveDiscordMembers(groups, links, {
    available: true, membershipsBySteamId: new Map([[links[0].steamId, new Map([[3, {}], [4, {}]])]]), suppressedLegacyVipSteamIds: new Set(),
  }, async () => ({ adminGroupNames: ["ADMIN"], vipGroupNames: ["VIP"] }));
  assert.deepEqual(result, [{ discordUserId: links[0].discordUserId, steamId: links[0].steamId, groupIds: ["1", "2", "3"] }]);
});
test("VIP suppression excludes legacy tiers without removing custom groups", async () => {
  const result = await resolveDiscordMembers(groups, links, {
    available: true, membershipsBySteamId: new Map([[links[0].steamId, new Map([[3, {}]])]]), suppressedLegacyVipSteamIds: new Set([links[0].steamId]),
  }, async () => ({ adminGroupNames: [], vipGroupNames: ["VIP"] }));
  assert.deepEqual(result[0].groupIds, ["3"]);
});
test("source failures abort reconciliation instead of returning empty membership", async () => {
  await assert.rejects(resolveDiscordMembers(groups, links, {
    available: false, membershipsBySteamId: new Map(), suppressedLegacyVipSteamIds: new Set(),
  }, async () => ({ adminGroupNames: [], vipGroupNames: [] })), /unavailable/);
  await assert.rejects(resolveDiscordMembers(groups, links, {
    available: true, membershipsBySteamId: new Map(), suppressedLegacyVipSteamIds: new Set(),
  }, async () => { throw new Error("native source unavailable"); }), /unavailable/);
});
test("successful empty membership removes stale roles", async () => {
  const result = await resolveDiscordMembers(groups, links, {
    available: true, membershipsBySteamId: new Map(), suppressedLegacyVipSteamIds: new Set(),
  }, async () => ({ adminGroupNames: [], vipGroupNames: [] }));
  assert.deepEqual(result[0].groupIds, []);
});
