import { NextResponse } from "next/server";

import { getAdminAccess } from "@/lib/admin/access";
import { getSession } from "@/lib/auth/session";
import {
  getEconomyCatalogue,
  getEconomyCatalogueItem,
} from "@/lib/data/portal-repository";

const noStore = { "Cache-Control": "private, no-store" };

function json(payload: unknown, status = 200) {
  return NextResponse.json(payload, { status, headers: noStore });
}

function catalogueId(value: string) {
  if (!/^\d{1,20}$/.test(value)) return null;
  const parsed = Number(value);
  return Number.isSafeInteger(parsed) && parsed > 0 ? parsed : null;
}

export async function GET(request: Request) {
  const session = await getSession();
  if (!session) return json({ ok: false, message: "Sign in required." }, 401);

  const access = await getAdminAccess(session.steamId);
  if (!access.isAdmin || !access.canViewEconomy)
    return json({ ok: false, message: "Economy staff access required." }, 403);

  const query = new URL(request.url).searchParams.get("q")?.trim() ?? "";
  if (query.length > 120)
    return json({ ok: false, message: "Search is too long." }, 400);

  try {
    const exactId = catalogueId(query);
    const page = exactId
      ? await getEconomyCatalogueItem(exactId, true).then((item) => ({
          items: item ? [item] : [],
          total: item ? 1 : 0,
        }))
      : await getEconomyCatalogue({
          includeDisabled: true,
          query: query || undefined,
          pageSize: 24,
        });

    return json({
      ok: true,
      total: page.total,
      items: page.items.map((item) => ({
        id: item.id,
        displayName: item.displayName,
        itemType: item.itemType,
      })),
    });
  } catch {
    return json(
      { ok: false, message: "Catalogue search is temporarily unavailable." },
      503,
    );
  }
}
