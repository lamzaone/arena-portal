import assert from "node:assert/strict";
import test from "node:test";
import type { Pool } from "mysql2/promise";

import { createServerLinkRepository, shouldAcceptHeartbeat } from "./repository.ts";
import type { Heartbeat } from "./protocol.ts";

const current = {
  sessionId: "223e4567-e89b-42d3-a456-426614174000",
  sessionStartedAt: "2026-09-05T11:00:00.000Z",
  sequence: 7,
  capturedAt: "2026-09-05T11:59:55.000Z",
};

const heartbeat: Heartbeat = {
  version: 1,
  serverId: "123e4567-e89b-42d3-a456-426614174000",
  sessionId: current.sessionId,
  sessionStartedAt: current.sessionStartedAt,
  sequence: current.sequence,
  capturedAt: current.capturedAt,
  map: "de_mirage",
  maxPlayers: 12,
  players: 1,
  bots: 0,
  roster: [{ steamId: "76561198000000001", name: "Ada" }],
};

async function testGuard<T>(operation: Promise<T>, milliseconds = 250): Promise<T> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    return await Promise.race([
      operation,
      new Promise<never>((_, reject) => {
        timer = setTimeout(() => reject(new Error("Test guard expired before the repository settled.")), milliseconds);
      }),
    ]);
  } finally {
    if (timer) clearTimeout(timer);
  }
}

test("a same-session heartbeat needs both a higher sequence and newer capture", () => {
  assert.equal(shouldAcceptHeartbeat(current, { ...current, sequence: 8, capturedAt: "2026-09-05T11:59:56.000Z" }), true);
  assert.equal(shouldAcceptHeartbeat(current, { ...current, sequence: 7, capturedAt: "2026-09-05T11:59:56.000Z" }), false);
  assert.equal(shouldAcceptHeartbeat(current, { ...current, sequence: 8 }), false);
});

test("an earlier session cannot overwrite a newer session regardless of sequence", () => {
  assert.equal(shouldAcceptHeartbeat(current, {
    sessionId: "323e4567-e89b-42d3-a456-426614174000",
    sessionStartedAt: "2026-09-05T10:00:00.000Z",
    sequence: 999,
    capturedAt: "2026-09-05T11:59:56.000Z",
  }), false);
});

test("a new session cannot replace a snapshot with an older capture", () => {
  assert.equal(shouldAcceptHeartbeat(current, {
    sessionId: "323e4567-e89b-42d3-a456-426614174000",
    sessionStartedAt: "2026-09-05T11:30:00.000Z",
    sequence: 0,
    capturedAt: "2026-09-05T11:59:54.000Z",
  }), false);
});

test("a genuinely newer session and capture are accepted", () => {
  assert.equal(shouldAcceptHeartbeat(current, {
    sessionId: "323e4567-e89b-42d3-a456-426614174000",
    sessionStartedAt: "2026-09-05T11:30:00.000Z",
    sequence: 0,
    capturedAt: "2026-09-05T11:59:56.000Z",
  }), true);
});

test("a session identifier cannot silently change its start time", () => {
  assert.equal(shouldAcceptHeartbeat(current, {
    ...current,
    sessionStartedAt: "2026-09-05T11:30:00.000Z",
    sequence: 8,
    capturedAt: "2026-09-05T11:59:56.000Z",
  }), false);
});

test("a mysql2 sequence timeout destroys the active transaction connection without queuing cleanup", async () => {
  const calls: string[] = [];
  const timeout = Object.assign(new Error("Query inactivity timeout"), {
    code: "PROTOCOL_SEQUENCE_TIMEOUT",
  });
  const connection = {
    async query(options: { sql: string }) {
      calls.push(options.sql);
      if (options.sql.startsWith("SELECT ")) throw timeout;
      if (options.sql === "ROLLBACK") return await new Promise<never>(() => undefined);
      return [[], []];
    },
    destroy() {
      calls.push("DESTROY");
    },
    release() {
      calls.push("RELEASE");
    },
  };
  const pool = {
    async getConnection() {
      return connection;
    },
  } as unknown as Pool;
  const repository = createServerLinkRepository(pool, "portal_server_link_snapshots_test_timeout");

  await assert.rejects(testGuard(repository.save(heartbeat)), /Database query timed out/);
  assert.equal(calls.includes("ROLLBACK"), false);
  assert.equal(calls.includes("RELEASE"), false);
  assert.equal(calls.filter((call) => call === "DESTROY").length, 1);
});

test("a wall-clock deadline discards a connection whose queued command never starts", async () => {
  let hangingDestroyed = 0;
  let hangingReleased = 0;
  let healthyReleased = 0;
  const hangingConnection = {
    query() {
      return new Promise<never>(() => undefined);
    },
    destroy() {
      hangingDestroyed += 1;
    },
    release() {
      hangingReleased += 1;
    },
  };
  const healthyConnection = {
    async query() {
      return [[], []];
    },
    destroy() {},
    release() {
      healthyReleased += 1;
    },
  };
  const connections = [hangingConnection, healthyConnection];
  const pool = {
    async getConnection() {
      const connection = connections.shift();
      assert.ok(connection);
      return connection;
    },
  } as unknown as Pool;
  const repository = createServerLinkRepository(
    pool,
    "portal_server_link_snapshots_test_queued",
    { databaseTimeoutMs: 25 },
  );

  await assert.rejects(testGuard(repository.get(heartbeat.serverId)), /Database query timed out/);
  assert.equal(hangingDestroyed, 1);
  assert.equal(hangingReleased, 0);
  assert.equal(await repository.get(heartbeat.serverId), null);
  assert.equal(healthyReleased, 1);
});
