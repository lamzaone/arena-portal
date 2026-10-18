import "server-only";

import type { RowDataPacket } from "mysql2/promise";
import { getGameDatabasePool } from "./database-pools";
import type { ModerationRecord } from "./portal-repository";
import { isIndividualSteamId64 } from "../steam/steam-id.ts";

export type ProfileHistoryPage<T> = { available: boolean; records: T[]; total: number; page: number; pageSize: number };
export type ProfileCommunicationRecord = ModerationRecord & { kind: "Gag" | "Mute" };
export type PlayerModerationHistory = { bans: ProfileHistoryPage<ModerationRecord>; sanctions: ProfileHistoryPage<ProfileCommunicationRecord> };
type HistoryRow = RowDataPacket & { Id: number; Reason: string; AdminSteamId64: string; AdminName: string; ExpiresAt: number; Length: number; CreatedAt: number; SanctionKind?: number };

function unixSeconds(value: unknown) {
  const time = Number(value ?? 0);
  return time > 10_000_000_000 ? Math.floor(time / 1_000) : time;
}

function moderationRecord(row: HistoryRow): ModerationRecord {
  const adminSteamId = String(row.AdminSteamId64 ?? "0");
  return {
    id: Number(row.Id),
    reason: row.Reason,
    adminName: row.AdminName || "Console",
    adminSteamId: isIndividualSteamId64(adminSteamId) ? adminSteamId : null,
    expiresAt: unixSeconds(row.ExpiresAt),
    length: Number(row.Length),
    createdAt: unixSeconds(row.CreatedAt),
  };
}

async function historyPage<T>(steamId: string, table: "bans" | "sanctions", pageInput: number, normalize: (row: HistoryRow) => T): Promise<ProfileHistoryPage<T>> {
  const pageSize = 10;
  const empty = { available: false, records: [] as T[], total: 0, page: 1, pageSize };
  const pool = getGameDatabasePool();
  if (!pool) return empty;
  const where = `SteamId64 = ?${table === "sanctions" ? " AND SanctionKind IN (1, 2)" : ""}`;
  try {
    const [counts] = await pool.query<(RowDataPacket & { total: number })[]>(`SELECT COUNT(*) AS total FROM ${table} WHERE ${where}`, [steamId]);
    const total = Number(counts[0]?.total ?? 0);
    const requested = Number.isFinite(pageInput) ? Math.max(1, Math.floor(pageInput)) : 1;
    const page = Math.min(requested, Math.max(1, Math.ceil(total / pageSize)));
    const [rows] = await pool.query<HistoryRow[]>(`SELECT Id, Reason, AdminSteamId64, AdminName, ExpiresAt, Length, CreatedAt${table === "sanctions" ? ", SanctionKind" : ""} FROM ${table} WHERE ${where} ORDER BY CreatedAt DESC, Id DESC LIMIT ? OFFSET ?`, [steamId, pageSize, (page - 1) * pageSize]);
    return { available: true, records: rows.map(normalize), total, page, pageSize };
  } catch {
    return empty;
  }
}

/** Private profile history. The profile route verifies ownership before calling this repository. */
export async function getPlayerModerationHistory(steamId: string, bansPage = 1, commsPage = 1): Promise<PlayerModerationHistory> {
  const [bans, sanctions] = await Promise.all([
    historyPage(steamId, "bans", bansPage, moderationRecord),
    historyPage(steamId, "sanctions", commsPage, (row): ProfileCommunicationRecord => ({ ...moderationRecord(row), kind: Number(row.SanctionKind) === 1 ? "Gag" : "Mute" })),
  ]);
  return { bans, sanctions };
}
