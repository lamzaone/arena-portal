import type { IdentityGroupBadgeData } from "./data/identity-groups.ts";
import type { PlayerIdentityData } from "./player-identities.ts";

export type PlayerSearchResult = PlayerIdentityData & {
  inventoryVisibility: "public" | "private";
};

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function text(value: unknown) {
  return typeof value === "string" ? value.trim() : "";
}

function isBadge(value: unknown): value is IdentityGroupBadgeData {
  return isRecord(value)
    && Number.isSafeInteger(value.id)
    && ["custom", "admins_core", "vipcore"].includes(String(value.sourceType))
    && ["key", "displayName", "badgeLabel", "badgeIconKey", "badgeColor", "badgeSoftColor"].every((key) => typeof value[key] === "string")
    && (value.externalKey === null || typeof value.externalKey === "string")
    && typeof value.profilePriority === "number" && Number.isFinite(value.profilePriority);
}

export function parsePlayerSearchResults(value: unknown): PlayerSearchResult[] {
  if (!isRecord(value) || !Array.isArray(value.players)) return [];
  return value.players.flatMap((candidate) => {
    if (!isRecord(candidate)) return [];
    const steamId = text(candidate.steamId);
    if (!/^7656119\d{10}$/.test(steamId)) return [];
    return [{
      steamId,
      displayName: text(candidate.displayName) || steamId,
      avatarUrl: text(candidate.avatarUrl) || text(candidate.avatarFull) || null,
      presence: candidate.presence === "online" || candidate.presence === "offline" ? candidate.presence : "unknown",
      profileThemeKey: text(candidate.profileThemeKey) || null,
      identityGroups: Array.isArray(candidate.identityGroups) ? candidate.identityGroups.filter(isBadge) : [],
      inventoryVisibility: candidate.inventoryVisibility === "public" ? "public" : "private",
    }];
  });
}
