import assert from "node:assert/strict";
import { registerHooks } from "node:module";
import { DatabaseSync } from "node:sqlite";
import { beforeEach, test } from "node:test";

const db = new DatabaseSync(":memory:");
const server = "bb0ed03c-b31a-405f-8e9d-6cbb3aee96f7";
const actorSteamId = "76561198000000001";
let syncCalls = 0;
let failUpdate = false;
const sqliteSql = (sql: string) => sql.replace(/ FOR UPDATE/g, "").replaceAll("<=>", "IS").replaceAll("CURRENT_TIMESTAMP(6)", "CURRENT_TIMESTAMP");
const sqlValues = (values: unknown[]) => values.map(value => value instanceof Date ? value.toISOString() : value) as (string | number | null)[];
const connection = {
  async beginTransaction() { db.exec("BEGIN"); }, async commit() { db.exec("COMMIT"); }, async rollback() { db.exec("ROLLBACK"); }, release() {},
  async query(sql: string, values: unknown[] = []) { return [db.prepare(sqliteSql(sql)).all(...sqlValues(values))]; },
  async execute(sql: string, values: unknown[] = []) {
    if (failUpdate && sql.startsWith("UPDATE admins")) return [{ affectedRows: 0 }];
    const result = db.prepare(sqliteSql(sql)).run(...sqlValues(values));
    return [{ affectedRows: result.changes, insertId: result.lastInsertRowid }];
  },
};
const synchronize = () => {
  syncCalls++;
  db.exec(`UPDATE arena_groups SET enabled = EXISTS(SELECT 1 FROM groups WHERE groups.Id = json_extract(arena_groups.definition, '$.nativeRowId'));
    UPDATE arena_group_scopes SET enabled = (SELECT enabled FROM arena_groups WHERE arena_groups.id = arena_group_scopes.group_id);`);
};
Object.assign(globalThis, { __adminGroupDelete: { pool: { getConnection: async () => connection }, synchronize } });
const stubs: Record<string, string> = {
  "server-only": "export{};",
  "@/lib/admin/server-scope": `export const configuredGameServerGuid=()=>${JSON.stringify(server)};`,
  "@/lib/data/database-pools": "export const getGameDatabasePool=()=>globalThis.__adminGroupDelete.pool;export const getPortalDatabasePool=()=>null;",
  "@/lib/data/arena-group-definition-authority": "export class ArenaGroupDefinitionAuthorityError extends Error{};export const synchronizeAdminsCoreGroupAuthorityInTransaction=async()=>globalThis.__adminGroupDelete.synchronize();export const synchronizeVipCoreGroupAuthorityInTransaction=async()=>{};",
  "@/lib/data/identity-catalogue": "export class IdentityGroupRenameError extends Error{};export const assertIdentityGroupExternalKeyAvailable=async()=>{};export const cancelIdentityGroupRename=async()=>{};export const completeIdentityGroupRename=async()=>{};export const prepareIdentityGroupRename=async()=>{};export const syncIdentityCatalogue=async()=>{};",
};
registerHooks({ resolve(specifier, context, next) {
  return stubs[specifier] ? { url: `data:text/javascript,${encodeURIComponent(stubs[specifier])}`, shortCircuit: true } : next(specifier, context);
} });
const management = await import("./external-group-management.ts");
db.exec(`CREATE TABLE groups (Id INTEGER PRIMARY KEY, Name TEXT, Permissions TEXT, Servers TEXT, Immunity INTEGER);
  CREATE TABLE admins (Id INTEGER PRIMARY KEY, SteamId64 TEXT, Groups TEXT, Permissions TEXT, Servers TEXT, Immunity INTEGER);
  CREATE TABLE arena_groups (id INTEGER PRIMARY KEY, group_type TEXT, external_key TEXT, definition TEXT, legacy_portal_group_id INTEGER, enabled INTEGER, row_version INTEGER);
  CREATE TABLE arena_scopes (id INTEGER PRIMARY KEY, scope_type TEXT, admin_server_guid TEXT);
  CREATE TABLE arena_group_scopes (group_id INTEGER, scope_id INTEGER, definition_override TEXT, enabled INTEGER, row_version INTEGER);
  CREATE TABLE arena_group_memberships (membership_uuid TEXT, steam_id TEXT, group_id INTEGER, scope_id INTEGER, starts_at TEXT, expires_at TEXT, status TEXT, row_version INTEGER, revoked_at TEXT, revoked_by_actor TEXT, revoke_reason TEXT);
  CREATE TABLE arena_membership_commands (command_uuid TEXT, target_group_id INTEGER, status TEXT);
  CREATE TABLE arena_membership_outbox (event_uuid TEXT, deduplication_key TEXT, event_type TEXT, aggregate_type TEXT, aggregate_key TEXT, membership_uuid TEXT, steam_id TEXT, group_id INTEGER, scope_id INTEGER, payload TEXT);
`);
beforeEach(() => {
  db.exec("DELETE FROM groups;DELETE FROM admins;DELETE FROM arena_groups;DELETE FROM arena_scopes;DELETE FROM arena_group_scopes;DELETE FROM arena_group_memberships;DELETE FROM arena_membership_commands;DELETE FROM arena_membership_outbox;");
  syncCalls = 0; failUpdate = false;
  db.prepare("INSERT INTO groups VALUES (1, 'MOD', '[\"admins.commands.gag\"]', ?, 20), (2, 'Other', '[\"admins.notify\"]', ?, 10), (3, 'Founder', '[\"*\"]', ?, 100)").run(JSON.stringify([server, "other-server"]), JSON.stringify([server]), JSON.stringify([server]));
  db.prepare("INSERT INTO admins VALUES (1, '76561198000000002', ?, '[\"admins.direct\"]', ?, 33)").run('[" MOD ","Other ","notmod"]', JSON.stringify([server, "other-server"]));
  db.prepare("INSERT INTO admins VALUES (2, '76561198000000003', '[\"Other\"]', '[\"*\"]', '[\"remote-server\"]', 99)").run();
  db.exec(`INSERT INTO arena_groups VALUES (10, 'admin', 'MOD', '{"source":"admins_core","nativeRowId":1}', 100, 1, 1), (11, 'admin', 'Other', '{"source":"admins_core","nativeRowId":2}', 101, 1, 1);
    INSERT INTO arena_scopes VALUES(1,'server','${server}'), (2,'server','other-server'), (3,'global',NULL);
    INSERT INTO arena_group_scopes VALUES(10,1,'{"nativeRowId":1}',1,1),(10,2,'{"nativeRowId":1}',1,1),(10,3,NULL,1,1),(11,2,'{"nativeRowId":2}',1,1);
    INSERT INTO arena_group_memberships VALUES
      ('00000000-0000-4000-8000-000000000001','76561198000000002',10,1,'2026-01-01',NULL,'active',4,NULL,NULL,NULL),
      ('00000000-0000-4000-8000-000000000002','76561198000000003',10,2,'2026-01-01',NULL,'conflict',4,NULL,NULL,NULL),
      ('00000000-0000-4000-8000-000000000003','76561198000000004',10,3,'2027-01-01',NULL,'active',4,NULL,NULL,NULL),
      ('00000000-0000-4000-8000-000000000004','76561198000000005',11,2,'2026-01-01',NULL,'active',4,NULL,NULL,NULL);
  `);
});
test.after(() => db.close());
const input = () => ({ actorSteamId, requestKey: "delete-admin-test", rowId: 1, previousName: "MOD" });

test("delete detaches only the named native groups and preserves every other stored field", async () => {
  assert.equal(typeof management.deleteRuntimeAdminsCoreGroup, "function");
  const before = db.prepare("SELECT * FROM admins ORDER BY Id").all();
  const result = await management.deleteRuntimeAdminsCoreGroup(input());
  assert.equal(result.name, "MOD"); assert.equal(result.removedAssignments, 1);
  assert.deepEqual(JSON.parse(String(db.prepare("SELECT Groups FROM admins WHERE Id=1").get()!.Groups)), ["Other ", "notmod"]);
  const after = db.prepare("SELECT * FROM admins ORDER BY Id").all();
  for (const field of ["SteamId64", "Permissions", "Servers", "Immunity"]) assert.equal(after[0][field], before[0][field]);
  assert.deepEqual(after[1], before[1]);
  assert.equal(db.prepare("SELECT COUNT(*) AS n FROM groups WHERE Id=1").get()!.n, 0);
});

test("all memberships bound to the exact definition are tombstoned across physical and global scopes", async () => {
  await management.deleteRuntimeAdminsCoreGroup(input());
  const rows = db.prepare("SELECT * FROM arena_group_memberships ORDER BY membership_uuid").all();
  assert.ok(rows.slice(0, 3).every(row => row.status === "revoked" && row.row_version === 5 && row.revoked_by_actor === actorSteamId));
  assert.equal(rows[3].status, "active");
  assert.equal(db.prepare("SELECT COUNT(*) AS n FROM arena_membership_outbox WHERE event_type='identity.group_membership.revoked'").get()!.n, 3);
  assert.equal(db.prepare("SELECT enabled FROM arena_groups WHERE id=10").get()!.enabled, 0);
  assert.equal(db.prepare("SELECT enabled FROM arena_groups WHERE id=11").get()!.enabled, 1);
  assert.equal(syncCalls, 1);
  // Recreating and synchronizing a definition cannot restore its old grants.
  db.prepare("INSERT INTO groups VALUES (1,'MOD','[]','[]',20)").run(); synchronize();
  assert.equal(db.prepare("SELECT COUNT(*) AS n FROM arena_group_memberships WHERE group_id=10 AND status='active'").get()!.n, 0);
});

test("Founder, stale native IDs/names and ambiguous same-name definitions cannot be deleted", async () => {
  await assert.rejects(management.deleteRuntimeAdminsCoreGroup({ ...input(), rowId: 3, previousName: "Founder" }), { code: "founder_invariant" });
  await assert.rejects(management.deleteRuntimeAdminsCoreGroup({ ...input(), rowId: 999 }), { code: "external_group_not_found" });
  await assert.rejects(management.deleteRuntimeAdminsCoreGroup({ ...input(), previousName: "Other" }), { code: "external_group_not_found" });
  db.exec("INSERT INTO groups VALUES(4,'mod','[]','[\"remote-server\"]',10)");
  await assert.rejects(management.deleteRuntimeAdminsCoreGroup(input()), { code: "external_group_scope_conflict" });
  assert.equal(syncCalls, 0);
});

test("mixed native scope ownership, pending commands and failed exact writes roll the transaction back", async () => {
  db.exec("UPDATE arena_group_scopes SET definition_override='{\"nativeRowId\":999}' WHERE group_id=10 AND scope_id=2");
  await assert.rejects(management.deleteRuntimeAdminsCoreGroup(input()), { code: "external_group_scope_conflict" });
  db.exec("UPDATE arena_group_scopes SET definition_override='{\"nativeRowId\":1}' WHERE group_id=10");
  db.exec("INSERT INTO arena_membership_commands VALUES('pending',10,'received')");
  await assert.rejects(management.deleteRuntimeAdminsCoreGroup(input()), { code: "external_group_in_use" });
  db.exec("DELETE FROM arena_membership_commands"); failUpdate = true;
  await assert.rejects(management.deleteRuntimeAdminsCoreGroup(input()));
  assert.equal(db.prepare("SELECT COUNT(*) AS n FROM groups WHERE Id=1").get()!.n, 1);
  assert.equal(db.prepare("SELECT status FROM arena_group_memberships LIMIT 1").get()!.status, "active");
  assert.equal(db.prepare("SELECT COUNT(*) AS n FROM arena_membership_outbox").get()!.n, 0);
});
