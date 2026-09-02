import assert from "node:assert/strict";
import test from "node:test";

import {
  canSelectForLock,
  canSellInventoryItem,
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
