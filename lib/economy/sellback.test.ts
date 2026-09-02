import assert from "node:assert/strict";
import test from "node:test";

import { resolveEconomySellback } from "./sellback.ts";

test("uses the recorded discounted purchase price as the sellback basis", () => {
  const result = resolveEconomySellback({
    marketPriceTokens: 2_000,
    source: {
      type: "marketplace_purchase",
      basePriceTokens: 2_000,
      priceTokens: 400,
      discountRuleId: 7,
      discountTokens: 1_600,
    },
  });

  assert.deepEqual(result, {
    status: "resolved",
    marketPriceTokens: 2_000,
    sellbackBasisTokens: 400,
    recordedPurchasePriceTokens: 400,
    payoutTokens: 120,
    usesRecordedPurchasePrice: true,
    payoutCappedAtRecordedPurchasePrice: false,
  });
});

test("uses the lower current market value for a discounted marketplace purchase", () => {
  const result = resolveEconomySellback({
    marketPriceTokens: 300,
    source: {
      type: "marketplace_purchase",
      basePriceTokens: 2_000,
      priceTokens: 400,
      discountPercentageBps: 8_000,
    },
  });

  assert.equal(result.status, "resolved");
  if (result.status !== "resolved") return;
  assert.equal(result.sellbackBasisTokens, 300);
  assert.equal(result.payoutTokens, 90);
  assert.equal(result.usesRecordedPurchasePrice, false);
});

test("never pays more than a discounted marketplace purchase recorded price", () => {
  const result = resolveEconomySellback({
    marketPriceTokens: 100,
    source: {
      type: "marketplace_purchase",
      basePriceTokens: 100,
      priceTokens: 1,
      discountFixedTokens: 99,
    },
  });

  assert.equal(result.status, "resolved");
  if (result.status !== "resolved") return;
  assert.equal(result.sellbackBasisTokens, 1);
  assert.equal(result.payoutTokens, 1);
  assert.equal(result.payoutCappedAtRecordedPurchasePrice, true);
});

test("keeps current-market sellback for non-discounted purchases and non-market sources", () => {
  const nonDiscountedPurchase = resolveEconomySellback({
    marketPriceTokens: 2_000,
    source: { type: "marketplace_purchase", basePriceTokens: 2_000, priceTokens: 2_000 },
  });
  const crateDrop = resolveEconomySellback({
    marketPriceTokens: 2_000,
    source: { type: "crate_opening", priceTokens: 1 },
  });

  for (const result of [nonDiscountedPurchase, crateDrop]) {
    assert.equal(result.status, "resolved");
    if (result.status !== "resolved") continue;
    assert.equal(result.sellbackBasisTokens, 2_000);
    assert.equal(result.recordedPurchasePriceTokens, null);
    assert.equal(result.payoutTokens, 600);
  }
});

test("rejects a discounted marketplace purchase without valid recorded payment evidence", () => {
  const result = resolveEconomySellback({
    marketPriceTokens: 2_000,
    source: {
      type: "marketplace_purchase",
      basePriceTokens: 2_000,
      discountTokens: 1_600,
    },
  });

  assert.deepEqual(result, {
    status: "rejected",
    reason: "invalid_discounted_marketplace_purchase",
  });
});
