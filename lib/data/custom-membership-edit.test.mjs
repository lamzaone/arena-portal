import assert from "node:assert/strict";
import { existsSync } from "node:fs";
import { registerHooks } from "node:module";
import { resolve, extname } from "node:path";
import { DatabaseSync } from "node:sqlite";
import { pathToFileURL, fileURLToPath } from "node:url";
import { beforeEach, test } from "node:test";

const db = new DatabaseSync(":memory:");
const steamId = "76561198000000001", uuid = "11111111-1111-4111-8111-111111111111";
db.exec(`CREATE TABLE arena_groups (id INTEGER, group_uuid TEXT, legacy_portal_group_id INTEGER, group_key TEXT, group_type TEXT, external_key TEXT, enabled INTEGER, row_version INTEGER, definition TEXT, baseline_permissions TEXT, capability_keys TEXT);
CREATE TABLE arena_scopes (id INTEGER, scope_uuid TEXT, scope_key TEXT, display_name TEXT, scope_type TEXT, enabled INTEGER DEFAULT 1);
CREATE TABLE arena_group_scopes (group_id INTEGER, scope_id INTEGER, enabled INTEGER);
CREATE TABLE arena_group_memberships (membership_uuid TEXT PRIMARY KEY, group_id INTEGER, scope_id INTEGER, steam_id TEXT, starts_at TEXT, expires_at TEXT, status TEXT, provenance_type TEXT, source_inventory_item_id TEXT, row_version INTEGER, granted_by_actor TEXT);
CREATE TABLE arena_membership_outbox (event_uuid TEXT, deduplication_key TEXT UNIQUE, event_type TEXT, aggregate_type TEXT, aggregate_key TEXT, membership_uuid TEXT, steam_id TEXT, group_id INTEGER, scope_id INTEGER, payload TEXT);
INSERT INTO arena_groups VALUES(10,'group-uuid',1,'beta','custom',NULL,1,1,'{}','[]','[]');
INSERT INTO arena_scopes(id,scope_uuid,scope_key,display_name,scope_type) VALUES(20,'scope-uuid','global','All servers','global');
INSERT INTO arena_group_scopes VALUES(10,20,1);`);
const gamePool = {
  async query(sql, values = []) { return [db.prepare(sql.replaceAll(" FOR UPDATE", "")).all(...values), []]; },
  async execute(sql, values = []) { const result = db.prepare(sql).run(...values.map(value => value instanceof Date ? value.toISOString() : value)); return [{ affectedRows: Number(result.changes), insertId: Number(result.lastInsertRowid) }, []]; },
  async getConnection() { return this; }, async beginTransaction() { db.exec("BEGIN"); }, async commit() { db.exec("COMMIT"); }, async rollback() { db.exec("ROLLBACK"); }, release() {},
};
const portalPool = { async query(sql) { return [sql.includes("FROM portal_identity_groups WHERE id") ? [{ id: 1, group_key: "beta", source_type: "custom" }] : [], []]; }, async getConnection() { throw new Error("Reward storage absent in isolated fixture"); } };
Object.assign(globalThis, { __customMembershipGame: gamePool, __customMembershipPortal: portalPool });
function sourceUrl(path) { const match = (extname(path) ? [path] : [`${path}.ts`, `${path}.tsx`]).find(existsSync); return match ? pathToFileURL(match).href : null; }
registerHooks({ resolve(specifier, context, next) {
  if (specifier === "server-only") return { url: "data:text/javascript,export {};", shortCircuit: true };
  if (specifier === "@/lib/data/database-pools") return { url: "data:text/javascript,export const getGameDatabasePool=()=>globalThis.__customMembershipGame; export const getPortalDatabasePool=()=>globalThis.__customMembershipPortal;", shortCircuit: true };
  if (specifier === "@/lib/data/identity-catalogue") return { url: "data:text/javascript,export const ensureIdentityCatalogue=async()=>{};export const getIdentityCatalogueStatus=async()=>({});export const syncIdentityCatalogue=async()=>{};", shortCircuit: true };
  const url = specifier.startsWith("@/") ? sourceUrl(resolve(specifier.slice(2))) : specifier.startsWith(".") && context.parentURL?.startsWith("file:") ? sourceUrl(fileURLToPath(new URL(specifier, context.parentURL))) : null;
  return url ? { url, shortCircuit: true } : next(specifier, context);
} });
const identity = await import("./identity-groups.ts");
const base = { actor: { steamId, isFounder: true }, requestKey: "custom-edit-test", groupId: 1, steamId, membershipUuid: uuid, scopeId: 20, rowVersion: 4, durationMinutes: 60, expiryMode: "replace" };
beforeEach(() => {
  db.exec("UPDATE arena_scopes SET enabled = 1");
  db.exec("DELETE FROM arena_membership_outbox; DELETE FROM arena_group_memberships;");
  db.prepare("INSERT INTO arena_group_memberships VALUES(?,10,20,?,'2026-01-01T00:00:00.000Z','2027-01-01T00:00:00.000Z','active','inventory','item-uuid',4,'original-issuer')").run(uuid, steamId);
});
test("custom expiry editing preserves identity, scope, start and purchased provenance", async () => {
  assert.equal(typeof identity.editIdentityGroupMembership, "function");
  await identity.editIdentityGroupMembership(base);
  const row = db.prepare("SELECT * FROM arena_group_memberships").get();
  assert.equal(row.membership_uuid, uuid); assert.equal(row.scope_id, 20); assert.equal(row.row_version, 5);
  assert.equal(row.starts_at, "2026-01-01T00:00:00.000Z"); assert.equal(row.provenance_type, "inventory"); assert.equal(row.source_inventory_item_id, "item-uuid");
  assert.equal(row.granted_by_actor, "original-issuer");
  assert.ok(Date.parse(row.expires_at) > Date.now() + 3500000);
  const event = JSON.parse(db.prepare("SELECT payload FROM arena_membership_outbox").get().payload);
  assert.equal(event.membershipUuid, uuid); assert.equal(event.rowVersion, 5);
});
test("exact stale or foreign scope references cannot overwrite a custom membership", async () => {
  for (const changes of [{ rowVersion: 3 }, { scopeId: 99 }, { membershipUuid: "22222222-2222-4222-8222-222222222222" }, { membershipUuid: null, scopeId: null, rowVersion: null }]) {
    await assert.rejects(identity.editIdentityGroupMembership({ ...base, ...changes }));
  }
  assert.equal(db.prepare("SELECT row_version FROM arena_group_memberships").get().row_version, 4);
  assert.equal(db.prepare("SELECT COUNT(*) AS total FROM arena_membership_outbox").get().total, 0);
});
test("custom membership can become permanent while retaining its original start", async () => {
  await identity.editIdentityGroupMembership({ ...base, expiryMode: "permanent" });
  const row = db.prepare("SELECT * FROM arena_group_memberships").get();
  assert.equal(row.expires_at, null); assert.equal(row.starts_at, "2026-01-01T00:00:00.000Z");
});

test("exact custom memberships in registered server scopes remain editable", async () => {
  db.exec("INSERT INTO arena_scopes(id,scope_uuid,scope_key,display_name,scope_type) VALUES(30,'other-scope','arena','Arena server','server'); INSERT INTO arena_group_scopes VALUES(10,30,1);");
  db.exec("UPDATE arena_group_memberships SET scope_id = 30");
  await identity.editIdentityGroupMembership({ ...base, scopeId: 30, expiryMode: "permanent" });
  const row = db.prepare("SELECT * FROM arena_group_memberships").get();
  assert.equal(row.scope_id, 30); assert.equal(row.expires_at, null); assert.equal(row.row_version, 5);
});

test("a disabled scope rejects expiry edits without changing membership state", async () => {
  db.exec("UPDATE arena_scopes SET enabled = 0 WHERE id = 20");
  await assert.rejects(identity.editIdentityGroupMembership(base), { code: "group_disabled" });
  assert.equal(db.prepare("SELECT row_version FROM arena_group_memberships").get().row_version, 4);
});
