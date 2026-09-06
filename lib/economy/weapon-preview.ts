import { toInspectLink, weaponIdForDefindex, type SkinViewerItem, type SkinViewerSticker } from "@skinhub/viewer";
import { weaponLegacyModel, viewerStickerPlacement } from "./weapon-model.ts";

export type WeaponPreviewSource = {
  itemType: string;
  definitionIndex?: number | null;
  paintkit?: number | null;
  floatValue?: number | null;
  seed?: number | null;
  stattrak?: boolean;
  stattrakCount?: number;
  nametag?: string | null;
  raw?: Record<string, unknown>;
};

export function previewRecord(value: unknown): Record<string, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : {};
}

function finite(value: unknown, fallback = 0) {
  return typeof value === "number" && Number.isFinite(value) ? value : fallback;
}

export function weaponPreviewItem(source: WeaponPreviewSource): SkinViewerItem | null {
  const { definitionIndex, paintkit, floatValue, seed } = source;
  if (!["skin", "weapon", "knife", "glove"].includes(source.itemType) ||
    typeof definitionIndex !== "number" || !weaponIdForDefindex(definitionIndex) ||
    typeof paintkit !== "number" || !Number.isSafeInteger(paintkit) || paintkit < 0 ||
    typeof floatValue !== "number" || !Number.isFinite(floatValue) || floatValue < 0 || floatValue > 1 ||
    typeof seed !== "number" || !Number.isSafeInteger(seed) || seed < 0 || seed > 1000) return null;

  const raw = source.raw ?? {};
  const attributes = previewRecord(raw.attributes);
  const metadata = previewRecord(previewRecord(raw.catalogue).metadata);
  const legacy = weaponLegacyModel(definitionIndex, paintkit, (attributes.useLegacyModel ?? metadata.useLegacyModel) === true);
  const stickers: SkinViewerSticker[] = [];
  const usedSlots = new Set<number>();
  for (const value of Array.isArray(raw.stickers) ? raw.stickers : []) {
    const row = previewRecord(value);
    const placement = previewRecord(row.attributes);
    const slot = finite(row.slot, -1);
    const id = finite(row.definitionIndex, -1);
    if (!Number.isSafeInteger(slot) || slot < 0 || slot > 4 || usedSlots.has(slot) || !Number.isSafeInteger(id) || id <= 0) continue;
    usedSlots.add(slot);
    stickers.push({ id, slot: slot as 0 | 1 | 2 | 3 | 4,
      wear: finite(placement.wear), rotation: finite(placement.rotation),
      ...viewerStickerPlacement(definitionIndex, paintkit, slot, finite(placement.schema), finite(placement.offsetX), finite(placement.offsetY), legacy) });
  }
  const keychain = previewRecord(attributes.keychain);
  const charmId = finite(keychain.id);
  return {
    defindex: definitionIndex, paintIndex: paintkit, float: floatValue, seed,
    statTrak: source.stattrak === true ? Math.max(0, Math.trunc(finite(source.stattrakCount))) : false,
    nameTag: source.nametag ?? null,
    legacyModel: legacy,
    stickers,
    charm: charmId > 0 && Number.isSafeInteger(charmId) ? {
      id: charmId, seed: finite(keychain.seed),
      offset: [finite(keychain.offsetX), finite(keychain.offsetY), finite(keychain.offsetZ)],
    } : null,
  };
}

export function weaponInspectLink(item: SkinViewerItem): string | null {
  try { return toInspectLink(item); } catch { return null; }
}

export function mergeWeaponPlacements(current: SkinViewerItem, changed: SkinViewerItem): SkinViewerItem {
  return { ...current,
    stickers: current.stickers?.map((sticker, index) => {
      if (!sticker) return null;
      const next = changed.stickers?.find((entry, nextIndex) => entry?.id === sticker.id && (entry.slot ?? nextIndex) === (sticker.slot ?? index));
      return next ? { ...sticker, offsetX: finite(next.offsetX), offsetY: finite(next.offsetY),
        rotation: finite(next.rotation), wear: finite(next.wear) } : sticker;
    }),
    charm: current.charm && changed.charm?.id === current.charm.id
      ? { ...current.charm, offset: changed.charm.offset ?? current.charm.offset }
      : current.charm,
  };
}
