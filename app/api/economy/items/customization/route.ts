import { customizeEconomyWeapon } from "@/lib/data/portal-repository";
import { economyJsonError, economyJsonSuccess, economyMutationFailure, isEconomyError, readEconomyMutation, textField } from "@/lib/economy/request";

export async function POST(request: Request) {
  const context = await readEconomyMutation(request);
  if (isEconomyError(context)) return context;
  const weaponItemId = textField(context.body.weaponItemId, 128);
  if (!weaponItemId) return economyJsonError("Choose an owned weapon.", 400);
  try {
    const result = await customizeEconomyWeapon({
      steamId: context.session.steamId, weaponItemId,
      customization: context.body.customization, idempotencyKey: context.body.idempotencyKey,
    });
    return economyJsonSuccess({ ...result, message: "Your attachment placement has been saved." });
  } catch (error) {
    return economyMutationFailure(error);
  }
}
