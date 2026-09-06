import assert from "node:assert/strict";
import test from "node:test";
import { isUnpricedCustomWeapon, removalBlockers } from "./remove-unpriced-custom-weapons-policy.mjs";

const custom = { id: "weapon", item_type: "skin", definition_index: 4, paintkit: 44, state: "available", attributes: {}, sale_locked: 0 };

test("only active known guns and knives with an unreleased, unpriced pair qualify", () => {
  assert.equal(isUnpricedCustomWeapon(custom), true);
  assert.equal(isUnpricedCustomWeapon({ ...custom, item_type: "knife", definition_index: 500, paintkit: 752 }), true);
  for (const row of [
    { ...custom, definition_index: 7 }, // Released AK-47 Case Hardened.
    { ...custom, item_type: "glove", definition_index: 4725 },
    { ...custom, definition_index: 4725 }, // Legacy misclassified glove.
    { ...custom, definition_index: 99999 },
    { ...custom, item_type: "sticker" },
    { ...custom, state: "consumed" },
    { ...custom, state: "revoked" },
  ]) assert.equal(isUnpricedCustomWeapon(row), false, JSON.stringify(row));
});

test("any positive current price or recorded variant price protects an item regardless of source", () => {
  for (const price of [
    { market_price_eur_cents: "1", price_source: "staff-last-known" },
    { market_price_eur_cents: "1", price_source: "external" },
    { token_price: "1" },
    { has_positive_variant_price: 1 },
  ]) assert.equal(isUnpricedCustomWeapon({ ...custom, ...price }), false);
  assert.equal(isUnpricedCustomWeapon({ ...custom, token_price: 0, market_price_eur_cents: 0, has_positive_variant_price: 0 }), true);
});

test("new trade locks or attachments stop the whole apply instead of losing collateral items", () => {
  assert.deepEqual(removalBlockers([custom], [], []), []);
  assert.equal(removalBlockers([{ ...custom, state: "escrowed" }], [], []).length, 1);
  assert.equal(removalBlockers([{ ...custom, sale_locked: 1 }], [], []).length, 1);
  assert.equal(removalBlockers([{ ...custom, attributes: { keychain: { id: 1 } } }], [], []).length, 1);
  assert.equal(removalBlockers([custom], [{ weapon_item_id: "weapon" }], []).length, 1);
  assert.equal(removalBlockers([custom], [], [{ item_id: "weapon", trade_id: "trade" }]).length, 1);
});
