import { equipProfileThemeItem } from "@/lib/data/portal-repository";
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
    return economyJsonError("Choose an owned Profile Theme item.", 400);

  try {
    const result = await equipProfileThemeItem({
      steamId: context.session.steamId,
      itemId,
      idempotencyKey: context.body.idempotencyKey,
    });
    return economyJsonSuccess({
      ...result,
      message: `${result.displayName} is now equipped across all of its supported surfaces.`,
    });
  } catch (error) {
    return economyMutationFailure(error);
  }
}
