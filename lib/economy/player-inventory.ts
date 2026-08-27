import "server-only";

import {
  getPlayerEconomyInventory,
  type EconomyInventoryFilter,
  type EconomyInventoryItem,
  type EconomyInventoryPage,
} from "@/lib/data/portal-repository";
import { getMarketplacePriceQuotes } from "@/lib/economy/market-pricing";

const INVENTORY_PAGE_SIZE = 100;

function metadataFloat(
  metadata: Record<string, unknown>,
  keys: readonly string[],
) {
  for (const key of keys) {
    const value = metadata[key];
    if (typeof value === "number" && Number.isFinite(value)) return value;
  }
  return undefined;
}

function isLegacySteamPrice(source: string | null | undefined) {
  return source?.toLocaleLowerCase("en-US").startsWith("steam") ?? false;
}

/**
 * Applies the same public Market quote used by market cards to every owned
 * inventory item in one batched lookup. A quote is presentation only; selling
 * still re-resolves it within the authenticated mutation route.
 */
async function withCurrentMarketPrices(items: EconomyInventoryItem[]) {
  const quoteable = items.filter((item) => item.catalogue !== null);
  if (!quoteable.length) return items;
  const quotes = await getMarketplacePriceQuotes(
    quoteable.map((item) => {
      const catalogue = item.catalogue!;
      return {
        itemType: item.itemType,
        displayName: item.displayName,
        marketHashName: catalogue.marketHashName,
        metadata: catalogue.metadata,
        minFloat: metadataFloat(catalogue.metadata, [
          "minFloat",
          "floatMin",
          "wearMin",
        ]),
        maxFloat: metadataFloat(catalogue.metadata, [
          "maxFloat",
          "floatMax",
          "wearMax",
        ]),
        floatValue: item.floatValue,
        stattrak: item.stattrak,
        fallbackPrice:
          !item.stattrak && catalogue.price && !isLegacySteamPrice(catalogue.price.source)
            ? {
                eurCents: catalogue.price.euroCents,
                source: catalogue.price.source,
                sourceReference: catalogue.price.sourceReference,
              }
            : null,
      };
    }),
  );
  const quoteByItemId = new Map(
    quoteable.map((item, index) => [item.id, quotes[index]]),
  );
  return items.map((item) => {
    const quote = quoteByItemId.get(item.id);
    if (!quote) return item;
    return {
      ...item,
      marketPriceTokens: quote.eurCents,
      marketPriceEuroCents: quote.eurCents,
      marketPriceSource: quote.source,
      marketPriceFloatValue: quote.floatValue,
      marketPriceWear: quote.wear,
      marketPriceFloatDiscountBps: quote.floatDiscountBps,
    };
  });
}

// The player-facing inventory needs local search and filtering, so gather the
// complete server-authoritative collection instead of silently showing only
// the repository's first default page. The repository still bounds each SQL
// query to 100 rows.
export async function getCompletePlayerEconomyInventory(
  steamId: string,
  filter: Omit<EconomyInventoryFilter, "page" | "pageSize"> = {},
): Promise<EconomyInventoryPage> {
  const first = await getPlayerEconomyInventory(steamId, {
    ...filter,
    page: 1,
    pageSize: INVENTORY_PAGE_SIZE,
  });
  const pageCount = Math.ceil(first.total / INVENTORY_PAGE_SIZE);
  if (pageCount <= 1)
    return { ...first, items: await withCurrentMarketPrices(first.items) };

  // Fetch sequentially so a very large inventory cannot monopolize the
  // portal connection pool while hydration queries are running.
  const items = [...first.items];
  for (let page = 2; page <= pageCount; page += 1) {
    const result = await getPlayerEconomyInventory(steamId, {
      ...filter,
      page,
      pageSize: INVENTORY_PAGE_SIZE,
    });
    items.push(...result.items);
  }
  return { ...first, items: await withCurrentMarketPrices(items) };
}
