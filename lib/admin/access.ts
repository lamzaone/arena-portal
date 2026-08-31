import "server-only";

import { cache } from "react";
import { type RowDataPacket } from "mysql2/promise";

import { getAdminAuthorization, getPlayerDashboard, portalStorageConfigured } from "@/lib/data/portal-repository";
import {
  getEffectiveIdentity,
  getIdentityAdminAuthorizationSnapshot,
} from "@/lib/data/identity-groups";
import { getGameDatabasePool } from "@/lib/data/database-pools";
import {
  configuredGameServerGuid,
  isAssignedToConfiguredGameServer,
} from "@/lib/admin/server-scope";

type AdminGroupConfig = {
  name?: unknown;
  immunity?: unknown;
  permissions?: unknown;
};

type LiveAdminGroupRow = RowDataPacket & {
  Name: unknown;
  Immunity: unknown;
  Permissions: unknown;
  Servers: unknown;
};

// Current Admins.Core group matrix used by the portal. Only permissions used
// by the web panel are retained; it is a deployment snapshot of groups.json.
const currentGroups: AdminGroupConfig[] = [
  { name: "Trial Staff", immunity: 10, permissions: ["admins.notify"] },
  { name: "Guardian", immunity: 20, permissions: ["admins.notify"] },
  { name: "Enforcer", immunity: 30, permissions: ["admins.notify", "admins.commands.ban"] },
  { name: "Overseer", immunity: 40, permissions: ["admins.notify", "admins.commands.ban", "admins.commands.unban"] },
  { name: "Director", immunity: 50, permissions: ["admins.notify", "admins.commands.ban", "admins.commands.unban", "admins.commands.admin"] },
  { name: "Founder", immunity: 100, permissions: ["*"] }
];

export type AdminAccess = {
  steamId: string;
  displayName: string;
  groups: string[];
  immunity: number;
  permissions: Set<string>;
  serverGuids: string[];
  isAdmin: boolean;
  isAssignedToServer: boolean;
  isFounder: boolean;
  canManageGroups: boolean;
  canBan: boolean;
  canUnban: boolean;
  canManageAdmins: boolean;
  canManageVips: boolean;
  canViewEconomy: boolean;
  canAdjustEconomyTokens: boolean;
  canGrantEconomyItems: boolean;
  canManageEconomy: boolean;
  canManageEconomyLoadouts: boolean;
};

function storedStringList(value: unknown) {
  let parsed = value;
  if (Buffer.isBuffer(parsed)) parsed = parsed.toString("utf8");
  if (typeof parsed === "string") {
    try {
      parsed = JSON.parse(parsed) as unknown;
    } catch {
      return [] as string[];
    }
  }
  if (!Array.isArray(parsed)) return [] as string[];
  return [
    ...new Set(
      parsed
        .filter((entry): entry is string => typeof entry === "string")
        .map((entry) => entry.normalize("NFKC").trim())
        .filter((entry) => entry.length > 0 && entry.length <= 100),
    ),
  ];
}

async function getConfiguredGroups(): Promise<AdminGroupConfig[]> {
  const gamePool = getGameDatabasePool();
  if (gamePool) {
    try {
      const [rows] = await gamePool.query<LiveAdminGroupRow[]>(
        "SELECT Name, Immunity, Permissions, Servers FROM `groups` ORDER BY Immunity, Name, Id",
      );
      return rows.flatMap((row) => {
        const name = typeof row.Name === "string"
          ? row.Name.normalize("NFKC").trim()
          : "";
        const immunity = Number(row.Immunity);
        const permissions = storedStringList(row.Permissions);
        const servers = storedStringList(row.Servers);
        if (
          !name ||
          name.length > 100 ||
          !Number.isSafeInteger(immunity) ||
          immunity < 0 ||
          !isAssignedToConfiguredGameServer(servers)
        ) {
          return [];
        }
        return [{ name, immunity, permissions }];
      });
    } catch {
      // A configured runtime database is the authority. Never fall back to a
      // stale portal projection when its live group rows cannot be verified.
      return [];
    }
  }

  const snapshot = await getIdentityAdminAuthorizationSnapshot();
  if (
    snapshot.definitions.length ||
    snapshot.databaseAuthoritative ||
    portalStorageConfigured()
  ) {
    return snapshot.definitions;
  }
  // Built-in definitions are a legacy, no-game-database compatibility mode.
  // Once a runtime source has become authoritative, an empty scope or a read
  // failure must stay empty instead of silently restoring old permissions.
  return currentGroups;
}

function permissionSet(group: AdminGroupConfig) {
  return new Set(Array.isArray(group.permissions) ? group.permissions.filter((permission): permission is string => typeof permission === "string") : []);
}

function hasPermission(permissions: Set<string>, permission: string) {
  return [...permissions].some((assigned) => assigned === "*" || assigned === permission || (assigned.endsWith(".*") && permission.startsWith(assigned.slice(0, -1))));
}

function isStaffPermission(permission: string) {
  return permission === "*" || permission === "admins.*" || permission.startsWith("admins.") || permission === "tapped.*" || permission.startsWith("tapped.");
}

async function getAdminAccessUncached(steamId: string): Promise<AdminAccess> {
  const [profile, admin, configuredGroups] = await Promise.all([getPlayerDashboard(steamId), getAdminAuthorization(steamId), getConfiguredGroups()]);
  const nativeAssigned = isAssignedToConfiguredGameServer(admin?.serverGuids);
  const nativeMatchedGroups = nativeAssigned ? configuredGroups.filter((configuredGroup) => {
    const groupName = typeof configuredGroup.name === "string" ? configuredGroup.name : "";
    return admin?.groups.some((assignedGroup) => assignedGroup.trim().toLowerCase() === groupName.trim().toLowerCase()) ?? false;
  }) : [];
  // Admins.Core scopes the entire native row to its assigned servers. A timed
  // portal membership can grant its own local group, but must never activate
  // direct permissions, immunity, or groups from a remote-only native row.
  const permissions = new Set<string>(nativeAssigned ? admin?.permissions ?? [] : []);
  let immunity = nativeAssigned ? Number(admin?.immunity ?? 0) : 0;

  const identity = await getEffectiveIdentity({
    steamId,
    vipGroupNames: profile.vipGroups.map(
      (group) => group.externalKey ?? group.name,
    ),
    adminGroupNames: nativeAssigned ? admin?.groups ?? [] : [],
  });
  const liveAdminGroupNames = new Set(
    configuredGroups
      .map((group) => typeof group.name === "string"
        ? group.name.trim().toLocaleLowerCase("en-US")
        : "")
      .filter(Boolean),
  );
  const portalAdminNames = new Set(
    identity.groups
      .filter(
        (group) =>
          group.sourceType === "admins_core" &&
          group.hasPortalMembership &&
          group.externalKey &&
          liveAdminGroupNames.has(
            group.externalKey.trim().toLocaleLowerCase("en-US"),
          ),
      )
      .map((group) => group.externalKey!.trim().toLocaleLowerCase("en-US")),
  );
  const matchedGroups = configuredGroups.filter((configuredGroup) => {
    const name = typeof configuredGroup.name === "string"
      ? configuredGroup.name.trim().toLocaleLowerCase("en-US")
      : "";
    return nativeMatchedGroups.includes(configuredGroup) || portalAdminNames.has(name);
  });
  for (const group of matchedGroups) {
    for (const permission of permissionSet(group)) permissions.add(permission);
    if (typeof group.immunity === "number") immunity = Math.max(immunity, group.immunity);
  }
  // Founder-managed identity grants are shared with the Swiftly runtime. A
  // game permission such as admins.commands.ban therefore authorizes the same
  // tightly-scoped portal action instead of drifting into a second matrix.
  const directPrivilegeIds = new Set(
    identity.directPrivileges.map((privilege) => privilege.id),
  );
  const liveGroupPrivilegeIds = new Set(
    identity.groups
      .filter(
        (group) =>
          group.sourceType !== "admins_core" ||
          Boolean(
            group.externalKey &&
            liveAdminGroupNames.has(
              group.externalKey.trim().toLocaleLowerCase("en-US"),
            ),
          ),
      )
      .flatMap((group) => group.privileges.map((privilege) => privilege.id)),
  );
  for (const privilege of identity.privileges) {
    // Direct grants and privileges from currently valid groups remain
    // additive. A stale Admin adapter cannot retain a removed live permission.
    if (
      directPrivilegeIds.has(privilege.id) ||
      liveGroupPrivilegeIds.has(privilege.id)
    ) {
      permissions.add(privilege.key);
    }
  }

  const isAssignedToServer =
    nativeAssigned ||
    portalAdminNames.size > 0;
  // Founder is an immutable external trust anchor. Never derive it from a
  // portal-managed group, direct privilege, wildcard, badge, or display name.
  const matchedFounderDefinition = matchedGroups.some((group) => {
    const name = typeof group.name === "string" ? group.name.trim() : "";
    return name.toLocaleLowerCase("en-US") === "founder" &&
      permissionSet(group).has("*");
  });
  const isFounder = nativeAssigned && matchedFounderDefinition &&
    (admin?.groups.some(
      (group) => group.trim().toLocaleLowerCase("en-US") === "founder",
    ) ?? false);
  const isAdmin = isAssignedToServer && (matchedGroups.length > 0 || [...permissions].some(isStaffPermission));

  return {
    steamId,
    displayName: profile.displayName ?? admin?.username ?? `Steam ${steamId}`,
    groups: matchedGroups.map((group) => String(group.name)),
    immunity,
    permissions,
    serverGuids: admin?.serverGuids ?? [],
    isAdmin,
    isAssignedToServer,
    isFounder,
    canManageGroups: isFounder,
    canBan: isAdmin && hasPermission(permissions, "admins.commands.ban"),
    canUnban: isAdmin && hasPermission(permissions, "admins.commands.unban"),
    canManageAdmins: isAdmin && hasPermission(permissions, "admins.commands.admin"),
    canManageVips: isAdmin && (hasPermission(permissions, "vipcore.manage") || hasPermission(permissions, "vipcore.adduser")),
    canViewEconomy: isAdmin && ["tapped.tokens.admin", "tapped.inventory.admin", "tapped.inventory.grant", "tapped.inventory.manage-loadout"].some((permission) => hasPermission(permissions, permission)),
    canAdjustEconomyTokens: isAdmin && (hasPermission(permissions, "tapped.tokens.admin") || hasPermission(permissions, "tapped.inventory.admin")),
    canGrantEconomyItems: isAdmin && (hasPermission(permissions, "tapped.inventory.grant") || hasPermission(permissions, "tapped.inventory.admin")),
    canManageEconomy: isAdmin && hasPermission(permissions, "tapped.inventory.admin"),
    canManageEconomyLoadouts: isAdmin && (hasPermission(permissions, "tapped.inventory.admin") || hasPermission(permissions, "tapped.inventory.manage-loadout"))
  };
}

// The header and the active staff page both need the same authorization
// snapshot. Share it for the lifetime of one server render instead of running
// the game/identity queries twice.
export const getAdminAccess = cache(getAdminAccessUncached);

export async function getStaffGroupDefinitions() {
  const groups = await getConfiguredGroups();
  return groups.map((group) => ({
    name: typeof group.name === "string" ? group.name : "",
    immunity: typeof group.immunity === "number" ? group.immunity : 0
  })).filter((group) => group.name);
}

export function canActOnTarget(actor: AdminAccess, target: AdminAccess) {
  // Admins.Core uses ImmunityMode 1: equal immunity may affect each other.
  return actor.immunity >= target.immunity;
}

export function adminWriteConfigured() {
  return process.env.PORTAL_BRIDGE_ENABLED === "true" && portalStorageConfigured();
}

export async function getServerGuid() {
  return configuredGameServerGuid();
}
