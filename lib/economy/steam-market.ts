import "server-only";

// Kept only as an isolated legacy helper for emergency diagnostics. The
// marketplace and staff price refresh paths use skinport-prices.ts instead.

// Steam Community reports a localized price string, so the portal never lets
// the browser parse or choose a price.  The resulting integer is EUR cents,
// which maps directly to Tokens at the configured 1 EUR = 100 Tokens rate.
const steamAppId = 730;
const euroCurrencyCode = 3;

export type SteamMarketPrice = {
  eurCents: number;
  sourceReference: string;
};

function parseEuroCents(value: string) {
  const raw = value.replace(/[^0-9,.-]/g, "");
  if (!raw || raw === "-" || raw === "." || raw === ",") return null;
  const decimalIndex = Math.max(raw.lastIndexOf(","), raw.lastIndexOf("."));
  const decimalDigits = decimalIndex >= 0 ? raw.length - decimalIndex - 1 : 0;
  const normalized = decimalIndex >= 0 && decimalDigits > 0 && decimalDigits <= 2
    ? `${raw.slice(0, decimalIndex).replace(/[.,]/g, "")}.${raw.slice(decimalIndex + 1).replace(/[.,]/g, "")}`
    : raw.replace(/[.,]/g, "");
  const amount = Number(normalized);
  if (!Number.isFinite(amount) || amount < 0) return null;
  const cents = Math.round(amount * 100);
  return Number.isSafeInteger(cents) ? cents : null;
}

function getLowestPrice(payload: unknown) {
  if (!payload || typeof payload !== "object") return null;
  const record = payload as Record<string, unknown>;
  return record.success === true && typeof record.lowest_price === "string" ? record.lowest_price : null;
}

/**
 * Fetches the market's lowest listed EUR price for one catalogue market-hash
 * name. Call this only from a trusted staff refresh path; the persisted price
 * history remains the player-facing source if Steam is unavailable.
 */
/** @deprecated Use the public historical price adapter instead. */
export async function fetchSteamMarketPrice(marketHashName: string): Promise<SteamMarketPrice | null> {
  const name = marketHashName.trim();
  if (!name || name.length > 255) return null;

  const parameters = new URLSearchParams({
    appid: String(steamAppId),
    currency: String(euroCurrencyCode),
    market_hash_name: name
  });
  const sourceReference = `https://steamcommunity.com/market/priceoverview/?${parameters.toString()}`;

  try {
    const response = await fetch(sourceReference, {
      headers: {
        "User-Agent": "TAPPED.RO Token Economy/1.0",
        "Accept-Language": "en-GB,en;q=0.9"
      },
      cache: "no-store"
    });
    if (!response.ok) return null;
    const cents = parseEuroCents(getLowestPrice(await response.json()) ?? "");
    return cents === null ? null : { eurCents: cents, sourceReference };
  } catch {
    return null;
  }
}
