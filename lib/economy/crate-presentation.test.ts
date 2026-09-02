import assert from "node:assert/strict";
import test from "node:test";

import {
  canAffordCratePurchase,
  clampCrateQuantity,
  crateDropStateFromResponse,
  cratePurchaseTotal,
  formatCrateDropRate,
  sortCrateDrops,
} from "./crate-presentation.ts";

test("clamps quantities and calculates safe totals", () => {
  assert.equal(clampCrateQuantity(0), 1);
  assert.equal(clampCrateQuantity(2.9), 2);
  assert.equal(clampCrateQuantity(51), 50);
  assert.equal(clampCrateQuantity(Number.NaN), 1);
  assert.equal(cratePurchaseTotal(125, 4), 500);
  assert.equal(
    cratePurchaseTotal(Number.MAX_SAFE_INTEGER, 50),
    Number.MAX_SAFE_INTEGER,
  );
  assert.equal(canAffordCratePurchase(500, 125, 4), true);
  assert.equal(canAffordCratePurchase(499, 125, 4), false);
  assert.equal(canAffordCratePurchase(500, -1, 4), false);
  assert.equal(
    canAffordCratePurchase(
      Number.MAX_SAFE_INTEGER,
      Number.MAX_SAFE_INTEGER,
      50,
    ),
    false,
  );
});

test("rejects malformed drop responses and distinguishes an empty pool", () => {
  assert.equal(crateDropStateFromResponse({ drops: [] }).status, "empty");
  assert.equal(crateDropStateFromResponse({ drops: "invalid" }).status, "error");
  assert.equal(
    crateDropStateFromResponse({
      totalWeight: 1,
      drops: [{ lootEntryId: 1, weight: 0, catalogue: {} }],
    }).status,
    "error",
  );
});

test("parses the server drop pool without replacing its catalogue authority", () => {
  const catalogue = { id: 42, displayName: "AK-47 | Test" };
  const state = crateDropStateFromResponse({
    totalWeight: 100,
    drops: [
      {
        lootEntryId: 7,
        weight: 100,
        minFloat: "0.1",
        maxFloat: 0.7,
        stattrakChanceBps: 1_000,
        catalogue,
      },
    ],
  });

  assert.equal(state.status, "ready");
  if (state.status !== "ready") return;
  assert.equal(state.totalWeight, 100);
  assert.equal(state.drops[0].item, catalogue);
  assert.equal(state.drops[0].minFloat, 0.1);
  assert.equal(formatCrateDropRate(state.drops[0], state.totalWeight), "100");
});

test("orders drops by rarity, name, then authoritative loot entry id", () => {
  const drops = [
    { lootEntryId: 3, weight: 1, item: { rarityRank: 4, displayName: "Zulu" } },
    { lootEntryId: 2, weight: 1, item: { rarityRank: 6, displayName: "Alpha" } },
    { lootEntryId: 1, weight: 1, item: { rarityRank: 6, displayName: "Alpha" } },
  ] as never;

  assert.deepEqual(
    sortCrateDrops(drops).map((drop) => drop.lootEntryId),
    [1, 2, 3],
  );
});
