import { NextResponse } from "next/server";

import { getSession } from "@/lib/auth/session";
import { getLoadoutCatalogue } from "@/lib/data/portal-repository";
import { getCs2CatalogueImage } from "@/lib/economy/cs2-item-images";
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

function previewResponse(candidates: Array<string | null | undefined>) {
  const seen = new Set<string>();
  const imageUrls: string[] = [];
  for (const candidate of candidates) {
    if (!candidate || seen.has(candidate)) continue;
    seen.add(candidate);
    imageUrls.push(candidate);
  }
  return NextResponse.json(
    { imageUrl: imageUrls[0] ?? null, imageUrls },
    { headers: { "Cache-Control": "private, max-age=600" } },
  );
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
    const agent = catalogue.agents.find(
      (candidate) => candidate.agentIndex === agentIndex,
    );
    const [marketImageUrl, catalogueImageUrl] = await Promise.all([
      getMarketPreview(catalogue, { category, agentIndex }),
      getCs2CatalogueImage({
        itemType: "agent",
        definitionIndex: agentIndex,
        paintkit: null,
        displayName: agent?.displayName ?? "",
        marketHashName: agent?.displayName ?? null,
      }),
    ]);
    return previewResponse([marketImageUrl, catalogueImageUrl]);
  }

  if (category !== "weapon" && category !== "knife") return NextResponse.json({ imageUrl: null }, { status: 400 });
  const definitionIndex = asInteger(url.searchParams.get("definitionIndex"), 1, 65_535);
  const paintkit = asInteger(url.searchParams.get("paintkit"), 0);
  const wear = asWear(url.searchParams.get("wear"));
  if (definitionIndex === null || paintkit === null || wear === null) return NextResponse.json({ imageUrl: null }, { status: 400 });

  const item = catalogue.items.find(
    (candidate) =>
      candidate.category === category &&
      candidate.definitionIndex === definitionIndex,
  );
  const finish = item?.paintkits.find(
    (candidate) => candidate.paintkit === paintkit,
  );
  const [marketImageUrl, catalogueImageUrl] = await Promise.all([
    getMarketPreview(catalogue, {
      category,
      definitionIndex,
      paintkit,
      wear,
    }),
    getCs2CatalogueImage({
      itemType: category === "weapon" ? "skin" : "knife",
      definitionIndex,
      paintkit,
      displayName:
        item && finish ? `${item.displayName} | ${finish.displayName}` : "",
      marketHashName: null,
    }),
  ]);
  return previewResponse([marketImageUrl, catalogueImageUrl]);
}
