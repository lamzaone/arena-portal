import assert from "node:assert/strict";
import { existsSync } from "node:fs";
import { registerHooks } from "node:module";
import { extname, resolve } from "node:path";
import { DatabaseSync } from "node:sqlite";
import test from "node:test";
import { fileURLToPath, pathToFileURL } from "node:url";

const db = new DatabaseSync(":memory:");
let failQueue = false;
const executor = {
  async query(sql: string, values: unknown[] = []) { return [db.prepare(sql).all(...values as string[])]; },
  async execute(sql: string, values: unknown[] = []) {
    if (failQueue && sql.includes("INSERT INTO portal_discord_notifications")) throw new Error("queue unavailable");
    const result = db.prepare(sql).run(...values as string[]);
    return [{ affectedRows: Number(result.changes), insertId: Number(result.lastInsertRowid) }];
  },
  async getConnection() { return this; }, async beginTransaction() { db.exec("BEGIN"); },
  async commit() { db.exec("COMMIT"); }, async rollback() { db.exec("ROLLBACK"); }, release() {},
};
Object.assign(globalThis, { __discordCaseTestPool: executor });
function moduleUrl(path: string) {
  const file = (extname(path) ? [path] : [`${path}.ts`, `${path}.tsx`, resolve(path, "index.ts")]).find(existsSync);
  return file ? pathToFileURL(file).href : null;
}
registerHooks({ resolve(specifier, context, next) {
  const stubs: Record<string, string> = {
    "server-only": "export {};",
    "@/lib/data/database-pools": "export function getGameDatabasePool(){return globalThis.__discordCaseTestPool} export function getPortalDatabasePool(){return globalThis.__discordCaseTestPool}",
    "@/lib/data/identity-catalogue": "export async function ensureIdentityCatalogue(){} export async function getIdentityCatalogueStatus(){} export async function syncIdentityCatalogue(){}",
    "@/lib/data/staff-vip-memberships": "export class StaffVipMembershipError extends Error {}",
    "@/lib/data/vip-membership-activation-saga": "export async function activateVipMembershipItemWithSaga(){}",
  };
  if (stubs[specifier]) return { url: `data:text/javascript,${stubs[specifier]}`, shortCircuit: true };
  if (specifier === "next/server") return { url: pathToFileURL(resolve("node_modules/next/server.js")).href, shortCircuit: true };
  const url = specifier.startsWith("@/") ? moduleUrl(resolve(specifier.slice(2)))
    : specifier.startsWith(".") && context.parentURL?.startsWith("file:") ? moduleUrl(fileURLToPath(new URL(specifier, context.parentURL))) : null;
  return url ? { url, shortCircuit: true } : next(specifier, context);
} });
const { createTicket, createAppeal } = await import("../data/portal-repository.ts");
db.exec(`
CREATE TABLE portal_tickets (id INTEGER PRIMARY KEY AUTOINCREMENT, steam_id TEXT, category TEXT, subject TEXT, body TEXT);
CREATE TABLE portal_ban_appeals (id INTEGER PRIMARY KEY AUTOINCREMENT, steam_id TEXT, ban_id INTEGER, body TEXT);
CREATE TABLE portal_discord_notifications (event_type TEXT, title TEXT, body TEXT, target_steam_id TEXT, target_path TEXT);
CREATE TABLE portal_audit_events (actor_type TEXT, actor_id TEXT, action TEXT, target_type TEXT, target_id TEXT, metadata TEXT);
`);
const input = { steamId: "76561198000000001", category: "account", subject: "Cannot log in", body: "Please help with my account." };
const previous = process.env.DISCORD_NOTIFICATIONS_ENABLED;
test.after(() => { db.close(); if (previous === undefined) delete process.env.DISCORD_NOTIFICATIONS_ENABLED; else process.env.DISCORD_NOTIFICATIONS_ENABLED = previous; });
test.beforeEach(() => {
  failQueue = false;
  process.env.DISCORD_NOTIFICATIONS_ENABLED = "true";
  db.exec("DELETE FROM portal_tickets; DELETE FROM portal_ban_appeals; DELETE FROM portal_discord_notifications; DELETE FROM portal_audit_events;");
});

test("new tickets and appeals enqueue distinct staff alerts with links", async () => {
  const ticketId = await createTicket(input);
  const appealId = await createAppeal({ steamId: input.steamId, banId: 17, body: "Please review my ban." });
  const rows = db.prepare("SELECT * FROM portal_discord_notifications ORDER BY rowid").all();
  assert.equal(rows.length, 2);
  assert.equal(rows[0].event_type, "ticket.created");
  assert.equal(rows[1].event_type, "appeal.created");
  assert.match(String(rows[0].title), new RegExp(String(ticketId)));
  assert.match(String(rows[1].title), new RegExp(String(appealId)));
  assert.match(String(rows[0].target_path), /^\/admin\/tickets/);
  assert.match(String(rows[1].target_path), /^\/admin\/appeals/);
});
test("failed alert enqueue rolls back ticket and appeal creation", async () => {
  failQueue = true;
  await assert.rejects(createTicket(input), /queue unavailable/);
  await assert.rejects(createAppeal({ steamId: input.steamId, banId: 17, body: "Please review." }), /queue unavailable/);
  assert.equal(db.prepare("SELECT COUNT(*) AS count FROM portal_tickets").get()?.count, 0);
  assert.equal(db.prepare("SELECT COUNT(*) AS count FROM portal_ban_appeals").get()?.count, 0);
});
test("notification feature stays opt-in before the migration is enabled", async () => {
  process.env.DISCORD_NOTIFICATIONS_ENABLED = "false";
  failQueue = true;
  await createTicket(input);
  assert.equal(db.prepare("SELECT COUNT(*) AS count FROM portal_discord_notifications").get()?.count, 0);
});
