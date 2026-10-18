import assert from "node:assert/strict";
import test from "node:test";
import { arenaStatistics } from "./arena-statistics.ts";

test("arena performance uses stored counters and leaves untracked streaks unknown", () => {
  const stats = arenaStatistics({ round_win: 30, round_lose: 10, assists: 7, shoots: 200, hits: 80, damage: 12000, games_played: 10 });
  assert.equal(stats.roundWinRate, 75);
  assert.equal(stats.accuracy, 40);
  assert.equal(stats.highestKillstreak, null);
  assert.equal(stats.assists, 7);
});
test("missing samples never claim measured rates or a historical streak", () => {
  const stats = arenaStatistics({ round_win: null, round_lose: 0, shoots: 0, hits: 0 });
  assert.equal(stats.roundWinRate, null);
  assert.equal(stats.accuracy, null);
  assert.equal(stats.highestKillstreak, null);
  assert.equal(arenaStatistics({ highest_killstreak: 15 }).highestKillstreak, 15);
});
