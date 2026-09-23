import type {
  EconomyInventoryItem,
  EconomyCatalogueItem,
  EconomyLoadoutSlot,
  EconomyTrade,
  TokenWallet,
  OpenEconomyCrateResult,
  TradePartnerInventoryItem,
} from "../data/portal-repository";
import {
  economyItems,
  itemSupportsLoadout,
  itemSupportsNametag,
  itemSupportsStickers,
  itemStickerSlotCount,
  itemSupportsCharm,
  itemIsVipMembership,
  itemCharmDefinitionIndex,
} from "../../components/economy/economy-view-model";
import { loadoutItemSupportsTarget } from "../economy/loadout-selection";

export function safeInteger(value: number): number {
  if (!Number.isSafeInteger(value))
    throw Object.assign(
      new Error("Stored number is outside the supported range."),
      { code: "invalid_database_value" },
    );
  return value;
}
export function tokenText(value: number): string {
  if (value < 0) throw new Error("Negative Token value.");
  return String(safeInteger(value));
}
function text(value: string) {
  if (value.length > 512)
    throw Object.assign(new Error("Stored text exceeds the response bound."), {
      code: "response_too_large",
    });
  return value;
}
function integerOrNull(value: number | null) {
  return value === null ? null : safeInteger(value);
}
export function serializeWallet(wallet: TokenWallet) {
  return {
    balance: tokenText(wallet.balance),
    lifetimeEarned: tokenText(wallet.lifetimeEarned),
    lifetimeSpent: tokenText(wallet.lifetimeSpent),
  };
}
export function serializeItem(item: EconomyInventoryItem) {
  const view = economyItems([item])[0];
  return {
    id: item.id,
    catalogueId: integerOrNull(item.catalogueId),
    itemType: item.itemType,
    displayName: text(view.displayName),
    imageUrl: view.imageUrl,
    rarityRank: safeInteger(item.rarityRank),
    definitionIndex: integerOrNull(item.definitionIndex),
    paintkit: integerOrNull(item.paintkit),
    floatValue: item.floatValue,
    seed: integerOrNull(item.seed),
    stattrak: item.stattrak,
    stattrakCount: safeInteger(item.stattrakCount),
    nametag: item.nametag === null ? null : text(item.nametag),
    state: item.state,
    saleLocked: item.saleLocked,
    tradable: item.tradable,
    equippedSlotKeys: [...item.equippedSlotKeys],
    marketPriceTokens:
      item.marketPriceTokens === null
        ? null
        : tokenText(item.marketPriceTokens),
    sellbackPayoutTokens:
      view.sellbackPayoutTokens === null
        ? null
        : tokenText(view.sellbackPayoutTokens),
    capabilities: {
      equip: itemSupportsLoadout(view),
      equipTargets: !itemSupportsLoadout(view)
        ? []
        : ["music-kit", "music_kit", "musickit"].includes(view.itemType)
          ? ["global" as const]
          : (["T", "CT", "both"] as const).filter((target) =>
              loadoutItemSupportsTarget(view, target),
            ),
      rename: itemSupportsNametag(view),
      stickerSlots: itemSupportsStickers(view) ? itemStickerSlotCount(view) : 0,
      charm: itemSupportsCharm(view),
      open: ["crate", "capsule"].includes(item.itemType),
      vip: itemIsVipMembership(view),
      theme: item.itemType === "profile_theme",
    },
  };
}
export function serializeItemDetail(item: EconomyInventoryItem) {
  const view = economyItems([item])[0];
  const charm = itemCharmDefinitionIndex(view);
  return {
    ...serializeItem(item),
    stickers: item.stickers.map((s) => ({
      slot: safeInteger(s.slot),
      stickerItemId: s.stickerItemId,
      displayName: s.displayName === null ? null : text(s.displayName),
    })),
    charm:
      charm === null
        ? null
        : { definitionIndex: safeInteger(charm), displayName: null },
    minFloat: view.minFloat,
    maxFloat: view.maxFloat,
  };
}
export function serializeProduct(item: EconomyCatalogueItem) {
  return {
    catalogueId: safeInteger(item.id),
    itemType: item.itemType,
    displayName: text(item.displayName),
    imageUrl: item.imageUrl,
    rarityRank: safeInteger(item.rarityRank),
    definitionIndex: integerOrNull(item.definitionIndex),
    paintkit: integerOrNull(item.paintkit),
    minFloat: item.minFloat,
    maxFloat: item.maxFloat,
    priceTokens:
      item.displayPriceTokens === null
        ? null
        : tokenText(item.displayPriceTokens),
    supportsStattrak:
      ["skin", "knife"].includes(item.itemType) &&
      item.metadata.supportsStattrak !== false,
    maximumQuantity: ["crate", "capsule"].includes(item.itemType) ? 50 : 1,
  };
}
export function serializeLoadout(slots: EconomyLoadoutSlot[]) {
  return {
    slots: slots.map((s) => ({
      slot:
        s.slotType === "music_kit"
          ? { slotType: "music_kit" }
          : {
              slotType: s.slotType,
              team: s.team,
              ...(s.slotType === "weapon"
                ? { definitionIndex: integerOrNull(s.definitionIndex) }
                : {}),
            },
      slotKey: s.slotKey,
      itemId: s.itemId,
    })),
  };
}
export function serializeTradePreview(item: TradePartnerInventoryItem) {
  return {
    id: item.id,
    catalogueId: integerOrNull(item.catalogueId),
    itemType: item.itemType,
    displayName: text(item.displayName),
    imageUrl: item.imageUrl,
    rarityRank: safeInteger(item.rarityRank),
    definitionIndex: integerOrNull(item.definitionIndex),
    paintkit: integerOrNull(item.paintkit),
    floatValue: item.floatValue,
    seed: integerOrNull(item.seed),
    stattrak: item.stattrak,
    stattrakCount: safeInteger(item.stattrakCount),
    nametag: item.nametag,
  };
}
export function serializeTrade(trade: EconomyTrade) {
  const side = (value: EconomyTrade["offered"]) => ({
    steamId: value.steamId,
    tokens: tokenText(value.tokens),
    items: value.items.flatMap((i) =>
      i.item ? [serializeTradePreview({ ...i.item, id: i.itemId })] : [],
    ),
  });
  return {
    id: trade.id,
    creatorSteamId: trade.creatorSteamId,
    counterpartySteamId: trade.counterpartySteamId,
    direction: trade.direction,
    status: trade.status,
    offered: side(trade.offered),
    requested: side(trade.requested),
    expiresAt: trade.expiresAt,
    updatedAt: trade.updatedAt,
  };
}
export function serializeOpening(opening: OpenEconomyCrateResult) {
  const reward = opening.reward;
  const view = economyItems([reward])[0];
  return {
    openingId: safeInteger(opening.openingId),
    crateItemId: opening.crateItemId,
    rewardItemId: opening.rewardItemId,
    rewardCatalogueId: safeInteger(opening.rewardCatalogueId),
    rewardLootEntryId: safeInteger(opening.rewardLootEntryId),
    rewardRarityRank: safeInteger(opening.rewardRarityRank),
    globalAnnouncementQueued: opening.globalAnnouncementQueued,
    reward: {
      id: reward.id,
      catalogueId: integerOrNull(reward.catalogueId),
      itemType: reward.itemType,
      displayName: text(reward.displayName),
      imageUrl:
        ("imageUrl" in reward ? reward.imageUrl : view?.imageUrl) ?? null,
      rarityRank: safeInteger(reward.rarityRank),
      definitionIndex: integerOrNull(reward.definitionIndex),
      paintkit: integerOrNull(reward.paintkit),
      floatValue: reward.floatValue,
      seed: integerOrNull(reward.seed),
      stattrak: reward.stattrak,
      stattrakCount: safeInteger(reward.stattrakCount),
      nametag: reward.nametag,
    },
  };
}
