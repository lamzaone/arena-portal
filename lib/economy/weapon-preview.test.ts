import assert from "node:assert/strict";
import test from "node:test";
import { weaponPreviewItem, mergeWeaponPlacements, weaponInspectLink } from "./weapon-preview.ts";

const weapon = { itemType: "skin", definitionIndex: 7, paintkit: 44, floatValue: 0.123456789, seed: 661, stattrak: false, stattrakCount: 125 };

test("unsupported inspect-link name lengths cannot crash item management", () => {
  assert.equal(weaponInspectLink({ ...weaponPreviewItem(weapon)!, nameTag: "a".repeat(128) }), null);
  assert.match(weaponInspectLink(weaponPreviewItem(weapon)!)!, /^steam:\/\//);
});

test("renders the instance float and seed without rounding or enabling a stale counter", () => {
  const result = weaponPreviewItem(weapon)!;
  assert.equal(result.float, weapon.floatValue);
  assert.equal(result.seed, 661);
  assert.equal(result.statTrak, false);
  assert.equal(result.defindex, 7);
  assert.equal(result.paintIndex, 44);
});

test("ordinary knives and real zero-count StatTrak remain distinct", () => {
  assert.equal(weaponPreviewItem({ ...weapon, itemType: "knife", definitionIndex: 507 })!.statTrak, false);
  assert.equal(weaponPreviewItem({ ...weapon, stattrak: true, stattrakCount: 0 })!.statTrak, 0);
  assert.equal(weaponPreviewItem({ ...weapon, floatValue: 0, seed: 0, paintkit: 0 })!.float, 0);
});

test("refuses incomplete or unsupported identities instead of showing a default weapon", () => {
  assert.equal(weaponPreviewItem({ ...weapon, definitionIndex: null }), null);
  assert.equal(weaponPreviewItem({ ...weapon, seed: null }), null);
  assert.equal(weaponPreviewItem({ ...weapon, itemType: "crate" }), null);
  assert.equal(weaponPreviewItem({ ...weapon, floatValue: NaN }), null);
});

test("keeps sparse sticker slots, placement and charm identity from authoritative rows", () => {
  const result = weaponPreviewItem({ ...weapon, raw: {
    attributes: { keychain: { id: 5, seed: 123, offsetX: 1, offsetY: 2, offsetZ: 3 } },
    stickers: [{ slot: 3, definitionIndex: 37, attributes: { id: 999, slot: 0, wear: 0.2, rotation: 90, offsetX: 0.12, offsetY: -0.3 } }],
  } })!;
  assert.deepEqual(result.stickers, [{ id: 37, slot: 3, wear: 0.2, rotation: 90, offsetX: 0.12, offsetY: -0.3 }]);
  assert.deepEqual(result.charm, { id: 5, seed: 123, offset: [1, 2, 3] });
});

test("viewer changes cannot alter the owned finish, counter, attachment identities or charm seed", () => {
  const current = { ...weaponPreviewItem(weapon)!, stickers: [{ id: 37, slot: 2 as const }], charm: { id: 5, seed: 123 } };
  const changed = { ...current, paintIndex: 99, float: 0, seed: 1, statTrak: 999, stickers: [{ id: 37, slot: 2 as const, offsetX: 0.3 }], charm: { id: 5, seed: 999, offset: [1, 2, 3] as const } };
  const result = mergeWeaponPlacements(current, changed);
  assert.equal(result.paintIndex, 44);
  assert.equal(result.float, weapon.floatValue);
  assert.equal(result.seed, 661);
  assert.equal(result.statTrak, false);
  assert.equal(result.stickers?.[0]?.offsetX, 0.3);
  assert.equal(result.charm?.seed, 123);
});
