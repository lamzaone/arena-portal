import "server-only";

import { NextResponse } from "next/server";

import { getSession, type PortalSession, verifyEconomyActionToken } from "@/lib/auth/session";

export type EconomyMutationBody = Record<string, unknown> & {
  csrf: string;
  idempotencyKey: string;
};

export type EconomyMutationContext = {
  session: PortalSession;
  body: EconomyMutationBody;
};

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

export function economyJsonError(message: string, status: number) {
  return NextResponse.json({ ok: false, message }, { status });
}

export function economyJsonSuccess(result: unknown, status = 200) {
  return NextResponse.json({ ok: true, ...(isRecord(result) ? result : { result }) }, { status });
}

export function economyMutationFailure(error: unknown) {
  const candidate = isRecord(error) ? error : null;
  const code = typeof candidate?.code === "string" ? candidate.code : "";
  const message = error instanceof Error ? error.message : "The economy operation could not be completed.";
  if (code === "theme_not_owned") return economyJsonError(message, 409);
  if (["invalid_input", "invalid_idempotency_key", "incompatible_item", "ownership_required", "item_not_owned", "not_a_crate", "item_not_found", "item_not_tradable", "unsupported_customization", "item_customized", "conversion_too_small", "invalid_duration"].includes(code)) return economyJsonError(message, 400);
  if (["insufficient_tokens", "token_limit", "idempotency_conflict", "operation_in_progress", "item_unavailable", "requested_item_unavailable", "inventory_private", "sticker_slot_occupied", "price_unavailable", "catalogue_not_found", "catalogue_unavailable", "loot_table_unavailable", "loot_table_empty", "redeem_code_exists", "redeem_code_not_found", "redeem_code_disabled", "redeem_code_exhausted", "redeem_already_claimed", "scope_unavailable", "group_unavailable", "stale_group_target", "rate_snapshot_expired", "stale_rate_schedule", "subscription_unavailable", "membership_conflict", "invalid_rate_snapshot"].includes(code)) return economyJsonError(message, 409);
  if (["storage_unavailable", "operation_unavailable", "wallet_unavailable", "membership_authority_unavailable", "membership_authority_invalid"].includes(code)) return economyJsonError(message, 503);
  return economyJsonError("The economy operation could not be completed. Please try again shortly.", 500);
}

export async function readEconomyMutation(request: Request): Promise<EconomyMutationContext | NextResponse> {
  const session = await getSession();
  if (!session) return economyJsonError("Sign in with Steam before using the Token economy.", 401);

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return economyJsonError("The economy request must be valid JSON.", 400);
  }
  if (!isRecord(body)) return economyJsonError("The economy request was invalid.", 400);

  const csrf = typeof body.csrf === "string" ? body.csrf : "";
  if (!verifyEconomyActionToken(session, csrf)) {
    return economyJsonError("Your session verification has expired. Reload the page and try again.", 403);
  }
  const idempotencyKey = typeof body.idempotencyKey === "string" ? body.idempotencyKey : "";
  if (!/^[A-Za-z0-9_-]{16,128}$/.test(idempotencyKey)) {
    return economyJsonError("The economy request is missing a valid idempotency key.", 400);
  }

  return { session, body: { ...body, csrf, idempotencyKey } };
}

export function isEconomyError(value: EconomyMutationContext | NextResponse): value is NextResponse {
  return value instanceof NextResponse;
}

export function textField(value: unknown, maximum = 256) {
  return typeof value === "string" && value.trim() && value.trim().length <= maximum ? value.trim() : null;
}

export function integerField(value: unknown, minimum = 0, maximum = Number.MAX_SAFE_INTEGER) {
  const number = typeof value === "number" ? value : typeof value === "string" && value.trim() ? Number(value) : Number.NaN;
  return Number.isSafeInteger(number) && number >= minimum && number <= maximum ? number : null;
}

export function stringArrayField(value: unknown, maximumLength = 64) {
  if (!Array.isArray(value) || value.length > maximumLength) return null;
  const values = value.map((entry) => textField(entry, 128));
  return values.every((entry): entry is string => Boolean(entry)) ? [...new Set(values)] : null;
}
