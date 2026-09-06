import manifest from "../lib/economy/cs2-finishes.json" with { type: "json" };

export const manifestRevision = manifest.sha256;
const definitionTypes = new Map(Object.entries(manifest.finishes).map(([key, finish]) => [Number(key.split(":")[0]), finish.itemType]));
export const decodeObject = (value) => typeof value === "string" ? JSON.parse(value) : value ?? {};

// Removal deliberately protects every positive recorded price, even prices that
// do not qualify a custom finish for new sales. This is narrower than eligibility.
export function isUnpricedCustomWeapon(row) {
  if (!["skin", "knife"].includes(row.item_type) || !["skin", "knife"].includes(definitionTypes.get(Number(row.definition_index)))) return false;
  if (!["available", "escrowed", "attached", "activation_pending"].includes(row.state)) return false;
  if (manifest.finishes[`${Number(row.definition_index)}:${Number(row.paintkit ?? 0)}`]) return false;
  return !(Number(row.market_price_eur_cents) > 0 || Number(row.token_price) > 0 || Number(row.has_positive_variant_price) > 0);
}

// This bounded maintenance operation never destroys attachments or interferes
// with a trade. The audited production batch has none; new blockers abort apply.
export function removalBlockers(items, stickers, trades) {
  const blockers = [];
  for (const item of items) {
    if (item.state !== "available") blockers.push({ itemId: item.id, reason: `state:${item.state}` });
    if (Number(item.sale_locked)) blockers.push({ itemId: item.id, reason: "sale_locked" });
    const attributes = decodeObject(item.attributes);
    if (attributes.keychain || attributes.charm) blockers.push({ itemId: item.id, reason: "attached_charm" });
    if (Array.isArray(attributes.stickers) && attributes.stickers.length) blockers.push({ itemId: item.id, reason: "legacy_stickers" });
  }
  for (const row of stickers) blockers.push({ itemId: row.weapon_item_id, reason: "attached_sticker" });
  for (const row of trades) blockers.push({ itemId: row.item_id, tradeId: row.trade_id, reason: "pending_trade" });
  return blockers;
}
