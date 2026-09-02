import assert from "node:assert/strict";
import test from "node:test";

import {
  beginSaleLockOverrides,
  canSelectForLock,
  canSellInventoryItem,
  reconcileSaleLockOverrides,
  rejectSaleLockOverrides,
  settleSaleLockOverrides,
} from "./inventory-sale-lock.ts";

test("a sale-locked otherwise-available item cannot be sold", () => {
  assert.equal(
    canSellInventoryItem({
      state: "available",
      tradable: true,
      saleLocked: true,
      stickers: [],
      catalogueId: 1,
    } as never),
    false,
  );
});

test("an unlocked available priced item can be sold", () => {
  assert.equal(
    canSellInventoryItem({
      state: "available",
      tradable: true,
      saleLocked: false,
      stickers: [],
      catalogueId: 1,
    } as never),
    true,
  );
});

test("locked items stay selectable for lock management but not sale", () => {
  const item = {
    state: "available",
    tradable: true,
    saleLocked: true,
    stickers: [],
    catalogueId: 1,
  } as never;

  assert.equal(canSelectForLock(item), true);
  assert.equal(canSellInventoryItem(item), false);
});

test("a refreshed opposite authoritative value replaces a settled optimistic lock", () => {
  const pending = beginSaleLockOverrides(new Map(), ["item-1"], true, 1);
  const settled = settleSaleLockOverrides(pending, ["item-1"], 1, 3);
  const reconciled = reconcileSaleLockOverrides(
    settled,
    new Map([["item-1", false]]),
    4,
  );

  assert.equal(reconciled.has("item-1"), false);
});

test("in-flight and newer lock mutations survive stale refreshes and responses", () => {
  const first = beginSaleLockOverrides(new Map(), ["item-1"], true, 1);
  const second = beginSaleLockOverrides(first, ["item-1"], false, 2);
  const staleRefresh = reconcileSaleLockOverrides(
    second,
    new Map([["item-1", true]]),
    8,
  );
  const staleCompletion = settleSaleLockOverrides(staleRefresh, ["item-1"], 1, 8);
  const staleRejection = rejectSaleLockOverrides(staleCompletion, ["item-1"], 1);

  assert.deepEqual(staleRejection.get("item-1"), {
    saleLocked: false,
    requestVersion: 2,
    phase: "pending",
    clearAfterRevision: null,
  });
});
