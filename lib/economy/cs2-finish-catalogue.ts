import manifest from "./cs2-finishes.json" with { type: "json" };

export type Cs2Finish = {
  name: string;
  itemType: string;
  minFloat: number | null;
  maxFloat: number | null;
  supportsStattrak: boolean;
};
type FinishIdentity = { itemType: string; definitionIndex: number | null; paintkit: number | null };
const finishes: Readonly<Record<string, Cs2Finish>> = manifest.finishes;
const definitionTypes = new Map(Object.entries(finishes).map(([key, finish]) => [Number(key.split(":")[0]), finish.itemType]));
const paintMaterials = new Set(Object.keys(finishes).map((key) => Number(key.split(":")[1])));

export function getCs2Finish(definitionIndex: number | null, paintkit: number | null): Cs2Finish | null {
  if (!Number.isSafeInteger(definitionIndex) || !Number.isSafeInteger(paintkit ?? 0)) return null;
  return finishes[`${definitionIndex}:${paintkit ?? 0}`] ?? null;
}

export function getCs2PaintkitWear(paintkit: number | null): Pick<Cs2Finish, "minFloat" | "maxFloat"> | null {
  const finish = Object.entries(finishes).find(([key]) => key.endsWith(`:${paintkit ?? 0}`))?.[1];
  return finish ? { minFloat: finish.minFloat, maxFloat: finish.maxFloat } : null;
}

export function isValidCs2Finish(item: FinishIdentity): boolean {
  if (!["skin", "knife", "glove"].includes(item.itemType)) return true;
  if (!Number.isSafeInteger(item.definitionIndex) || item.definitionIndex! <= 0 ||
      !Number.isSafeInteger(item.paintkit ?? 0) || (item.paintkit ?? 0) < 0) return false;
  const knownType = definitionTypes.get(item.definitionIndex!);
  return knownType === item.itemType && paintMaterials.has(item.paintkit ?? 0);
}

export function isCs2CatalogueFinishAvailable(item: FinishIdentity & { price?: { source: string; sourceReference?: string | null; euroCents: number } | null }): boolean {
  if (!isValidCs2Finish(item)) return false;
  if (!["skin", "knife", "glove"].includes(item.itemType) || getCs2Finish(item.definitionIndex, item.paintkit)) return true;
  return item.price?.source === "staff-last-known" && item.price.sourceReference === "staff-panel" && item.price.euroCents > 0;
}

// Released finishes remain eligible during price outages. Custom server pairs
// require a positive configured staff price before they can enter the economy.
export function cs2FinishValiditySql(alias: string): string {
  if (!/^[a-z][a-z0-9_]*$/i.test(alias)) throw new Error("Invalid catalogue SQL alias");
  const groups = new Map<number, number[]>();
  for (const key of Object.keys(finishes)) {
    const [definition, paint] = key.split(":").map(Number);
    const paints = groups.get(definition) ?? []; paints.push(paint); groups.set(definition, paints);
  }
  const released = [...groups].map(([definition, paints]) => {
    return `(${alias}.definition_index = ${definition} AND COALESCE(${alias}.paintkit, 0) IN (${paints.join(",")}))`;
  });
  const wrongTypes = [...definitionTypes].map(([definition, type]) => `(${alias}.definition_index = ${definition} AND ${alias}.item_type <> '${type}')`);
  const manual = `EXISTS (SELECT 1 FROM portal_economy_catalogue_prices AS finish_price WHERE finish_price.catalogue_id = ${alias}.id AND finish_price.is_current = 1 AND finish_price.price_source = 'staff-last-known' AND finish_price.source_reference = 'staff-panel' AND finish_price.market_price_eur_cents > 0)`;
  return `(${alias}.item_type NOT IN ('skin', 'knife', 'glove') OR (${alias}.definition_index IN (${[...definitionTypes.keys()].join(",")}) AND COALESCE(${alias}.paintkit, 0) IN (${[...paintMaterials].join(",")}) AND NOT (${wrongTypes.join(" OR ")}) AND (${released.join(" OR ")} OR ${manual})))`;
}
