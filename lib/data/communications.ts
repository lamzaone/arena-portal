import "server-only";
import type { RowDataPacket } from "mysql2/promise";
import { getGameDatabasePool } from "./database-pools";

/** Public communication history. Connection details and staff notes never leave this boundary. */
export type CommunicationRecord = {
  id: number; steamId: string; playerName: string; kind: "Gag" | "Mute";
  expiresAt: number; length: number; reason: string; adminSteamId: string;
  adminName: string; global: boolean; createdAt: number;
};
export type CommunicationsPage = { available: boolean; records: CommunicationRecord[]; total: number; page: number; pageSize: number };
export type CommunicationEvent = Omit<CommunicationRecord, "kind"> & { kind: "Gag" | "Mute" | "Silence"; recordIds: number[] };
type CommunicationRow = RowDataPacket & {
  Id: number; SteamId64: string; PlayerName: string; SanctionKind: number;
  ExpiresAt: number; Length: number; Reason: string; AdminSteamId64: string;
  AdminName: string; GlobalSanction: number | boolean; CreatedAt: number;
};

function unixSeconds(value: unknown) {
  const timestamp = Number(value ?? 0);
  return timestamp > 10_000_000_000 ? Math.floor(timestamp / 1_000) : timestamp;
}

export async function getCommunicationsPage(pageInput = 1, query = "", pageSizeInput = 25): Promise<CommunicationsPage> {
  const page = Number.isFinite(pageInput) ? Math.min(100000, Math.max(1, Math.floor(pageInput))) : 1;
  const pageSize = Number.isFinite(pageSizeInput) && pageSizeInput >= 1 ? Math.min(100, Math.floor(pageSizeInput)) : 25;
  const empty: CommunicationsPage = { available: false, records: [], total: 0, page, pageSize };
  const pool = getGameDatabasePool();
  if (!pool) return empty;
  const search = query.trim().slice(0, 64);
  const filter = `WHERE SanctionKind IN (1, 2)${search ? " AND (PlayerName LIKE ? OR CAST(SteamId64 AS CHAR) LIKE ?)" : ""}`;
  const values = search ? [`%${search}%`, `%${search}%`] : [];
  try {
    const [[counts], [rows]] = await Promise.all([
      pool.query<Array<RowDataPacket & { total: number }>>(`SELECT COUNT(*) AS total FROM sanctions ${filter}`, values),
      pool.query<CommunicationRow[]>(
        `SELECT Id, SteamId64, PlayerName, SanctionKind, ExpiresAt, Length, Reason, AdminSteamId64, AdminName, GlobalSanction, CreatedAt FROM sanctions ${filter} ORDER BY CreatedAt DESC, Id DESC LIMIT ? OFFSET ?`,
        [...values, pageSize, (page - 1) * pageSize],
      ),
    ]);
    return {
      available: true,
      records: rows.map((row) => ({
        id: Number(row.Id), steamId: String(row.SteamId64), playerName: row.PlayerName || "Unknown player",
        kind: Number(row.SanctionKind) === 1 ? "Gag" : "Mute", expiresAt: unixSeconds(row.ExpiresAt),
        length: Number(row.Length), reason: row.Reason, adminSteamId: String(row.AdminSteamId64 ?? "0"),
        adminName: row.AdminName || "Console", global: Boolean(row.GlobalSanction), createdAt: unixSeconds(row.CreatedAt),
      })),
      total: Number(counts[0]?.total ?? 0), page, pageSize,
    };
  } catch { return empty; }
}

/** Pair only complementary records with identical event details, consuming each record once.
 * Pagination remains over raw restrictions; a pair split across pages keeps its individual labels. */
export function pairCommunicationRecords(records: CommunicationRecord[]): CommunicationEvent[] {
  const used = new Set<number>();
  const eventKey = (record: CommunicationRecord) => JSON.stringify([
    record.steamId, record.playerName, record.reason, record.adminSteamId, record.adminName,
    record.createdAt, record.expiresAt, record.length, record.global,
  ]);
  return records.flatMap<CommunicationEvent>((record, index) => {
    if (used.has(index)) return [];
    used.add(index);
    const key = eventKey(record);
    const partner = records.findIndex((candidate, candidateIndex) => candidateIndex > index && !used.has(candidateIndex) && candidate.kind !== record.kind && eventKey(candidate) === key);
    if (partner < 0) return [{ ...record, recordIds: [record.id] }];
    used.add(partner);
    return [{ ...record, kind: "Silence", recordIds: [record.id, records[partner].id] }];
  });
}
