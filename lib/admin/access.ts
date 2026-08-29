import "server-only";

import { getAdminAuthorization, getPlayerDashboard, portalStorageConfigured } from "@/lib/data/portal-repository";
import {
  getEffectiveIdentity,
  getIdentityAdminAuthorizationDefinitions,
} from "@/lib/data/identity-groups";
import {
  configuredGameServerGuid,
  isAssignedToConfiguredGameServer,
} from "@/lib/admin/server-scope";

type AdminGroupConfig = {
  name?: unknown;
  immunity?: unknown;
  permissions?: unknown;
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

async function getConfiguredGroups() {
  const databaseGroups = await getIdentityAdminAuthorizationDefinitions();
  return databaseGroups.length ? databaseGroups : currentGroups;
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

export async function getAdminAccess(steamId: string): Promise<AdminAccess> {
  const [profile, admin, configuredGroups] = await Promise.all([getPlayerDashboard(steamId), getAdminAuthorization(steamId), getConfiguredGroups()]);
  const matchedGroups = configuredGroups.filter((configuredGroup) => {
    const groupName = typeof configuredGroup.name === "string" ? configuredGroup.name : "";
    return admin?.groups.some((assignedGroup) => assignedGroup.trim().toLowerCase() === groupName.trim().toLowerCase()) ?? false;
  });
  const permissions = new Set<string>(admin?.permissions ?? []);
  let immunity = Number(admin?.immunity ?? 0);

  for (const group of matchedGroups) {
    for (const permission of permissionSet(group)) permissions.add(permission);
    if (typeof group.immunity === "number") immunity = Math.max(immunity, group.immunity);
  }

  const identity = await getEffectiveIdentity({
    steamId,
    vipGroupNames: profile.vipGroups.map((group) => group.name),
    adminGroupNames: admin?.groups ?? [],
  });
  // Founder-managed identity grants are shared with the Swiftly runtime. A
  // game permission such as admins.commands.ban therefore authorizes the same
  // tightly-scoped portal action instead of drifting into a second matrix.
  for (const privilege of identity.privileges) {
    permissions.add(privilege.key);
  }

  const isAssignedToServer = isAssignedToConfiguredGameServer(
    admin?.serverGuids,
  );
  // Founder is an immutable external trust anchor. Never derive it from a
  // portal-managed group, direct privilege, wildcard, badge, or display name.
  const isFounder = isAssignedToServer && (admin?.groups.some(
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
