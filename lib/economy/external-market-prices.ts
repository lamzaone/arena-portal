import "server-only";

// These two public indexes are deliberately used only after Skinport's sales
// history. They provide a live, independent fallback for items that do not
// have enough Skinport history yet (including many StatTrak™ variants).
const csfloatPriceIndexUrl = "https://csfloat.com/api/v1/listings/price-list";
const skinCashPriceIndexUrl = "https://api.skincash.gg/v1/prices";
const frankfurterPrimaryUrl =
  "https://api.frankfurter.dev/v1/latest?base=USD&symbols=EUR";
const frankfurterFallbackUrl =
  "https://api.frankfurter.app/latest?from=USD&to=EUR";

const indexTtlMs = 15 * 60 * 1_000;
const exchangeRateTtlMs = 6 * 60 * 60 * 1_000;
const exactListingTtlMs = 5 * 60 * 1_000;
const failedRefreshBackoffMs = 2 * 60 * 1_000;
const maximumIndexRows = 100_000;

export type ExternalMarketPriceSource =
  | "csfloat-price-index"
  | "skincash-listing"
  | "multi-market-index"
  | "csfloat-exact-listing";

export type ExternalMarketPrice = {
  eurCents: number;
  source: ExternalMarketPriceSource;
  sourceReference: string;
  marketHashName: string;
  // Exact CSFloat listings already include their actual float and (when one
  // was requested) paint seed. Index values are exterior-level prices only.
  exactFloat: boolean;
  exactSeed: boolean;
};

export type CsfloatExactListingLookup = {
  marketHashName: string;
  stattrak: boolean;
  floatValue: number | null;
  minFloat: number | null;
  maxFloat: number | null;
  seed: number | null;
};

type ProviderQuote = {
  usdCents: number;
  sourceReference: string;
  marketHashName: string;
};

type PriceIndexSnapshot = {
  expiresAt: number;
  byMarketHashName: Map<string, ExternalMarketPrice>;
};

type ExchangeRateSnapshot = {
  expiresAt: number;
  eurPerUsd: number;
};

type ExactListingCacheValue = {
  expiresAt: number;
  quote: ExternalMarketPrice | null;
};

let indexSnapshot: PriceIndexSnapshot | null = null;
let indexRefresh: Promise<PriceIndexSnapshot | null> | null = null;
let indexRetryAfter = 0;
let exchangeRateSnapshot: ExchangeRateSnapshot | null = null;
let exchangeRateRefresh: Promise<ExchangeRateSnapshot | null> | null = null;
let exchangeRateRetryAfter = 0;
const exactListingCache = new Map<string, ExactListingCacheValue>();

function text(value: unknown) {
  return typeof value === "string" ? value.normalize("NFKC").replace(/\s+/g, " ").trim() : "";
}

function key(value: string | null | undefined) {
  return text(value).toLocaleLowerCase("en-US");
}

function positiveInteger(value: unknown) {
  return typeof value === "number" &&
    Number.isSafeInteger(value) &&
    value > 0 &&
    value <= 1_000_000_000
    ? value
    : null;
}

function usdCentsFromMajorUnits(value: unknown) {
  const parsed = typeof value === "number" ? value : Number.NaN;
  if (!Number.isFinite(parsed) || parsed <= 0 || parsed > 10_000_000)
    return null;
  const cents = Math.round(parsed * 100);
  return Number.isSafeInteger(cents) && cents > 0 ? cents : null;
}

function numberInRange(value: unknown, minimum: number, maximum: number) {
  return typeof value === "number" &&
    Number.isFinite(value) &&
    value >= minimum &&
    value <= maximum
    ? value
    : null;
}

function usdCentsToEuroCents(usdCents: number, eurPerUsd: number) {
  const converted = Math.round(usdCents * eurPerUsd);
  return positiveInteger(converted);
}

async function fetchJson(
  url: string,
  headers: HeadersInit = {},
  revalidateSeconds = indexTtlMs / 1_000,
) {
  try {
    const response = await fetch(url, {
      method: "GET",
      headers: {
        Accept: "application/json",
        "User-Agent": "TAPPED.RO Token Economy/1.0",
        ...headers,
      },
      ...(revalidateSeconds > 0
        ? { next: { revalidate: revalidateSeconds } }
        : { cache: "no-store" }),
    });
    if (!response.ok) return null;
    return await response.json();
  } catch {
    return null;
  }
}

function exchangeRateFromPayload(payload: unknown) {
  if (!payload || typeof payload !== "object" || Array.isArray(payload))
    return null;
  const rates = (payload as { rates?: unknown }).rates;
  if (!rates || typeof rates !== "object" || Array.isArray(rates)) return null;
  return numberInRange((rates as Record<string, unknown>).EUR, 0.1, 2);
}

async function refreshExchangeRate() {
  const [primary, fallback] = await Promise.all([
    fetchJson(frankfurterPrimaryUrl),
    fetchJson(frankfurterFallbackUrl),
  ]);
  // Both hosts publish the ECB-backed Frankfurter feed. Reading both lets a
  // transient host outage keep USD-denominated market prices available.
  const eurPerUsd =
    exchangeRateFromPayload(primary) ?? exchangeRateFromPayload(fallback);
  if (eurPerUsd === null) return null;
  return {
    expiresAt: Date.now() + exchangeRateTtlMs,
    eurPerUsd,
  } satisfies ExchangeRateSnapshot;
}

async function getExchangeRate() {
  if (exchangeRateSnapshot && exchangeRateSnapshot.expiresAt > Date.now())
    return exchangeRateSnapshot;
  if (exchangeRateRefresh)
    return (await exchangeRateRefresh) ?? exchangeRateSnapshot;
  if (!exchangeRateSnapshot && exchangeRateRetryAfter > Date.now()) return null;

  exchangeRateRefresh = refreshExchangeRate();
  try {
    const fresh = await exchangeRateRefresh;
    if (fresh) {
      exchangeRateSnapshot = fresh;
      exchangeRateRetryAfter = 0;
      return fresh;
    }
    exchangeRateRetryAfter = Date.now() + failedRefreshBackoffMs;
    return exchangeRateSnapshot;
  } finally {
    exchangeRateRefresh = null;
  }
}

function csfloatQuotes(payload: unknown) {
  const quotes = new Map<string, ProviderQuote>();
  if (!Array.isArray(payload) || payload.length > maximumIndexRows) return quotes;
  for (const entry of payload) {
    if (!entry || typeof entry !== "object" || Array.isArray(entry)) continue;
    const row = entry as Record<string, unknown>;
    const marketHashName = text(row.market_hash_name);
    const usdCents = positiveInteger(row.min_price);
    if (!marketHashName || usdCents === null) continue;
    const lookupKey = key(marketHashName);
    const existing = quotes.get(lookupKey);
    if (!existing || usdCents < existing.usdCents) {
      quotes.set(lookupKey, {
        usdCents,
        sourceReference: csfloatPriceIndexUrl,
        marketHashName,
      });
    }
  }
  return quotes;
}

function skinCashQuotes(payload: unknown) {
  const quotes = new Map<string, ProviderQuote>();
  if (!payload || typeof payload !== "object" || Array.isArray(payload)) return quotes;
  const root = payload as { currency?: unknown; items?: unknown };
  if (text(root.currency).toLocaleUpperCase("en-US") !== "USD") return quotes;
  if (!Array.isArray(root.items) || root.items.length > maximumIndexRows)
    return quotes;
  for (const entry of root.items) {
    if (!entry || typeof entry !== "object" || Array.isArray(entry)) continue;
    const row = entry as Record<string, unknown>;
    const marketHashName = text(row.market_hash_name);
    const usdCents = usdCentsFromMajorUnits(row.price);
    if (!marketHashName || usdCents === null) continue;
    const lookupKey = key(marketHashName);
    const sourceReference = text(row.item_page);
    const existing = quotes.get(lookupKey);
    if (!existing || usdCents < existing.usdCents) {
      quotes.set(lookupKey, {
        usdCents,
        sourceReference: sourceReference || skinCashPriceIndexUrl,
        marketHashName,
      });
    }
  }
  return quotes;
}

function externalPrice(
  marketHashName: string,
  csfloat: ProviderQuote | undefined,
  skinCash: ProviderQuote | undefined,
  eurPerUsd: number,
) {
  if (!csfloat && !skinCash) return null;
  const usdCents = csfloat && skinCash
    ? Math.round((csfloat.usdCents + skinCash.usdCents) / 2)
    : (csfloat ?? skinCash)!.usdCents;
  const eurCents = usdCentsToEuroCents(usdCents, eurPerUsd);
  if (eurCents === null) return null;
  return {
    eurCents,
    source:
      csfloat && skinCash
        ? "multi-market-index"
        : csfloat
          ? "csfloat-price-index"
          : "skincash-listing",
    // The source label identifies a consensus when both feeds participate;
    // keep an inspectable provider URL as the audit reference in all cases.
    sourceReference: csfloat?.sourceReference ?? skinCash!.sourceReference,
    marketHashName,
    exactFloat: false,
    exactSeed: false,
  } satisfies ExternalMarketPrice;
}

async function refreshPriceIndex(): Promise<PriceIndexSnapshot | null> {
  const [exchangeRate, csfloatPayload, skinCashPayload] = await Promise.all([
    getExchangeRate(),
    fetchJson(csfloatPriceIndexUrl),
    fetchJson(skinCashPriceIndexUrl),
  ]);
  if (!exchangeRate) return null;
  const csfloat = csfloatQuotes(csfloatPayload);
  const skinCash = skinCashQuotes(skinCashPayload);
  if (!csfloat.size && !skinCash.size) return null;

  const keys = new Set([...csfloat.keys(), ...skinCash.keys()]);
  const byMarketHashName = new Map<string, ExternalMarketPrice>();
  for (const lookupKey of keys) {
    const csfloatQuote = csfloat.get(lookupKey);
    const skinCashQuote = skinCash.get(lookupKey);
    const quote = externalPrice(
      csfloatQuote?.marketHashName ?? skinCashQuote?.marketHashName ?? lookupKey,
      csfloatQuote,
      skinCashQuote,
      exchangeRate.eurPerUsd,
    );
    if (quote) byMarketHashName.set(lookupKey, quote);
  }
  return { expiresAt: Date.now() + indexTtlMs, byMarketHashName };
}

async function getPriceIndex() {
  if (indexSnapshot && indexSnapshot.expiresAt > Date.now()) return indexSnapshot;
  if (indexRefresh) return (await indexRefresh) ?? indexSnapshot;
  if (!indexSnapshot && indexRetryAfter > Date.now()) return null;
  indexRefresh = refreshPriceIndex();
  try {
    const fresh = await indexRefresh;
    if (fresh) {
      indexSnapshot = fresh;
      indexRetryAfter = 0;
      return fresh;
    }
    indexRetryAfter = Date.now() + failedRefreshBackoffMs;
    return indexSnapshot;
  } finally {
    indexRefresh = null;
  }
}

/** Resolves current USD marketplace indexes to EUR cents in the input order. */
export async function getExternalMarketPrices(
  marketHashNames: readonly (string | null | undefined)[],
): Promise<Array<ExternalMarketPrice | null>> {
  if (!marketHashNames.length) return [];
  const snapshot = await getPriceIndex();
  if (!snapshot) return marketHashNames.map(() => null);
  return marketHashNames.map(
    (marketHashName) => snapshot.byMarketHashName.get(key(marketHashName)) ?? null,
  );
}

function listingRows(payload: unknown) {
  if (Array.isArray(payload)) return payload;
  if (payload && typeof payload === "object" && !Array.isArray(payload)) {
    const data = (payload as { data?: unknown }).data;
    return Array.isArray(data) ? data : [];
  }
  return [];
}

function exactListingCacheKey(input: CsfloatExactListingLookup) {
  return [
    key(input.marketHashName),
    input.stattrak ? "stattrak" : "normal",
    input.floatValue?.toFixed(6) ?? "none",
    input.seed ?? "none",
  ].join("\u0000");
}

function listingSearchReference(marketHashName: string) {
  return `https://csfloat.com/search?market_hash_name=${encodeURIComponent(marketHashName)}`;
}

/**
 * Looks up a matching CSFloat listing when the optional server-side API key is
 * configured. CSFloat's listing API supports both float and paint-seed
 * filters; without that key the public price index above remains the fallback.
 */
export async function getCsfloatExactListingPrice(
  input: CsfloatExactListingLookup,
): Promise<ExternalMarketPrice | null> {
  const apiKey = text(process.env.CSFLOAT_API_KEY);
  if (!apiKey) return null;
  const marketHashName = text(input.marketHashName);
  if (!marketHashName) return null;
  const cacheKey = exactListingCacheKey({ ...input, marketHashName });
  const cached = exactListingCache.get(cacheKey);
  if (cached && cached.expiresAt > Date.now()) return cached.quote;

  const search = new URLSearchParams({
    limit: "50",
    sort_by: "lowest_price",
    type: "buy_now",
    market_hash_name: marketHashName,
    category: input.stattrak ? "2" : "1",
  });
  const targetFloat = numberInRange(input.floatValue, 0, 1);
  if (targetFloat !== null) {
    const minFloat = numberInRange(input.minFloat, 0, 1) ?? 0;
    const maxFloat = numberInRange(input.maxFloat, 0, 1) ?? 1;
    const span = Math.max(0, maxFloat - minFloat);
    const tolerance = Math.max(0.001, Math.min(0.01, span * 0.02));
    search.set("min_float", Math.max(minFloat, targetFloat - tolerance).toFixed(6));
    search.set("max_float", Math.min(maxFloat, targetFloat + tolerance).toFixed(6));
  }
  const requestedSeed = numberInRange(input.seed, 0, 1_000);
  if (requestedSeed !== null) search.set("paint_seed", String(Math.round(requestedSeed)));

  const payload = await fetchJson(
    `https://csfloat.com/api/v1/listings?${search.toString()}`,
    { Authorization: apiKey },
    0,
  );
  const exchangeRate = await getExchangeRate();
  let quote: ExternalMarketPrice | null = null;
  if (exchangeRate) {
    for (const entry of listingRows(payload)) {
      if (!entry || typeof entry !== "object" || Array.isArray(entry)) continue;
      const row = entry as Record<string, unknown>;
      const item = row.item;
      if (!item || typeof item !== "object" || Array.isArray(item)) continue;
      const itemRow = item as Record<string, unknown>;
      if (key(itemRow.market_hash_name as string) !== key(marketHashName)) continue;
      const usdCents = positiveInteger(row.price);
      const eurCents = usdCents === null
        ? null
        : usdCentsToEuroCents(usdCents, exchangeRate.eurPerUsd);
      const listingFloat = numberInRange(itemRow.float_value, 0, 1);
      const listingSeed = numberInRange(itemRow.paint_seed, 0, 1_000);
      if (eurCents === null) continue;
      if (targetFloat !== null && listingFloat === null) continue;
      if (
        requestedSeed !== null &&
        (listingSeed === null || Math.round(listingSeed) !== Math.round(requestedSeed))
      ) {
        continue;
      }
      quote = {
        eurCents,
        source: "csfloat-exact-listing",
        sourceReference: listingSearchReference(marketHashName),
        marketHashName,
        exactFloat: targetFloat !== null,
        exactSeed: requestedSeed !== null,
      };
      break;
    }
  }
  exactListingCache.set(cacheKey, {
    expiresAt: Date.now() + exactListingTtlMs,
    quote,
  });
  return quote;
}
