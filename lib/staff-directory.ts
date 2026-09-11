export type StaffDirectoryDefinition = {
  key: string;
  name: string;
  description: string | null;
  icon: string;
  color: string;
  rank: number;
  enabled: boolean;
};

export type StaffDirectoryMembership = {
  steamId: string;
  name: string;
  group: string;
  status: string;
  enabled: boolean;
};

export type StaffDirectoryProfile = {
  name: string;
  avatarUrl: string | null;
  presence: "online" | "offline" | "unknown";
  profileThemeKey?: string | null;
};

export type StaffDirectoryMember = StaffDirectoryProfile & { steamId: string; profileThemeKey: string | null };
export type StaffDirectoryGroup = Omit<StaffDirectoryDefinition, "enabled" | "rank"> & {
  members: StaffDirectoryMember[];
};
export type StaffDirectory = {
  groups: StaffDirectoryGroup[];
  memberCount: number;
  onlineCount: number;
};

export function staffGroupKey(value: string) {
  return value.normalize("NFKC").trim().toLocaleLowerCase("en-US");
}

const collator = new Intl.Collator("en", { sensitivity: "base", numeric: true });

/** Public presentation only: never serialize the underlying staff records. */
export function buildStaffDirectory(
  definitions: readonly StaffDirectoryDefinition[],
  memberships: readonly StaffDirectoryMembership[],
  profiles: Readonly<Record<string, StaffDirectoryProfile>> = {},
): StaffDirectory {
  const active = memberships.filter((membership) => membership.enabled && membership.status === "active");
  const names = new Map<string, string>();
  for (const membership of active) {
    const name = membership.name.trim();
    if (!names.has(membership.steamId) || (name && name !== membership.steamId && !name.startsWith("Steam "))) {
      names.set(membership.steamId, name || membership.steamId);
    }
  }

  const uniqueMembers = new Map<string, StaffDirectoryMember>();
  const membershipsByGroup = new Map<string, Set<string>>();
  for (const membership of active) {
    const key = staffGroupKey(membership.group);
    const ids = membershipsByGroup.get(key) ?? new Set<string>();
    ids.add(membership.steamId);
    membershipsByGroup.set(key, ids);
  }

  const groups = definitions.filter((group) => group.enabled)
    .sort((a, b) => b.rank - a.rank || collator.compare(a.name, b.name) || a.key.localeCompare(b.key))
    .map(({ key, name, description, icon, color }): StaffDirectoryGroup => {
      const members = [...(membershipsByGroup.get(staffGroupKey(key)) ?? [])].map((steamId) => {
        const profile = profiles[steamId];
        const member: StaffDirectoryMember = {
          steamId,
          name: profile?.name.trim() || names.get(steamId) || steamId,
          avatarUrl: profile?.avatarUrl ?? null,
          presence: profile?.presence ?? "unknown",
          profileThemeKey: profile?.profileThemeKey ?? null,
        };
        uniqueMembers.set(steamId, member);
        return member;
      }).sort((a, b) => collator.compare(a.name, b.name) || a.steamId.localeCompare(b.steamId));
      return { key, name, description, icon, color: /^#[\da-f]{6}$/i.test(color) ? color : "#fb7185", members };
    });

  return {
    groups,
    memberCount: uniqueMembers.size,
    onlineCount: [...uniqueMembers.values()].filter((member) => member.presence === "online").length,
  };
}
