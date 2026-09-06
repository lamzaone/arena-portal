import "server-only";

// ByMykel's open CS2 catalogue is generated from the game files and includes
// image metadata for skins, containers, stickers, agents, music kits, and
// other item classes. It is deliberately a fallback: Steam's market preview
// remains first because it can choose the correct exterior art for a wear.
const catalogueBaseUrl =
  "https://raw.githubusercontent.com/ByMykel/CSGO-API/main/public/api/en";

const sourceCacheTtl = 1000 * 60 * 60 * 12;
const failedSourceCacheTtl = 1000 * 60 * 10;
const imageCacheTtl = 1000 * 60 * 60 * 12;
const failedImageCacheTtl = 1000 * 60 * 10;

type JsonRecord = Record<string, unknown>;
type CachedValue<T> = { value: T; expiresAt: number };
type CatalogueImageSource = {
  imagesByName: Map<string, string>;
  imagesByDefinition: Map<number, string>;
  imagesBySkin: Map<string, string>;
};

export type Cs2ItemImageRequest = {
  itemType: string;
  definitionIndex: number | null;
  paintkit: number | null;
  displayName: string;
  marketHashName: string | null;
};

const sourceCache = new Map<string, CachedValue<CatalogueImageSource>>();
const sourceRequests = new Map<string, Promise<CatalogueImageSource>>();
const imageCache = new Map<string, CachedValue<string | null>>();

function asRecord(value: unknown): JsonRecord | null {
  return typeof value === "object" && value !== null && !Array.isArray(value)
    ? (value as JsonRecord)
    : null;
}

function asRows(value: unknown): JsonRecord[] {
  return Array.isArray(value)
    ? value.flatMap((entry) => {
        const record = asRecord(entry);
        return record ? [record] : [];
      })
    : [];
}

function asNumber(value: unknown) {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value === "string" && value.trim()) {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : null;
  }
  return null;
}

function asText(value: unknown) {
  return typeof value === "string" && value.trim() ? value.trim() : null;
}

function normalizeName(value: string | null | undefined) {
  return (value ?? "")
    .replace(/<[^>]+>/g, " ")
    .replace(/^★\s*/u, "")
    .replace(/^StatTrak(?:™)?\s+/iu, "")
    .replace(/^Souvenir\s+/iu, "")
    .replace(/\s+\((?:Factory New|Minimal Wear|Field-Tested|Well-Worn|Battle-Scarred)\)$/iu, "")
    .replace(/\s+/g, " ")
    .trim()
    .toLocaleLowerCase("en-US");
}

function imageUrl(row: JsonRecord) {
  const value = asText(row.image);
  if (!value || value.length > 2_048) return null;
  try {
    const url = new URL(value);
    const trustedSteamHost =
      url.hostname === "steamstatic.com" ||
      url.hostname.endsWith(".steamstatic.com") ||
      url.hostname === "steamcdn-a.akamaihd.net";
    const trustedTrackerHost =
      url.hostname === "raw.githubusercontent.com" &&
      url.pathname.startsWith("/ByMykel/counter-strike-image-tracker/");
    return url.protocol === "https:" && (trustedSteamHost || trustedTrackerHost)
      ? url.toString()
      : null;
  } catch {
    return null;
  }
}

function skinKey(definitionIndex: number, paintkit: number) {
  return `${definitionIndex}:${paintkit}`;
}

function buildImageSource(file: string, rows: JsonRecord[]): CatalogueImageSource {
  const source: CatalogueImageSource = {
    imagesByName: new Map(),
    imagesByDefinition: new Map(),
    imagesBySkin: new Map(),
  };
  const isSkin = file === "skins.json";

  for (const row of rows) {
    const image = imageUrl(row);
    if (!image) continue;

    for (const name of [asText(row.market_hash_name), asText(row.name)]) {
      const normalized = normalizeName(name);
      if (normalized && !source.imagesByName.has(normalized)) {
        source.imagesByName.set(normalized, image);
      }
    }

    if (isSkin) {
      const weapon = asRecord(row.weapon);
      const definitionIndex = asNumber(weapon?.weapon_id);
      const paintkit = asNumber(row.paint_index);
      if (definitionIndex !== null && paintkit !== null) {
        const key = skinKey(definitionIndex, paintkit);
        if (!source.imagesBySkin.has(key)) source.imagesBySkin.set(key, image);
      }
      continue;
    }

    const definitionIndex = asNumber(row.def_index);
    if (definitionIndex !== null && !source.imagesByDefinition.has(definitionIndex)) {
      source.imagesByDefinition.set(definitionIndex, image);
    }
  }

  return source;
}

function sourceFiles(itemType: string) {
  switch (itemType.trim().toLocaleLowerCase("en-US")) {
    case "skin":
    case "weapon":
    case "knife":
    case "glove":
      return ["skins.json"];
    case "crate":
    case "case":
    case "capsule":
    case "container":
      return ["crates.json"];
    case "sticker":
      return ["stickers.json"];
    case "sticker_slab":
    case "sticker-slab":
      return ["sticker_slabs.json"];
    case "agent":
      return ["agents.json"];
    case "music_kit":
    case "music-kit":
    case "musickit":
      return ["music_kits.json"];
    case "keychain":
    case "charm":
      return ["keychains.json"];
    case "patch":
      return ["patches.json"];
    case "graffiti":
      return ["graffiti.json"];
    case "key":
      return ["keys.json"];
    case "collectible":
    case "coin":
    case "pin":
      return ["collectibles.json"];
    case "nametag":
    case "name_tag":
      return ["tools.json"];
    case "highlight":
      return ["highlights.json"];
    default:
      return [];
  }
}

async function getImageSource(file: string): Promise<CatalogueImageSource> {
  const cached = sourceCache.get(file);
  if (cached && cached.expiresAt > Date.now()) return cached.value;

  const inFlight = sourceRequests.get(file);
  if (inFlight) return inFlight;

  const request = (async () => {
    try {
      const response = await fetch(`${catalogueBaseUrl}/${file}`, {
        headers: { Accept: "application/json" },
        // Raw catalogues can exceed Next's 2 MB entry limit (crates alone is
        // over 10 MB). The shared maps below retain only indexed image URLs
        // for twelve hours and coalesce concurrent downloads.
        cache: "no-store",
      });
      if (!response.ok) throw new Error(`CS2 item catalogue returned ${response.status}.`);
      const source = buildImageSource(file, asRows(await response.json()));
      sourceCache.set(file, {
        value: source,
        expiresAt: Date.now() + sourceCacheTtl,
      });
      return source;
    } catch {
      const source = buildImageSource(file, []);
      sourceCache.set(file, {
        value: source,
        expiresAt: Date.now() + failedSourceCacheTtl,
      });
      return source;
    } finally {
      sourceRequests.delete(file);
    }
  })();

  sourceRequests.set(file, request);
  return request;
}

function findImage(
  source: CatalogueImageSource,
  file: string,
  request: Cs2ItemImageRequest,
) {
  const names = new Set(
    [request.marketHashName, request.displayName]
      .map((value) => normalizeName(value))
      .filter(Boolean),
  );
  const isSkin = file === "skins.json";

  // A public market hash is the most precise identity when it exists: it can
  // distinguish special variants even if a legacy import did not preserve all
  // of their auxiliary metadata.
  for (const name of names) {
    const namedImage = source.imagesByName.get(name);
    if (namedImage) return namedImage;
  }

  if (
    isSkin &&
    request.definitionIndex !== null &&
    request.paintkit !== null
  ) {
    const exactImage = source.imagesBySkin.get(
      skinKey(request.definitionIndex, request.paintkit),
    );
    if (exactImage) return exactImage;
  }

  if (!isSkin && request.definitionIndex !== null) {
    const exactImage = source.imagesByDefinition.get(request.definitionIndex);
    if (exactImage) return exactImage;
  }

  return null;
}

function cacheKey(request: Cs2ItemImageRequest) {
  return [
    request.itemType,
    request.definitionIndex ?? "",
    request.paintkit ?? "",
    normalizeName(request.displayName),
    normalizeName(request.marketHashName),
  ]
    .join("|")
    .toLocaleLowerCase("en-US");
}

/**
 * Gets static catalogue artwork as a later preview candidate. Steam's
 * wear-aware market image stays ahead of it for finishes, so this must never
 * replace an available float/wear-aware preview.
 */
export async function getCs2CatalogueImage(request: Cs2ItemImageRequest) {
  const key = cacheKey(request);
  const cached = imageCache.get(key);
  if (cached && cached.expiresAt > Date.now()) return cached.value;

  let resolved: string | null = null;
  for (const file of sourceFiles(request.itemType)) {
    const source = await getImageSource(file);
    resolved = findImage(source, file, request);
    if (resolved) break;
  }

  imageCache.set(key, {
    value: resolved,
    expiresAt: Date.now() + (resolved ? imageCacheTtl : failedImageCacheTtl),
  });
  return resolved;
}
