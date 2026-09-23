import {
  EconomyRepositoryError,
  getEconomyCatalogueItem,
  isEconomyMarketplacePurchasable,
  purchaseEconomyItem,
  recordEconomyPrice,
  getEconomyDiscountedPrice,
  getEconomyMarketplaceBasePrice,
  type PurchaseEconomyItemInput,
} from "@/lib/data/portal-repository";
import {
  getMarketplacePriceQuotes,
  isFloatPricedMarketplaceItem,
  isStattrakMarketplaceItem,
  marketplaceWearLabel,
} from "@/lib/economy/market-pricing";
import {
  cacheMarketplaceVariantQuote,
  getCachedMarketplaceVariantFallback,
} from "@/lib/economy/market-variant-cache";

function isLegacySteamPrice(source: string | undefined) {
  return source?.toLocaleLowerCase("en-US").startsWith("steam") ?? false;
}
const defaults = {
  getEconomyCatalogueItem,
  isEconomyMarketplacePurchasable,
  purchaseEconomyItem,
  recordEconomyPrice,
  getEconomyDiscountedPrice,
  getEconomyMarketplaceBasePrice,
  getMarketplacePriceQuotes,
  cacheMarketplaceVariantQuote,
  getCachedMarketplaceVariantFallback,
};
export function createMarketplaceService(
  overrides: Partial<typeof defaults> = {},
) {
  const {
    getEconomyCatalogueItem,
    isEconomyMarketplacePurchasable,
    purchaseEconomyItem,
    recordEconomyPrice,
    getEconomyDiscountedPrice,
    getEconomyMarketplaceBasePrice,
    getMarketplacePriceQuotes,
    cacheMarketplaceVariantQuote,
    getCachedMarketplaceVariantFallback,
  } = { ...defaults, ...overrides };
  function marketplaceQuoteResult(
    body: { ok: boolean; [key: string]: unknown },
    options?: { status?: number; headers?: Record<string, string> },
  ) {
    if (!body.ok)
      throw new EconomyRepositoryError(
        options?.status === 404
          ? "catalogue_not_found"
          : options?.status === 409
            ? "price_unavailable"
            : "invalid_input",
        String(body.message),
      );
    return body;
  }
  async function quoteFloat(input: {
    catalogueId: number;
    floatValue: number;
    seed: number;
    stattrak: boolean;
  }) {
    const { catalogueId, floatValue, seed, stattrak } = input;
    const item = await getEconomyCatalogueItem(catalogueId);
    if (!item)
      return marketplaceQuoteResult(
        { ok: false, message: "That marketplace item is no longer available." },
        { status: 404 },
      );
    if (!isFloatPricedMarketplaceItem(item.itemType)) {
      return marketplaceQuoteResult(
        {
          ok: false,
          message: "This item does not support a float-specific price.",
        },
        { status: 400 },
      );
    }
    if (stattrak && !isStattrakMarketplaceItem(item.itemType)) {
      return marketplaceQuoteResult(
        {
          ok: false,
          message: "StatTrak is available only for weapon skins and knives.",
        },
        { status: 400 },
      );
    }
    const minimumFloat = item.minFloat ?? 0;
    const maximumFloat = item.maxFloat ?? 1;
    if (floatValue < minimumFloat || floatValue > maximumFloat) {
      return marketplaceQuoteResult(
        {
          ok: false,
          message: `Choose a float between ${minimumFloat.toFixed(6)} and ${maximumFloat.toFixed(6)} for this item.`,
        },
        { status: 400 },
      );
    }

    if (item.metadata.customServerFinish === true) {
      const price = item.price;
      if (
        !price ||
        price.source !== "staff-last-known" ||
        price.sourceReference !== "staff-panel" ||
        price.euroCents <= 0 ||
        price.tokenPrice <= 0
      ) {
        return marketplaceQuoteResult(
          {
            ok: false,
            message: "This custom server finish needs a current staff price.",
          },
          { status: 409 },
        );
      }
      const discounted = await getEconomyDiscountedPrice({
        catalogueId,
        itemType: item.itemType,
        basePriceTokens: price.tokenPrice,
      });
      return marketplaceQuoteResult(
        {
          ok: true,
          priceTokens: discounted.finalPriceTokens,
          basePriceTokens: discounted.basePriceTokens,
          euroCents: price.euroCents,
          originalEuroCents: price.euroCents,
          baseEuroCents: price.euroCents,
          discount: discounted.appliedDiscount,
          source: price.source,
          floatValue,
          wear: marketplaceWearLabel(floatValue),
          stattrak,
          floatDiscountBps: 0,
          pricingRule: "custom-server-fixed-v1",
          seed,
          seedMatched: false,
        },
        { headers: { "Cache-Control": "private, no-store" } },
      );
    }

    const fallbackPrice = await getCachedMarketplaceVariantFallback({
      catalogueId,
      floatValue,
      stattrak,
      standardFallback:
        !stattrak && item.price && !isLegacySteamPrice(item.price.source)
          ? {
              eurCents: item.price.euroCents,
              source: item.price.source,
              sourceReference: item.price.sourceReference,
            }
          : null,
    });
    const [quote] = await getMarketplacePriceQuotes([
      {
        itemType: item.itemType,
        displayName: item.displayName,
        marketHashName: item.marketHashName,
        metadata: item.metadata,
        minFloat: item.minFloat,
        maxFloat: item.maxFloat,
        floatValue,
        seed,
        stattrak,
        exactPatternQuote: true,
        fallbackPrice,
      },
    ]);
    if (
      !quote ||
      quote.floatValue !== floatValue ||
      quote.seed !== seed ||
      !quote.wear
    ) {
      return marketplaceQuoteResult(
        {
          ok: false,
          message: stattrak
            ? "No current public StatTrak™ price matched this float."
            : "No current public price matched this float. Ask staff to set a last-known price.",
        },
        { status: 409 },
      );
    }
    await cacheMarketplaceVariantQuote({
      catalogueId,
      stattrak,
      imageUrl: item.imageUrl,
      quote,
    });
    const discounted = await getEconomyDiscountedPrice({
      catalogueId,
      itemType: item.itemType,
      basePriceTokens: quote.eurCents,
    });

    return marketplaceQuoteResult(
      {
        ok: true,
        // The public/float quote is the promotion base. One active admin rule
        // may reduce it, so both amounts are returned for honest presentation.
        priceTokens: discounted.finalPriceTokens,
        basePriceTokens: discounted.basePriceTokens,
        // Discounts affect the Token checkout price, not the public EUR quote.
        euroCents: quote.eurCents,
        originalEuroCents: quote.eurCents,
        baseEuroCents: quote.baseEuroCents,
        discount: discounted.appliedDiscount,
        source: quote.source,
        floatValue: quote.floatValue,
        wear: quote.wear,
        stattrak: quote.stattrak,
        floatDiscountBps: quote.floatDiscountBps,
        pricingRule: quote.pricingRule,
        seed: quote.seed,
        seedMatched: quote.seedMatched,
      },
      { headers: { "Cache-Control": "private, no-store" } },
    );
  }
  return {
    quoteFloat,
    async purchase(
      input: Omit<PurchaseEconomyItemInput, "resolvedMarketQuote">,
    ) {
      const {
        catalogueId,
        quantity = 1,
        floatValue,
        seed,
        expectedUnitPriceTokens,
        stattrak = false,
      } = input;
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
        if (
          expectedUnitPriceTokens === undefined ||
          expectedUnitPriceTokens === null
        ) {
          throw new EconomyRepositoryError(
            "invalid_input",
            "Load a current price before buying a skin, knife, or gloves.",
          );
        }
        if (floatValue === undefined) {
          throw new EconomyRepositoryError(
            "invalid_input",
            "Choose a float before buying a skin, knife, or gloves.",
          );
        }
        if (seed === undefined) {
          throw new EconomyRepositoryError(
            "invalid_input",
            "Choose a seed before buying a skin, knife, or gloves.",
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
        if (catalogue.metadata.customServerFinish !== true) {
          const fallbackPrice = await getCachedMarketplaceVariantFallback({
            catalogueId,
            floatValue,
            stattrak,
            standardFallback:
              !stattrak &&
              catalogue.price &&
              !isLegacySteamPrice(catalogue.price.source)
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
              seed,
              stattrak,
              exactPatternQuote: true,
              fallbackPrice,
            },
          ]);
          if (
            !quote ||
            quote.floatValue !== floatValue ||
            quote.seed !== seed ||
            !quote.wear
          ) {
            throw new EconomyRepositoryError(
              "price_unavailable",
              stattrak
                ? "No current public StatTrak price matched this float."
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
            seed: quote.seed,
            seedMatched: quote.seedMatched,
            floatDiscountBps: quote.floatDiscountBps,
            pricingRule: quote.pricingRule,
            fromFallback: quote.fromFallback,
            fallbackStale: quote.fallbackStale,
            fallbackObservedAt: quote.fallbackObservedAt,
          };
        }
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
          if (
            current?.source !== quote.source ||
            current.euroCents !== quote.eurCents
          ) {
            const priceIdempotencyKey = `price-${input.idempotencyKey.slice(0, 122)}`;
            await recordEconomyPrice({
              actorSteamId: input.steamId,
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
        steamId: input.steamId,
        catalogueId,
        quantity,
        stattrak,
        ...(floatValue === undefined ? {} : { floatValue }),
        ...(seed === undefined ? {} : { seed }),
        ...(expectedUnitPriceTokens != null ? { expectedUnitPriceTokens } : {}),
        ...(resolvedMarketQuote === undefined ? {} : { resolvedMarketQuote }),
        idempotencyKey: input.idempotencyKey,
      });

      return result;
    },
    async quote(input: {
      steamId: string;
      catalogueId: number;
      quantity: number;
      floatValue?: number;
      seed?: number;
      stattrak: boolean;
    }) {
      const { catalogueId, quantity, floatValue, seed, stattrak } = input;
      const item = await getEconomyCatalogueItem(catalogueId);
      if (!item || !isEconomyMarketplacePurchasable(item))
        throw new EconomyRepositoryError(
          "catalogue_unavailable",
          "That marketplace item is unavailable.",
        );
      if (quantity > 1 && !["crate", "capsule"].includes(item.itemType))
        throw new EconomyRepositoryError(
          "incompatible_item",
          "Only containers support a quantity above one.",
        );
      if (
        stattrak &&
        (!isStattrakMarketplaceItem(item.itemType) ||
          item.metadata.supportsStattrak === false)
      )
        throw new EconomyRepositoryError(
          "incompatible_item",
          "This item does not support StatTrak.",
        );
      let basePriceTokens: number | null = null;
      if (isFloatPricedMarketplaceItem(item.itemType)) {
        if (floatValue === undefined || seed === undefined)
          throw new EconomyRepositoryError(
            "invalid_input",
            "Choose a valid float and seed.",
          );
        const detail = await quoteFloat({
          catalogueId,
          floatValue,
          seed,
          stattrak,
        });
        const unit = Number(detail.priceTokens);
        const total = unit * quantity;
        if (!Number.isSafeInteger(unit) || !Number.isSafeInteger(total))
          throw new EconomyRepositoryError(
            "invalid_input",
            "The total price is too large.",
          );
        return {
          catalogueId,
          quantity,
          unitPriceTokens: String(unit),
          totalPriceTokens: String(total),
          floatValue,
          seed,
          stattrak,
          quotedAt: new Date().toISOString(),
        };
      } else {
        basePriceTokens = await getEconomyMarketplaceBasePrice(catalogueId);
        if (item.marketHashName) {
          const [quote] = await getMarketplacePriceQuotes([
            {
              itemType: item.itemType,
              displayName: item.displayName,
              marketHashName: item.marketHashName,
              metadata: item.metadata,
              minFloat: item.minFloat,
              maxFloat: item.maxFloat,
              stattrak: false,
              fallbackPrice:
                item.price && !isLegacySteamPrice(item.price.source)
                  ? {
                      eurCents: item.price.euroCents,
                      source: item.price.source,
                      sourceReference: item.price.sourceReference,
                    }
                  : null,
            },
          ]);
          if (quote) basePriceTokens = quote.eurCents;
          else if (isLegacySteamPrice(item.price?.source))
            basePriceTokens = null;
        } else if (isLegacySteamPrice(item.price?.source)) {
          basePriceTokens = null;
        }
      }
      if (basePriceTokens === null)
        throw new EconomyRepositoryError(
          "price_unavailable",
          "A current price is unavailable.",
        );
      const discounted = await getEconomyDiscountedPrice({
        catalogueId,
        itemType: item.itemType,
        basePriceTokens,
      });
      const total = discounted.finalPriceTokens * quantity;
      if (!Number.isSafeInteger(total))
        throw new EconomyRepositoryError(
          "invalid_input",
          "The total price is too large.",
        );
      return {
        catalogueId,
        quantity,
        unitPriceTokens: String(discounted.finalPriceTokens),
        totalPriceTokens: String(total),
        floatValue: floatValue ?? null,
        seed: seed ?? null,
        stattrak,
        quotedAt: new Date().toISOString(),
      };
    },
  };
}
export const purchaseMarketplaceSelection = (
  input: Omit<PurchaseEconomyItemInput, "resolvedMarketQuote">,
) => createMarketplaceService().purchase(input);
export const quoteMarketplaceSelection = (
  input: Parameters<ReturnType<typeof createMarketplaceService>["quote"]>[0],
) => createMarketplaceService().quote(input);

export const quoteMarketplaceFloatSelection = (
  input: Parameters<
    ReturnType<typeof createMarketplaceService>["quoteFloat"]
  >[0],
) => createMarketplaceService().quoteFloat(input);
