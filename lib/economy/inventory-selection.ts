export type InventorySelectionOwner = "inventory" | "crates" | null;

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
