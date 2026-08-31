import assert from "node:assert/strict";
import test from "node:test";

import {
  canonicalVipActivationJson,
  vipSuppressionRequiresReconciliation,
  vipActivationResumeAction,
} from "./vip-activation-state.ts";
import { vipActivationMessage } from "./vip-activation-message.ts";

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

test("an ended subscription suppression tombstone permits a new activation", () => {
  assert.equal(
    vipSuppressionRequiresReconciliation({
      subscriptionStatus: "ended",
      subscriptionActive: false,
      suppressionActive: true,
    }),
    false,
  );
});

test("an inconsistent active subscription suppression still requires staff reconciliation", () => {
  assert.equal(
    vipSuppressionRequiresReconciliation({
      subscriptionStatus: "active",
      subscriptionActive: false,
      suppressionActive: true,
    }),
    true,
  );
  assert.equal(
    vipSuppressionRequiresReconciliation({
      subscriptionStatus: "active",
      subscriptionActive: true,
      suppressionActive: true,
    }),
    false,
  );
});

test("upgrade messaging separates the full item duration from converted carry-over", () => {
  const message = vipActivationMessage({
    activationKind: "upgraded",
    convertedDurationSeconds: 69_113,
    durationMinutes: 43_200,
    expiresAt: "2026-10-01T18:49:22.199Z",
    groupName: "ULTIMATE",
    itemGroupName: "ULTIMATE",
    previousGroupName: "DIAMOND",
    timeDeductedSeconds: 17_279,
  });

  assert.match(message, /full 30d ULTIMATE item/);
  assert.match(message, /19h 11m 53s of carry-over/);
  assert.match(message, /Total new ULTIMATE duration: 30d 19h 11m 53s/);
  assert.match(message, /1 Oct 2026, 18:49 UTC/);
});
