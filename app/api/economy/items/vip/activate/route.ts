import { activateVipMembershipItem } from "@/lib/data/portal-repository";
import {
  economyJsonError,
  economyJsonSuccess,
  economyMutationFailure,
  isEconomyError,
  readEconomyMutation,
  textField,
} from "@/lib/economy/request";

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
      message: result.expiresAt
        ? `${result.groupName} membership is active until ${new Date(result.expiresAt).toLocaleString()}.`
        : `${result.groupName} membership is now permanent.`,
    });
  } catch (error) {
    return economyMutationFailure(error);
  }
}
