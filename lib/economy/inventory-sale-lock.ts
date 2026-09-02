type SaleCandidate = {
  catalogueId: number | null;
  saleLocked: boolean;
  state: string;
  stickers: readonly unknown[];
  tradable: boolean;
};

type LockCandidate = {
  state: string;
};

export type SaleLockOverride = {
  saleLocked: boolean;
  requestVersion: number;
  phase: "pending" | "awaiting-authority";
  clearAfterRevision: number | null;
};

export function beginSaleLockOverrides(
  current: ReadonlyMap<string, SaleLockOverride>,
  itemIds: readonly string[],
  saleLocked: boolean,
  requestVersion: number,
) {
  const next = new Map(current);
  for (const itemId of itemIds) {
    const existing = next.get(itemId);
    if (existing && existing.requestVersion > requestVersion) continue;
    next.set(itemId, {
      saleLocked,
      requestVersion,
      phase: "pending",
      clearAfterRevision: null,
    });
  }
  return next;
}

export function settleSaleLockOverrides(
  current: ReadonlyMap<string, SaleLockOverride>,
  itemIds: readonly string[],
  requestVersion: number,
  currentRevision: number,
) {
  const next = new Map(current);
  for (const itemId of itemIds) {
    const existing = next.get(itemId);
    if (!existing || existing.requestVersion !== requestVersion) continue;
    next.set(itemId, {
      ...existing,
      phase: "awaiting-authority",
      clearAfterRevision: currentRevision + 1,
    });
  }
  return next;
}

export function rejectSaleLockOverrides(
  current: ReadonlyMap<string, SaleLockOverride>,
  itemIds: readonly string[],
  requestVersion: number,
) {
  const next = new Map(current);
  for (const itemId of itemIds) {
    if (next.get(itemId)?.requestVersion === requestVersion) next.delete(itemId);
  }
  return next;
}

export function reconcileSaleLockOverrides(
  current: ReadonlyMap<string, SaleLockOverride>,
  authoritative: ReadonlyMap<string, boolean>,
  currentRevision: number,
) {
  const next = new Map(current);
  for (const [itemId, override] of current) {
    if (!authoritative.has(itemId)) {
      next.delete(itemId);
      continue;
    }
    if (
      override.phase === "awaiting-authority" &&
      override.clearAfterRevision !== null &&
      currentRevision >= override.clearAfterRevision
    ) {
      next.delete(itemId);
    }
  }
  return next;
}

export function canSelectForLock(item: LockCandidate) {
  return item.state !== "consumed" && item.state !== "revoked";
}

export function canSellInventoryItem(item: SaleCandidate) {
  return (
    item.state === "available" &&
    item.tradable &&
    !item.saleLocked &&
    item.stickers.length === 0 &&
    item.catalogueId !== null
  );
}
