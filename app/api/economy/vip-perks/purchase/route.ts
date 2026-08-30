import { purchaseVipPerkOffer } from "@/lib/data/vip-perks";
import {
  economyJsonError,
  economyJsonSuccess,
  economyMutationFailure,
  integerField,
  isEconomyError,
  readEconomyMutation,
} from "@/lib/economy/request";

export async function POST(request: Request) {
  const context = await readEconomyMutation(request);
  if (isEconomyError(context)) return context;
  const offerId = integerField(context.body.offerId, 1);
  if (!offerId) return economyJsonError("Choose an available VIP perk offer.", 400);

  try {
    const result = await purchaseVipPerkOffer({
      steamId: context.session.steamId,
      offerId,
      idempotencyKey: context.body.idempotencyKey,
    });
    return economyJsonSuccess({
      ...result,
      message: `${result.perkName} is active until ${new Date(result.expiresAt).toLocaleString()}.`,
    });
  } catch (error) {
    return economyMutationFailure(error);
  }
}
