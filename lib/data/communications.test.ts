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
  if (failRead) throw new Error("private database credentials");
  return [db.prepare(sql).all(...values as Array<string | number | null>)];
} };
Object.assign(globalThis, { __communicationTestPool: () => available ? pool : null });
registerHooks({ resolve(specifier, context, next) {
  if (specifier === "server-only") return { url: "data:text/javascript,export {};", shortCircuit: true };
  if (specifier === "./database-pools" || specifier === "@/lib/data/database-pools") return { url: "data:text/javascript,export const getGameDatabasePool=()=>globalThis.__communicationTestPool();", shortCircuit: true };
  if (/auth\/session|admin\/access/.test(specifier)) throw new Error("Public communication records must not require authorization");
  return next(specifier, context);
} });
const { getCommunicationsPage, pairCommunicationRecords } = await import("./communications.ts");
db.exec(`CREATE TABLE sanctions (Id INTEGER PRIMARY KEY, SteamId64 TEXT, PlayerName TEXT, SanctionKind INTEGER, ExpiresAt INTEGER, Length INTEGER, Reason TEXT, AdminSteamId64 TEXT, AdminName TEXT, GlobalSanction INTEGER, CreatedAt INTEGER, Server TEXT, PlayerIp TEXT, PrivateNotes TEXT);`);
test.beforeEach(() => {
  available = true; failRead = false; queries.length = 0; db.exec("DELETE FROM sanctions");
  const insert = db.prepare("INSERT INTO sanctions VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)");
  insert.run(1, "76561198000000001", "Arena Player", 1, 0, 0, "Disruption", "76561198000000002", "Moderator", 1, 1760000000000, "private-guid", "192.0.2.15", "staff only");
  insert.run(2, "76561198000000001", "Arena Player", 2, 0, 0, "Disruption", "76561198000000002", "Moderator", 1, 1760000000000, "private-guid", "192.0.2.15", "staff only");
  insert.run(3, "76561198000000003", "Other player", 2, 1750000000000, 3600, "Voice spam", "0", "", 0, 1750000000000, "private-guid", "192.0.2.16", "private notes");
  insert.run(4, "76561198000000003", "Other player", 99, 0, 0, "Unknown kind", "0", "", 0, 1750000000000, "private-guid", "192.0.2.16", "private notes");
});
test.after(() => db.close());

test("public communications read approved gag and mute records newest first without authorization", async () => {
  const listing = await getCommunicationsPage();
  assert.equal(listing.available, true);
  assert.equal(listing.total, 3);
  assert.deepEqual(listing.records.map((record) => [record.id, record.kind]), [[2, "Mute"], [1, "Gag"], [3, "Mute"]]);
  assert.equal(listing.records[2].expiresAt, 1750000000);
  assert.equal(listing.records[2].createdAt, 1750000000);
  assert.equal(listing.records[2].adminName, "Console");
});
test("only whitelisted public fields leave the communications repository", async () => {
  const listing = await getCommunicationsPage();
  assert.deepEqual(Object.keys(listing.records[0]).sort(), ["id", "steamId", "playerName", "kind", "expiresAt", "length", "reason", "adminSteamId", "adminName", "global", "createdAt"].sort());
  assert.doesNotMatch(JSON.stringify(listing), /192\.0\.2|private-guid|staff only|private notes/);
  for (const { sql } of queries) assert.doesNotMatch(sql, /\b(?:PlayerIp|IpAddress|PrivateNotes|Server|bans)\b|SELECT\s+\*/i);
});
test("search and pagination apply the same bound name or Steam ID filter to counts and records", async () => {
  const listing = await getCommunicationsPage(1, "  Arena Player  ", 1);
  assert.equal(listing.total, 2);
  assert.deepEqual(listing.records.map((record) => record.id), [2]);
  assert.ok(queries.every(({ values }) => values[0] === "%Arena Player%" && values[1] === "%Arena Player%"));
  assert.deepEqual((await getCommunicationsPage(2, "Arena Player", 1)).records.map((record) => record.id), [1]);
  assert.deepEqual((await getCommunicationsPage(1, "76561198000000003")).records.map((record) => record.id), [3]);
  assert.equal((await getCommunicationsPage(1, "' OR 1=1 --")).total, 0);
});
test("invalid page bounds and read failures have safe public responses", async () => {
  for (const page of [NaN, Infinity, -3]) {
    const listing = await getCommunicationsPage(page, "", 0);
    assert.equal(listing.page, 1); assert.equal(listing.pageSize, 25);
  }
  const bounded = await getCommunicationsPage(Number.MAX_SAFE_INTEGER, "x".repeat(1000), 10000);
  assert.equal(bounded.page, 100000); assert.equal(bounded.pageSize, 100);
  available = false; assert.equal((await getCommunicationsPage()).available, false);
  available = true; failRead = true;
  const failure = await getCommunicationsPage();
  assert.equal(failure.available, false); assert.deepEqual(failure.records, []);
  assert.doesNotMatch(JSON.stringify(failure), /credentials/);
});
test("silence pairs require the same player, issuer identity, reason, creation, expiry and duration", async () => {
  const [mute, gag] = (await getCommunicationsPage()).records;
  const paired = pairCommunicationRecords([mute, gag]);
  assert.equal(paired.length, 1); assert.equal(paired[0].kind, "Silence");
  assert.deepEqual(paired[0].recordIds, [2, 1]);
  for (const changed of [{ steamId: "76561198000000009" }, { adminSteamId: "76561198000000008" }, { adminName: "Other issuer" }, { reason: "Other reason" }, { createdAt: gag.createdAt + 1 }, { expiresAt: 1 }, { length: 1 }, { global: false }]) {
    assert.equal(pairCommunicationRecords([mute, { ...gag, ...changed }]).length, 2);
  }
  const duplicates = pairCommunicationRecords([mute, gag, { ...gag, id: 5 }]);
  assert.deepEqual(duplicates.map((record) => record.kind), ["Silence", "Gag"]);
  assert.equal(pairCommunicationRecords([gag])[0].kind, "Gag", "a split pagination pair remains accurately labeled");
});
