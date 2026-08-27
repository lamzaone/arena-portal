import {
  getPlayerEconomyInventoryItem,
  sellEconomyItem,
} from "@/lib/data/portal-repository";
import {
  economyJsonError,
  economyJsonSuccess,
  economyMutationFailure,
  isEconomyError,
  readEconomyMutation,
  textField,
} from "@/lib/economy/request";
import {
  getMarketplacePriceQuotes,
  isFloatPricedMarketplaceItem,
} from "@/lib/economy/market-pricing";
import { getSkinportHistoricalPrice } from "@/lib/economy/skinport-prices";

function catalogueMarketVersion(metadata: Record<string, unknown>) {
  for (const key of ["marketVersion", "skinportVersion", "priceVersion"]) {
    const value = metadata[key];
    if (typeof value === "string" && value.trim() && value.trim().length <= 120)
      return value.trim();
  }
  return null;
}

function isLegacySteamPrice(source: string | undefined) {
  return source?.toLocaleLowerCase("en-US").startsWith("steam") ?? false;
}

function metadataFloat(metadata: Record<string, unknown>, key: string) {
  const value = metadata[key];
  return typeof value === "number" && Number.isFinite(value) ? value : undefined;
}

export async function POST(request: Request) {
  const context = await readEconomyMutation(request);
  if (isEconomyError(context)) return context;
  const itemId = textField(context.body.itemId, 128);
  if (!itemId)
    return economyJsonError("Choose a valid inventory item to sell.", 400);

  try {
    const item = await getPlayerEconomyInventoryItem(
      context.session.steamId,
      itemId,
    );
    if (!item || item.state !== "available") {
      return economyJsonError(
        "That item is not available to sell from your inventory.",
        400,
      );
    }
    if (!item.catalogue) {
      return economyJsonError(
        "This item has no current market or last-known price.",
        409,
      );
    }

    let resolvedMarketPrice:
      | Parameters<typeof sellEconomyItem>[0]["resolvedMarketPrice"]
      | undefined;
    const fallbackPrice =
      item.catalogue.price && !isLegacySteamPrice(item.catalogue.price.source)
        ? {
            eurCents: item.catalogue.price.euroCents,
            source: item.catalogue.price.source,
            sourceReference: item.catalogue.price.sourceReference,
          }
        : null;

    if (
      isFloatPricedMarketplaceItem(item.itemType) &&
      item.floatValue !== null
    ) {
      const [quote] = await getMarketplacePriceQuotes([
        {
          itemType: item.itemType,
          displayName: item.displayName,
          marketHashName: item.catalogue.marketHashName,
          metadata: item.catalogue.metadata,
          minFloat: metadataFloat(item.catalogue.metadata, "minFloat"),
          maxFloat: metadataFloat(item.catalogue.metadata, "maxFloat"),
          floatValue: item.floatValue,
          fallbackPrice,
        },
      ]);
      if (quote && quote.floatValue === item.floatValue) {
        resolvedMarketPrice = {
          tokenPrice: quote.eurCents,
          euroCents: quote.eurCents,
          source: quote.source,
          sourceReference: quote.sourceReference,
          floatValue: quote.floatValue,
          floatDiscountBps: quote.floatDiscountBps,
        };
      }
    } else if (item.catalogue.marketHashName) {
      const price = await getSkinportHistoricalPrice({
        marketHashName: item.catalogue.marketHashName,
        marketVersion: catalogueMarketVersion(item.catalogue.metadata),
      });
      if (price) {
        resolvedMarketPrice = {
          tokenPrice: price.eurCents,
          euroCents: price.eurCents,
          source: price.source,
          sourceReference: price.sourceReference,
          floatValue: null,
          floatDiscountBps: null,
        };
      }
    }

    const result = await sellEconomyItem({
      steamId: context.session.steamId,
      itemId,
      ...(resolvedMarketPrice ? { resolvedMarketPrice } : {}),
      idempotencyKey: context.body.idempotencyKey,
    });
    return economyJsonSuccess({
      ...result,
      balance: result.wallet.balance,
      message: `${item.displayName} sold for ${result.payoutTokens} Tokens (10% of its ${result.marketPriceTokens}-Token market price).`,
    });
  } catch (error) {
    return economyMutationFailure(error);
  }
}
