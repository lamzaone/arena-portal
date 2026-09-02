/** Shared client/server policy for portal inventory sellback. */
export const ECONOMY_SELLBACK_BASIS_POINTS = 3_000;
export const ECONOMY_SELLBACK_PERCENT_LABEL = "30%";
export const ECONOMY_SELLBACK_MINIMUM_TOKENS = 5;

export type EconomySellbackResolution =
  | {
      status: "resolved";
      marketPriceTokens: number;
      sellbackBasisTokens: number;
      recordedPurchasePriceTokens: number | null;
      payoutTokens: number;
      usesRecordedPurchasePrice: boolean;
      payoutCappedAtRecordedPurchasePrice: boolean;
    }
  | { status: "unpriced" }
  | {
      status: "rejected";
      reason: "invalid_marketplace_purchase";
    };

type EconomySellbackSaleMessageInput = {
  marketPriceTokens: number;
  sellbackBasisTokens: number;
  recordedPurchasePriceTokens: number | null;
  payoutTokens: number;
  payoutCappedAtRecordedPurchasePrice: boolean;
};

function formatSellbackTokens(tokens: number) {
  return new Intl.NumberFormat("en-US").format(tokens);
}

function tokenAmount(value: unknown) {
  return typeof value === "number" && Number.isSafeInteger(value) && value >= 0
    ? value
    : null;
}

function isDiscountEvidence(value: unknown) {
  if (typeof value === "number") return Number.isFinite(value) && value !== 0;
  return typeof value === "string" && value.trim().length > 0;
}

/**
 * Resolves the shared sellback policy from the live market quote and the
 * immutable inventory acquisition source. A discounted marketplace purchase
 * never uses a sellback basis above what its owner actually paid.
 */
export function resolveEconomySellback({
  marketPriceTokens,
  source,
}: {
  marketPriceTokens: number | null | undefined;
  source: Record<string, unknown> | null | undefined;
}): EconomySellbackResolution {
  const marketplacePurchase = source?.type === "marketplace_purchase";
  const recordedPurchasePriceTokens = marketplacePurchase
    ? tokenAmount(source?.priceTokens)
    : null;
  const recordedBasePriceTokens = marketplacePurchase
    ? tokenAmount(source?.basePriceTokens)
    : null;
  const appearsDiscounted =
    marketplacePurchase &&
    ((recordedBasePriceTokens !== null &&
      recordedPurchasePriceTokens !== null &&
      recordedBasePriceTokens > recordedPurchasePriceTokens) ||
      isDiscountEvidence(source?.discountRuleId) ||
      isDiscountEvidence(source?.discountName) ||
      isDiscountEvidence(source?.discountTokens) ||
      isDiscountEvidence(source?.discountPercentageBps) ||
      isDiscountEvidence(source?.discountFixedTokens));

  // A marketplace purchase must always carry the immutable per-item amount
  // paid. Without it, we cannot prove that a damaged source was undiscounted,
  // so falling back to the live price would recreate the arbitrage path.
  if (
    marketplacePurchase &&
    (recordedPurchasePriceTokens === null ||
      recordedBasePriceTokens === null ||
      recordedBasePriceTokens < recordedPurchasePriceTokens)
  ) {
    return {
      status: "rejected",
      reason: "invalid_marketplace_purchase",
    };
  }
  if (
    typeof marketPriceTokens !== "number" ||
    !Number.isSafeInteger(marketPriceTokens) ||
    marketPriceTokens <= 0
  ) {
    return { status: "unpriced" };
  }
  const paidPriceTokens = recordedPurchasePriceTokens ?? 0;

  const sellbackBasisTokens = appearsDiscounted
    ? Math.min(marketPriceTokens, paidPriceTokens)
    : marketPriceTokens;
  const uncappedPayoutTokens = economySellbackPayoutTokens(sellbackBasisTokens);
  const payoutTokens = appearsDiscounted
    ? Math.min(uncappedPayoutTokens, paidPriceTokens)
    : uncappedPayoutTokens;

  return {
    status: "resolved",
    marketPriceTokens,
    sellbackBasisTokens,
    recordedPurchasePriceTokens: appearsDiscounted
      ? paidPriceTokens
      : null,
    payoutTokens,
    usesRecordedPurchasePrice:
      appearsDiscounted && paidPriceTokens < marketPriceTokens,
    payoutCappedAtRecordedPurchasePrice:
      appearsDiscounted && payoutTokens < uncappedPayoutTokens,
  };
}

export function economySellbackSaleMessage(
  input: EconomySellbackSaleMessageInput,
) {
  const payoutTokens = formatSellbackTokens(input.payoutTokens);
  if (input.payoutTokens === 0 && input.recordedPurchasePriceTokens === 0) {
    return "Item sold for 0 Tokens (the recorded discounted purchase price was 0 Tokens).";
  }
  if (
    input.payoutCappedAtRecordedPurchasePrice &&
    input.recordedPurchasePriceTokens !== null
  ) {
    return `Item sold for ${payoutTokens} Tokens (buyback capped at its recorded ${formatSellbackTokens(input.recordedPurchasePriceTokens)}-Token purchase price).`;
  }
  if (economySellbackUsesMinimum(input.sellbackBasisTokens)) {
    return `Item sold for ${payoutTokens} Tokens (minimum buyback for its ${formatSellbackTokens(input.sellbackBasisTokens)}-Token sellback basis).`;
  }
  return `Item sold for ${payoutTokens} Tokens (${ECONOMY_SELLBACK_PERCENT_LABEL} of its ${formatSellbackTokens(input.sellbackBasisTokens)}-Token sellback basis; current portal market price: ${formatSellbackTokens(input.marketPriceTokens)} Tokens).`;
}

export function economySellbackPayoutTokens(marketPriceTokens: number) {
  if (!Number.isFinite(marketPriceTokens) || marketPriceTokens <= 0) return 0;
  return Math.max(
    ECONOMY_SELLBACK_MINIMUM_TOKENS,
    Math.floor(
      (marketPriceTokens * ECONOMY_SELLBACK_BASIS_POINTS) / 10_000,
    ),
  );
}

export function economySellbackUsesMinimum(marketPriceTokens: number) {
  return (
    Math.floor(
      (marketPriceTokens * ECONOMY_SELLBACK_BASIS_POINTS) / 10_000,
    ) < ECONOMY_SELLBACK_MINIMUM_TOKENS
  );
}
