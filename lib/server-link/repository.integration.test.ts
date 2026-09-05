import assert from "node:assert/strict";
import test from "node:test";

import mysql, { type RowDataPacket } from "mysql2/promise";

import { createServerLinkRepository } from "./repository.ts";
import type { Heartbeat } from "./protocol.ts";

const databaseUrl = process.env.SERVER_LINK_TEST_DATABASE_URL;

test("locked persistence rejects replay without refreshing database receipt time", {
  skip: databaseUrl ? false : "SERVER_LINK_TEST_DATABASE_URL is not configured",
}, async () => {
  assert.ok(databaseUrl);
  const pool = mysql.createPool({
    uri: databaseUrl,
    connectionLimit: 2,
    timezone: "Z",
    supportBigNumbers: true,
    bigNumberStrings: true,
  });
  const tableName = `portal_server_link_snapshots_test_${process.pid}_${Date.now().toString(36)}`;
  assert.match(tableName, /^portal_server_link_snapshots_test_[a-z0-9_]+$/);

  try {
    await pool.query(`CREATE TABLE ${tableName} (
      server_id CHAR(36) CHARACTER SET ascii COLLATE ascii_bin NOT NULL PRIMARY KEY,
      session_id CHAR(36) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
      session_started_at DATETIME(3) NOT NULL,
      sequence BIGINT UNSIGNED NOT NULL,
      captured_at DATETIME(3) NOT NULL,
      map VARCHAR(128) NULL,
      max_players TINYINT UNSIGNED NOT NULL,
      players TINYINT UNSIGNED NOT NULL,
      bots TINYINT UNSIGNED NOT NULL,
      roster JSON NOT NULL,
      received_at DATETIME(3) NOT NULL
    ) ENGINE = InnoDB`);

    const repository = createServerLinkRepository(pool, tableName);
    const heartbeat: Heartbeat = {
      version: 1,
      serverId: "123e4567-e89b-42d3-a456-426614174000",
      sessionId: "223e4567-e89b-42d3-a456-426614174000",
      sessionStartedAt: "2026-09-05T11:00:00.000Z",
      sequence: 7,
      capturedAt: "2026-09-05T11:59:55.000Z",
      map: "de_mirage",
      maxPlayers: 12,
      players: 1,
      bots: 0,
      roster: [{ steamId: "76561198000000001", name: "Ada" }],
    };

    assert.equal(await repository.save(heartbeat), true);
    const first = await repository.get(heartbeat.serverId);
    assert.ok(first);
    await new Promise((resolve) => setTimeout(resolve, 20));
    assert.equal(await repository.save(heartbeat), false);
    const replayed = await repository.get(heartbeat.serverId);
    assert.equal(replayed?.receivedAt, first.receivedAt);

    assert.equal(await repository.save({
      ...heartbeat,
      sessionId: "323e4567-e89b-42d3-a456-426614174000",
      sessionStartedAt: "2026-09-05T10:00:00.000Z",
      sequence: 999,
      capturedAt: "2026-09-05T11:59:56.000Z",
    }), false);

    const racingServerId = "423e4567-e89b-42d3-a456-426614174000";
    const earlierSession = { ...heartbeat, serverId: racingServerId };
    const laterSession = {
      ...heartbeat,
      serverId: racingServerId,
      sessionId: "523e4567-e89b-42d3-a456-426614174000",
      sessionStartedAt: "2026-09-05T11:30:00.000Z",
      sequence: 0,
      capturedAt: "2026-09-05T11:59:56.000Z",
    };
    const [, laterAccepted] = await Promise.all([
      repository.save(earlierSession),
      repository.save(laterSession),
    ]);
    assert.equal(laterAccepted, true);
    const raced = await repository.get(racingServerId);
    assert.equal(raced?.heartbeat.sessionId, laterSession.sessionId);
    assert.equal(raced?.heartbeat.capturedAt, laterSession.capturedAt);

    const [rows] = await pool.query<Array<{ database_now: number } & RowDataPacket>>(
      `SELECT ABS(TIMESTAMPDIFF(SECOND, received_at, UTC_TIMESTAMP(3))) < 5 AS database_now
         FROM ${tableName}
        WHERE server_id = ?`,
      [heartbeat.serverId],
    );
    assert.equal(Number(rows[0]?.database_now), 1);
  } finally {
    await pool.query(`DROP TABLE IF EXISTS ${tableName}`);
    await pool.end();
  }
});
