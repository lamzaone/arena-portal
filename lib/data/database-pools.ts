import "server-only";

import mysql, { type Pool } from "mysql2/promise";

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
    // SteamID64 values exceed JavaScript's safe integer range. Returning
    // BIGINT columns as strings prevents mysql2 from rounding player IDs.
    supportBigNumbers: true,
    bigNumberStrings: true,
  });
  registry.pools.set(connectionUrl, pool);
  return pool;
}

export function getGameDatabasePool() {
  return getPool(process.env.GAME_DATABASE_URL);
}

export function getPortalDatabasePool() {
  return getPool(process.env.PORTAL_DATABASE_URL);
}
