import { writeFile } from "node:fs/promises";
import { fetchSkins } from "@skinhub/cdn/skins";

// Shared by the portal and the embedded C# resource. Refresh after game updates.
const skins = await fetchSkins();
const variants = {};
for (const skin of skins) {
  const definition = skin.weapon.weapon_id;
  const paint = skin.paint_index === null ? 0 : Number(skin.paint_index);
  if (!Number.isSafeInteger(definition) || !Number.isSafeInteger(paint) || typeof skin.legacy_model !== "boolean") throw new Error("Unexpected SkinHub catalogue schema");
  const key = `${definition}:${paint}`;
  if (key in variants && variants[key] !== skin.legacy_model) throw new Error(`Conflicting model variant: ${key}`);
  variants[key] = skin.legacy_model;
}
if (Object.keys(variants).length < 1000) throw new Error("Refusing an incomplete model catalogue");
await writeFile(new URL("../lib/economy/cs2-skin-models.json", import.meta.url), JSON.stringify({
  source: "https://cdn.skinhub.gg/data/skins.json", generatedAt: new Date().toISOString(),
  variants: Object.fromEntries(Object.entries(variants).sort(([a], [b]) => a.localeCompare(b, "en", { numeric: true }))),
}, null, 2) + "\n");
console.log(`Wrote ${Object.keys(variants).length} weapon/finish model variants`);
