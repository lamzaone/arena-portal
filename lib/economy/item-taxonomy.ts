export const ECONOMY_ITEM_TYPES = [
  "skin",
  "knife",
  "glove",
  "crate",
  "capsule",
  "nametag",
  "sticker",
  "agent",
  "music_kit",
  "keychain",
  "patch",
  "graffiti",
  "vip_membership",
  "profile_theme",
] as const;

export type EconomyItemType = (typeof ECONOMY_ITEM_TYPES)[number];

export const ECONOMY_RARITIES = [
  { rank: 0, name: "Standard" },
  { rank: 1, name: "Consumer Grade" },
  { rank: 2, name: "Industrial Grade" },
  { rank: 3, name: "Mil-Spec Grade" },
  { rank: 4, name: "Restricted" },
  { rank: 5, name: "Classified" },
  { rank: 6, name: "Covert" },
  { rank: 7, name: "Extraordinary" },
  { rank: 8, name: "Special" },
] as const;

export type EconomyRarityRank = (typeof ECONOMY_RARITIES)[number]["rank"];

export const ECONOMY_RARITY_RANKS = ECONOMY_RARITIES.map(
  (rarity) => rarity.rank,
) as readonly EconomyRarityRank[];

export const ECONOMY_MAX_IMPORTED_RARITY_RANK = 7;
export const ECONOMY_SPECIAL_RARITY_RANK = 8;
export const ECONOMY_MAX_RARITY_RANK = ECONOMY_SPECIAL_RARITY_RANK;

export function isEconomyItemType(value: unknown): value is EconomyItemType {
  return (
    typeof value === "string" &&
    (ECONOMY_ITEM_TYPES as readonly string[]).includes(value)
  );
}

export function isEconomyRarityRank(
  value: unknown,
): value is EconomyRarityRank {
  return (
    typeof value === "number" &&
    Number.isSafeInteger(value) &&
    (ECONOMY_RARITY_RANKS as readonly number[]).includes(value)
  );
}

export function economyRarityName(value: number) {
  const rank = Number.isFinite(value) ? Math.trunc(value) : 0;
  return (
    ECONOMY_RARITIES.find((rarity) => rarity.rank === rank)?.name ??
    `Rarity ${rank}`
  );
}

export function economyRarityRankClass(value: number) {
  const rank = isEconomyRarityRank(value) ? value : 0;
  return `rarity-rank-${rank}`;
}

export function economyItemTypeLabel(itemType: EconomyItemType | string) {
  if (itemType === "vip_membership") return "VIP Membership";
  if (itemType === "profile_theme") return "Profile Theme";
  if (itemType === "keychain") return "Charm";
  return itemType
    .replace(/[-_]+/g, " ")
    .replace(/\b\w/g, (letter) => letter.toUpperCase());
}

export function economyItemTypePluralLabel(
  itemType: EconomyItemType | string,
) {
  const labels: Partial<Record<EconomyItemType, string>> = {
    skin: "Skins",
    knife: "Knives",
    glove: "Gloves",
    crate: "Crates",
    capsule: "Capsules",
    nametag: "Name Tags",
    sticker: "Stickers",
    agent: "Agents",
    music_kit: "Music Kits",
    keychain: "Charms",
    patch: "Patches",
    graffiti: "Graffiti",
    vip_membership: "VIP Memberships",
    profile_theme: "Profile Themes",
  };
  return labels[itemType as EconomyItemType] ?? economyItemTypeLabel(itemType);
}

export function isCustomOnlyEconomyRarity(value: number) {
  return value === ECONOMY_SPECIAL_RARITY_RANK;
}

export function isCustomProductItemType(
  itemType: EconomyItemType | string,
) {
  return itemType === "vip_membership" || itemType === "profile_theme";
}
