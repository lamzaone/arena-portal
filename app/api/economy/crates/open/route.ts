import { openEconomyCrate } from "@/lib/data/portal-repository";
import { economyJsonError, economyJsonSuccess, economyMutationFailure, isEconomyError, readEconomyMutation, textField } from "@/lib/economy/request";

export async function POST(request: Request) {
  const context = await readEconomyMutation(request);
  if (isEconomyError(context)) return context;
  const crateItemId = textField(context.body.crateItemId, 128);
  if (!crateItemId) return economyJsonError("Choose a valid crate from your inventory.", 400);

  try {
    const result = await openEconomyCrate({ steamId: context.session.steamId, crateItemId, idempotencyKey: context.body.idempotencyKey });
    // The repository returns a server-created reward snapshot alongside its
    // immutable ID, so the browser can reveal the real item without trusting
    // any client-provided cosmetic fields.
    return economyJsonSuccess({ ...result, item: result.reward, message: "Crate opened. Your reward has been added to your inventory." });
  } catch (error) {
    return economyMutationFailure(error);
  }
}
