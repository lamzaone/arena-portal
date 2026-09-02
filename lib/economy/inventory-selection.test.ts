import assert from "node:assert/strict";
import test from "node:test";

import {
  activeConsumedItemIds,
  nextInventorySelectionOwner,
  withRetainedOpenedItem,
} from "./inventory-selection.ts";

test("activating one inventory selection surface replaces the other", () => {
  assert.equal(nextInventorySelectionOwner("crates", "inventory", true), "inventory");
  assert.equal(nextInventorySelectionOwner("inventory", "crates", true), "crates");
});

test("a retained result stays consumed after the refreshed inventory drops it", () => {
  assert.deepEqual(
    activeConsumedItemIds(
      ["opened-crate", "stale-crate", "owned-crate"],
      new Set(["owned-crate"]),
      "opened-crate",
    ),
    ["opened-crate", "owned-crate"],
  );
});

test("a stale exit cannot clear the newly active selection surface", () => {
  assert.equal(nextInventorySelectionOwner("crates", "inventory", false), "crates");
  assert.equal(nextInventorySelectionOwner("inventory", "inventory", false), null);
});

test("a refreshed inventory keeps the opened item mounted for its result", () => {
  const retained = { id: "opened-crate" };
  assert.deepEqual(withRetainedOpenedItem([{ id: "another-crate" }], retained), [
    { id: "another-crate" },
    { id: "opened-crate" },
  ]);
  assert.deepEqual(
    withRetainedOpenedItem(
      [{ id: "first" }, { id: "third" }],
      retained,
      1,
    ),
    [{ id: "first" }, { id: "opened-crate" }, { id: "third" }],
  );
  assert.deepEqual(withRetainedOpenedItem([retained], retained), [retained]);
});
