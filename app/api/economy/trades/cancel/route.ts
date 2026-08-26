import { cancelEconomyTrade } from "@/lib/data/portal-repository";
import { economyJsonError, economyJsonSuccess, economyMutationFailure, isEconomyError, readEconomyMutation, textField } from "@/lib/economy/request";

export async function POST(request: Request) {
  const context = await readEconomyMutation(request);
  if (isEconomyError(context)) return context;
  const tradeId = textField(context.body.tradeId, 128);
  if (!tradeId) return economyJsonError("Choose a valid trade to cancel.", 400);

  try {
    const result = await cancelEconomyTrade({ steamId: context.session.steamId, tradeId, idempotencyKey: context.body.idempotencyKey });
    return economyJsonSuccess({ ...result, message: result.status === "cancelled" ? "Trade offer cancelled and your reserved items were returned." : "This trade offer had already expired." });
  } catch (error) {
    return economyMutationFailure(error);
  }
}
