import assert from "node:assert/strict";
import test from "node:test";

import {
  toPublicStatus,
  validateHeartbeat,
  type Heartbeat,
} from "./protocol.ts";

const NOW = Date.parse("2026-09-05T12:00:00.000Z");
const SERVER_ID = "123e4567-e89b-42d3-a456-426614174000";

function validHeartbeat(): Heartbeat {
  return {
    version: 1,
    serverId: SERVER_ID,
    sessionId: "223e4567-e89b-42d3-a456-426614174000",
    sessionStartedAt: "2026-09-05T11:00:00.000Z",
    sequence: 7,
    capturedAt: "2026-09-05T11:59:55.000Z",
    map: "de_mirage",
    maxPlayers: 12,
    players: 1,
    bots: 2,
    roster: [{ steamId: "76561198000000001", name: "Ada" }],
  };
}

test("map time is optional for older senders and validated when supplied", () => {
  assert.equal(validateHeartbeat(validHeartbeat(), SERVER_ID, NOW).timeLeftSeconds, null);
  assert.equal(validateHeartbeat({ ...validHeartbeat(), timeLeftSeconds: 125 }, SERVER_ID, NOW).timeLeftSeconds, 125);
  for (const value of [-1, 1.5, "120", Infinity]) {
    assert.throws(() => validateHeartbeat({ ...validHeartbeat(), timeLeftSeconds: value }, SERVER_ID, NOW), /timeLeftSeconds/);
  }
});

test("player session time and score survive validation and public projection", () => {
  const input = validHeartbeat();
  input.roster[0] = { ...input.roster[0], connectedSeconds: 90, score: -2 };
  const heartbeat = validateHeartbeat(input, SERVER_ID, NOW);
  assert.equal(heartbeat.roster[0].score, -2);
  assert.equal(toPublicStatus(heartbeat, NOW, NOW).roster[0].connectedSeconds, 95);
  assert.throws(() => validateHeartbeat({ ...input, roster: [{ ...input.roster[0], connectedSeconds: -1 }] }, SERVER_ID, NOW), /connectedSeconds/);
  assert.throws(() => validateHeartbeat({ ...input, roster: [{ ...input.roster[0], score: 1.5 }] }, SERVER_ID, NOW), /score/);
});

test("public map time accounts for capture age, clamps at zero, and hides stale timers", () => {
  const heartbeat = { ...validHeartbeat(), timeLeftSeconds: 125 };
  assert.equal(toPublicStatus(heartbeat, NOW, NOW).timeLeftSeconds, 120);
  assert.equal(toPublicStatus({ ...heartbeat, timeLeftSeconds: 2 }, NOW, NOW).timeLeftSeconds, 0);
  assert.equal(toPublicStatus(heartbeat, NOW - 46_000, NOW).timeLeftSeconds, null);
  assert.equal(toPublicStatus({ ...heartbeat, players: 0, bots: 0, roster: [] }, NOW, NOW).timeLeftSeconds, 125);
});

test("validation rejects a human count that disagrees with the roster", () => {
  assert.throws(
    () => validateHeartbeat({ ...validHeartbeat(), players: 2 }, SERVER_ID, NOW),
    /players/i,
  );
});

test("validation rejects duplicate and invalid Steam IDs", () => {
  const duplicate = {
    ...validHeartbeat(),
    players: 2,
    roster: [
      { steamId: "76561198000000001", name: "Ada" },
      { steamId: "76561198000000001", name: "Grace" },
    ],
  };
  assert.throws(() => validateHeartbeat(duplicate, SERVER_ID, NOW), /steam/i);
  assert.throws(
    () => validateHeartbeat({ ...validHeartbeat(), roster: [{ steamId: "123", name: "Ada" }] }, SERVER_ID, NOW),
    /steam/i,
  );
});

test("validation enforces capture age and future tolerance", () => {
  assert.throws(
    () => validateHeartbeat({ ...validHeartbeat(), capturedAt: "2026-09-05T11:59:29.999Z" }, SERVER_ID, NOW),
    /capturedAt/i,
  );
  assert.throws(
    () => validateHeartbeat({ ...validHeartbeat(), capturedAt: "2026-09-05T12:00:10.001Z" }, SERVER_ID, NOW),
    /capturedAt/i,
  );
});

test("validation rejects calendar dates that JavaScript would normalize", () => {
  assert.throws(
    () => validateHeartbeat(
      { ...validHeartbeat(), capturedAt: "2026-09-31T11:59:55.000Z" },
      SERVER_ID,
      Date.parse("2026-10-01T12:00:00.000Z"),
    ),
    /capturedAt/i,
  );
});

test("validation normalizes UUIDs and ISO timestamps", () => {
  const normalized = validateHeartbeat(
    {
      ...validHeartbeat(),
      serverId: SERVER_ID.toUpperCase(),
      capturedAt: "2026-09-05T11:59:55Z",
    },
    SERVER_ID,
    NOW,
  );
  assert.equal(normalized.serverId, SERVER_ID);
  assert.equal(normalized.capturedAt, "2026-09-05T11:59:55.000Z");
});

test("a snapshot received more than 45 seconds ago is lost and has no current roster", () => {
  const status = toPublicStatus(validHeartbeat(), NOW - 46_000, NOW);
  assert.equal(status.state, "lost");
  assert.deepEqual(status.roster, []);
  assert.equal(status.lastSeenAt, "2026-09-05T11:59:14.000Z");
  assert.equal(status.checkedAt, "2026-09-05T12:00:00.000Z");
});

test("a fresh empty snapshot stays distinguishable from an unavailable status", () => {
  const heartbeat = { ...validHeartbeat(), players: 0, bots: 0, roster: [] };
  const status = toPublicStatus(heartbeat, NOW - 45_000, NOW);
  assert.equal(status.state, "online");
  assert.equal(status.players, 0);
  assert.deepEqual(status.roster, []);
});
