import "server-only";

import {
  getEconomyMarketVariantPrice,
  getEconomyMarketVariantPrices,
  recordEconomyMarketVariantPrices,
} from "@/lib/data/portal-repository";
import {
  marketplaceWearLabel,
  selectMarketplacePriceFallback,
  type MarketplacePriceFallback,
  type MarketplacePriceQuote,
} from "@/lib/economy/market-pricing";

const cacheTtlMs = 6 * 60 * 60 * 1_000;

type CachedFallbackInput = {
  catalogueId: number;
  floatValue: number | null | undefined;
  stattrak: boolean;
  standardFallback?: MarketplacePriceFallback | null | undefined;
};

function fallbackFromCached(
  input: CachedFallbackInput,
  cached: {
    euroCents: number;
    source: string;
    sourceReference: string | null;
    observedAt: string;
    stale: boolean;
  } | null,
): MarketplacePriceFallback | null {
  // Older deployments may already have written an exact listing into this
  // coarse key. Never reuse that row for a different seed or float.
  const cachedFallback =
    cached && cached.source !== "csfloat-exact-listing"
      ? {
          eurCents: cached.euroCents,
          // Staleness describes when the snapshot was recorded, not which
          // trusted provider produced it. Keep the canonical source so the
          // economy source allowlist can validate a last-known quote.
          source: cached.source,
          sourceReference: cached.sourceReference,
          observedAt: cached.observedAt,
          stale: cached.stale,
        }
      : null;
  return selectMarketplacePriceFallback(
    cachedFallback,
    input.stattrak ? null : input.standardFallback,
  );
}

/**
 * Reads the exact wear + StatTrak variant first. A standard catalogue price is
 * used only for normal items, preventing a non-StatTrak snapshot from ever
 * being applied to a StatTrak™ purchase or sale.
 */
export async function getCachedMarketplaceVariantFallback(
  input: CachedFallbackInput,
): Promise<MarketplacePriceFallback | null> {
  const wear = marketplaceWearLabel(input.floatValue) ?? "Standard";
  let cached = null;
  try {
    cached = await getEconomyMarketVariantPrice({
      catalogueId: input.catalogueId,
      stattrak: input.stattrak,
      wear,
    });
  } catch {
    // A portal deployment can come up just before the game-server plug-in
    // creates the cache table. Price resolution must retain its older public
    // provider path during that small rollout window.
    return input.stattrak ? null : input.standardFallback ?? null;
  }
  return fallbackFromCached(input, cached);
}

/** Uses one query for a page of exact wear/StatTrak cache fallbacks. */
export async function getCachedMarketplaceVariantFallbacks(
  inputs: readonly CachedFallbackInput[],
): Promise<Array<MarketplacePriceFallback | null>> {
  if (!inputs.length) return [];
  const lookups = inputs.map((input) => ({
    catalogueId: input.catalogueId,
    stattrak: input.stattrak,
    wear: marketplaceWearLabel(input.floatValue) ?? "Standard",
  }));
  try {
    const cached = await getEconomyMarketVariantPrices(lookups);
    return inputs.map((input, index) => fallbackFromCached(input, cached[index]));
  } catch {
    return inputs.map((input) =>
      input.stattrak ? null : input.standardFallback ?? null,
    );
  }
}

type CacheMarketplaceVariantQuoteInput = {
  catalogueId: number;
  stattrak: boolean;
  imageUrl: string | null | undefined;
  quote: MarketplacePriceQuote | null | undefined;
};

/** Saves fresh provider results with one database write for a whole batch. */
export async function cacheMarketplaceVariantQuotes(
  inputs: readonly CacheMarketplaceVariantQuoteInput[],
) {
  const candidates = inputs.flatMap((input) => {
    const quote = input.quote;
    // Exact seed/float listings cannot be reused for another item that merely
    // shares its wear bucket. Generic quotes store their unadjusted base so a
    // later fallback applies the selected item's float adjustment exactly once.
    if (
      !quote ||
      quote.fromFallback ||
      quote.pricingRule === "external-exact-v2" ||
      quote.seedMatched
    )
      return [];
    return [{
      catalogueId: input.catalogueId,
      stattrak: input.stattrak,
      wear: quote.wear ?? "Standard",
      marketHashName: quote.marketHashName ?? "CS2 item",
      marketVersion: quote.marketVersion,
      euroCents: quote.baseEuroCents,
      source: quote.source,
      sourceReference: quote.sourceReference,
      imageUrl: input.imageUrl ?? null,
      expiresAt: new Date(Date.now() + cacheTtlMs),
    }];
  });
  const updates = [
    ...new Map(
      candidates.map((candidate) => [
        `${candidate.catalogueId}\u0000${candidate.stattrak ? "1" : "0"}\u0000${candidate.wear}`,
        candidate,
      ]),
    ).values(),
  ];
  if (!updates.length) return;
  try {
    await recordEconomyMarketVariantPrices(updates);
  } catch {
    // Caching is an availability enhancement, never a reason to reject a
    // verified live quote or a completed market transaction.
  }
}

/** Saves a fresh provider result so the matching variant remains usable offline. */
export async function cacheMarketplaceVariantQuote(
  input: CacheMarketplaceVariantQuoteInput,
) {
  await cacheMarketplaceVariantQuotes([input]);
}
