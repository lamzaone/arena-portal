import { NextResponse } from "next/server";

import { getSession, verifyProfileActionToken } from "@/lib/auth/session";
import { getProfileCommunity, mutateProfileCommunity, parseProfileCommunityAction, ProfileCommunityError } from "@/lib/data/profile-community";
import { resolvePlayerIdentities } from "@/lib/player-identities";
import { isIndividualSteamId64 } from "@/lib/steam/steam-id";

type RouteContext = { params: Promise<{ steamId: string }> };
const json = (payload: unknown, status = 200) => NextResponse.json(payload, { status, headers: { "Cache-Control": "private, no-store" } });

async function snapshot(steamId: string, viewerSteamId: string | null, page: number) {
  const community = await getProfileCommunity(steamId, viewerSteamId, page);
  const identities = await resolvePlayerIdentities(community.comments.records.map(comment => ({ steamId: comment.authorSteamId }))).catch(() => ({}));
  return { community, identities };
}

export async function GET(request: Request, context: RouteContext) {
  const { steamId } = await context.params;
  if (!isIndividualSteamId64(steamId)) return json({ ok: false, message: "Choose a valid player profile." }, 400);
  const session = await getSession();
  const page = Number(new URL(request.url).searchParams.get("page") ?? 1);
  const result = await snapshot(steamId, session?.steamId ?? null, page);
  return json({ ok: true, ...result });
}

export async function POST(request: Request, context: RouteContext) {
  const session = await getSession();
  if (!session) return json({ ok: false, message: "Sign in with Steam before interacting with a player profile." }, 401);
  const { steamId } = await context.params;
  if (!isIndividualSteamId64(steamId)) return json({ ok: false, message: "Choose a valid player profile." }, 400);
  let body: Record<string, unknown>;
  try {
    const raw = await request.text();
    if (raw.length > 16_384) return json({ ok: false, message: "This profile request is too large." }, 413);
    const parsed: unknown = JSON.parse(raw);
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) return json({ ok: false, message: "This profile request was invalid." }, 400);
    body = parsed as Record<string, unknown>;
  } catch { return json({ ok: false, message: "This profile request was invalid." }, 400); }
  const csrf = typeof body.csrf === "string" ? body.csrf : "";
  if (!/^[A-Za-z0-9_-]{1,128}$/.test(csrf) || !verifyProfileActionToken(session, csrf)) return json({ ok: false, message: "Your session verification has expired. Reload and try again." }, 403);
  try {
    const action = parseProfileCommunityAction(body);
    await mutateProfileCommunity({ ...action, actorSteamId: session.steamId, targetSteamId: steamId });
    const page = action.action === "comment" ? 1 : Number(body.page ?? 1);
    const result = await snapshot(steamId, session.steamId, page);
    const message = action.action === "reputation" ? "Your reputation vote was saved."
      : action.action === "commendations" ? "Your commendations were saved."
      : action.action === "comments_setting" ? `Profile comments ${action.enabled ? "enabled" : "disabled"}.`
      : action.action === "delete_comment" ? "Comment deleted." : "Your comment was posted.";
    return json({ ok: true, message, ...result });
  } catch (error) {
    if (error instanceof ProfileCommunityError) {
      const statuses = { invalid_input: 400, forbidden: 403, disabled: 409, rate_limited: 429, unavailable: 503 } as const;
      return json({ ok: false, message: error.message }, statuses[error.code]);
    }
    return json({ ok: false, message: "This profile action could not be completed. Try again shortly." }, 503);
  }
}
