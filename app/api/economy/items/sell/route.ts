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
import {
  economyJsonError,
  economyJsonSuccess,
  economyMutationFailure,
  isEconomyError,
  readEconomyMutation,
  stringArrayField,
  textField,
} from "@/lib/economy/request";

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

export async function POST(request: Request) {
  const context = await readEconomyMutation(request);
  if (isEconomyError(context)) return context;
  if (context.body.itemIds !== undefined) {
    const itemIds = stringArrayField(context.body.itemIds, 50);
    if (!itemIds?.length)
      return economyJsonError("Choose between 1 and 50 inventory items to sell.", 400);

    try {
      const items = await getPlayerEconomyInventoryItems(
        context.session.steamId,
        itemIds,
      );
      const quoteItems = items.filter(
        (item) =>
          item.state === "available" &&
          item.tradable &&
          item.stickers.length === 0 &&
          item.catalogue &&
          item.catalogueId !== null &&
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
          // A live exact float/seed lookup is the recovery path for an item
          // that has no reusable last-known variant price. Already-priced
          // entries remain database-only, keeping the common bulk path fast.
          exactPatternQuote: fallbacks[index] === null,
          fallbackPrice: fallbacks[index],
          fallbackOnly: fallbacks[index] !== null,
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
      const saleItemIds = itemIds.filter((itemId) => !skippedItemIds.has(itemId));
      if (!saleItemIds.length) {
        return economyJsonError(
          "No online market listing matched the selected item variants. Nothing was sold.",
          409,
        );
      }
      const result = await sellEconomyItems({
        steamId: context.session.steamId,
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
        idempotencyKey: context.body.idempotencyKey,
      });
      return economyJsonSuccess({
        ...result,
        balance: result.wallet.balance,
        skippedItemIds: skippedItems.map((item) => item.itemId),
        skippedItems,
        message: `${result.itemIds.length} ${result.itemIds.length === 1 ? "item" : "items"} sold for ${result.payoutTokens} Tokens.${skippedItems.length ? ` ${skippedItems.length} ${skippedItems.length === 1 ? "item was" : "items were"} left unsold because no online price matched.` : ""}`,
      });
    } catch (error) {
      return economyMutationFailure(error);
    }
  }
  const itemId = textField(context.body.itemId, 128);
  if (!itemId)
    return economyJsonError("Choose a valid inventory item to sell.", 400);

  try {
    // Resolve the quote with the exact public-price adapter the Market tab
    // uses. This closes the gap where a live Market card had a price while an
    // older inventory row had not yet received a persisted price snapshot.
    const item = await getPlayerEconomyInventoryItem(
      context.session.steamId,
      itemId,
    );
    const catalogue = item?.catalogue;
    const fallbackPrice =
      item && catalogue && item.catalogueId !== null
        ? await getCachedMarketplaceVariantFallback({
            catalogueId: item.catalogueId,
            floatValue: item.floatValue,
            stattrak: item.stattrak,
            standardFallback:
              !item.stattrak && catalogue.price && !isLegacySteamPrice(catalogue.price.source)
                ? {
                    eurCents: catalogue.price.euroCents,
                    source: catalogue.price.source,
                    sourceReference: catalogue.price.sourceReference,
                  }
                : null,
          })
        : null;
    const [quote] = catalogue &&
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
    if (item && item.catalogueId !== null) {
      await cacheMarketplaceVariantQuote({
        catalogueId: item.catalogueId,
        stattrak: item.stattrak,
        imageUrl: null,
        quote,
      });
    }

    const result = await sellEconomyItem({
      steamId: context.session.steamId,
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
      idempotencyKey: context.body.idempotencyKey,
    });
    return economyJsonSuccess({
      ...result,
      balance: result.wallet.balance,
      message: `Item sold for ${result.payoutTokens} Tokens (10% of its ${result.marketPriceTokens}-Token portal market price).`,
    });
  } catch (error) {
    return economyMutationFailure(error);
  }
}
