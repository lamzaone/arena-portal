import assert from "node:assert/strict";
import test from "node:test";
import type { PublicStatus } from "./protocol.ts";
import { playerServerPresence } from "./player-presence.ts";

const steamId = "76561198000000001";
const now = Date.parse("2026-10-18T12:00:00.000Z");
const status: PublicStatus = { state: "online", players: 1, maxPlayers: 32, bots: 0, map: "de_mirage", checkedAt: new Date(now).toISOString(), lastSeenAt: new Date(now - 5_000).toISOString(), roster: [{ steamId, name: "Player" }] };

test("only a fresh CS2 roster marks a player online, regardless of their website or Steam activity", () => {
  assert.equal(playerServerPresence(status, steamId, now, now), "online");
  assert.equal(playerServerPresence(status, "76561198000000002", now, now), "offline");
  assert.equal(playerServerPresence({ ...status, players: 0, roster: [] }, steamId, now, now), "offline");
});

test("unavailable or stale server snapshots never misreport a player as online or offline", () => {
  assert.equal(playerServerPresence(null, steamId, now, now), "unknown");
  for (const state of ["lost", "unknown"] as const) assert.equal(playerServerPresence({ ...status, state }, steamId, now, now), "unknown");
  assert.equal(playerServerPresence(status, steamId, now, now + 40_001), "unknown");
  assert.equal(playerServerPresence({ ...status, lastSeenAt: null }, steamId, now, now), "unknown");
  assert.equal(playerServerPresence({ ...status, checkedAt: "invalid" }, steamId, now, now), "unknown");
});
