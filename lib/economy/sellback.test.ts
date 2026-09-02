import assert from "node:assert/strict";
import test from "node:test";

import {
  economySellbackSaleMessage,
  resolveEconomySellback,
} from "./sellback.ts";

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
    reason: "invalid_marketplace_purchase",
  });
});

test("rejects any marketplace purchase whose recorded payment evidence is malformed", () => {
  const result = resolveEconomySellback({
    marketPriceTokens: 2_000,
    source: {
      type: "marketplace_purchase",
      basePriceTokens: 2_000,
      priceTokens: null,
      discountRuleId: null,
      discountTokens: 0,
    },
  });

  assert.deepEqual(result, {
    status: "rejected",
    reason: "invalid_marketplace_purchase",
  });
});

test("rejects marketplace purchases whose base-price evidence cannot prove discount state", () => {
  for (const basePriceTokens of [null, 399]) {
    const result = resolveEconomySellback({
      marketPriceTokens: 2_000,
      source: {
        type: "marketplace_purchase",
        basePriceTokens,
        priceTokens: 400,
        discountRuleId: null,
        discountTokens: 0,
      },
    });

    assert.deepEqual(result, {
      status: "rejected",
      reason: "invalid_marketplace_purchase",
    });
  }
});

test("allows a fully discounted marketplace purchase to sell for zero Tokens", () => {
  const result = resolveEconomySellback({
    marketPriceTokens: 2_000,
    source: {
      type: "marketplace_purchase",
      basePriceTokens: 2_000,
      priceTokens: 0,
      discountTokens: 2_000,
    },
  });

  assert.equal(result.status, "resolved");
  if (result.status !== "resolved") return;
  assert.equal(result.sellbackBasisTokens, 0);
  assert.equal(result.payoutTokens, 0);
  assert.equal(
    economySellbackSaleMessage(result),
    "Item sold for 0 Tokens (the recorded discounted purchase price was 0 Tokens).",
  );
});

test("describes standard, minimum, and paid-price-capped sellback payouts accurately", () => {
  assert.equal(
    economySellbackSaleMessage({
      marketPriceTokens: 2_000,
      sellbackBasisTokens: 400,
      recordedPurchasePriceTokens: 400,
      payoutTokens: 120,
      payoutCappedAtRecordedPurchasePrice: false,
    }),
    "Item sold for 120 Tokens (30% of its 400-Token sellback basis; current portal market price: 2,000 Tokens).",
  );
  assert.equal(
    economySellbackSaleMessage({
      marketPriceTokens: 10,
      sellbackBasisTokens: 10,
      recordedPurchasePriceTokens: null,
      payoutTokens: 5,
      payoutCappedAtRecordedPurchasePrice: false,
    }),
    "Item sold for 5 Tokens (minimum buyback for its 10-Token sellback basis).",
  );
  assert.equal(
    economySellbackSaleMessage({
      marketPriceTokens: 100,
      sellbackBasisTokens: 1,
      recordedPurchasePriceTokens: 1,
      payoutTokens: 1,
      payoutCappedAtRecordedPurchasePrice: true,
    }),
    "Item sold for 1 Tokens (buyback capped at its recorded 1-Token purchase price).",
  );
});
