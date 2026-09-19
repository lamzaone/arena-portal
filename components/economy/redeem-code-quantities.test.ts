import assert from "node:assert/strict";
import test from "node:test";
import { validateRewardQuantities } from "./redeem-code-quantities.ts";

test("typed quantities become integer reward payloads", () => {
  assert.deepEqual(validateRewardQuantities([{ catalogueId: 7, quantity: "25" }]), {
    rewards: [{ catalogueId: 7, quantity: 25 }], error: null,
  });
});

test("empty edits and invalid quantities cannot be submitted", () => {
  for (const quantity of ["", " ", "0", "-1", "1.5", "51", "NaN", "1e1"]) {
    assert.equal(validateRewardQuantities([{ catalogueId: 7, quantity }]).error,
      "Enter a whole quantity from 1 to 50 for each item.");
  }
});

test("the combined reward limit is 100 items", () => {
  const rewards = [{ catalogueId: 7, quantity: "50" }, { catalogueId: 8, quantity: "50" }];
  assert.equal(validateRewardQuantities(rewards).error, null);
  assert.equal(validateRewardQuantities([...rewards, { catalogueId: 9, quantity: "1" }]).error,
    "A code can award up to 100 items in total.");
});

test("token-only campaigns allow no item rewards", () => {
  assert.deepEqual(validateRewardQuantities([]), { rewards: [], error: null });
});
