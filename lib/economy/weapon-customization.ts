export type StickerPlacement = {
  slot: number; id: number; stickerItemId?: string;
  offsetX: number; offsetY: number; rotation: number; wear: number;
};
export type CharmPlacement = {
  id: number; charmItemId?: string; offsetX: number; offsetY: number; offsetZ: number;
};
export type WeaponCustomization = { stickers: StickerPlacement[]; charm?: CharmPlacement };

function reject(message: string): never {
  throw Object.assign(new Error(message), { code: "invalid_input" });
}
function record(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value)) reject("The attachment configuration is invalid.");
  return value as Record<string, unknown>;
}
function number(value: unknown, min: number, max: number, integer = false): number {
  if (typeof value !== "number" || !Number.isFinite(value) || value < min || value > max || (integer && !Number.isSafeInteger(value))) reject("An attachment value is out of range.");
  return value;
}
function itemId(value: unknown): string | undefined {
  if (value === undefined) return undefined;
  if (typeof value !== "string" || !value.trim() || value.length > 128) reject("The attachment item ID is invalid.");
  return value.trim();
}
export function parseWeaponCustomization(value: unknown): WeaponCustomization {
  const input = record(value);
  if (!Array.isArray(input.stickers) || input.stickers.length > 5) reject("Choose up to five stickers.");
  const slots = new Set<number>();
  const ids = new Set<string>();
  const stickers = input.stickers.map((value): StickerPlacement => {
    const row = record(value);
    const slot = number(row.slot, 0, 4, true);
    const ownedId = itemId(row.stickerItemId);
    if (slots.has(slot) || (ownedId && ids.has(ownedId))) reject("Each sticker and slot can be used once.");
    slots.add(slot);
    if (ownedId) ids.add(ownedId);
    return { slot, id: number(row.id, 1, 1_000_000, true), ...(ownedId ? { stickerItemId: ownedId } : {}),
      offsetX: number(row.offsetX, -10, 10), offsetY: number(row.offsetY, -10, 10),
      rotation: number(row.rotation, -360, 360), wear: number(row.wear, 0, 1) };
  }).sort((a, b) => a.slot - b.slot);
  let charm: CharmPlacement | undefined;
  if (input.charm !== undefined) {
    const row = record(input.charm);
    const ownedId = itemId(row.charmItemId);
    if (ownedId && ids.has(ownedId)) reject("An inventory item can only be used once.");
    charm = { id: number(row.id, 1, 1_000_000, true), ...(ownedId ? { charmItemId: ownedId } : {}),
      offsetX: number(row.offsetX, -64, 64), offsetY: number(row.offsetY, -64, 64), offsetZ: number(row.offsetZ, -64, 64) };
  }
  return { stickers, ...(charm ? { charm } : {}) };
}

// The repository resolves additions only after locking and checking ownership,
// state and type. Viewer ids alone never authorize granting an attachment.
export function authorizeStickerPlacement(placement: StickerPlacement, existing: { definitionIndex: number | null } | null, addition: { definitionIndex: number | null } | null) {
  if (placement.stickerItemId) {
    if (existing || !addition || addition.definitionIndex !== placement.id) reject("That sticker or slot has changed. Reload your inventory.");
  } else if (!existing || existing.definitionIndex !== placement.id) reject("That sticker is no longer attached. Reload your inventory.");
}
export function authorizeCharmPlacement(placement: CharmPlacement, existing: { id?: unknown } | null, addition: { definitionIndex: number | null } | null) {
  if (placement.charmItemId) {
    if (!addition || addition.definitionIndex !== placement.id) reject("That charm has changed. Reload your inventory.");
  } else if (!existing || existing.id !== placement.id) reject("That charm is no longer attached. Reload your inventory.");
}
