import assert from "node:assert/strict";
import test from "node:test";

import {
  canAffordCratePurchase,
  clampCrateQuantity,
  crateDropStateFromResponse,
  crateDropDisclosureLabel,
  cratePurchaseTotal,
  formatCrateDropRate,
  inlinePanelInsertionIndex,
  marketContainerModalPresentation,
  marketplacePurchaseIntentSignature,
  retainedPurchaseRequest,
  sortCrateDrops,
} from "./crate-presentation.ts";

test("container modal uses its wide presentation only for expanded drops", () => {
  assert.deepEqual(
    marketContainerModalPresentation({
      dropsExpanded: false,
      closing: false,
      reducedMotion: false,
    }),
    { phase: "open", size: "standard", exitDelayMs: 180 },
  );
  assert.deepEqual(
    marketContainerModalPresentation({
      dropsExpanded: true,
      closing: false,
      reducedMotion: false,
    }),
    { phase: "open", size: "wide", exitDelayMs: 180 },
  );
});

test("container modal closing presentation removes delay for reduced motion", () => {
  assert.deepEqual(
    marketContainerModalPresentation({
      dropsExpanded: true,
      closing: true,
      reducedMotion: true,
    }),
    { phase: "closing", size: "wide", exitDelayMs: 0 },
  );
});

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

test("inserts an expanded panel after the selected visual grid row", () => {
  assert.equal(inlinePanelInsertionIndex(0, 8, 4), 3);
  assert.equal(inlinePanelInsertionIndex(2, 8, 4), 3);
  assert.equal(inlinePanelInsertionIndex(4, 8, 4), 7);
  assert.equal(inlinePanelInsertionIndex(6, 7, 4), 6);
  assert.equal(inlinePanelInsertionIndex(3, 8, 1), 3);
  assert.equal(inlinePanelInsertionIndex(-1, 8, 4), null);
});

test("labels the nested drop disclosure without exposing drops by default", () => {
  assert.equal(crateDropDisclosureLabel(false, null), "Show possible drops");
  assert.equal(
    crateDropDisclosureLabel(false, 1_234),
    "Show 1,234 possible drops",
  );
  assert.equal(crateDropDisclosureLabel(true, 1_234), "Hide possible drops");
});

test("normalizes every market purchase intent field", () => {
  const standardSignature = marketplacePurchaseIntentSignature(42, {
    stattrak: false,
    floatValue: 0.15000001,
  });
  assert.equal(
    standardSignature,
    marketplacePurchaseIntentSignature(42, {
      stattrak: false,
      floatValue: 0.15,
      quantity: 1,
    }),
  );
  assert.notEqual(
    standardSignature,
    marketplacePurchaseIntentSignature(42, {
      stattrak: false,
      floatValue: 0.16,
    }),
  );
  assert.notEqual(
    standardSignature,
    marketplacePurchaseIntentSignature(42, {
      stattrak: true,
      floatValue: 0.15,
    }),
  );
  assert.notEqual(
    standardSignature,
    marketplacePurchaseIntentSignature(43, {
      stattrak: false,
      floatValue: 0.15,
    }),
  );

  const oneContainer = marketplacePurchaseIntentSignature(42, {
    stattrak: false,
    quantity: 1,
  });
  assert.notEqual(
    oneContainer,
    marketplacePurchaseIntentSignature(42, {
      stattrak: false,
      quantity: 2,
    }),
  );
});

test("retains a retry key until the purchase intent changes", () => {
  const signature = marketplacePurchaseIntentSignature(42, {
    stattrak: false,
    quantity: 2,
  });
  let generated = 0;
  const createKey = () => `request-${++generated}`;
  const first = retainedPurchaseRequest(null, signature, createKey);
  const retry = retainedPurchaseRequest(first, signature, createKey);
  const changed = retainedPurchaseRequest(
    retry,
    marketplacePurchaseIntentSignature(42, {
      stattrak: false,
      quantity: 3,
    }),
    createKey,
  );

  assert.equal(retry, first);
  assert.equal(retry.idempotencyKey, "request-1");
  assert.equal(changed.idempotencyKey, "request-2");
  assert.equal(generated, 2);
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
