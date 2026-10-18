import assert from "node:assert/strict";
import { registerHooks } from "node:module";
import { DatabaseSync } from "node:sqlite";
import { beforeEach, test } from "node:test";

const server = "bb0ed03c-b31a-405f-8e9d-6cbb3aee96f7";
const steamId = "76561198000000002";
const actorSteamId = "76561198000000001";
const membershipUuid = "253b7a55-e04a-48af-8de9-26c6bf81f867";
const db = new DatabaseSync(":memory:");
let writes: string[] = [];
let failCas = false;
let reconciled: unknown[] = [];
const valuesForSql = (values: unknown[]) => values.map(value => value instanceof Date ? value.toISOString() : value);
const sqlForSqlite = (sql: string) => sql.replace(/ FOR UPDATE/g, "").replaceAll("<=>", "IS")
  .replace(/ABS\(TIMESTAMPDIFF\(SECOND, expires_at, \?\)\) <= 1/g, "ABS((julianday(expires_at) - julianday(?)) * 86400) <= 1");
const connection = {
  async beginTransaction() { db.exec("BEGIN"); }, async commit() { db.exec("COMMIT"); },
  async rollback() { db.exec("ROLLBACK"); }, release() {},
  async query(sql: string, values: unknown[] = []) { return [db.prepare(sqlForSqlite(sql)).all(...valuesForSql(values) as (string | number | null)[])]; },
  async execute(sql: string, values: unknown[] = []) {
    writes.push(sql);
    if (failCas && sql.startsWith("UPDATE ")) return [{ affectedRows: 0 }];
    const result = db.prepare(sqlForSqlite(sql)).run(...valuesForSql(values) as (string | number | null)[]);
    return [{ affectedRows: result.changes }];
  },
};
Object.assign(globalThis, { __adminMembershipEditTest: { pool: { getConnection: async () => connection }, reconcile: (input: unknown) => { reconciled.push(input); } } });
const stubs: Record<string, string> = {
  "server-only": "export{};",
  "@/lib/data/database-pools": "export const getGameDatabasePool=()=>globalThis.__adminMembershipEditTest.pool;",
  "@/lib/data/identity-groups": "export const reconcileIdentityGroupRewards=async(input)=>globalThis.__adminMembershipEditTest.reconcile(input);",
  "@/lib/admin/server-scope": `export const configuredGameServerGuid=()=>${JSON.stringify(server)}; export const isAssignedToConfiguredGameServer=servers=>servers.some(s=>s.toLowerCase()===${JSON.stringify(server)});`,
};
registerHooks({ resolve(specifier, context, next) {
  return stubs[specifier] ? { url: `data:text/javascript,${encodeURIComponent(stubs[specifier])}`, shortCircuit: true } : next(specifier, context);
} });
const memberships = await import("./staff-admin-memberships.ts");
db.exec(`
 CREATE TABLE admins (Id INTEGER, SteamId64 TEXT, Username TEXT, Permissions TEXT, Groups TEXT, Immunity INTEGER, Servers TEXT);
 CREATE TABLE groups (Id INTEGER, Name TEXT, Servers TEXT, Immunity INTEGER);
 CREATE TABLE arena_groups (id INTEGER PRIMARY KEY, legacy_portal_group_id INTEGER, group_uuid TEXT, group_type TEXT, external_key TEXT, display_name TEXT, enabled INTEGER, immunity INTEGER);
 CREATE TABLE arena_scopes (id INTEGER PRIMARY KEY, scope_uuid TEXT, scope_key TEXT, display_name TEXT, scope_type TEXT, admin_server_guid TEXT, enabled INTEGER);
 CREATE TABLE arena_group_scopes (group_id INTEGER, scope_id INTEGER, enabled INTEGER, immunity_override INTEGER);
 CREATE TABLE arena_group_memberships (membership_uuid TEXT PRIMARY KEY, group_id INTEGER, scope_id INTEGER, steam_id TEXT, starts_at TEXT, expires_at TEXT, status TEXT, row_version INTEGER, revoked_at TEXT, updated_at TEXT, provenance_type TEXT, provenance_reference TEXT, granted_by_actor TEXT, grant_reason TEXT);
 CREATE TABLE arena_membership_outbox (event_uuid TEXT, deduplication_key TEXT, event_type TEXT, aggregate_type TEXT, aggregate_key TEXT, membership_uuid TEXT, steam_id TEXT, group_id INTEGER, scope_id INTEGER, payload TEXT);
`);
beforeEach(() => {
  db.exec("DELETE FROM admins; DELETE FROM groups; DELETE FROM arena_groups; DELETE FROM arena_scopes; DELETE FROM arena_group_scopes; DELETE FROM arena_group_memberships; DELETE FROM arena_membership_outbox;");
  writes = []; failCas = false; reconciled = [];
  db.prepare("INSERT INTO admins VALUES (3, ?, 'Target', ?, ?, 10, ?)").run(steamId, '["admins.notify"]', '["MOD"," VIP "]', JSON.stringify([server, "other-server"]));
  for (const [id, name, immunity] of [[1, "MOD", 10], [2, "ADMIN", 30], [3, "Founder", 100], [4, "VIP", 0]] as const)
    db.prepare("INSERT INTO groups VALUES (?, ?, ?, ?)").run(id, name, JSON.stringify([server]), immunity);
  db.prepare("INSERT INTO arena_scopes VALUES (1, '3d990f9e-0875-49d0-8409-1fe3b6315ca1', 'server:arena', 'Arena', 'server', ?, 1)").run(server);
  for (const [id, legacy, name, immunity] of [[10, 100, "MOD", 10], [11, 101, "ADMIN", 30], [12, 102, "Founder", 100]] as const) {
    db.prepare("INSERT INTO arena_groups VALUES (?, ?, ?, 'admin', ?, ?, 1, ?)").run(id, legacy, `08fdab2a-b529-4a51-8f6a-0000000000${id}`, name, name, immunity);
    db.prepare("INSERT INTO arena_group_scopes VALUES (?, 1, 1, NULL)").run(id);
  }
  db.prepare("INSERT INTO arena_group_memberships VALUES (?, 10, 1, ?, '2026-01-01T00:00:00.000Z', '2027-01-01T00:00:00.000Z', 'active', 4, NULL, '2026-01-01T00:00:00.000Z', 'staff', 'original-source', 'original-actor', 'original-reason')").run(membershipUuid, steamId);
});
test.after(() => db.close());
const portalReference = () => ({ source: "portal" as const, steamId, groupId: 100, membershipUuid, scopeId: 1, rowVersion: 4 });
const nativeReference = () => ({ source: "native" as const, steamId, adminId: 3, storedGroup: "MOD" });
const input = () => ({ reference: portalReference(), actorSteamId, actorImmunity: 50, newGroup: "ADMIN", expiryMode: "permanent" as const, durationMinutes: 60, expectedExpiresAt: "2027-01-01T00:00:00.000Z" });
const row = () => db.prepare("SELECT * FROM arena_group_memberships WHERE membership_uuid = ?").get(membershipUuid)!;

test("editing a portal group preserves exact scope, membership identity, start and grant provenance", async () => {
  assert.equal(typeof memberships.editStaffAdminMembership, "function");
  const before = row();
  await memberships.editStaffAdminMembership(input());
  const after = row();
  assert.equal(after.group_id, 11); assert.equal(after.expires_at, null); assert.equal(after.row_version, 5);
  for (const key of ["membership_uuid", "scope_id", "steam_id", "starts_at", "provenance_type", "provenance_reference", "granted_by_actor", "grant_reason"])
    assert.equal(after[key], before[key], key);
  const outbox = db.prepare("SELECT * FROM arena_membership_outbox").get()!;
  const payload = JSON.parse(String(outbox.payload));
  assert.equal(payload.membershipUuid, membershipUuid); assert.equal(payload.rowVersion, 5); assert.equal(payload.arenaGroupId, 11);
  assert.equal(payload.actorSteamId, actorSteamId); assert.equal(payload.startsAt, before.starts_at);
});

test("native group replacement preserves unrelated raw group names, permissions, immunity and all server scopes", async () => {
  const before = db.prepare("SELECT * FROM admins").get()!;
  await memberships.editStaffAdminMembership({ ...input(), reference: nativeReference(), expiryMode: "keep" });
  const after = db.prepare("SELECT * FROM admins").get()!;
  assert.deepEqual(JSON.parse(String(after.Groups)), ["ADMIN", " VIP "]);
  for (const key of ["Permissions", "Immunity", "Servers", "Id", "SteamId64", "Username"]) assert.equal(after[key], before[key], key);
  assert.equal(reconciled.length, 1);
});

test("native edits accept a uniquely normalized snapshot name and preserve unrelated raw group tokens", async () => {
  db.prepare("UPDATE admins SET Groups = ?").run('[" MOD "," VIP "]');
  await memberships.editStaffAdminMembership({ ...input(), reference: nativeReference(), expiryMode: "keep" });
  assert.deepEqual(JSON.parse(String(db.prepare("SELECT Groups FROM admins").get()!.Groups)), ["ADMIN", " VIP "]);
});

test("native edits reject ambiguous normalized copies of the selected group", async () => {
  db.prepare("UPDATE admins SET Groups = ?").run('["MOD"," mod "," VIP "]');
  await assert.rejects(memberships.editStaffAdminMembership({ ...input(), reference: nativeReference(), expiryMode: "keep" }));
  assert.deepEqual(JSON.parse(String(db.prepare("SELECT Groups FROM admins").get()!.Groups)), ["MOD", " mod ", " VIP "]);
});

test("replace expiry uses the future scheduled start and leaves it scheduled", async () => {
  const startsAt = new Date(Date.now() + 86_400_000).toISOString();
  db.prepare("UPDATE arena_group_memberships SET starts_at = ?").run(startsAt);
  await memberships.editStaffAdminMembership({ ...input(), newGroup: "MOD", expiryMode: "replace", durationMinutes: 90 });
  assert.equal(row().starts_at, startsAt);
  assert.equal(new Date(String(row().expires_at)).getTime(), new Date(startsAt).getTime() + 90 * 60_000);
});

test("stale exact references and expiry/CAS conflicts never write or publish authority", async () => {
  for (const changes of [{ rowVersion: 3 }, { scopeId: 2 }, { membershipUuid: "0363be20-e944-4f18-8b9e-7c17e2680036" }])
    await assert.rejects(memberships.editStaffAdminMembership({ ...input(), reference: { ...portalReference(), ...changes } }));
  await assert.rejects(memberships.editStaffAdminMembership({ ...input(), expectedExpiresAt: "2028-01-01T00:00:00.000Z" }));
  failCas = true;
  await assert.rejects(memberships.editStaffAdminMembership(input()));
  assert.equal(row().group_id, 10); assert.equal(row().row_version, 4);
  assert.equal(db.prepare("SELECT COUNT(*) AS n FROM arena_membership_outbox").get()!.n, 0);
});

test("Founder, higher immunity, unavailable runtime definitions and duplicate destinations fail closed", async () => {
  await assert.rejects(memberships.editStaffAdminMembership({ ...input(), newGroup: "Founder" }), { code: "admin-membership-founder" });
  await assert.rejects(memberships.editStaffAdminMembership({ ...input(), actorImmunity: 20 }), { code: "admin-membership-immunity" });
  db.exec("UPDATE groups SET Servers = '[\"other-server\"]' WHERE Name = 'ADMIN'");
  await assert.rejects(memberships.editStaffAdminMembership(input()), { code: "admin-membership-stale" });
  db.prepare("UPDATE groups SET Servers = ? WHERE Name = 'ADMIN'").run(JSON.stringify([server]));
  db.prepare("INSERT INTO arena_group_memberships SELECT '0363be20-e944-4f18-8b9e-7c17e2680036', 11, scope_id, steam_id, starts_at, expires_at, status, row_version, revoked_at, updated_at, provenance_type, provenance_reference, granted_by_actor, grant_reason FROM arena_group_memberships").run();
  await assert.rejects(memberships.editStaffAdminMembership(input()), { code: "admin-membership-conflict" });
  assert.equal(writes.length, 0);
});

test("native edits reject missing exact groups, timed expiry and destination duplicates", async () => {
  await assert.rejects(memberships.editStaffAdminMembership({ ...input(), reference: { ...nativeReference(), storedGroup: "mod" } }));
  await assert.rejects(memberships.editStaffAdminMembership({ ...input(), reference: nativeReference(), expiryMode: "replace" }));
  await assert.rejects(memberships.editStaffAdminMembership({ ...input(), reference: nativeReference(), newGroup: "VIP" }));
  assert.equal(writes.length, 0);
});

test("native destination immunity includes every preserved server scope and stale writes do not reconcile", async () => {
  db.prepare("INSERT INTO groups VALUES (9, 'ADMIN', '[\"other-server\"]', 100)").run();
  await assert.rejects(memberships.editStaffAdminMembership({ ...input(), reference: nativeReference(), expiryMode: "keep" }), { code: "admin-membership-immunity" });
  db.exec("DELETE FROM groups WHERE Id = 9");
  failCas = true;
  await assert.rejects(memberships.editStaffAdminMembership({ ...input(), reference: nativeReference(), expiryMode: "keep" }), { code: "admin-membership-stale" });
  assert.equal(db.prepare("SELECT Groups FROM admins").get()!.Groups, '["MOD"," VIP "]');
  assert.equal(reconciled.length, 0);
});

test("editing an existing permanent portal assignment can set a timed expiry without changing its origin", async () => {
  db.exec("UPDATE arena_group_memberships SET expires_at = NULL");
  await memberships.editStaffAdminMembership({ ...input(), newGroup: "MOD", expiryMode: "replace", durationMinutes: 60, expectedExpiresAt: "" });
  assert.ok(new Date(String(row().expires_at)).getTime() > Date.now() + 59 * 60_000);
  assert.equal(row().provenance_reference, "original-source");
});
