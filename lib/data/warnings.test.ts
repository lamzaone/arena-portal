import assert from "node:assert/strict";
import { existsSync } from "node:fs";
import { registerHooks } from "node:module";
import { extname, resolve } from "node:path";
import { DatabaseSync } from "node:sqlite";
import test from "node:test";
import { fileURLToPath, pathToFileURL } from "node:url";

const db = new DatabaseSync(":memory:");
let failAudit = false;
const execute = async (sql: string, args: unknown[] = []) => {
  if (failAudit && sql.includes("INSERT INTO portal_audit_events")) throw new Error("audit unavailable");
  if (sql.startsWith("SELECT")) return [db.prepare(sql).all(...args as (string|number|null)[]), []];
  try {
    const result = db.prepare(sql).run(...args as (string|number|null)[]);
    return [{ affectedRows: Number(result.changes) }, []];
  } catch (error) {
    if ((error as Error).message.includes("UNIQUE constraint")) Object.assign(error as Error, { code: "ER_DUP_ENTRY" });
    throw error;
  }
};
const pool = { execute, async getConnection() { return {
  execute, async beginTransaction() { db.exec("BEGIN"); }, async commit() { db.exec("COMMIT"); }, async rollback() { db.exec("ROLLBACK"); }, release() {},
}; } };
Object.assign(globalThis, { __warningTestPool: pool });
registerHooks({ resolve(specifier, context, next) {
  if (specifier === "server-only") return { url: "data:text/javascript,export {};", shortCircuit: true };
  if (specifier === "./database-pools") return { url: "data:text/javascript,export function getPortalDatabasePool(){return globalThis.__warningTestPool}", shortCircuit: true };
  if (specifier.startsWith(".") && context.parentURL?.startsWith("file:")) {
    const path = fileURLToPath(new URL(specifier, context.parentURL));
    const file = (extname(path) ? [path] : [`${path}.ts`, resolve(path, "index.ts")]).find(existsSync);
    if (file) return { url: pathToFileURL(file).href, shortCircuit: true };
  }
  return next(specifier, context);
} });
const { issuePlayerWarning, getPlayerWarnings, getPlayerWarningsPage, revokePlayerWarning, getWarningTarget, getWarningsPage } = await import("./warnings.ts");
db.exec(`CREATE TABLE portal_warnings (id TEXT PRIMARY KEY, steam_id TEXT, player_name TEXT, server_guid TEXT, reason TEXT, issuer_steam_id TEXT, issuer_name TEXT, issued_at INTEGER, expires_at INTEGER, acknowledged_at INTEGER, revoked_at INTEGER, revoked_by TEXT, revoke_reason TEXT);
CREATE TABLE portal_audit_events (actor_type TEXT, actor_id TEXT, action TEXT, target_type TEXT, target_id TEXT, metadata TEXT);`);
const server = "01234567-89ab-cdef-0123-456789abcdef";
const input = { id: "11234567-89ab-cdef-0123-456789abcdef", steamId: "76561198000000001", playerName: "Player", serverGuid: server, actorSteamId: "76561198000000002", actorName: "Staff", reason: "Repeated disruption", durationMinutes: 60 };
test.beforeEach(() => { process.env.GAME_SERVER_GUID = server; failAudit = false; db.exec("DELETE FROM portal_warnings; DELETE FROM portal_audit_events;"); });
test.after(() => db.close());
test("issuing saves UTC expiry and audit atomically; duplicate form retry creates one warning", async () => {
  const before = Date.now();
  await issuePlayerWarning(input); await issuePlayerWarning(input);
  const rows = await getPlayerWarnings(input.steamId);
  assert.equal(rows.length, 1);
  assert.equal(rows[0].expiresAt - rows[0].issuedAt, 3600000);
  assert.ok(rows[0].issuedAt >= before && rows[0].issuedAt <= Date.now());
  assert.equal(db.prepare("SELECT COUNT(*) AS count FROM portal_audit_events").get()?.count, 1);
  await assert.rejects(issuePlayerWarning({ ...input, steamId: input.actorSteamId }));
});
test("audit failure rolls back warning rather than accepting an unaudited sanction", async () => {
  failAudit = true;
  await assert.rejects(issuePlayerWarning(input));
  assert.equal((await getPlayerWarnings(input.steamId)).length, 0);
});
test("revocation retains history and audits once even for duplicate retries", async () => {
  await issuePlayerWarning(input);
  await revokePlayerWarning(input.id, input.actorSteamId, "Staff correction");
  await revokePlayerWarning(input.id, input.actorSteamId, "Staff correction");
  const rows = await getPlayerWarnings(input.steamId);
  assert.ok(rows[0].revokedAt);
  assert.equal(rows[0].revokeReason, "Staff correction");
  assert.equal(db.prepare("SELECT COUNT(*) AS count FROM portal_audit_events").get()?.count, 2);
});
test("remote server warning IDs cannot be looked up, displayed, or revoked", async () => {
  await issuePlayerWarning({ ...input, serverGuid: "21234567-89ab-cdef-0123-456789abcdef" });
  assert.equal(await getWarningTarget(input.id), undefined);
  await revokePlayerWarning(input.id, input.actorSteamId, "Rejected scope");
  assert.deepEqual(await getPlayerWarnings(input.steamId), []);
  assert.equal((await getWarningsPage("", 1)).total, 0);
  assert.equal(db.prepare("SELECT revoked_at FROM portal_warnings").get()?.revoked_at, null);
});
test("expiry leaves an immutable history row and cannot be revoked after expiry", async () => {
  await issuePlayerWarning(input);
  db.prepare("UPDATE portal_warnings SET expires_at = ?").run(Date.now() - 1);
  await revokePlayerWarning(input.id, input.actorSteamId, "Too late");
  const rows = await getPlayerWarnings(input.steamId);
  assert.equal(rows.length, 1); assert.equal(rows[0].revokedAt, null);
});

test("player warning pagination reaches older records beyond the former 100-record limit and isolates player/server", async () => {
  const insert = db.prepare("INSERT INTO portal_warnings (id, steam_id, server_guid, reason, issuer_name, issued_at, expires_at) VALUES (?, ?, ?, ?, ?, ?, ?)");
  for (let index = 1; index <= 105; index++) insert.run(`warning-${index}`, input.steamId, server, `Reason ${index}`, "Moderator", index * 1000, index * 2000);
  insert.run("other-player", input.actorSteamId, server, "Private other record", "Moderator", 9999999, 9999999);
  insert.run("other-server", input.steamId, "21234567-89ab-cdef-0123-456789abcdef", "Remote record", "Moderator", 9999999, 9999999);
  const first = await getPlayerWarningsPage(input.steamId, 1);
  assert.equal(first.total, 105);
  assert.equal(first.warnings.length, 10);
  assert.equal(first.warnings[0].reason, "Reason 105");
  const last = await getPlayerWarningsPage(input.steamId, 11);
  assert.deepEqual(last.warnings.map((warning) => warning.reason), ["Reason 5", "Reason 4", "Reason 3", "Reason 2", "Reason 1"]);
  assert.equal(last.page, 11);
  assert.equal((await getPlayerWarningsPage(input.steamId, Number.MAX_SAFE_INTEGER)).page, 11);
  for (const page of [NaN, Infinity, -1, 0]) assert.equal((await getPlayerWarningsPage(input.steamId, page)).page, 1);
});
