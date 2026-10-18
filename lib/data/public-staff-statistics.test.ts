import assert from "node:assert/strict";
import { existsSync } from "node:fs";
import { registerHooks } from "node:module";
import { extname, resolve } from "node:path";
import { DatabaseSync } from "node:sqlite";
import test from "node:test";
import { fileURLToPath, pathToFileURL } from "node:url";

const db = new DatabaseSync(":memory:");
db.function("LEAST", (a, b) => Math.min(Number(a), Number(b)));
db.function("JSON_UNQUOTE", (value) => value);
let queries = 0;
const pool = { async query(sql: string, values: unknown[] = []) { queries++; return [db.prepare(sql.replaceAll(" AS BINARY)", " AS BLOB)")).all(...values as (string | number | null)[])]; } };
Object.assign(globalThis, { __publicStaffStatisticsPool: pool });
registerHooks({ resolve(specifier, context, next) {
  if (specifier === "server-only") return { url: "data:text/javascript,export {};", shortCircuit: true };
  if (specifier.endsWith("/database-pools") || specifier === "./database-pools") return { url: "data:text/javascript,export const getGameDatabasePool=()=>globalThis.__publicStaffStatisticsPool;export const getPortalDatabasePool=()=>globalThis.__publicStaffStatisticsPool;", shortCircuit: true };
  if (specifier.startsWith(".") && context.parentURL?.startsWith("file:")) {
    const path = fileURLToPath(new URL(specifier, context.parentURL));
    const file = (extname(path) ? [path] : [`${path}.ts`, resolve(path, "index.ts")]).find(existsSync);
    if (file) return { url: pathToFileURL(file).href, shortCircuit: true };
  }
  return next(specifier, context);
} });

const { getPublicStaffStatistics } = await import("./public-staff-statistics.ts");
const issuer = "76561198000000001", other = "76561198000000002";
const server = "01234567-89ab-cdef-0123-456789abcdef";
db.exec(`CREATE TABLE bans (AdminSteamId64 TEXT); CREATE TABLE lvl_base (steam TEXT, playtime INTEGER);
CREATE TABLE sanctions (AdminSteamId64 TEXT, SteamId64 TEXT, PlayerName TEXT COLLATE NOCASE, AdminName TEXT COLLATE NOCASE, Reason TEXT COLLATE NOCASE, CreatedAt INTEGER, ExpiresAt INTEGER, Length INTEGER, GlobalSanction INTEGER, SanctionKind INTEGER);
CREATE TABLE portal_warnings (issuer_steam_id TEXT, server_guid TEXT);
CREATE TABLE portal_outbox (event_type TEXT, status TEXT, payload TEXT);`);
test.beforeEach(() => {
  process.env.GAME_SERVER_GUID = server;
  Object.assign(globalThis, { __publicStaffStatisticsPool: pool });
  db.exec("DELETE FROM bans;DELETE FROM lvl_base;DELETE FROM sanctions;DELETE FROM portal_warnings;DELETE FROM portal_outbox;");
  queries = 0;
});

test("counts recorded actions by exact issuer and pairs each complementary restriction once", async () => {
  db.prepare("INSERT INTO bans VALUES (?)").run(issuer);
  db.prepare("INSERT INTO bans VALUES (?)").run(other);
  db.prepare("INSERT INTO lvl_base VALUES (?, 8100)").run(issuer);
  const sanction = db.prepare("INSERT INTO sanctions VALUES (?, ?, 'Player', 'Staff', ?, 100, 200, 10, 0, ?)");
  sanction.run(issuer, other, "same event", 1); sanction.run(issuer, other, "same event", 2);
  sanction.run(issuer, other, "same event", 1); // Duplicate gag is still its own gag.
  sanction.run(issuer, other, "different reason", 2);
  sanction.run(other, issuer, "same event", 2);
  db.prepare("INSERT INTO portal_warnings VALUES (?, ?)").run(issuer, server);
  db.prepare("INSERT INTO portal_warnings VALUES (?, 'different-server')").run(issuer);
  const kick = db.prepare("INSERT INTO portal_outbox VALUES ('moderation.kick', ?, ?)");
  kick.run("completed", JSON.stringify({ actorSteamId: issuer, serverGuid: server }));
  kick.run("pending", JSON.stringify({ actorSteamId: issuer, serverGuid: server }));
  kick.run("completed", JSON.stringify({ actorSteamId: issuer, serverGuid: "different-server" }));
  const result = await getPublicStaffStatistics([issuer, issuer, other]);
  assert.deepEqual(result[issuer], { bansIssued: 1, communications: { gags: 1, mutes: 1, silences: 1 }, kicksIssued: 1, warningsIssued: 1, playtimeSeconds: 8100 });
  assert.equal(result[other].bansIssued, 1);
  assert.equal(result[other].playtimeSeconds, 0);
  assert.equal(queries, 5, "one aggregate query per source, independent of member count");
});

test("never turns unavailable storage into invented zero statistics", async () => {
  Object.assign(globalThis, { __publicStaffStatisticsPool: null });
  assert.deepEqual((await getPublicStaffStatistics([issuer]))[issuer], { bansIssued: null, communications: null, kicksIssued: null, warningsIssued: null, playtimeSeconds: null });
  assert.deepEqual(await getPublicStaffStatistics([]), {});
  assert.equal(queries, 0);
});

test("case differences in restriction details never invent a silence pair", async () => {
  const sanction = db.prepare("INSERT INTO sanctions VALUES (?, ?, 'Player', 'Staff', ?, 100, 200, 10, 0, ?)");
  sanction.run(issuer, other, "Chat spam", 1);
  sanction.run(issuer, other, "chat spam", 2);
  assert.deepEqual((await getPublicStaffStatistics([issuer]))[issuer].communications, { gags: 1, mutes: 1, silences: 0 });
});

test("a missing optional source does not hide independently available totals", async () => {
  Object.assign(globalThis, { __publicStaffStatisticsPool: { async query(sql: string, values: unknown[]) {
    if (sql.includes("portal_warnings")) throw new Error("migration pending");
    return pool.query(sql, values);
  } } });
  const statistics = (await getPublicStaffStatistics([issuer]))[issuer];
  assert.equal(statistics.warningsIssued, null);
  assert.equal(statistics.bansIssued, 0);
  assert.equal(statistics.kicksIssued, 0);
  assert.deepEqual(statistics.communications, { gags: 0, mutes: 0, silences: 0 });
  assert.deepEqual(Object.keys(statistics).sort(), ["bansIssued", "communications", "kicksIssued", "playtimeSeconds", "warningsIssued"]);
});
