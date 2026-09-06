import { NextResponse } from "next/server";

import { getSession } from "@/lib/auth/session";
import {
  EconomyRepositoryError,
  getPlayerProfileInventoryPage,
} from "@/lib/data/portal-repository";
import { isIndividualSteamId64 } from "@/lib/steam/steam-id";
import { normalizeItemGridPageSize } from "@/lib/economy/item-grid-layout";

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
  const { steamId } = await params;
  if (!isIndividualSteamId64(steamId))
    return json({ ok: false, message: "Choose a valid player." }, 400);

  const searchParams = new URL(request.url).searchParams;
  const page = pageNumber(searchParams.get("page"));
  const pageSize = normalizeItemGridPageSize(searchParams.get("pageSize"));
  if (page === null)
    return json({ ok: false, message: "Choose a valid inventory page." }, 400);

  try {
    const session = await getSession();
    const inventory = await getPlayerProfileInventoryPage(
      session?.steamId ?? null,
      steamId,
      page,
      pageSize,
    );
    return json({ ok: true, ...inventory });
  } catch (error) {
    if (error instanceof EconomyRepositoryError && error.code === "invalid_input")
      return json({ ok: false, message: error.message }, 400);
    return json(
      { ok: false, message: "That inventory is temporarily unavailable." },
      503,
    );
  }
}
