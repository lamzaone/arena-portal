import assert from "node:assert/strict";
import test from "node:test";

import { buildStaffDirectory, type StaffDirectoryDefinition, type StaffDirectoryMembership } from "./staff-directory.ts";

const definitions: StaffDirectoryDefinition[] = [
  { key: "admin", name: "Administrator", description: null, icon: "shield", color: "#fb7185", rank: 50, enabled: true },
  { key: "founder", name: "Founder", description: "Community leadership", icon: "crown", color: "#fbbf24", rank: 100, enabled: true },
  { key: "helper", name: "Helper", description: null, icon: "users", color: "#67e8f9", rank: 10, enabled: true },
  { key: "retired", name: "Retired", description: null, icon: "shield", color: "#ffffff", rank: 60, enabled: false },
];
const membership = (steamId: string, group: string, overrides: Partial<StaffDirectoryMembership> = {}): StaffDirectoryMembership => ({
  steamId, group, name: steamId, status: "active", enabled: true, ...overrides,
});

test("orders groups by rank and preserves empty enabled groups", () => {
  const directory = buildStaffDirectory(definitions, []);
  assert.deepEqual(directory.groups.map((group) => group.name), ["Founder", "Administrator", "Helper"]);
  assert.equal(directory.memberCount, 0);
  assert.equal(directory.groups[2].members.length, 0);
});

test("combines native and managed memberships without duplicate people within a group", () => {
  const directory = buildStaffDirectory(definitions, [
    membership("76561198000000001", " Founder ", { name: "Zed" }),
    membership("76561198000000001", "founder"),
    membership("76561198000000001", "admin"),
    membership("76561198000000002", "admin", { name: "alice" }),
  ]);
  assert.equal(directory.memberCount, 2);
  assert.equal(directory.groups[0].members.length, 1);
  assert.deepEqual(directory.groups[1].members.map((member) => member.name), ["alice", "Zed"]);
});

test("excludes inactive, out-of-scope, unknown and disabled-group memberships", () => {
  const directory = buildStaffDirectory(definitions, [
    membership("76561198000000001", "admin", { status: "expired" }),
    membership("76561198000000002", "admin", { status: "scheduled" }),
    membership("76561198000000003", "admin", { status: "revoked" }),
    membership("76561198000000004", "admin", { enabled: false }),
    membership("76561198000000005", "retired"),
    membership("76561198000000006", "unknown"),
  ]);
  assert.equal(directory.memberCount, 0);
});

test("sorts by resolved Steam name and counts online people once across groups", () => {
  const directory = buildStaffDirectory(definitions, [
    membership("76561198000000001", "admin", { name: "Zed" }),
    membership("76561198000000001", "founder"),
    membership("76561198000000002", "admin", { name: "Bob" }),
  ], {
    "76561198000000001": { name: "Alice", avatarUrl: "https://avatars.steamstatic.com/example.jpg", presence: "online" },
  });
  assert.deepEqual(directory.groups[1].members.map((member) => member.name), ["Alice", "Bob"]);
  assert.equal(directory.onlineCount, 1);
  assert.equal(directory.groups[1].members[1].presence, "unknown");
  assert.equal(directory.groups[1].members[0].avatarUrl, "https://avatars.steamstatic.com/example.jpg");
});

test("publishes only presentation fields even when the source has private membership metadata", () => {
  const record = { ...membership("76561198000000001", "founder"), grantReason: "private", permissions: ["root"], membershipUuid: "private" };
  const directory = buildStaffDirectory(definitions, [record]);
  assert.deepEqual(Object.keys(directory.groups[0].members[0]).sort(), ["avatarUrl", "discordProfileUrl", "name", "presence", "profileThemeKey", "steamId"]);
});

test("publishes a Discord contact only when its linked profile URL is canonical", () => {
  const steamId = "76561198000000001";
  const memberWithDiscord = (discordProfileUrl?: string | null) => buildStaffDirectory(
    definitions,
    [membership(steamId, "founder")],
    { [steamId]: { name: "Alice", avatarUrl: null, presence: "online", discordProfileUrl } },
  ).groups[0].members[0];

  assert.equal(memberWithDiscord("https://discord.com/users/123456789012345678").discordProfileUrl, "https://discord.com/users/123456789012345678");
  for (const invalid of [undefined, null, "", "javascript:alert(1)", "https://discord.com.evil.test/users/123456789012345678", "https://discord.com/users/123456789012345678?redirect=other", "https://discord.com/users/not-a-user", "https://discord.com/users/1234"]) {
    assert.equal(memberWithDiscord(invalid).discordProfileUrl, null);
  }
});
