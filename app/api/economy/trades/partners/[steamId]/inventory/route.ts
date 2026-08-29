import { NextResponse } from "next/server";

import { getSession } from "@/lib/auth/session";
import {
  EconomyRepositoryError,
  getTradePartnerInventory,
} from "@/lib/data/portal-repository";

type RouteContext = { params: Promise<{ steamId: string }> };

const privateNoStore = { "Cache-Control": "private, no-store" };

function json(payload: unknown, status = 200) {
  return NextResponse.json(payload, { status, headers: privateNoStore });
}

function pageNumber(value: string | null) {
  if (value === null || value === "") return 1;
  if (!/^\d+$/.test(value)) return null;
  const page = Number(value);
  return Number.isSafeInteger(page) && page > 0 ? page : null;
}

export async function GET(request: Request, { params }: RouteContext) {
  const session = await getSession();
  if (!session)
    return json(
      { ok: false, message: "Sign in with Steam to view a trade inventory." },
      401,
    );

  const { steamId } = await params;
  if (!/^7656119\d{10}$/.test(steamId))
    return json({ ok: false, message: "Choose a valid trade partner." }, 400);
  if (steamId === session.steamId)
    return json({ ok: false, message: "Choose another player to trade with." }, 400);

  const searchParams = new URL(request.url).searchParams;
  const query = searchParams.get("q")?.trim() ?? "";
  const page = pageNumber(searchParams.get("page"));
  if (query.length > 120)
    return json({ ok: false, message: "The inventory search is too long." }, 400);
  if (page === null)
    return json({ ok: false, message: "Choose a valid inventory page." }, 400);

  try {
    // Player identity is already selected by the search endpoint. Inventory
    // pagination stays independent from optional Steam profile hydration.
    const inventory = await getTradePartnerInventory(session.steamId, steamId, {
      query: query || undefined,
      page,
      pageSize: 48,
    });
    const response = {
      ok: true as const,
      visibility: inventory.visibility,
      items: inventory.items,
      page: inventory.page,
      pageSize: inventory.pageSize,
      ...(inventory.total === undefined ? {} : { total: inventory.total }),
    };
    return json(response);
  } catch (error) {
    if (error instanceof EconomyRepositoryError && error.code === "invalid_input")
      return json({ ok: false, message: error.message }, 400);
    return json(
      { ok: false, message: "That inventory is temporarily unavailable." },
      503,
    );
  }
}
