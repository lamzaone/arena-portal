import assert from "node:assert/strict";
import { registerHooks } from "node:module";
import { DatabaseSync } from "node:sqlite";
import test from "node:test";

const db = new DatabaseSync(":memory:");
const queries: Array<{ sql: string; values: unknown[] }> = [];
let available = true;
let failRead = false;
const pool = { async query(sql: string, values: unknown[] = []) {
  queries.push({ sql, values });
  if (failRead) throw new Error("private database credentials must not escape");
  return [db.prepare(sql).all(...values as (string | number | null)[])];
} };
Object.assign(globalThis, { __banTestPool: () => available ? pool : null });
registerHooks({ resolve(specifier, context, next) {
  if (specifier === "server-only") return { url: "data:text/javascript,export {};", shortCircuit: true };
  if (specifier === "./database-pools" || specifier === "@/lib/data/database-pools") {
    return { url: "data:text/javascript,export const getGameDatabasePool=()=>globalThis.__banTestPool();", shortCircuit: true };
  }
  if (/auth\/session|admin\/access/.test(specifier)) throw new Error("Public bans must not require authorization");
  return next(specifier, context);
} });

const { getBansPage } = await import("./bans.ts");
db.exec(`CREATE TABLE bans (
  Id INTEGER PRIMARY KEY, SteamId64 TEXT, PlayerName TEXT, ExpiresAt INTEGER, Length INTEGER,
  Reason TEXT, AdminSteamId64 TEXT, AdminName TEXT, GlobalBan INTEGER, CreatedAt INTEGER,
  Server TEXT, IpAddress TEXT, PrivateNotes TEXT
);`);
test.beforeEach(() => {
  available = true;
  failRead = false;
  queries.length = 0;
  db.exec("DELETE FROM bans");
  const insert = db.prepare("INSERT INTO bans VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)");
  insert.run(1, "76561198000000001", "Arena Player", 0, 0, "Cheating", "76561198000000002", "Moderator", 1, 1760000000000, "private-server-guid", "192.0.2.15", "staff only");
  insert.run(2, "76561198000000003", "Older player", 1750000000000, 3600, "Disruption", "0", "", 0, 1750000000000, "other-server", "192.0.2.16", "private case notes");
});
test.after(() => db.close());

test("reads the admin ban dataset newest first without requiring a session", async () => {
  const listing = await getBansPage(1);
  assert.equal(listing.available, true);
  assert.equal(listing.total, 2);
  assert.deepEqual(listing.bans.map(ban => ban.id), [1, 2]);
  assert.equal(listing.bans[0].global, true);
  assert.equal(listing.bans[0].expiresAt, 0);
  assert.equal(listing.bans[1].expiresAt, 1750000000);
  assert.equal(listing.bans[1].createdAt, 1750000000);
  assert.equal(listing.bans[1].adminName, "Console");
});

test("only approved public ban fields leave the repository", async () => {
  const listing = await getBansPage(1);
  assert.deepEqual(Object.keys(listing.bans[0]).sort(), ["id", "steamId", "playerName", "expiresAt", "length", "reason", "adminSteamId", "adminName", "global", "createdAt"].sort());
  assert.doesNotMatch(JSON.stringify(listing), /192\.0\.2|private-server|staff only|private case/);
  for (const { sql } of queries) assert.doesNotMatch(sql, /\b(?:IpAddress|PrivateNotes|Server|sanctions)\b|SELECT\s+\*/i);
});

test("search and pagination use the same bound filter for totals and rows", async () => {
  const listing = await getBansPage(1, "  Arena Player  ", 1);
  assert.equal(listing.total, 1);
  assert.deepEqual(listing.bans.map(ban => ban.id), [1]);
  assert.ok(queries.every(({ values }) => values[0] === "%Arena Player%" && values[1] === "%Arena Player%"));
  assert.deepEqual((await getBansPage(1, "76561198000000003")).bans.map(ban => ban.id), [2]);
  assert.deepEqual((await getBansPage(2, "", 1)).bans.map(ban => ban.id), [2]);
  assert.equal((await getBansPage(1, "' OR 1=1 --")).total, 0);
});

test("bounds invalid page sizes and pages before creating SQL offsets", async () => {
  for (const page of [NaN, Infinity, -10]) {
    const listing = await getBansPage(page, "", 0);
    assert.equal(listing.page, 1);
    assert.equal(listing.pageSize, 25);
  }
  const listing = await getBansPage(Number.MAX_SAFE_INTEGER, "x".repeat(1000), 10000);
  assert.equal(listing.page, 100000);
  assert.equal(listing.pageSize, 100);
  assert.ok(queries.at(-1)!.values.every(value => typeof value !== "string" || value.length <= 66));
});

test("distinguishes an unavailable database from a valid empty result without leaking errors", async () => {
  available = false;
  assert.equal((await getBansPage(1)).available, false);
  available = true;
  failRead = true;
  const listing = await getBansPage(1);
  assert.equal(listing.available, false);
  assert.deepEqual(listing.bans, []);
  assert.doesNotMatch(JSON.stringify(listing), /credentials/);
  failRead = false;
  const empty = await getBansPage(1, "does not exist");
  assert.equal(empty.available, true);
  assert.equal(empty.total, 0);
});
