import { NextResponse } from "next/server";

import { getAdminAccess } from "@/lib/admin/access";
import { getSession, verifyAdminActionToken } from "@/lib/auth/session";
import { refreshAllEconomyPublicPrices } from "@/lib/economy/price-refresh";

export const runtime = "nodejs";
export const maxDuration = 300;

function response(body: object, status: number) {
  return NextResponse.json(body, { status, headers: { "Cache-Control": "no-store" } });
}

export async function POST(request: Request) {
  const session = await getSession();
  if (!session) return response({ message: "Your staff session expired. Sign in and try again." }, 401);

  let payload: unknown;
  try {
    payload = await request.json();
  } catch {
    return response({ message: "The refresh request is invalid." }, 400);
  }
  if (!payload || typeof payload !== "object" || Array.isArray(payload))
    return response({ message: "The refresh request is invalid." }, 400);
  const csrf = (payload as Record<string, unknown>).csrf;
  if (typeof csrf !== "string" || !verifyAdminActionToken(session, csrf))
    return response({ message: "Session verification failed. Reload and try again." }, 403);

  const access = await getAdminAccess(session.steamId);
  if (!access.isAdmin || !access.canViewEconomy || !access.canManageEconomy)
    return response({ message: "Refreshing all prices requires full economy administration access." }, 403);

  try {
    // The service selects the entire eligible catalogue and holds the same
    // database lock used by scheduled refreshes. Client filters never apply.
    const result = await refreshAllEconomyPublicPrices();
    return response(result, result.status === "busy" ? 202 : result.status === "unavailable" ? 503 : 200);
  } catch {
    return response({ message: "The public price refresh failed. Try again later." }, 502);
  }
}
