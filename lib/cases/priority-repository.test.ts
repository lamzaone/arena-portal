import assert from "node:assert/strict";
import { registerHooks } from "node:module";
import { DatabaseSync } from "node:sqlite";
import test from "node:test";

const db = new DatabaseSync(":memory:");
db.exec(`CREATE TABLE portal_tickets (id INTEGER PRIMARY KEY); INSERT INTO portal_tickets VALUES (2);
  CREATE TABLE portal_ban_appeals (id INTEGER PRIMARY KEY); INSERT INTO portal_ban_appeals VALUES (2);
  CREATE TABLE portal_case_priorities (case_type TEXT, case_id INTEGER, priority TEXT, updated_by TEXT, updated_at TEXT DEFAULT CURRENT_TIMESTAMP, PRIMARY KEY(case_type,case_id));
  CREATE TABLE portal_audit_events (actor_type TEXT, actor_id TEXT, action TEXT, target_type TEXT, target_id TEXT);`);
let auditFails = false;
const pool = {
  async query(sql: string, values: Array<string | number> = []) { return [db.prepare(sql).all(...values), []]; },
  async getConnection() { return {
    async beginTransaction() { db.exec("BEGIN"); },
    async query(sql: string, values: Array<string | number> = []) { return [db.prepare(sql.replace(" FOR UPDATE", "")).all(...values), []]; },
    async execute(sql: string, values: Array<string | number> = []) {
      if (auditFails && sql.includes("portal_audit_events")) throw new Error("audit unavailable");
      const adapted = sql.replace(/ON DUPLICATE KEY UPDATE[\s\S]+/, "ON CONFLICT(case_type,case_id) DO UPDATE SET priority=excluded.priority, updated_by=excluded.updated_by, updated_at=CURRENT_TIMESTAMP");
      return [db.prepare(adapted).run(...values), []];
    },
    async commit() { db.exec("COMMIT"); }, async rollback() { db.exec("ROLLBACK"); }, release() {},
  }; },
};
Object.assign(globalThis, { __casePriorityPool: pool });
registerHooks({ resolve(specifier, context, next) {
  if (specifier === "server-only") return { url: "data:text/javascript,export {}", shortCircuit: true };
  if (specifier === "@/lib/data/database-pools") return { url: "data:text/javascript,export function getPortalDatabasePool(){return globalThis.__casePriorityPool}", shortCircuit: true };
  return next(specifier, context);
} });
const { getStaffCasePriorities, setStaffCasePriority } = await import("./priority-repository.ts");
const input = { caseType: "ticket" as const, caseId: 2, priority: "high", actorSteamId: "76561198000000001" };
test.beforeEach(() => { auditFails = false; db.exec("DELETE FROM portal_case_priorities; DELETE FROM portal_audit_events"); });
test.after(() => db.close());

test("priorities persist by case type and ID, with normal as the default", async () => {
  await setStaffCasePriority(input);
  await setStaffCasePriority({ ...input, caseType: "appeal", priority: "urgent" });
  assert.equal((await getStaffCasePriorities("ticket", [2])).priorities.get(2), "high");
  assert.equal((await getStaffCasePriorities("appeal", [2])).priorities.get(2), "urgent");
  await setStaffCasePriority({ ...input, priority: "low" });
  assert.equal((await getStaffCasePriorities("ticket", [2])).priorities.get(2), "low");
  assert.equal(db.prepare("SELECT COUNT(*) AS total FROM portal_case_priorities").get()?.total, 2);
  assert.equal(db.prepare("SELECT COUNT(*) AS total FROM portal_audit_events").get()?.total, 3);
});
test("invalid labels and missing cases cannot create priority rows", async () => {
  await assert.rejects(setStaffCasePriority({ ...input, priority: "invalid" }), /priority/);
  await assert.rejects(setStaffCasePriority({ ...input, caseId: 100 }), /case/);
  assert.equal(db.prepare("SELECT COUNT(*) AS total FROM portal_case_priorities").get()?.total, 0);
});
test("audit and priority updates roll back together", async () => {
  await setStaffCasePriority(input);
  auditFails = true;
  await assert.rejects(setStaffCasePriority({ ...input, priority: "urgent" }), /audit unavailable/);
  assert.equal((await getStaffCasePriorities("ticket", [2])).priorities.get(2), "high");
});
test("an unmigrated database keeps case reads available and rejects priority writes clearly", async () => {
  db.exec("ALTER TABLE portal_case_priorities RENAME TO saved_priorities");
  try {
    const result = await getStaffCasePriorities("ticket", [2]);
    assert.equal(result.available, false);
    assert.equal(result.priorities.size, 0);
    await assert.rejects(setStaffCasePriority(input), /priority-storage/);
  } finally { db.exec("ALTER TABLE saved_priorities RENAME TO portal_case_priorities"); }
});
