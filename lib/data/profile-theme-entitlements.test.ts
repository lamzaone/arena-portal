import assert from "node:assert/strict";
import { existsSync } from "node:fs";
import { registerHooks } from "node:module";
import { extname, resolve } from "node:path";
import { DatabaseSync } from "node:sqlite";
import test from "node:test";
import { fileURLToPath, pathToFileURL } from "node:url";
import type { Pool } from "mysql2/promise";

// Execute the real relational SELECTs against an isolated in-memory fixture.
// Normalize the small MySQL timestamp/locking/upsert syntax differences.
// This does not validate MySQL migrations, locking, or cross-database atomicity.
const db = new DatabaseSync(":memory:");
let authorityAvailable = true;
let nativeAdminsAvailable = true;
let queryCount = 0;
function sqliteSql(sql: string) {
  return sql.replaceAll("CURRENT_TIMESTAMP(6)", "CURRENT_TIMESTAMP")
    .replaceAll(" FOR UPDATE", "")
    .replaceAll("INSERT IGNORE INTO", "INSERT OR IGNORE INTO")
    .replaceAll("ON DUPLICATE KEY UPDATE", "ON CONFLICT DO UPDATE SET")
    .replace(/VALUES\(([a-z_]+)\)/g, "excluded.$1");
}
const executor = {
  async query(sql: string, values: unknown[] = []) {
    queryCount += 1;
    if (!authorityAvailable && sql.includes("arena_")) throw new Error("offline");
    if (!nativeAdminsAvailable && sql.includes("FROM admins")) throw new Error("admins offline");
    return [db.prepare(sqliteSql(sql))
      .all(...values as Array<string | number | null>), []];
  },
  async execute(sql: string, values: unknown[] = []) {
    const result = db.prepare(sqliteSql(sql)).run(...values as Array<string | number | null>);
    return [{ affectedRows: Number(result.changes), insertId: Number(result.lastInsertRowid) }, []];
  },
  async getConnection() { return this; },
  async beginTransaction() { db.exec("BEGIN"); },
  async commit() { db.exec("COMMIT"); },
  async rollback() { db.exec("ROLLBACK"); },
  release() {},
} as unknown as Pick<Pool, "query">;
(globalThis as typeof globalThis & { __rankThemeTestPool: typeof executor })
  .__rankThemeTestPool = executor;

function sourceModuleUrl(path: string) {
  const match = (extname(path) ? [path] : [`${path}.ts`, `${path}.tsx`, resolve(path, "index.ts")])
    .find(existsSync);
  return match ? pathToFileURL(match).href : null;
}
registerHooks({
  resolve(specifier, context, nextResolve) {
    if (specifier === "next/server") return { url: pathToFileURL(resolve("node_modules/next/server.js")).href, shortCircuit: true };
    if (specifier === "server-only") return { url: "data:text/javascript,export {};", shortCircuit: true };
    if (specifier === "@/lib/data/database-pools") return {
      url: "data:text/javascript,export function getGameDatabasePool(){return globalThis.__rankThemeTestPool} export function getPortalDatabasePool(){return globalThis.__rankThemeTestPool}",
      shortCircuit: true,
    };
    if (specifier === "@/lib/data/identity-catalogue") return {
      url: "data:text/javascript,export async function ensureIdentityCatalogue(){} export async function getIdentityCatalogueStatus(){} export async function syncIdentityCatalogue(){}",
      shortCircuit: true,
    };
    if (specifier === "@/lib/data/staff-vip-memberships") return { url: "data:text/javascript,export class StaffVipMembershipError extends Error {}", shortCircuit: true };
    if (specifier === "@/lib/data/vip-membership-activation-saga") return { url: "data:text/javascript,export async function activateVipMembershipItemWithSaga(){}", shortCircuit: true };
    if (specifier === "@/lib/auth/session") return { url: "data:text/javascript,export async function getSession(){return null} export function verifyEconomyActionToken(){return false}", shortCircuit: true };
    if (specifier.startsWith("@/")) {
      const url = sourceModuleUrl(resolve(specifier.slice(2)));
      if (url) return { url, shortCircuit: true };
    }
    if (specifier.startsWith(".") && context.parentURL?.startsWith("file:")) {
      const url = sourceModuleUrl(fileURLToPath(new URL(specifier, context.parentURL)));
      if (url) return { url, shortCircuit: true };
    }
    return nextResolve(specifier, context);
  },
});
const { getAuthorizedProfileThemeItemIds } = await import("./profile-theme-entitlements.ts");
await import("./identity-groups.ts");
const { getPlayerSettings, getPlayerProfileThemeKeys, getPortalSession, updatePlayerSettings, equipProfileThemeItem } = await import("./portal-repository.ts");
const { configuredGameServerGuid } = await import("../admin/server-scope.ts");
const { economyMutationFailure } = await import("../economy/request.ts");

const player = "76561198000000001";
const other = "76561198000000002";
const silver = { steamId: player, itemId: "silver-item", themeKey: "vip_silver" };
const gold = { steamId: player, itemId: "gold-item", themeKey: "vip_gold" };
const moderator = { steamId: player, itemId: "moderator-item", themeKey: "moderator" };

db.exec(`
  CREATE TABLE portal_identity_groups (id INTEGER PRIMARY KEY, group_key TEXT, enabled INTEGER);
  CREATE TABLE admins (Id INTEGER PRIMARY KEY, SteamId64 TEXT, Username TEXT, Permissions TEXT, Groups TEXT, Immunity INTEGER, Servers TEXT);
  CREATE TABLE portal_economy_catalogue (id INTEGER PRIMARY KEY, catalogue_key TEXT, enabled INTEGER);
  CREATE TABLE portal_profile_themes (id INTEGER PRIMARY KEY, catalogue_id INTEGER, theme_key TEXT, enabled INTEGER, display_name TEXT DEFAULT 'Theme', description TEXT DEFAULT 'Test theme', preview_image_url TEXT);
  CREATE TABLE portal_inventory_items (id TEXT PRIMARY KEY, owner_steam_id TEXT, catalogue_id INTEGER, item_type TEXT, state TEXT, tradable INTEGER);
  CREATE TABLE portal_identity_group_rewards (id INTEGER PRIMARY KEY, group_id INTEGER, catalogue_id INTEGER, enabled INTEGER, trade_policy TEXT);
  CREATE TABLE portal_identity_group_reward_awards (reward_id INTEGER, steam_id TEXT, item_id TEXT, entitlement_active INTEGER);
  CREATE TABLE arena_groups (id INTEGER PRIMARY KEY, legacy_portal_group_id INTEGER, group_type TEXT, vip_family_key TEXT, rank_weight INTEGER, enabled INTEGER, external_key TEXT);
  CREATE TABLE arena_scopes (id INTEGER PRIMARY KEY, scope_type TEXT, enabled INTEGER, admin_server_guid TEXT, vip_server_id INTEGER);
  CREATE TABLE arena_group_scopes (group_id INTEGER, scope_id INTEGER, enabled INTEGER, rank_weight_override INTEGER);
  CREATE TABLE arena_group_memberships (steam_id TEXT, group_id INTEGER, scope_id INTEGER, membership_uuid TEXT, status TEXT, starts_at TEXT, expires_at TEXT);
  CREATE TABLE arena_vip_subscriptions (steam_id TEXT, group_id INTEGER, scope_id INTEGER, vip_family_key TEXT, membership_uuid TEXT, status TEXT, starts_at TEXT, expires_at TEXT, legacy_suppressed_permanently INTEGER, legacy_suppressed_until TEXT);
  CREATE TABLE portal_player_settings (steam_id TEXT PRIMARY KEY, inventory_visibility TEXT, active_theme_id INTEGER, active_theme_item_id TEXT);
  CREATE TABLE portal_sessions (steam_id TEXT, token_hash TEXT, expires_at INTEGER, last_seen_at TEXT);
  CREATE TABLE portal_steam_accounts (steam_id TEXT PRIMARY KEY, updated_at TEXT);
  CREATE TABLE portal_token_accounts (steam_id TEXT PRIMARY KEY);
  CREATE TABLE portal_player_theme_ownership (steam_id TEXT, theme_id INTEGER, source_type TEXT, source_reference TEXT, PRIMARY KEY (steam_id, theme_id));
  CREATE TABLE portal_audit_events (actor_type TEXT, actor_id TEXT, action TEXT, target_type TEXT, target_id TEXT, metadata TEXT);
  CREATE TABLE portal_economy_operations (id INTEGER PRIMARY KEY, operation_name TEXT, idempotency_key TEXT UNIQUE, actor_steam_id TEXT, request_hash TEXT, status TEXT DEFAULT 'pending', result_json TEXT, completed_at TEXT);
  CREATE TABLE portal_economy_catalogue_prices (id INTEGER PRIMARY KEY, catalogue_id INTEGER, is_current INTEGER, market_price_eur_cents INTEGER, token_price INTEGER, price_source TEXT, source_reference TEXT, observed_at TEXT);
`);
db.exec("ALTER TABLE portal_identity_groups ADD COLUMN source_type TEXT DEFAULT 'custom'; ALTER TABLE portal_identity_groups ADD COLUMN external_key TEXT");
for (const column of ["definition_index INTEGER", "paintkit INTEGER", "seed INTEGER", "float_value REAL", "stattrak INTEGER DEFAULT 0", "stattrak_count INTEGER DEFAULT 0", "nametag TEXT", "rarity_rank INTEGER DEFAULT 8", "sale_locked INTEGER DEFAULT 0", "attributes TEXT DEFAULT '{}'", "source TEXT DEFAULT '{}'", "acquired_at TEXT DEFAULT '2026-01-01'", "consumed_at TEXT", "updated_at TEXT DEFAULT '2026-01-01'"]) db.exec(`ALTER TABLE portal_inventory_items ADD COLUMN ${column}`);
for (const column of ["market_hash_name TEXT", "item_type TEXT DEFAULT 'profile_theme'", "definition_index INTEGER", "paintkit INTEGER", "rarity_rank INTEGER DEFAULT 8", "display_name TEXT DEFAULT 'Theme'", "metadata TEXT DEFAULT '{}'", "created_at TEXT DEFAULT '2026-01-01'", "updated_at TEXT DEFAULT '2026-01-01'"]) db.exec(`ALTER TABLE portal_economy_catalogue ADD COLUMN ${column}`);

function reset() {
  authorityAvailable = true;
  nativeAdminsAvailable = true;
  queryCount = 0;
  for (const table of db.prepare("SELECT name FROM sqlite_master WHERE type = 'table'").all()) {
    db.exec(`DELETE FROM ${table.name}`);
  }
  db.exec("INSERT INTO arena_scopes VALUES (1, 'global', 1, NULL, 0), (2, 'server', 1, 'other-server', 999)");
  const ranks = [[1, "vip_silver", "vipcore.silver", "vip", 10, "silver-item"], [2, "vip_gold", "vipcore.gold", "vip", 20, "gold-item"], [3, "moderator", "admins_core.guardian", "admin", 20, "moderator-item"]] as const;
  for (const [id, key, group, type, rank, item] of ranks) {
    db.prepare("INSERT INTO portal_identity_groups (id, group_key, enabled) VALUES (?, ?, 1)").run(id, group);
    db.prepare("INSERT INTO portal_economy_catalogue (id, catalogue_key, enabled) VALUES (?, ?, 1)").run(id, `arena:membership:profile_theme:${key}`);
    db.prepare("INSERT INTO portal_profile_themes (id, catalogue_id, theme_key, enabled) VALUES (?, ?, ?, 1)").run(id, id, key);
    db.prepare("INSERT INTO portal_inventory_items (id, owner_steam_id, catalogue_id, item_type, state, tradable) VALUES (?, ?, ?, 'profile_theme', 'available', 0)").run(item, player, id);
    db.prepare("INSERT INTO portal_identity_group_rewards VALUES (?, ?, ?, 1, 'account_bound')").run(id, id, id);
    db.prepare("INSERT INTO portal_identity_group_reward_awards VALUES (?, ?, ?, 1)").run(id, player, item);
    db.prepare("INSERT INTO arena_groups VALUES (?, ?, ?, ?, ?, 1, ?)").run(id, id, type, type === "vip" ? "vip" : null, rank, key);
    db.prepare("INSERT INTO arena_group_scopes VALUES (?, 1, 1, NULL)").run(id);
  }
}
function membership(groupId: number) {
  db.prepare("INSERT INTO arena_group_memberships VALUES (?, ?, 1, ?, 'active', '2020-01-01', NULL)").run(player, groupId, `membership-${groupId}`);
  if (groupId <= 2) db.prepare("INSERT INTO arena_vip_subscriptions VALUES (?, ?, 1, 'vip', ?, 'active', '2020-01-01', NULL, 1, NULL)").run(player, groupId, `membership-${groupId}`);
}

test("account-bound themes require their awarding group's current membership", async () => {
  reset();
  assert.deepEqual([...await getAuthorizedProfileThemeItemIds(executor, [silver])], []);
  membership(2);
  assert.deepEqual([...await getAuthorizedProfileThemeItemIds(executor, [silver, gold])], [gold.itemId]);
  membership(1);
  assert.deepEqual([...await getAuthorizedProfileThemeItemIds(executor, [silver, gold])], [gold.itemId]);
});

test("expiry, future activation, revocation, disabled scope, and subscription expiry deny stale items", async () => {
  for (const mutation of [
    "UPDATE arena_group_memberships SET expires_at = '2021-01-01'",
    "UPDATE arena_group_memberships SET starts_at = '2099-01-01'",
    "UPDATE arena_group_memberships SET status = 'revoked'",
    "UPDATE arena_groups SET enabled = 0",
    "UPDATE arena_group_scopes SET enabled = 0",
    "UPDATE arena_scopes SET enabled = 0",
    "UPDATE arena_vip_subscriptions SET expires_at = '2021-01-01'",
    "UPDATE arena_vip_subscriptions SET status = 'revoked'",
  ]) {
    reset();
    membership(1);
    assert.deepEqual([...await getAuthorizedProfileThemeItemIds(executor, [silver])], [silver.itemId]);
    db.exec(mutation);
    assert.deepEqual([...await getAuthorizedProfileThemeItemIds(executor, [silver])], [], mutation);
  }
});

test("retired reward, disabled catalogue, transfer, and independent staff revocation deny access", async () => {
  for (const mutation of [
    "UPDATE portal_identity_group_rewards SET enabled = 0",
    "UPDATE portal_identity_group_rewards SET catalogue_id = 2 WHERE id = 1",
    "UPDATE portal_identity_group_reward_awards SET entitlement_active = 0",
    "UPDATE portal_identity_groups SET enabled = 0",
    "UPDATE portal_economy_catalogue SET enabled = 0",
    "UPDATE portal_profile_themes SET enabled = 0",
    "UPDATE portal_inventory_items SET state = 'revoked'",
    "UPDATE portal_inventory_items SET tradable = 1",
    `UPDATE portal_inventory_items SET owner_steam_id = '${other}'`,
  ]) {
    reset();
    membership(1);
    db.exec(mutation);
    assert.deepEqual([...await getAuthorizedProfileThemeItemIds(executor, [silver])], [], mutation);
  }
});

test("manual reward associations and permanent inventory grants are respected", async () => {
  reset();
  membership(3);
  db.exec("UPDATE portal_identity_group_rewards SET group_id = 3 WHERE id = 1");
  assert.deepEqual([...await getAuthorizedProfileThemeItemIds(executor, [silver])], [silver.itemId]);
  db.exec("DELETE FROM portal_identity_group_reward_awards WHERE reward_id = 1");
  authorityAvailable = false;
  assert.deepEqual([...await getAuthorizedProfileThemeItemIds(executor, [silver])], [silver.itemId]);
  reset();
  db.exec("UPDATE portal_identity_group_rewards SET trade_policy = 'tradable'");
  assert.deepEqual([...await getAuthorizedProfileThemeItemIds(executor, [silver])], [silver.itemId]);
});

test("returning membership can use a restored item but never bypasses its revoked state", async () => {
  reset();
  membership(1);
  db.exec("UPDATE arena_group_memberships SET status = 'revoked'; UPDATE portal_inventory_items SET state = 'revoked'; UPDATE portal_identity_group_reward_awards SET entitlement_active = 0");
  assert.deepEqual([...await getAuthorizedProfileThemeItemIds(executor, [silver])], []);
  db.exec("UPDATE arena_group_memberships SET status = 'active'");
  assert.deepEqual([...await getAuthorizedProfileThemeItemIds(executor, [silver])], []);
  db.exec("UPDATE portal_inventory_items SET state = 'available'; UPDATE portal_identity_group_reward_awards SET entitlement_active = 1");
  assert.deepEqual([...await getAuthorizedProfileThemeItemIds(executor, [silver])], [silver.itemId]);
});

test("staff themes require the player's own matching scoped membership", async () => {
  reset();
  membership(3);
  assert.deepEqual([...await getAuthorizedProfileThemeItemIds(executor, [moderator])], [moderator.itemId]);
  assert.deepEqual([...await getAuthorizedProfileThemeItemIds(executor, [{ ...moderator, steamId: other }])], []);
  db.exec("UPDATE arena_group_memberships SET scope_id = 2; UPDATE arena_group_scopes SET scope_id = 2");
  assert.deepEqual([...await getAuthorizedProfileThemeItemIds(executor, [moderator])], []);
});

test("authority failure hides ranks without writes and preserves independent themes", async () => {
  reset();
  membership(1);
  const legacy = { steamId: other, itemId: "tap-item", themeKey: "tap_god" };
  authorityAvailable = false;
  assert.deepEqual([...await getAuthorizedProfileThemeItemIds(executor, [silver, legacy])], [legacy.itemId]);
  queryCount = 0;
  assert.deepEqual([...await getAuthorizedProfileThemeItemIds(executor, [legacy])], [legacy.itemId]);
  assert.equal(queryCount, 0);
});

function equippedSilver() {
  db.prepare("INSERT INTO portal_player_settings VALUES (?, 'public', 1, ?)").run(player, silver.itemId);
  db.prepare("INSERT INTO portal_sessions VALUES (?, 'session-token', ?, NULL)").run(player, Date.now() + 60000);
}

test("session, public profile and settings hide passive expiry without a reconciliation visit", async () => {
  reset();
  membership(1);
  equippedSilver();
  assert.equal((await getPortalSession("session-token"))?.profileThemeKey, "vip_silver");
  assert.equal((await getPlayerProfileThemeKeys([player])).get(player), "vip_silver");
  assert.equal((await getPlayerSettings(player)).activeTheme?.key, "vip_silver");
  db.exec("UPDATE arena_group_memberships SET expires_at = '2021-01-01'");
  assert.equal((await getPortalSession("session-token"))?.profileThemeKey, null);
  assert.equal((await getPlayerProfileThemeKeys([player])).has(player), false);
  const settings = await getPlayerSettings(player);
  assert.equal(settings.activeTheme, null);
  assert.deepEqual(settings.ownedThemes, []);
});

test("settings and inventory equip reject stale account-bound rank items", async () => {
  reset();
  const itemId = "11111111-1111-4111-8111-111111111111";
  db.prepare("UPDATE portal_inventory_items SET id = ? WHERE id = ?").run(itemId, silver.itemId);
  db.prepare("UPDATE portal_identity_group_reward_awards SET item_id = ? WHERE item_id = ?").run(itemId, silver.itemId);
  await assert.rejects(updatePlayerSettings({ steamId: player, inventoryVisibility: "public", activeThemeItemId: itemId }), { code: "theme_not_owned" });
  await assert.rejects(equipProfileThemeItem({ steamId: player, itemId, idempotencyKey: "rank-equip-expired:test" }), { code: "theme_not_owned" });
  assert.equal(db.prepare("SELECT COUNT(*) AS count FROM portal_player_settings").get()?.count, 0);
});

test("active bound and direct grants equip successfully through both write paths", async () => {
  for (const directGrant of [false, true]) {
    reset();
    const itemId = "11111111-1111-4111-8111-111111111111";
    db.prepare("UPDATE portal_inventory_items SET id = ? WHERE id = ?").run(itemId, silver.itemId);
    db.prepare("UPDATE portal_identity_group_reward_awards SET item_id = ? WHERE item_id = ?").run(itemId, silver.itemId);
    if (directGrant) db.exec("DELETE FROM portal_identity_group_reward_awards WHERE reward_id = 1");
    else membership(1);
    const settings = await updatePlayerSettings({ steamId: player, inventoryVisibility: "private", activeThemeItemId: itemId });
    assert.equal(settings.activeThemeItemId, itemId);
    const equipped = await equipProfileThemeItem({ steamId: player, itemId, idempotencyKey: "rank-equip-active:test" });
    assert.equal(equipped.themeKey, "vip_silver");
    assert.equal((await getPlayerSettings(player)).inventoryVisibility, "private");
  }
});

function founderReward() {
  db.exec("INSERT INTO portal_identity_groups (id, group_key, enabled, source_type, external_key) VALUES (4, 'admins_core.founder', 1, 'admins_core', 'Founder'); UPDATE portal_identity_group_rewards SET group_id = 4 WHERE id = 1");
  db.prepare("INSERT INTO admins VALUES (1, ?, 'Founder player', '[]', '[\"Founder\"]', 100, ?)").run(player, JSON.stringify([configuredGameServerGuid()]));
}

test("Founder rewards use their native Admins.Core membership for equip and profile reads", async () => {
  reset();
  founderReward();
  // Founder has no Arena membership: its authority deliberately stays native.
  assert.deepEqual([...await getAuthorizedProfileThemeItemIds(executor, [silver])], [silver.itemId]);
  const itemId = "11111111-1111-4111-8111-111111111111";
  db.prepare("UPDATE portal_inventory_items SET id = ? WHERE id = ?").run(itemId, silver.itemId);
  db.prepare("UPDATE portal_identity_group_reward_awards SET item_id = ? WHERE item_id = ?").run(itemId, silver.itemId);
  const equipped = await equipProfileThemeItem({ steamId: player, itemId, idempotencyKey: "native-founder-equip:test" });
  assert.equal(equipped.themeKey, "vip_silver");
  assert.equal((await getPlayerSettings(player)).activeTheme?.key, "vip_silver");
  assert.equal((await getPlayerProfileThemeKeys([player])).get(player), "vip_silver");
  assert.equal((await updatePlayerSettings({ steamId: player, inventoryVisibility: "private", activeThemeItemId: itemId })).activeThemeItemId, itemId);
});

test("Founder rewards never trust another server, player, or a portal-only Founder membership", async () => {
  for (const mutation of [
    "UPDATE admins SET Servers = '[\"other-server\"]'",
    `UPDATE admins SET SteamId64 = '${other}'`,
    "UPDATE admins SET Groups = '[\"Owner\"]'",
    "DELETE FROM admins",
    "UPDATE portal_identity_group_rewards SET enabled = 0",
    "UPDATE portal_inventory_items SET state = 'revoked'",
  ]) {
    reset();
    founderReward();
    assert.deepEqual([...await getAuthorizedProfileThemeItemIds(executor, [silver])], [silver.itemId]);
    // A projected Founder membership must not substitute for native authority.
    db.exec("INSERT INTO arena_groups VALUES (4, 4, 'admin', NULL, 100, 1, 'Founder'); INSERT INTO arena_group_scopes VALUES (4, 1, 1, NULL)");
    membership(4);
    db.exec(mutation);
    assert.deepEqual([...await getAuthorizedProfileThemeItemIds(executor, [silver])], [], mutation);
  }
});

test("membership sources fail independently and Founder revocation takes effect immediately", async () => {
  reset();
  founderReward();
  authorityAvailable = false;
  assert.deepEqual([...await getAuthorizedProfileThemeItemIds(executor, [silver])], [silver.itemId]);
  authorityAvailable = true;
  membership(3);
  nativeAdminsAvailable = false;
  assert.deepEqual([...await getAuthorizedProfileThemeItemIds(executor, [silver, moderator])], [moderator.itemId]);
  nativeAdminsAvailable = true;
  db.exec("UPDATE admins SET Groups = '[]'");
  assert.deepEqual([...await getAuthorizedProfileThemeItemIds(executor, [silver])], []);
});

test("an unavailable theme returns an actionable conflict instead of a generic server error", async () => {
  const message = "That profile theme is not available on your account.";
  const response = economyMutationFailure(Object.assign(new Error(message), { code: "theme_not_owned" }));
  assert.equal(response.status, 409);
  assert.deepEqual(await response.json(), { ok: false, message });
});
