import { attachEconomyCharm } from "@/lib/data/portal-repository";
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
  const weaponItemId = textField(context.body.weaponItemId, 128);
  const charmItemId = textField(context.body.charmItemId, 128);
  if (!weaponItemId || !charmItemId)
    return economyJsonError("Choose an owned weapon and charm.", 400);

  try {
    const result = await attachEconomyCharm({
      steamId: context.session.steamId,
      weaponItemId,
      charmItemId,
      idempotencyKey: context.body.idempotencyKey,
    });
    return economyJsonSuccess({
      ...result,
      message: "Charm applied to your weapon.",
    });
  } catch (error) {
    return economyMutationFailure(error);
  }
}
