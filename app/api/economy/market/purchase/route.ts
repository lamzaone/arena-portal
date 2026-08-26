import {
  EconomyRepositoryError,
  getEconomyCatalogueItem,
  purchaseEconomyItem,
  recordEconomyPrice,
} from "@/lib/data/portal-repository";
import {
  economyJsonError,
  economyJsonSuccess,
  economyMutationFailure,
  integerField,
  isEconomyError,
  readEconomyMutation,
} from "@/lib/economy/request";
import {
  getMarketplacePriceQuotes,
  isFloatPricedMarketplaceItem,
} from "@/lib/economy/market-pricing";
import { getSkinportHistoricalPrice } from "@/lib/economy/skinport-prices";

function optionalFloat(value: unknown): number | undefined | null {
  if (value === undefined || value === null || value === "") return undefined;
  const parsed =
    typeof value === "number"
      ? value
      : typeof value === "string" && value.trim()
        ? Number(value)
        : Number.NaN;
  if (!Number.isFinite(parsed) || parsed < 0 || parsed > 1) return null;
  return Number(parsed.toFixed(6));
}

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

export async function POST(request: Request) {
  const context = await readEconomyMutation(request);
  if (isEconomyError(context)) return context;
  const catalogueId = integerField(context.body.catalogueId, 1);
  const floatValue = optionalFloat(context.body.floatValue);
  if (catalogueId === null)
    return economyJsonError("Choose a valid marketplace item.", 400);
  if (floatValue === null)
    return economyJsonError("Choose a float between 0 and 1.", 400);

  try {
    const catalogue = await getEconomyCatalogueItem(catalogueId);
    if (!catalogue) {
      throw new EconomyRepositoryError(
        "catalogue_not_found",
        "That marketplace item is no longer available.",
      );
    }

    let resolvedMarketQuote:
      | Parameters<typeof purchaseEconomyItem>[0]["resolvedMarketQuote"]
      | undefined;
    if (isFloatPricedMarketplaceItem(catalogue.itemType)) {
      if (floatValue === undefined) {
        throw new EconomyRepositoryError(
          "invalid_input",
          "Choose a float before buying a skin, knife, or gloves.",
        );
      }
      const minimumFloat = catalogue.minFloat ?? 0;
      const maximumFloat = catalogue.maxFloat ?? 1;
      if (floatValue < minimumFloat || floatValue > maximumFloat) {
        throw new EconomyRepositoryError(
          "invalid_input",
          `Choose a float between ${minimumFloat.toFixed(6)} and ${maximumFloat.toFixed(6)} for this item.`,
        );
      }
      const [quote] = await getMarketplacePriceQuotes([
        {
          itemType: catalogue.itemType,
          displayName: catalogue.displayName,
          marketHashName: catalogue.marketHashName,
          metadata: catalogue.metadata,
          minFloat: catalogue.minFloat,
          maxFloat: catalogue.maxFloat,
          floatValue,
          fallbackPrice:
            catalogue.price && !isLegacySteamPrice(catalogue.price.source)
              ? {
                  eurCents: catalogue.price.euroCents,
                  source: catalogue.price.source,
                  sourceReference: catalogue.price.sourceReference,
                }
              : null,
        },
      ]);
      if (!quote || quote.floatValue !== floatValue || !quote.wear) {
        throw new EconomyRepositoryError(
          "price_unavailable",
          "No current public price matched this float. Ask staff to set a last-known price.",
        );
      }
      resolvedMarketQuote = {
        baseEuroCents: quote.baseEuroCents,
        euroCents: quote.eurCents,
        source: quote.source,
        sourceReference: quote.sourceReference,
        marketHashName: quote.marketHashName,
        marketVersion: quote.marketVersion,
        floatValue: quote.floatValue,
        wear: quote.wear,
        floatDiscountBps: quote.floatDiscountBps,
        pricingRule: "float-linear-v1",
      };
    } else if (catalogue.marketHashName) {
      const price = await getSkinportHistoricalPrice({
        marketHashName: catalogue.marketHashName,
        marketVersion: catalogueMarketVersion(catalogue.metadata),
      });
      if (price) {
        // Re-price non-float items from the same public data source before
        // spending Tokens. Float-specific quotes stay off the shared snapshot
        // because each selected float has a distinct price.
        const current = catalogue.price;
        if (
          current?.source !== price.source ||
          current.euroCents !== price.eurCents
        ) {
          const priceIdempotencyKey = `price-${context.body.idempotencyKey.slice(0, 122)}`;
          await recordEconomyPrice({
            actorSteamId: context.session.steamId,
            catalogueId,
            eurCents: price.eurCents,
            source: price.source,
            sourceReference: price.sourceReference,
            idempotencyKey: priceIdempotencyKey,
          });
        }
      } else if (isLegacySteamPrice(catalogue.price?.source)) {
        throw new EconomyRepositoryError(
          "price_unavailable",
          "No public price matched this item. Ask staff to set a last-known price.",
        );
      }
    } else if (isLegacySteamPrice(catalogue.price?.source)) {
      throw new EconomyRepositoryError(
        "price_unavailable",
        "No public price matched this item. Ask staff to set a last-known price.",
      );
    }

    const result = await purchaseEconomyItem({
      steamId: context.session.steamId,
      catalogueId,
      ...(floatValue === undefined ? {} : { floatValue }),
      ...(resolvedMarketQuote === undefined ? {} : { resolvedMarketQuote }),
      idempotencyKey: context.body.idempotencyKey,
    });
    return economyJsonSuccess({
      ...result,
      balance: result.wallet.balance,
      message: "Item purchased and added to your inventory.",
    });
  } catch (error) {
    return economyMutationFailure(error);
  }
}
