import assert from "node:assert/strict";
import { existsSync } from "node:fs";
import { registerHooks } from "node:module";
import { resolve } from "node:path";
import { DatabaseSync } from "node:sqlite";
import test, { beforeEach } from "node:test";
import { pathToFileURL } from "node:url";

// Run the actual public-definition SELECTs against relational fixtures.
// The existing membership resolver and Steam API have their own boundaries;
// provide their already-resolved records without external reads or writes.
const db = new DatabaseSync(":memory:");
const portalDb = new DatabaseSync(":memory:");
globalThis.__staffDirectoryPool = { async query(sql, values = []) { return [db.prepare(sql).all(...values)]; } };
const portalPool = { async query(sql, values = []) {
  globalThis.__staffDirectoryDiscordRequests.push(values);
  return [portalDb.prepare(sql).all(...values)];
} };
globalThis.__staffDirectoryPortalPool = portalPool;
globalThis.__staffDirectoryDiscordRequests = [];
globalThis.__staffDirectoryRecords = [];
globalThis.__staffDirectoryThemes = new Map();
globalThis.__staffDirectorySteamProfiles = new Map();
globalThis.__staffDirectoryThemeRequests = [];
registerHooks({
  resolve(specifier, context, nextResolve) {
    const stubs = {
      "server-only": "export {};",
      "@/lib/data/database-pools": "export const getGameDatabasePool = () => globalThis.__staffDirectoryPool; export const getPortalDatabasePool = () => globalThis.__staffDirectoryPortalPool;",
      "@/lib/data/staff-admin-memberships": "export const getStaffAdminMembershipSnapshot = async () => ({records:globalThis.__staffDirectoryRecords});",
      "@/lib/steam/profiles": "export const getSteamProfiles = async () => globalThis.__staffDirectorySteamProfiles;",
      "@/lib/data/portal-repository": "export const getPlayerProfileThemeKeys = async ids => { globalThis.__staffDirectoryThemeRequests.push(ids); return globalThis.__staffDirectoryThemes; };",
    };
    if (specifier in stubs) return { url: `data:text/javascript,${encodeURIComponent(stubs[specifier])}`, shortCircuit: true };
    if (specifier.startsWith("@/")) {
      const file = resolve(`${specifier.slice(2)}.ts`);
      if (existsSync(file)) return { url: pathToFileURL(file).href, shortCircuit: true };
    }
    return nextResolve(specifier, context);
  },
});
const { getPublicStaffDirectory } = await import("./public-staff-directory.ts");
const { configuredGameServerGuid } = await import("../admin/server-scope.ts");

db.exec(`
  CREATE TABLE groups (Id INTEGER PRIMARY KEY, Name TEXT, Immunity INTEGER, Servers TEXT);
  CREATE TABLE arena_groups (id INTEGER PRIMARY KEY, external_key TEXT, display_name TEXT, description TEXT, badge_icon_key TEXT, badge_color TEXT, group_type TEXT, rank_weight INTEGER, enabled INTEGER);
  CREATE TABLE arena_group_scopes (group_id INTEGER, scope_id INTEGER, enabled INTEGER, rank_weight_override INTEGER);
  CREATE TABLE arena_scopes (id INTEGER PRIMARY KEY, scope_type TEXT, admin_server_guid TEXT, enabled INTEGER);
`);
portalDb.exec("CREATE TABLE portal_discord_links (steam_id TEXT PRIMARY KEY, discord_user_id TEXT NOT NULL UNIQUE, linked_at TEXT)");
const nativeId = "76561198000000001";
const globalId = "76561198000000002";
const record = (steamId, source) => ({ steamId, source, name: steamId, group: "Admin", status: "active", enabled: true });
beforeEach(() => {
  portalDb.exec("DELETE FROM portal_discord_links");
  globalThis.__staffDirectoryPortalPool = portalPool;
  globalThis.__staffDirectoryDiscordRequests = [];
  db.exec("DELETE FROM groups; DELETE FROM arena_groups; DELETE FROM arena_group_scopes; DELETE FROM arena_scopes;");
  db.prepare("INSERT INTO groups VALUES (1, 'Admin', 50, ?)").run(JSON.stringify([configuredGameServerGuid()]));
  db.exec("INSERT INTO arena_groups VALUES (1, 'Admin', 'Administrator', NULL, 'shield', '#fb7185', 'admin', 50, 1)");
  db.prepare("INSERT INTO arena_scopes VALUES (1, 'server', ?, 1)").run(configuredGameServerGuid());
  db.exec("INSERT INTO arena_scopes VALUES (2, 'global', NULL, 1)");
  db.exec("INSERT INTO arena_group_scopes VALUES (1, 1, 1, 100), (1, 2, 1, NULL)");
  globalThis.__staffDirectoryRecords = [record(nativeId, "native"), record(globalId, "portal")];
  globalThis.__staffDirectoryThemes = new Map();
  globalThis.__staffDirectorySteamProfiles = new Map();
  globalThis.__staffDirectoryThemeRequests = [];
});

test("keeps global staff when the local group scope is disabled", async () => {
  db.exec("UPDATE arena_group_scopes SET enabled = 0 WHERE scope_id = 1");
  globalThis.__staffDirectoryRecords = [record(globalId, "portal")];
  const directory = await getPublicStaffDirectory();
  assert.equal(directory.available, true);
  assert.equal(directory.memberCount, 1);
  assert.equal(directory.groups[0].name, "Administrator");
});

test("a global definition does not admit native groups assigned to another server", async () => {
  db.prepare("UPDATE groups SET Servers = ?").run(JSON.stringify(["different-server"]));
  const directory = await getPublicStaffDirectory();
  assert.equal(directory.available, true);
  assert.deepEqual(directory.groups[0].members.map(member => member.steamId), [globalId]);
});

test("combines valid native and global staff but suppresses a disabled authority group", async () => {
  const enabled = await getPublicStaffDirectory();
  assert.equal(enabled.memberCount, 2);
  db.exec("UPDATE arena_groups SET enabled = 0");
  const disabled = await getPublicStaffDirectory();
  assert.equal(disabled.available, true);
  assert.equal(disabled.memberCount, 0);
  assert.deepEqual(disabled.groups, []);
});

test("loads each member's equipped theme in one batch even without Steam enrichment", async () => {
  globalThis.__staffDirectoryThemes.set(nativeId, "beta_tester");
  globalThis.__staffDirectoryRecords.push(record(nativeId, "portal"));
  const directory = await getPublicStaffDirectory();
  assert.equal(directory.available, true);
  const members = directory.groups[0].members;
  assert.equal(members.find(member => member.steamId === nativeId).profileThemeKey, "beta_tester");
  assert.equal(members.find(member => member.steamId === globalId).profileThemeKey, null);
  assert.equal(members.find(member => member.steamId === nativeId).name, nativeId);
  assert.deepEqual(globalThis.__staffDirectoryThemeRequests, [[nativeId, globalId]]);
});

test("loads linked Discord profiles for current public staff in one scoped batch", async () => {
  portalDb.prepare("INSERT INTO portal_discord_links VALUES (?, ?, ?)").run(nativeId, "123456789012345678", "private-link-timestamp");
  portalDb.prepare("INSERT INTO portal_discord_links VALUES (?, ?, NULL)").run("76561198000000099", "234567890123456789");
  globalThis.__staffDirectoryRecords.push(record(nativeId, "portal"));
  const directory = await getPublicStaffDirectory();
  assert.equal(directory.available, true);
  const members = directory.groups[0].members;
  assert.equal(members.find(member => member.steamId === nativeId).discordProfileUrl, "https://discord.com/users/123456789012345678");
  assert.equal(members.find(member => member.steamId === globalId).discordProfileUrl, null);
  assert.deepEqual(globalThis.__staffDirectoryDiscordRequests, [[nativeId, globalId]]);
  assert.equal(JSON.stringify(directory).includes("private-link-timestamp"), false);
  assert.equal(JSON.stringify(directory).includes("234567890123456789"), false);

  globalThis.__staffDirectorySteamProfiles.set(nativeId, { name: "Alice", avatarFull: "https://avatars.steamstatic.com/example.jpg", presence: "online" });
  const enriched = await getPublicStaffDirectory();
  const member = enriched.groups[0].members.find(member => member.steamId === nativeId);
  assert.equal(member.name, "Alice");
  assert.equal(member.discordProfileUrl, "https://discord.com/users/123456789012345678");
});

test("keeps the directory available before Discord storage is configured or migrated", async () => {
  globalThis.__staffDirectoryPortalPool = null;
  const unconfigured = await getPublicStaffDirectory();
  assert.equal(unconfigured.available, true);
  assert.equal(unconfigured.groups[0].members[0].discordProfileUrl, null);

  globalThis.__staffDirectoryPortalPool = { async query() { throw Object.assign(new Error("not migrated"), { code: "ER_NO_SUCH_TABLE" }); } };
  const unmigrated = await getPublicStaffDirectory();
  assert.equal(unmigrated.available, true);
  assert.equal(unmigrated.groups[0].members[0].discordProfileUrl, null);
});

test("does not look up Discord accounts when there are no public staff members", async () => {
  globalThis.__staffDirectoryRecords = [];
  const directory = await getPublicStaffDirectory();
  assert.equal(directory.available, true);
  assert.deepEqual(globalThis.__staffDirectoryDiscordRequests, []);
});
