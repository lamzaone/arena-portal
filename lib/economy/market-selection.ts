export const MIN_MARKET_SEED = 0;
export const MAX_MARKET_SEED = 1000;

export function parseMarketSeed(value: string): number | null {
  const trimmed = value.trim();
  if (!/^\d+$/.test(trimmed)) return null;
  const seed = Number(trimmed);
  return Number.isSafeInteger(seed) && seed >= MIN_MARKET_SEED && seed <= MAX_MARKET_SEED
    ? seed
    : null;
}

type MarketSelection = {
  floatValue: number;
  seed: number;
  stattrak: boolean;
};

export function marketQuoteMatchesSelection(
  quote: MarketSelection,
  selection: MarketSelection,
) {
  return Math.abs(quote.floatValue - selection.floatValue) < 0.0000005 &&
    quote.seed === selection.seed && quote.stattrak === selection.stattrak;
}

export function marketQuoteEvidenceLabel(quote: {
  seedMatched: boolean;
  pricingRule: string | null;
}) {
  if (quote.pricingRule === "custom-server-fixed-v1") return "Staff-set server price";
  return quote.seedMatched
    ? "Seed-matched market price"
    : "Market estimate · seed price unverified";
}
