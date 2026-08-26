import { setEconomyItemNametag } from "@/lib/data/portal-repository";
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
  const nametagItemId = textField(context.body.nametagItemId, 128);
  const nametag = textField(context.body.nametag, 128);
  if (!itemId || !nametag)
    return economyJsonError(
      "Choose an owned item and provide a name tag up to 128 characters.",
      400,
    );

  try {
    const result = await setEconomyItemNametag({
      steamId: context.session.steamId,
      itemId,
      nametagItemId: nametagItemId ?? undefined,
      nametag,
      idempotencyKey: context.body.idempotencyKey,
    });
    return economyJsonSuccess({
      ...result,
      balance: result.wallet.balance,
      message: result.priceTokens
        ? "Name tag applied for 200 Tokens."
        : "Name tag item consumed and applied.",
    });
  } catch (error) {
    return economyMutationFailure(error);
  }
}
