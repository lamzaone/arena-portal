import { NextRequest, NextResponse } from "next/server";

import { createSessionToken, COOKIE_NAME, sessionCookieOptions } from "@/lib/auth/session";
import { verifySteamLogin } from "@/lib/auth/steam";
import { portalRedirectUrl } from "@/lib/portal-url";

export async function GET(request: NextRequest) {
  try {
    const steamId = await verifySteamLogin(request.nextUrl);
    if (!steamId) return NextResponse.redirect(portalRedirectUrl(request.url, "/?auth=failed"));

    const token = await createSessionToken(steamId);

    const response = NextResponse.redirect(portalRedirectUrl(request.url, `/players/${steamId}`));
    response.cookies.set(COOKIE_NAME, token, sessionCookieOptions());
    return response;
  } catch {
    return NextResponse.redirect(portalRedirectUrl(request.url, "/?auth=configuration"));
  }
}
