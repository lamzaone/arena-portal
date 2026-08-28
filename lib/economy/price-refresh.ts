import "server-only";

import {
  getEconomyPublicPriceRefreshCandidates,
  recordAutomaticEconomyPublicPrices,
  recordEconomyMarketVariantPrices,
  withEconomyPublicPriceRefreshLock,
  type EconomyPublicPriceRefreshUpdate,
} from "@/lib/data/portal-repository";
import {
  getMarketplacePriceQuotes,
  isStattrakMarketplaceItem,
} from "@/lib/economy/market-pricing";

const refreshBatchSize = 500;
const variantCacheTtlMs = 6 * 60 * 60 * 1_000;

export type EconomyPublicPriceRefreshResult = {
  status: "refreshed" | "busy" | "unavailable";
  scanned: number;
  matched: number;
  updated: number;
  variantCached: number;
  unmatched: number;
};

type PriceRefreshLookup = {
  candidateIndex: number;
  stattrak: boolean;
};

/**
 * Warms database-backed public prices when the portal starts. Unlike the old
 * market-hash-only sweep, this derives every official skin's exterior name
 * from marketBaseName, and warms both normal and StatTrak™ identities. Exact
 * float/seed requests still use the live listing source first, then fall back
 * to the cached matching exterior when a provider is temporarily unavailable.
 */
export async function refreshAllEconomyPublicPrices(): Promise<EconomyPublicPriceRefreshResult> {
  const lock = await withEconomyPublicPriceRefreshLock(async () => {
    const candidates = await getEconomyPublicPriceRefreshCandidates();
    const lookups: PriceRefreshLookup[] = [];
    for (let index = 0; index < candidates.length; index += 1) {
      lookups.push({ candidateIndex: index, stattrak: false });
      if (isStattrakMarketplaceItem(candidates[index].itemType)) {
        lookups.push({ candidateIndex: index, stattrak: true });
      }
    }

    const updates: EconomyPublicPriceRefreshUpdate[] = [];
    const variantUpdates: Parameters<
      typeof recordEconomyMarketVariantPrices
    >[0][number][] = [];
    let matched = 0;

    for (let offset = 0; offset < lookups.length; offset += refreshBatchSize) {
      const batch = lookups.slice(offset, offset + refreshBatchSize);
      const quotes = await getMarketplacePriceQuotes(
        batch.map(({ candidateIndex, stattrak }) => {
          const candidate = candidates[candidateIndex];
          return {
            itemType: candidate.itemType,
            displayName: candidate.displayName,
            marketHashName: candidate.marketHashName,
            metadata: candidate.metadata,
            minFloat: candidate.minFloat,
            maxFloat: candidate.maxFloat,
            stattrak,
            // The standard catalogue snapshot is a legitimate last-known
            // fallback only for the matching normal variant. StatTrak is
            // always stored independently in the variant cache below.
            fallbackPrice:
              !stattrak && candidate.currentPrice
                ? {
                    eurCents: candidate.currentPrice.euroCents,
                    source: candidate.currentPrice.source,
                    sourceReference: candidate.currentPrice.sourceReference,
                  }
                : null,
          };
        }),
      );

      for (let index = 0; index < quotes.length; index += 1) {
        const quote = quotes[index];
        if (!quote) continue;
        const lookup = batch[index];
        const candidate = candidates[lookup.candidateIndex];
        // A stored fallback should keep the UI usable, but it is not a new
        // public observation and must not be re-recorded as one.
        if (quote.fromFallback) continue;
        matched += 1;
        variantUpdates.push({
          catalogueId: candidate.catalogueId,
          stattrak: lookup.stattrak,
          wear: quote.wear ?? "Standard",
          marketHashName: quote.marketHashName ?? candidate.displayName,
          marketVersion: quote.marketVersion,
          euroCents: quote.eurCents,
          source: quote.source,
          sourceReference: quote.sourceReference,
          imageUrl: candidate.imageUrl,
          expiresAt: new Date(Date.now() + variantCacheTtlMs),
        });
        if (lookup.stattrak) continue;
        const current = candidate.currentPrice;
        if (
          current?.euroCents === quote.eurCents &&
          current.source === quote.source &&
          current.sourceReference === quote.sourceReference
        ) {
          continue;
        }
        updates.push({
          catalogueId: candidate.catalogueId,
          eurCents: quote.eurCents,
          source: quote.source,
          sourceReference:
            quote.sourceReference ??
            candidate.marketHashName ??
            candidate.displayName,
        });
      }
    }

    const [updated, variantCached] = await Promise.all([
      recordAutomaticEconomyPublicPrices(updates),
      recordEconomyMarketVariantPrices(variantUpdates),
    ]);
    return {
      status: "refreshed" as const,
      scanned: candidates.length,
      matched,
      updated,
      variantCached,
      unmatched: lookups.length - matched,
    };
  });

  if (!lock.available)
    return {
      status: "unavailable",
      scanned: 0,
      matched: 0,
      updated: 0,
      variantCached: 0,
      unmatched: 0,
    };
  if (!lock.acquired)
    return {
      status: "busy",
      scanned: 0,
      matched: 0,
      updated: 0,
      variantCached: 0,
      unmatched: 0,
    };
  return lock.value ?? {
    status: "busy",
    scanned: 0,
    matched: 0,
    updated: 0,
    variantCached: 0,
    unmatched: 0,
  };
}
