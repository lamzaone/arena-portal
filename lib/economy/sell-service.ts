import {
  getPlayerEconomyInventoryItem,
  getPlayerEconomyInventoryItems,
  sellEconomyItem,
  sellEconomyItems,
} from "@/lib/data/portal-repository";
import {
  getMarketplacePriceQuotes,
  isStattrakMarketplaceItem,
} from "@/lib/economy/market-pricing";
import {
  cacheMarketplaceVariantQuote,
  cacheMarketplaceVariantQuotes,
  getCachedMarketplaceVariantFallback,
  getCachedMarketplaceVariantFallbacks,
} from "@/lib/economy/market-variant-cache";
import { EconomyRepositoryError } from "@/lib/data/portal-repository";
import { canSellInventoryItem } from "@/lib/economy/inventory-sale-lock";
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

const defaults = {
  getPlayerEconomyInventoryItem,
  getPlayerEconomyInventoryItems,
  sellEconomyItem,
  sellEconomyItems,
  getMarketplacePriceQuotes,
  cacheMarketplaceVariantQuote,
  cacheMarketplaceVariantQuotes,
  getCachedMarketplaceVariantFallback,
  getCachedMarketplaceVariantFallbacks,
};
export function createInventorySaleService(
  overrides: Partial<typeof defaults> = {},
) {
  const {
    getPlayerEconomyInventoryItem,
    getPlayerEconomyInventoryItems,
    sellEconomyItem,
    sellEconomyItems,
    getMarketplacePriceQuotes,
    cacheMarketplaceVariantQuote,
    cacheMarketplaceVariantQuotes,
    getCachedMarketplaceVariantFallback,
    getCachedMarketplaceVariantFallbacks,
  } = { ...defaults, ...overrides };
  return {
    async sell(input: {
      steamId: string;
      itemIds: string[];
      idempotencyKey: string;
    }) {
      const { itemIds } = input;
      const items = await getPlayerEconomyInventoryItems(
        input.steamId,
        itemIds,
      );
      const quoteItems = items.filter(
        (item) =>
          canSellInventoryItem(item) &&
          item.catalogue &&
          item.catalogue.metadata.customServerFinish !== true &&
          (!item.stattrak || isStattrakMarketplaceItem(item.itemType)),
      );
      const fallbacks = await getCachedMarketplaceVariantFallbacks(
        quoteItems.map((item) => ({
          catalogueId: item.catalogueId as number,
          floatValue: item.floatValue,
          stattrak: item.stattrak,
          standardFallback:
            !item.stattrak &&
            item.catalogue?.price &&
            !isLegacySteamPrice(item.catalogue.price.source)
              ? {
                  eurCents: item.catalogue.price.euroCents,
                  source: item.catalogue.price.source,
                  sourceReference: item.catalogue.price.sourceReference,
                }
              : null,
        })),
      );
      const quotes = await getMarketplacePriceQuotes(
        quoteItems.map((item, index) => ({
          itemType: item.itemType,
          displayName: item.displayName,
          marketHashName: item.catalogue?.marketHashName,
          metadata: item.catalogue?.metadata,
          minFloat: metadataFloat(item.catalogue?.metadata ?? {}, [
            "minFloat",
            "floatMin",
            "wearMin",
          ]),
          maxFloat: metadataFloat(item.catalogue?.metadata ?? {}, [
            "maxFloat",
            "floatMax",
            "wearMax",
          ]),
          floatValue: item.floatValue,
          seed: item.seed,
          stattrak: item.stattrak,
          exactPatternQuote: true,
          fallbackPrice: fallbacks[index],
        })),
      );
      await cacheMarketplaceVariantQuotes(
        quoteItems.map((item, index) => ({
          catalogueId: item.catalogueId as number,
          stattrak: item.stattrak,
          imageUrl: null,
          quote: quotes[index],
        })),
      );
      const quotesByItemId = new Map(
        quoteItems.map((item, index) => [item.id, quotes[index]] as const),
      );
      // A custom/legacy skin identity may genuinely have no public listing.
      // Do not let that one row poison an otherwise valid atomic batch: live
      // providers have already been checked above, so leave it unsold and
      // return it to the client for a later retry or staff price correction.
      const skippedItems = quoteItems.flatMap((item, index) =>
        quotes[index] || fallbacks[index]
          ? []
          : [{ itemId: item.id, displayName: item.displayName }],
      );
      const skippedItemIds = new Set(skippedItems.map((item) => item.itemId));
      const saleItemIds = itemIds.filter(
        (itemId) => !skippedItemIds.has(itemId),
      );
      if (!saleItemIds.length) {
        throw new EconomyRepositoryError(
          "price_unavailable",
          "No online market listing matched the selected item variants. Nothing was sold.",
        );
      }
      const result = await sellEconomyItems({
        steamId: input.steamId,
        requestedItemIds: itemIds,
        items: saleItemIds.map((itemId) => {
          const quote = quotesByItemId.get(itemId);
          return {
            itemId,
            ...(quote
              ? {
                  marketQuote: {
                    tokenPrice: quote.eurCents,
                    euroCents: quote.eurCents,
                    source: quote.source,
                    sourceReference: quote.sourceReference,
                    floatValue: quote.floatValue,
                    seed: quote.seed,
                    floatDiscountBps: quote.floatDiscountBps,
                    fromFallback: quote.fromFallback,
                    fallbackStale: quote.fallbackStale,
                    fallbackObservedAt: quote.fallbackObservedAt,
                  },
                }
              : {}),
          };
        }),
        idempotencyKey: input.idempotencyKey,
      });

      return {
        ...result,
        skippedItemIds: itemIds.filter((id) => !result.itemIds.includes(id)),
        skippedItems,
      };
    },
    async sellOne(input: {
      steamId: string;
      itemId: string;
      idempotencyKey: string;
    }) {
      const { itemId } = input;
      // Resolve the quote with the exact public-price adapter the Market tab
      // uses. This closes the gap where a live Market card had a price while an
      // older inventory row had not yet received a persisted price snapshot.
      const item = await getPlayerEconomyInventoryItem(input.steamId, itemId);
      const catalogue = item?.catalogue;
      const customServerFinish =
        catalogue?.metadata.customServerFinish === true;
      const fallbackPrice =
        item && catalogue && item.catalogueId !== null && !customServerFinish
          ? await getCachedMarketplaceVariantFallback({
              catalogueId: item.catalogueId,
              floatValue: item.floatValue,
              stattrak: item.stattrak,
              standardFallback:
                !item.stattrak &&
                catalogue.price &&
                !isLegacySteamPrice(catalogue.price.source)
                  ? {
                      eurCents: catalogue.price.euroCents,
                      source: catalogue.price.source,
                      sourceReference: catalogue.price.sourceReference,
                    }
                  : null,
            })
          : null;
      const [quote] =
        item &&
        canSellInventoryItem(item) &&
        catalogue &&
        !customServerFinish &&
        (!item.stattrak || isStattrakMarketplaceItem(item.itemType))
          ? await getMarketplacePriceQuotes([
              {
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
                seed: item.seed,
                stattrak: item.stattrak,
                exactPatternQuote: true,
                fallbackPrice,
              },
            ])
          : [null];
      if (item && item.catalogueId !== null && !customServerFinish) {
        await cacheMarketplaceVariantQuote({
          catalogueId: item.catalogueId,
          stattrak: item.stattrak,
          imageUrl: null,
          quote,
        });
      }

      const result = await sellEconomyItem({
        steamId: input.steamId,
        itemId,
        ...(quote
          ? {
              marketQuote: {
                // One EUR cent maps to one Token in the portal Market.
                tokenPrice: quote.eurCents,
                euroCents: quote.eurCents,
                source: quote.source,
                sourceReference: quote.sourceReference,
                floatValue: quote.floatValue,
                seed: quote.seed,
                floatDiscountBps: quote.floatDiscountBps,
                fromFallback: quote.fromFallback,
                fallbackStale: quote.fallbackStale,
                fallbackObservedAt: quote.fallbackObservedAt,
              },
            }
          : {}),
        idempotencyKey: input.idempotencyKey,
      });

      return result;
    },
  };
}
export const sellInventorySelection = (
  input: Parameters<ReturnType<typeof createInventorySaleService>["sell"]>[0],
) => createInventorySaleService().sell(input);
export const sellInventoryItem = (
  input: Parameters<
    ReturnType<typeof createInventorySaleService>["sellOne"]
  >[0],
) => createInventorySaleService().sellOne(input);
