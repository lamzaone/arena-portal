import { attachEconomySticker } from "@/lib/data/portal-repository";
import { economyJsonError, economyJsonSuccess, economyMutationFailure, integerField, isEconomyError, readEconomyMutation, textField } from "@/lib/economy/request";

export async function POST(request: Request) {
  const context = await readEconomyMutation(request);
  if (isEconomyError(context)) return context;
  const weaponItemId = textField(context.body.weaponItemId, 128);
  const stickerItemId = textField(context.body.stickerItemId, 128);
  const slot = integerField(context.body.slot, 0, 5);
  if (!weaponItemId || !stickerItemId || slot === null) return economyJsonError("Choose a weapon, an owned sticker, and a valid sticker slot.", 400);

  try {
    const result = await attachEconomySticker({ steamId: context.session.steamId, weaponItemId, stickerItemId, slot, idempotencyKey: context.body.idempotencyKey });
    return economyJsonSuccess({ ...result, message: "Sticker applied to your weapon." });
  } catch (error) {
    return economyMutationFailure(error);
  }
}
