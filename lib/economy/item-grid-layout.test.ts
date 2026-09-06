import assert from "node:assert/strict";
import test from "node:test";
import { itemGridColumns, itemGridPageSize, normalizeItemGridPageSize } from "./item-grid-layout.ts";

test("wide item grids have five columns and twenty items, including ultrawide screens", () => {
  for (const width of [1000, 1200, 2400]) {
    assert.equal(itemGridColumns(width), 5);
    assert.equal(itemGridPageSize(width), 20);
  }
});

test("narrow containers fit at most four rows without overflowing cards", () => {
  for (const [width, columns] of [[320, 1], [400, 2], [600, 3], [800, 4]]) {
    assert.equal(itemGridColumns(width), columns);
    assert.equal(itemGridPageSize(width), columns * 4);
  }
});

test("server page sizes accept only supported four-row layouts", () => {
  for (const size of [4, 8, 12, 16, 20]) assert.equal(normalizeItemGridPageSize(String(size)), size);
  for (const value of [undefined, "", "0", "3", "50", "Infinity", "12.5", "-4"])
    assert.equal(normalizeItemGridPageSize(value), 20);
});
