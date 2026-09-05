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
  time_left_seconds: number | null;
  roster: string | RosterPlayer[];
  received_at: Date;
};

class DatabaseTimeoutError extends Error {}

type RepositoryOptions = {
  databaseTimeoutMs?: number;
};

type ManagedConnection = {
  connection: PoolConnection;
  discarded: boolean;
};

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

function requestedDatabaseTimeout(options: RepositoryOptions): number {
  const timeout = options.databaseTimeoutMs ?? DATABASE_TIMEOUT_MS;
  if (!Number.isSafeInteger(timeout) || timeout <= 0) {
    throw new Error("databaseTimeoutMs must be a positive integer.");
  }
  return timeout;
}

function discardConnection(state: ManagedConnection): void {
  if (state.discarded) return;
  state.discarded = true;
  state.connection.destroy();
}

async function acquireConnection(pool: Pool, timeoutMs: number): Promise<ManagedConnection> {
  const acquisition = pool.getConnection();
  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    const connection = await Promise.race([
      acquisition,
      new Promise<never>((_, reject) => {
        timer = setTimeout(() => reject(new DatabaseTimeoutError("Database connection timed out.")), timeoutMs);
      }),
    ]);
    return { connection, discarded: false };
  } catch (error) {
    if (error instanceof DatabaseTimeoutError) {
      // An acquisition that finishes after its caller has timed out may hand us
      // a connection with commands queued by a previous request. Do not put
      // that uncertain connection back into the pool.
      void acquisition.then((connection) => connection.destroy(), () => undefined);
    }
    throw error;
  } finally {
    if (timer) clearTimeout(timer);
  }
}

async function query<T extends RowDataPacket[]>(
  state: ManagedConnection,
  sql: string,
  values: unknown[],
  timeoutMs: number,
) {
  if (state.discarded) throw new DatabaseTimeoutError("Database connection was discarded.");
  let timer: ReturnType<typeof setTimeout> | undefined;
  const operation = state.connection.query<T>({ sql, values, timeout: timeoutMs });
  try {
    return await Promise.race([
      operation,
      new Promise<never>((_, reject) => {
        timer = setTimeout(() => {
          reject(new DatabaseTimeoutError("Database query timed out."));
          discardConnection(state);
        }, timeoutMs);
      }),
    ]);
  } catch (error) {
    if (databaseCode(error) === "PROTOCOL_SEQUENCE_TIMEOUT") {
      discardConnection(state);
      throw new DatabaseTimeoutError("Database query timed out.", { cause: error });
    }
    throw error;
  } finally {
    if (timer) clearTimeout(timer);
  }
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
      ...(Number.isSafeInteger(player.connectedSeconds) && player.connectedSeconds >= 0
        ? { connectedSeconds: player.connectedSeconds as number } : {}),
      ...(Number.isSafeInteger(player.score) ? { score: player.score as number } : {}),
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
      timeLeftSeconds: row.time_left_seconds ?? null,
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

async function saveAttempt(
  pool: Pool,
  tableName: string,
  heartbeat: Heartbeat,
  timeoutMs: number,
): Promise<boolean> {
  const state = await acquireConnection(pool, timeoutMs);
  let transactionStarted = false;
  try {
    await query(state, "SET SESSION innodb_lock_wait_timeout = 5", [], timeoutMs);
    await query(state, "START TRANSACTION", [], timeoutMs);
    transactionStarted = true;
    const [rows] = await query<SnapshotRow[]>(
      state,
      `SELECT server_id, session_id, session_started_at, sequence, captured_at, map,
              max_players, players, bots, time_left_seconds, roster, received_at
         FROM ${tableName}
        WHERE server_id = ?
       FOR UPDATE`,
      [heartbeat.serverId],
      timeoutMs,
    );

    if (rows[0] && !shouldAcceptHeartbeat(rowOrder(rows[0]), heartbeat)) {
      await query(state, "COMMIT", [], timeoutMs);
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
      heartbeat.timeLeftSeconds ?? null,
    ];
    if (rows[0]) {
      await query(
        state,
        `UPDATE ${tableName}
            SET session_id = ?, session_started_at = ?, sequence = ?, captured_at = ?, map = ?,
                max_players = ?, players = ?, bots = ?, roster = ?, time_left_seconds = ?, received_at = UTC_TIMESTAMP(3)
          WHERE server_id = ?`,
        [values[1], values[2], values[3], values[4], values[5], values[6], values[7], values[8], values[9], values[10], values[0]],
        timeoutMs,
      );
    } else {
      await query(
        state,
        `INSERT INTO ${tableName}
          (server_id, session_id, session_started_at, sequence, captured_at, map,
           max_players, players, bots, roster, time_left_seconds, received_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, UTC_TIMESTAMP(3))`,
        values,
        timeoutMs,
      );
    }
    await query(state, "COMMIT", [], timeoutMs);
    transactionStarted = false;
    return true;
  } catch (error) {
    if (transactionStarted && !state.discarded) {
      await query(state, "ROLLBACK", [], timeoutMs).catch(() => undefined);
    }
    throw error;
  } finally {
    if (!state.discarded) state.connection.release();
  }
}

export function createServerLinkRepository(
  pool: Pool,
  requestedTableName = SNAPSHOT_TABLE,
  options: RepositoryOptions = {},
) {
  const tableName = safeTableName(requestedTableName);
  const timeoutMs = requestedDatabaseTimeout(options);
  return {
    async save(heartbeat: Heartbeat): Promise<boolean> {
      for (let attempt = 0; attempt < 3; attempt += 1) {
        try {
          return await saveAttempt(pool, tableName, heartbeat, timeoutMs);
        } catch (error) {
          const code = databaseCode(error);
          if (attempt === 2 || !code || !RETRYABLE_DATABASE_ERRORS.has(code)) throw error;
        }
      }
      throw new Error("Unreachable server-link database retry state.");
    },

    async get(serverId: string): Promise<StoredHeartbeat | null> {
      const state = await acquireConnection(pool, timeoutMs);
      try {
        const [rows] = await query<SnapshotRow[]>(
          state,
          `SELECT server_id, session_id, session_started_at, sequence, captured_at, map,
                  max_players, players, bots, time_left_seconds, roster, received_at
             FROM ${tableName}
            WHERE server_id = ?
            LIMIT 1`,
          [serverId],
          timeoutMs,
        );
        return rows[0] ? storedHeartbeat(rows[0]) : null;
      } finally {
        if (!state.discarded) state.connection.release();
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
