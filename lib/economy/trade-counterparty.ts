function record(value: unknown): Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value)
    ? value as Record<string, unknown>
    : {};
}

function identity(value: unknown): string | null {
  if (typeof value === "string") return value.trim() || null;
  if (typeof value === "bigint") return String(value);
  if (typeof value === "number" && Number.isSafeInteger(value)) return String(value);
  return null;
}

/** Returns the other player for the viewer, while repository counterparty means recipient. */
export function tradeCounterpartySteamId(value: unknown): string | null {
  const trade = record(value);
  const direction = (identity(trade.direction) ?? identity(trade.tradeDirection))?.toLowerCase();
  const legacyIdentity = [
    trade.counterpartySteamId,
    trade.otherSteamId,
    trade.targetSteamId,
    trade.ownerSteamId,
  ];
  const candidates = direction === "incoming"
    ? [trade.creatorSteamId, record(trade.offered).steamId, ...legacyIdentity]
    : direction === "outgoing"
      ? [trade.counterpartySteamId, record(trade.requested).steamId, ...legacyIdentity]
      : legacyIdentity;

  for (const candidate of candidates) {
    const steamId = identity(candidate);
    if (steamId) return steamId;
  }
  return null;
}
