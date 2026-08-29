import type { EconomyItemType } from "@/lib/economy/item-taxonomy";

// Presentation-only marketplace categories. Legacy weapon finishes are
// stored as `skin`, while portal-native products keep their real item type.
export type MarketplaceCatalogueItemType = EconomyItemType;

export type MarketplaceCategory = {
  value: string;
  label: string;
  itemTypes?: readonly MarketplaceCatalogueItemType[];
};

export const marketplaceCategories: readonly MarketplaceCategory[] = [
  { value: "weapons", label: "Weapons / Skins", itemTypes: ["skin"] },
  { value: "knife", label: "Knives", itemTypes: ["knife"] },
  { value: "glove", label: "Gloves", itemTypes: ["glove"] },
  { value: "crate", label: "Crates", itemTypes: ["crate"] },
  { value: "capsule", label: "Capsules", itemTypes: ["capsule"] },
  { value: "sticker", label: "Stickers", itemTypes: ["sticker"] },
  { value: "agent", label: "Agents", itemTypes: ["agent"] },
  { value: "keychain", label: "Charms", itemTypes: ["keychain"] },
  {
    value: "vip_membership",
    label: "VIP Memberships",
    itemTypes: ["vip_membership"],
  },
  {
    value: "profile_theme",
    label: "Profile Themes",
    itemTypes: ["profile_theme"],
  },
];

const weaponCategoryAliases = new Set([
  "weapon",
  "weapons",
  "skin",
  "skins",
  "weapon-skin",
  "weapon-skins",
  "weapons-skins",
  "weapons/skins",
]);

const marketplaceCategoryAliases = new Map([
  ["vip", "vip_membership"],
  ["vip-membership", "vip_membership"],
  ["vip-memberships", "vip_membership"],
  ["profile-theme", "profile_theme"],
  ["profile-themes", "profile_theme"],
  ["charm", "keychain"],
  ["charms", "keychain"],
  // Preserve old shared links from the metadata-backed Special category.
  ["special", "vip_membership"],
]);

export function normalizeMarketplaceCategory(value: string | null | undefined) {
  const normalized = value?.trim().toLocaleLowerCase("en-US") ?? "";
  if (weaponCategoryAliases.has(normalized)) return "weapons";
  const aliased = marketplaceCategoryAliases.get(normalized) ?? normalized;
  return marketplaceCategories.some((category) => category.value === aliased)
    ? aliased
    : "";
}

export function marketplaceCategoryItemTypes(value: string | null | undefined) {
  const normalized = normalizeMarketplaceCategory(value);
  return (
    marketplaceCategories.find((category) => category.value === normalized)
      ?.itemTypes ?? null
  );
}
