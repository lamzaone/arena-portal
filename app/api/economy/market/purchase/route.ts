import { purchaseMarketplaceSelection } from "@/lib/economy/market-service";
import {
  EconomyRepositoryError,
  getEconomyCatalogueItem,
  isEconomyProfileTheme,
  isEconomyVipMembership,
} from "@/lib/data/portal-repository";
import {
  economyJsonError,
  economyJsonSuccess,
  economyMutationFailure,
  integerField,
  isEconomyError,
  readEconomyMutation,
} from "@/lib/economy/request";

function optionalFloat(value: unknown): number | undefined | null {
  if (value === undefined || value === null || value === "") return undefined;
  const parsed =
    typeof value === "number"
      ? value
      : typeof value === "string" && value.trim()
        ? Number(value)
        : Number.NaN;
  if (!Number.isFinite(parsed) || parsed < 0 || parsed > 1) return null;
  return Number(parsed.toFixed(6));
}

function optionalStattrak(value: unknown): boolean | null {
  if (value === undefined || value === null) return false;
  return typeof value === "boolean" ? value : null;
}

function optionalSeed(value: unknown): number | undefined | null {
  if (value === undefined) return undefined;
  return typeof value === "number" &&
    Number.isInteger(value) &&
    value >= 0 &&
    value <= 1_000
    ? value
    : null;
}

export async function POST(request: Request) {
  const context = await readEconomyMutation(request);
  if (isEconomyError(context)) return context;
  const catalogueId = integerField(context.body.catalogueId, 1);
  const quantity =
    context.body.quantity === undefined
      ? 1
      : integerField(context.body.quantity, 1, 50);
  const floatValue = optionalFloat(context.body.floatValue);
  const seed = optionalSeed(context.body.seed);
  const expectedUnitPriceTokens =
    context.body.expectedUnitPriceTokens === undefined
      ? undefined
      : integerField(context.body.expectedUnitPriceTokens, 0);
  const stattrak = optionalStattrak(context.body.stattrak);
  if (catalogueId === null)
    return economyJsonError("Choose a valid marketplace item.", 400);
  if (quantity === null)
    return economyJsonError("Choose an amount between 1 and 50.", 400);
  if (floatValue === null)
    return economyJsonError("Choose a float between 0 and 1.", 400);
  if (seed === null)
    return economyJsonError(
      "Choose a whole-number seed between 0 and 1000.",
      400,
    );
  if (stattrak === null)
    return economyJsonError("Choose a valid StatTrak option.", 400);
  if (expectedUnitPriceTokens === null)
    return economyJsonError("Choose a valid displayed unit price.", 400);

  try {
    const catalogue = await getEconomyCatalogueItem(catalogueId);
    const result = await purchaseMarketplaceSelection({
      steamId: context.session.steamId,
      catalogueId,
      quantity,
      stattrak,
      ...(floatValue === undefined ? {} : { floatValue }),
      ...(seed === undefined ? {} : { seed }),
      ...(expectedUnitPriceTokens == null ? {} : { expectedUnitPriceTokens }),
      idempotencyKey: context.body.idempotencyKey,
    });
    return economyJsonSuccess({
      ...result,
      balance: result.wallet.balance,
      message:
        catalogue && isEconomyVipMembership(catalogue)
          ? "Group membership added to your inventory. Activate it whenever you are ready."
          : catalogue && isEconomyProfileTheme(catalogue)
            ? "Profile theme added to your inventory. Equip it from the item details."
            : quantity === 1
              ? "Item purchased and added to your inventory."
              : `${quantity} items purchased and added to your inventory.`,
    });
  } catch (error) {
    if (
      error instanceof EconomyRepositoryError &&
      error.code === "price_changed"
    ) {
      return Response.json(
        {
          ok: false,
          code: "price_changed",
          reloadQuote: true,
          message: error.message,
        },
        { status: 409 },
      );
    }
    return economyMutationFailure(error);
  }
}
