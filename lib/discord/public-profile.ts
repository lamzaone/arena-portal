import "server-only";

import type { RowDataPacket } from "mysql2/promise";
import { getPortalDatabasePool } from "@/lib/data/database-pools";
import { isIndividualSteamId64 } from "@/lib/steam/steam-id";

export async function getPublicDiscordProfileUrl(steamId: string): Promise<string | null> {
  if (!isIndividualSteamId64(steamId)) return null;
  const pool = getPortalDatabasePool();
  if (!pool) return null;
  try {
    const [rows] = await pool.query<Array<RowDataPacket & { discord_user_id: string }>>(
      "SELECT discord_user_id FROM portal_discord_links WHERE steam_id = ? LIMIT 1",
      [steamId],
    );
    const discordId = String(rows[0]?.discord_user_id ?? "");
    return /^[1-9]\d{16,19}$/.test(discordId)
      ? `https://discord.com/users/${discordId}`
      : null;
  } catch (error) {
    if ((error as { code?: string }).code !== "ER_NO_SUCH_TABLE") {
      console.error("Public Discord profile lookup unavailable.");
    }
    return null;
  }
}
