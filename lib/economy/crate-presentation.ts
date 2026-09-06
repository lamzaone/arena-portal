export const MAX_CRATE_PURCHASE_QUANTITY = 50;

export type CrateDrop<TCatalogue = Record<string, unknown>> = {
  item: TCatalogue;
  lootEntryId: number;
  weight: number;
  minFloat: number | null;
  maxFloat: number | null;
  stattrakChanceBps: number;
};

export type CrateDropState<TCatalogue = Record<string, unknown>> =
  | { status: "idle" }
  | { status: "loading" }
  | { status: "ready"; totalWeight: number; drops: CrateDrop<TCatalogue>[] }
  | { status: "empty"; message: string }
  | { status: "error"; message: string };

const MARKET_CONTAINER_MODAL_EXIT_DELAY_MS = 180;

export function marketContainerModalPresentation(input: {
  dropsExpanded: boolean;
  closing: boolean;
  reducedMotion: boolean;
}) {
  return {
    phase: input.closing ? ("closing" as const) : ("open" as const),
    size: input.dropsExpanded ? ("wide" as const) : ("standard" as const),
    exitDelayMs: input.reducedMotion
      ? 0
      : MARKET_CONTAINER_MODAL_EXIT_DELAY_MS,
  };
}

type DropCataloguePresentation = {
  displayName?: string;
  rarityRank?: number;
};

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function finiteNumber(value: unknown): number | null {
  const parsed =
    typeof value === "number"
      ? value
      : typeof value === "string" && value.trim()
        ? Number(value)
        : Number.NaN;
  return Number.isFinite(parsed) ? parsed : null;
}

function optionalFloat(value: unknown): number | null | undefined {
  if (value === undefined || value === null || value === "") return null;
  const parsed = finiteNumber(value);
  return parsed !== null && parsed >= 0 && parsed <= 1 ? parsed : undefined;
}

export function clampCrateQuantity(value: unknown): number {
  const parsed = finiteNumber(value);
  if (parsed === null) return 1;
  return Math.max(
    1,
    Math.min(MAX_CRATE_PURCHASE_QUANTITY, Math.trunc(parsed)),
  );
}

/**
 * Returns a safe display total. Invalid prices become zero and overflowing
 * totals saturate at MAX_SAFE_INTEGER, which callers treat as unaffordable.
 * The purchase endpoint remains authoritative for the amount actually debited.
 */
export function cratePurchaseTotal(unitPrice: number, quantity: unknown): number {
  if (!Number.isSafeInteger(unitPrice) || unitPrice < 0) return 0;
  const total = unitPrice * clampCrateQuantity(quantity);
  return Number.isSafeInteger(total) ? total : Number.MAX_SAFE_INTEGER;
}

export function canAffordCratePurchase(
  walletBalance: number,
  unitPrice: number,
  quantity: unknown,
) {
  const normalizedQuantity = clampCrateQuantity(quantity);
  const rawTotal = unitPrice * normalizedQuantity;
  return (
    Number.isSafeInteger(walletBalance) &&
    walletBalance >= 0 &&
    Number.isSafeInteger(unitPrice) &&
    unitPrice >= 0 &&
    Number.isSafeInteger(rawTotal) &&
    rawTotal <= walletBalance
  );
}

export function inlinePanelInsertionIndex(
  selectedIndex: number,
  itemCount: number,
  columnCount: number,
): number | null {
  if (
    !Number.isSafeInteger(selectedIndex) ||
    !Number.isSafeInteger(itemCount) ||
    itemCount < 1 ||
    selectedIndex < 0 ||
    selectedIndex >= itemCount
  ) {
    return null;
  }
  const columns =
    Number.isSafeInteger(columnCount) && columnCount > 0 ? columnCount : 1;
  const rowEnd =
    Math.floor(selectedIndex / columns) * columns + columns - 1;
  return Math.min(itemCount - 1, rowEnd);
}

export function crateDropDisclosureLabel(
  expanded: boolean,
  dropCount: number | null,
) {
  if (expanded) return "Hide possible drops";
  return dropCount !== null && Number.isSafeInteger(dropCount) && dropCount >= 0
    ? `Show ${dropCount.toLocaleString("en-US")} possible drops`
    : "Show possible drops";
}

export type MarketplacePurchaseIntentOptions = {
  quantity?: unknown;
  floatValue?: number;
  seed?: number;
  expectedUnitPriceTokens?: number;
  stattrak: boolean;
};

export type RetainedPurchaseRequest = {
  signature: string;
  idempotencyKey: string;
};

export function marketplacePurchaseIntentSignature(
  catalogueId: number,
  options: MarketplacePurchaseIntentOptions,
) {
  const floatValue =
    options.floatValue === undefined
      ? null
      : Number.isFinite(options.floatValue) &&
          options.floatValue >= 0 &&
          options.floatValue <= 1
        ? Math.round(options.floatValue * 1_000_000) / 1_000_000
        : `invalid:${String(options.floatValue)}`;
  return JSON.stringify({
    catalogueId,
    quantity: clampCrateQuantity(options.quantity ?? 1),
    floatValue,
    seed: options.seed ?? null,
    ...(options.expectedUnitPriceTokens === undefined
      ? {}
      : { expectedUnitPriceTokens: options.expectedUnitPriceTokens }),
    stattrak: options.stattrak === true,
  });
}

export function retainedPurchaseRequest(
  current: RetainedPurchaseRequest | null,
  signature: string,
  createIdempotencyKey: () => string,
): RetainedPurchaseRequest {
  if (current?.signature === signature) return current;
  return { signature, idempotencyKey: createIdempotencyKey() };
}

export function crateDropStateFromResponse<TCatalogue = Record<string, unknown>>(
  value: unknown,
  catalogueFromResponse: (
    value: Record<string, unknown>,
  ) => TCatalogue = (catalogue) => catalogue as TCatalogue,
): CrateDropState<TCatalogue> {
  if (!isRecord(value) || !Array.isArray(value.drops)) {
    return { status: "error", message: "Crate odds are unavailable." };
  }
  if (value.drops.length === 0) {
    return { status: "empty", message: "This crate has no enabled drops." };
  }

  const totalWeight = finiteNumber(value.totalWeight);
  if (
    totalWeight === null ||
    !Number.isSafeInteger(totalWeight) ||
    totalWeight <= 0
  ) {
    return { status: "error", message: "Crate odds are unavailable." };
  }

  const drops: CrateDrop<TCatalogue>[] = [];
  for (const entry of value.drops) {
    if (!isRecord(entry) || !isRecord(entry.catalogue)) {
      return { status: "error", message: "Crate odds are unavailable." };
    }
    const lootEntryId = finiteNumber(entry.lootEntryId);
    const weight = finiteNumber(entry.weight);
    const minFloat = optionalFloat(entry.minFloat);
    const maxFloat = optionalFloat(entry.maxFloat);
    const stattrakChanceBps = finiteNumber(entry.stattrakChanceBps ?? 0);
    if (
      lootEntryId === null ||
      !Number.isSafeInteger(lootEntryId) ||
      lootEntryId < 1 ||
      weight === null ||
      !Number.isSafeInteger(weight) ||
      weight < 1 ||
      minFloat === undefined ||
      maxFloat === undefined ||
      (minFloat !== null && maxFloat !== null && minFloat > maxFloat) ||
      stattrakChanceBps === null ||
      !Number.isSafeInteger(stattrakChanceBps) ||
      stattrakChanceBps < 0 ||
      stattrakChanceBps > 10_000
    ) {
      return { status: "error", message: "Crate odds are unavailable." };
    }
    try {
      drops.push({
        item: catalogueFromResponse(entry.catalogue),
        lootEntryId,
        weight,
        minFloat,
        maxFloat,
        stattrakChanceBps,
      });
    } catch {
      return { status: "error", message: "Crate odds are unavailable." };
    }
  }

  const summedWeight = drops.reduce((sum, drop) => sum + drop.weight, 0);
  if (!Number.isSafeInteger(summedWeight) || summedWeight !== totalWeight) {
    return { status: "error", message: "Crate odds are unavailable." };
  }
  return { status: "ready", totalWeight, drops };
}

export function crateDropRate(
  drop: Pick<CrateDrop, "weight">,
  totalWeight: number,
) {
  return totalWeight > 0 ? (drop.weight / totalWeight) * 100 : 0;
}

export function formatCrateDropRate(
  drop: Pick<CrateDrop, "weight">,
  totalWeight: number,
) {
  const rate = crateDropRate(drop, totalWeight);
  return new Intl.NumberFormat(undefined, {
    maximumFractionDigits: rate < 0.1 ? 3 : 2,
    minimumFractionDigits: rate < 1 ? 2 : 0,
  }).format(rate);
}

export function sortCrateDrops<
  TCatalogue extends DropCataloguePresentation,
>(drops: readonly CrateDrop<TCatalogue>[]) {
  return drops.toSorted(
    (left, right) =>
      (right.item.rarityRank ?? 0) -
        (left.item.rarityRank ?? 0) ||
      (left.item.displayName ?? "").localeCompare(
        right.item.displayName ?? "",
      ) ||
      left.lootEntryId - right.lootEntryId,
  );
}
