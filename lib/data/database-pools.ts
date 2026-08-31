import "server-only";

import mysql, { type Pool } from "mysql2/promise";

import {
  installMysqlUtcSessionInitializer,
  MYSQL_UTC_CLIENT_TIMEZONE,
} from "./mysql-utc-session";

type ArenaDatabasePoolRegistry = {
  pools: Map<string, Pool>;
};

const globalWithArenaPools = globalThis as typeof globalThis & {
  __arenaDatabasePoolRegistry?: ArenaDatabasePoolRegistry;
};

function connectionLimit() {
  const configured = Number(process.env.DATABASE_CONNECTION_LIMIT ?? 5);
  if (!Number.isInteger(configured)) return 5;
  return Math.min(Math.max(configured, 1), 20);
}

function getPool(connectionUrl: string | undefined) {
  if (!connectionUrl) return null;

  const registry =
    globalWithArenaPools.__arenaDatabasePoolRegistry ??=
      { pools: new Map<string, Pool>() };
  const existing = registry.pools.get(connectionUrl);
  if (existing) return existing;

  const pool = mysql.createPool({
    uri: connectionUrl,
    connectionLimit: connectionLimit(),
    enableKeepAlive: true,
    namedPlaceholders: false,
    // Portal TIMESTAMP columns and Arena DATETIME(6) columns both represent
    // UTC instants. Keep mysql2's Date encoding/decoding independent of the
    // host process's local timezone.
    timezone: MYSQL_UTC_CLIENT_TIMEZONE,
    // SteamID64 values exceed JavaScript's safe integer range. Returning
    // BIGINT columns as strings prevents mysql2 from rounding player IDs.
    supportBigNumbers: true,
    bigNumberStrings: true,
  });
  // The promise pool relays raw core connections through its event emitter.
  // Register on the core pool so the callback-style SET command is guaranteed
  // to be queued before the connection reaches application code.
  installMysqlUtcSessionInitializer(pool.pool);
  registry.pools.set(connectionUrl, pool);
  return pool;
}

export function getGameDatabasePool() {
  return getPool(process.env.GAME_DATABASE_URL);
}

export function getPortalDatabasePool() {
  return getPool(process.env.PORTAL_DATABASE_URL);
}
