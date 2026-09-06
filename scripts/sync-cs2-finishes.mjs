import { createHash } from "node:crypto";
import { writeFile } from "node:fs/promises";
import { fetchSkins } from "@skinhub/cdn/skins";

// Released weapon/paint pairs, not the game's larger list of applicable paints.
// Refresh and review this shared portal/server manifest after CS2 updates.
const skins = await fetchSkins();
const finishes = {};
for (const skin of skins) {
  const definition = skin.weapon.weapon_id;
  const paint = skin.paint_index === null ? 0 : Number(skin.paint_index);
  if (!Number.isSafeInteger(definition) || !Number.isSafeInteger(paint) ||
      typeof skin.name !== "string" || typeof skin.stattrak !== "boolean" ||
      (skin.min_float !== null && (!Number.isFinite(skin.min_float) || skin.min_float < 0)) ||
      (skin.max_float !== null && (!Number.isFinite(skin.max_float) || skin.max_float > 1)) ||
      (skin.min_float ?? 0) > (skin.max_float ?? 1)) {
    throw new Error("Unexpected released-finish catalogue schema");
  }
  const key = `${definition}:${paint}`;
  const itemType = skin.category.id === "sfui_invpanel_filter_gloves" ? "glove"
    : skin.category.id === "sfui_invpanel_filter_melee" ? "knife" : "skin";
  const value = { name: skin.name, itemType, minFloat: skin.min_float, maxFloat: skin.max_float, supportsStattrak: skin.stattrak };
  if (key in finishes && JSON.stringify(finishes[key]) !== JSON.stringify(value))
    throw new Error(`Conflicting finish: ${key}`);
  finishes[key] = value;
}
if (Object.keys(finishes).length < 2000) throw new Error("Refusing an incomplete finish catalogue");
const sorted = Object.fromEntries(Object.entries(finishes).sort(([a], [b]) => a.localeCompare(b, "en", { numeric: true })));
await writeFile(new URL("../lib/economy/cs2-finishes.json", import.meta.url), JSON.stringify({
  source: "https://cdn.skinhub.gg/data/skins.json", generatedAt: new Date().toISOString(),
  sha256: createHash("sha256").update(JSON.stringify(sorted)).digest("hex"), finishes: sorted,
}, null, 2) + "\n");
console.log(`Wrote ${Object.keys(finishes).length} released CS2 finishes`);
