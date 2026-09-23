import {
  sellInventorySelection,
  sellInventoryItem,
} from "@/lib/economy/sell-service";
import {
  economyJsonError,
  economyJsonSuccess,
  economyMutationFailure,
  isEconomyError,
  readEconomyMutation,
  stringArrayField,
  textField,
} from "@/lib/economy/request";
import { economySellbackSaleMessage } from "@/lib/economy/sellback";

export async function POST(request: Request) {
  const context = await readEconomyMutation(request);
  if (isEconomyError(context)) return context;
  if (context.body.itemIds !== undefined) {
    const itemIds = stringArrayField(context.body.itemIds, 50);
    if (!itemIds?.length)
      return economyJsonError(
        "Choose between 1 and 50 inventory items to sell.",
        400,
      );

    try {
      const result = await sellInventorySelection({
        steamId: context.session.steamId,
        itemIds,
        idempotencyKey: context.body.idempotencyKey,
      });
      const skippedItems = result.skippedItems;
      return economyJsonSuccess({
        ...result,
        balance: result.wallet.balance,
        skippedItemIds: skippedItems.map((item) => item.itemId),
        skippedItems,
        message: `${result.itemIds.length} ${result.itemIds.length === 1 ? "item" : "items"} sold for ${result.payoutTokens} Tokens.${skippedItems.length ? ` ${skippedItems.length} ${skippedItems.length === 1 ? "item was" : "items were"} left unsold because no online price matched.` : ""}`,
      });
    } catch (error) {
      return economyMutationFailure(error);
    }
  }
  const itemId = textField(context.body.itemId, 128);
  if (!itemId)
    return economyJsonError("Choose a valid inventory item to sell.", 400);

  try {
    const result = await sellInventoryItem({
      steamId: context.session.steamId,
      itemId,
      idempotencyKey: context.body.idempotencyKey,
    });
    return economyJsonSuccess({
      ...result,
      balance: result.wallet.balance,
      message: economySellbackSaleMessage(result),
    });
  } catch (error) {
    return economyMutationFailure(error);
  }
}
