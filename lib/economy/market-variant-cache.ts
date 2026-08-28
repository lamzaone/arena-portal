import "server-only";

import {
  getEconomyMarketVariantPrice,
  getEconomyMarketVariantPrices,
  recordEconomyMarketVariantPrices,
} from "@/lib/data/portal-repository";
import {
  marketplaceWearLabel,
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
  cached: { euroCents: number; source: string; sourceReference: string | null; stale: boolean } | null,
): MarketplacePriceFallback | null {
  if (cached) {
    return {
      eurCents: cached.euroCents,
      source: cached.stale
        ? `${cached.source}-last-known`
        : cached.source,
      sourceReference: cached.sourceReference,
    };
  }
  return input.stattrak ? null : input.standardFallback ?? null;
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

/** Saves a fresh provider result so the matching variant remains usable offline. */
export async function cacheMarketplaceVariantQuote(input: {
  catalogueId: number;
  stattrak: boolean;
  imageUrl: string | null | undefined;
  quote: MarketplacePriceQuote | null | undefined;
}) {
  const quote = input.quote;
  if (!quote || quote.fromFallback) return;
  try {
    await recordEconomyMarketVariantPrices([
      {
        catalogueId: input.catalogueId,
        stattrak: input.stattrak,
        wear: quote.wear ?? "Standard",
        marketHashName: quote.marketHashName ?? "CS2 item",
        marketVersion: quote.marketVersion,
        euroCents: quote.eurCents,
        source: quote.source,
        sourceReference: quote.sourceReference,
        imageUrl: input.imageUrl ?? null,
        expiresAt: new Date(Date.now() + cacheTtlMs),
      },
    ]);
  } catch {
    // Caching is an availability enhancement, never a reason to reject a
    // verified live quote or a completed market transaction.
  }
}
