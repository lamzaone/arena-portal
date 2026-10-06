import "server-only";

import {
  getSkinportHistoricalPrices,
  type SkinportHistoricalPrice,
} from "@/lib/economy/skinport-prices";
import {
  getCsfloatExactListingPrice,
  getExternalMarketPrices,
  type ExternalMarketPrice,
} from "@/lib/economy/external-market-prices";

const defaultMarketplaceFloat = 0.15;
export const maximumMarketplaceFloatDiscountBps = 1_500;
const floatPrecision = 1_000_000;

export type MarketplaceFloatRange = {
  minFloat: number;
  maxFloat: number;
};

export type MarketplacePriceCandidate = {
  marketHashName: string;
  marketVersion: string | null;
};

export type MarketplacePriceIdentityInput = {
  itemType: string;
  displayName: string;
  definitionIndex?: number | null;
  paintkit?: number | null;
  marketHashName: string | null | undefined;
  metadata: Record<string, unknown> | null | undefined;
  minFloat: number | null | undefined;
  maxFloat: number | null | undefined;
  floatValue?: number | null | undefined;
  seed?: number | null | undefined;
  // StatTrak™ is a distinct public-market identity from the standard item.
  stattrak?: boolean | null | undefined;
  // Requests the selected seed/float listing when the server has a CSFloat
  // key. Without matching evidence the quote remains an explicit estimate.
  exactPatternQuote?: boolean | null | undefined;
};

export type MarketplacePriceIdentity = {
  floatRange: MarketplaceFloatRange | null;
  floatValue: number | null;
  seed: number | null;
  wear: string | null;
  stattrak: boolean;
  marketVersion: string | null;
  candidates: readonly MarketplacePriceCandidate[];
};

export type MarketplacePriceFallback = {
  eurCents: number;
  source: string;
  // Variant snapshots retain their identity across catalogue corrections.
  marketHashName?: string | null;
  marketVersion?: string | null;
  sourceReference?: string | null | undefined;
  // Persisted provider snapshots carry their age into the final quote so
  // mutations can record when a last-known value was used.
  observedAt?: string | null | undefined;
  stale?: boolean | undefined;
};

export const MAXIMUM_MARKETPLACE_FALLBACK_AGE_MS = 24 * 60 * 60 * 1_000;

export type MarketplacePriceInput = MarketplacePriceIdentityInput & {
  // A non-Steam, staff-maintained last-known quote may be supplied by the
  // caller when the public database does not have this exact market identity.
  // It is intentionally only a fallback; Skinport is always preferred.
  fallbackPrice?: MarketplacePriceFallback | null | undefined;
  // Bulk mutations can reuse an already verified matching variant and reserve
  // remote provider work for entries that are actually missing a price.
  fallbackOnly?: boolean | null | undefined;
};

export type MarketplacePriceQuote = {
  // The public-price value before a selected item's exact float adjustment.
  baseEuroCents: number;
  // The amount to translate to Tokens for this selected float.
  eurCents: number;
  source: SkinportHistoricalPrice["source"] | string;
  sourceReference: string | null;
  marketHashName: string | null;
  marketVersion: string | null;
  floatValue: number | null;
  wear: string | null;
  stattrak: boolean;
  // Basis points discounted from the selected exterior/base price. 1,500 is
  // 15%, reached only at the highest allowed float for that item.
  floatDiscountBps: number;
  pricingRule: "float-linear-v1" | "external-exact-v2";
  seed: number | null;
  seedMatched: boolean;
  fromFallback: boolean;
  fallbackStale: boolean;
  fallbackObservedAt: string | null;
};

function normalizedText(value: unknown) {
  return typeof value === "string"
    ? value.normalize("NFC").replace(/\s+/g, " ").trim()
    : "";
}

function normalizedKey(value: string | null | undefined) {
  return normalizedText(value).normalize("NFKC").toLocaleLowerCase("en-US");
}

function metadataText(
  metadata: Record<string, unknown> | null | undefined,
  keys: readonly string[],
) {
  if (!metadata) return null;
  for (const key of keys) {
    const value = normalizedText(metadata[key]);
    if (value) return value;
  }
  return null;
}

function boundedFloat(value: number | null | undefined) {
  return typeof value === "number" && Number.isFinite(value) && value >= 0 && value <= 1
    ? Math.round(value * floatPrecision) / floatPrecision
    : null;
}

function boundedSeed(value: number | null | undefined) {
  return typeof value === "number" &&
    Number.isInteger(value) &&
    value >= 0 &&
    value <= 1_000
    ? value
    : null;
}

function withinRange(value: number, range: MarketplaceFloatRange) {
  return Math.min(range.maxFloat, Math.max(range.minFloat, value));
}

function addCandidate(
  candidates: MarketplacePriceCandidate[],
  marketHashName: string | null | undefined,
  marketVersion: string | null,
) {
  const value = normalizedText(marketHashName);
  if (!value || value.length > 255) return;
  const key = `${normalizedKey(value)}\u0000${normalizedKey(marketVersion)}`;
  if (
    candidates.some(
      (candidate) =>
        `${normalizedKey(candidate.marketHashName)}\u0000${normalizedKey(candidate.marketVersion)}` === key,
    )
  ) {
    return;
  }
  candidates.push({ marketHashName: value, marketVersion });
}

function stripWearSuffix(value: string) {
  return value.replace(
    /\s*\((?:Factory New|Minimal Wear|Field-Tested|Well-Worn|Battle-Scarred)\)\s*$/iu,
    "",
  );
}

function stripStarPrefix(value: string) {
  return value.replace(/^\s*\u2605\s*/u, "").trim();
}

function stattrakMarketHashName(value: string) {
  const normalized = normalizedText(value);
  if (!normalized) return "";
  // Preserve manually-normalized catalogue names while using Skinport's
  // exact StatTrak™ public-market identity for ordinary items.
  return /^stattrak(?:™|TM)?\s+/iu.test(normalized)
    ? normalized.replace(/^stattrak(?:™|TM)?\s+/iu, "StatTrak™ ")
    : `StatTrak™ ${normalized}`;
}

function validEuroCents(value: unknown) {
  return typeof value === "number" &&
    Number.isSafeInteger(value) &&
    value > 0 &&
    value <= 1_000_000_000
    ? value
    : null;
}

/** Whether this catalogue item has an exterior float that affects its price. */
export function isFloatPricedMarketplaceItem(itemType: string | null | undefined) {
  return ["skin", "knife", "glove"].includes(normalizedKey(itemType));
}

/** Automatic catalogue snapshots hold one adjusted display price, without an exterior/base identity. */
export function isCatalogueMarketplaceFallbackAllowed(itemType: string, source: string | null | undefined) {
  return !isFloatPricedMarketplaceItem(itemType) || normalizedKey(source) === "staff-last-known";
}

/** CS2 has marketable StatTrak™ variants for weapon skins and knives. */
export function isStattrakMarketplaceItem(itemType: string | null | undefined) {
  return ["skin", "knife"].includes(normalizedKey(itemType));
}

/**
 * Returns the item's valid float range. Missing legacy bounds mean the normal
 * CS2 0.000000–1.000000 range; reversed data is safely normalized.
 */
export function normalizeMarketplaceFloatRange(
  input: Pick<
    MarketplacePriceIdentityInput,
    "itemType" | "minFloat" | "maxFloat"
  > & { metadata?: Record<string, unknown> | null },
): MarketplaceFloatRange | null {
  if (input.metadata?.vanillaKnife === true) return { minFloat: 0, maxFloat: 0 };
  if (!isFloatPricedMarketplaceItem(input.itemType)) return null;

  const configuredMin = boundedFloat(input.minFloat);
  const configuredMax = boundedFloat(input.maxFloat);
  let minFloat = configuredMin ?? 0;
  let maxFloat = configuredMax ?? 1;
  if (minFloat > maxFloat) [minFloat, maxFloat] = [maxFloat, minFloat];
  return { minFloat, maxFloat };
}

/**
 * Normalizes a requested float to an item's actual range. A missing or invalid
 * value starts at 0.15 (Minimal Wear), then is clamped for constrained items.
 */
export function normalizeMarketplaceFloatValue(
  input: Pick<
    MarketplacePriceIdentityInput,
    "itemType" | "minFloat" | "maxFloat" | "floatValue"
  > & { metadata?: Record<string, unknown> | null },
) {
  const floatRange = normalizeMarketplaceFloatRange(input);
  if (!floatRange) return null;
  const requested = boundedFloat(input.floatValue) ?? defaultMarketplaceFloat;
  return Math.round(withinRange(requested, floatRange) * floatPrecision) / floatPrecision;
}

export function marketplaceWearLabel(floatValue: number | null | undefined) {
  const value = boundedFloat(floatValue);
  if (value === null) return null;
  if (value <= 0.07) return "Factory New";
  if (value <= 0.15) return "Minimal Wear";
  if (value <= 0.38) return "Field-Tested";
  if (value <= 0.45) return "Well-Worn";
  return "Battle-Scarred";
}

/**
 * Builds the precise public-market identities for an item. For weapon
 * finishes this derives an exterior-specific name from `marketBaseName`; for
 * knives and gloves it checks the Steam star-prefixed form first.
 */
export function deriveMarketplacePriceIdentity(
  input: MarketplacePriceIdentityInput,
): MarketplacePriceIdentity {
  const rawBaseName = metadataText(input.metadata, ["marketBaseName"]) || normalizedText(input.displayName) || normalizedText(input.marketHashName);
  const versionSuffix = stripWearSuffix(rawBaseName).match(/\b(?:Gamma )?Doppler\s*\((Phase [1-4]|Ruby|Sapphire|Black Pearl|Emerald)\)$/iu)?.[1] ?? null;
  const marketVersion = metadataText(input.metadata, [
    "marketVersion",
    "skinportVersion",
    "priceVersion",
  ]) ?? versionSuffix;
  const floatRange = normalizeMarketplaceFloatRange(input);
  const floatValue = normalizeMarketplaceFloatValue(input);
  const seed = boundedSeed(input.seed);
  const vanillaKnife = input.metadata?.vanillaKnife === true;
  const wear = vanillaKnife ? "Vanilla" : marketplaceWearLabel(floatValue);
  const stattrak =
    input.stattrak === true && isStattrakMarketplaceItem(input.itemType);
  const baseCandidates: MarketplacePriceCandidate[] = [];
  const candidates: MarketplacePriceCandidate[] = [];
  const itemType = normalizedKey(input.itemType);
  const baseName = stripWearSuffix(rawBaseName)
    .replace(/(\b(?:Gamma )?Doppler)\s*\((?:Phase [1-4]|Ruby|Sapphire|Black Pearl|Emerald)\)$/iu, "$1");

  if (!vanillaKnife && floatRange && floatValue !== null && wear) {
    // A legacy catalogue row usually has no market hash because the selected
    // exterior is part of the public market identity. Prefer that exact
    // exterior to any generic/hash stored by older imports.
    const finishBase = stripWearSuffix(baseName);
    if (finishBase) {
      const bareFinishBase = stripStarPrefix(finishBase).replace(/^StatTrak(?:™|TM)?\s+/iu, "");
      const exteriorName = `${bareFinishBase} (${wear})`;
      if (itemType === "knife" || itemType === "glove")
        addCandidate(baseCandidates, `\u2605 ${exteriorName}`, marketVersion);
      addCandidate(baseCandidates, exteriorName, marketVersion);
    }
    const storedName = normalizedText(input.marketHashName);
    // A fixed legacy exterior must never price a different selected wear.
    if (storedName.endsWith(`(${wear})`)) addCandidate(baseCandidates, storedName, marketVersion);
  } else {
    addCandidate(baseCandidates, input.marketHashName, marketVersion);
    addCandidate(baseCandidates, baseName, marketVersion);
  }
  for (const candidate of baseCandidates) {
    if (!stattrak) {
      addCandidate(candidates, candidate.marketHashName, candidate.marketVersion);
      continue;
    }

    // Steam's actual knife StatTrak identity is `★ StatTrak™ Knife | …`,
    // rather than `StatTrak™ ★ Knife | …`. Keep the latter as a harmless
    // compatibility candidate for third-party indexes that normalize it.
    if (itemType === "knife") {
      const bareName = stripStarPrefix(candidate.marketHashName);
      addCandidate(
        candidates,
        `★ ${stattrakMarketHashName(bareName)}`,
        candidate.marketVersion,
      );
    }
    addCandidate(
      candidates,
      stattrakMarketHashName(candidate.marketHashName),
      candidate.marketVersion,
    );
  }

  return {
    floatRange,
    floatValue,
    seed,
    wear,
    stattrak,
    marketVersion,
    candidates,
  };
}

export function marketplaceFloatDiscountBps(
  floatRange: MarketplaceFloatRange | null,
  floatValue: number | null,
) {
  if (!floatRange || floatValue === null) return 0;
  const span = floatRange.maxFloat - floatRange.minFloat;
  if (span <= Number.EPSILON) return 0;
  const normalizedPosition = Math.min(
    1,
    Math.max(0, (floatValue - floatRange.minFloat) / span),
  );
  return Math.round(normalizedPosition * maximumMarketplaceFloatDiscountBps);
}

export function adjustedMarketplaceEuroCents(
  baseEuroCents: number,
  floatDiscountBps: number,
) {
  return Math.max(
    1,
    Math.floor((baseEuroCents * (10_000 - floatDiscountBps)) / 10_000),
  );
}

function validFallback(value: MarketplacePriceFallback | null | undefined) {
  if (!value) return null;
  const eurCents = validEuroCents(value.eurCents);
  const source = normalizedText(value.source);
  if (eurCents === null || !source || source.length > 96) return null;
  // Coarse catalogue and wear caches do not retain exact seed/float identity.
  // A historical listing premium cannot become another pattern's base price.
  if (["csfloat-exact-listing", "csfloat-pattern-listing"].includes(normalizedKey(source))) return null;
  const sourceReference = normalizedText(value.sourceReference);
  const marketHashName = normalizedText(value.marketHashName);
  if (marketHashName.length > 255) return null;
  const observedAtInput = normalizedText(value.observedAt);
  const observedAtMilliseconds = observedAtInput
    ? Date.parse(observedAtInput)
    : Number.NaN;
  const observedAt = Number.isFinite(observedAtMilliseconds)
    ? new Date(observedAtMilliseconds).toISOString()
    : null;
  const stale = value.stale === true;
  if (observedAtInput && !observedAt) return null;
  if (observedAt) {
    const age = Date.now() - observedAtMilliseconds;
    if (age < -5 * 60 * 1_000 || age > MAXIMUM_MARKETPLACE_FALLBACK_AGE_MS)
      return null;
  }
  if (stale && !observedAt) return null;
  return {
    eurCents,
    source,
    sourceReference: sourceReference && sourceReference.length <= 255
      ? sourceReference
      : null,
    observedAt,
    stale,
    ...(marketHashName ? { marketHashName, marketVersion: normalizedText(value.marketVersion) || null } : {}),
  };
}

/** Chooses the first valid fallback without letting an expired cache shadow a later source. */
export function selectMarketplacePriceFallback(
  ...values: Array<MarketplacePriceFallback | null | undefined>
) {
  for (const value of values) {
    const fallback = validFallback(value);
    if (fallback) return fallback;
  }
  return null;
}

/** Reject outdated cache identities before choosing a later approved fallback. */
export function selectMarketplacePriceFallbackForIdentity(
  identity: MarketplacePriceIdentity,
  ...values: Array<MarketplacePriceFallback | null | undefined>
) {
  for (const value of values) {
    const fallback = selectMarketplacePriceFallback(value);
    if (!fallback) continue;
    if (fallback.marketHashName && !identity.candidates.some(candidate =>
      normalizedKey(candidate.marketHashName) === normalizedKey(fallback.marketHashName) &&
      normalizedKey(candidate.marketVersion) === normalizedKey(fallback.marketVersion))) continue;
    return fallback;
  }
  return null;
}

function quoteFromPrice(
  price: Pick<
    MarketplacePriceQuote,
    "baseEuroCents" | "source" | "sourceReference" | "marketHashName" | "marketVersion" | "fromFallback"
  > & {
    fallbackStale?: boolean;
    fallbackObservedAt?: string | null;
  },
  identity: MarketplacePriceIdentity,
  options: { exact?: ExternalMarketPrice | null | undefined } = {},
): MarketplacePriceQuote {
  const exact = options.exact ?? null;
  const floatDiscountBps = exact?.exactFloat
    ? 0
    : marketplaceFloatDiscountBps(identity.floatRange, identity.floatValue);
  return {
    baseEuroCents: price.baseEuroCents,
    eurCents: exact?.exactFloat
      ? price.baseEuroCents
      : adjustedMarketplaceEuroCents(price.baseEuroCents, floatDiscountBps),
    source: price.source,
    sourceReference: price.sourceReference,
    marketHashName: price.marketHashName,
    marketVersion: price.marketVersion,
    floatValue: identity.floatValue,
    wear: identity.wear,
    stattrak: identity.stattrak,
    floatDiscountBps,
    pricingRule: exact?.exactFloat ? "external-exact-v2" : "float-linear-v1",
    seed: identity.seed,
    seedMatched: exact?.exactSeed ?? false,
    fromFallback: price.fromFallback,
    fallbackStale: price.fromFallback && price.fallbackStale === true,
    fallbackObservedAt: price.fromFallback
      ? price.fallbackObservedAt ?? null
      : null,
  };
}

/**
 * Resolves a batch of marketplace quotes from public databases. Skinport's
 * sales history is preferred; independent CSFloat and SkinCash indexes are
 * used only when that exact public-market identity has no Skinport quote.
 */
export async function getMarketplacePriceQuotes(
  inputs: readonly MarketplacePriceInput[],
): Promise<Array<MarketplacePriceQuote | null>> {
  if (!inputs.length) return [];

  const identities = inputs.map(deriveMarketplacePriceIdentity);
  const lookups: MarketplacePriceCandidate[] = [];
  const lookupIndexes = new Map<string, number>();
  for (let index = 0; index < identities.length; index += 1) {
    if (inputs[index].fallbackOnly === true) continue;
    const identity = identities[index];
    for (const candidate of identity.candidates) {
      const key = `${normalizedKey(candidate.marketHashName)}\u0000${normalizedKey(candidate.marketVersion)}`;
      if (lookupIndexes.has(key)) continue;
      lookupIndexes.set(key, lookups.length);
      lookups.push(candidate);
    }
  }

  const publicPrices = await getSkinportHistoricalPrices(lookups);
  const publicPriceByCandidate = new Map<string, SkinportHistoricalPrice>();
  for (let index = 0; index < lookups.length; index += 1) {
    const quote = publicPrices[index];
    if (!quote) continue;
    const candidate = lookups[index];
    publicPriceByCandidate.set(
      `${normalizedKey(candidate.marketHashName)}\u0000${normalizedKey(candidate.marketVersion)}`,
      quote,
    );
  }

  // New releases and StatTrak™ variants often have no historical row yet.
  // Fill only those gaps from two independent current-market indexes.
  const externalLookupIndexes: number[] = [];
  for (let index = 0; index < lookups.length; index += 1) {
    const candidate = lookups[index];
    const candidateKey = `${normalizedKey(candidate.marketHashName)}\u0000${normalizedKey(candidate.marketVersion)}`;
    // Neither secondary index carries Skinport's phase/version dimension, so
    // never let a generic live listing stand in for a named phase variant.
    if (!candidate.marketVersion && !publicPriceByCandidate.has(candidateKey))
      externalLookupIndexes.push(index);
  }
  const externalQuotes = await getExternalMarketPrices(
    externalLookupIndexes.map((index) => lookups[index].marketHashName),
  );
  const externalPriceByCandidate = new Map<string, ExternalMarketPrice>();
  for (let index = 0; index < externalLookupIndexes.length; index += 1) {
    const quote = externalQuotes[index];
    if (!quote) continue;
    const candidate = lookups[externalLookupIndexes[index]];
    externalPriceByCandidate.set(
      `${normalizedKey(candidate.marketHashName)}\u0000${normalizedKey(candidate.marketVersion)}`,
      quote,
    );
  }

  // Opted-in inventory, sale and purchase prices use identical listing
  // evidence. The adapter caches the full seed/float identity and coalesces
  // duplicate requests; generic exterior quotes remain a separate fallback.
  const exactQuotes = await Promise.all(
    inputs.map(async (input, index) => {
      if (input.exactPatternQuote !== true) return null;
      if (input.fallbackOnly === true) return null;
      const identity = identities[index];
      if (identity.floatValue === null || identity.seed === null) return null;
      // Paint index distinguishes phases sharing one Steam market name.
      // Without that identity a generic listing cannot verify the phase.
      if (identity.marketVersion && input.paintkit == null) return null;
      for (const candidate of identity.candidates) {
        const lookup = {
          marketHashName: candidate.marketHashName,
          stattrak: identity.stattrak,
          floatValue: identity.floatValue,
          minFloat: identity.floatRange?.minFloat ?? null,
          maxFloat: identity.floatRange?.maxFloat ?? null,
          seed: identity.seed,
          definitionIndex: input.definitionIndex,
          paintkit: input.paintkit,
        };
        const quote = await getCsfloatExactListingPrice(lookup);
        if (quote) return quote;
        if (/\|\s*(?:Case Hardened|Heat Treated|(?:Gamma )?Doppler|(?:Marble )?Fade|Slaughter)\b/iu.test(candidate.marketHashName)) {
          const pattern = await getCsfloatExactListingPrice({ ...lookup, allowPatternEstimate: true });
          if (pattern) return pattern;
        }
      }
      return null;
    }),
  );

  return inputs.map((input, index) => {
    const identity = identities[index];
    const exactQuote = exactQuotes[index];
    if (exactQuote) {
      return quoteFromPrice(
        {
          baseEuroCents: exactQuote.eurCents,
          source: exactQuote.source,
          sourceReference: exactQuote.sourceReference,
          marketHashName: exactQuote.marketHashName,
          marketVersion: identity.marketVersion,
          fromFallback: false,
        },
        identity,
        { exact: exactQuote },
      );
    }
    for (const candidate of identity.candidates) {
      const key = `${normalizedKey(candidate.marketHashName)}\u0000${normalizedKey(candidate.marketVersion)}`;
      const publicPrice = publicPriceByCandidate.get(key);
      if (!publicPrice) continue;
      return quoteFromPrice(
        {
          baseEuroCents: publicPrice.eurCents,
          source: publicPrice.source,
          sourceReference: publicPrice.sourceReference,
          marketHashName: publicPrice.marketHashName,
          marketVersion: publicPrice.marketVersion,
          fromFallback: false,
        },
        identity,
      );
    }

    for (const candidate of identity.candidates) {
      const candidateKey = `${normalizedKey(candidate.marketHashName)}\u0000${normalizedKey(candidate.marketVersion)}`;
      const externalPrice = externalPriceByCandidate.get(candidateKey);
      if (!externalPrice) continue;
      return quoteFromPrice(
        {
          baseEuroCents: externalPrice.eurCents,
          source: externalPrice.source,
          sourceReference: externalPrice.sourceReference,
          marketHashName: externalPrice.marketHashName,
          marketVersion: candidate.marketVersion,
          fromFallback: false,
        },
        identity,
      );
    }

    // Callers supply a fallback only for the same wear/StatTrak market
    // identity. This now includes the server-warmed variant cache, so a
    // temporary provider outage does not make a valid StatTrak™ item
    // impossible to price or sell.
    const fallback = selectMarketplacePriceFallbackForIdentity(identity, input.fallbackPrice);
    if (!fallback) return null;
    return quoteFromPrice(
      {
        baseEuroCents: fallback.eurCents,
        source: fallback.source,
        sourceReference: fallback.sourceReference,
        marketHashName: identity.candidates[0]?.marketHashName ?? null,
        marketVersion: identity.marketVersion,
        fromFallback: true,
        fallbackStale: fallback.stale,
        fallbackObservedAt: fallback.observedAt,
      },
      identity,
    );
  });
}

/** Browse cards use persisted snapshots; checkout resolves a current quote again. */
export function getBrowseMarketplacePriceQuotes(
  inputs: readonly Omit<MarketplacePriceInput, "fallbackOnly">[],
): Promise<Array<MarketplacePriceQuote | null>> {
  return getMarketplacePriceQuotes(
    inputs.map((input) => ({ ...input, fallbackOnly: true })),
  );
}
