import models from "./cs2-skin-models.json" with { type: "json" };
import { stickerAnchorFor } from "@skinhub/cdn/placement";
import { weaponIdForDefindex } from "@skinhub/viewer";

const variants: Record<string, boolean> = models.variants;
export function weaponLegacyModel(definitionIndex: number, paintkit: number, fallback = false) {
  return variants[`${definitionIndex}:${paintkit}`] ?? fallback;
}
export function nativeStickerPlacement(definitionIndex: number, paintkit: number, slot: number, offsetX: number, offsetY: number, legacyFallback = false) {
  const anchor = stickerAnchorFor(weaponIdForDefindex(definitionIndex), weaponLegacyModel(definitionIndex, paintkit, legacyFallback), slot);
  return { schema: anchor?.anchor ?? 0, offsetX: Math.fround(offsetX + (anchor?.dx ?? 0)), offsetY: Math.fround(offsetY + (anchor?.dy ?? 0)) };
}
export function viewerStickerPlacement(definitionIndex: number, paintkit: number, slot: number, schema: number, offsetX: number, offsetY: number, legacyFallback = false) {
  const anchor = stickerAnchorFor(weaponIdForDefindex(definitionIndex), weaponLegacyModel(definitionIndex, paintkit, legacyFallback), slot);
  // Old default-schema rows have no shift. Do not move untouched stickers.
  return anchor && schema === anchor.anchor
    ? { offsetX: Math.fround(offsetX - anchor.dx), offsetY: Math.fround(offsetY - anchor.dy) }
    : { offsetX, offsetY };
}
