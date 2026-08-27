import { redeemEconomyCode } from "@/lib/data/portal-repository";
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
  const code = textField(context.body.code, 64);
  if (!code)
    return economyJsonError("Enter a valid redeem code.", 400);

  try {
    const result = await redeemEconomyCode({
      steamId: context.session.steamId,
      code,
      redeemedVia: "website",
      idempotencyKey: context.body.idempotencyKey,
    });
    const rewardSummary = [
      result.tokensAwarded
        ? `+${result.tokensAwarded.toLocaleString()} Tokens`
        : null,
      result.itemNames.length
        ? `${result.itemNames.length} item${result.itemNames.length === 1 ? "" : "s"}`
        : null,
    ]
      .filter(Boolean)
      .join(" and ");
    return economyJsonSuccess({
      ...result,
      balance: result.wallet.balance,
      message: `${result.displayName} redeemed: ${rewardSummary}.`,
    });
  } catch (error) {
    return economyMutationFailure(error);
  }
}
