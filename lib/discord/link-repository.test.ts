import assert from "node:assert/strict";
import { DatabaseSync } from "node:sqlite";
import test from "node:test";
import type { Pool } from "mysql2/promise";

import { createDiscordLinkRepository, DiscordLinkError, hashDiscordLinkCode, normalizeDiscordLinkCode } from "./link-repository.ts";

const steam = "76561198000000001";
const otherSteam = "76561198000000002";
const discord = "123456789012345678";
const otherDiscord = "223456789012345678";

// Run real relational statements against an isolated database. Transactions are
// serialized here; MySQL lock semantics are exercised by the integration suite.
function fixture() {
  const db = new DatabaseSync(":memory:");
  let now = Date.parse("2026-09-12T12:00:00Z");
  const date = (value: number) => new Date(value).toISOString().slice(0, 19).replace("T", " ");
  const millis = (value: unknown) => Date.parse(`${String(value).replace(" ", "T")}Z`);
  db.function("UTC_TIMESTAMP", () => date(now));
  db.function("UNIX_TIMESTAMP", (value) => millis(value) / 1000);
  db.function("TIMESTAMPADD", (unit, amount, value) => date(millis(value) + Number(amount) * (unit === "MINUTE" ? 60000 : 1000)));
  db.function("TIMESTAMPDIFF", (_unit, start, end) => Math.floor((millis(end) - millis(start)) / 1000));
  db.exec(`
    CREATE TABLE portal_discord_link_codes (code_hash TEXT PRIMARY KEY, discord_user_id TEXT NOT NULL UNIQUE, expires_at TEXT NOT NULL, consumed_at TEXT, created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP);
    CREATE TABLE portal_discord_links (steam_id TEXT PRIMARY KEY, discord_user_id TEXT NOT NULL UNIQUE, linked_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP);
    CREATE TABLE portal_audit_events (actor_type TEXT, actor_id TEXT, action TEXT, target_type TEXT, target_id TEXT, metadata TEXT);
  `);
  const sql = (value: string) => value.replaceAll(" FOR UPDATE", "")
    .replaceAll("ON DUPLICATE KEY UPDATE", "ON CONFLICT DO UPDATE SET")
    .replace(/(TIMESTAMPADD|TIMESTAMPDIFF)\((SECOND|MINUTE),/g, "$1('$2',");
  let queue = Promise.resolve();
  let failAudit = false;
  let insertionDelay = 0;
  const execute = async (statement: string, values: unknown[] = []) => {
    if (failAudit && statement.includes("INSERT INTO portal_audit_events")) throw new Error("Audit unavailable");
    try {
      const result = db.prepare(sql(statement)).run(...values as Array<string | number | null>);
      if (statement.includes("INSERT INTO portal_discord_links")) now += insertionDelay * 1000;
      return [{ affectedRows: Number(result.changes) }, []];
    } catch (error) {
      if (error instanceof Error && error.message.includes("UNIQUE constraint")) Object.assign(error, { code: "ER_DUP_ENTRY" });
      throw error;
    }
  };
  const query = async (statement: string, values: unknown[] = []) => [db.prepare(sql(statement)).all(...values as Array<string | number | null>), []];
  const pool = {
    query,
    async getConnection() {
      let unlock = () => {};
      const connection = {
        execute, query,
        async beginTransaction() {
          const previous = queue;
          queue = new Promise<void>((resolve) => { unlock = resolve; });
          await previous;
          db.exec("BEGIN");
        },
        async commit() { db.exec("COMMIT"); },
        async rollback() { db.exec("ROLLBACK"); },
        release() { unlock(); },
        destroy() { unlock(); },
      };
      return connection;
    },
  } as unknown as Pool;
  return { repository: createDiscordLinkRepository(pool), db, advance: (seconds: number) => { now += seconds * 1000; }, delayInsertion: (seconds: number) => { insertionDelay = seconds; }, failAudit: () => { failAudit = true; } };
}

const errorCode = (code: string) => (error: unknown) => error instanceof DiscordLinkError && error.code === code;

test("codes accept case and separators but reject embedded spaces and non-hex input", () => {
  assert.equal(normalizeDiscordLinkCode("  abcd-1234-ef56  "), "ABCD1234EF56");
  for (const code of ["ABCD 1234 EF56", "ABCD_1234_EF56", "abcd1234ef5g", "abcd1234ef5", ""]) {
    assert.throws(() => normalizeDiscordLinkCode(code), errorCode("invalid_code"));
  }
  assert.equal(hashDiscordLinkCode("ABCD-1234-EF56"), hashDiscordLinkCode("abcd1234ef56"));
});

test("issuance stores only a hash, expires after ten minutes, and throttles replacement for 60 seconds", async () => {
  const f = fixture();
  const first = await f.repository.issue(discord);
  assert.match(first.code, /^[A-F0-9]{4}-[A-F0-9]{4}-[A-F0-9]{4}$/);
  assert.equal(first.expiresAt, "2026-09-12T12:10:00.000Z");
  assert.deepEqual({ ...f.db.prepare("SELECT code_hash, consumed_at FROM portal_discord_link_codes").get() }, { code_hash: hashDiscordLinkCode(first.code), consumed_at: null });
  await assert.rejects(f.repository.issue(discord), (error: unknown) => error instanceof DiscordLinkError && error.code === "rate_limited" && error.retryAfterSeconds === 60);
  f.advance(59);
  await assert.rejects(f.repository.issue(discord), errorCode("rate_limited"));
  f.advance(1);
  const replacement = await f.repository.issue(discord);
  assert.notEqual(first.code, replacement.code);
  await assert.rejects(f.repository.redeem({ steamId: steam, code: first.code, source: "portal" }), errorCode("invalid_code"));
  assert.equal(f.db.prepare("SELECT COUNT(*) AS count FROM portal_discord_link_codes").get()?.count, 1);
  f.db.close();
});

test("redemption commits the one-to-one link, consumption, and audit together and rejects reuse", async () => {
  const f = fixture();
  const issued = await f.repository.issue(discord);
  const linked = await f.repository.redeem({ steamId: steam, code: issued.code.toLowerCase(), source: "portal" });
  assert.equal(linked.discordUserId, discord);
  assert.equal((await f.repository.getForSteam(steam))?.discordUserId, discord);
  assert.ok(f.db.prepare("SELECT consumed_at FROM portal_discord_link_codes").get()?.consumed_at);
  const audit = f.db.prepare("SELECT * FROM portal_audit_events").get();
  assert.equal(audit?.actor_type, "player");
  assert.equal(audit?.actor_id, steam);
  assert.equal(audit?.action, "discord.linked");
  assert.deepEqual(JSON.parse(String(audit?.metadata)), { source: "portal", discordUserId: discord });
  await assert.rejects(f.repository.redeem({ steamId: otherSteam, code: issued.code, source: "game" }), errorCode("invalid_code"));
  await assert.rejects(f.repository.issue(discord), errorCode("already_linked"));
  f.db.close();
});

test("expiry is enforced at the exact database deadline", async () => {
  const f = fixture();
  const issued = await f.repository.issue(discord);
  f.advance(600);
  await assert.rejects(f.repository.redeem({ steamId: steam, code: issued.code, source: "game" }), errorCode("expired_code"));
  assert.equal(await f.repository.getForSteam(steam), null);
  f.db.close();
});

test("conflicting Steam or Discord links are preserved and leave the code unused", async () => {
  for (const existing of [[steam, otherDiscord], [otherSteam, discord]]) {
    const f = fixture();
    const issued = await f.repository.issue(discord);
    f.db.prepare("INSERT INTO portal_discord_links (steam_id, discord_user_id) VALUES (?, ?)").run(...existing);
    await assert.rejects(f.repository.redeem({ steamId: steam, code: issued.code, source: "game" }), errorCode("already_linked"));
    assert.deepEqual({ ...f.db.prepare("SELECT steam_id, discord_user_id FROM portal_discord_links").get() }, { steam_id: existing[0], discord_user_id: existing[1] });
    assert.equal(f.db.prepare("SELECT consumed_at FROM portal_discord_link_codes").get()?.consumed_at, null);
    assert.equal(f.db.prepare("SELECT COUNT(*) AS count FROM portal_audit_events").get()?.count, 0);
    f.db.close();
  }
});

test("a code that expires while link insertion waits is rolled back without consumption", async () => {
  const f = fixture();
  const issued = await f.repository.issue(discord);
  f.advance(599);
  f.delayInsertion(1);
  await assert.rejects(f.repository.redeem({ steamId: steam, code: issued.code, source: "portal" }), errorCode("expired_code"));
  assert.equal(await f.repository.getForSteam(steam), null);
  assert.equal(f.db.prepare("SELECT consumed_at FROM portal_discord_link_codes").get()?.consumed_at, null);
  assert.equal(f.db.prepare("SELECT COUNT(*) AS count FROM portal_audit_events").get()?.count, 0);
  f.db.close();
});

test("audit failure rolls back link insertion and code consumption", async () => {
  const f = fixture();
  const issued = await f.repository.issue(discord);
  f.failAudit();
  await assert.rejects(f.repository.redeem({ steamId: steam, code: issued.code, source: "portal" }), /Audit unavailable/);
  assert.equal(await f.repository.getForSteam(steam), null);
  assert.equal(f.db.prepare("SELECT consumed_at FROM portal_discord_link_codes").get()?.consumed_at, null);
  f.db.close();
});

test("racing code submissions produce one link and one audit", async () => {
  const f = fixture();
  const issued = await f.repository.issue(discord);
  const results = await Promise.allSettled([steam, otherSteam].map((steamId) => f.repository.redeem({ steamId, code: issued.code, source: "portal" })));
  assert.equal(results.filter((result) => result.status === "fulfilled").length, 1);
  assert.equal(f.db.prepare("SELECT COUNT(*) AS count FROM portal_discord_links").get()?.count, 1);
  assert.equal(f.db.prepare("SELECT COUNT(*) AS count FROM portal_audit_events").get()?.count, 1);
  f.db.close();
});

test("simultaneous first issuance allows only one code per Discord account", async () => {
  const f = fixture();
  const results = await Promise.allSettled([f.repository.issue(discord), f.repository.issue(discord)]);
  assert.equal(results.filter((result) => result.status === "fulfilled").length, 1);
  const failure = results.find((result) => result.status === "rejected");
  assert.ok(failure?.status === "rejected" && errorCode("rate_limited")(failure.reason));
  f.db.close();
});
