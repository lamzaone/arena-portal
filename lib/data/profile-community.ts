import "server-only";

import { randomUUID } from "node:crypto";
import type { PoolConnection, RowDataPacket } from "mysql2/promise";
import { getPortalDatabasePool } from "@/lib/data/database-pools";
import { isIndividualSteamId64, uniqueIndividualSteamIds } from "../steam/steam-id.ts";
import { commendationKinds, emptyProfileCommunity, type CommendationKind, type ProfileCommunity, type ProfileCommunityAction, type ProfileCommunitySummary } from "../profile-community.ts";

export type { CommendationKind, ProfileCommunitySummary } from "../profile-community.ts";

export class ProfileCommunityError extends Error {
  code: "invalid_input" | "forbidden" | "disabled" | "rate_limited" | "unavailable";
  constructor(code: ProfileCommunityError["code"], message: string) {
    super(message); this.name = "ProfileCommunityError"; this.code = code;
  }
}
const unavailable = () => new ProfileCommunityError("unavailable", "Profile community features are temporarily unavailable. The profile community database update may still be required.");
const fail = (message: string): never => { throw new ProfileCommunityError("invalid_input", message); };
const uuidPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const isKind = (value: unknown): value is CommendationKind => typeof value === "string" && commendationKinds.includes(value as CommendationKind);

/** Validated at both the route and repository boundaries, including direct callers. */
export function parseProfileCommunityAction(input: Record<string, unknown>): ProfileCommunityAction {
  switch (input.action) {
    case "reputation":
      if (input.value !== -1 && input.value !== 0 && input.value !== 1) return fail("Choose +1, -1, or remove your reputation vote.");
      return { action: "reputation", value: input.value };
    case "commendations": {
      if (!Array.isArray(input.kinds) || input.kinds.length > 20 || !input.kinds.every(isKind)) return fail("Choose valid commendation categories.");
      return { action: "commendations", kinds: commendationKinds.filter(kind => (input.kinds as unknown[]).includes(kind)) };
    }
    case "comment": {
      if (typeof input.body !== "string" || !input.body.trim() || input.body.trim().length > 1000) return fail("Write a comment between 1 and 1000 characters.");
      if (typeof input.requestId !== "string" || !uuidPattern.test(input.requestId)) return fail("Reload the page before posting this comment.");
      // Stored and rendered only as plain text. Newlines are preserved; hidden
      // control characters cannot forge interface text or content boundaries.
      const body = input.body.trim().replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/g, "");
      if (!body.trim()) return fail("Write a comment between 1 and 1000 characters.");
      return { action: "comment", body, requestId: input.requestId.toLowerCase() };
    }
    case "delete_comment":
      if (typeof input.commentId !== "string" || !uuidPattern.test(input.commentId)) return fail("Choose a valid profile comment.");
      return { action: "delete_comment", commentId: input.commentId.toLowerCase() };
    case "comments_setting":
      if (typeof input.enabled !== "boolean") return fail("Choose whether profile comments are enabled.");
      return { action: "comments_setting", enabled: input.enabled };
    default: return fail("Choose a valid profile action.");
  }
}

/** Public aggregates only; never includes the voters or a private account field. */
export async function getProfileCommunitySummaries(steamIds: readonly string[]): Promise<Record<string, ProfileCommunitySummary>> {
  const ids = uniqueIndividualSteamIds(steamIds);
  const result: Record<string, ProfileCommunitySummary> = Object.fromEntries(ids.map(id => {
    const { available, reputation, commendationTotal, commendations } = emptyProfileCommunity();
    return [id, { available, reputation, commendationTotal, commendations }];
  }));
  const pool = getPortalDatabasePool();
  if (!pool || !ids.length) return result;
  const placeholders = ids.map(() => "?").join(",");
  try {
    const [[votes], [commends]] = await Promise.all([
      pool.query<(RowDataPacket & { target_steam_id: string; reputation: number })[]>(`SELECT target_steam_id, SUM(value) AS reputation FROM portal_profile_reputation WHERE target_steam_id IN (${placeholders}) GROUP BY target_steam_id`, ids),
      pool.query<(RowDataPacket & { target_steam_id: string; kind: CommendationKind; total: number })[]>(`SELECT target_steam_id, kind, COUNT(*) AS total FROM portal_profile_commendations WHERE target_steam_id IN (${placeholders}) GROUP BY target_steam_id, kind`, ids),
    ]);
    for (const id of ids) result[id].available = true;
    for (const row of votes) if (result[row.target_steam_id]) result[row.target_steam_id].reputation = Number(row.reputation);
    for (const row of commends) if (result[row.target_steam_id] && isKind(row.kind)) {
      result[row.target_steam_id].commendations[row.kind] = Number(row.total);
      result[row.target_steam_id].commendationTotal += Number(row.total);
    }
  } catch { /* An additive migration must never invent zero statistics. */ }
  return result;
}

export async function getProfileCommunity(steamId: string, viewerSteamId: string | null = null, pageInput = 1): Promise<ProfileCommunity> {
  const empty = emptyProfileCommunity();
  if (!isIndividualSteamId64(steamId)) return empty;
  const pool = getPortalDatabasePool();
  if (!pool) return empty;
  try {
    const [summaries, [settings], [counts], [votes], [commends]] = await Promise.all([
      getProfileCommunitySummaries([steamId]),
      pool.query<(RowDataPacket & { comments_enabled: number })[]>("SELECT comments_enabled FROM portal_profile_community WHERE steam_id = ?", [steamId]),
      pool.query<(RowDataPacket & { total: number })[]>("SELECT COUNT(*) AS total FROM portal_profile_comments WHERE target_steam_id = ? AND deleted_at IS NULL", [steamId]),
      pool.query<(RowDataPacket & { value: number })[]>("SELECT value FROM portal_profile_reputation WHERE target_steam_id = ? AND actor_steam_id = ?", [steamId, viewerSteamId ?? ""]),
      pool.query<(RowDataPacket & { kind: CommendationKind })[]>("SELECT kind FROM portal_profile_commendations WHERE target_steam_id = ? AND actor_steam_id = ? ORDER BY kind", [steamId, viewerSteamId ?? ""]),
    ]);
    if (!summaries[steamId]?.available) return empty;
    const total = Number(counts[0]?.total ?? 0), pageSize = 10;
    const page = Math.min(Number.isFinite(pageInput) ? Math.max(1, Math.floor(pageInput)) : 1, Math.max(1, Math.ceil(total / pageSize)));
    const [comments] = await pool.query<(RowDataPacket & { id: string; author_steam_id: string; body: string; created_at: number })[]>("SELECT id, author_steam_id, body, created_at FROM portal_profile_comments WHERE target_steam_id = ? AND deleted_at IS NULL ORDER BY created_at DESC, id DESC LIMIT ? OFFSET ?", [steamId, pageSize, (page - 1) * pageSize]);
    return {
      ...summaries[steamId], commentsEnabled: settings[0] ? Boolean(Number(settings[0].comments_enabled)) : true,
      myReputation: Number(votes[0]?.value ?? 0) as -1 | 0 | 1,
      myCommendations: commendationKinds.filter(kind => commends.some(row => row.kind === kind)),
      comments: { page, pageSize, total, records: comments.map(row => ({ id: row.id, authorSteamId: row.author_steam_id, body: row.body, createdAt: Number(row.created_at), canDelete: viewerSteamId === steamId || viewerSteamId === row.author_steam_id })) },
    };
  } catch { return empty; }
}

async function claimAction(connection: PoolConnection, actorSteamId: string) {
  const now = Date.now();
  await connection.execute("INSERT IGNORE INTO portal_profile_community_limits (actor_steam_id, last_action_at) VALUES (?, 0)", [actorSteamId]);
  const [limits] = await connection.query<(RowDataPacket & { last_action_at: number })[]>("SELECT last_action_at FROM portal_profile_community_limits WHERE actor_steam_id = ? FOR UPDATE", [actorSteamId]);
  if (now - Number(limits[0]?.last_action_at ?? 0) < 500) throw new ProfileCommunityError("rate_limited", "Slow down for a moment before another profile action.");
  await connection.execute("UPDATE portal_profile_community_limits SET last_action_at = ? WHERE actor_steam_id = ?", [now, actorSteamId]);
}

/** Per-profile row locking makes settings, posting and replacements atomic.
 * Actor row locking enforces the cooldown across tabs and concurrent requests.
 */
export async function mutateProfileCommunity(input: { actorSteamId: string; targetSteamId: string } & ProfileCommunityAction): Promise<void> {
  const { actorSteamId, targetSteamId } = input;
  if (!isIndividualSteamId64(actorSteamId) || !isIndividualSteamId64(targetSteamId)) return fail("Choose a valid player profile.");
  const action = parseProfileCommunityAction(input);
  if (["reputation", "commendations", "comment"].includes(action.action) && actorSteamId === targetSteamId) throw new ProfileCommunityError("forbidden", "You cannot give reputation, commendations or comments to your own profile.");
  if (action.action === "comments_setting" && actorSteamId !== targetSteamId) throw new ProfileCommunityError("forbidden", "You can change comment settings only on your own profile.");
  const pool = getPortalDatabasePool();
  if (!pool) throw unavailable();
  const connection = await pool.getConnection().catch(() => { throw unavailable(); });
  try {
    await connection.beginTransaction();
    await connection.execute("INSERT IGNORE INTO portal_profile_community (steam_id) VALUES (?)", [targetSteamId]);
    const [profiles] = await connection.query<(RowDataPacket & { comments_enabled: number })[]>("SELECT comments_enabled FROM portal_profile_community WHERE steam_id = ? FOR UPDATE", [targetSteamId]);
    const enabled = Boolean(Number(profiles[0]?.comments_enabled));
    if (action.action === "reputation") {
      const [votes] = await connection.query<(RowDataPacket & { value: number })[]>("SELECT value FROM portal_profile_reputation WHERE target_steam_id = ? AND actor_steam_id = ?", [targetSteamId, actorSteamId]);
      if (Number(votes[0]?.value ?? 0) !== action.value) {
        await claimAction(connection, actorSteamId);
        if (action.value === 0) await connection.execute("DELETE FROM portal_profile_reputation WHERE target_steam_id = ? AND actor_steam_id = ?", [targetSteamId, actorSteamId]);
        else await connection.execute("INSERT INTO portal_profile_reputation (target_steam_id, actor_steam_id, value) VALUES (?, ?, ?) ON DUPLICATE KEY UPDATE value = VALUES(value)", [targetSteamId, actorSteamId, action.value]);
      }
    } else if (action.action === "commendations") {
      const [current] = await connection.query<(RowDataPacket & { kind: string })[]>("SELECT kind FROM portal_profile_commendations WHERE target_steam_id = ? AND actor_steam_id = ?", [targetSteamId, actorSteamId]);
      if (current.length !== action.kinds.length || !action.kinds.every(kind => current.some(row => row.kind === kind))) {
        await claimAction(connection, actorSteamId);
        await connection.execute("DELETE FROM portal_profile_commendations WHERE target_steam_id = ? AND actor_steam_id = ?", [targetSteamId, actorSteamId]);
        for (const kind of action.kinds) await connection.execute("INSERT INTO portal_profile_commendations (target_steam_id, actor_steam_id, kind) VALUES (?, ?, ?)", [targetSteamId, actorSteamId, kind]);
      }
    } else if (action.action === "comments_setting") {
      if (enabled !== action.enabled) {
        await claimAction(connection, actorSteamId);
        await connection.execute("UPDATE portal_profile_community SET comments_enabled = ? WHERE steam_id = ?", [action.enabled, targetSteamId]);
      }
    } else if (action.action === "comment") {
      const [replays] = await connection.query<(RowDataPacket & { target_steam_id: string; body: string })[]>("SELECT target_steam_id, body FROM portal_profile_comments WHERE author_steam_id = ? AND request_id = ?", [actorSteamId, action.requestId]);
      if (replays[0]) {
        if (replays[0].target_steam_id !== targetSteamId || replays[0].body !== action.body) return fail("This comment request was already used. Reload and try again.");
      } else {
        if (!enabled) throw new ProfileCommunityError("disabled", "This player has disabled profile comments.");
        await claimAction(connection, actorSteamId);
        const [recent] = await connection.query<(RowDataPacket & { total: number })[]>("SELECT COUNT(*) AS total FROM portal_profile_comments WHERE author_steam_id = ? AND created_at > ?", [actorSteamId, Date.now() - 60_000]);
        if (Number(recent[0]?.total ?? 0) >= 6) throw new ProfileCommunityError("rate_limited", "You have posted several comments. Try again in a minute.");
        await connection.execute("INSERT INTO portal_profile_comments (id, target_steam_id, author_steam_id, body, request_id, created_at) VALUES (?, ?, ?, ?, ?, ?)", [randomUUID(), targetSteamId, actorSteamId, action.body, action.requestId, Date.now()]);
      }
    } else if (action.action === "delete_comment") {
      const [comments] = await connection.query<(RowDataPacket & { author_steam_id: string; deleted_at: number | null })[]>("SELECT author_steam_id, deleted_at FROM portal_profile_comments WHERE id = ? AND target_steam_id = ? FOR UPDATE", [action.commentId, targetSteamId]);
      const comment = comments[0];
      if (!comment || (actorSteamId !== targetSteamId && actorSteamId !== comment.author_steam_id)) throw new ProfileCommunityError("forbidden", "You can delete only your comments or comments on your profile.");
      if (comment.deleted_at === null) {
        await claimAction(connection, actorSteamId);
        await connection.execute("UPDATE portal_profile_comments SET deleted_at = ?, deleted_by = ? WHERE id = ? AND target_steam_id = ?", [Date.now(), actorSteamId, action.commentId, targetSteamId]);
      }
    }
    await connection.commit();
  } catch (error) {
    await connection.rollback().catch(() => {});
    if (error instanceof ProfileCommunityError) throw error;
    throw unavailable();
  } finally { connection.release(); }
}
