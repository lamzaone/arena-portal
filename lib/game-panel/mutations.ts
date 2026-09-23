import type * as Repository from "../data/portal-repository";
import type { PanelOperation, PanelArguments } from "./contracts";
import type { PanelMutationContext } from "./storage";
import { PanelApiError } from "./errors";
import { parseTokens } from "./validation";
import { requireOnlinePartner } from "./reads";
import {
  serializeWallet,
  serializeLoadout,
  serializeOpening,
  tokenText,
  safeInteger,
} from "./serialization";

type Dependencies = Pick<
  typeof Repository,
  | "setEconomyInventorySaleLock"
  | "openEconomyCrate"
  | "openEconomyCrates"
  | "equipEconomyItem"
  | "clearEconomyLoadoutSlot"
  | "setEconomyItemNametag"
  | "attachEconomySticker"
  | "attachEconomyCharm"
  | "activateVipMembershipItem"
  | "equipProfileThemeItem"
  | "redeemEconomyCode"
  | "createEconomyTrade"
  | "respondEconomyTrade"
  | "cancelEconomyTrade"
> & {
  purchaseMarketplaceSelection: typeof import("../economy/market-service").purchaseMarketplaceSelection;
  sellInventorySelection: typeof import("../economy/sell-service").sellInventorySelection;
};
export function createPanelMutator(deps: Partial<Dependencies>) {
  const d = new Proxy(deps, {
    get(target, key) {
      return (
        target[key as keyof Dependencies] ??
        (() => {
          throw new Error(`Missing panel mutation dependency: ${String(key)}`);
        })
      );
    },
  }) as Dependencies;
  return {
    async run(
      operation: PanelOperation,
      args: PanelArguments[PanelOperation],
      context: PanelMutationContext,
    ) {
      const common = {
        steamId: context.principal.actorSteamId,
        idempotencyKey: context.economyKey,
      };
      let raw: unknown;
      switch (operation) {
        case "inventory.protect":
          raw = await d.setEconomyInventorySaleLock({
            ...(args as PanelArguments["inventory.protect"]),
            ...common,
          });
          break;
        case "inventory.sell":
          raw = await d.sellInventorySelection({
            ...(args as PanelArguments["inventory.sell"]),
            ...common,
          });
          break;
        case "cases.open":
          raw = await d.openEconomyCrate({
            ...(args as PanelArguments["cases.open"]),
            ...common,
          });
          break;
        case "cases.open-bulk":
          raw = await d.openEconomyCrates({
            ...(args as PanelArguments["cases.open-bulk"]),
            ...common,
          });
          break;
        case "market.purchase": {
          const selection = args as PanelArguments["market.purchase"];
          raw = await d.purchaseMarketplaceSelection({
            ...selection,
            expectedUnitPriceTokens: parseTokens(
              selection.expectedUnitPriceTokens,
            ),
            ...common,
          });
          break;
        }
        case "loadout.equip":
          raw = await d.equipEconomyItem({
            ...(args as PanelArguments["loadout.equip"]),
            ...common,
          });
          break;
        case "loadout.clear":
          raw = await d.clearEconomyLoadoutSlot({
            ...(args as PanelArguments["loadout.clear"]),
            ...common,
          });
          break;
        case "customize.rename":
          raw = await d.setEconomyItemNametag({
            ...(args as PanelArguments["customize.rename"]),
            ...common,
          });
          break;
        case "customize.sticker":
          raw = await d.attachEconomySticker({
            ...(args as PanelArguments["customize.sticker"]),
            ...common,
          });
          break;
        case "customize.charm":
          raw = await d.attachEconomyCharm({
            ...(args as PanelArguments["customize.charm"]),
            ...common,
          });
          break;
        case "benefits.vip-activate":
          raw = await d.activateVipMembershipItem({
            ...(args as PanelArguments["benefits.vip-activate"]),
            ...common,
          });
          break;
        case "benefits.theme-equip":
          raw = await d.equipProfileThemeItem({
            ...(args as PanelArguments["benefits.theme-equip"]),
            ...common,
          });
          break;
        case "benefits.redeem":
          raw = await d.redeemEconomyCode({
            ...(args as PanelArguments["benefits.redeem"]),
            ...common,
            redeemedVia: "server",
          });
          break;
        case "trades.create": {
          const a = args as PanelArguments["trades.create"];
          requireOnlinePartner(
            common.steamId,
            a.counterpartySteamId,
            a.onlineSteamIds,
          );
          raw = await d.createEconomyTrade({
            ...common,
            counterpartySteamId: a.counterpartySteamId,
            offeredItemIds: a.offeredItemIds,
            requestedItemIds: a.requestedItemIds,
            offeredTokens: parseTokens(a.offeredTokens),
            requestedTokens: parseTokens(a.requestedTokens),
          });
          break;
        }
        case "trades.respond": {
          const a = args as PanelArguments["trades.respond"];
          raw = await d.respondEconomyTrade({
            ...common,
            tradeId: a.tradeId,
            decision: a.decision === "decline" ? "reject" : "accept",
          });
          break;
        }
        case "trades.cancel":
          raw = await d.cancelEconomyTrade({
            ...(args as PanelArguments["trades.cancel"]),
            ...common,
          });
          break;
        default:
          throw new PanelApiError(
            400,
            "unknown_operation",
            "Unsupported mutation operation.",
          );
      }
      return restorePanelReceipt(
        operation,
        args,
        raw as Record<string, unknown>,
        context,
      );
    },
  };
}
export async function restorePanelReceipt(
  operation: PanelOperation,
  args: PanelArguments[PanelOperation] | undefined,
  raw: Record<string, unknown> | null,
  context: PanelMutationContext,
): Promise<unknown> {
  if (!raw)
    throw new PanelApiError(
      409,
      "operation_uncertain",
      "The committed receipt is unavailable.",
      true,
    );
  switch (operation) {
    case "inventory.protect":
      return { itemIds: raw.itemIds, saleLocked: raw.saleLocked };
    case "inventory.sell": {
      const result = raw as unknown as Repository.SellEconomyItemsResult;
      const requested =
        (args as PanelArguments["inventory.sell"] | undefined)?.itemIds ??
        raw.requestedItemIds;
      if (!Array.isArray(requested))
        throw new PanelApiError(
          409,
          "operation_uncertain",
          "Replay the original selection to recover this sale.",
          true,
        );
      return {
        itemIds: result.itemIds,
        skippedItemIds: requested.filter((id) => !result.itemIds.includes(id)),
        payoutTokens: tokenText(result.payoutTokens),
        wallet: serializeWallet(result.wallet),
      };
    }
    case "cases.open":
      return {
        openings: [
          serializeOpening(raw as unknown as Repository.OpenEconomyCrateResult),
        ],
        crateItemIds: [raw.crateItemId],
      };
    case "cases.open-bulk": {
      if (Array.isArray(raw.openings))
        return {
          openings: (raw.openings as Repository.OpenEconomyCrateResult[]).map(
            serializeOpening,
          ),
          crateItemIds: raw.crateItemIds,
        };
      const { getPlayerCrateOpeningSnapshots } =
        await import("../data/portal-repository");
      const result = await getPlayerCrateOpeningSnapshots(
        context.principal.actorSteamId,
        raw.crateItemIds as string[],
      );
      if (result.missingCrateItemIds.length)
        throw new PanelApiError(
          409,
          "operation_uncertain",
          "Some committed opening records are unavailable.",
          true,
        );
      return { openings: result.openings, crateItemIds: result.crateItemIds };
    }
    case "market.purchase": {
      const r = raw as unknown as Repository.PurchaseEconomyItemResult;
      return {
        itemIds: r.itemIds,
        quantity: safeInteger(r.quantity),
        unitPriceTokens: tokenText(r.priceTokens),
        totalPriceTokens: tokenText(r.totalPriceTokens),
        wallet: serializeWallet(r.wallet),
      };
    }
    case "loadout.equip":
    case "loadout.clear":
      return {
        ...(operation === "loadout.equip" ? { itemId: raw.itemId } : {}),
        loadout: serializeLoadout(
          (raw.slots ??
            (raw.slot ? [raw.slot] : [])) as Repository.EconomyLoadoutSlot[],
        ),
      };
    case "customize.rename": {
      const r = raw as unknown as Repository.SetEconomyItemNametagResult;
      return {
        itemId: r.itemId,
        nametag: r.nametag,
        priceTokens: tokenText(r.priceTokens),
        wallet: serializeWallet(r.wallet),
      };
    }
    case "customize.sticker":
      return {
        weaponItemId: raw.weaponItemId,
        stickerItemId: raw.stickerItemId,
        slot: safeInteger(raw.slot as number),
      };
    case "customize.charm":
      return {
        weaponItemId: raw.weaponItemId,
        charmItemId: raw.charmItemId,
        charmDefinitionIndex: safeInteger(raw.charmDefinitionIndex as number),
      };
    case "benefits.vip-activate": {
      if (raw.error)
        throw new PanelApiError(
          409,
          "activation_rejected",
          "The VIP activation was rejected.",
        );
      const result: Record<string, unknown> = {};
      for (const key of [
        "itemId",
        "catalogueId",
        "itemGroupId",
        "itemGroupName",
        "groupId",
        "groupKey",
        "groupName",
        "sourceType",
        "durationMinutes",
        "activationKind",
        "previousGroupName",
        "convertedDurationSeconds",
        "conversionSourceSeconds",
        "timeDeductedSeconds",
        "expiresAt",
      ])
        result[key] =
          typeof raw[key] === "number"
            ? safeInteger(raw[key] as number)
            : raw[key];
      return result;
    }
    case "benefits.theme-equip":
      return {
        itemId: raw.itemId,
        catalogueId: safeInteger(raw.catalogueId as number),
        themeId: safeInteger(raw.themeId as number),
        themeKey: raw.themeKey,
        displayName: raw.displayName,
      };
    case "benefits.redeem": {
      const r = raw as unknown as Repository.RedeemEconomyCodeResult;
      return {
        codeId: safeInteger(r.codeId),
        displayName: r.displayName,
        tokensAwarded: tokenText(r.tokensAwarded),
        itemIds: r.itemIds,
        itemNames: r.itemNames,
        wallet: serializeWallet(r.wallet),
      };
    }
    case "trades.create":
      return {
        tradeId: raw.tradeId,
        status: raw.status,
        expiresAt: raw.expiresAt,
      };
    case "trades.respond":
    case "trades.cancel":
      return {
        tradeId: raw.tradeId,
        status: raw.status,
        ...(raw.reason ? { reason: raw.reason } : {}),
      };
    default:
      throw new PanelApiError(
        400,
        "unknown_operation",
        "Unsupported receipt operation.",
      );
  }
}
export async function mutatePanelOperation(
  operation: PanelOperation,
  args: PanelArguments[PanelOperation],
  context: PanelMutationContext,
) {
  const repository = await import("../data/portal-repository");
  const market = await import("../economy/market-service");
  const sales = await import("../economy/sell-service");
  try {
    return await createPanelMutator({ ...repository, ...market, ...sales }).run(
      operation,
      args,
      context,
    );
  } catch (error) {
    if (error instanceof repository.EconomyRepositoryError) {
      const retryable = [
        "operation_in_progress",
        "operation_unavailable",
        "storage_unavailable",
        "activation_pending",
        "activation_manual_review",
        "price_unavailable",
      ].includes(error.code);
      throw new PanelApiError(
        retryable
          ? 503
          : error.code.endsWith("not_found")
            ? 404
            : error.code === "invalid_input"
              ? 400
              : 409,
        error.code,
        error.message,
        retryable,
      );
    }
    throw error;
  }
}
