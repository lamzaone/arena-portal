import "server-only";

import { createHmac, timingSafeEqual } from "node:crypto";
import { cookies } from "next/headers";

const COOKIE_NAME = "arena_session";
const SESSION_TTL_SECONDS = 60 * 60 * 24 * 14;

export type PortalSession = {
  steamId: string;
  expiresAt: number;
};

function getSecret() {
  return process.env.SESSION_SECRET;
}

function sign(payload: string, secret: string) {
  return createHmac("sha256", secret).update(payload).digest("base64url");
}

export function createSessionToken(steamId: string) {
  const secret = getSecret();
  if (!secret) {
    throw new Error("SESSION_SECRET is not configured.");
  }

  const session: PortalSession = {
    steamId,
    expiresAt: Date.now() + SESSION_TTL_SECONDS * 1000
  };
  const payload = Buffer.from(JSON.stringify(session)).toString("base64url");
  return `${payload}.${sign(payload, secret)}`;
}

function parseSession(value: string | undefined): PortalSession | null {
  const secret = getSecret();
  if (!value || !secret) return null;

  const [payload, signature] = value.split(".");
  if (!payload || !signature) return null;

  const expected = sign(payload, secret);
  if (signature.length !== expected.length) return null;
  if (!timingSafeEqual(Buffer.from(signature), Buffer.from(expected))) return null;

  try {
    const session = JSON.parse(Buffer.from(payload, "base64url").toString("utf8")) as PortalSession;
    if (!/^7656119\d{10}$/.test(session.steamId) || session.expiresAt <= Date.now()) return null;
    return session;
  } catch {
    return null;
  }
}

export async function getSession() {
  const cookieStore = await cookies();
  return parseSession(cookieStore.get(COOKIE_NAME)?.value);
}

export function sessionCookieOptions() {
  return {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax" as const,
    path: "/",
    maxAge: SESSION_TTL_SECONDS
  };
}

export { COOKIE_NAME };
