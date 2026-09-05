import type { Pool, PoolConnection, RowDataPacket } from "mysql2/promise";

import type { Heartbeat, RosterPlayer } from "./protocol.ts";

const SNAPSHOT_TABLE = "portal_server_link_snapshots";
const DATABASE_TIMEOUT_MS = 5_000;
const RETRYABLE_DATABASE_ERRORS = new Set(["ER_DUP_ENTRY", "ER_LOCK_DEADLOCK", "ER_LOCK_WAIT_TIMEOUT"]);

export type HeartbeatOrder = Pick<
  Heartbeat,
  "sessionId" | "sessionStartedAt" | "sequence" | "capturedAt"
>;

export type StoredHeartbeat = {
  heartbeat: Heartbeat;
  receivedAt: string;
};

type SnapshotRow = RowDataPacket & {
  server_id: string;
  session_id: string;
  session_started_at: Date;
  sequence: string | number;
  captured_at: Date;
  map: string | null;
  max_players: number;
  players: number;
  bots: number;
  roster: string | RosterPlayer[];
  received_at: Date;
};

class DatabaseTimeoutError extends Error {}

function epoch(value: string): number {
  return Date.parse(value);
}

export function shouldAcceptHeartbeat(current: HeartbeatOrder, incoming: HeartbeatOrder): boolean {
  if (epoch(incoming.capturedAt) <= epoch(current.capturedAt)) return false;

  if (incoming.sessionId === current.sessionId) {
    return incoming.sessionStartedAt === current.sessionStartedAt && incoming.sequence > current.sequence;
  }
  return epoch(incoming.sessionStartedAt) > epoch(current.sessionStartedAt);
}

function safeTableName(tableName: string): string {
  if (!/^portal_server_link_snapshots(?:_test_[a-z0-9_]{1,80})?$/.test(tableName)) {
    throw new Error("Invalid server-link snapshot table name.");
  }
  return tableName;
}

async function acquireConnection(pool: Pool): Promise<PoolConnection> {
  const acquisition = pool.getConnection();
  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    return await Promise.race([
      acquisition,
      new Promise<never>((_, reject) => {
        timer = setTimeout(() => reject(new DatabaseTimeoutError("Database connection timed out.")), DATABASE_TIMEOUT_MS);
      }),
    ]);
  } catch (error) {
    if (error instanceof DatabaseTimeoutError) {
      void acquisition.then((connection) => connection.release(), () => undefined);
    }
    throw error;
  } finally {
    if (timer) clearTimeout(timer);
  }
}

async function query<T extends RowDataPacket[]>(connection: PoolConnection, sql: string, values: unknown[] = []) {
  return connection.query<T>({ sql, values, timeout: DATABASE_TIMEOUT_MS });
}

function databaseCode(error: unknown): string | null {
  if (!error || typeof error !== "object" || !("code" in error)) return null;
  return typeof error.code === "string" ? error.code : null;
}

function iso(value: Date | string): string {
  const date = value instanceof Date ? value : new Date(value);
  if (!Number.isFinite(date.getTime())) throw new Error("Invalid timestamp stored for server heartbeat.");
  return date.toISOString();
}

function roster(value: string | RosterPlayer[]): RosterPlayer[] {
  const parsed: unknown = typeof value === "string" ? JSON.parse(value) : value;
  if (!Array.isArray(parsed)) throw new Error("Invalid roster stored for server heartbeat.");
  return parsed.map((player) => {
    if (
      !player ||
      typeof player !== "object" ||
      typeof (player as Record<string, unknown>).steamId !== "string" ||
      typeof (player as Record<string, unknown>).name !== "string"
    ) {
      throw new Error("Invalid roster player stored for server heartbeat.");
    }
    return {
      steamId: (player as Record<string, string>).steamId,
      name: (player as Record<string, string>).name,
    };
  });
}

function storedHeartbeat(row: SnapshotRow): StoredHeartbeat {
  return {
    heartbeat: {
      version: 1,
      serverId: row.server_id,
      sessionId: row.session_id,
      sessionStartedAt: iso(row.session_started_at),
      sequence: Number(row.sequence),
      capturedAt: iso(row.captured_at),
      map: row.map,
      maxPlayers: row.max_players,
      players: row.players,
      bots: row.bots,
      roster: roster(row.roster),
    },
    receivedAt: iso(row.received_at),
  };
}

function rowOrder(row: SnapshotRow): HeartbeatOrder {
  return {
    sessionId: row.session_id,
    sessionStartedAt: iso(row.session_started_at),
    sequence: Number(row.sequence),
    capturedAt: iso(row.captured_at),
  };
}

async function saveAttempt(pool: Pool, tableName: string, heartbeat: Heartbeat): Promise<boolean> {
  const connection = await acquireConnection(pool);
  let transactionStarted = false;
  try {
    await query(connection, "SET SESSION innodb_lock_wait_timeout = 5");
    await query(connection, "START TRANSACTION");
    transactionStarted = true;
    const [rows] = await query<SnapshotRow[]>(
      connection,
      `SELECT server_id, session_id, session_started_at, sequence, captured_at, map,
              max_players, players, bots, roster, received_at
         FROM ${tableName}
        WHERE server_id = ?
        FOR UPDATE`,
      [heartbeat.serverId],
    );

    if (rows[0] && !shouldAcceptHeartbeat(rowOrder(rows[0]), heartbeat)) {
      await query(connection, "COMMIT");
      transactionStarted = false;
      return false;
    }

    const values = [
      heartbeat.serverId,
      heartbeat.sessionId,
      new Date(heartbeat.sessionStartedAt),
      heartbeat.sequence,
      new Date(heartbeat.capturedAt),
      heartbeat.map,
      heartbeat.maxPlayers,
      heartbeat.players,
      heartbeat.bots,
      JSON.stringify(heartbeat.roster),
    ];
    if (rows[0]) {
      await query(
        connection,
        `UPDATE ${tableName}
            SET session_id = ?, session_started_at = ?, sequence = ?, captured_at = ?, map = ?,
                max_players = ?, players = ?, bots = ?, roster = ?, received_at = UTC_TIMESTAMP(3)
          WHERE server_id = ?`,
        [values[1], values[2], values[3], values[4], values[5], values[6], values[7], values[8], values[9], values[0]],
      );
    } else {
      await query(
        connection,
        `INSERT INTO ${tableName}
          (server_id, session_id, session_started_at, sequence, captured_at, map,
           max_players, players, bots, roster, received_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, UTC_TIMESTAMP(3))`,
        values,
      );
    }
    await query(connection, "COMMIT");
    transactionStarted = false;
    return true;
  } catch (error) {
    if (transactionStarted) {
      await query(connection, "ROLLBACK").catch(() => undefined);
    }
    throw error;
  } finally {
    connection.release();
  }
}

export function createServerLinkRepository(pool: Pool, requestedTableName = SNAPSHOT_TABLE) {
  const tableName = safeTableName(requestedTableName);
  return {
    async save(heartbeat: Heartbeat): Promise<boolean> {
      for (let attempt = 0; attempt < 3; attempt += 1) {
        try {
          return await saveAttempt(pool, tableName, heartbeat);
        } catch (error) {
          const code = databaseCode(error);
          if (attempt === 2 || !code || !RETRYABLE_DATABASE_ERRORS.has(code)) throw error;
        }
      }
      throw new Error("Unreachable server-link database retry state.");
    },

    async get(serverId: string): Promise<StoredHeartbeat | null> {
      const connection = await acquireConnection(pool);
      try {
        const [rows] = await query<SnapshotRow[]>(
          connection,
          `SELECT server_id, session_id, session_started_at, sequence, captured_at, map,
                  max_players, players, bots, roster, received_at
             FROM ${tableName}
            WHERE server_id = ?
            LIMIT 1`,
          [serverId],
        );
        return rows[0] ? storedHeartbeat(rows[0]) : null;
      } finally {
        connection.release();
      }
    },
  };
}

async function portalRepository() {
  const { getPortalDatabasePool } = await import("../data/database-pools.ts");
  const pool = getPortalDatabasePool();
  if (!pool) throw new Error("Portal database is unavailable.");
  return createServerLinkRepository(pool);
}

export async function saveHeartbeat(heartbeat: Heartbeat): Promise<boolean> {
  return (await portalRepository()).save(heartbeat);
}

export async function getStoredHeartbeat(serverId: string): Promise<StoredHeartbeat | null> {
  return (await portalRepository()).get(serverId);
}
