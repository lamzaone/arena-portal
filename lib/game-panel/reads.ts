import type * as Repository from "../data/portal-repository";
import type {
  PanelPrincipal,
  PanelOperation,
  PanelArguments,
} from "./contracts";
import { PanelApiError } from "./errors";
import { recordPanelTiming } from "./timing";
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
  | "getEconomyCatalogueItem"
  | "isEconomyMarketplacePurchasable"
  | "getEconomyCrateDropPreview"
  | "getPlayerEconomyTrades"
  | "getEconomyTrade"
  | "getEconomyPlayerDisplayNames"
  | "searchTradePlayers"
  | "getTradePartnerInventory"
  | "getPlayerCrateOpeningSnapshots"
> & {
  getMarketplaceCatalogue: typeof Repository.getMarketplaceCatalogue;
  getPlayerEconomyInventoryPage: typeof import("../economy/player-inventory").getPlayerEconomyInventoryPage;
  quoteMarketplaceSelection: typeof import("../economy/market-service").quoteMarketplaceSelection;
  quoteInventorySaleSelection: typeof import("../economy/sell-service").quoteInventorySaleSelection;
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
      const actor = principal.actorSteamId;
      switch (operation) {
        case "wallet.read":
          return serializeWallet(await d.getTokenWallet(actor));
        case "inventory.read":
        case "cases.read": {
          const filter = args as PanelArguments["inventory.read"];
          const { includeWallet, ...listingFilter } = filter;
          const [page, wallet] = await Promise.all([d.getPlayerEconomyInventoryPage(actor, {
            ...listingFilter,
            itemTypes: (operation === "cases.read"
              ? ["crate", "capsule"]
              : listingFilter.itemTypes) as Repository.EconomyItemType[],
            sort: listingFilter.sort as Repository.EconomyInventoryFilter["sort"],
          }, (phase, durationMs) => recordPanelTiming(operation, phase, durationMs), { quotePrices: false }),
          includeWallet ? d.getTokenWallet(actor) : Promise.resolve(null)]);
          return { ...page, items: page.items.map(serializeItem), ...(wallet ? { wallet: serializeWallet(wallet) } : {}) };
        }
        case "inventory.detail": {
          const item = await d.getPlayerEconomyInventoryItem(
            actor,
            (args as PanelArguments["inventory.detail"]).itemId,
          );
          if (!item || item.ownerSteamId !== actor) return missing();
          const { nativeInspectCommand } = await import("./native-inspect");
          return { ...serializeItemDetail(item), inspectCommand: nativeInspectCommand({
            ...item,
            raw: { attributes: item.attributes, catalogue: item.catalogue, stickers: item.stickers },
          }) };
        }
        case "inventory.sell-quote": {
          const quote = await d.quoteInventorySaleSelection({ steamId: actor, ...(args as PanelArguments["inventory.sell-quote"]) });
          return { payoutTokens: String(quote.payoutTokens), skippedItemIds: quote.skippedItemIds, quotedAt: quote.quotedAt };
        }
        case "market.read": {
          const filter = args as PanelArguments["market.read"];
          const { includeWallet, ...listingFilter } = filter;
          const [page, wallet] = await Promise.all([d.getMarketplaceCatalogue({
            ...listingFilter,
            itemTypes: listingFilter.itemTypes as Repository.EconomyItemType[],
            sort: listingFilter.sort as Repository.EconomyCatalogueFilter["sort"],
            marketOnly: true,
            includeDisabled: false,
          }, (phase, durationMs) => recordPanelTiming("market.read", phase, durationMs)),
          includeWallet ? d.getTokenWallet(actor) : Promise.resolve(null)]);
          return { ...page, items: page.items.map(serializeProduct), ...(wallet ? { wallet: serializeWallet(wallet) } : {}) };
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
          const native = result.visibility === "public" ? await import("./native-inspect") : null;
          return result.visibility !== "public"
            ? {
                visibility: "private",
                items: [],
                page: result.page,
                pageSize: result.pageSize,
              }
            : {
                visibility: "public",
                items: result.items.map(item => ({ ...serializeTradePreview(item),
                  inspectCommand: native!.nativeInspectCommand({ ...item, raw: item }) })),
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
          const names = page.trades.length ? await d.getEconomyPlayerDisplayNames(
            page.trades.map((trade) => trade.creatorSteamId === actor
              ? trade.counterpartySteamId : trade.creatorSteamId),
          ) : new Map<string, string>();
          return {
            items: page.trades.map((trade) => serializeTrade(trade,
              names.get(trade.creatorSteamId === actor ? trade.counterpartySteamId : trade.creatorSteamId)
                ?? "Player")),
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
          const partnerSteamId = trade.creatorSteamId === actor
            ? trade.counterpartySteamId : trade.creatorSteamId;
          const names = await d.getEconomyPlayerDisplayNames([partnerSteamId]);
          const { nativeInspectCommand } = await import("./native-inspect");
          return serializeTrade(trade, names.get(partnerSteamId) ?? "Player", item =>
            nativeInspectCommand({ ...item, raw: item }));
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
export function requiredPanelReadModule(operation: PanelOperation): "inventory" | "market" | "vip" | "sale" | null {
  if (operation === "inventory.read" || operation === "cases.read") return "inventory";
  if (operation === "market.quote") return "market";
  if (operation === "inventory.sell-quote") return "sale";
  if (operation === "benefits.vip-quote") return "vip";
  return null;
}

export async function readPanelOperation(
  operation: PanelOperation,
  args: PanelArguments[PanelOperation],
  principal: PanelPrincipal,
) {
  const repository = await import("../data/portal-repository");
  switch (requiredPanelReadModule(operation)) {
    case "inventory":
      return createPanelReader({ ...repository, ...await import("../economy/player-inventory") }).run(operation, args, principal);
    case "market":
      return createPanelReader({ ...repository, ...await import("../economy/market-service") }).run(operation, args, principal);
    case "sale":
      return createPanelReader({ ...repository, ...await import("../economy/sell-service") }).run(operation, args, principal);
    case "vip":
      return createPanelReader({ ...repository, ...await import("../economy/vip-activation-preview") }).run(operation, args, principal);
    default:
      return createPanelReader(repository).run(operation, args, principal);
  }
}
