import assert from "node:assert/strict";
import { DatabaseSync } from "node:sqlite";
import test from "node:test";
import type { Pool } from "mysql2/promise";
import { createNotificationRepository, enqueueDiscordNotification } from "./notification-repository.ts";

// Real relational queries in isolated SQLite; MySQL locks/DDL require staging verification.
function fixture() {
  const db = new DatabaseSync(":memory:");
  db.exec(`CREATE TABLE portal_discord_notifications (
    id INTEGER PRIMARY KEY AUTOINCREMENT, event_type TEXT, title TEXT, body TEXT,
    target_steam_id TEXT, target_path TEXT, status TEXT DEFAULT 'pending', attempts INTEGER DEFAULT 0,
    available_at TEXT DEFAULT CURRENT_TIMESTAMP, lease_token TEXT, lease_expires_at TEXT,
    discord_message_id TEXT, last_error TEXT, created_at TEXT DEFAULT CURRENT_TIMESTAMP, processed_at TEXT);
    CREATE TABLE portal_audit_events (actor_type TEXT, actor_id TEXT, action TEXT, target_type TEXT, target_id TEXT, metadata TEXT);`);
  const sql = (value: string) => value.replaceAll("UTC_TIMESTAMP()", "CURRENT_TIMESTAMP")
    .replace(/DATE_ADD\(CURRENT_TIMESTAMP, INTERVAL (\d+) SECOND\)/g, "datetime('now', '+$1 seconds')")
    .replace("DATE_ADD(CURRENT_TIMESTAMP, INTERVAL ? SECOND)", "datetime('now', '+' || ? || ' seconds')")
    // Keep the supported MariaDB 10.5 dialect: do not hide SKIP LOCKED syntax.
    .replaceAll(" FOR UPDATE", "");
  const executor = {
    async query(statement: string, values: unknown[] = []) { return [db.prepare(sql(statement)).all(...values as string[])]; },
    async execute(statement: string, values: unknown[] = []) {
      const result = db.prepare(sql(statement)).run(...values as string[]);
      return [{ affectedRows: Number(result.changes), insertId: Number(result.lastInsertRowid) }];
    },
    async getConnection() { return this; },
    async beginTransaction() { db.exec("BEGIN"); }, async commit() { db.exec("COMMIT"); },
    async rollback() { db.exec("ROLLBACK"); }, release() {},
  };
  const pool = executor as unknown as Pool;
  return { db, pool, repository: createNotificationRepository(pool) };
}

test("queue retains alerts until acknowledged by the current lease", async () => {
  const { db, pool, repository } = fixture();
  await enqueueDiscordNotification(pool, { eventType: "ticket.created", title: "New ticket", body: "Help @everyone", steamId: "76561198000000001", path: "/admin/tickets?case=1" });
  const [event] = await repository.claim();
  assert.equal(event.eventType, "ticket.created");
  assert.equal(event.body, "Help @everyone");
  assert.equal(event.path, "/admin/tickets?case=1");
  assert.equal((await repository.claim()).length, 0);
  assert.equal(await repository.settle({ action: "complete", id: event.id, leaseToken: "0".repeat(64), messageId: "123456789012345678" }), false);
  assert.equal(await repository.settle({ action: "complete", id: event.id, leaseToken: event.leaseToken, messageId: "123456789012345678" }), true);
  assert.equal(await repository.settle({ action: "complete", id: event.id, leaseToken: event.leaseToken, messageId: "123456789012345678" }), false);
  assert.equal(db.prepare("SELECT status FROM portal_discord_notifications").get()?.status, "sent");
  db.close();
});

test("expired claims recover after a crash and stale workers cannot acknowledge", async () => {
  const { db, pool, repository } = fixture();
  await enqueueDiscordNotification(pool, { eventType: "game.report", title: "Report", body: "reason" });
  const [first] = await repository.claim();
  db.exec("UPDATE portal_discord_notifications SET lease_expires_at = '2000-01-01 00:00:00'");
  const [next] = await repository.claim();
  assert.equal(first.id, next.id);
  assert.notEqual(first.leaseToken, next.leaseToken);
  assert.equal(await repository.settle({ action: "retry", id: first.id, leaseToken: first.leaseToken }), false);
  assert.equal(await repository.settle({ action: "retry", id: next.id, leaseToken: next.leaseToken }), true);
  assert.equal((await repository.claim()).length, 0, "retry waits for backoff");
  db.exec("UPDATE portal_discord_notifications SET available_at = '2000-01-01 00:00:00'");
  assert.equal((await repository.claim()).length, 1);
  db.close();
});

test("an expired lease cannot acknowledge even before another worker claims it", async () => {
  const { db, pool, repository } = fixture();
  await enqueueDiscordNotification(pool, { eventType: "appeal.created", title: "Appeal", body: "reason" });
  const [event] = await repository.claim();
  db.exec("UPDATE portal_discord_notifications SET lease_expires_at = '2000-01-01 00:00:00'");
  assert.equal(await repository.settle({ action: "complete", id: event.id, leaseToken: event.leaseToken, messageId: "123456789012345678" }), false);
  db.close();
});

test("notifications participate in the caller's case-creation transaction", async () => {
  const { db, pool } = fixture();
  db.exec("BEGIN");
  await enqueueDiscordNotification(pool, { eventType: "ticket.created", title: "Ticket", body: "reason" });
  db.exec("ROLLBACK");
  assert.equal(db.prepare("SELECT COUNT(*) AS count FROM portal_discord_notifications").get()?.count, 0);
  db.close();
});
