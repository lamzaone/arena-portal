import "server-only";
import type { ResultSetHeader, RowDataPacket } from "mysql2/promise";
import { getPortalDatabasePool } from "@/lib/data/database-pools";
import { getArenaAuthorityMembershipsForPlayers } from "@/lib/data/identity-groups";
import { ensureIdentityCatalogue } from "@/lib/data/identity-catalogue";
import { getAuthoritativeExternalIdentityMemberships } from "@/lib/data/portal-repository";
import { createNotificationRepository } from "./notification-repository";
import { resolveDiscordMembers, type DiscordGroup } from "./role-snapshot";

export function discordPortalPool() {
  const pool = getPortalDatabasePool();
  if (!pool) throw new Error("Portal storage is unavailable.");
  return pool;
}
function configuredGuildId() {
  const id = process.env.DISCORD_GUILD_ID ?? "";
  if (!/^[1-9]\d{16,19}$/.test(id)) throw new Error("Discord guild is not configured.");
  return id;
}

export async function getDiscordBotSnapshot() {
  const pool = discordPortalPool();
  const guildId = configuredGuildId();
  // Bootstrap the same native Admins.Core/VIP/custom catalogue used by the portal.
  // Do not publish a partial snapshot when catalogue discovery fails.
  await ensureIdentityCatalogue(pool);
  const [[groupRows], [linkRows], [roleRows]] = await Promise.all([
    pool.query<Array<RowDataPacket & { id: string; display_name: string; badge_color: string; source_type: DiscordGroup["sourceType"]; external_key: string | null; enabled: number; rank_weight: number }>>(
      "SELECT g.id, g.display_name, g.badge_color, g.source_type, g.external_key, g.enabled, " +
      "COALESCE(d.rank_weight, g.profile_priority) AS rank_weight FROM portal_identity_groups g " +
      "LEFT JOIN portal_identity_external_group_definitions d ON d.group_id = g.id ORDER BY g.id",
    ),
    pool.query<Array<RowDataPacket & { steam_id: string; discord_user_id: string }>>(
      "SELECT steam_id, discord_user_id FROM portal_discord_links ORDER BY steam_id",
    ),
    pool.query<Array<RowDataPacket & { group_id: string; discord_role_id: string }>>(
      "SELECT group_id, discord_role_id FROM portal_discord_group_roles WHERE discord_guild_id = ? ORDER BY group_id", [guildId],
    ),
  ]);
  const groups: DiscordGroup[] = groupRows.map((row) => ({
    id: String(row.id), name: row.display_name, color: /^#[0-9a-f]{6}$/i.test(row.badge_color) ? row.badge_color : null,
    sourceType: row.source_type, externalKey: row.external_key,
    isAdmin: row.source_type === "admins_core", enabled: Boolean(Number(row.enabled)),
    rankWeight: Number(row.rank_weight),
  }));
  const links = linkRows.map((row) => ({ steamId: row.steam_id, discordUserId: row.discord_user_id }));
  const authority = await getArenaAuthorityMembershipsForPlayers(links.map((link) => link.steamId));
  const members = await resolveDiscordMembers(groups, links, authority, getAuthoritativeExternalIdentityMemberships);
  return { groups, members,
    staffRoleId: roleRows.find(row => String(row.group_id) === "0")?.discord_role_id ?? null,
    roles: roleRows.filter(row => String(row.group_id) !== "0").map((row) => ({ groupId: String(row.group_id), discordRoleId: row.discord_role_id })) };
}

export async function saveDiscordGroupRole(input: { groupId: string; discordRoleId: string; previousRoleId: string | null }) {
  const guildId = configuredGuildId();
  const connection = await discordPortalPool().getConnection();
  // Identity IDs start at 1. Reserve 0 in the existing mapping table for the
  // derived Staff role, without creating an assignable portal identity group.
  const groupId = input.groupId === "staff" ? "0" : input.groupId;
  try {
    await connection.beginTransaction();
    let createdStaff = false;
    if (input.groupId === "staff") {
      // The unique guild/group key serializes first-time Staff creation too.
      const [insert] = await connection.execute<ResultSetHeader>(
        "INSERT IGNORE INTO portal_discord_group_roles (discord_guild_id, group_id, discord_role_id) VALUES (?, ?, ?)",
        [guildId, groupId, input.discordRoleId],
      );
      createdStaff = insert.affectedRows === 1;
    } else {
      const [groups] = await connection.query<RowDataPacket[]>("SELECT id FROM portal_identity_groups WHERE id = ? FOR UPDATE", [groupId]);
      if (!groups.length) throw new Error("Unknown identity group.");
    }
    const [rows] = await connection.query<Array<RowDataPacket & { discord_role_id: string }>>(
      "SELECT discord_role_id FROM portal_discord_group_roles WHERE discord_guild_id = ? AND group_id = ? FOR UPDATE", [guildId, groupId],
    );
    if (input.groupId === "staff" && !rows.length) throw new Error("Staff role is already mapped to another group.");
    const current = createdStaff ? null : rows[0]?.discord_role_id ?? null;
    if (current !== input.discordRoleId && current !== input.previousRoleId) { await connection.rollback(); return false; }
    if (current !== input.discordRoleId) {
      if (createdStaff) {
        // Already inserted under the same transaction; audit below.
      } else if (current === null) {
        await connection.execute(
          "INSERT INTO portal_discord_group_roles (discord_guild_id, group_id, discord_role_id) VALUES (?, ?, ?)",
          [guildId, groupId, input.discordRoleId],
        );
      } else {
        await connection.execute(
          "UPDATE portal_discord_group_roles SET discord_role_id = ? WHERE discord_guild_id = ? AND group_id = ?",
          [input.discordRoleId, guildId, groupId],
        );
      }
      await connection.execute(
        "INSERT INTO portal_audit_events (actor_type, actor_id, action, target_type, target_id, metadata) VALUES ('bot', 'discord', 'discord.role.mapped', 'identity-group', ?, ?)",
        [input.groupId, JSON.stringify({ guildId, roleId: input.discordRoleId, previousRoleId: current })],
      );
    }
    await connection.commit();
    return true;
  } catch (error) { await connection.rollback(); throw error; }
  finally { connection.release(); }
}

export function discordNotificationRepository() { return createNotificationRepository(discordPortalPool()); }

export function discordNotificationUrl(path: string | null): string | null {
  if (!path || !path.startsWith("/") || path.startsWith("//") || path.includes("\\")) return null;
  try {
    const base = new URL(process.env.SITE_URL ?? "");
    const result = new URL(path, base);
    return ["http:", "https:"].includes(result.protocol) && result.origin === base.origin ? result.href : null;
  } catch { return null; }
}
