import assert from "node:assert/strict";
import test from "node:test";

import { canSellInventoryItem } from "./inventory-sale-lock.ts";

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
