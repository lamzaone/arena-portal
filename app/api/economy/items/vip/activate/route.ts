import { activateVipMembershipItem } from "@/lib/data/portal-repository";
import {
  economyJsonError,
  economyJsonSuccess,
  economyMutationFailure,
  isEconomyError,
  readEconomyMutation,
  textField,
} from "@/lib/economy/request";

function formatDuration(totalSeconds: number) {
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

function activationMessage(result: Awaited<ReturnType<typeof activateVipMembershipItem>>) {
  if (!result.expiresAt) {
    return result.activationKind === "permanent-upgrade"
      ? `${result.previousGroupName ?? "VIP"} was upgraded to permanent ${result.groupName}.`
      : `${result.groupName} membership is now permanent.`;
  }
  const expiry = formatExpiry(result.expiresAt);
  if (result.activationKind === "lower-tier-converted") {
    return `${result.itemGroupName} converted at the current marketplace rates into ${formatDuration(result.convertedDurationSeconds)} of ${result.groupName} (${formatDuration(result.timeDeductedSeconds)} deducted for the tier difference). ${result.groupName} is active until ${expiry}.`;
  }
  if (result.activationKind === "upgraded") {
    return `Upgraded ${result.previousGroupName ?? "VIP"} to ${result.groupName}; the remaining membership converted at the current marketplace rates into ${formatDuration(result.convertedDurationSeconds)} (${formatDuration(result.timeDeductedSeconds)} deducted for the tier difference). Active until ${expiry}.`;
  }
  if (result.activationKind === "extended") {
    return `${result.groupName} was extended by ${formatDuration(result.convertedDurationSeconds)} and is active until ${expiry}.`;
  }
  return `${result.groupName} membership is active until ${expiry}.`;
}

export async function POST(request: Request) {
  const context = await readEconomyMutation(request);
  if (isEconomyError(context)) return context;
  const itemId = textField(context.body.itemId, 128);
  if (!itemId)
    return economyJsonError("Choose an owned group membership item.", 400);

  try {
    const result = await activateVipMembershipItem({
      steamId: context.session.steamId,
      itemId,
      idempotencyKey: context.body.idempotencyKey,
    });
    return economyJsonSuccess({
      ...result,
      message: activationMessage(result),
    });
  } catch (error) {
    return economyMutationFailure(error);
  }
}
