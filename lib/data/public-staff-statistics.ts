import "server-only";

import type { Pool, RowDataPacket } from "mysql2/promise";
import { configuredGameServerGuid } from "../admin/server-scope";
import { getGameDatabasePool, getPortalDatabasePool } from "./database-pools";
import type { StaffActivityStatistics } from "../staff-directory";

type AggregateRow = RowDataPacket & { steam_id: string; total: number; gags: number; mutes: number; silences: number };
const count = (value: unknown) => Math.max(0, Math.floor(Number(value) || 0));

/** Public totals only. Never serialize moderation reasons, targets, or bridge payloads. */
export async function getPublicStaffStatistics(steamIds: readonly string[]): Promise<Record<string, StaffActivityStatistics>> {
  const ids = [...new Set(steamIds)].filter(id => /^7656119\d{10}$/.test(id));
  const result: Record<string, StaffActivityStatistics> = {};
  for (const id of ids) result[id] = { bansIssued: null, communications: null, kicksIssued: null, warningsIssued: null, playtimeSeconds: null };
  if (!ids.length) return result;
  const placeholders = ids.map(() => "?").join(", ");
  const game = getGameDatabasePool(), portal = getPortalDatabasePool();
  async function aggregate(pool: Pool | null, sql: string, values: readonly string[], apply: (rows: AggregateRow[]) => void) {
    if (!pool) return;
    try { const [rows] = await pool.query<AggregateRow[]>(sql, [...values]); apply(rows); }
    catch { /* Each optional source fails independently; unavailable stays null. */ }
  }
  await Promise.all([
    aggregate(game, `SELECT CAST(AdminSteamId64 AS CHAR) AS steam_id, COUNT(*) AS total FROM bans WHERE AdminSteamId64 IN (${placeholders}) GROUP BY AdminSteamId64`, ids, rows => {
      for (const id of ids) result[id].bansIssued = 0;
      for (const row of rows) if (result[row.steam_id]) result[row.steam_id].bansIssued = count(row.total);
    }),
    // Pair only complementary records with identical event details, once each.
    // Binary grouping preserves exact event details on case-insensitive native schemas.
    // Grouped counts make this bounded even for staff with extensive history.
    aggregate(game, `SELECT steam_id, SUM(gag_count - LEAST(gag_count, mute_count)) AS gags, SUM(mute_count - LEAST(gag_count, mute_count)) AS mutes, SUM(LEAST(gag_count, mute_count)) AS silences FROM (SELECT CAST(AdminSteamId64 AS CHAR) AS steam_id, SUM(CASE WHEN SanctionKind = 1 THEN 1 ELSE 0 END) AS gag_count, SUM(CASE WHEN SanctionKind = 2 THEN 1 ELSE 0 END) AS mute_count FROM sanctions WHERE AdminSteamId64 IN (${placeholders}) AND SanctionKind IN (1, 2) GROUP BY AdminSteamId64, SteamId64, CAST(PlayerName AS BINARY), CAST(AdminName AS BINARY), CAST(Reason AS BINARY), CreatedAt, ExpiresAt, Length, GlobalSanction) AS events GROUP BY steam_id`, ids, rows => {
      for (const id of ids) result[id].communications = { gags: 0, mutes: 0, silences: 0 };
      for (const row of rows) if (result[row.steam_id]) result[row.steam_id].communications = { gags: count(row.gags), mutes: count(row.mutes), silences: count(row.silences) };
    }),
    aggregate(game, `SELECT steam AS steam_id, MAX(playtime) AS total FROM lvl_base WHERE steam IN (${placeholders}) GROUP BY steam`, ids, rows => {
      for (const id of ids) result[id].playtimeSeconds = 0;
      for (const row of rows) if (result[row.steam_id]) result[row.steam_id].playtimeSeconds = count(row.total);
    }),
    aggregate(portal, `SELECT issuer_steam_id AS steam_id, COUNT(*) AS total FROM portal_warnings WHERE server_guid = ? AND issuer_steam_id IN (${placeholders}) GROUP BY issuer_steam_id`, [configuredGameServerGuid(), ...ids], rows => {
      for (const id of ids) result[id].warningsIssued = 0;
      for (const row of rows) if (result[row.steam_id]) result[row.steam_id].warningsIssued = count(row.total);
    }),
    aggregate(portal, `SELECT JSON_UNQUOTE(JSON_EXTRACT(payload, '$.actorSteamId')) AS steam_id, COUNT(*) AS total FROM portal_outbox WHERE event_type = 'moderation.kick' AND status = 'completed' AND JSON_UNQUOTE(JSON_EXTRACT(payload, '$.serverGuid')) = ? AND JSON_UNQUOTE(JSON_EXTRACT(payload, '$.actorSteamId')) IN (${placeholders}) GROUP BY JSON_UNQUOTE(JSON_EXTRACT(payload, '$.actorSteamId'))`, [configuredGameServerGuid(), ...ids], rows => {
      for (const id of ids) result[id].kicksIssued = 0;
      for (const row of rows) if (result[row.steam_id]) result[row.steam_id].kicksIssued = count(row.total);
    }),
  ]);
  return result;
}
