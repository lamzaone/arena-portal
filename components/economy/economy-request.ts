"use client";

const pendingActions = new Map<string, Promise<EconomyActionResult>>();
const ACTION_COOLDOWN_MS = 500;

export type EconomyActionResult = {
  ok: boolean;
  message?: string;
  code?: string;
  balance?: string;
  priceTokens?: number;
  totalPriceTokens?: number;
  quantity?: number;
  itemIds?: string[];
  skippedItemIds?: string[];
  skippedItems?: Array<{ itemId: string; displayName: string }>;
  crateItemIds?: string[];
  openings?: unknown[];
  dropPools?: unknown[];
  globalAnnouncementQueued?: boolean;
  itemId?: string;
  attachmentRevision?: number;
  catalogueId?: number;
  rewardLootEntryId?: number;
  codeId?: number;
  displayName?: string;
  tokensAwarded?: string;
  itemNames?: string[];
  item?: unknown;
  trade?: unknown;
  payoutTokens?: number;
  marketPriceTokens?: number;
  expiresAt?: string;
  perkName?: string;
};

export class EconomyActionRequestError extends Error {
  constructor(
    message: string,
    public readonly status: number,
    public readonly code?: string,
  ) {
    super(message);
    this.name = "EconomyActionRequestError";
  }
}

export function createEconomyIdempotencyKey() {
  if (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function") return crypto.randomUUID();
  return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 14)}-${Math.random().toString(36).slice(2, 14)}`;
}

export function postEconomyAction(
  path: string,
  csrf: string,
  payload: Record<string, unknown>,
  requestId = createEconomyIdempotencyKey(),
) {
  // A second click can reach us before React paints the pending state. Match
  // the intended operation rather than its newly generated idempotency key.
  const key = JSON.stringify([path, csrf, Object.entries(payload).sort(([a], [b]) => a.localeCompare(b))]);
  const pending = pendingActions.get(key);
  if (pending) return pending;

  const startedAt = performance.now();
  const operation = sendEconomyAction(path, csrf, payload, requestId).finally(async () => {
    const remaining = ACTION_COOLDOWN_MS - (performance.now() - startedAt);
    if (remaining > 0) await new Promise(resolve => setTimeout(resolve, remaining));
    pendingActions.delete(key);
  });
  pendingActions.set(key, operation);
  return operation;
}

async function sendEconomyAction(
  path: string,
  csrf: string,
  payload: Record<string, unknown>,
  requestId: string,
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
    throw new EconomyActionRequestError(
      result?.message || "The economy request could not be completed. Please reload and try again.",
      response.status,
      typeof result?.code === "string" ? result.code : undefined,
    );
  }
  return result;
}
