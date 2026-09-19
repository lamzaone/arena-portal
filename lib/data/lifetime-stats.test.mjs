import assert from "node:assert/strict";
import { existsSync } from "node:fs";
import { registerHooks } from "node:module";
import { extname, resolve } from "node:path";
import { DatabaseSync } from "node:sqlite";
import test from "node:test";
import { fileURLToPath, pathToFileURL } from "node:url";

let db;
function fixture(columns = "") {
  db?.close();
  db = new DatabaseSync(":memory:");
  db.exec(`CREATE TABLE lvl_base (steam TEXT PRIMARY KEY, name TEXT, value INTEGER, rank INTEGER, kills INTEGER, deaths INTEGER, headshots INTEGER, playtime INTEGER, game_wins INTEGER, game_losses INTEGER, games_played INTEGER ${columns})`);
  db.exec("INSERT INTO lvl_base (steam, name, value, rank, kills, deaths, headshots, playtime, game_wins, game_losses, games_played) VALUES ('76561198000000001', 'Player', 100, 1, 20, 10, 7, 3600, 1, 0, 1)");
  globalThis.__lifetimeStatsPool = {
    async query(sql, values = []) {
      // Execute the real profile/leaderboard SQL; other services have no rows.
      return [/\bFROM lvl_base\b/.test(sql) ? db.prepare(sql).all(...values) : [], []];
    },
  };
}
function moduleUrl(path) {
  const file = (extname(path) ? [path] : [`${path}.ts`, `${path}.tsx`, resolve(path, "index.ts")]).find(existsSync);
  return file ? pathToFileURL(file).href : null;
}
registerHooks({ resolve(specifier, context, next) {
  const stubs = {
    "server-only": "export {};",
    "@/lib/data/database-pools": "export function getGameDatabasePool(){return globalThis.__lifetimeStatsPool} export function getPortalDatabasePool(){return null}",
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
const { getPlayerDashboard, getPublicPlayerProfile } = await import("./portal-repository.ts");
const steamId = "76561198000000001";

test("profiles and dashboard keep lifetime totals after rank counters reset", async () => {
  fixture(", total_kills BIGINT, total_headshots BIGINT");
  db.exec("UPDATE lvl_base SET kills = 0, headshots = 0, total_kills = 900, total_headshots = 400");
  for (const load of [getPlayerDashboard, getPublicPlayerProfile]) {
    const profile = await load(steamId);
    assert.equal(profile.totalKills, 900);
    assert.equal(profile.totalHeadshots, 400);
    assert.equal(profile.kills, 0);
    assert.equal(profile.playtimeSeconds, 3600);
  }
});

test("old and partially upgraded schemas stay readable and detect the later migration", async () => {
  fixture();
  assert.equal((await getPublicPlayerProfile(steamId)).totalKills, 20);
  assert.equal((await getPlayerDashboard(steamId)).totalHeadshots, 7);
  db.exec("ALTER TABLE lvl_base ADD total_kills BIGINT");
  db.exec("UPDATE lvl_base SET total_kills = 90");
  const partial = await getPublicPlayerProfile(steamId);
  assert.equal(partial.totalKills, 90);
  assert.equal(partial.totalHeadshots, 7);
  db.exec("ALTER TABLE lvl_base ADD total_headshots BIGINT");
  db.exec("UPDATE lvl_base SET total_headshots = 45");
  assert.equal((await getPlayerDashboard(steamId)).totalHeadshots, 45);
});

test("an explicit full reset remains zero while unfinished backfill falls back", async () => {
  fixture(", total_kills BIGINT, total_headshots BIGINT");
  assert.equal((await getPublicPlayerProfile(steamId)).totalKills, 20);
  db.exec("UPDATE lvl_base SET total_kills = 0, total_headshots = 0");
  const profile = await getPublicPlayerProfile(steamId);
  assert.equal(profile.totalKills, 0);
  assert.equal(profile.totalHeadshots, 0);
});
