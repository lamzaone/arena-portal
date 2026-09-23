import {
  convertTimedVipMembership,
  type VipTierRate,
  type VipTimedConversionKind,
} from "./vip-membership-conversion.ts";
export function resolveVipActivationPreview(input: {
  now: Date;
  item: {
    groupId: number;
    rankWeight: number;
    displayName: string;
    durationMinutes: number;
  };
  current: {
    groupId: number;
    rankWeight: number;
    displayName: string;
    expiresAt: Date | null;
  } | null;
  rates: Map<number, VipTierRate>;
}) {
  const { item, current, now, rates } = input;
  const duration = BigInt(item.durationMinutes) * 60n;
  const reject = (message: string): never => {
    throw Object.assign(new Error(message), { code: "incompatible_item" });
  };
  let activationKind:
    VipTimedConversionKind | "made-permanent" | "permanent-upgrade";
  let resultGroupId = item.groupId;
  let convertedDurationSeconds = 0n;
  let conversionSourceSeconds = 0n;
  let timeDeductedSeconds = 0n;
  let finalExpiresAt: Date | null;
  if (!current) {
    activationKind =
      item.durationMinutes === 0 ? "made-permanent" : "activated";
    finalExpiresAt =
      item.durationMinutes === 0
        ? null
        : new Date(now.getTime() + Number(duration) * 1000);
  } else if (current.expiresAt === null) {
    if (
      item.durationMinutes !== 0 ||
      item.groupId === current.groupId ||
      item.rankWeight <= current.rankWeight
    )
      reject(
        `You already have permanent ${current.displayName} access. This item remains in your inventory.`,
      );
    activationKind = "permanent-upgrade";
    finalExpiresAt = null;
  } else if (item.durationMinutes === 0) {
    if (
      item.groupId !== current.groupId &&
      item.rankWeight <= current.rankWeight
    )
      reject("A lower permanent tier cannot replace your current tier.");
    activationKind =
      item.groupId === current.groupId ? "made-permanent" : "permanent-upgrade";
    finalExpiresAt = null;
  } else {
    const converted = convertTimedVipMembership({
      current: {
        groupId: current.groupId,
        rankWeight: current.rankWeight,
        remainingSeconds: BigInt(
          Math.max(
            0,
            Math.floor((current.expiresAt.getTime() - now.getTime()) / 1000),
          ),
        ),
      },
      item: {
        groupId: item.groupId,
        rankWeight: item.rankWeight,
        durationSeconds: duration,
      },
      currentRate: rates.get(current.groupId),
      itemRate: rates.get(item.groupId),
    });
    activationKind = converted.kind;
    resultGroupId = converted.resultGroupId;
    convertedDurationSeconds = converted.convertedSeconds;
    conversionSourceSeconds = converted.conversionSourceSeconds;
    timeDeductedSeconds = converted.timeDeductedSeconds;
    const expiry = now.getTime() + Number(converted.resultSeconds) * 1000;
    if (!Number.isSafeInteger(expiry) || expiry > 253402300799000)
      throw Object.assign(
        new Error("The VIP expiry exceeds the supported range."),
        { code: "invalid_duration" },
      );
    finalExpiresAt = new Date(expiry);
  }
  return {
    activationKind,
    resultGroupId,
    convertedDurationSeconds,
    conversionSourceSeconds,
    timeDeductedSeconds,
    finalExpiresAt,
  };
}
export async function getOwnedVipActivationQuote(input: {
  steamId: string;
  itemId: string;
}) {
  const { previewOwnedVipMembershipActivation } =
    await import("../data/vip-membership-activation-saga");
  return previewOwnedVipMembershipActivation(input);
}
