export type InventorySelectionOwner = "inventory" | "crates" | null;

type OpenableInventoryItem = {
  id: string;
  itemType: string;
  state: string;
  catalogueId: number | null;
};

export const MAX_INVENTORY_CRATE_OPEN_SELECTION = 50;
export const MAX_CRATES_PER_OPEN_REQUEST = 10;

export function isOpenableInventoryCrate(item: OpenableInventoryItem) {
  return (
    (item.itemType === "crate" || item.itemType === "capsule") &&
    item.state === "available" &&
    item.catalogueId !== null
  );
}

export type CrateOnlySelection<T extends OpenableInventoryItem> =
  | { status: "empty" | "mixed"; crates: T[] }
  | { status: "ready"; crates: T[] };

export function crateOnlySelection<T extends OpenableInventoryItem>(
  items: readonly T[],
  selectedIds: Iterable<string>,
): CrateOnlySelection<T> {
  const orderedIds = [...selectedIds];
  if (!orderedIds.length) return { status: "empty", crates: [] };
  if (orderedIds.length > MAX_INVENTORY_CRATE_OPEN_SELECTION)
    return { status: "mixed", crates: [] };
  const itemsById = new Map(items.map((item) => [item.id, item]));
  const crates: T[] = [];
  for (const itemId of orderedIds) {
    const item = itemsById.get(itemId);
    if (!item || !isOpenableInventoryCrate(item))
      return { status: "mixed", crates: [] };
    crates.push(item);
  }
  return { status: "ready", crates };
}

export function partitionCrateOpeningIds(itemIds: readonly string[]) {
  if (
    itemIds.length < 1 ||
    itemIds.length > MAX_INVENTORY_CRATE_OPEN_SELECTION
  ) {
    throw new RangeError("Choose between 1 and 50 crates to open.");
  }
  if (new Set(itemIds).size !== itemIds.length)
    throw new RangeError("Each crate can only be opened once.");

  const groups: string[][] = [];
  for (
    let index = 0;
    index < itemIds.length;
    index += MAX_CRATES_PER_OPEN_REQUEST
  ) {
    groups.push(itemIds.slice(index, index + MAX_CRATES_PER_OPEN_REQUEST));
  }
  return groups;
}

export function remainingCrateOpeningIds(
  groups: readonly (readonly string[])[],
  completedGroupCount: number,
) {
  return groups
    .slice(Math.max(0, Math.trunc(completedGroupCount)))
    .flatMap((group) => [...group]);
}

export function nextInventorySelectionOwner(
  current: InventorySelectionOwner,
  requestedOwner: Exclude<InventorySelectionOwner, null>,
  active: boolean,
): InventorySelectionOwner {
  if (active) return requestedOwner;
  return current === requestedOwner ? null : current;
}

export function withRetainedOpenedItem<T extends { id: string }>(
  items: readonly T[],
  retained: T | null,
  retainedIndex = items.length,
): T[] {
  if (!retained || items.some((item) => item.id === retained.id)) return [...items];
  const next = [...items];
  next.splice(Math.max(0, Math.min(retainedIndex, next.length)), 0, retained);
  return next;
}

export function activeConsumedItemIds(
  currentIds: Iterable<string>,
  inventoryIds: ReadonlySet<string>,
  retainedId: string | null,
): string[] {
  return [...currentIds].filter(
    (itemId) => inventoryIds.has(itemId) || itemId === retainedId,
  );
}

export function inventoryWorkflowAccess(input: {
  crateInteractionActive: boolean;
  inventoryMutationActive: boolean;
}) {
  return {
    inventoryDisabled: input.crateInteractionActive,
    cratesDisabled: input.inventoryMutationActive,
  };
}
