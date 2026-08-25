import { NextRequest, NextResponse } from "next/server";

import { createSteamLoginUrl } from "@/lib/auth/steam";

export async function GET(request: NextRequest) {
  try {
    return NextResponse.redirect(createSteamLoginUrl(request.nextUrl));
  } catch {
    return NextResponse.redirect(new URL("/?auth=configuration", request.url));
  }
}
