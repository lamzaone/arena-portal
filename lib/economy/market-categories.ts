// Presentation-only marketplace categories. Keep these separate from the
// database enum: legacy weapon finishes are stored as `skin`, not `weapon`.
export type MarketplaceCatalogueItemType =
  | "skin"
  | "knife"
  | "glove"
  | "crate"
  | "capsule"
  | "nametag"
  | "sticker"
  | "agent"
  | "music_kit"
  | "keychain"
  | "patch"
  | "graffiti";

export type MarketplaceCategory = {
  value: string;
  label: string;
  itemTypes?: readonly MarketplaceCatalogueItemType[];
  marketCategory?: "special";
};

export const marketplaceCategories: readonly MarketplaceCategory[] = [
  { value: "weapons", label: "Weapons / Skins", itemTypes: ["skin"] },
  { value: "knife", label: "Knives", itemTypes: ["knife"] },
  { value: "glove", label: "Gloves", itemTypes: ["glove"] },
  { value: "crate", label: "Crates", itemTypes: ["crate"] },
  { value: "capsule", label: "Capsules", itemTypes: ["capsule"] },
  { value: "sticker", label: "Stickers", itemTypes: ["sticker"] },
  { value: "agent", label: "Agents", itemTypes: ["agent"] },
  { value: "keychain", label: "Keychains", itemTypes: ["keychain"] },
  { value: "special", label: "Special", marketCategory: "special" },
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

export function normalizeMarketplaceCategory(value: string | null | undefined) {
  const normalized = value?.trim().toLocaleLowerCase("en-US") ?? "";
  if (weaponCategoryAliases.has(normalized)) return "weapons";
  return marketplaceCategories.some((category) => category.value === normalized)
    ? normalized
    : "";
}

export function marketplaceCategoryItemTypes(value: string | null | undefined) {
  const normalized = normalizeMarketplaceCategory(value);
  return (
    marketplaceCategories.find((category) => category.value === normalized)
      ?.itemTypes ?? null
  );
}

export function marketplaceCategoryMarketCategory(
  value: string | null | undefined,
) {
  const normalized = normalizeMarketplaceCategory(value);
  return marketplaceCategories.find((category) => category.value === normalized)
    ?.marketCategory ?? null;
}
