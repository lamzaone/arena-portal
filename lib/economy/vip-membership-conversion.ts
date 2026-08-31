const MONTHLY_RATE_DURATION_SECONDS = 43_200n * 60n;

export type VipTimedEntitlement = {
  groupId: number;
  rankWeight: number;
  remainingSeconds: bigint;
};

export type VipTimedItem = {
  groupId: number;
  rankWeight: number;
  durationSeconds: bigint;
};

/** The canonical, live marketplace rate for one VIP tier. */
export type VipTierRate = {
  groupId: number;
  listingId: number;
  durationSeconds: bigint;
  priceTokens: bigint;
};

export type VipTierRateListingCandidate = VipTierRate & {
  marketEnabled: boolean;
  enabled?: boolean;
};

export type VipTimedConversionKind =
  | "activated"
  | "extended"
  | "lower-tier-converted"
  | "upgraded";

export type VipTimedConversionResult = {
  kind: VipTimedConversionKind;
  resultGroupId: number;
  resultRankWeight: number;
  resultSeconds: bigint;
  /** The source duration after conversion, excluding exact item time on upgrades. */
  convertedSeconds: bigint;
  /** The duration that was subject to conversion. */
  conversionSourceSeconds: bigint;
  /** Source time removed by conversion into a more expensive tier. */
  timeDeductedSeconds: bigint;
};

export type VipEntitlementPrecedence = {
  groupId: number;
  rankWeight: number;
  permanent: boolean;
};

/**
 * Orders already-owned VIP entitlements using the same invariant as item
 * activation: a permanent entitlement cannot be displaced by a timed item;
 * within the same permanence class, the higher tier wins. The group ID is a
 * deterministic final tie-breaker for legacy data that predates rank checks.
 */
export function compareVipEntitlementPrecedence(
  left: VipEntitlementPrecedence,
  right: VipEntitlementPrecedence,
) {
  if (left.permanent !== right.permanent) return left.permanent ? -1 : 1;
  if (left.rankWeight !== right.rankWeight) {
    return right.rankWeight - left.rankWeight;
  }
  return left.groupId - right.groupId;
}

export class VipMembershipConversionError extends Error {
  readonly code:
    | "invalid-value"
    | "invalid-rate"
    | "missing-rate"
    | "ambiguous-rank"
    | "non-monotonic-rate"
    | "conversion-too-small";

  constructor(
    code: VipMembershipConversionError["code"],
    message: string,
  ) {
    super(message);
    this.name = "VipMembershipConversionError";
    this.code = code;
  }
}

function requirePositive(value: bigint, label: string) {
  if (value <= 0n) {
    throw new VipMembershipConversionError(
      "invalid-value",
      `${label} must be positive.`,
    );
  }
}

function validPositiveId(value: number) {
  return Number.isSafeInteger(value) && value > 0;
}

export function isValidVipTierRate(rate: VipTierRate) {
  return (
    validPositiveId(rate.groupId) &&
    validPositiveId(rate.listingId) &&
    rate.durationSeconds > 0n &&
    rate.priceTokens > 0n
  );
}

export function assertValidVipTierRate(
  rate: VipTierRate,
  expectedGroupId?: number,
  label = "VIP tier rate",
): asserts rate is VipTierRate {
  if (!isValidVipTierRate(rate)) {
    throw new VipMembershipConversionError(
      "invalid-rate",
      `${label} is invalid.`,
    );
  }
  if (expectedGroupId !== undefined && rate.groupId !== expectedGroupId) {
    throw new VipMembershipConversionError(
      "invalid-rate",
      `${label} does not match the VIP tier.`,
    );
  }
}

export function isEligibleVipTierRateListingCandidate(
  candidate: VipTierRateListingCandidate,
) {
  return candidate.enabled !== false && isValidVipTierRate(candidate);
}

/**
 * Selects the canonical live rate for a tier. Marketplace listings win, then
 * the 30-day listing, then the longest duration, with the ID as a stable tie
 * breaker. Invalid, disabled, and permanent listings are ineligible.
 */
export function selectPreferredVipTierRateListing<
  T extends VipTierRateListingCandidate,
>(candidates: readonly T[]): T | null {
  const eligible = candidates.filter(isEligibleVipTierRateListingCandidate);
  if (eligible.length === 0) return null;

  const groupId = eligible[0].groupId;
  if (eligible.some((candidate) => candidate.groupId !== groupId)) {
    throw new VipMembershipConversionError(
      "invalid-rate",
      "VIP rate candidates from different tiers cannot be compared.",
    );
  }

  return eligible.slice().sort((left, right) => {
    if (left.marketEnabled !== right.marketEnabled) {
      return left.marketEnabled ? -1 : 1;
    }
    const leftMonthly = left.durationSeconds === MONTHLY_RATE_DURATION_SECONDS;
    const rightMonthly = right.durationSeconds === MONTHLY_RATE_DURATION_SECONDS;
    if (leftMonthly !== rightMonthly) return leftMonthly ? -1 : 1;
    if (left.durationSeconds !== right.durationSeconds) {
      return left.durationSeconds > right.durationSeconds ? -1 : 1;
    }
    return left.listingId - right.listingId;
  })[0];
}

/** Compares Token cost per second without floating-point arithmetic. */
export function compareVipTierRates(left: VipTierRate, right: VipTierRate) {
  assertValidVipTierRate(left, undefined, "Left VIP tier rate");
  assertValidVipTierRate(right, undefined, "Right VIP tier rate");
  const leftScaled = left.priceTokens * right.durationSeconds;
  const rightScaled = right.priceTokens * left.durationSeconds;
  if (leftScaled < rightScaled) return -1;
  if (leftScaled > rightScaled) return 1;
  return 0;
}

/**
 * Converts time at the source tier's live Token rate into time at the target
 * tier's live rate. Integer division deliberately rounds down.
 */
export function convertVipDurationBetweenTierRates(
  sourceSeconds: bigint,
  sourceRate: VipTierRate,
  targetRate: VipTierRate,
) {
  requirePositive(sourceSeconds, "VIP conversion source duration");
  assertValidVipTierRate(sourceRate, undefined, "Source VIP tier rate");
  assertValidVipTierRate(targetRate, undefined, "Target VIP tier rate");
  return (
    sourceSeconds * sourceRate.priceTokens * targetRate.durationSeconds
  ) / (sourceRate.durationSeconds * targetRate.priceTokens);
}

function requireTierRate(
  rate: VipTierRate | null | undefined,
  expectedGroupId: number,
  label: string,
) {
  if (!rate) {
    throw new VipMembershipConversionError(
      "missing-rate",
      `${label} is unavailable.`,
    );
  }
  assertValidVipTierRate(rate, expectedGroupId, label);
  return rate;
}

function requireIncreasingTierRate(input: {
  lowerRate: VipTierRate;
  higherRate: VipTierRate;
}) {
  if (compareVipTierRates(input.lowerRate, input.higherRate) >= 0) {
    throw new VipMembershipConversionError(
      "non-monotonic-rate",
      "Higher VIP tiers must have a higher live Token rate.",
    );
  }
}

/**
 * Applies one finite VIP item to a player's single canonical finite VIP tier.
 * Cross-tier conversions always revalue the lower-tier time with the current
 * canonical marketplace rates; no historical item price is retained.
 */
export function convertTimedVipMembership(input: {
  current: VipTimedEntitlement | null;
  item: VipTimedItem;
  currentRate?: VipTierRate | null;
  itemRate?: VipTierRate | null;
}): VipTimedConversionResult {
  const { current, item } = input;
  requirePositive(item.durationSeconds, "VIP item duration");

  if (!current) {
    return {
      kind: "activated",
      resultGroupId: item.groupId,
      resultRankWeight: item.rankWeight,
      resultSeconds: item.durationSeconds,
      convertedSeconds: 0n,
      conversionSourceSeconds: 0n,
      timeDeductedSeconds: 0n,
    };
  }

  requirePositive(current.remainingSeconds, "Current VIP duration");

  if (current.groupId === item.groupId) {
    if (current.rankWeight !== item.rankWeight) {
      throw new VipMembershipConversionError(
        "ambiguous-rank",
        "The same VIP tier has conflicting ranks.",
      );
    }
    return {
      kind: "extended",
      resultGroupId: current.groupId,
      resultRankWeight: current.rankWeight,
      resultSeconds: current.remainingSeconds + item.durationSeconds,
      convertedSeconds: item.durationSeconds,
      conversionSourceSeconds: item.durationSeconds,
      timeDeductedSeconds: 0n,
    };
  }

  if (current.rankWeight === item.rankWeight) {
    throw new VipMembershipConversionError(
      "ambiguous-rank",
      "Two different VIP tiers have the same rank.",
    );
  }

  const currentRate = requireTierRate(
    input.currentRate,
    current.groupId,
    "Current VIP tier rate",
  );
  const itemRate = requireTierRate(
    input.itemRate,
    item.groupId,
    "Item VIP tier rate",
  );

  if (item.rankWeight < current.rankWeight) {
    requireIncreasingTierRate({ lowerRate: itemRate, higherRate: currentRate });
    const convertedSeconds = convertVipDurationBetweenTierRates(
      item.durationSeconds,
      itemRate,
      currentRate,
    );
    if (convertedSeconds <= 0n) {
      throw new VipMembershipConversionError(
        "conversion-too-small",
        "This item's live-rate conversion would be less than one second.",
      );
    }
    return {
      kind: "lower-tier-converted",
      resultGroupId: current.groupId,
      resultRankWeight: current.rankWeight,
      resultSeconds: current.remainingSeconds + convertedSeconds,
      convertedSeconds,
      conversionSourceSeconds: item.durationSeconds,
      timeDeductedSeconds: item.durationSeconds - convertedSeconds,
    };
  }

  requireIncreasingTierRate({ lowerRate: currentRate, higherRate: itemRate });
  const convertedSeconds = convertVipDurationBetweenTierRates(
    current.remainingSeconds,
    currentRate,
    itemRate,
  );
  return {
    kind: "upgraded",
    resultGroupId: item.groupId,
    resultRankWeight: item.rankWeight,
    resultSeconds: item.durationSeconds + convertedSeconds,
    convertedSeconds,
    conversionSourceSeconds: current.remainingSeconds,
    timeDeductedSeconds: current.remainingSeconds - convertedSeconds,
  };
}
