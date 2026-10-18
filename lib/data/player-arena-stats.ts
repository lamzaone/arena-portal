import "server-only";
import type { RowDataPacket } from "mysql2/promise";
import { getGameDatabasePool } from "./database-pools";
import { arenaStatistics } from "../moderation/arena-statistics";
import { isIndividualSteamId64 } from "../steam/steam-id";

export type PlayerArenaStats = ReturnType<typeof arenaStatistics>;

export async function getPlayerArenaStats(steamId: string): Promise<PlayerArenaStats | null> {
  const pool = getGameDatabasePool();
  if (!pool || !isIndividualSteamId64(steamId)) return null;
  try {
    const [rows] = await pool.query<RowDataPacket[]>(
      "SELECT round_win, round_lose, assists, shoots, hits, damage, games_played FROM lvl_base WHERE steam = ? LIMIT 1", [steamId]);
    if (!rows[0]) return null;
    // Current K4 stores its killstreak only in memory. Display a historical
    // value only on installations that actually persist that counter.
    const [columns] = await pool.query<RowDataPacket[]>(
      "SELECT COLUMN_NAME FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'lvl_base' AND COLUMN_NAME = 'highest_killstreak'").catch(() => [[] as RowDataPacket[], []]);
    if (columns.length) {
      const [streak] = await pool.query<RowDataPacket[]>("SELECT highest_killstreak FROM lvl_base WHERE steam = ? LIMIT 1", [steamId]);
      rows[0].highest_killstreak = streak[0]?.highest_killstreak;
    }
    return arenaStatistics(rows[0]);
  } catch { return null; }
}
