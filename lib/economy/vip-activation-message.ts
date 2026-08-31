export type VipActivationMessageResult = {
  activationKind:
    | "activated"
    | "extended"
    | "lower-tier-converted"
    | "upgraded"
    | "made-permanent"
    | "permanent-upgrade";
  convertedDurationSeconds: number;
  durationMinutes: number;
  expiresAt: string | null;
  groupName: string;
  itemGroupName: string;
  previousGroupName: string | null;
  timeDeductedSeconds: number;
};

export function formatVipDuration(totalSeconds: number) {
  const seconds = Math.max(0, Math.floor(totalSeconds));
  const days = Math.floor(seconds / 86_400);
  const hours = Math.floor((seconds % 86_400) / 3_600);
  const minutes = Math.floor((seconds % 3_600) / 60);
  const parts = [
    days ? `${days}d` : "",
    hours ? `${hours}h` : "",
    minutes ? `${minutes}m` : "",
    seconds % 60 ? `${seconds % 60}s` : "",
  ].filter(Boolean);
  return parts.join(" ") || "0s";
}

function formatExpiry(value: string) {
  return new Intl.DateTimeFormat("en-GB", {
    dateStyle: "medium",
    timeStyle: "short",
    timeZone: "UTC",
  }).format(new Date(value)) + " UTC";
}

export function vipActivationMessage(result: VipActivationMessageResult) {
  if (!result.expiresAt) {
    return result.activationKind === "permanent-upgrade"
      ? `${result.previousGroupName ?? "VIP"} was upgraded to permanent ${result.groupName}.`
      : `${result.groupName} membership is now permanent.`;
  }
  const expiry = formatExpiry(result.expiresAt);
  if (result.activationKind === "lower-tier-converted") {
    return `${result.itemGroupName} converted at the current marketplace rates into ${formatVipDuration(result.convertedDurationSeconds)} of ${result.groupName} (${formatVipDuration(result.timeDeductedSeconds)} deducted for the tier difference). The existing ${result.groupName} subscription, including this added time, is active until ${expiry}.`;
  }
  if (result.activationKind === "upgraded") {
    const itemDurationSeconds = result.durationMinutes * 60;
    const totalResultSeconds = itemDurationSeconds + result.convertedDurationSeconds;
    return `Applied the full ${formatVipDuration(itemDurationSeconds)} ${result.itemGroupName} item and upgraded ${result.previousGroupName ?? "VIP"}; the remaining membership added ${formatVipDuration(result.convertedDurationSeconds)} of carry-over after the live tier-price conversion (${formatVipDuration(result.timeDeductedSeconds)} deducted for the tier difference). Total new ${result.groupName} duration: ${formatVipDuration(totalResultSeconds)}. Active until ${expiry}.`;
  }
  if (result.activationKind === "extended") {
    return `${result.groupName} was extended by the full ${formatVipDuration(result.convertedDurationSeconds)} item duration and is active until ${expiry}.`;
  }
  return `${result.groupName} membership is active until ${expiry}.`;
}
