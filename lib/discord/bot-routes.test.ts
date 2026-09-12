import assert from "node:assert/strict";
import { existsSync } from "node:fs";
import { registerHooks } from "node:module";
import { extname, resolve } from "node:path";
import { DatabaseSync, type SQLInputValue } from "node:sqlite";
import test, { type TestContext } from "node:test";
import { fileURLToPath, pathToFileURL } from "node:url";
import type { Pool } from "mysql2/promise";

// The route, auth, service and repository modules are real. Only their external
// database/provider boundaries are substituted; no credentials or network are used.
const state = {
  pool: null as Pool | null,
  poolReads: 0,
  authority: { available: true, membershipsBySteamId: new Map<string, Map<number, unknown>>(), suppressedLegacyVipSteamIds: new Set<string>() },
  external: { adminGroupNames: ["Admin"], vipGroupNames: [] as string[] },
  externalFailure: null as Error | null,
  catalogueCalls: 0,
  catalogueFailure: null as Error | null,
};
(globalThis as typeof globalThis & { __discordBotRouteTest: typeof state }).__discordBotRouteTest = state;
const source = (path: string) => (extname(path) ? [path] : [`${path}.ts`, `${path}.tsx`]).find(existsSync);
registerHooks({
  resolve(specifier, context, nextResolve) {
    const modules: Record<string, string> = {
      "server-only": "export {};",
      "@/lib/data/identity-catalogue": `export async function ensureIdentityCatalogue(){const state=globalThis.__discordBotRouteTest;state.catalogueCalls++;if(state.catalogueFailure)throw state.catalogueFailure;}`,
      "@/lib/data/database-pools": `export function getPortalDatabasePool(){const state=globalThis.__discordBotRouteTest;state.poolReads++;return state.pool}`,
      "@/lib/data/identity-groups": `export async function getArenaAuthorityMembershipsForPlayers(){return globalThis.__discordBotRouteTest.authority}`,
      "@/lib/data/portal-repository": `export async function getAuthoritativeExternalIdentityMemberships(){const state=globalThis.__discordBotRouteTest;if(state.externalFailure)throw state.externalFailure;return state.external}`,
    };
    if (specifier in modules) return { url: `data:text/javascript,${encodeURIComponent(modules[specifier])}`, shortCircuit: true };
    const candidate = specifier.startsWith("@/") ? source(resolve(specifier.slice(2))) : specifier.startsWith(".") && context.parentURL?.startsWith("file:") ? source(fileURLToPath(new URL(specifier, context.parentURL))) : undefined;
    if (candidate) return { url: pathToFileURL(candidate).href, shortCircuit: true };
    return nextResolve(specifier, context);
  },
});

const { GET: snapshot } = await import("../../app/api/discord/bot/snapshot/route.ts");
const { POST: saveRole } = await import("../../app/api/discord/bot/roles/route.ts");
const { POST: notifications } = await import("../../app/api/discord/bot/notifications/route.ts");
const { enqueueDiscordNotification } = await import("./notification-repository.ts");
const secret = "test-only-discord-bridge-secret-32-characters";
const guildId = "111111111111111111";
const roleId = "222222222222222222";
const replacementId = "333333333333333333";
const userId = "444444444444444444";
const steamId = "76561198000000001";
type Handler = (request: Request) => Promise<Response>;

function request(body?: unknown, authorization = `Bearer ${secret}`) {
  return new Request("https://portal.example/api/discord/bot/test", {
    method: body === undefined ? "GET" : "POST",
    headers: { Authorization: authorization, "Content-Type": "application/json" },
    ...(body === undefined ? {} : { body: JSON.stringify(body) }),
  });
}
function assertNoStore(response: Response) { assert.match(response.headers.get("cache-control") ?? "", /no-store/); }

function fixture(t: TestContext) {
  // Tests execute in an isolated Node worker; overwrite only test settings.
  process.env.DISCORD_BRIDGE_SECRET = secret;
  process.env.DISCORD_GUILD_ID = guildId;
  process.env.SITE_URL = "https://portal.example";
  state.poolReads = 0;
  state.authority = { available: true, membershipsBySteamId: new Map(), suppressedLegacyVipSteamIds: new Set() };
  state.external = { adminGroupNames: ["Admin"], vipGroupNames: [] };
  state.externalFailure = null;
  state.catalogueCalls = 0;
  state.catalogueFailure = null;
  const db = new DatabaseSync(":memory:");
  // The unique keys mirror db/028_discord_bridge.sql. SQLite exercises actual
  // relational effects/rollback; MySQL lock behavior still needs staging coverage.
  db.exec(`
    CREATE TABLE portal_identity_groups (id INTEGER PRIMARY KEY, display_name TEXT, badge_color TEXT, source_type TEXT, external_key TEXT, enabled INTEGER);
    INSERT INTO portal_identity_groups VALUES (1, 'Admin', '#FF8800', 'admins_core', 'Admin', 1), (2, 'Archived', 'invalid', 'custom', NULL, 0);
    ALTER TABLE portal_identity_groups ADD COLUMN profile_priority INTEGER DEFAULT 0;
    CREATE TABLE portal_identity_external_group_definitions (group_id INTEGER PRIMARY KEY, rank_weight INTEGER);
    INSERT INTO portal_identity_external_group_definitions VALUES (1, 80);
    CREATE TABLE portal_discord_links (steam_id TEXT PRIMARY KEY, discord_user_id TEXT UNIQUE);
    CREATE TABLE portal_discord_group_roles (discord_guild_id TEXT, group_id INTEGER, discord_role_id TEXT,
      PRIMARY KEY (discord_guild_id, group_id), UNIQUE (discord_guild_id, discord_role_id));
    CREATE TABLE portal_audit_events (actor_type TEXT, actor_id TEXT, action TEXT, target_type TEXT, target_id TEXT, metadata TEXT);
    CREATE TABLE portal_discord_notifications (
      id INTEGER PRIMARY KEY AUTOINCREMENT, event_type TEXT, title TEXT, body TEXT,
      target_steam_id TEXT, target_path TEXT, status TEXT DEFAULT 'pending', attempts INTEGER DEFAULT 0,
      available_at TEXT DEFAULT CURRENT_TIMESTAMP, lease_token TEXT, lease_expires_at TEXT,
      discord_message_id TEXT, last_error TEXT, created_at TEXT DEFAULT CURRENT_TIMESTAMP, processed_at TEXT);
  `);
  const sql = (statement: string) => statement.replaceAll("UTC_TIMESTAMP()", "CURRENT_TIMESTAMP")
    .replaceAll("INSERT IGNORE", "INSERT OR IGNORE")
    .replace(/DATE_ADD\(CURRENT_TIMESTAMP, INTERVAL (\d+) SECOND\)/g, "datetime('now', '+$1 seconds')")
    .replace("DATE_ADD(CURRENT_TIMESTAMP, INTERVAL ? SECOND)", "datetime('now', '+' || ? || ' seconds')")
    .replaceAll(" FOR UPDATE SKIP LOCKED", "").replaceAll(" FOR UPDATE", "");
  const connections = { acquired: 0, released: 0 };
  const executor = {
    async query(statement: string, values: unknown[] = []) { return [db.prepare(sql(statement)).all(...values as SQLInputValue[])]; },
    async execute(statement: string, values: unknown[] = []) {
      const result = db.prepare(sql(statement)).run(...values as SQLInputValue[]);
      return [{ affectedRows: Number(result.changes), insertId: Number(result.lastInsertRowid) }];
    },
    async getConnection() { connections.acquired++; return this; },
    async beginTransaction() { db.exec("BEGIN"); },
    async commit() { db.exec("COMMIT"); },
    async rollback() { db.exec("ROLLBACK"); },
    release() { connections.released++; },
  };
  const pool = executor as unknown as Pool;
  state.pool = pool;
  t.after(() => { state.pool = null; db.close(); });
  return { db, pool, connections };
}

test("bot routes reject bearer failures before reading bodies or storage and disable caching", async t => {
  fixture(t);
  const handlers: Handler[] = [snapshot, saveRole, notifications];
  for (const handler of handlers) {
    for (const authorization of ["", "Bearer wrong", `Basic ${secret}`]) {
      const input = new Request("https://portal.example/api/discord/bot/test", { method: "POST", headers: { Authorization: authorization, "Content-Type": "application/json" }, body: "not-json" });
      const response = await handler(input);
      assert.equal(response.status, 401);
      assertNoStore(response);
      assert.equal(input.bodyUsed, false);
    }
  }
  assert.equal(state.poolReads, 0);
});

test("snapshot returns guild-scoped role mappings, archived groups and effective linked memberships", async t => {
  const { db } = fixture(t);
  db.prepare("INSERT INTO portal_discord_links VALUES (?, ?)").run(steamId, userId);
  db.prepare("INSERT INTO portal_discord_group_roles VALUES (?, 1, ?)").run(guildId, roleId);
  db.prepare("INSERT INTO portal_discord_group_roles VALUES (?, 1, ?)").run("555555555555555555", replacementId);
  const response = await snapshot(request());
  assert.equal(response.status, 200);
  assertNoStore(response);
  const data = await response.json();
  assert.deepEqual(data.roles, [{ groupId: "1", discordRoleId: roleId }]);
  assert.deepEqual(data.members, [{ discordUserId: userId, steamId, groupIds: ["1"] }]);
  assert.equal(state.catalogueCalls, 1);
  assert.equal(data.groups[0].rankWeight, 80);
  assert.equal(data.staffRoleId, null);
  assert.equal(data.groups.length, 2);
  assert.equal(data.groups[0].isAdmin, true);
  assert.equal(data.groups[1].enabled, false);
  assert.equal(data.groups[1].color, null);
});

test("unavailable snapshot providers return 503 rather than an empty membership set", async t => {
  const { db, pool } = fixture(t);
  db.prepare("INSERT INTO portal_discord_links VALUES (?, ?)").run(steamId, userId);
  for (const failure of ["portal", "authority", "external", "catalogue"]) {
    state.pool = failure === "portal" ? null : pool;
    state.authority.available = failure !== "authority";
    state.externalFailure = failure === "external" ? new Error("private database connection details") : null;
    state.catalogueFailure = failure === "catalogue" ? new Error("private catalogue details") : null;
    const response = await snapshot(request());
    assert.equal(response.status, 503, failure);
    assertNoStore(response);
    const body = await response.text();
    assert.doesNotMatch(body, /private database|"members"/);
  }
});

test("Staff mapping is persisted separately from real groups with compare-and-swap", async t => {
  fixture(t);
  const create = { groupId: "staff", discordRoleId: roleId, previousRoleId: null };
  assert.equal((await saveRole(request(create))).status, 200);
  assert.equal((await saveRole(request(create))).status, 200);
  assert.equal((await saveRole(request({ ...create, discordRoleId: replacementId }))).status, 409);
  assert.equal((await saveRole(request({ ...create, discordRoleId: replacementId, previousRoleId: roleId }))).status, 200);
  const data = await (await snapshot(request())).json();
  assert.equal(data.staffRoleId, replacementId);
  assert.deepEqual(data.roles, []);
  assert.equal(data.groups.length, 2);
});

test("Staff cannot share a Discord role with a portal group and its audit is transactional", async t => {
  const { db } = fixture(t);
  assert.equal((await saveRole(request({ groupId: "1", discordRoleId: roleId, previousRoleId: null }))).status, 200);
  assert.equal((await saveRole(request({ groupId: "staff", discordRoleId: roleId, previousRoleId: null }))).status, 503);
  assert.equal((await (await snapshot(request())).json()).staffRoleId, null);
  db.exec("DROP TABLE portal_audit_events");
  assert.equal((await saveRole(request({ groupId: "staff", discordRoleId: replacementId, previousRoleId: null }))).status, 503);
  assert.equal((await (await snapshot(request())).json()).staffRoleId, null);
});

test("role mapping persists once, accepts idempotent retries and rejects stale previousRoleId with 409", async t => {
  const { db, connections } = fixture(t);
  const create = { groupId: "1", discordRoleId: roleId, previousRoleId: null };
  assert.equal((await saveRole(request(create))).status, 200);
  assert.equal((await saveRole(request(create))).status, 200);
  assert.equal(db.prepare("SELECT COUNT(*) AS count FROM portal_audit_events").get()?.count, 1);
  const stale = await saveRole(request({ groupId: "1", discordRoleId: replacementId, previousRoleId: null }));
  assert.equal(stale.status, 409);
  assertNoStore(stale);
  assert.equal(db.prepare("SELECT discord_role_id FROM portal_discord_group_roles").get()?.discord_role_id, roleId);
  assert.equal((await saveRole(request({ groupId: "1", discordRoleId: replacementId, previousRoleId: roleId }))).status, 200);
  assert.equal(db.prepare("SELECT discord_role_id FROM portal_discord_group_roles").get()?.discord_role_id, replacementId);
  assert.equal(db.prepare("SELECT COUNT(*) AS count FROM portal_audit_events").get()?.count, 2);
  assert.equal(connections.acquired, connections.released);
});

test("one Discord role cannot map to two groups and failed writes preserve the first mapping", async t => {
  const { db, connections } = fixture(t);
  assert.equal((await saveRole(request({ groupId: "1", discordRoleId: roleId }))).status, 200);
  const duplicate = await saveRole(request({ groupId: "2", discordRoleId: roleId }));
  assert.equal(duplicate.status, 503);
  assertNoStore(duplicate);
  assert.doesNotMatch(await duplicate.text(), /UNIQUE|constraint/);
  assert.deepEqual(db.prepare("SELECT group_id, discord_role_id FROM portal_discord_group_roles").all().map(row => ({ ...row })), [{ group_id: 1, discord_role_id: roleId }]);
  assert.equal(db.prepare("SELECT COUNT(*) AS count FROM portal_audit_events").get()?.count, 1);
  assert.equal(connections.acquired, connections.released);
});

test("role mapping rolls back if audit persistence fails", async t => {
  const { db, connections } = fixture(t);
  db.exec("CREATE TRIGGER reject_audit BEFORE INSERT ON portal_audit_events BEGIN SELECT RAISE(ABORT, 'audit unavailable'); END;");
  const response = await saveRole(request({ groupId: "1", discordRoleId: roleId }));
  assert.equal(response.status, 503);
  assert.equal(db.prepare("SELECT COUNT(*) AS count FROM portal_discord_group_roles").get()?.count, 0);
  assert.equal(connections.acquired, connections.released);
});

test("invalid guild configuration cannot leak a role-mapping database connection", async t => {
  const { connections } = fixture(t);
  process.env.DISCORD_GUILD_ID = "invalid";
  const response = await saveRole(request({ groupId: "1", discordRoleId: roleId }));
  assert.equal(response.status, 503);
  assert.equal(connections.acquired, connections.released);
});

test("malformed mapping and acknowledgement payloads cannot reach storage", async t => {
  fixture(t);
  for (const body of [null, [], {}, { groupId: "0", discordRoleId: roleId }, { groupId: "1", discordRoleId: "bad" }, { groupId: "1", discordRoleId: roleId, previousRoleId: "bad" }]) {
    const response = await saveRole(request(body));
    assert.equal(response.status, 400);
    assertNoStore(response);
  }
  for (const body of [null, [], {}, { action: "delete" }, { action: "complete", id: "1", leaseToken: "a".repeat(64) }, { action: "retry", id: "0", leaseToken: "a".repeat(64) }, { action: "retry", id: "1", leaseToken: "bad" }]) {
    const response = await notifications(request(body));
    assert.equal(response.status, 400);
    assertNoStore(response);
  }
  assert.equal(state.poolReads, 0);
});

test("notification claim returns portal URLs and only a current lease can mark a message sent", async t => {
  const { db, pool } = fixture(t);
  await enqueueDiscordNotification(pool, { eventType: "ticket.created", title: "Help", body: "@everyone", path: "/admin/tickets?case=1", steamId });
  const claimed = await notifications(request({ action: "claim" }));
  assert.equal(claimed.status, 200);
  assertNoStore(claimed);
  const { events: [event] } = await claimed.json();
  assert.equal(event.url, "https://portal.example/admin/tickets?case=1");
  assert.equal(event.path, undefined);
  assert.match(event.leaseToken, /^[a-f0-9]{64}$/);
  assert.deepEqual(await (await notifications(request({ action: "claim" }))).json(), { events: [] });
  const stale = await notifications(request({ action: "complete", id: event.id, leaseToken: "0".repeat(64), messageId: roleId }));
  assert.equal(stale.status, 409);
  assertNoStore(stale);
  assert.equal(db.prepare("SELECT status FROM portal_discord_notifications").get()?.status, "processing");
  const complete = await notifications(request({ action: "complete", id: event.id, leaseToken: event.leaseToken, messageId: roleId }));
  assert.equal(complete.status, 200);
  assertNoStore(complete);
  assert.equal(db.prepare("SELECT status FROM portal_discord_notifications").get()?.status, "sent");
  assert.equal((await notifications(request({ action: "complete", id: event.id, leaseToken: event.leaseToken, messageId: roleId }))).status, 409);
});

test("notification URLs exclude foreign targets and unavailable storage returns a private 503", async t => {
  const { pool } = fixture(t);
  await enqueueDiscordNotification(pool, { eventType: "game.report", title: "Report", body: "Reason", path: "//evil.example/report" });
  const { events: [event] } = await (await notifications(request({ action: "claim" }))).json();
  assert.equal(event.url, null);
  state.pool = null;
  const unavailable = await notifications(request({ action: "claim" }));
  assert.equal(unavailable.status, 503);
  assertNoStore(unavailable);
  assert.doesNotMatch(await unavailable.text(), /SELECT|connection|stack/);
});
