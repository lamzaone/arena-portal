import assert from "node:assert/strict";
import test from "node:test";
import {
  marketQuoteEvidenceLabel,
  marketQuoteMatchesSelection,
  parseMarketSeed,
} from "./market-selection.ts";

test("market seeds keep the supported integer boundaries and reject incomplete inputs", () => {
  assert.equal(parseMarketSeed("0"), 0);
  assert.equal(parseMarketSeed("1000"), 1000);
  assert.equal(parseMarketSeed(" 007 "), 7);
  for (const value of ["", " ", "-1", "1001", "1.5", "1e2", "NaN", "Infinity"]) {
    assert.equal(parseMarketSeed(value), null, value);
  }
});

test("a purchasable quote must match float, seed, and StatTrak together", () => {
  const selection = { floatValue: 0.15, seed: 661, stattrak: false };
  assert.equal(marketQuoteMatchesSelection({ ...selection }, selection), true);
  assert.equal(marketQuoteMatchesSelection({ ...selection, floatValue: 0.15000001 }, selection), true);
  assert.equal(marketQuoteMatchesSelection({ ...selection, floatValue: 0.150001 }, selection), false);
  assert.equal(marketQuoteMatchesSelection({ ...selection, seed: 0 }, selection), false);
  assert.equal(marketQuoteMatchesSelection({ ...selection, stattrak: true }, selection), false);
});

test("quote labels distinguish seed evidence from estimates and server prices", () => {
  assert.equal(marketQuoteEvidenceLabel({ seedMatched: true, pricingRule: "exact" }), "Seed-matched market price");
  assert.equal(marketQuoteEvidenceLabel({ seedMatched: false, pricingRule: "float-linear-v1" }), "Market estimate · seed price unverified");
  assert.equal(marketQuoteEvidenceLabel({ seedMatched: false, pricingRule: "custom-server-fixed-v1" }), "Staff-set server price");
});
