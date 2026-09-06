type NumericPlacement = Record<string, number>;
export type TradeWeaponPreviewFields = {
  definitionIndex: number | null;
  paintkit: number | null;
  seed: number | null;
  attributes: { useLegacyModel?: boolean; keychain?: NumericPlacement };
  stickers: Array<{ slot: number; definitionIndex: number; attributes: NumericPlacement }>;
};

function record(value: unknown): Record<string, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : {};
}
function integer(value: unknown) {
  return typeof value === "number" && Number.isSafeInteger(value) && value >= 0 ? value : null;
}
function placement(value: unknown, keys: string[]): NumericPlacement {
  const source = record(value);
  return Object.fromEntries(keys.flatMap(key => typeof source[key] === "number" && Number.isFinite(source[key]) ? [[key, source[key]]] : []));
}

/** Public visual fields only: never copy inventory provenance or arbitrary metadata into trades. */
export function tradeWeaponPreviewFields(value: unknown): TradeWeaponPreviewFields {
  const source = record(value), raw = record(source.raw);
  const sourceAttributes = record(source.attributes ?? raw.attributes);
  const catalogue = record(source.catalogue ?? raw.catalogue);
  const metadata = record(catalogue.metadata ?? source.metadata);
  const attributes: TradeWeaponPreviewFields["attributes"] = {};
  const legacy = sourceAttributes.useLegacyModel ?? metadata.useLegacyModel;
  if (typeof legacy === "boolean") attributes.useLegacyModel = legacy;
  const keychain = placement(sourceAttributes.keychain, ["id", "seed", "offsetX", "offsetY", "offsetZ"]);
  if (Number.isSafeInteger(keychain.id) && keychain.id > 0) attributes.keychain = keychain;
  const suppliedStickers = source.stickers ?? raw.stickers;
  const stickers = (Array.isArray(suppliedStickers) ? suppliedStickers : []).flatMap(value => {
    const sticker = record(value), slot = integer(sticker.slot), definitionIndex = integer(sticker.definitionIndex);
    if (slot === null || slot > 5 || definitionIndex === null || definitionIndex < 1) return [];
    return [{ slot, definitionIndex, attributes: placement(sticker.attributes, ["schema", "wear", "rotation", "offsetX", "offsetY", "scale"]) }];
  });
  return { definitionIndex: integer(source.definitionIndex), paintkit: integer(source.paintkit), seed: integer(source.seed), attributes, stickers };
}
