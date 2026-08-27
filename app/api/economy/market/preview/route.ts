import { NextResponse } from "next/server";

import { getSession } from "@/lib/auth/session";
import { getEconomyCatalogueItem } from "@/lib/data/portal-repository";
import { getCs2CatalogueImage } from "@/lib/economy/cs2-item-images";
import { getMarketPreviewForNames } from "@/lib/loadout/market-preview";

function asCatalogueId(value: string | null) {
  if (!value || !/^\d+$/.test(value)) return null;
  const parsed = Number(value);
  return Number.isSafeInteger(parsed) && parsed > 0 ? parsed : null;
}

function asFloat(value: string | null) {
  if (!value) return 0.15;
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed >= 0 && parsed <= 1 ? parsed : 0.15;
}

function wearLabel(wear: number) {
  if (wear <= 0.07) return "Factory New";
  if (wear <= 0.15) return "Minimal Wear";
  if (wear <= 0.38) return "Field-Tested";
  if (wear <= 0.45) return "Well-Worn";
  return "Battle-Scarred";
}

function metadataText(metadata: Record<string, unknown>, keys: string[]) {
  for (const key of keys) {
    const value = metadata[key];
    if (typeof value === "string" && value.trim()) return value.trim();
  }
  return null;
}

function officialImageUrl(metadata: Record<string, unknown>) {
  const value = metadataText(metadata, [
    "imageUrl",
    "image",
    "iconUrl",
    "steamImageUrl",
  ]);
  if (!value) return null;
  try {
    const url = new URL(value);
    const officialHost =
      url.hostname === "steamstatic.com" ||
      url.hostname.endsWith(".steamstatic.com") ||
      url.hostname === "steamcdn-a.akamaihd.net";
    return url.protocol === "https:" && officialHost ? url.toString() : null;
  } catch {
    return null;
  }
}

function previewMarketNames(input: {
  itemType: string;
  displayName: string;
  marketHashName: string | null;
  metadata: Record<string, unknown>;
  wear: number;
}) {
  const names: string[] = [];
  const add = (value: string | null) => {
    if (!value || value.length > 255 || names.includes(value)) return;
    names.push(value);
  };

  add(input.marketHashName);
  const baseName = metadataText(input.metadata, ["marketBaseName"]);
  const isFinish = ["skin", "knife", "glove"].includes(input.itemType);
  if (isFinish) {
    const name = baseName ?? input.displayName;
    const marketName = `${name} (${wearLabel(input.wear)})`;
    if (input.itemType === "knife" || input.itemType === "glove") {
      add(name.startsWith("★") ? marketName : `★ ${marketName}`);
    }
    add(marketName);
  } else {
    add(baseName ?? input.displayName);
  }
  return names;
}

function uniqueImageUrls(values: Array<string | null | undefined>) {
  const seen = new Set<string>();
  const imageUrls: string[] = [];
  for (const value of values) {
    if (!value || seen.has(value)) continue;
    seen.add(value);
    imageUrls.push(value);
  }
  return imageUrls;
}

export async function GET(request: Request) {
  const session = await getSession();
  if (!session) return NextResponse.json({ imageUrl: null }, { status: 401 });

  const url = new URL(request.url);
  const catalogueId = asCatalogueId(url.searchParams.get("catalogueId"));
  if (catalogueId === null)
    return NextResponse.json({ imageUrl: null }, { status: 400 });

  const item = await getEconomyCatalogueItem(catalogueId);
  if (!item) return NextResponse.json({ imageUrl: null }, { status: 404 });

  const floatValue = asFloat(url.searchParams.get("float"));
  const [marketImageUrl, catalogueImageUrl] = await Promise.all([
    getMarketPreviewForNames(
      previewMarketNames({
        itemType: item.itemType,
        displayName: item.displayName,
        marketHashName: item.marketHashName,
        metadata: item.metadata,
        wear: floatValue,
      }),
    ),
    getCs2CatalogueImage({
      itemType: item.itemType,
      definitionIndex: item.definitionIndex,
      paintkit: item.paintkit,
      displayName: item.displayName,
      marketHashName: item.marketHashName,
    }),
  ]);
  const directImageUrl = officialImageUrl(item.metadata);
  const hasWearSensitivePreview = ["skin", "weapon", "knife", "glove"].includes(
    item.itemType,
  );
  // Keep Steam's exterior-aware art first for finishes. The open catalogue is
  // static artwork, so it only fills genuine holes rather than flattening a
  // selected float to a generic item thumbnail.
  const imageUrls = uniqueImageUrls(
    hasWearSensitivePreview
      ? [marketImageUrl, directImageUrl, catalogueImageUrl]
      : [directImageUrl, marketImageUrl, catalogueImageUrl],
  );

  return NextResponse.json(
    // Keep imageUrl for existing callers, and give current callers every
    // distinct trusted candidate so a dead Steam URL does not hide the
    // catalogue fallback behind it.
    { imageUrl: imageUrls[0] ?? null, imageUrls },
    { headers: { "Cache-Control": "private, max-age=600" } },
  );
}
