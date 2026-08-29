import { NextResponse } from "next/server";

import { getSession } from "@/lib/auth/session";
import {
  getEconomyCatalogueItem,
  getEconomyDiscountedPrice,
} from "@/lib/data/portal-repository";
import {
  getMarketplacePriceQuotes,
  isFloatPricedMarketplaceItem,
  isStattrakMarketplaceItem,
} from "@/lib/economy/market-pricing";
import {
  cacheMarketplaceVariantQuote,
  getCachedMarketplaceVariantFallback,
} from "@/lib/economy/market-variant-cache";

function catalogueIdFromSearch(value: string | null) {
  if (!value || !/^\d+$/.test(value)) return null;
  const parsed = Number(value);
  return Number.isSafeInteger(parsed) && parsed > 0 ? parsed : null;
}

function floatFromSearch(value: string | null) {
  if (!value?.trim()) return null;
  const parsed = Number(value);
  if (!Number.isFinite(parsed) || parsed < 0 || parsed > 1) return null;
  return Number(parsed.toFixed(6));
}

function stattrakFromSearch(value: string | null) {
  if (value === null || value === "" || value === "0" || value === "false")
    return false;
  if (value === "1" || value === "true") return true;
  return null;
}

function metadataSeed(metadata: Record<string, unknown>) {
  for (const key of ["seed", "defaultSeed", "patternSeed"]) {
    const value = metadata[key];
    if (typeof value === "number" && Number.isInteger(value) && value >= 0 && value <= 1_000)
      return value;
  }
  return undefined;
}

function legacySteamPrice(source: string | undefined) {
  return source?.toLocaleLowerCase("en-US").startsWith("steam") ?? false;
}

export async function GET(request: Request) {
  const session = await getSession();
  if (!session)
    return NextResponse.json(
      { ok: false, message: "Sign in with Steam before viewing live prices." },
      { status: 401 },
    );

  const url = new URL(request.url);
  const catalogueId = catalogueIdFromSearch(url.searchParams.get("catalogueId"));
  const floatValue = floatFromSearch(url.searchParams.get("float"));
  const stattrak = stattrakFromSearch(url.searchParams.get("stattrak"));
  if (catalogueId === null || floatValue === null) {
    return NextResponse.json(
      { ok: false, message: "Choose a catalogue item and a float between 0 and 1." },
      { status: 400 },
    );
  }
  if (stattrak === null) {
    return NextResponse.json(
      { ok: false, message: "Choose a valid StatTrak option." },
      { status: 400 },
    );
  }

  try {
    const item = await getEconomyCatalogueItem(catalogueId);
    if (!item)
      return NextResponse.json(
        { ok: false, message: "That marketplace item is no longer available." },
        { status: 404 },
      );
    if (!isFloatPricedMarketplaceItem(item.itemType)) {
      return NextResponse.json(
        { ok: false, message: "This item does not support a float-specific price." },
        { status: 400 },
      );
    }
    if (stattrak && !isStattrakMarketplaceItem(item.itemType)) {
      return NextResponse.json(
        { ok: false, message: "StatTrak is available only for weapon skins and knives." },
        { status: 400 },
      );
    }
    const minimumFloat = item.minFloat ?? 0;
    const maximumFloat = item.maxFloat ?? 1;
    if (floatValue < minimumFloat || floatValue > maximumFloat) {
      return NextResponse.json(
        {
          ok: false,
          message: `Choose a float between ${minimumFloat.toFixed(6)} and ${maximumFloat.toFixed(6)} for this item.`,
        },
        { status: 400 },
      );
    }

    const fallbackPrice = await getCachedMarketplaceVariantFallback({
      catalogueId,
      floatValue,
      stattrak,
      standardFallback:
        !stattrak && item.price && !legacySteamPrice(item.price.source)
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
        seed: metadataSeed(item.metadata),
        stattrak,
        exactPatternQuote: true,
        fallbackPrice,
      },
    ]);
    if (!quote || quote.floatValue !== floatValue || !quote.wear) {
      return NextResponse.json(
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

    return NextResponse.json(
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
  } catch {
    return NextResponse.json(
      { ok: false, message: "The live marketplace price could not be loaded. Try again shortly." },
      { status: 503 },
    );
  }
}
