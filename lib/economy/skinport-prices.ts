import "server-only";

// Skinport publishes public, unauthenticated CS2 sales-history and listing
// databases in EUR. A historical median is intentionally preferred over a
// live listing so a single volatile listing cannot move the Token economy.
const skinportHistoryUrl =
  "https://api.skinport.com/v1/sales/history?app_id=730&currency=EUR";
const skinportItemsUrl =
  "https://api.skinport.com/v1/items?app_id=730&currency=EUR&tradable=0";
const snapshotTtlMs = 30 * 60 * 1_000;
const failedRefreshBackoffMs = 5 * 60 * 1_000;
const maximumSnapshotRows = 100_000;

export type SkinportPriceLookup = {
  marketHashName: string | null | undefined;
  // Skinport keeps some variants (for example Doppler phases) under one
  // market hash with a distinct version. Supplying it prevents a phase from
  // being quoted as a generic base variant.
  marketVersion?: string | null | undefined;
};

export type SkinportHistoricalPrice = {
  eurCents: number;
  source:
    | "skinport-30d-median"
    | "skinport-7d-median"
    | "skinport-90d-median"
    | "skinport-listing-median"
    | "skinport-listing-mean"
    | "skinport-listing-suggested";
  sourceReference: string;
  marketHashName: string;
  marketVersion: string | null;
};

type SkinportSnapshot = {
  expiresAt: number;
  byMarketHashName: Map<string, Map<string, SkinportHistoricalPrice>>;
  listingByMarketHashName: Map<string, SkinportHistoricalPrice>;
};

type HistoricalPeriod = {
  key: "last_30_days" | "last_7_days" | "last_90_days";
  source: SkinportHistoricalPrice["source"];
};

const historicalPeriods: HistoricalPeriod[] = [
  { key: "last_30_days", source: "skinport-30d-median" },
  { key: "last_90_days", source: "skinport-90d-median" },
  { key: "last_7_days", source: "skinport-7d-median" },
];

let snapshot: SkinportSnapshot | null = null;
let snapshotRefresh: Promise<SkinportSnapshot | null> | null = null;
let retryAfter = 0;

function text(value: unknown) {
  return typeof value === "string" ? value.trim() : "";
}

function lookupKey(value: string | null | undefined) {
  return text(value).normalize("NFKC").replace(/\s+/g, " ").toLocaleLowerCase("en-US");
}

function euroCents(value: unknown) {
  const parsed =
    typeof value === "number"
      ? value
      : typeof value === "string" && value.trim()
        ? Number(value)
        : Number.NaN;
  // Skinport returns EUR major units (for example 5.58), while the Token
  // economy deliberately stores whole EUR cents/tokens.
  if (!Number.isFinite(parsed) || parsed <= 0 || parsed > 10_000_000)
    return null;
  const cents = Math.round(parsed * 100);
  return Number.isSafeInteger(cents) && cents > 0 ? cents : null;
}

function skinportReference(value: unknown, fallback = skinportHistoryUrl) {
  const candidate = text(value);
  if (!candidate) return fallback;
  try {
    const url = new URL(candidate);
    const hostname = url.hostname.toLocaleLowerCase("en-US");
    const reference = url.toString();
    return url.protocol === "https:" &&
      (hostname === "skinport.com" || hostname.endsWith(".skinport.com"))
      && reference.length <= 255
      ? reference
      : fallback;
  } catch {
    return fallback;
  }
}

function quoteFromRow(row: Record<string, unknown>) {
  const marketHashName = text(row.market_hash_name);
  if (!marketHashName) return null;
  const currency = text(row.currency).toLocaleUpperCase("en-US");
  if (currency && currency !== "EUR") return null;
  const marketVersion = text(row.version) || null;
  for (const period of historicalPeriods) {
    const values = row[period.key];
    if (!values || typeof values !== "object" || Array.isArray(values))
      continue;
    const cents = euroCents((values as Record<string, unknown>).median);
    if (cents === null) continue;
    return {
      eurCents: cents,
      source: period.source,
      sourceReference: skinportReference(row.item_page),
      marketHashName,
      marketVersion,
    } satisfies SkinportHistoricalPrice;
  }
  return null;
}

const listingPriceFields = [
  { key: "median_price", source: "skinport-listing-median" },
  { key: "mean_price", source: "skinport-listing-mean" },
  { key: "suggested_price", source: "skinport-listing-suggested" },
] as const;

function listingQuoteFromRow(row: Record<string, unknown>) {
  const marketHashName = text(row.market_hash_name);
  if (!marketHashName) return null;
  const currency = text(row.currency).toLocaleUpperCase("en-US");
  if (currency && currency !== "EUR") return null;
  for (const field of listingPriceFields) {
    const cents = euroCents(row[field.key]);
    if (cents === null) continue;
    return {
      eurCents: cents,
      source: field.source,
      sourceReference: skinportReference(row.item_page, skinportItemsUrl),
      marketHashName,
      marketVersion: null,
    } satisfies SkinportHistoricalPrice;
  }
  return null;
}

async function fetchSkinportRows(url: string) {
  try {
    const response = await fetch(url, {
      method: "GET",
      headers: {
        // These endpoints explicitly require Brotli. Node's fetch
        // transparently decompresses the response for JSON parsing.
        "Accept-Encoding": "br",
        Accept: "application/json",
        "User-Agent": "TAPPED.RO Token Economy/1.0",
      },
      // Bulk feeds exceed Next's 2 MB fetch-cache limit. The parsed snapshot
      // and shared pending request below provide the cache and deduplication.
      cache: "no-store",
    });
    if (!response.ok) return null;
    const payload: unknown = await response.json();
    return Array.isArray(payload) && payload.length <= maximumSnapshotRows
      ? payload
      : null;
  } catch {
    return null;
  }
}

async function fetchSnapshot(): Promise<SkinportSnapshot | null> {
  const [historicalRows, listingRows] = await Promise.all([
    fetchSkinportRows(skinportHistoryUrl),
    fetchSkinportRows(skinportItemsUrl),
  ]);
  if (!historicalRows && !listingRows) return null;

  const byMarketHashName = new Map<
    string,
    Map<string, SkinportHistoricalPrice>
  >();
  for (const entry of historicalRows ?? []) {
    if (!entry || typeof entry !== "object" || Array.isArray(entry)) continue;
    const quote = quoteFromRow(entry as Record<string, unknown>);
    if (!quote) continue;
    const marketHashKey = lookupKey(quote.marketHashName);
    if (!marketHashKey) continue;
    const marketVersionKey = lookupKey(quote.marketVersion);
    const variants = byMarketHashName.get(marketHashKey) ?? new Map();
    // The source should supply one row per exact variant. Keeping the first
    // protects against an accidental duplicate response from changing a
    // stable period choice unpredictably.
    if (!variants.has(marketVersionKey)) variants.set(marketVersionKey, quote);
    byMarketHashName.set(marketHashKey, variants);
  }
  const listingByMarketHashName = new Map<string, SkinportHistoricalPrice>();
  for (const entry of listingRows ?? []) {
    if (!entry || typeof entry !== "object" || Array.isArray(entry)) continue;
    const quote = listingQuoteFromRow(entry as Record<string, unknown>);
    if (!quote) continue;
    const marketHashKey = lookupKey(quote.marketHashName);
    if (marketHashKey && !listingByMarketHashName.has(marketHashKey))
      listingByMarketHashName.set(marketHashKey, quote);
  }
  return {
    expiresAt: Date.now() + snapshotTtlMs,
    byMarketHashName,
    listingByMarketHashName,
  };
}

async function getSnapshot() {
  if (snapshot && snapshot.expiresAt > Date.now()) return snapshot;
  if (snapshotRefresh) return (await snapshotRefresh) ?? snapshot;
  if (!snapshot && retryAfter > Date.now()) return null;

  snapshotRefresh = (async () => {
    try {
      const fresh = await fetchSnapshot();
      if (fresh) {
        snapshot = fresh;
        retryAfter = 0;
        return fresh;
      }
    } catch {
      // Keep a previous valid snapshot available during a transient provider
      // failure. The marketplace can still fall back to a staff snapshot.
    }
    retryAfter = Date.now() + failedRefreshBackoffMs;
    return snapshot;
  })();

  try {
    return await snapshotRefresh;
  } finally {
    snapshotRefresh = null;
  }
}

function resolveQuote(snapshotValue: SkinportSnapshot, lookup: SkinportPriceLookup) {
  const marketHashKey = lookupKey(lookup.marketHashName);
  const variants = snapshotValue.byMarketHashName.get(marketHashKey);
  const requestedVersion = lookupKey(lookup.marketVersion);
  if (variants) {
    if (requestedVersion) return variants.get(requestedVersion) ?? null;

    // A non-versioned record is safe to use for an ordinary market hash. Do
    // not guess among phase/variant records when the catalogue has no explicit
    // version: staff can set a last-known price until that identity is mapped.
    return variants.get("") ?? null;
  }
  // Only use an active-listing quote after historical sales data is absent.
  // Listing data has no phase field, so it is never a fallback for a requested
  // variant.
  return requestedVersion
    ? null
    : snapshotValue.listingByMarketHashName.get(marketHashKey) ?? null;
}

/**
 * Resolves EUR quotes from Skinport's public database. Historical medians are
 * always preferred; an active-listing median/mean/suggested price is used only
 * when no historical record exists. Returned positions match the supplied
 * lookups exactly, which preserves catalogue ordering and variant identity
 * without exposing a price API to the browser.
 */
export async function getSkinportHistoricalPrices(
  lookups: readonly SkinportPriceLookup[],
): Promise<Array<SkinportHistoricalPrice | null>> {
  if (!lookups.length) return [];
  const snapshotValue = await getSnapshot();
  if (!snapshotValue) return lookups.map(() => null);
  return lookups.map((lookup) => resolveQuote(snapshotValue, lookup));
}

export async function getSkinportHistoricalPrice(
  lookup: SkinportPriceLookup,
) {
  return (await getSkinportHistoricalPrices([lookup]))[0] ?? null;
}
