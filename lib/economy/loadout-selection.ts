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

function validWeaponDefinitionIndex(value: number | null): value is number {
  return typeof value === "number" &&
    Number.isSafeInteger(value) &&
    value >= 1 &&
    value <= 65_535;
}

export function loadoutCategoryForItem(item: LoadoutItemLike): LoadoutCategoryId | null {
  const explicit = loadoutMetadata(item).loadoutCategory;
  const category = ["weapon", "knife", "glove", "agent"].includes(String(explicit))
    ? explicit as LoadoutCategoryId
    : item.itemType === "skin" || item.itemType === "weapon"
      ? "weapon"
      : item.itemType === "knife" || item.itemType === "glove" || item.itemType === "agent"
        ? item.itemType
        : null;
  return category === "weapon" && !validWeaponDefinitionIndex(item.definitionIndex)
    ? null
    : category;
}

function supportedTeams(item: LoadoutItemLike) {
  const teams = loadoutMetadata(item).teams;
  if (!Array.isArray(teams)) return ["T", "CT"] as const;
  const validTeams = teams.filter(
    (team): team is "T" | "CT" => team === "T" || team === "CT",
  );
  return validTeams;
}

export function loadoutItemSupportsTarget(item: LoadoutItemLike, target: LoadoutTeamTarget) {
  if (loadoutCategoryForItem(item) === "agent" && target === "both") return false;
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

const NO_OWNERSHIP_MESSAGES: Record<LoadoutCategoryId, string> = {
  weapon: "You do not own a weapon finish in this class yet.",
  knife: "You do not own a knife yet.",
  glove: "You do not own gloves yet.",
  agent: "You do not own an Agent for this team yet.",
};

export function loadoutChoiceEmptyMessage(
  category: LoadoutCategoryId,
  target: LoadoutTeamTarget,
  hasOwnedChoices: boolean,
) {
  if (!hasOwnedChoices) return NO_OWNERSHIP_MESSAGES[category];
  const choiceLabel: Record<LoadoutCategoryId, string> = {
    weapon: "finishes for this weapon",
    knife: "knives",
    glove: "gloves",
    agent: "Agents",
  };
  return `None of your owned ${choiceLabel[category]} support ${target === "both" ? "both teams" : target}.`;
}

export function weaponLoadoutCardAccessibleLabel(
  weaponName: string,
  ownedFinishCount: number,
  equippedTFinish: string,
  equippedCTFinish: string,
) {
  const finishLabel = ownedFinishCount === 1 ? "finish" : "finishes";
  return `Choose ${weaponName}, ${ownedFinishCount} owned ${finishLabel}. Current T finish: ${equippedTFinish}. Current CT finish: ${equippedCTFinish}.`;
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
    if (
      !validWeaponDefinitionIndex(definitionIndex ?? null)
    )
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
