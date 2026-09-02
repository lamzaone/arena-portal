import assert from "node:assert/strict";
import test from "node:test";

import {
  crateOnlySelection,
  inventoryItemsDuringCrateOpening,
  isOpenableInventoryCrate,
  partitionCrateOpeningIds,
  remainingCrateOpeningIds,
  runSequentialCrateOpeningGroups,
  withRetainedOpenedItem,
} from "./inventory-selection.ts";

const inventoryCrate = (
  id: string,
  itemType = "crate",
  overrides: Partial<{
    state: string;
    catalogueId: number | null;
    saleLocked: boolean;
  }> = {},
) => ({
  id,
  itemType,
  state: "available",
  catalogueId: 12,
  saleLocked: false,
  ...overrides,
});

test("only available catalogued crates and capsules can be opened", () => {
  assert.equal(
    isOpenableInventoryCrate({
      id: "crate",
      itemType: "crate",
      state: "available",
      catalogueId: 12,
    }),
    true,
  );
  assert.equal(
    isOpenableInventoryCrate({
      id: "capsule",
      itemType: "capsule",
      state: "available",
      catalogueId: 13,
    }),
    true,
  );
  assert.equal(
    isOpenableInventoryCrate({
      id: "skin",
      itemType: "skin",
      state: "available",
      catalogueId: 14,
    }),
    false,
  );
  assert.equal(
    isOpenableInventoryCrate({
      id: "consumed",
      itemType: "crate",
      state: "consumed",
      catalogueId: 15,
    }),
    false,
  );
  assert.equal(
    isOpenableInventoryCrate({
      id: "missing-catalogue",
      itemType: "capsule",
      state: "available",
      catalogueId: null,
    }),
    false,
  );
});

test("a non-empty crate-only selection remains openable when sale locked", () => {
  const crate = inventoryCrate("crate-a");
  const lockedCapsule = inventoryCrate("capsule-b", "capsule", {
    saleLocked: true,
  });
  assert.deepEqual(
    crateOnlySelection(
      [crate, lockedCapsule],
      new Set([lockedCapsule.id, crate.id]),
    ),
    { status: "ready", crates: [lockedCapsule, crate] },
  );
});

test("empty, mixed, stale, and unavailable selections cannot bulk open", () => {
  const crate = inventoryCrate("crate-a");
  const skin = inventoryCrate("skin-b", "skin");
  const consumed = inventoryCrate("crate-c", "crate", {
    state: "consumed",
  });
  assert.deepEqual(crateOnlySelection([crate], new Set()), {
    status: "empty",
    crates: [],
  });
  assert.equal(
    crateOnlySelection([crate, skin], new Set([crate.id, skin.id])).status,
    "mixed",
  );
  assert.equal(
    crateOnlySelection([crate], new Set([crate.id, "missing"])).status,
    "mixed",
  );
  assert.equal(
    crateOnlySelection([crate, consumed], new Set([crate.id, consumed.id]))
      .status,
    "mixed",
  );
  const oversized = Array.from({ length: 51 }, (_, index) =>
    inventoryCrate(`crate-${index + 1}`),
  );
  assert.equal(
    crateOnlySelection(
      oversized,
      new Set(oversized.map((item) => item.id)),
    ).status,
    "mixed",
  );
});

test("crate opening groups preserve order across the ten-item request boundary", () => {
  const ids = Array.from({ length: 50 }, (_, index) => `crate-${index + 1}`);
  assert.deepEqual(partitionCrateOpeningIds(ids.slice(0, 1)), [
    ["crate-1"],
  ]);
  assert.deepEqual(
    partitionCrateOpeningIds(ids.slice(0, 10)).map((group) => group.length),
    [10],
  );
  assert.deepEqual(
    partitionCrateOpeningIds(ids.slice(0, 11)).map((group) => group.length),
    [10, 1],
  );
  assert.deepEqual(
    partitionCrateOpeningIds(ids).map((group) => group.length),
    [10, 10, 10, 10, 10],
  );
  assert.deepEqual(partitionCrateOpeningIds(ids.slice(0, 11)).flat(), ids.slice(0, 11));
});

test("crate opening groups reject empty, duplicate, and oversized selections", () => {
  assert.throws(() => partitionCrateOpeningIds([]), /between 1 and 50/i);
  assert.throws(
    () => partitionCrateOpeningIds(["crate-1", "crate-1"]),
    /only be opened once/i,
  );
  assert.throws(
    () =>
      partitionCrateOpeningIds(
        Array.from({ length: 51 }, (_, index) => `crate-${index + 1}`),
      ),
    /between 1 and 50/i,
  );
});

test("retry remainder starts with the failed group and excludes committed groups", () => {
  const groups = [
    ["crate-1", "crate-2"],
    ["crate-3", "crate-4"],
    ["crate-5"],
  ];
  assert.deepEqual(remainingCrateOpeningIds(groups, 0), [
    "crate-1",
    "crate-2",
    "crate-3",
    "crate-4",
    "crate-5",
  ]);
  assert.deepEqual(remainingCrateOpeningIds(groups, 1), [
    "crate-3",
    "crate-4",
    "crate-5",
  ]);
  assert.deepEqual(remainingCrateOpeningIds(groups, 3), []);
});

test("opening groups run sequentially and stop at the first failure", async () => {
  const groups = [
    { crateItemIds: ["crate-1"], idempotencyKey: "key-1" },
    { crateItemIds: ["crate-2"], idempotencyKey: "key-2" },
    { crateItemIds: ["crate-3"], idempotencyKey: "key-3" },
  ];
  const attempts: string[] = [];
  const completed: string[] = [];
  const failure = new Error("network lost");

  const result = await runSequentialCrateOpeningGroups({
    groups,
    startIndex: 0,
    openGroup: async (group) => {
      attempts.push(group.idempotencyKey);
      if (group.idempotencyKey === "key-2") throw failure;
      return { receipt: group.idempotencyKey };
    },
    onGroupCompleted: (group, response) => {
      completed.push(`${group.idempotencyKey}:${response.receipt}`);
    },
  });

  assert.deepEqual(attempts, ["key-1", "key-2"]);
  assert.deepEqual(completed, ["key-1:key-1"]);
  assert.equal(result.completedGroupCount, 1);
  assert.equal(result.error, failure);
});

test("retrying starts at the failed group with its original idempotency key", async () => {
  const groups = [
    { crateItemIds: ["crate-1"], idempotencyKey: "key-1" },
    { crateItemIds: ["crate-2"], idempotencyKey: "key-2" },
    { crateItemIds: ["crate-3"], idempotencyKey: "key-3" },
  ];
  const attempts: string[] = [];

  const result = await runSequentialCrateOpeningGroups({
    groups,
    startIndex: 1,
    openGroup: async (group) => {
      attempts.push(group.idempotencyKey);
      return group.crateItemIds[0];
    },
    onGroupCompleted: () => undefined,
  });

  assert.deepEqual(attempts, ["key-2", "key-3"]);
  assert.equal(result.completedGroupCount, 3);
  assert.equal(result.error, null);
});

test("committed crates disappear except for the retained single reveal", () => {
  const first = { id: "crate-1" };
  const second = { id: "crate-2" };
  const third = { id: "skin-1" };
  assert.deepEqual(
    inventoryItemsDuringCrateOpening(
      [first, second, third],
      new Set([first.id, second.id]),
      first,
      0,
    ),
    [first, third],
  );
  assert.deepEqual(
    inventoryItemsDuringCrateOpening(
      [first, second, third],
      new Set([first.id, second.id]),
      null,
    ),
    [third],
  );
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
