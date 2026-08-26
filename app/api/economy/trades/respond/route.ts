import { respondEconomyTrade } from "@/lib/data/portal-repository";
import { economyJsonError, economyJsonSuccess, economyMutationFailure, isEconomyError, readEconomyMutation, textField } from "@/lib/economy/request";

export async function POST(request: Request) {
  const context = await readEconomyMutation(request);
  if (isEconomyError(context)) return context;
  const tradeId = textField(context.body.tradeId, 128);
  const decision = context.body.decision === "accept" || context.body.decision === "reject" ? context.body.decision : null;
  if (!tradeId || !decision) return economyJsonError("Choose a valid trade and response.", 400);

  try {
    const result = await respondEconomyTrade({ steamId: context.session.steamId, tradeId, decision, idempotencyKey: context.body.idempotencyKey });
    const message = result.status === "accepted" ? "Trade accepted. The items and Tokens have been transferred." : result.status === "rejected" ? "Trade declined." : "Trade could not be completed because it expired or a requested item is unavailable.";
    return economyJsonSuccess({ ...result, message });
  } catch (error) {
    return economyMutationFailure(error);
  }
}
