import {
  getPlayerEconomyInventoryItem,
  sellEconomyItem,
} from "@/lib/data/portal-repository";
import { getMarketplacePriceQuotes } from "@/lib/economy/market-pricing";
import {
  economyJsonError,
  economyJsonSuccess,
  economyMutationFailure,
  isEconomyError,
  readEconomyMutation,
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
    const [quote] = catalogue
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
            fallbackPrice:
              catalogue.price && !isLegacySteamPrice(catalogue.price.source)
                ? {
                    eurCents: catalogue.price.euroCents,
                    source: catalogue.price.source,
                    sourceReference: catalogue.price.sourceReference,
                  }
                : null,
          },
        ])
      : [null];

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
              floatDiscountBps: quote.floatDiscountBps,
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
