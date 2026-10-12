export type WarningAuthority = {
  isAdmin: boolean; isAssignedToServer: boolean; immunity: number;
  permissions: ReadonlySet<string>;
};

export function canManageWarnings(actor: WarningAuthority, action: "issue" | "revoke") {
  const permission = `admins.commands.${action === "issue" ? "warn" : "unwarn"}`;
  return actor.isAdmin && actor.isAssignedToServer && [...actor.permissions].some(
    assigned => assigned === "*" || assigned === permission ||
      (assigned.endsWith(".*") && permission.startsWith(assigned.slice(0, -1))),
  );
}

export function authorizeWarning(actor: WarningAuthority, target: WarningAuthority, action: "issue" | "revoke") {
  if (!canManageWarnings(actor, action)) throw new Error("permission");
  if (target.isAdmin && actor.immunity < target.immunity) throw new Error("immunity");
}

export function warningStatus(warning: { expiresAt: number; revokedAt: number | null }, now = Date.now()) {
  return warning.revokedAt !== null ? "Revoked" : warning.expiresAt > now ? "Active" : "Expired";
}

export function validateWarningInput(input: { id: string; steamId: string; reason: string; durationMinutes: number; serverGuid: string }) {
  if (!/^[0-9a-f]{8}-(?:[0-9a-f]{4}-){3}[0-9a-f]{12}$/i.test(input.id) ||
      !/^7656119\d{10}$/.test(input.steamId) ||
      !/^[0-9a-f]{8}-(?:[0-9a-f]{4}-){3}[0-9a-f]{12}$/i.test(input.serverGuid) ||
      input.reason.trim().length < 2 || input.reason.length > 500 ||
      !Number.isSafeInteger(input.durationMinutes) || input.durationMinutes < 1 || input.durationMinutes > 525600) {
    throw new Error("details");
  }
}
