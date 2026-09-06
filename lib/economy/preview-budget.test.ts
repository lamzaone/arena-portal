import test from "node:test";
import assert from "node:assert/strict";
import { createPreviewBudget } from "./preview-budget.ts";

test("bounds 30 visible thumbnail contexts and lets hovered or queued items take freed slots", () => {
  const budget = createPreviewBudget(8);
  const active = new Map<symbol, boolean>();
  const ids = Array.from({ length: 30 }, () => Symbol());
  const release = ids.map((id) => budget.register(id, (value) => active.set(id, value)));
  assert.equal([...active.values()].filter(Boolean).length, 8);
  budget.prioritize(ids[29]);
  assert.equal(active.get(ids[29]), true);
  assert.equal([...active.values()].filter(Boolean).length, 8);
  release[29](); active.delete(ids[29]);
  assert.equal([...active.values()].filter(Boolean).length, 8);
  release.forEach((dispose) => dispose());
});
