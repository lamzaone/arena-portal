import "server-only";

import { cache } from "react";

import type { IdentityGroupBadgeData } from "@/lib/data/identity-groups";
import { getPlayerIdentityGroupBadges, getPlayerProfileThemeKeys } from "@/lib/data/portal-repository";
import { getSteamProfiles } from "@/lib/steam/profiles";
import { isIndividualSteamId64 } from "@/lib/steam/steam-id";

export type PlayerPresence = "online" | "offline" | "unknown";

/**
 * Public, serializable player presentation. Keep private account, moderation,
 * wallet, and inventory fields out of this object because it is also safe to
 * use in profile hover cards.
 */
export type PlayerIdentityData = {
  steamId: string;
  displayName: string;
  avatarUrl: string | null;
  presence: PlayerPresence;
  profileThemeKey: string | null;
  identityGroups: IdentityGroupBadgeData[];
};

export type PlayerIdentitySeed = {
  steamId: string;
  displayName?: string | null;
  avatarUrl?: string | null;
  presence?: PlayerPresence | null;
  /** `undefined` asks the resolver to load the equipped theme in one batch. */
  profileThemeKey?: string | null;
  /**
   * Dense repositories such as ranking already resolve effective groups in a
   * batch. Supplying them here preserves that authoritative result without a
   * second query or an incomplete external-membership reconstruction.
   * Omit this field to load all effective public badges automatically.
   */
  identityGroups?: readonly IdentityGroupBadgeData[];
};

type NormalizedPlayerIdentitySeed = {
  steamId: string;
  displayName: string | null;
  avatarUrl: string | null;
  presence: PlayerPresence | null;
  profileThemeKey: string | null;
  themeSupplied: boolean;
  groupsSupplied: boolean;
  identityGroups: IdentityGroupBadgeData[];
};

const steamProfileBatchSize = 100;

function cleanText(value: string | null | undefined) {
  const cleaned = value?.trim();
  return cleaned || null;
}

function isPlayerPresence(value: unknown): value is PlayerPresence {
  return value === "online" || value === "offline" || value === "unknown";
}

function normalizeSeeds(
  seeds: readonly PlayerIdentitySeed[],
): NormalizedPlayerIdentitySeed[] {
  const normalized = new Map<string, NormalizedPlayerIdentitySeed>();

  for (const seed of seeds) {
    const steamId = seed.steamId.trim();
    if (!isIndividualSteamId64(steamId)) continue;
    const previous = normalized.get(steamId);
    const themeSupplied = seed.profileThemeKey !== undefined;
    const groupsSupplied = seed.identityGroups !== undefined;
    normalized.set(steamId, {
      steamId,
      displayName:
        cleanText(seed.displayName) ?? previous?.displayName ?? null,
      avatarUrl: cleanText(seed.avatarUrl) ?? previous?.avatarUrl ?? null,
      presence: isPlayerPresence(seed.presence)
        ? seed.presence
        : previous?.presence ?? null,
      profileThemeKey: themeSupplied
        ? cleanText(seed.profileThemeKey)
        : previous?.profileThemeKey ?? null,
      themeSupplied: themeSupplied || previous?.themeSupplied === true,
      groupsSupplied: groupsSupplied || previous?.groupsSupplied === true,
      identityGroups: groupsSupplied
        ? [...(seed.identityGroups ?? [])]
        : previous?.identityGroups ?? [],
    });
  }

  return [...normalized.values()].sort((left, right) =>
    left.steamId.localeCompare(right.steamId),
  );
}

function chunks<T>(values: readonly T[], size: number) {
  const result: T[][] = [];
  for (let index = 0; index < values.length; index += size) {
    result.push(values.slice(index, index + size));
  }
  return result;
}

const resolveNormalizedPlayerIdentities = cache(
  async (serializedSeeds: string): Promise<Record<string, PlayerIdentityData>> => {
    const seeds = JSON.parse(serializedSeeds) as NormalizedPlayerIdentitySeed[];
    if (!seeds.length) return {};

    const steamIds = seeds.map((seed) => seed.steamId);
    const unresolvedThemeIds = seeds
      .filter((seed) => !seed.themeSupplied)
      .map((seed) => seed.steamId);
    const unresolvedGroupIds = seeds
      .filter((seed) => !seed.groupsSupplied)
      .map((seed) => seed.steamId);
    const [steamProfileMaps, profileThemeKeys, identityGroups] = await Promise.all([
      Promise.all(
        chunks(steamIds, steamProfileBatchSize).map((batch) =>
          getSteamProfiles(batch),
        ),
      ),
      unresolvedThemeIds.length
        ? getPlayerProfileThemeKeys(unresolvedThemeIds)
        : Promise.resolve(new Map<string, string>()),
      unresolvedGroupIds.length
        ? getPlayerIdentityGroupBadges(unresolvedGroupIds)
        : Promise.resolve(new Map<string, IdentityGroupBadgeData[]>()),
    ]);
    const steamProfiles = new Map(
      steamProfileMaps.flatMap((profiles) => [...profiles.entries()]),
    );

    const resolved: Record<string, PlayerIdentityData> = {};
    for (const seed of seeds) {
      const steamProfile = steamProfiles.get(seed.steamId);
      resolved[seed.steamId] = {
        steamId: seed.steamId,
        displayName:
          cleanText(steamProfile?.name) ??
          seed.displayName ??
          seed.steamId,
        avatarUrl: cleanText(steamProfile?.avatarFull) ?? seed.avatarUrl,
        presence: steamProfile?.presence ?? seed.presence ?? "unknown",
        profileThemeKey: seed.themeSupplied
          ? seed.profileThemeKey
          : profileThemeKeys.get(seed.steamId) ?? null,
        identityGroups: seed.groupsSupplied
          ? seed.identityGroups
          : identityGroups.get(seed.steamId) ?? [],
      };
    }
    return resolved;
  },
);

/**
 * Resolves all visible player identities as a single request-level operation.
 * The stable serialized key lets React reuse identical page/header work during
 * one server render without creating a cross-request identity cache.
 */
export async function resolvePlayerIdentities(
  seeds: readonly PlayerIdentitySeed[],
): Promise<Record<string, PlayerIdentityData>> {
  const normalized = normalizeSeeds(seeds);
  if (!normalized.length) return {};
  return resolveNormalizedPlayerIdentities(JSON.stringify(normalized));
}
