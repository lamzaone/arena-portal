export type DiscordGroup = {
  id: string; name: string; color: string | null; isAdmin: boolean; enabled: boolean;
  sourceType: "custom" | "admins_core" | "vipcore"; externalKey: string | null;
  rankWeight?: number;
};
type AuthoritySnapshot = {
  available: boolean;
  membershipsBySteamId: Map<string, Map<number, unknown>>;
  suppressedLegacyVipSteamIds: Set<string>;
};
type ExternalMemberships = { adminGroupNames: string[]; vipGroupNames: string[] };

/** Unlike public profile rendering, role writes must stop when any source fails. */
export async function resolveDiscordMembers(
  groups: DiscordGroup[],
  links: { steamId: string; discordUserId: string }[],
  authority: AuthoritySnapshot,
  readExternal: (steamId: string) => Promise<ExternalMemberships>,
) {
  if (!authority.available) throw new Error("Arena identity authority is unavailable.");
  const result: { discordUserId: string; steamId: string; groupIds: string[] }[] = [];
  // Bound cross-database concurrency; do not open one connection per guild member.
  for (let offset = 0; offset < links.length; offset += 4) {
    result.push(...await Promise.all(links.slice(offset, offset + 4).map(async (link) => {
      const external = await readExternal(link.steamId);
      const adminNames = new Set(external.adminGroupNames.map((name) => name.trim().toLowerCase()));
      const vipNames = new Set(external.vipGroupNames.map((name) => name.trim().toLowerCase()));
      const memberships = authority.membershipsBySteamId.get(link.steamId);
      return {
        discordUserId: link.discordUserId,
        steamId: link.steamId,
        groupIds: groups.filter((group) => {
          if (!group.enabled) return false;
          if (memberships?.has(Number(group.id))) return true;
          const key = group.externalKey?.trim().toLowerCase();
          if (!key) return false;
          if (group.sourceType === "admins_core") return adminNames.has(key);
          return group.sourceType === "vipcore" && !authority.suppressedLegacyVipSteamIds.has(link.steamId) && vipNames.has(key);
        }).map((group) => group.id),
      };
    })));
  }
  return result;
}
