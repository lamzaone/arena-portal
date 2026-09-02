import { setEconomyInventorySaleLock } from "@/lib/data/portal-repository";
import {
  economyJsonError,
  economyJsonSuccess,
  economyMutationFailure,
  isEconomyError,
  readEconomyMutation,
  stringArrayField,
  textField,
} from "@/lib/economy/request";

export async function POST(request: Request) {
  const context = await readEconomyMutation(request);
  if (isEconomyError(context)) return context;

  const hasItemId = context.body.itemId !== undefined;
  const hasItemIds = context.body.itemIds !== undefined;
  const itemIds = hasItemIds
    ? stringArrayField(context.body.itemIds, 50)
    : hasItemId
      ? [textField(context.body.itemId, 128)].filter(
          (itemId): itemId is string => Boolean(itemId),
        )
      : null;
  if (hasItemId === hasItemIds || !itemIds?.length) {
    return economyJsonError(
      "Choose between 1 and 50 inventory items to update.",
      400,
    );
  }
  if (typeof context.body.saleLocked !== "boolean") {
    return economyJsonError("Choose whether to lock the selected items from sale.", 400);
  }

  try {
    const result = await setEconomyInventorySaleLock({
      steamId: context.session.steamId,
      itemIds,
      saleLocked: context.body.saleLocked,
      idempotencyKey: context.body.idempotencyKey,
    });
    return economyJsonSuccess({
      ...result,
      message: "Inventory sale lock updated.",
    });
  } catch (error) {
    return economyMutationFailure(error);
  }
}
