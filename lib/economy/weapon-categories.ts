/** The inventory fields needed by the weapon grouping model. */
export type WeaponItemLike = {
  id: string;
  itemType: string;
  definitionIndex: number | null;
  displayName: string;
};

export type WeaponCategoryId =
  | "rifles"
  | "snipers"
  | "pistols"
  | "smgs"
  | "shotguns"
  | "lmgs"
  | "other";

export type WeaponCategory = {
  id: WeaponCategoryId;
  label: string;
};

export const WEAPON_CATEGORIES: readonly WeaponCategory[] = [
  { id: "rifles", label: "Rifles" },
  { id: "snipers", label: "Snipers" },
  { id: "pistols", label: "Pistols" },
  { id: "smgs", label: "SMGs" },
  { id: "shotguns", label: "Shotguns" },
  { id: "lmgs", label: "LMGs" },
  { id: "other", label: "Other" },
];

const RIFLES = new Set([7, 8, 10, 13, 16, 39, 60]);
const SNIPERS = new Set([9, 11, 38, 40]);
const PISTOLS = new Set([1, 2, 3, 4, 30, 32, 36, 61, 63, 64]);
const SMGS = new Set([17, 19, 23, 24, 26, 33, 34]);
const SHOTGUNS = new Set([25, 27, 29, 35]);
const LMGS = new Set([14, 28]);

export function weaponCategoryForDefinition(
  definitionIndex: number,
): WeaponCategoryId {
  if (RIFLES.has(definitionIndex)) return "rifles";
  if (SNIPERS.has(definitionIndex)) return "snipers";
  if (PISTOLS.has(definitionIndex)) return "pistols";
  if (SMGS.has(definitionIndex)) return "smgs";
  if (SHOTGUNS.has(definitionIndex)) return "shotguns";
  if (LMGS.has(definitionIndex)) return "lmgs";
  return "other";
}

export type OwnedWeaponSkinGroup<T extends WeaponItemLike = WeaponItemLike> = {
  category: WeaponCategoryId;
  definitionIndex: number;
  items: T[];
};

export type LoadoutTeamSelection = "T" | "CT" | "both";

export function loadoutSlots(
  definitionIndex: number,
  team: LoadoutTeamSelection,
) {
  const teams = team === "both" ? (["T", "CT"] as const) : [team];
  return teams.map((selectedTeam) => ({
    slotType: "weapon" as const,
    team: selectedTeam,
    definitionIndex,
  }));
}

export function ownedWeaponSkins<T extends WeaponItemLike>(
  items: T[],
): OwnedWeaponSkinGroup<T>[] {
  const grouped = new Map<number, T[]>();
  for (const item of items) {
    if (
      (item.itemType !== "skin" && item.itemType !== "weapon") ||
      item.definitionIndex === null ||
      !Number.isSafeInteger(item.definitionIndex)
    ) {
      continue;
    }
    const group = grouped.get(item.definitionIndex);
    if (group) group.push(item);
    else grouped.set(item.definitionIndex, [item]);
  }

  return [...grouped.entries()]
    .map(([definitionIndex, groupItems]) => ({
      category: weaponCategoryForDefinition(definitionIndex),
      definitionIndex,
      items: groupItems.toSorted((a, b) =>
        a.displayName.localeCompare(b.displayName),
      ),
    }))
    .toSorted((a, b) =>
      a.items[0].displayName.localeCompare(b.items[0].displayName),
    );
}
