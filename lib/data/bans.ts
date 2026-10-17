import "server-only";
import type { RowDataPacket } from "mysql2/promise";
import { getGameDatabasePool } from "./database-pools";

/** Public ban history. Never add connection details or private staff notes. */
export type BanRecord = {
  id: number; steamId: string; playerName: string; expiresAt: number;
  length: number; reason: string; adminSteamId: string; adminName: string;
  global: boolean; createdAt: number;
};
export type BansPage = { available: boolean; bans: BanRecord[]; total: number; page: number; pageSize: number };
type BanRow = RowDataPacket & {
  Id: number; SteamId64: string; PlayerName: string; ExpiresAt: number;
  Length: number; Reason: string; AdminSteamId64: string; AdminName: string;
  GlobalBan: number | boolean; CreatedAt: number;
};

function unixSeconds(value: unknown) {
  const timestamp = Number(value ?? 0);
  return timestamp > 10_000_000_000 ? Math.floor(timestamp / 1_000) : timestamp;
}

/** Shared by the staff workspace and the public, read-only ban list. */
export async function getBansPage(pageInput = 1, query = "", pageSizeInput = 25): Promise<BansPage> {
  const page = Number.isFinite(pageInput) ? Math.min(100000, Math.max(1, Math.floor(pageInput))) : 1;
  const pageSize = Number.isFinite(pageSizeInput) && pageSizeInput >= 1 ? Math.min(100, Math.floor(pageSizeInput)) : 25;
  const empty: BansPage = { available: false, bans: [], total: 0, page, pageSize };
  const pool = getGameDatabasePool();
  if (!pool) return empty;
  const search = query.trim().slice(0, 64);
  const filter = search ? "WHERE PlayerName LIKE ? OR CAST(SteamId64 AS CHAR) LIKE ?" : "";
  const values = search ? [`%${search}%`, `%${search}%`] : [];
  try {
    const [[counts], [rows]] = await Promise.all([
      pool.query<(RowDataPacket & { total: number })[]>(`SELECT COUNT(*) AS total FROM bans ${filter}`, values),
      pool.query<BanRow[]>(
        `SELECT Id, SteamId64, PlayerName, ExpiresAt, Length, Reason, AdminSteamId64, AdminName, GlobalBan, CreatedAt FROM bans ${filter} ORDER BY CreatedAt DESC LIMIT ? OFFSET ?`,
        [...values, pageSize, (page - 1) * pageSize],
      ),
    ]);
    return {
      available: true,
      bans: rows.map(row => ({
        id: Number(row.Id), steamId: String(row.SteamId64), playerName: row.PlayerName || "Unknown player",
        expiresAt: unixSeconds(row.ExpiresAt), length: Number(row.Length), reason: row.Reason,
        adminSteamId: String(row.AdminSteamId64), adminName: row.AdminName || "Console",
        global: Boolean(row.GlobalBan), createdAt: unixSeconds(row.CreatedAt),
      })),
      total: Number(counts[0]?.total ?? 0), page, pageSize,
    };
  } catch {
    return empty;
  }
}
