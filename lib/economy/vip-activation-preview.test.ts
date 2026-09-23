import assert from "node:assert/strict";
import test from "node:test";
import { resolveVipActivationPreview } from "./vip-activation-preview.ts";
test("permanent membership rejects timed replacements without consuming the item", () => {
  assert.throws(
    () =>
      resolveVipActivationPreview({
        now: new Date("2026-09-23T00:00:00Z"),
        item: {
          groupId: 2,
          rankWeight: 20,
          displayName: "VIP+",
          durationMinutes: 30,
        },
        current: {
          groupId: 1,
          rankWeight: 10,
          displayName: "VIP",
          expiresAt: null,
        },
        rates: new Map(),
      }),
    { code: "incompatible_item" },
  );
});
test("new timed VIP uses authoritative time and exact duration", () => {
  const result = resolveVipActivationPreview({
    now: new Date("2026-09-23T00:00:00Z"),
    item: {
      groupId: 1,
      rankWeight: 10,
      displayName: "VIP",
      durationMinutes: 30,
    },
    current: null,
    rates: new Map(),
  });
  assert.equal(result.activationKind, "activated");
  assert.equal(
    result.finalExpiresAt?.toISOString(),
    "2026-09-23T00:30:00.000Z",
  );
});
