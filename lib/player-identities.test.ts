import assert from "node:assert/strict";
import { registerHooks } from "node:module";
import test from "node:test";
import type { IdentityGroupBadgeData } from "./data/identity-groups.ts";

const first = "76561198000000001";
const second = "76561198000000002";
const badge: IdentityGroupBadgeData = {
  id: 1, key: "vip", displayName: "VIP", sourceType: "vipcore", externalKey: "VIP",
  badgeLabel: "VIP", badgeIconKey: "crown", badgeColor: "#facc15", badgeSoftColor: "#332900", profilePriority: 10,
};
const calls: string[][] = [];
Object.assign(globalThis, {
  __identityBadgeLookup: async (ids: string[]) => {
    calls.push(ids);
    return new Map(ids.map((id) => [id, [badge]]));
  },
});

registerHooks({
  resolve(specifier, context, nextResolve) {
    if (specifier === "server-only") return { url: "data:text/javascript,export {};", shortCircuit: true };
    if (specifier === "@/lib/data/portal-repository") return {
      url: "data:text/javascript,export const getPlayerIdentityGroupBadges = globalThis.__identityBadgeLookup; export async function getPlayerProfileThemeKeys(){return new Map()}", shortCircuit: true,
    };
    if (specifier === "@/lib/steam/profiles") return {
      url: "data:text/javascript,export async function getSteamProfiles(){return new Map()}", shortCircuit: true,
    };
    if (specifier === "@/lib/steam/steam-id") return nextResolve(new URL("./steam/steam-id.ts", import.meta.url).href, context);
    return nextResolve(specifier, context);
  },
});

const { resolvePlayerIdentities } = await import("./player-identities.ts");

test("identities load omitted badges in one batch for all valid unique players", async () => {
  calls.length = 0;
  const players = await resolvePlayerIdentities([{ steamId: first }, { steamId: second }, { steamId: first }, { steamId: "Console" }]);
  assert.deepEqual(calls, [[first, second]]);
  assert.deepEqual(players[first].identityGroups, [badge]);
  assert.deepEqual(players[second].identityGroups, [badge]);
  assert.equal(players.Console, undefined);
});

test("authoritative supplied badges, including an empty set, are preserved without another lookup", async () => {
  calls.length = 0;
  const players = await resolvePlayerIdentities([{ steamId: first, identityGroups: [badge] }, { steamId: second, identityGroups: [] }]);
  assert.deepEqual(calls, []);
  assert.deepEqual(players[first].identityGroups, [badge]);
  assert.deepEqual(players[second].identityGroups, []);
});

test("duplicate seeds retain explicit badge resolution while only unresolved players are fetched", async () => {
  calls.length = 0;
  const players = await resolvePlayerIdentities([{ steamId: first, identityGroups: [] }, { steamId: first }, { steamId: second }]);
  assert.deepEqual(calls, [[second]]);
  assert.deepEqual(players[first].identityGroups, []);
  assert.deepEqual(players[second].identityGroups, [badge]);
});
