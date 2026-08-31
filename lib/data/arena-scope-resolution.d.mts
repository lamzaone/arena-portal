export type ArenaServerScopeLink = {
  adminServerGuid: string;
  vipServerId: number;
};

export function configuredArenaServerScopeLink(
  adminServerGuid: unknown,
  vipServerId: unknown,
): ArenaServerScopeLink | null;
