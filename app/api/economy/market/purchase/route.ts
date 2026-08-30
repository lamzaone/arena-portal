import {
  EconomyRepositoryError,
  getEconomyCatalogueItem,
  isEconomyMarketplacePurchasable,
  isEconomyProfileTheme,
  isEconomyVipMembership,
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
  isStattrakMarketplaceItem,
} from "@/lib/economy/market-pricing";
import {
  cacheMarketplaceVariantQuote,
  getCachedMarketplaceVariantFallback,
} from "@/lib/economy/market-variant-cache";

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

function optionalStattrak(value: unknown): boolean | null {
  if (value === undefined || value === null) return false;
  return typeof value === "boolean" ? value : null;
}

function metadataSeed(metadata: Record<string, unknown>) {
  for (const key of ["seed", "defaultSeed", "patternSeed"]) {
    const value = metadata[key];
    if (typeof value === "number" && Number.isInteger(value) && value >= 0 && value <= 1_000)
      return value;
  }
  return undefined;
}

function isLegacySteamPrice(source: string | undefined) {
  return source?.toLocaleLowerCase("en-US").startsWith("steam") ?? false;
}

export async function POST(request: Request) {
  const context = await readEconomyMutation(request);
  if (isEconomyError(context)) return context;
  const catalogueId = integerField(context.body.catalogueId, 1);
  const quantity =
    context.body.quantity === undefined
      ? 1
      : integerField(context.body.quantity, 1, 50);
  const floatValue = optionalFloat(context.body.floatValue);
  const stattrak = optionalStattrak(context.body.stattrak);
  if (catalogueId === null)
    return economyJsonError("Choose a valid marketplace item.", 400);
  if (quantity === null)
    return economyJsonError("Choose an amount between 1 and 50.", 400);
  if (floatValue === null)
    return economyJsonError("Choose a float between 0 and 1.", 400);
  if (stattrak === null)
    return economyJsonError("Choose a valid StatTrak option.", 400);

  try {
    const catalogue = await getEconomyCatalogueItem(catalogueId);
    if (!catalogue) {
      throw new EconomyRepositoryError(
        "catalogue_not_found",
        "That marketplace item is no longer available.",
      );
    }
    if (!isEconomyMarketplacePurchasable(catalogue)) {
      throw new EconomyRepositoryError(
        "catalogue_unavailable",
        "That marketplace item is not currently purchasable.",
      );
    }

    let resolvedMarketQuote:
      | Parameters<typeof purchaseEconomyItem>[0]["resolvedMarketQuote"]
      | undefined;
    if (stattrak && !isStattrakMarketplaceItem(catalogue.itemType)) {
      throw new EconomyRepositoryError(
        "incompatible_item",
        "StatTrak is available only for weapon skins and knives.",
      );
    }
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
      const fallbackPrice = await getCachedMarketplaceVariantFallback({
        catalogueId,
        floatValue,
        stattrak,
        standardFallback:
          !stattrak && catalogue.price && !isLegacySteamPrice(catalogue.price.source)
            ? {
                eurCents: catalogue.price.euroCents,
                source: catalogue.price.source,
                sourceReference: catalogue.price.sourceReference,
              }
            : null,
      });
      const [quote] = await getMarketplacePriceQuotes([
        {
          itemType: catalogue.itemType,
          displayName: catalogue.displayName,
          marketHashName: catalogue.marketHashName,
          metadata: catalogue.metadata,
          minFloat: catalogue.minFloat,
          maxFloat: catalogue.maxFloat,
          floatValue,
          seed: metadataSeed(catalogue.metadata),
          stattrak,
          exactPatternQuote: true,
          fallbackPrice,
        },
      ]);
      if (!quote || quote.floatValue !== floatValue || !quote.wear) {
        throw new EconomyRepositoryError(
          "price_unavailable",
          stattrak
            ? "No current public StatTrak™ price matched this float."
            : "No current public price matched this float. Ask staff to set a last-known price.",
        );
      }
      await cacheMarketplaceVariantQuote({
        catalogueId,
        stattrak,
        imageUrl: catalogue.imageUrl,
        quote,
      });
      resolvedMarketQuote = {
        baseEuroCents: quote.baseEuroCents,
        euroCents: quote.eurCents,
        source: quote.source,
        sourceReference: quote.sourceReference,
        marketHashName: quote.marketHashName,
        marketVersion: quote.marketVersion,
        floatValue: quote.floatValue,
        wear: quote.wear,
        stattrak: quote.stattrak,
        floatDiscountBps: quote.floatDiscountBps,
        pricingRule: quote.pricingRule,
        fromFallback: quote.fromFallback,
        fallbackStale: quote.fallbackStale,
        fallbackObservedAt: quote.fallbackObservedAt,
      };
    } else if (catalogue.marketHashName) {
      const [quote] = await getMarketplacePriceQuotes([
        {
          itemType: catalogue.itemType,
          displayName: catalogue.displayName,
          marketHashName: catalogue.marketHashName,
          metadata: catalogue.metadata,
          minFloat: catalogue.minFloat,
          maxFloat: catalogue.maxFloat,
          stattrak: false,
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
      if (quote && !quote.fromFallback) {
        // Re-price ordinary market goods before spending Tokens. This shares
        // the same multi-source fallback used by the inventory sell flow.
        const current = catalogue.price;
        if (current?.source !== quote.source || current.euroCents !== quote.eurCents) {
          const priceIdempotencyKey = `price-${context.body.idempotencyKey.slice(0, 122)}`;
          await recordEconomyPrice({
            actorSteamId: context.session.steamId,
            catalogueId,
            eurCents: quote.eurCents,
            source: quote.source,
            ...(quote.sourceReference
              ? { sourceReference: quote.sourceReference }
              : {}),
            idempotencyKey: priceIdempotencyKey,
          });
        }
      } else if (!quote && isLegacySteamPrice(catalogue.price?.source)) {
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
      quantity,
      stattrak,
      ...(floatValue === undefined ? {} : { floatValue }),
      ...(resolvedMarketQuote === undefined ? {} : { resolvedMarketQuote }),
      idempotencyKey: context.body.idempotencyKey,
    });
    return economyJsonSuccess({
      ...result,
      balance: result.wallet.balance,
      message:
        isEconomyVipMembership(catalogue)
          ? "Group membership added to your inventory. Activate it whenever you are ready."
          : isEconomyProfileTheme(catalogue)
            ? "Profile theme added to your inventory. Equip it from the item details."
          : quantity === 1
          ? "Item purchased and added to your inventory."
          : `${quantity} items purchased and added to your inventory.`,
    });
  } catch (error) {
    return economyMutationFailure(error);
  }
}
