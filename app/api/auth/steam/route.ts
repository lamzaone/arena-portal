import { NextRequest, NextResponse } from "next/server";

import { createSteamLoginUrl } from "@/lib/auth/steam";
import { portalRedirectUrl } from "@/lib/portal-url";

export async function GET(request: NextRequest) {
  try {
    return NextResponse.redirect(createSteamLoginUrl(request.nextUrl));
  } catch {
    return NextResponse.redirect(portalRedirectUrl(request.url, "/?auth=configuration"));
  }
}
