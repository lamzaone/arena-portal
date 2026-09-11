import { NextResponse } from "next/server";
import { DiscordLinkError } from "./link-repository";

export function discordLinkJson(payload: unknown, status = 200, headers: Record<string, string> = {}) {
  return NextResponse.json(payload, { status, headers: { "Cache-Control": "private, no-store", ...headers } });
}

export function discordLinkFailure(error: unknown) {
  if (error instanceof DiscordLinkError) {
    const statuses = { invalid_input: 400, invalid_code: 400, expired_code: 410, already_linked: 409, rate_limited: 429, storage_unavailable: 503 };
    return discordLinkJson(
      { ok: false, error: error.code, message: error.message, ...(error.retryAfterSeconds ? { retryAfterSeconds: error.retryAfterSeconds } : {}) },
      statuses[error.code],
      error.retryAfterSeconds ? { "Retry-After": String(error.retryAfterSeconds) } : {},
    );
  }
  return discordLinkJson({ ok: false, error: "storage_unavailable", message: "Discord linking is temporarily unavailable. Try again later." }, 503);
}

export async function readDiscordLinkBody(request: Request): Promise<Record<string, unknown> | null> {
  try {
    const value: unknown = await request.json();
    return typeof value === "object" && value !== null && !Array.isArray(value) ? value as Record<string, unknown> : null;
  } catch {
    return null;
  }
}
