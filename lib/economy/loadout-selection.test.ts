import assert from "node:assert/strict";
import test from "node:test";

import {
  loadoutCategoryForItem,
  loadoutChoiceEmptyMessage,
  loadoutItemSupportsTarget,
  loadoutSlotsForTarget,
  ownedItemsForLoadout,
  representativeLoadoutItem,
  weaponLoadoutCardAccessibleLabel,
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
  assert.equal(loadoutItemSupportsTarget(malformed, "both"), false);
});

test("defaults only absent and non-array team metadata to both teams without allowing agent both", () => {
  const defaults = [
    { id: "agent-absent", itemType: "agent", definitionIndex: null, displayName: "Absent", raw: {} },
    { id: "agent-non-array", itemType: "agent", definitionIndex: null, displayName: "Non-array", raw: { catalogue: { metadata: { teams: "T" } } } },
  ] as const;
  const explicit = [
    { id: "agent-empty", itemType: "agent", definitionIndex: null, displayName: "Empty", raw: { catalogue: { metadata: { teams: [] } } } },
    { id: "agent-invalid", itemType: "agent", definitionIndex: null, displayName: "Invalid", raw: { catalogue: { metadata: { teams: ["invalid"] } } } },
    { id: "agent-t", itemType: "agent", definitionIndex: null, displayName: "T", raw: { catalogue: { metadata: { teams: ["invalid", "T"] } } } },
    { id: "agent-ct", itemType: "agent", definitionIndex: null, displayName: "CT", raw: { catalogue: { metadata: { teams: ["CT"] } } } },
  ] as const;

  for (const item of defaults) {
    assert.equal(loadoutItemSupportsTarget(item, "T"), true);
    assert.equal(loadoutItemSupportsTarget(item, "CT"), true);
    assert.equal(loadoutItemSupportsTarget(item, "both"), false);
  }
  for (const item of explicit) {
    assert.equal(loadoutItemSupportsTarget(item, "both"), false);
  }
  assert.deepEqual(ownedItemsForLoadout([...defaults, ...explicit], "agent", "T").map((item) => item.id), [
    "agent-absent",
    "agent-non-array",
    "agent-t",
  ]);
  assert.deepEqual(ownedItemsForLoadout([...defaults, ...explicit], "agent", "CT").map((item) => item.id), [
    "agent-absent",
    "agent-non-array",
    "agent-ct",
  ]);
  assert.deepEqual(ownedItemsForLoadout([...defaults, ...explicit], "agent", "both"), []);
});

test("excludes weapon items whose definition cannot form a loadout API slot", () => {
  const candidates = [
    { id: "lower", itemType: "skin", definitionIndex: 1, displayName: "Lower", raw: {} },
    { id: "upper", itemType: "skin", definitionIndex: 65_535, displayName: "Upper", raw: {} },
    { id: "zero", itemType: "skin", definitionIndex: 0, displayName: "Zero", raw: {} },
    { id: "negative", itemType: "skin", definitionIndex: -1, displayName: "Negative", raw: {} },
    { id: "too-high", itemType: "skin", definitionIndex: 65_536, displayName: "Too high", raw: {} },
    { id: "missing", itemType: "skin", definitionIndex: null, displayName: "Missing", raw: {} },
  ] as const;

  assert.deepEqual(
    ownedItemsForLoadout(candidates, "weapon").map((item) => item.id),
    ["lower", "upper"],
  );
});

test("distinguishes no ownership from target-specific incompatibility", () => {
  assert.equal(
    loadoutChoiceEmptyMessage("weapon", "T", false),
    "You do not own a weapon finish in this class yet.",
  );
  assert.equal(loadoutChoiceEmptyMessage("knife", "CT", false), "You do not own a knife yet.");
  assert.equal(loadoutChoiceEmptyMessage("glove", "both", false), "You do not own gloves yet.");
  assert.equal(
    loadoutChoiceEmptyMessage("agent", "T", false),
    "You do not own an Agent for this team yet.",
  );

  assert.equal(
    loadoutChoiceEmptyMessage("weapon", "both", true),
    "None of your owned finishes for this weapon support both teams.",
  );
  assert.equal(
    loadoutChoiceEmptyMessage("knife", "T", true),
    "None of your owned knives support T.",
  );
  assert.equal(
    loadoutChoiceEmptyMessage("glove", "CT", true),
    "None of your owned gloves support CT.",
  );
  assert.equal(
    loadoutChoiceEmptyMessage("agent", "CT", true),
    "None of your owned Agents support CT.",
  );
});

test("includes the current T and CT finishes in a weapon card accessible label", () => {
  assert.equal(
    weaponLoadoutCardAccessibleLabel("AK-47", 2, "AK-47 | Redline", "Default"),
    "Choose AK-47, 2 owned finishes. Current T finish: AK-47 | Redline. Current CT finish: Default.",
  );
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

test("accepts only weapon definitions in the API range", () => {
  assert.deepEqual(loadoutSlotsForTarget("weapon", "T", 1), [
    { slotType: "weapon", team: "T", definitionIndex: 1 },
  ]);
  assert.deepEqual(loadoutSlotsForTarget("weapon", "CT", 65_535), [
    { slotType: "weapon", team: "CT", definitionIndex: 65_535 },
  ]);
  for (const definitionIndex of [0, -1, 65_536]) {
    assert.throws(
      () => loadoutSlotsForTarget("weapon", "T", definitionIndex),
      /definition/i,
    );
  }
});

test("prefers equipped T, then equipped CT, then the first owned image item", () => {
  const choices = [items[0], { ...items[0], id: "ak-2", displayName: "AK-47 | Slate" }];
  assert.equal(representativeLoadoutItem(choices, "ak-2", "ak")?.id, "ak-2");
  assert.equal(representativeLoadoutItem(choices, null, "ak-2")?.id, "ak-2");
  assert.equal(representativeLoadoutItem(choices, null, null)?.id, "ak");
});
