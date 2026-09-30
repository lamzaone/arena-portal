import assert from "node:assert/strict";
import test from "node:test";

import {
  ECONOMY_SELLBACK_BASIS_POINTS,
  ECONOMY_SELLBACK_MINIMUM_TOKENS,
  ECONOMY_SELLBACK_PERCENT,
  ECONOMY_SELLBACK_PERCENT_LABEL,
  economySellbackSaleMessage,
  resolveEconomySellback,
} from "./sellback.ts";

const expectedPayout = (basisTokens: number) =>
  Math.max(
    ECONOMY_SELLBACK_MINIMUM_TOKENS,
    Math.floor((basisTokens * ECONOMY_SELLBACK_PERCENT) / 100),
  );

test("derives the stored rate and display label from the editable percentage", () => {
  assert.equal(ECONOMY_SELLBACK_BASIS_POINTS, ECONOMY_SELLBACK_PERCENT * 100);
  assert.equal(ECONOMY_SELLBACK_PERCENT_LABEL, `${ECONOMY_SELLBACK_PERCENT}%`);
});

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
    payoutTokens: expectedPayout(400),
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
  assert.equal(result.payoutTokens, expectedPayout(300));
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
    assert.equal(result.payoutTokens, expectedPayout(2_000));
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
  const standardBasisTokens = 10_000;
  const standardPayoutTokens = expectedPayout(standardBasisTokens);
  assert.equal(
    economySellbackSaleMessage({
      marketPriceTokens: 20_000,
      sellbackBasisTokens: standardBasisTokens,
      recordedPurchasePriceTokens: standardBasisTokens,
      payoutTokens: standardPayoutTokens,
      payoutCappedAtRecordedPurchasePrice: false,
    }),
    `Item sold for ${standardPayoutTokens.toLocaleString("en-US")} Tokens (${ECONOMY_SELLBACK_PERCENT}% of its 10,000-Token sellback basis; current portal market price: 20,000 Tokens).`,
  );
  assert.equal(
    economySellbackSaleMessage({
      marketPriceTokens: 1,
      sellbackBasisTokens: 1,
      recordedPurchasePriceTokens: null,
      payoutTokens: ECONOMY_SELLBACK_MINIMUM_TOKENS,
      payoutCappedAtRecordedPurchasePrice: false,
    }),
    `Item sold for ${ECONOMY_SELLBACK_MINIMUM_TOKENS} Tokens (minimum buyback for its 1-Token sellback basis).`,
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
