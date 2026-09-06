import manifest from "../lib/economy/cs2-finishes.json" with { type: "json" };

export const manifestRevision = manifest.sha256;
const definitions = new Set(Object.keys(manifest.finishes).map((key) => Number(key.split(":")[0])));
const materials = new Set(Object.keys(manifest.finishes).map((key) => Number(key.split(":")[1])));
export function isInvalidCatalogueFinish(row) {
  if (!["skin", "knife", "glove"].includes(row.item_type)) return false;
  if (row.definition_index === null) return true;
  const definition = Number(row.definition_index);
  if (!definitions.has(definition) || !materials.has(Number(row.paintkit ?? 0))) return true;
  const known = manifest.finishes[`${definition}:${Number(row.paintkit ?? 0)}`];
  if (known) return false;
  return !(row.price_source === "staff-last-known" && row.source_reference === "staff-panel" && Number(row.market_price_eur_cents) > 0);
}

export function planCatalogueQuarantine(catalogue, entries, inventoryCounts) {
  const invalid = catalogue.filter(isInvalidCatalogueFinish);
  const ids = new Set(invalid.map((row) => String(row.id)));
  return {
    manifestRevision,
    typeCorrections: catalogue.filter((row) => row.definition_index === 4725 && row.item_type === "skin" && manifest.finishes[`4725:${row.paintkit}`]?.itemType === "glove"),
    catalogue: invalid.filter((row) => Boolean(Number(row.enabled))),
    entries: entries.filter((row) => ids.has(String(row.catalogue_id)) && Boolean(Number(row.enabled))),
    invalidCatalogue: invalid,
    ownedInventory: inventoryCounts.filter((row) => ids.has(String(row.catalogue_id))),
    validWithoutCataloguePrice: catalogue.filter((row) => !isInvalidCatalogueFinish(row) && !row.has_price).length,
  };
}
