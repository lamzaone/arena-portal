/** Shared client/server policy for portal inventory sellback. */
export const ECONOMY_SELLBACK_BASIS_POINTS = 3_000;
export const ECONOMY_SELLBACK_PERCENT_LABEL = "30%";
export const ECONOMY_SELLBACK_MINIMUM_TOKENS = 5;

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
