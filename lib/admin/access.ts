import "server-only";

import { getAdminAuthorization, getPlayerDashboard, portalStorageConfigured } from "@/lib/data/portal-repository";

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
  { name: "Director", immunity: 50, permissions: ["admins.notify", "admins.commands.ban", "admins.commands.unban", "admins.commands.admin", "tapped.tokens.admin", "tapped.inventory.admin", "tapped.inventory.grant", "tapped.inventory.manage-loadout"] },
  { name: "Founder", immunity: 100, permissions: ["*"] }
];

const currentServerGuid = "05eda3ad-2921-4083-adfb-2e23596c8caa";

export type AdminAccess = {
  steamId: string;
  displayName: string;
  groups: string[];
  immunity: number;
  permissions: Set<string>;
  serverGuids: string[];
  isAdmin: boolean;
  isAssignedToServer: boolean;
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

  const isAssignedToServer = admin?.serverGuids.some((serverGuid) => serverGuid.trim().toLowerCase() === currentServerGuid.toLowerCase()) ?? false;
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

export function getStaffGroupDefinitions() {
  return currentGroups.map((group) => ({
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
  if (process.env.GAME_SERVER_GUID) return process.env.GAME_SERVER_GUID.trim();
  return currentServerGuid;
}
