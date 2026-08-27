import "server-only";

import {
  getEconomyPublicPriceRefreshCandidates,
  recordAutomaticEconomyPublicPrices,
  withEconomyPublicPriceRefreshLock,
  type EconomyPublicPriceRefreshUpdate,
} from "@/lib/data/portal-repository";
import { getExternalMarketPrices } from "@/lib/economy/external-market-prices";
import { getSkinportHistoricalPrices } from "@/lib/economy/skinport-prices";

export type EconomyPublicPriceRefreshResult = {
  status: "refreshed" | "busy" | "unavailable";
  scanned: number;
  matched: number;
  updated: number;
  unmatched: number;
};

function marketVersion(metadata: Record<string, unknown>) {
  for (const key of ["marketVersion", "skinportVersion", "priceVersion"]) {
    const value = metadata[key];
    if (typeof value === "string" && value.trim() && value.trim().length <= 120)
      return value.trim();
  }
  return null;
}

/**
 * Reads the stable Skinport sales snapshot first, then fills only unmatched
 * identities from independent CSFloat/SkinCash public indexes. This keeps the
 * automatic price worker from leaving newly-listed variants at a stale value.
 */
export async function refreshAllEconomyPublicPrices(): Promise<EconomyPublicPriceRefreshResult> {
  const lock = await withEconomyPublicPriceRefreshLock(async () => {
    const candidates = await getEconomyPublicPriceRefreshCandidates();
    const quotes = await getSkinportHistoricalPrices(
      candidates.map((candidate) => ({
        marketHashName: candidate.marketHashName,
        marketVersion: marketVersion(candidate.metadata),
      })),
    );
    const externalIndexes = quotes
      .map((quote, index) =>
        quote || marketVersion(candidates[index].metadata) ? null : index,
      )
      .filter((index): index is number => index !== null);
    const externalQuotes = await getExternalMarketPrices(
      externalIndexes.map((index) => candidates[index].marketHashName),
    );
    const externalQuoteByIndex = new Map<number, (typeof externalQuotes)[number]>();
    for (let index = 0; index < externalIndexes.length; index += 1) {
      externalQuoteByIndex.set(externalIndexes[index], externalQuotes[index]);
    }

    const updates: EconomyPublicPriceRefreshUpdate[] = [];
    let matched = 0;
    for (let index = 0; index < candidates.length; index += 1) {
      const candidate = candidates[index];
      const quote = quotes[index] ?? externalQuoteByIndex.get(index);
      if (!quote) continue;
      matched += 1;
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
        sourceReference: quote.sourceReference,
      });
    }

    const updated = await recordAutomaticEconomyPublicPrices(updates);
    return {
      status: "refreshed" as const,
      scanned: candidates.length,
      matched,
      updated,
      unmatched: candidates.length - matched,
    };
  });

  if (!lock.available)
    return { status: "unavailable", scanned: 0, matched: 0, updated: 0, unmatched: 0 };
  if (!lock.acquired)
    return { status: "busy", scanned: 0, matched: 0, updated: 0, unmatched: 0 };
  return lock.value ?? {
    status: "busy",
    scanned: 0,
    matched: 0,
    updated: 0,
    unmatched: 0,
  };
}
