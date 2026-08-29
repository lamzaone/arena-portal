import "server-only";

import { createHash, createHmac, randomBytes, timingSafeEqual } from "node:crypto";
import { cookies } from "next/headers";
import { cache } from "react";

import { createPortalSession, getPortalSession, revokePortalSession } from "@/lib/data/portal-repository";

const COOKIE_NAME = "arena_session";
const SESSION_TTL_SECONDS = 60 * 60 * 24 * 14;

export type PortalSession = {
  steamId: string;
  expiresAt: number;
  tokenHash: string;
  profileThemeKey: string | null;
};

function getSecret() {
  return process.env.SESSION_SECRET;
}

function useSecureSessionCookie() {
  try {
    const siteUrl = new URL(process.env.SITE_URL ?? "");
    if (siteUrl.protocol === "https:") return true;
    if (["localhost", "127.0.0.1", "::1"].includes(siteUrl.hostname)) return false;
  } catch {
    // Fall back to the deployment mode if SITE_URL is not configured yet.
  }
  return process.env.NODE_ENV === "production";
}

function sign(payload: string, secret: string) {
  return createHmac("sha256", secret).update(payload).digest("base64url");
}

function hashToken(token: string) {
  return createHash("sha256").update(token).digest("hex");
}

export async function createSessionToken(steamId: string) {
  if (!/^7656119\d{10}$/.test(steamId)) throw new Error("Invalid SteamID64.");

  const token = randomBytes(32).toString("base64url");
  const expiresAt = Date.now() + SESSION_TTL_SECONDS * 1_000;
  await createPortalSession({ tokenHash: hashToken(token), steamId, expiresAt });
  return token;
}

async function getSessionUncached() {
  const cookieStore = await cookies();
  const token = cookieStore.get(COOKIE_NAME)?.value;
  if (!token || token.length < 32) return null;

  const tokenHash = hashToken(token);
  const storedSession = await getPortalSession(tokenHash);
  if (!storedSession || storedSession.expiresAt <= Date.now()) return null;
  return { ...storedSession, tokenHash };
}

// Layouts, pages, and shared navigation often need the same viewer. React's
// request cache keeps those consumers on one validated session read instead
// of repeating the database lookup during a single server render.
export const getSession = cache(getSessionUncached);

export async function revokeCurrentSession() {
  const cookieStore = await cookies();
  const token = cookieStore.get(COOKIE_NAME)?.value;
  if (token) await revokePortalSession(hashToken(token));
}

export function createAdminActionToken(session: PortalSession) {
  const secret = getSecret();
  if (!secret) return "";
  return sign(`admin-action:${session.steamId}:${session.expiresAt}:${session.tokenHash}`, secret);
}

export function verifyAdminActionToken(session: PortalSession, token: string) {
  const expected = createAdminActionToken(session);
  if (!token || !expected || token.length !== expected.length) return false;
  return timingSafeEqual(Buffer.from(token), Buffer.from(expected));
}

// State-changing player endpoints use a separate, session-bound token. It is
// intentionally scoped away from staff actions so a token from the cosmetic UI
// cannot be replayed against moderation routes.
export function createLoadoutActionToken(session: PortalSession) {
  const secret = getSecret();
  if (!secret) return "";
  return sign(`loadout-action:${session.steamId}:${session.expiresAt}:${session.tokenHash}`, secret);
}

export function verifyLoadoutActionToken(session: PortalSession, token: string) {
  const expected = createLoadoutActionToken(session);
  if (!token || !expected || token.length !== expected.length) return false;
  return timingSafeEqual(Buffer.from(token), Buffer.from(expected));
}

// Economy mutations have their own session-bound CSRF scope.  Keeping it
// separate from both legacy loadout and staff actions prevents a token issued
// for one surface from being replayed against a wallet or inventory action.
export function createEconomyActionToken(session: PortalSession) {
  const secret = getSecret();
  if (!secret) return "";
  return sign(`economy-action:${session.steamId}:${session.expiresAt}:${session.tokenHash}`, secret);
}

export function verifyEconomyActionToken(session: PortalSession, token: string) {
  const expected = createEconomyActionToken(session);
  if (!token || !expected || token.length !== expected.length) return false;
  return timingSafeEqual(Buffer.from(token), Buffer.from(expected));
}

// Account privacy and profile presentation are isolated from economy and
// staff mutations. A token rendered on Settings cannot be replayed to move an
// item, spend Tokens, or perform an administrative action.
export function createProfileActionToken(session: PortalSession) {
  const secret = getSecret();
  if (!secret) return "";
  return sign(
    `profile-action:${session.steamId}:${session.expiresAt}:${session.tokenHash}`,
    secret,
  );
}

export function verifyProfileActionToken(
  session: PortalSession,
  token: string,
) {
  const expected = createProfileActionToken(session);
  if (!token || !expected || token.length !== expected.length) return false;
  return timingSafeEqual(Buffer.from(token), Buffer.from(expected));
}

export function sessionCookieOptions() {
  return {
    httpOnly: true,
    secure: useSecureSessionCookie(),
    sameSite: "lax" as const,
    path: "/",
    maxAge: SESSION_TTL_SECONDS
  };
}

export { COOKIE_NAME };
