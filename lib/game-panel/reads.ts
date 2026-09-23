import type * as Repository from "../data/portal-repository";
import type {
  PanelPrincipal,
  PanelOperation,
  PanelArguments,
} from "./contracts";
import { PanelApiError } from "./errors";
import {
  serializeWallet,
  serializeItem,
  serializeItemDetail,
  serializeProduct,
  serializeLoadout,
  serializeTrade,
  serializeTradePreview,
} from "./serialization";

type ReadDependencies = Pick<
  typeof Repository,
  | "getTokenWallet"
  | "getPlayerEconomyInventoryItem"
  | "getPlayerEconomyLoadout"
  | "getEconomyCatalogue"
  | "getEconomyCatalogueItem"
  | "isEconomyMarketplacePurchasable"
  | "getEconomyCrateDropPreview"
  | "getPlayerEconomyTrades"
  | "getEconomyTrade"
  | "searchTradePlayers"
  | "getTradePartnerInventory"
  | "getPlayerCrateOpeningSnapshots"
> & {
  requireStorage: () => Promise<void>;
  getPlayerEconomyInventoryPage: typeof import("../economy/player-inventory").getPlayerEconomyInventoryPage;
  quoteMarketplaceSelection: typeof import("../economy/market-service").quoteMarketplaceSelection;
  getOwnedVipActivationQuote: typeof import("../economy/vip-activation-preview").getOwnedVipActivationQuote;
};
export function requireOnlinePartner(
  actor: string,
  partner: string,
  online: string[],
) {
  if (actor === partner)
    throw new PanelApiError(400, "invalid_input", "Choose another player.");
  if (!online.includes(partner))
    throw new PanelApiError(
      409,
      "partner_offline",
      "That player is no longer connected.",
    );
}
function missing(): never {
  throw new PanelApiError(
    404,
    "not_found",
    "That item is no longer available.",
  );
}
export function createPanelReader(deps: Partial<ReadDependencies>) {
  const d = new Proxy(deps, {
    get(target, key) {
      return (
        target[key as keyof ReadDependencies] ??
        (() => {
          throw new Error(`Missing panel read dependency: ${String(key)}`);
        })
      );
    },
  }) as ReadDependencies;
  return {
    async run(
      operation: PanelOperation,
      args: PanelArguments[PanelOperation],
      principal: PanelPrincipal,
    ): Promise<unknown> {
      await d.requireStorage();
      const actor = principal.actorSteamId;
      switch (operation) {
        case "wallet.read":
          return serializeWallet(await d.getTokenWallet(actor));
        case "inventory.read":
        case "cases.read": {
          const filter = args as PanelArguments["inventory.read"];
          const page = await d.getPlayerEconomyInventoryPage(actor, {
            ...filter,
            itemTypes: (operation === "cases.read"
              ? ["crate", "capsule"]
              : filter.itemTypes) as Repository.EconomyItemType[],
            sort: filter.sort as Repository.EconomyInventoryFilter["sort"],
          });
          return { ...page, items: page.items.map(serializeItem) };
        }
        case "inventory.detail": {
          const item = await d.getPlayerEconomyInventoryItem(
            actor,
            (args as PanelArguments["inventory.detail"]).itemId,
          );
          if (!item || item.ownerSteamId !== actor) return missing();
          return serializeItemDetail(item);
        }
        case "market.read": {
          const filter = args as PanelArguments["market.read"];
          const page = await d.getEconomyCatalogue({
            ...filter,
            itemTypes: filter.itemTypes as Repository.EconomyItemType[],
            sort: filter.sort as Repository.EconomyCatalogueFilter["sort"],
            marketOnly: true,
            includeDisabled: false,
          });
          return { ...page, items: page.items.map(serializeProduct) };
        }
        case "market.detail": {
          const item = await d.getEconomyCatalogueItem(
            (args as PanelArguments["market.detail"]).catalogueId,
          );
          if (!item || !d.isEconomyMarketplacePurchasable(item))
            return missing();
          return serializeProduct(item);
        }
        case "market.quote":
          return d.quoteMarketplaceSelection({
            ...(args as PanelArguments["market.quote"]),
            steamId: actor,
          });
        case "loadout.read":
          return serializeLoadout(await d.getPlayerEconomyLoadout(actor));
        case "cases.drops": {
          const {
            catalogueId,
            page = 1,
            pageSize = 24,
          } = args as PanelArguments["cases.drops"];
          const result = await d.getEconomyCrateDropPreview(catalogueId);
          if (!result) return missing();
          return {
            items: result.drops
              .slice((page - 1) * pageSize, page * pageSize)
              .map((drop) => ({
                lootEntryId: drop.lootEntryId,
                product: serializeProduct(drop.catalogue),
                weight: drop.weight,
                minFloat: drop.minFloat,
                maxFloat: drop.maxFloat,
                stattrakChanceBps: drop.stattrakChanceBps,
              })),
            total: result.drops.length,
            page,
            pageSize,
            totalWeight: result.totalWeight,
          };
        }
        case "cases.reconcile":
          return d.getPlayerCrateOpeningSnapshots(
            actor,
            (args as PanelArguments["cases.reconcile"]).crateItemIds,
          );
        case "benefits.vip-quote":
          return d.getOwnedVipActivationQuote({
            steamId: actor,
            itemId: (args as PanelArguments["benefits.vip-quote"]).itemId,
          });
        case "trades.partners": {
          const { query, onlineSteamIds } =
            args as PanelArguments["trades.partners"];
          const players = await d.searchTradePlayers({
            query,
            excludeSteamId: actor,
            limit: 8,
            onlineSteamIds,
          });
          return {
            players: players
              .filter(
                (p) =>
                  p.steamId !== actor && onlineSteamIds.includes(p.steamId),
              )
              .map((p) => ({
                steamId: p.steamId,
                displayName: p.displayName,
                inventoryVisibility: p.inventoryVisibility,
              })),
          };
        }
        case "trades.inventory": {
          const {
            partnerSteamId,
            onlineSteamIds,
            query,
            page = 1,
            pageSize = 24,
          } = args as PanelArguments["trades.inventory"];
          requireOnlinePartner(actor, partnerSteamId, onlineSteamIds);
          const result = await d.getTradePartnerInventory(
            actor,
            partnerSteamId,
            { query, page, pageSize },
          );
          return result.visibility !== "public"
            ? {
                visibility: "private",
                items: [],
                page: result.page,
                pageSize: result.pageSize,
              }
            : {
                visibility: "public",
                items: result.items.map(serializeTradePreview),
                total: result.total,
                page: result.page,
                pageSize: result.pageSize,
              };
        }
        case "trades.read": {
          const page = await d.getPlayerEconomyTrades(
            actor,
            args as PanelArguments["trades.read"],
          );
          return {
            items: page.trades.map(serializeTrade),
            total: page.total,
            page: page.page,
            pageSize: page.pageSize,
          };
        }
        case "trades.detail": {
          const trade = await d.getEconomyTrade(
            (args as PanelArguments["trades.detail"]).tradeId,
            actor,
          );
          if (!trade) return missing();
          return serializeTrade(trade);
        }
        default:
          throw new PanelApiError(
            400,
            "unknown_operation",
            "Unsupported read operation.",
          );
      }
    },
  };
}
export async function readPanelOperation(
  operation: PanelOperation,
  args: PanelArguments[PanelOperation],
  principal: PanelPrincipal,
) {
  const repository = await import("../data/portal-repository");
  const inventory = await import("../economy/player-inventory");
  const market = await import("../economy/market-service");
  const vip = await import("../economy/vip-activation-preview");
  return createPanelReader({
    ...repository,
    getEconomyCatalogue: repository.getMarketplaceCatalogue,
    ...inventory,
    ...market,
    ...vip,
    requireStorage: async () => {
      const { getPortalDatabasePool } = await import("../data/database-pools");
      const pool = getPortalDatabasePool();
      if (!pool)
        throw new PanelApiError(
          503,
          "storage_unavailable",
          "Portal storage is unavailable.",
          true,
        );
      await pool.query("SELECT 1");
    },
  }).run(operation, args, principal);
}
