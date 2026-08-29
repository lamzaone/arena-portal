import { openEconomyCrate, openEconomyCrates } from "@/lib/data/portal-repository";
import { economyJsonError, economyJsonSuccess, economyMutationFailure, isEconomyError, readEconomyMutation, stringArrayField, textField } from "@/lib/economy/request";

export async function POST(request: Request) {
  const context = await readEconomyMutation(request);
  if (isEconomyError(context)) return context;
  if (context.body.crateItemIds !== undefined) {
    const crateItemIds = stringArrayField(context.body.crateItemIds, 10);
    if (!crateItemIds?.length)
      return economyJsonError("Choose between 1 and 10 crates to open.", 400);
    try {
      const result = await openEconomyCrates({
        steamId: context.session.steamId,
        crateItemIds,
        idempotencyKey: context.body.idempotencyKey,
      });
      return economyJsonSuccess({
        ...result,
        openings: result.openings.map((opening) => ({
          ...opening,
          item: opening.reward,
          message: opening.globalAnnouncementQueued
            ? "Crate opened. Your reward was queued for a global announcement."
            : "Crate opened. Your reward has been added to your inventory.",
        })),
        message: `${result.openings.length} ${result.openings.length === 1 ? "crate" : "crates"} opened. Every reward has been added to your inventory.`,
      });
    } catch (error) {
      return economyMutationFailure(error);
    }
  }
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
