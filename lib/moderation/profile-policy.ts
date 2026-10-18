export const profileModerationActions = ["ban", "kick", "gag", "mute", "silence"] as const;
export type ProfileModerationAction = typeof profileModerationActions[number];
type StaffPermissions = { isAdmin: boolean; permissions: ReadonlySet<string> };

export function canUseModerationAction(actor: StaffPermissions, action: string): action is ProfileModerationAction {
  if (!actor.isAdmin || !profileModerationActions.some(value => value === action)) return false;
  const required = `admins.commands.${action}`;
  return [...actor.permissions].some(permission => permission === "*" || permission === required ||
    (permission.endsWith(".*") && required.startsWith(permission.slice(0, -1))));
}

export function availableProfileModerationActions(actor: StaffPermissions, online: boolean) {
  return profileModerationActions.filter(action => (action !== "kick" || online) && canUseModerationAction(actor, action));
}
