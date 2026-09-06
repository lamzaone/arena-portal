import "server-only";

import type { LoadoutAgent, LoadoutCatalogue, LoadoutCategory, LoadoutItem, LoadoutPaintkit } from "@/lib/data/portal-repository";

type PreviewRequest =
  | { category: Exclude<LoadoutCategory, "glove">; definitionIndex: number; paintkit: number; wear: number }
  | { category: "agent"; agentIndex: number };

type CachedPreview = { imageUrl: string | null; expiresAt: number };

const previewCache = new Map<string, CachedPreview>();
const previewRequests = new Map<string, Promise<string | null>>();
const successfulPreviewTtl = 1000 * 60 * 60 * 12;
const failedPreviewTtl = 1000 * 60 * 10;

function wearLabel(wear: number) {
  if (wear <= 0.07) return "Factory New";
  if (wear <= 0.15) return "Minimal Wear";
  if (wear <= 0.38) return "Field-Tested";
  if (wear <= 0.45) return "Well-Worn";
  return "Battle-Scarred";
}

function findItem(catalogue: LoadoutCatalogue, category: LoadoutCategory, definitionIndex: number, paintkit: number) {
  const item = catalogue.items.find((candidate) => candidate.category === category && candidate.definitionIndex === definitionIndex);
  const finish = item?.paintkits.find((candidate) => candidate.paintkit === paintkit);
  return item && finish ? { item, finish } : null;
}

function marketNamesForItem(item: LoadoutItem, finish: LoadoutPaintkit, wear: number) {
  const name = `${item.displayName} | ${finish.displayName} (${wearLabel(wear)})`;
  if (item.category !== "knife" || item.displayName.startsWith("★")) return [name];
  return [`★ ${name}`, name];
}

function marketNamesForAgent(agent: LoadoutAgent) {
  return [agent.displayName];
}

function imageUrlFromMarketHtml(html: string) {
  const matches = html.matchAll(/https:\/\/(?:community\.)?steamstatic\.com\/economy\/image\/[^"'\\\s<>]+/g);
  for (const match of matches) {
    const imageUrl = match[0].replaceAll("&amp;", "&");
    try {
      const url = new URL(imageUrl);
      if (url.protocol === "https:" && url.hostname.endsWith("steamstatic.com") && url.pathname.startsWith("/economy/image/")) return url.toString();
    } catch {
      // Keep searching the page for a valid official economy image URL.
    }
  }
  return null;
}

async function fetchMarketImage(marketName: string) {
  const url = `https://steamcommunity.com/market/listings/730/${encodeURIComponent(marketName)}`;
  try {
    const response = await fetch(url, {
      headers: { "User-Agent": "TAPPED.RO Loadout Preview/1.0", "Accept-Language": "en-US,en;q=0.9" },
      // Listing HTML regularly exceeds Next's 2 MB fetch-cache limit.
      // Keep only its extracted image URL in the preview cache below.
      cache: "no-store"
    });
    if (!response.ok) return null;
    return imageUrlFromMarketHtml(await response.text());
  } catch {
    return null;
  }
}

/**
 * Resolves official Steam Community Market art for one or more trusted market
 * names. Callers must derive the names server-side; this function never
 * accepts a browser-supplied URL.
 */
export async function getMarketPreviewForNames(marketNames: readonly string[]) {
  for (const rawName of marketNames) {
    const marketName = rawName.trim();
    if (!marketName || marketName.length > 255) continue;
    const cacheKey = marketName.toLowerCase();
    const cached = previewCache.get(cacheKey);
    if (cached && cached.expiresAt > Date.now()) {
      if (cached.imageUrl) return cached.imageUrl;
      continue;
    }

    let pending = previewRequests.get(cacheKey);
    if (!pending) {
      pending = fetchMarketImage(marketName).then(imageUrl => {
        previewCache.set(cacheKey, {
          imageUrl,
          expiresAt: Date.now() + (imageUrl ? successfulPreviewTtl : failedPreviewTtl),
        });
        return imageUrl;
      }).finally(() => { previewRequests.delete(cacheKey); });
      previewRequests.set(cacheKey, pending);
    }
    const imageUrl = await pending;
    if (imageUrl) return imageUrl;
  }

  return null;
}

export async function getMarketPreview(catalogue: LoadoutCatalogue, request: PreviewRequest) {
  let marketNames: string[];
  if (request.category === "agent") {
    const agent = catalogue.agents.find((candidate) => candidate.agentIndex === request.agentIndex);
    if (!agent) return null;
    marketNames = marketNamesForAgent(agent);
  } else {
    const selected = findItem(catalogue, request.category, request.definitionIndex, request.paintkit);
    if (!selected) return null;
    marketNames = marketNamesForItem(selected.item, selected.finish, request.wear);
  }

  return getMarketPreviewForNames(marketNames);
}
