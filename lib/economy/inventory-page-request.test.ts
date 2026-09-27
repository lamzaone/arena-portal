import assert from "node:assert/strict";
import test from "node:test";
import { inventoryPageRequest, pageForInventoryAnchor } from "./inventory-page-request.ts";

test("inventory request carries the server page and every visible filter", () => {
  assert.equal(inventoryPageRequest({
    page: 3, pageSize: 12, query: "  Fade  ", type: "skin", rarity: "6",
    sort: "float", hideEquipped: true,
  }), "page=3&pageSize=12&q=Fade&type=skin&rarity=6&sort=float&hideEquipped=1");
});

test("responsive page size keeps the first visible item in view", () => {
  assert.equal(pageForInventoryAnchor(3, 20, 12), 4);
  assert.equal(pageForInventoryAnchor(1, 20, 4), 1);
});
