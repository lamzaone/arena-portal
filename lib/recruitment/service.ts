import "server-only";

import type { RowDataPacket } from "mysql2/promise";
import { getGameDatabasePool, getPortalDatabasePool } from "@/lib/data/database-pools";
import { createStaffRecruitmentRepository } from "@/lib/data/staff-recruitment";
import { getSteamProfiles } from "@/lib/steam/profiles";

export function staffRecruitmentRepository() {
  const pool = getPortalDatabasePool();
  if (!pool) throw new Error("recruitment-unavailable");
  return createStaffRecruitmentRepository(pool);
}

async function gameRecord(steamId: string) {
  const pool = getGameDatabasePool();
  if (!pool) return null;
  try {
    const [rows] = await pool.query<Array<RowDataPacket & { name: string; playtime: number | string }>>(
      "SELECT name, playtime FROM lvl_base WHERE steam = ? LIMIT 1", [steamId],
    );
    if (!rows[0]) return { name: "", playtimeSeconds: 0 };
    const seconds = Number(rows[0].playtime);
    return { name: rows[0].name, playtimeSeconds: Number.isSafeInteger(seconds) && seconds >= 0 ? seconds : null };
  } catch {
    return null;
  }
}

export async function readRecruitmentPlaytime(steamId: string) {
  return (await gameRecord(steamId))?.playtimeSeconds ?? null;
}

export async function getRecruitmentPlayer(steamId: string) {
  const pool = getPortalDatabasePool();
  if (!pool) throw new Error("recruitment-unavailable");
  const [game, profiles, [links]] = await Promise.all([
    gameRecord(steamId), getSteamProfiles([steamId]),
    pool.query<Array<RowDataPacket & { discord_user_id: string }>>("SELECT discord_user_id FROM portal_discord_links WHERE steam_id = ? LIMIT 1", [steamId]),
  ]);
  const discordId = String(links[0]?.discord_user_id ?? "");
  const discordLinked = /^[1-9]\d{16,19}$/.test(discordId);
  return {
    nickname: profiles.get(steamId)?.name ?? game?.name ?? "",
    playtimeSeconds: game?.playtimeSeconds ?? null,
    discordLinked,
    discordProfile: discordLinked ? `https://discord.com/users/${discordId}` : "",
  };
}

export const recruitmentMessages: Record<string, string> = {
  submitted: "Application submitted. The staff team will review it here.",
  updated: "Recruitment settings updated.",
  reviewed: "Application review saved.",
  verification: "Your form expired. Refresh the page and try again.",
  forbidden: "An active staff assignment is required for this action.",
  "application-details": "Check your nickname, age, Discord profile link, Steam group answer, and reason (20–5,000 characters).",
  "application-response": "Keep the staff response within 2,000 characters. Leave it blank to remove the response.",
  "application-active": "You already have an application awaiting review.",
  "application-closed": "The final decision cannot be changed. You can still update the response using its existing status.",
  "application-missing": "This application is no longer available.",
  "recruitment-closed": "Recruitment is currently closed. Please check back later.",
  "recruitment-unavailable": "Recruitment is temporarily unavailable. Please try again later.",
};

export function recruitmentErrorCode(error: unknown) {
  return error instanceof Error && Object.hasOwn(recruitmentMessages, error.message) ? error.message : "recruitment-unavailable";
}

export function recruitmentMessage(code: string | undefined) {
  return code && Object.hasOwn(recruitmentMessages, code) ? recruitmentMessages[code] : null;
}
