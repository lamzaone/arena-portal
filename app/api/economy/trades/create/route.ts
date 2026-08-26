import { createEconomyTrade } from "@/lib/data/portal-repository";
import { economyJsonError, economyJsonSuccess, economyMutationFailure, integerField, isEconomyError, readEconomyMutation, stringArrayField, textField } from "@/lib/economy/request";

function steamIdField(value: unknown) {
  const steamId = textField(value, 17);
  return steamId && /^7656119\d{10}$/.test(steamId) ? steamId : null;
}

export async function POST(request: Request) {
  const context = await readEconomyMutation(request);
  if (isEconomyError(context)) return context;
  const counterpartySteamId = steamIdField(context.body.counterpartySteamId);
  const offeredItemIds = context.body.offeredItemIds === undefined ? [] : stringArrayField(context.body.offeredItemIds, 12);
  const requestedItemIds = context.body.requestedItemIds === undefined ? [] : stringArrayField(context.body.requestedItemIds, 12);
  const offeredTokens = integerField(context.body.offeredTokens, 0);
  const requestedTokens = integerField(context.body.requestedTokens, 0);
  if (!counterpartySteamId || offeredItemIds === null || requestedItemIds === null || offeredTokens === null || requestedTokens === null) {
    return economyJsonError("The trade offer contains invalid player, item, or Token values.", 400);
  }
  if (counterpartySteamId === context.session.steamId) return economyJsonError("You cannot create a trade offer with yourself.", 400);
  if (!offeredItemIds.length && !offeredTokens && !requestedItemIds.length && !requestedTokens) return economyJsonError("Offer or request at least one item or some Tokens.", 400);

  try {
    const result = await createEconomyTrade({
      steamId: context.session.steamId,
      counterpartySteamId,
      offeredItemIds: offeredItemIds.length ? offeredItemIds : undefined,
      requestedItemIds: requestedItemIds.length ? requestedItemIds : undefined,
      offeredTokens,
      requestedTokens,
      idempotencyKey: context.body.idempotencyKey
    });
    return economyJsonSuccess({ ...result, message: "Trade offer sent. Your offered items and Tokens are reserved until it is resolved." }, 201);
  } catch (error) {
    return economyMutationFailure(error);
  }
}
