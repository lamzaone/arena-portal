import "server-only";
import type { RowDataPacket, ResultSetHeader } from "mysql2/promise";
import { getPortalDatabasePool } from "./database-pools";
import { configuredGameServerGuid } from "../admin/server-scope";
import { validateWarningInput } from "../moderation/warning-policy";

export type PlayerWarning = {
  id: string; steamId: string; playerName: string; reason: string;
  issuerSteamId: string; issuerName: string; issuedAt: number; expiresAt: number;
  revokedAt: number | null; acknowledgedAt: number | null; revokeReason: string | null;
};
type WarningRow = RowDataPacket & PlayerWarning;
const columns = "id, steam_id AS steamId, player_name AS playerName, reason, issuer_steam_id AS issuerSteamId, issuer_name AS issuerName, issued_at AS issuedAt, expires_at AS expiresAt, revoked_at AS revokedAt, acknowledged_at AS acknowledgedAt, revoke_reason AS revokeReason";

function normalize(row: WarningRow): PlayerWarning {
  return { ...row, issuedAt: Number(row.issuedAt), expiresAt: Number(row.expiresAt),
    revokedAt: row.revokedAt === null ? null : Number(row.revokedAt),
    acknowledgedAt: row.acknowledgedAt === null ? null : Number(row.acknowledgedAt) };
}

export async function getPlayerWarnings(steamId: string): Promise<PlayerWarning[]> {
  const pool = getPortalDatabasePool();
  if (!pool) return [];
  const [rows] = await pool.execute<WarningRow[]>(`SELECT ${columns} FROM portal_warnings WHERE steam_id = ? AND server_guid = ? ORDER BY issued_at DESC, id DESC LIMIT 100`, [steamId, configuredGameServerGuid()]);
  return rows.map(normalize);
}

export type PlayerWarningsPage = { warnings: PlayerWarning[]; total: number; page: number; pageSize: number };

/** Exact player/server pagination keeps older warnings reachable without sending an unbounded history. */
export async function getPlayerWarningsPage(steamId: string, pageInput = 1): Promise<PlayerWarningsPage> {
  const pageSize = 10;
  const pool = getPortalDatabasePool();
  if (!pool) return { warnings: [], total: 0, page: 1, pageSize };
  const values = [steamId, configuredGameServerGuid()];
  const where = "steam_id = ? AND server_guid = ?";
  const [counts] = await pool.execute<(RowDataPacket & { total: number })[]>(`SELECT COUNT(*) AS total FROM portal_warnings WHERE ${where}`, values);
  const total = Number(counts[0]?.total ?? 0);
  const requested = Number.isFinite(pageInput) ? Math.max(1, Math.floor(pageInput)) : 1;
  const page = Math.min(requested, Math.max(1, Math.ceil(total / pageSize)));
  const [rows] = await pool.execute<WarningRow[]>(`SELECT ${columns} FROM portal_warnings WHERE ${where} ORDER BY issued_at DESC, id DESC LIMIT ${pageSize} OFFSET ${(page - 1) * pageSize}`, values);
  return { warnings: rows.map(normalize), total, page, pageSize };
}

export async function getWarningsPage(query = "", page = 1) {
  const pool = getPortalDatabasePool();
  if (!pool) return { warnings: [] as PlayerWarning[], total: 0 };
  const search = `%${query.trim().slice(0, 100).replace(/[\\%_]/g, "\\$&")}%`;
  const values = [configuredGameServerGuid(), search, search];
  const where = "server_guid = ? AND (steam_id LIKE ? OR player_name LIKE ?)";
  const [counts] = await pool.execute<(RowDataPacket & { total: number })[]>(`SELECT COUNT(*) AS total FROM portal_warnings WHERE ${where}`, values);
  const offset = (Math.max(1, Math.min(page, 100000)) - 1) * 30;
  const [rows] = await pool.execute<WarningRow[]>(`SELECT ${columns} FROM portal_warnings WHERE ${where} ORDER BY issued_at DESC, id DESC LIMIT 30 OFFSET ${offset}`, values);
  return { warnings: rows.map(normalize), total: Number(counts[0]?.total ?? 0) };
}

export async function issuePlayerWarning(input: { id: string; steamId: string; playerName: string; reason: string; durationMinutes: number; serverGuid: string; actorSteamId: string; actorName: string }) {
  validateWarningInput(input);
  const pool = getPortalDatabasePool();
  if (!pool) throw new Error("storage");
  const connection = await pool.getConnection();
  try {
    await connection.beginTransaction();
    const now = Date.now();
    // Primary key is the form's unique request token: retrying a successful form
    // cannot create another warning or audit event.
    await connection.execute("INSERT INTO portal_warnings (id, steam_id, player_name, server_guid, reason, issuer_steam_id, issuer_name, issued_at, expires_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)",
      [input.id, input.steamId, input.playerName.slice(0,128), input.serverGuid, input.reason.trim(), input.actorSteamId, input.actorName.slice(0,128), now, now + input.durationMinutes * 60000]);
    await connection.execute("INSERT INTO portal_audit_events (actor_type, actor_id, action, target_type, target_id, metadata) VALUES ('player', ?, 'staff.warning.issued', 'steam-player', ?, ?)", [input.actorSteamId, input.steamId, JSON.stringify({ warningId: input.id, reason: input.reason.trim(), expiresAt: now + input.durationMinutes * 60000, serverGuid: input.serverGuid })]);
    await connection.commit();
  } catch (error) {
    await connection.rollback();
    if ((error as { code?: string }).code === "ER_DUP_ENTRY") {
      const [rows] = await connection.execute<RowDataPacket[]>("SELECT id FROM portal_warnings WHERE id = ? AND steam_id = ? AND issuer_steam_id = ? AND server_guid = ? AND reason = ?", [input.id, input.steamId, input.actorSteamId, input.serverGuid, input.reason.trim()]);
      if (rows.length) return;
    }
    throw error;
  } finally { connection.release(); }
}

export async function getWarningTarget(id: string) {
  const pool = getPortalDatabasePool();
  if (!pool) throw new Error("storage");
  const [rows] = await pool.execute<(RowDataPacket & { steam_id: string })[]>("SELECT steam_id FROM portal_warnings WHERE id = ? AND server_guid = ?", [id, configuredGameServerGuid()]);
  return rows[0]?.steam_id;
}

export async function revokePlayerWarning(id: string, actorSteamId: string, reason: string) {
  const pool = getPortalDatabasePool();
  if (!pool) throw new Error("storage");
  const connection = await pool.getConnection();
  try {
    await connection.beginTransaction();
    const [result] = await connection.execute<ResultSetHeader>("UPDATE portal_warnings SET revoked_at = ?, revoked_by = ?, revoke_reason = ? WHERE id = ? AND server_guid = ? AND revoked_at IS NULL AND expires_at > ?", [Date.now(), actorSteamId, reason, id, configuredGameServerGuid(), Date.now()]);
    if (result.affectedRows) await connection.execute("INSERT INTO portal_audit_events (actor_type, actor_id, action, target_type, target_id, metadata) VALUES ('player', ?, 'staff.warning.revoked', 'warning', ?, ?)", [actorSteamId, id, JSON.stringify({ reason })]);
    await connection.commit();
  } catch (error) { await connection.rollback(); throw error; }
  finally { connection.release(); }
}
