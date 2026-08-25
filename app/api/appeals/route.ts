import { NextResponse } from "next/server";

import { getSession } from "@/lib/auth/session";
import { createAppeal, getPlayerDashboard } from "@/lib/data/portal-repository";

function hasActiveBan(expiresAt: number) {
  return expiresAt === 0 || expiresAt > Math.floor(Date.now() / 1_000);
}

export async function POST(request: Request) {
  const session = await getSession();
  if (!session) return NextResponse.redirect(new URL("/api/auth/steam", request.url), 303);

  const body = String((await request.formData()).get("body") ?? "").trim();
  if (body.length < 20 || body.length > 5_000) {
    return NextResponse.redirect(new URL("/appeals?error=validation", request.url), 303);
  }

  const dashboard = await getPlayerDashboard(session.steamId);
  const activeBan = dashboard.bans.find((ban) => hasActiveBan(ban.expiresAt));
  if (!activeBan) return NextResponse.redirect(new URL("/appeals?error=not-banned", request.url), 303);

  try {
    await createAppeal(session.steamId, activeBan.id, body);
    return NextResponse.redirect(new URL("/appeals?submitted=1", request.url), 303);
  } catch {
    return NextResponse.redirect(new URL("/appeals?error=storage", request.url), 303);
  }
}
