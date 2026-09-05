import assert from "node:assert/strict";
import test from "node:test";

import {
  currentRoster,
  formatTimeLeft,
  playerLinks,
  rosterAvatarEnrichment,
  statusAtClientTime,
  trustedSteamAvatarUrl,
} from "./presentation.ts";

const FRESH_STATUS = {
  state: "online" as const,
  players: 1,
  maxPlayers: 12,
  map: "de_mirage",
  bots: 0,
  roster: [{ steamId: "76561198319987553", name: "Ada" }],
  checkedAt: "2026-09-05T12:00:05.000Z",
  lastSeenAt: "2026-09-05T12:00:00.000Z",
};

test("time left counts down locally without client clock skew and formats long maps", () => {
  const status = { ...FRESH_STATUS, timeLeftSeconds: 125 };
  assert.equal(formatTimeLeft(status, 1_000, 6_000), "2:00");
  assert.equal(formatTimeLeft(status, 1_000, 999), "2:05");
  assert.equal(formatTimeLeft({ ...status, timeLeftSeconds: 3661 }, 0, 0), "1:01:01");
  assert.equal(formatTimeLeft({ ...status, timeLeftSeconds: 1 }, 0, 2_000), "0:00");
  assert.equal(formatTimeLeft({ ...status, players: 0, bots: 0 }, 0, 10_000), "2:05");
  assert.equal(formatTimeLeft({ ...status, state: "lost" }, 0, 0), "—");
  assert.equal(formatTimeLeft(FRESH_STATUS, 0, 0), "—");
});

test("player links are derived from a valid Steam ID64", () => {
  assert.deepEqual(playerLinks("76561198319987553"), {
    portal: "/players/76561198319987553",
    steam: "https://steamcommunity.com/profiles/76561198319987553",
  });
});

test("player links reject invalid or attacker-controlled identifiers", () => {
  for (const value of ["123", "7656119831998755x", "76561198319987553/../../admin", "javascript:alert(1)"]) {
    assert.equal(playerLinks(value), null);
  }
});

test("only trusted HTTPS Steam avatar hosts are accepted", () => {
  assert.equal(
    trustedSteamAvatarUrl("https://avatars.fastly.steamstatic.com/abc_full.jpg"),
    "https://avatars.fastly.steamstatic.com/abc_full.jpg",
  );
  assert.equal(trustedSteamAvatarUrl("http://avatars.fastly.steamstatic.com/abc.jpg"), null);
  assert.equal(trustedSteamAvatarUrl("https://avatars.fastly.steamstatic.com.evil.test/abc.jpg"), null);
  assert.equal(trustedSteamAvatarUrl("https://example.test/avatar.jpg"), null);
});

test("lost and unavailable states never expose Playing now rows", () => {
  assert.deepEqual(currentRoster({ ...FRESH_STATUS, state: "lost" }), []);
  assert.deepEqual(currentRoster({ ...FRESH_STATUS, state: "unknown" }), []);
});

test("client elapsed time expires a cached online status without renewing freshness", () => {
  const receivedAt = Date.parse("2026-09-05T18:00:00.000Z");
  const expired = statusAtClientTime(FRESH_STATUS, receivedAt, receivedAt + 40_001);

  assert.equal(expired.state, "lost");
  assert.deepEqual(expired.roster, []);
  assert.equal(expired.checkedAt, "2026-09-05T12:00:05.000Z");
  assert.equal(expired.lastSeenAt, "2026-09-05T12:00:00.000Z");
});

test("client elapsed time keeps a snapshot online through the 45 second boundary", () => {
  const receivedAt = Date.parse("2026-09-05T18:00:00.000Z");
  const status = statusAtClientTime(FRESH_STATUS, receivedAt, receivedAt + 40_000);
  assert.equal(status.state, "online");
  assert.deepEqual(status.roster, FRESH_STATUS.roster);
});

test("client clock skew does not expire a newly received server status", () => {
  const localReceipt = Date.parse("2026-09-06T18:00:00.000Z");
  const status = statusAtClientTime(FRESH_STATUS, localReceipt, localReceipt);
  assert.equal(status.state, "online");
});

test("profile enrichment returns only connected roster IDs and trusted avatars", () => {
  const profiles = new Map([
    ["76561198319987553", { avatarFull: "https://avatars.fastly.steamstatic.com/ada_full.jpg", name: "Not exposed", presence: "online" }],
    ["76561198000000002", { avatarFull: "https://example.test/attacker.jpg", name: "Not connected", presence: "online" }],
  ]);

  assert.deepEqual(rosterAvatarEnrichment(FRESH_STATUS, profiles), [
    {
      steamId: "76561198319987553",
      avatarUrl: "https://avatars.fastly.steamstatic.com/ada_full.jpg",
    },
  ]);
  assert.deepEqual(rosterAvatarEnrichment({ ...FRESH_STATUS, state: "lost" }, profiles), []);
});
