import assert from "node:assert/strict";
import { registerHooks } from "node:module";
import { DatabaseSync } from "node:sqlite";
import test from "node:test";

const db = new DatabaseSync(":memory:");
let failRead = false;
let available = true;
Object.assign(globalThis, { __profileHistoryPool: () => available ? { async query(sql: string, values: unknown[] = []) {
  if (failRead) throw new Error("private credentials");
  return [db.prepare(sql).all(...values as Array<string | number | null>)];
} } : null });
registerHooks({ resolve(specifier, context, next) {
  if (specifier === "server-only") return { url: "data:text/javascript,export {};", shortCircuit: true };
  if (specifier === "./database-pools") return { url: "data:text/javascript,export const getGameDatabasePool=()=>globalThis.__profileHistoryPool();", shortCircuit: true };
  return next(specifier, context);
} });
const { getPlayerModerationHistory } = await import("./player-moderation-history.ts");
const steamId = "76561198000000001";
db.exec(`CREATE TABLE bans (Id INTEGER PRIMARY KEY, SteamId64 TEXT, Reason TEXT, AdminSteamId64 TEXT, AdminName TEXT, ExpiresAt INTEGER, Length INTEGER, CreatedAt INTEGER);
CREATE TABLE sanctions (Id INTEGER PRIMARY KEY, SteamId64 TEXT, SanctionKind INTEGER, Reason TEXT, AdminSteamId64 TEXT, AdminName TEXT, ExpiresAt INTEGER, Length INTEGER, CreatedAt INTEGER);`);
test.beforeEach(() => {
  failRead = false; available = true; db.exec("DELETE FROM bans; DELETE FROM sanctions;");
  const insertBan = db.prepare("INSERT INTO bans VALUES (?, ?, ?, ?, ?, ?, ?, ?)");
  const insertComms = db.prepare("INSERT INTO sanctions VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)");
  for (let index = 1; index <= 32; index++) {
    insertBan.run(index, steamId, `Ban ${index}`, "76561198000000002", "Moderator", 1760000000000, 60, 1750000000000);
    insertComms.run(index, steamId, index % 2 ? 1 : 2, `Comms ${index}`, "0", "Console", 0, 0, 1750000000000);
  }
  insertBan.run(99, "76561198000000009", "Other player", "0", "Console", 0, 0, 1750000000001);
  insertComms.run(99, steamId, 99, "Unknown sanction kind", "0", "Console", 0, 0, 1750000000001);
});
test.after(() => db.close());

test("full profile moderation history has independently paged bans and communications beyond the dashboard cap", async () => {
  const listing = await getPlayerModerationHistory(steamId, 4, 2);
  assert.equal(listing.bans.total, 32);
  assert.equal(listing.sanctions.total, 32);
  assert.deepEqual(listing.bans.records.map((row) => row.id), [2, 1]);
  assert.deepEqual(listing.sanctions.records.map((row) => row.id), [22, 21, 20, 19, 18, 17, 16, 15, 14, 13]);
  assert.equal(listing.bans.records[0].expiresAt, 1760000000);
  assert.equal(listing.bans.records[0].createdAt, 1750000000);
  assert.equal(listing.sanctions.records[0].kind, "Mute");
  assert.equal(listing.sanctions.records[0].adminSteamId, null);
});

test("history clamps out-of-range pages after counting and does not mask storage errors as an empty record", async () => {
  const listing = await getPlayerModerationHistory(steamId, Infinity, Number.MAX_SAFE_INTEGER);
  assert.equal(listing.bans.page, 1);
  assert.equal(listing.sanctions.page, 4);
  failRead = true;
  assert.equal((await getPlayerModerationHistory(steamId)).bans.available, false);
  available = false;
  assert.equal((await getPlayerModerationHistory(steamId)).sanctions.available, false);
});
