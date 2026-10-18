import type { RowDataPacket } from "mysql2/promise";
import { getAdminAccess } from "@/lib/admin/access";
import { getSession } from "@/lib/auth/session";
import { getGameDatabasePool, getPortalDatabasePool } from "@/lib/data/database-pools";
import { isIndividualSteamId64 } from "../../../../../lib/steam/steam-id.ts";

const headers = { "cache-control": "private, no-store" };

function jobPayload(value: unknown): Record<string, unknown> | null {
  try {
    const parsed = typeof value === "string" ? JSON.parse(value) : Buffer.isBuffer(value) ? JSON.parse(value.toString("utf8")) : value;
    return parsed && typeof parsed === "object" && !Array.isArray(parsed) ? parsed as Record<string, unknown> : null;
  } catch { return null; }
}

/** Native AddBan/AddSanction and unban APIs persist asynchronously after the
 * bridge marks the outbox complete. Confirm the durable state separately. */
async function nativeStateConfirmed(row: RowDataPacket, action: string, actorSteamId: string) {
  // Kick executes against the exact connected player before bridge completion.
  if (action === "kick") return true;
  if (!["ban", "unban", "gag", "mute", "silence"].includes(action)) return false;
  const payload = jobPayload(row.payload);
  const steamId = String(row.target_steam_id ?? "");
  if (!payload || !isIndividualSteamId64(steamId) || payload.steamId !== steamId || payload.actorSteamId !== actorSteamId) return false;
  const game = getGameDatabasePool();
  if (!game) return false;
  const now = Date.now();

  if (action === "unban") {
    // ApplyUnban calls FindBans(target, Active) without a server/type filter.
    // Confirm that same scope; one remaining active row means removal is pending.
    const [active] = await game.query<RowDataPacket[]>("SELECT Id FROM bans WHERE SteamId64 = ? AND (ExpiresAt = 0 OR ExpiresAt > ?) LIMIT 1", [steamId, now]);
    return active.length === 0;
  }

  const server = typeof payload.serverGuid === "string" ? payload.serverGuid : "";
  const reason = typeof payload.reason === "string" ? payload.reason : "";
  const minutes = payload.durationMinutes;
  const queuedAt = typeof payload.queuedAt === "string" && /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/.test(payload.queuedAt) ? Date.parse(payload.queuedAt) : NaN;
  if (!/^[0-9a-f]{8}-(?:[0-9a-f]{4}-){3}[0-9a-f]{12}$/i.test(server) || !reason || !Number.isSafeInteger(minutes) || typeof minutes !== "number" || minutes < 0 || minutes > 525_600 || !Number.isFinite(queuedAt) || queuedAt > now) return false;
  const length = minutes * 60_000;
  // Native timestamps and lengths use milliseconds. Exact queuedAt prevents an
  // older identical restriction from satisfying this new job. Legacy jobs lack
  // that precision and remain unconfirmed rather than matching an old record.
  const filter = "SteamId64 = ? AND AdminSteamId64 = ? AND Reason = ? AND Server = ? AND Length = ? AND CreatedAt >= ? AND CreatedAt <= ?";
  const values = [steamId, actorSteamId, reason, server, length, queuedAt, now];
  const expiry = length === 0 ? "ExpiresAt = 0" : "ExpiresAt >= ? AND ExpiresAt <= ?";
  const expiryValues = length === 0 ? [] : [queuedAt + length, now + length];
  if (action === "ban") {
    const [bans] = await game.query<RowDataPacket[]>(`SELECT Id FROM bans WHERE ${filter} AND BanType = 1 AND GlobalBan = 0 AND ${expiry} LIMIT 1`, [...values, ...expiryValues]);
    return bans.length > 0;
  }

  const kinds = action === "silence" ? [1, 2] : action === "gag" ? [1] : [2];
  const [sanctions] = await game.query<(RowDataPacket & { SanctionKind: number })[]>(`SELECT DISTINCT SanctionKind FROM sanctions WHERE ${filter} AND SanctionType = 1 AND GlobalSanction = 0 AND ${expiry} AND SanctionKind IN (${kinds.map(() => "?").join(", ")})`, [...values, ...expiryValues, ...kinds]);
  const persistedKinds = new Set(sanctions.map(record => Number(record.SanctionKind)));
  return kinds.every(kind => persistedKinds.has(kind));
}

export async function GET(request: Request) {
  const session = await getSession();
  if (!session) return Response.json({ error: "Sign in to check this action." }, { status: 401, headers });
  if (!(await getAdminAccess(session.steamId)).isAdmin) return Response.json({ error: "Staff access required." }, { status: 403, headers });
  const value = new URL(request.url).searchParams.get("job") ?? "";
  const id = Number(value);
  if (!/^[1-9]\d*$/.test(value) || !Number.isSafeInteger(id)) return Response.json({ error: "Invalid action." }, { status: 400, headers });

  try {
    const pool = getPortalDatabasePool();
    if (!pool) throw new Error("unavailable");
    const [rows] = await pool.execute<RowDataPacket[]>(
      "SELECT status, event_type, payload, target_steam_id FROM portal_outbox WHERE id = ? AND event_type LIKE 'moderation.%' AND JSON_UNQUOTE(JSON_EXTRACT(payload, '$.actorSteamId')) = ? LIMIT 1",
      [id, session.steamId],
    );
    const row = rows[0];
    if (!row) return Response.json({ error: "Action not found." }, { status: 404, headers });
    let status = ["pending", "processing", "completed", "failed"].includes(row.status) ? row.status : "pending";
    const action = String(row.event_type).slice("moderation.".length);
    if (status === "completed" && !(await nativeStateConfirmed(row, action, session.steamId))) status = "processing";
    return Response.json({ status, action }, { headers });
  } catch {
    return Response.json({ error: "Action confirmation is temporarily unavailable." }, { status: 503, headers });
  }
}
