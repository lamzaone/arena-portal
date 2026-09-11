import assert from "node:assert/strict";
import { randomBytes } from "node:crypto";
import { readFile } from "node:fs/promises";
import test from "node:test";
import mysql, { type Pool, type RowDataPacket } from "mysql2/promise";
import { createDiscordLinkRepository, DiscordLinkError } from "./link-repository.ts";

// This opt-in database is only used for uniquely named fixture tables. Never
// point the fixture adapter at the production table names or run live migrations.
const databaseUrl = process.env.DISCORD_LINK_TEST_DATABASE_URL;

test("MySQL row locks serialize first issuance and cross-client redemption", {
  skip: databaseUrl ? false : "DISCORD_LINK_TEST_DATABASE_URL is not configured",
}, async () => {
  assert.ok(databaseUrl);
  const pool = mysql.createPool({ uri: databaseUrl, connectionLimit: 4, timezone: "Z", supportBigNumbers: true, bigNumberStrings: true });
  const suffix = `_test_${process.pid}_${randomBytes(5).toString("hex")}`;
  const names = ["portal_discord_link_codes", "portal_discord_links", "portal_audit_events"];
  const tables = Object.fromEntries(names.map((name) => [name, `${name}${suffix}`]));
  for (const table of Object.values(tables)) assert.match(table, /^portal_[a-z_]+_test_[0-9]+_[0-9a-f]{10}$/);
  const rewrite = (sql: string) => sql.replace(/\b(portal_discord_link_codes|portal_discord_links|portal_audit_events)\b/g, (name) => tables[name]);
  // Only table identifiers are substituted; production SQL and real InnoDB
  // transactions, duplicate indexes, and FOR UPDATE locking remain unchanged.
  const adapter = {
    query: (sql: string, values?: unknown[]) => pool.query(rewrite(sql), values),
    async getConnection() {
      const connection = await pool.getConnection();
      await connection.query("SET SESSION time_zone = '+00:00'");
      return new Proxy(connection, {
        get(target, property) {
          if (property === "query") return (sql: string, values?: unknown[]) => target.query(rewrite(sql), values);
          if (property === "execute") return (sql: string, values?: Array<string | number | null>) => target.execute(rewrite(sql), values);
          const value: unknown = Reflect.get(target, property);
          return typeof value === "function" ? value.bind(target) : value;
        },
      });
    },
  } as unknown as Pool;
  const created: string[] = [];
  const repository = createDiscordLinkRepository(adapter);
  const discord = "123456789012345678";
  const otherDiscord = "223456789012345678";
  const steam = "76561198000000001";
  const otherSteam = "76561198000000002";
  const codeError = (code: string) => (error: unknown) => error instanceof DiscordLinkError && error.code === code;
  try {
    const migration = await readFile(new URL("../../db/027_discord_linking.sql", import.meta.url), "utf8");
    await pool.query(rewrite(migration));
    created.push(tables.portal_discord_link_codes);
    await pool.query(rewrite("CREATE TABLE portal_discord_links (steam_id VARCHAR(17) PRIMARY KEY, discord_user_id VARCHAR(32) NOT NULL UNIQUE, linked_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP) ENGINE = InnoDB"));
    created.push(tables.portal_discord_links);
    await pool.query(rewrite("CREATE TABLE portal_audit_events (actor_type VARCHAR(16), actor_id VARCHAR(64), action VARCHAR(80), target_type VARCHAR(32), target_id VARCHAR(64), metadata JSON) ENGINE = InnoDB"));
    created.push(tables.portal_audit_events);

    const issuances = await Promise.allSettled([repository.issue(discord), repository.issue(discord)]);
    const issued = issuances.find((result) => result.status === "fulfilled");
    const throttled = issuances.find((result) => result.status === "rejected");
    assert.equal(issuances.filter((result) => result.status === "fulfilled").length, 1);
    assert.ok(issued?.status === "fulfilled");
    assert.ok(throttled?.status === "rejected" && codeError("rate_limited")(throttled.reason));

    const redemptions = await Promise.allSettled([
      repository.redeem({ steamId: steam, code: issued.value.code, source: "portal" }),
      repository.redeem({ steamId: otherSteam, code: issued.value.code, source: "game" }),
    ]);
    assert.equal(redemptions.filter((result) => result.status === "fulfilled").length, 1);
    const winner = redemptions.find((result) => result.status === "fulfilled");
    assert.ok(winner?.status === "fulfilled");
    const [audits] = await pool.query<RowDataPacket[]>(rewrite("SELECT COUNT(*) AS count FROM portal_audit_events"));
    assert.equal(Number(audits[0].count), 1);
    await assert.rejects(repository.issue(discord), codeError("already_linked"));

    const conflicting = await repository.issue(otherDiscord);
    await assert.rejects(repository.redeem({ steamId: winner.value.steamId, code: conflicting.code, source: "portal" }), codeError("already_linked"));
    const [unconsumed] = await pool.query<RowDataPacket[]>(rewrite("SELECT consumed_at FROM portal_discord_link_codes WHERE discord_user_id = ?"), [otherDiscord]);
    assert.equal(unconsumed[0].consumed_at, null);
    await pool.query(rewrite("UPDATE portal_discord_link_codes SET expires_at = UTC_TIMESTAMP() WHERE discord_user_id = ?"), [otherDiscord]);
    await assert.rejects(repository.redeem({ steamId: steam, code: conflicting.code, source: "portal" }), codeError("expired_code"));
  } finally {
    for (const table of created.reverse()) await pool.query(`DROP TABLE ${table}`);
    await pool.end();
  }
});
