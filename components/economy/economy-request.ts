"use client";

export type EconomyActionResult = {
  ok: boolean;
  message?: string;
  balance?: number;
  priceTokens?: number;
  totalPriceTokens?: number;
  quantity?: number;
  itemIds?: string[];
  crateItemIds?: string[];
  openings?: unknown[];
  dropPools?: unknown[];
  globalAnnouncementQueued?: boolean;
  itemId?: string;
  catalogueId?: number;
  rewardLootEntryId?: number;
  codeId?: number;
  displayName?: string;
  tokensAwarded?: number;
  itemNames?: string[];
  item?: unknown;
  trade?: unknown;
  payoutTokens?: number;
  marketPriceTokens?: number;
};

export function createEconomyIdempotencyKey() {
  if (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function") return crypto.randomUUID();
  return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 14)}-${Math.random().toString(36).slice(2, 14)}`;
}

export async function postEconomyAction(
  path: string,
  csrf: string,
  payload: Record<string, unknown>,
  requestId = createEconomyIdempotencyKey(),
) {
  const response = await fetch(path, {
    method: "POST",
    headers: { "content-type": "application/json", accept: "application/json" },
    credentials: "same-origin",
    body: JSON.stringify({ ...payload, csrf, idempotencyKey: requestId })
  });

  let result: EconomyActionResult | null = null;
  try {
    result = await response.json() as EconomyActionResult;
  } catch {
    // A proxied error page should still be presented as a useful UI message.
  }

  if (!response.ok || !result?.ok) {
    throw new Error(result?.message || "The economy request could not be completed. Please reload and try again.");
  }
  return result;
}
