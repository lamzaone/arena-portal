import { NextResponse } from "next/server";

import { getSession } from "@/lib/auth/session";
import { getLoadoutCatalogue } from "@/lib/data/portal-repository";
import { getMarketPreview } from "@/lib/loadout/market-preview";

function asInteger(value: string | null, minimum = 0, maximum = Number.MAX_SAFE_INTEGER) {
  if (!value || !/^\d+$/.test(value)) return null;
  const parsed = Number(value);
  return Number.isSafeInteger(parsed) && parsed >= minimum && parsed <= maximum ? parsed : null;
}

function asWear(value: string | null) {
  if (!value) return null;
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed >= 0 && parsed <= 1 ? parsed : null;
}

export async function GET(request: Request) {
  const session = await getSession();
  if (!session) return NextResponse.json({ imageUrl: null }, { status: 401 });

  const url = new URL(request.url);
  const category = url.searchParams.get("category");
  const catalogue = await getLoadoutCatalogue();
  if (!catalogue) return NextResponse.json({ imageUrl: null }, { status: 503 });

  if (category === "agent") {
    const agentIndex = asInteger(url.searchParams.get("agentIndex"), 1);
    if (agentIndex === null) return NextResponse.json({ imageUrl: null }, { status: 400 });
    const imageUrl = await getMarketPreview(catalogue, { category, agentIndex });
    return NextResponse.json({ imageUrl }, { headers: { "Cache-Control": "private, max-age=600" } });
  }

  if (category !== "weapon" && category !== "knife") return NextResponse.json({ imageUrl: null }, { status: 400 });
  const definitionIndex = asInteger(url.searchParams.get("definitionIndex"), 1, 65_535);
  const paintkit = asInteger(url.searchParams.get("paintkit"), 0);
  const wear = asWear(url.searchParams.get("wear"));
  if (definitionIndex === null || paintkit === null || wear === null) return NextResponse.json({ imageUrl: null }, { status: 400 });

  const imageUrl = await getMarketPreview(catalogue, { category, definitionIndex, paintkit, wear });
  return NextResponse.json({ imageUrl }, { headers: { "Cache-Control": "private, max-age=600" } });
}
