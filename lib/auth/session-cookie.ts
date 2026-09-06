import "server-only";

import { createHash } from "node:crypto";
import { cookies } from "next/headers";

export const COOKIE_NAME = "arena_session";

export function hashSessionToken(token: string) {
  return createHash("sha256").update(token).digest("hex");
}

export async function readSessionTokenHash() {
  const cookieStore = await cookies();
  const token = cookieStore.get(COOKIE_NAME)?.value;
  if (!token || token.length < 32) return null;
  return hashSessionToken(token);
}
