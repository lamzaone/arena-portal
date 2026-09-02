import assert from "node:assert/strict";
import test from "node:test";

import {
  loadoutCategoryForItem,
  loadoutItemSupportsTarget,
  loadoutSlotsForTarget,
  ownedItemsForLoadout,
  representativeLoadoutItem,
} from "./loadout-selection.ts";

const items = [
  { id: "ak", itemType: "skin", definitionIndex: 7, displayName: "AK-47 | Redline", raw: {} },
  { id: "knife", itemType: "knife", definitionIndex: 500, displayName: "Karambit", raw: {} },
  { id: "glove", itemType: "glove", definitionIndex: 5030, displayName: "Sport Gloves", raw: {} },
  { id: "agent-t", itemType: "agent", definitionIndex: null, displayName: "The Elite Mr. Muhlik", raw: { catalogue: { metadata: { teams: ["T"] } } } },
  { id: "sticker", itemType: "sticker", definitionIndex: null, displayName: "Sticker", raw: {} },
] as const;

test("maps only supported owned cosmetic types to loadout categories", () => {
  assert.deepEqual(items.map(loadoutCategoryForItem), ["weapon", "knife", "glove", "agent", null]);
});

test("filters owned cosmetics by category and target team", () => {
  assert.deepEqual(ownedItemsForLoadout(items, "agent", "T").map((item) => item.id), ["agent-t"]);
  assert.deepEqual(ownedItemsForLoadout(items, "agent", "CT"), []);
  assert.equal(loadoutItemSupportsTarget(items[3], "both"), false);
});

test("defaults safely when nested catalogue metadata is malformed", () => {
  const malformed = {
    id: "agent-malformed",
    itemType: "agent",
    definitionIndex: null,
    displayName: "Fallback Agent",
    raw: { catalogue: { metadata: ["T"] }, attributes: { teams: "CT" } },
  } as const;

  assert.equal(loadoutCategoryForItem(malformed), "agent");
  assert.equal(loadoutItemSupportsTarget(malformed, "T"), true);
  assert.equal(loadoutItemSupportsTarget(malformed, "CT"), true);
  assert.equal(loadoutItemSupportsTarget(malformed, "both"), true);
});

test("builds existing API slot payloads for weapon and cosmetic targets", () => {
  assert.deepEqual(loadoutSlotsForTarget("weapon", "both", 7), [
    { slotType: "weapon", team: "T", definitionIndex: 7 },
    { slotType: "weapon", team: "CT", definitionIndex: 7 },
  ]);
  assert.deepEqual(loadoutSlotsForTarget("knife", "CT"), [
    { slotType: "knife", team: "CT" },
  ]);
  assert.throws(() => loadoutSlotsForTarget("agent", "both"), /per team/i);
});

test("prefers equipped T, then equipped CT, then the first owned image item", () => {
  const choices = [items[0], { ...items[0], id: "ak-2", displayName: "AK-47 | Slate" }];
  assert.equal(representativeLoadoutItem(choices, "ak-2", "ak")?.id, "ak-2");
  assert.equal(representativeLoadoutItem(choices, null, "ak-2")?.id, "ak-2");
  assert.equal(representativeLoadoutItem(choices, null, null)?.id, "ak");
});
