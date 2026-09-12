import assert from "node:assert/strict";
import { existsSync, mkdtempSync, rmSync } from "node:fs";
import { registerHooks } from "node:module";
import { tmpdir } from "node:os";
import { extname, join, resolve } from "node:path";
import { DatabaseSync } from "node:sqlite";
import test from "node:test";
import { fileURLToPath, pathToFileURL } from "node:url";

// Run the repository's actual SQL against an isolated database. The account
// upsert models InnoDB's exclusive record lock; SQLite cannot verify MySQL's
// lock implementation, so concurrency here verifies our transaction ordering.
const directory = mkdtempSync(join(tmpdir(), "arena-appeals-"));
const databasePath = join(directory, "appeals.sqlite");
const db = new DatabaseSync(databasePath);
const accountLocks = new Map<string, Promise<void>>();
let failEligibility = false;
let failAudit = false;
let releases = 0;
const sql = (query: string) => query.replaceAll(" FOR UPDATE", "").replaceAll("<=>", "IS")
  .replace(/ON DUPLICATE KEY UPDATE steam_id = VALUES\(steam_id\)/g, "ON CONFLICT (steam_id) DO UPDATE SET steam_id = excluded.steam_id");
const values = (args: unknown[]) => args as Array<string | number | null>;
function query(database: DatabaseSync, statement: string, args: unknown[] = []) {
  if (failEligibility && statement.includes("FROM portal_ban_appeals")) throw new Error("eligibility unavailable");
  return [database.prepare(sql(statement)).all(...values(args)), []];
}
const pool = {
  async query(statement: string, args: unknown[] = []) { return query(db, statement, args); },
  async getConnection() {
    const connection = new DatabaseSync(databasePath);
    let unlock: (() => void) | undefined;
    return {
      async beginTransaction() { connection.exec("BEGIN"); },
      async query(statement: string, args: unknown[] = []) { return query(connection, statement, args); },
      async execute(statement: string, args: unknown[] = []) {
        if (statement.startsWith("INSERT INTO portal_steam_accounts")) {
          const steamId = String(args[0]);
          const previous = accountLocks.get(steamId) ?? Promise.resolve();
          const held = new Promise<void>((resolve) => { unlock = resolve; });
          accountLocks.set(steamId, previous.then(() => held));
          await previous;
        }
        if (failAudit && statement.includes("INSERT INTO portal_audit_events")) throw new Error("audit unavailable");
        const result = connection.prepare(sql(statement)).run(...values(args));
        return [{ insertId: Number(result.lastInsertRowid), affectedRows: Number(result.changes) }, []];
      },
      async commit() { connection.exec("COMMIT"); unlock?.(); },
      async rollback() { connection.exec("ROLLBACK"); unlock?.(); },
      release() { connection.close(); releases++; },
    };
  },
};
Object.assign(globalThis, { __appealTestPool: pool });
function moduleUrl(path: string) {
  const file = (extname(path) ? [path] : [`${path}.ts`, `${path}.tsx`, resolve(path, "index.ts")]).find(existsSync);
  return file ? pathToFileURL(file).href : null;
}
registerHooks({ resolve(specifier, context, next) {
  const stubs: Record<string, string> = {
    "server-only": "export {};",
    "@/lib/data/database-pools": "export function getGameDatabasePool(){return null} export function getPortalDatabasePool(){return globalThis.__appealTestPool}",
    "@/lib/data/identity-catalogue": "export async function ensureIdentityCatalogue(){} export async function getIdentityCatalogueStatus(){} export async function syncIdentityCatalogue(){}",
    "@/lib/data/staff-vip-memberships": "export class StaffVipMembershipError extends Error {}",
    "@/lib/data/vip-membership-activation-saga": "export async function activateVipMembershipItemWithSaga(){}",
  };
  if (stubs[specifier]) return { url: `data:text/javascript,${encodeURIComponent(stubs[specifier])}`, shortCircuit: true };
  if (specifier === "next/server") return { url: pathToFileURL(resolve("node_modules/next/server.js")).href, shortCircuit: true };
  const url = specifier.startsWith("@/") ? moduleUrl(resolve(specifier.slice(2)))
    : specifier.startsWith(".") && context.parentURL?.startsWith("file:") ? moduleUrl(fileURLToPath(new URL(specifier, context.parentURL))) : null;
  return url ? { url, shortCircuit: true } : next(specifier, context);
} });
const { createAppeal, getAppealEligibility } = await import("./portal-repository.ts");
db.exec(`
CREATE TABLE portal_steam_accounts (steam_id TEXT PRIMARY KEY);
CREATE TABLE portal_ban_appeals (id INTEGER PRIMARY KEY AUTOINCREMENT, steam_id TEXT, ban_id INTEGER, body TEXT, status TEXT DEFAULT 'submitted', closed_at TEXT, updated_at TEXT DEFAULT CURRENT_TIMESTAMP);
CREATE TABLE portal_audit_events (actor_type TEXT, actor_id TEXT, action TEXT, target_type TEXT, target_id TEXT);
`);
const steamId = "76561198000000001";
const input = { steamId, banId: 17, body: "Please review my ban and the attached evidence." };
const previousNotifications = process.env.DISCORD_NOTIFICATIONS_ENABLED;
test.beforeEach(() => {
  failEligibility = false; failAudit = false; releases = 0; accountLocks.clear();
  process.env.DISCORD_NOTIFICATIONS_ENABLED = "false";
  db.exec("DELETE FROM portal_ban_appeals; DELETE FROM portal_steam_accounts; DELETE FROM portal_audit_events;");
});
test.after(() => {
  db.close(); rmSync(directory, { recursive: true, force: true });
  if (previousNotifications === undefined) delete process.env.DISCORD_NOTIFICATIONS_ENABLED;
  else process.env.DISCORD_NOTIFICATIONS_ENABLED = previousNotifications;
});
function existingAppeal(status: string, banId: number | null = 17, player = steamId, decisionAt = new Date().toISOString()) {
  return Number(db.prepare("INSERT INTO portal_ban_appeals (steam_id, ban_id, body, status, closed_at, updated_at) VALUES (?, ?, 'Earlier appeal', ?, ?, ?)").run(player, banId, status, decisionAt, decisionAt).lastInsertRowid);
}
function count(table: string) { return db.prepare(`SELECT COUNT(*) AS total FROM ${table}`).get()?.total; }

test("every unfinished status blocks another appeal even for a different ban or no ban", async () => {
  for (const status of ["submitted", "reviewing", "waiting-player", "investigating", "future-status"]) {
    for (const oldBan of [17, 18, null]) {
      db.exec("DELETE FROM portal_ban_appeals");
      const id = existingAppeal(status, oldBan);
      assert.deepEqual(await getAppealEligibility(steamId, 17), {
        eligible: false, eligibleAt: null, reason: "open-appeal", openAppealId: id,
      });
      await assert.rejects(createAppeal(input), { message: "open-appeal" });
      assert.equal(count("portal_ban_appeals"), 1);
    }
  }
});

test("an older open appeal still blocks when a newer appeal was closed", async () => {
  const id = existingAppeal("submitted", null);
  existingAppeal("closed-banned");
  assert.deepEqual(await getAppealEligibility(steamId, 17), {
    eligible: false, eligibleAt: null, reason: "open-appeal", openAppealId: id,
  });
});

test("closed appeals and another account's open appeal permit a new submission", async () => {
  existingAppeal("closed"); existingAppeal("closed-unbanned");
  existingAppeal("closed-banned", 18);
  existingAppeal("submitted", 17, "76561198000000002");
  assert.deepEqual(await getAppealEligibility(steamId, 17), {
    eligible: true, eligibleAt: null, reason: null, openAppealId: null,
  });
  const id = await createAppeal(input);
  assert.equal(db.prepare("SELECT status FROM portal_ban_appeals WHERE id = ?").get(id)?.status, "submitted");
  assert.equal(count("portal_audit_events"), 1);
});

test("the latest rejected appeal keeps the seven-day cooldown including null ban IDs", async () => {
  const now = Date.now();
  for (const banId of [17, null]) {
    db.exec("DELETE FROM portal_ban_appeals");
    existingAppeal("closed-banned", banId, steamId, new Date(now - 8 * 86_400_000).toISOString());
    existingAppeal("closed-banned", banId, steamId, new Date(now - 6 * 86_400_000).toISOString());
    assert.deepEqual(await getAppealEligibility(steamId, banId), {
      eligible: false, eligibleAt: new Date(now + 86_400_000).toISOString(), reason: "cooldown", openAppealId: null,
    });
    await assert.rejects(createAppeal({ ...input, banId }), { message: "cooldown" });
  }
});

test("a rejected appeal older than seven days permits a new submission", async () => {
  existingAppeal("closed-banned", 17, steamId, new Date(Date.now() - 8 * 86_400_000).toISOString());
  assert.equal((await getAppealEligibility(steamId, 17)).eligible, true);
  await createAppeal(input);
  assert.equal(count("portal_ban_appeals"), 2);
});

test("concurrent first appeals on different bans create exactly one case", async () => {
  const results = await Promise.allSettled([createAppeal(input), createAppeal({ ...input, banId: 18 })]);
  assert.equal(results.filter((result) => result.status === "fulfilled").length, 1);
  const rejected = results.find((result) => result.status === "rejected");
  assert.equal(rejected?.reason.message, "open-appeal");
  assert.equal(count("portal_ban_appeals"), 1);
  assert.equal(count("portal_audit_events"), 1);
  assert.equal(releases, 2);
});

test("eligibility storage errors fail closed and leave no submission or account write", async () => {
  failEligibility = true;
  await assert.rejects(getAppealEligibility(steamId, 17), /eligibility unavailable/);
  await assert.rejects(createAppeal(input), /eligibility unavailable/);
  assert.equal(count("portal_ban_appeals"), 0);
  assert.equal(count("portal_steam_accounts"), 0);
  assert.equal(releases, 1);
});

test("a failed creation rolls back and releases the account for a successful retry", async () => {
  failAudit = true;
  await assert.rejects(createAppeal(input), /audit unavailable/);
  assert.equal(count("portal_ban_appeals"), 0);
  assert.equal(count("portal_steam_accounts"), 0);
  failAudit = false;
  await createAppeal(input);
  assert.equal(count("portal_ban_appeals"), 1);
  assert.equal(releases, 2);
});
