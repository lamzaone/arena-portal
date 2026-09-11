import "server-only";

import type { RowDataPacket } from "mysql2/promise";

import { configuredGameServerGuid, isAssignedToConfiguredGameServer } from "@/lib/admin/server-scope";
import { getGameDatabasePool } from "@/lib/data/database-pools";
import { getPlayerProfileThemeKeys } from "@/lib/data/portal-repository";
import { getStaffAdminMembershipSnapshot } from "@/lib/data/staff-admin-memberships";
import { buildStaffDirectory, staffGroupKey, type StaffDirectory, type StaffDirectoryDefinition, type StaffDirectoryProfile } from "@/lib/staff-directory";
import { getSteamProfiles } from "@/lib/steam/profiles";

type NativeGroupRow = RowDataPacket & { Name: string; Immunity: number; Servers: string | string[] };
type ArenaGroupRow = RowDataPacket & {
  external_key: string;
  display_name: string;
  description: string | null;
  badge_icon_key: string;
  badge_color: string;
  effective_rank: number;
  enabled: number;
};

function serverList(value: NativeGroupRow["Servers"]): string[] {
  if (Array.isArray(value)) return value.filter((entry) => typeof entry === "string");
  try {
    const parsed: unknown = JSON.parse(value);
    if (Array.isArray(parsed)) return parsed.filter((entry): entry is string => typeof entry === "string");
  } catch { /* Older native rows can contain comma-separated server IDs. */ }
  return String(value ?? "").split(",").map((entry) => entry.trim()).filter(Boolean);
}

async function readDefinitions() {
  const pool = getGameDatabasePool();
  if (!pool) return { definitions: [] as StaffDirectoryDefinition[], nativeGroupKeys: new Set<string>() };
  const [native] = await pool.query<NativeGroupRow[]>(
    "SELECT Name, Immunity, Servers FROM `groups` ORDER BY Immunity DESC, Name, Id",
  );
  const groups = new Map<string, StaffDirectoryDefinition>();
  for (const row of native) {
    if (!isAssignedToConfiguredGameServer(serverList(row.Servers))) continue;
    const key = staffGroupKey(row.Name);
    groups.set(key, {
      key, name: row.Name, description: null,
      icon: key === "founder" ? "crown" : "shield",
      color: key === "founder" ? "#fbbf24" : "#fb7185",
      rank: Number(row.Immunity), enabled: true,
    });
  }
  const nativeGroupKeys = new Set(groups.keys());

  try {
    const [arena] = await pool.query<ArenaGroupRow[]>(
      "SELECT g.external_key, g.display_name, g.description, g.badge_icon_key, g.badge_color, " +
      "COALESCE(gs.rank_weight_override, g.rank_weight) AS effective_rank, " +
      "(g.enabled AND gs.enabled AND s.enabled) AS enabled " +
      "FROM arena_groups AS g " +
      "INNER JOIN arena_group_scopes AS gs ON gs.group_id = g.id " +
      "INNER JOIN arena_scopes AS s ON s.id = gs.scope_id " +
      "WHERE g.group_type = 'admin' AND g.external_key IS NOT NULL " +
      "AND (s.scope_type = 'global' OR (s.scope_type = 'server' AND LOWER(s.admin_server_guid) = LOWER(?))) " +
      // An enabled global assignment still applies when a local scope is disabled.
      "ORDER BY enabled DESC, (s.scope_type = 'server') DESC, s.id",
      [configuredGameServerGuid()],
    );
    const seen = new Set<string>();
    for (const row of arena) {
      const key = staffGroupKey(row.external_key);
      if (seen.has(key)) continue;
      seen.add(key);
      groups.set(key, {
        key, name: row.display_name, description: row.description,
        icon: row.badge_icon_key, color: row.badge_color,
        rank: Number(row.effective_rank), enabled: Number(row.enabled) === 1,
      });
    }
  } catch (error) {
    const code = (error as { code?: string }).code;
    // Native assignments remain usable during the Arena schema rollout.
    if (code !== "ER_NO_SUCH_TABLE" && code !== "ER_BAD_FIELD_ERROR") throw error;
  }
  return { definitions: [...groups.values()], nativeGroupKeys };
}

export async function getPublicStaffDirectory(): Promise<StaffDirectory & { available: boolean }> {
  if (!getGameDatabasePool()) return { groups: [], memberCount: 0, onlineCount: 0, available: false };
  try {
    const [{ definitions, nativeGroupKeys }, snapshot] = await Promise.all([readDefinitions(), getStaffAdminMembershipSnapshot()]);
    // Native admin rows and their native group definitions must both apply to
    // this server. An Arena global group does not expand a native assignment.
    const memberships = snapshot.records.filter((record) => record.source !== "native" || nativeGroupKeys.has(staffGroupKey(record.group)));
    const initial = buildStaffDirectory(definitions, memberships);
    const ids = [...new Set(initial.groups.flatMap((group) => group.members.map((member) => member.steamId)))];
    const batches: string[][] = [];
    for (let index = 0; index < ids.length; index += 100) batches.push(ids.slice(index, index + 100));
    const [steamBatches, themeKeys] = await Promise.all([
      Promise.all(batches.map((batch) => getSteamProfiles(batch))),
      getPlayerProfileThemeKeys(ids),
    ]);
    const profiles: Record<string, StaffDirectoryProfile> = {};
    for (const steamId of ids) {
      profiles[steamId] = { name: "", avatarUrl: null, presence: "unknown", profileThemeKey: themeKeys.get(steamId) ?? null };
    }
    for (const batch of steamBatches) {
      for (const [steamId, profile] of batch) {
        profiles[steamId] = { name: profile.name, avatarUrl: profile.avatarFull, presence: profile.presence, profileThemeKey: themeKeys.get(steamId) ?? null };
      }
    }
    return { ...buildStaffDirectory(definitions, memberships, profiles), available: true };
  } catch (error) {
    console.error("Public staff directory unavailable:", error instanceof Error ? error.message : "unknown error");
    return { groups: [], memberCount: 0, onlineCount: 0, available: false };
  }
}
