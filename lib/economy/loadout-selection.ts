import type { EconomyLoadoutSlotInput } from "@/lib/data/portal-repository";

export type LoadoutCategoryId = "weapon" | "knife" | "glove" | "agent";
export type LoadoutTeamTarget = "T" | "CT" | "both";

export type LoadoutItemLike = {
  id: string;
  itemType: string;
  definitionIndex: number | null;
  displayName: string;
  raw?: Record<string, unknown>;
};

function record(value: unknown): Record<string, unknown> | null {
  return typeof value === "object" && value !== null && !Array.isArray(value)
    ? value as Record<string, unknown>
    : null;
}

function loadoutMetadata(item: LoadoutItemLike) {
  const catalogue = record(item.raw?.catalogue);
  return record(catalogue?.metadata) ?? record(item.raw?.attributes) ?? {};
}

export function loadoutCategoryForItem(item: LoadoutItemLike): LoadoutCategoryId | null {
  const explicit = loadoutMetadata(item).loadoutCategory;
  if (["weapon", "knife", "glove", "agent"].includes(String(explicit)))
    return explicit as LoadoutCategoryId;
  if (item.itemType === "skin" || item.itemType === "weapon") return "weapon";
  if (item.itemType === "knife" || item.itemType === "glove" || item.itemType === "agent")
    return item.itemType;
  return null;
}

function supportedTeams(item: LoadoutItemLike) {
  const teams = loadoutMetadata(item).teams;
  return Array.isArray(teams)
    ? teams.filter((team): team is "T" | "CT" => team === "T" || team === "CT")
    : ["T", "CT"] as const;
}

export function loadoutItemSupportsTarget(item: LoadoutItemLike, target: LoadoutTeamTarget) {
  const teams = supportedTeams(item);
  return target === "both"
    ? teams.includes("T") && teams.includes("CT")
    : teams.includes(target);
}

export function ownedItemsForLoadout<T extends LoadoutItemLike>(
  items: readonly T[],
  category: LoadoutCategoryId,
  target?: LoadoutTeamTarget,
) {
  return items.filter((item) =>
    loadoutCategoryForItem(item) === category &&
    (target === undefined || loadoutItemSupportsTarget(item, target)),
  );
}

export function loadoutSlotsForTarget(
  category: LoadoutCategoryId,
  target: LoadoutTeamTarget,
  definitionIndex?: number,
): EconomyLoadoutSlotInput[] {
  if (category === "agent" && target === "both")
    throw new RangeError("Agents must be selected per team.");
  let teams: Array<"T" | "CT">;
  if (target === "both") {
    teams = ["T", "CT"];
  } else {
    teams = [target];
  }
  if (category === "weapon") {
    if (!Number.isSafeInteger(definitionIndex))
      throw new RangeError("A weapon definition is required.");
    return teams.map((team) => ({ slotType: "weapon", team, definitionIndex: definitionIndex! }));
  }
  return teams.map((team) => ({ slotType: category, team }));
}

export function representativeLoadoutItem<T extends LoadoutItemLike>(
  items: readonly T[],
  equippedTItemId: string | null,
  equippedCTItemId: string | null,
) {
  return items.find((item) => item.id === equippedTItemId)
    ?? items.find((item) => item.id === equippedCTItemId)
    ?? items[0]
    ?? null;
}
