import assert from "node:assert/strict";
import test from "node:test";

import {
  loadoutSlots,
  ownedWeaponSkins,
  weaponCategoryForDefinition,
} from "./weapon-categories.ts";

test("groups representative CS2 definitions", () => {
  assert.equal(weaponCategoryForDefinition(7), "rifles");
  assert.equal(weaponCategoryForDefinition(9), "snipers");
  assert.equal(weaponCategoryForDefinition(4), "pistols");
  assert.equal(weaponCategoryForDefinition(17), "smgs");
  assert.equal(weaponCategoryForDefinition(35), "shotguns");
  assert.equal(weaponCategoryForDefinition(28), "lmgs");
  assert.equal(weaponCategoryForDefinition(65_535), "other");
});

test("builds one slot for T and two slots for Both", () => {
  assert.deepEqual(loadoutSlots(7, "T"), [
    { slotType: "weapon", team: "T", definitionIndex: 7 },
  ]);
  assert.deepEqual(loadoutSlots(7, "both"), [
    { slotType: "weapon", team: "T", definitionIndex: 7 },
    { slotType: "weapon", team: "CT", definitionIndex: 7 },
  ]);
});

test("groups only owned weapon skins with a definition index", () => {
  const groups = ownedWeaponSkins([
    { id: "ak-redline", itemType: "skin", definitionIndex: 7, displayName: "AK-47 | Redline" },
    { id: "sticker", itemType: "sticker", definitionIndex: null, displayName: "Sticker" },
  ] as never);
  assert.deepEqual(groups.map((group) => [group.definitionIndex, group.items.map((item) => item.id)]), [[7, ["ak-redline"]]]);
});

test("keeps legacy weapons and sorts groups and owned instances by display name", () => {
  const groups = ownedWeaponSkins([
    { id: "m4-printstream", itemType: "skin", definitionIndex: 16, displayName: "M4A4 | Printstream" },
    { id: "ak-zebra", itemType: "weapon", definitionIndex: 7, displayName: "AK-47 | Zebra" },
    { id: "ak-redline", itemType: "skin", definitionIndex: 7, displayName: "AK-47 | Redline" },
  ] as never);

  assert.deepEqual(
    groups.map((group) => [group.definitionIndex, group.items.map((item) => item.id)]),
    [[7, ["ak-redline", "ak-zebra"]], [16, ["m4-printstream"]]],
  );
});
