import assert from "node:assert/strict";
import test from "node:test";

import {
  compareVipEntitlementPrecedence,
  compareVipTierRates,
  convertTimedVipMembership,
  convertVipDurationBetweenTierRates,
  selectPreferredVipTierRateListing,
  type VipTierRate,
  VipMembershipConversionError,
} from "./vip-membership-conversion.ts";

const DAY = 86_400n;
const WEEK = 7n * DAY;

const goldRate: VipTierRate = {
  groupId: 3,
  listingId: 31,
  durationSeconds: WEEK,
  priceTokens: 350n,
};
const diamondRate: VipTierRate = {
  groupId: 4,
  listingId: 41,
  durationSeconds: WEEK,
  priceTokens: 467n,
};

test("legacy entitlement precedence matches permanent activation policy", () => {
  const timedDiamond = { groupId: 4, rankWeight: 80, permanent: false };
  const permanentGold = { groupId: 3, rankWeight: 60, permanent: true };
  const permanentDiamond = { ...timedDiamond, permanent: true };

  assert.ok(compareVipEntitlementPrecedence(permanentGold, timedDiamond) < 0);
  assert.ok(compareVipEntitlementPrecedence(permanentDiamond, permanentGold) < 0);
  assert.ok(compareVipEntitlementPrecedence(timedDiamond, permanentGold) > 0);
});

test("activates and extends the same tier by the exact item duration", () => {
  const activated = convertTimedVipMembership({
    current: null,
    item: {
      groupId: 3,
      rankWeight: 60,
      durationSeconds: WEEK,
    },
  });
  assert.equal(activated.kind, "activated");
  assert.equal(activated.resultSeconds, WEEK);
  assert.equal(activated.conversionSourceSeconds, 0n);
  assert.equal(activated.timeDeductedSeconds, 0n);

  const extended = convertTimedVipMembership({
    current: {
      groupId: 3,
      rankWeight: 60,
      remainingSeconds: activated.resultSeconds,
    },
    item: {
      groupId: 3,
      rankWeight: 60,
      durationSeconds: DAY,
    },
  });
  assert.equal(extended.kind, "extended");
  assert.equal(extended.resultSeconds, 8n * DAY);
  assert.equal(extended.convertedSeconds, DAY);
  assert.equal(extended.conversionSourceSeconds, DAY);
  assert.equal(extended.timeDeductedSeconds, 0n);
});

test("seeded Gold 7 days plus Diamond 7 days is order-independent", () => {
  const expectedSeconds = 12n * DAY + 5n * 3_600n + 54n * 60n + 36n;
  const expectedConverted = 5n * DAY + 5n * 3_600n + 54n * 60n + 36n;

  const goldThenDiamond = convertTimedVipMembership({
    current: {
      groupId: 3,
      rankWeight: 60,
      remainingSeconds: WEEK,
    },
    item: {
      groupId: 4,
      rankWeight: 80,
      durationSeconds: WEEK,
    },
    currentRate: goldRate,
    itemRate: diamondRate,
  });
  const diamondThenGold = convertTimedVipMembership({
    current: {
      groupId: 4,
      rankWeight: 80,
      remainingSeconds: WEEK,
    },
    item: {
      groupId: 3,
      rankWeight: 60,
      durationSeconds: WEEK,
    },
    currentRate: diamondRate,
    itemRate: goldRate,
  });

  assert.equal(goldThenDiamond.kind, "upgraded");
  assert.equal(diamondThenGold.kind, "lower-tier-converted");
  assert.equal(goldThenDiamond.resultSeconds, expectedSeconds);
  assert.equal(diamondThenGold.resultSeconds, expectedSeconds);
  assert.equal(goldThenDiamond.convertedSeconds, expectedConverted);
  assert.equal(diamondThenGold.convertedSeconds, expectedConverted);
  assert.equal(
    goldThenDiamond.timeDeductedSeconds,
    WEEK - expectedConverted,
  );
  assert.equal(
    diamondThenGold.timeDeductedSeconds,
    goldThenDiamond.timeDeductedSeconds,
  );
});

test("a short higher-tier item upgrades and discounts all remaining lower-tier time", () => {
  const goldThenDiamond = convertTimedVipMembership({
    current: {
      groupId: 3,
      rankWeight: 60,
      remainingSeconds: 30n * DAY,
    },
    item: {
      groupId: 4,
      rankWeight: 80,
      durationSeconds: DAY,
    },
    currentRate: goldRate,
    itemRate: diamondRate,
  });
  const diamondThenGold = convertTimedVipMembership({
    current: {
      groupId: 4,
      rankWeight: 80,
      remainingSeconds: DAY,
    },
    item: {
      groupId: 3,
      rankWeight: 60,
      durationSeconds: 30n * DAY,
    },
    currentRate: diamondRate,
    itemRate: goldRate,
  });

  assert.equal(goldThenDiamond.kind, "upgraded");
  assert.equal(goldThenDiamond.resultSeconds, 2_029_012n);
  assert.equal(diamondThenGold.resultSeconds, goldThenDiamond.resultSeconds);
  assert.equal(goldThenDiamond.convertedSeconds, 1_942_612n);
  assert.equal(goldThenDiamond.timeDeductedSeconds, 649_388n);
});

test("conversions use current prices each time they are evaluated", () => {
  const repricedGold = { ...goldRate, priceTokens: 400n };
  const repricedDiamond = { ...diamondRate, priceTokens: 500n };
  const original = convertVipDurationBetweenTierRates(
    30n * DAY,
    goldRate,
    diamondRate,
  );
  const repriced = convertVipDurationBetweenTierRates(
    30n * DAY,
    repricedGold,
    repricedDiamond,
  );

  assert.equal(original, 1_942_612n);
  assert.equal(repriced, 24n * DAY);
  assert.notEqual(repriced, original);
});

test("an upgrade still succeeds when the converted old remainder rounds to zero", () => {
  const result = convertTimedVipMembership({
    current: { groupId: 1, rankWeight: 20, remainingSeconds: 1n },
    item: { groupId: 4, rankWeight: 80, durationSeconds: DAY },
    currentRate: {
      groupId: 1,
      listingId: 11,
      durationSeconds: WEEK,
      priceTokens: 1n,
    },
    itemRate: {
      groupId: 4,
      listingId: 41,
      durationSeconds: WEEK,
      priceTokens: 1_000n,
    },
  });

  assert.equal(result.kind, "upgraded");
  assert.equal(result.convertedSeconds, 0n);
  assert.equal(result.timeDeductedSeconds, 1n);
  assert.equal(result.resultSeconds, DAY);
});

test("a lower-tier item that converts below one second is rejected", () => {
  assert.throws(
    () =>
      convertTimedVipMembership({
        current: { groupId: 4, rankWeight: 80, remainingSeconds: DAY },
        item: { groupId: 1, rankWeight: 20, durationSeconds: 1n },
        currentRate: {
          groupId: 4,
          listingId: 41,
          durationSeconds: WEEK,
          priceTokens: 1_000n,
        },
        itemRate: {
          groupId: 1,
          listingId: 11,
          durationSeconds: WEEK,
          priceTokens: 1n,
        },
      }),
    (error) => {
      assert.ok(error instanceof VipMembershipConversionError);
      assert.equal(error.code, "conversion-too-small");
      return true;
    },
  );
});

test("cross-tier conversion fails closed for missing, mismatched, or non-monotonic rates", () => {
  const base = {
    current: { groupId: 3, rankWeight: 60, remainingSeconds: WEEK },
    item: { groupId: 4, rankWeight: 80, durationSeconds: WEEK },
  };

  assert.throws(
    () => convertTimedVipMembership({ ...base, itemRate: diamondRate }),
    (error) => {
      assert.ok(error instanceof VipMembershipConversionError);
      assert.equal(error.code, "missing-rate");
      return true;
    },
  );
  assert.throws(
    () =>
      convertTimedVipMembership({
        ...base,
        currentRate: { ...goldRate, groupId: 99 },
        itemRate: diamondRate,
      }),
    (error) => {
      assert.ok(error instanceof VipMembershipConversionError);
      assert.equal(error.code, "invalid-rate");
      return true;
    },
  );
  assert.throws(
    () =>
      convertTimedVipMembership({
        ...base,
        currentRate: { ...goldRate, priceTokens: 500n },
        itemRate: { ...diamondRate, priceTokens: 400n },
      }),
    (error) => {
      assert.ok(error instanceof VipMembershipConversionError);
      assert.equal(error.code, "non-monotonic-rate");
      return true;
    },
  );
  assert.throws(
    () =>
      convertTimedVipMembership({
        current: { groupId: 3, rankWeight: 60, remainingSeconds: WEEK },
        item: { groupId: 4, rankWeight: 60, durationSeconds: WEEK },
        currentRate: goldRate,
        itemRate: diamondRate,
      }),
    (error) => {
      assert.ok(error instanceof VipMembershipConversionError);
      assert.equal(error.code, "ambiguous-rank");
      return true;
    },
  );
});

test("rate comparison is exact and validates invalid rates", () => {
  assert.equal(compareVipTierRates(goldRate, diamondRate), -1);
  assert.equal(compareVipTierRates(diamondRate, goldRate), 1);
  assert.equal(
    compareVipTierRates(goldRate, { ...diamondRate, priceTokens: 350n }),
    0,
  );
  assert.throws(
    () => compareVipTierRates(goldRate, { ...diamondRate, priceTokens: 0n }),
    (error) => {
      assert.ok(error instanceof VipMembershipConversionError);
      assert.equal(error.code, "invalid-rate");
      return true;
    },
  );
});

test("canonical rate selection follows marketplace, monthly, duration, then ID", () => {
  const base = {
    groupId: 3,
    priceTokens: 350n,
    enabled: true,
  };
  const candidates = [
    {
      ...base,
      listingId: 9,
      durationSeconds: 43_200n * 60n,
      marketEnabled: false,
    },
    {
      ...base,
      listingId: 8,
      durationSeconds: DAY,
      marketEnabled: true,
    },
    {
      ...base,
      listingId: 7,
      durationSeconds: WEEK,
      marketEnabled: true,
    },
    {
      ...base,
      listingId: 6,
      durationSeconds: WEEK,
      marketEnabled: true,
    },
    {
      ...base,
      listingId: 1,
      durationSeconds: 0n,
      marketEnabled: true,
    },
  ];

  assert.equal(selectPreferredVipTierRateListing(candidates)?.listingId, 6);
  assert.equal(
    selectPreferredVipTierRateListing(
      candidates.map((candidate) => ({ ...candidate, marketEnabled: false })),
    )?.listingId,
    9,
  );
  assert.equal(
    selectPreferredVipTierRateListing(
      candidates.map((candidate) => ({ ...candidate, enabled: false })),
    ),
    null,
  );
});
