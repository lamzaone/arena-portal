import { NextRequest, NextResponse } from "next/server";

import { createSessionToken, COOKIE_NAME, sessionCookieOptions } from "@/lib/auth/session";
import { verifySteamLogin } from "@/lib/auth/steam";
import { ensurePortalAccount } from "@/lib/data/portal-repository";

export async function GET(request: NextRequest) {
  try {
    const steamId = await verifySteamLogin(request.nextUrl);
    if (!steamId) return NextResponse.redirect(new URL("/?auth=failed", request.url));

    const token = createSessionToken(steamId);
    // The portal account is optional during the first boot before the website
    // database has been migrated. Steam login must still work for read-only data.
    await ensurePortalAccount(steamId).catch(() => undefined);

    const response = NextResponse.redirect(new URL("/dashboard", request.url));
    response.cookies.set(COOKIE_NAME, token, sessionCookieOptions());
    return response;
  } catch {
    return NextResponse.redirect(new URL("/?auth=configuration", request.url));
  }
}
