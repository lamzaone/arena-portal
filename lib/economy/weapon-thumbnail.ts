import { toInspectLink, weaponIdForDefindex, type SkinViewerItem } from "@skinhub/viewer";
import { weaponLegacyModel } from "./weapon-model.ts";
import models from "./cs2-skin-models.json" with { type: "json" };
import { getCs2Finish } from "./cs2-finish-catalogue.ts";
import { weaponPreviewItem, type WeaponPreviewSource } from "./weapon-preview.ts";

export type WeaponThumbnail = SkinViewerItem & { defindex: number; float: number; seed: number };
const renderablePaints = new Set(Object.keys(models.variants).map(key => Number(key.split(":")[1])));
function record(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value)) throw new Error("Invalid thumbnail item");
  return value as Record<string, unknown>;
}
function number(value: unknown, minimum: number, maximum: number, integer = false): number {
  if (typeof value !== "number" || !Number.isFinite(value) || value < minimum || value > maximum || (integer && !Number.isSafeInteger(value))) throw new Error("Invalid thumbnail value");
  return value;
}
export function normalizeWeaponThumbnail(input: unknown): WeaponThumbnail {
  const value = record(input);
  const defindex = number(value.defindex, 1, 65535, true);
  if (!weaponIdForDefindex(defindex)) throw new Error("Unsupported weapon");
  const paintIndex = number(value.paintIndex, 0, 100000, true);
  // Shared paint materials can also render priced custom combinations, e.g.
  // Glock | Case Hardened. A missing released pair is not a missing material.
  if (!renderablePaints.has(paintIndex)) throw new Error("Finish rendering unavailable");
  const statTrak = value.statTrak === false || value.statTrak === undefined ? false : number(value.statTrak, 0, 2147483647, true);
  if (value.nameTag != null && (typeof value.nameTag !== "string" || value.nameTag.length > 128)) throw new Error("Invalid name tag");
  if (value.stickers != null && (!Array.isArray(value.stickers) || value.stickers.length > 5)) throw new Error("Invalid stickers");
  const slots = new Set<number>();
  const stickers = ((value.stickers ?? []) as unknown[]).filter(entry => entry != null).map(entry => {
    const sticker = record(entry);
    const slot = number(sticker.slot, 0, 4, true) as 0 | 1 | 2 | 3 | 4;
    if (slots.has(slot)) throw new Error("Duplicate sticker slot");
    slots.add(slot);
    return { slot, id: number(sticker.id, 1, 100000, true), wear: number(sticker.wear ?? 0, 0, 1), rotation: number(sticker.rotation ?? 0, -360, 360), offsetX: number(sticker.offsetX ?? 0, -10, 10), offsetY: number(sticker.offsetY ?? 0, -10, 10) };
  }).sort((a,b) => a.slot - b.slot);
  const charm = value.charm == null ? null : record(value.charm);
  const offset = charm?.offset ?? [0,0,0];
  if (charm && (!Array.isArray(offset) || offset.length !== 3)) throw new Error("Invalid charm offset");
  return { defindex, paintIndex, float: number(value.float, 0, 1), seed: number(value.seed, 0, 1000, true),
    statTrak, nameTag: (value.nameTag as string | null | undefined) ?? null,
    legacyModel: weaponLegacyModel(defindex, paintIndex, value.legacyModel === true), stickers,
    charm: charm ? { id: number(charm.id, 1, 100000, true), seed: number(charm.seed ?? 0, 0, 100000, true), offset: (offset as unknown[]).map(v => number(v,-64,64)) as [number,number,number] } : null };
}
export function thumbnailForSource(source: WeaponPreviewSource, floatValue?: number | null, seed?: number | null) {
  const finish = getCs2Finish(source.definitionIndex ?? null, source.paintkit ?? null);
  const sampleFloat = Math.min(finish?.maxFloat ?? 1, Math.max(finish?.minFloat ?? 0, 0.15));
  const resolved = weaponPreviewItem({ ...source, floatValue: floatValue ?? source.floatValue ?? sampleFloat, seed: seed ?? source.seed ?? 0 });
  if (!resolved) return null;
  try { return { item: normalizeWeaponThumbnail(resolved), sample: source.seed == null || (floatValue == null && source.floatValue == null) }; }
  catch { return null; }
}
export function thumbnailSignature(item: WeaponThumbnail) {
  // Bump this version when framing, render quality or provider assets change.
  return JSON.stringify({ version: 3, item });
}
export function thumbnailFrameUrl(item: WeaponThumbnail) {
  // The documented URL integration carries the whole configuration. The plain
  // name-tag field preserves portal names longer than the inspect codec allows.
  const inspect = toInspectLink({ ...item, nameTag: null });
  const url = new URL("https://skinhub.gg/frame");
  const values = { weapon: weaponIdForDefindex(item.defindex)!, paint: item.paintIndex, i: inspect,
    float: item.float, seed: item.seed, st: item.statTrak === false ? -1 : item.statTrak ?? -1,
    nametag: item.nameTag ?? "", legacy: item.legacyModel ? 1 : 0, view: "gun", zoom: 0.88,
    bloom: 0, scale: 1, shadows: 0, map: "Warehouse", bg: "transparent", orbit: 0, wheel: 0,
    dragstickers: 0, dragcharm: 0, slot: -1, hostloading: 1 };
  for (const [key,value] of Object.entries(values)) url.searchParams.set(key,String(value));
  return url.toString();
}
