import { NextResponse } from "next/server";

import { COOKIE_NAME, revokeCurrentSession, sessionCookieOptions } from "@/lib/auth/session";

export async function POST(request: Request) {
  await revokeCurrentSession();
  const response = NextResponse.redirect(new URL("/", request.url), 303);
  response.cookies.set(COOKIE_NAME, "", { ...sessionCookieOptions(), maxAge: 0 });
  return response;
}
