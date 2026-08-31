import assert from "node:assert/strict";
import test from "node:test";

import {
  canonicalVipActivationJson,
  vipActivationResumeAction,
} from "./vip-activation-state.ts";

test("canonical activation JSON is stable across object insertion order", () => {
  assert.equal(
    canonicalVipActivationJson({ z: 1, nested: { b: true, a: "x" } }),
    canonicalVipActivationJson({ nested: { a: "x", b: true }, z: 1 }),
  );
});

test("ambiguous arena delivery is retried rather than compensated", () => {
  assert.equal(
    vipActivationResumeAction({ state: "retry_wait" }),
    "dispatch",
  );
  assert.equal(
    vipActivationResumeAction({ state: "dispatching", leaseIsFresh: false }),
    "dispatch",
  );
  assert.equal(
    vipActivationResumeAction({ state: "dispatching", leaseIsFresh: true }),
    "wait",
  );
});

test("only durable terminal outcomes return or reject", () => {
  assert.equal(
    vipActivationResumeAction({ state: "arena_applied" }),
    "finalize",
  );
  assert.equal(
    vipActivationResumeAction({ state: "completed" }),
    "return-result",
  );
  assert.equal(
    vipActivationResumeAction({ state: "rejected" }),
    "return-rejection",
  );
  assert.equal(
    vipActivationResumeAction({ state: "manual_review" }),
    "manual-review",
  );
});
