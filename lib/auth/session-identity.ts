import "server-only";

import type { RowDataPacket } from "mysql2/promise";
import { getPortalDatabasePool } from "@/lib/data/database-pools";
import { readSessionTokenHash } from "./session-cookie";

type SessionIdentityRow = RowDataPacket & { steam_id: string; expires_at: number | string };

/** Authentication for thumbnail resources; profile and staff flows retain getSession. */
export async function getSessionIdentity() {
  const tokenHash = await readSessionTokenHash();
  if (!tokenHash) return null;
  try {
    const pool = getPortalDatabasePool();
    if (!pool) return null;
    // The token hash is the primary key. Re-read it on every request so logout
    // and expiry are immediate, without joins or contended last_seen writes.
    const [rows] = await pool.query<SessionIdentityRow[]>(
      "SELECT steam_id, expires_at FROM portal_sessions WHERE token_hash = ? AND expires_at > ? LIMIT 1",
      [tokenHash, Date.now()],
    );
    const session = rows[0];
    if (!session || !/^7656119\d{10}$/.test(session.steam_id)) return null;
    const expiresAt = Number(session.expires_at);
    if (!Number.isSafeInteger(expiresAt) || expiresAt <= Date.now()) return null;
    return { steamId: session.steam_id, expiresAt, tokenHash };
  } catch {
    return null;
  }
}
