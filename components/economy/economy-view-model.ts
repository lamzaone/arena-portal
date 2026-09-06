import {
  economyRarityName as taxonomyRarityName,
  economyRarityRankClass,
} from "@/lib/economy/item-taxonomy";
import { economyItemDisplayName } from "@/lib/economy/item-display-name";
import { resolveEconomySellback } from "@/lib/economy/sellback";
import { tradeWeaponPreviewFields } from "@/lib/economy/trade-preview";

export type EconomyItemView = {
  id: string;
  catalogueId: number | null;
  itemType: string;
  displayName: string;
  description: string | null;
  rarity: string;
  rarityRank: number;
  tradable: boolean;
  saleLocked: boolean;
  marketHashName: string | null;
  marketPriceTokens: number | null;
  sellbackStatus: "resolved" | "unpriced" | "rejected";
  sellbackBasisTokens: number | null;
  recordedPurchasePriceTokens: number | null;
  sellbackPayoutTokens: number | null;
  sellbackPayoutCappedAtRecordedPurchasePrice: boolean;
  marketBasePriceTokens: number | null;
  marketPriceEuroCents: number | null;
  marketBasePriceEuroCents: number | null;
  marketPriceSource: string | null;
  marketDiscount: {
    ruleId: number;
    displayName: string;
    discountTokens: number;
  } | null;
  marketPriceFloatValue: number | null;
  marketPriceWear: string | null;
  marketPriceFloatDiscountBps: number | null;
  cratePriceTokens: number | null;
  imageUrl: string | null;
  definitionIndex: number | null;
  paintkit: number | null;
  minFloat: number | null;
  maxFloat: number | null;
  floatValue: number | null;
  seed: number | null;
  stattrak: boolean;
  stattrakCount: number;
  nametag: string | null;
  state: string;
  equippedSlots: string[];
  stickers: Array<{ slot: number; itemId: string; displayName: string }>;
  raw: Record<string, unknown>;
};

export type EconomyWalletView = {
  balance: number;
  earned: number | null;
  spent: number | null;
};

export type EconomyLoadoutView = {
  slot: string;
  itemId: string;
};

export type EconomyCrateView = EconomyItemView & {
  code: string | null;
  priceTokens: number | null;
  possibleItems: number | null;
};

export type EconomyTradeItemView = {
  id: string;
  catalogueId: number | null;
  itemType: string;
  displayName: string;
  rarity: string;
  rarityRank: number;
  tradable: boolean;
  imageUrl: string | null;
  definitionIndex: number | null;
  paintkit: number | null;
  seed: number | null;
  raw: Record<string, unknown>;
  floatValue: number | null;
  stattrak: boolean;
  stattrakCount: number;
  nametag: string | null;
};

export type EconomyTradeView = {
  id: string;
  status: string;
  counterpartySteamId: string;
  direction: "incoming" | "outgoing" | "unknown";
  offeredTokens: number;
  requestedTokens: number;
  offeredItems: EconomyTradeItemView[];
  requestedItems: EconomyTradeItemView[];
  createdAt: string | null;
};

type UnknownRecord = Record<string, unknown>;

function isRecord(value: unknown): value is UnknownRecord {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function asArray(value: unknown): unknown[] {
  return Array.isArray(value) ? value : [];
}

function firstDefined(record: UnknownRecord, keys: string[]) {
  for (const key of keys) {
    const value = record[key];
    if (value !== undefined && value !== null) return value;
  }
  return undefined;
}

function text(value: unknown, fallback = "") {
  if (typeof value === "string") return value.trim() || fallback;
  if (typeof value === "number" || typeof value === "bigint")
    return String(value);
  return fallback;
}

function number(value: unknown, fallback: number | null = null) {
  const parsed =
    typeof value === "number"
      ? value
      : typeof value === "string" && value.trim()
        ? Number(value)
        : Number.NaN;
  return Number.isFinite(parsed) ? parsed : fallback;
}

function float(value: unknown, fallback: number | null = null) {
  const parsed = number(value, fallback);
  return parsed !== null && parsed >= 0 && parsed <= 1 ? parsed : fallback;
}

function integer(value: unknown, fallback: number | null = null) {
  const parsed = number(value, fallback);
  return parsed !== null && Number.isSafeInteger(parsed) ? parsed : fallback;
}

function bool(value: unknown) {
  return value === true || value === 1 || value === "1" || value === "true";
}

function authoritativeCrateRarity(
  attributes: UnknownRecord,
  fallback: number,
) {
  // A container entry stores the actual tier it rolled at. This is more
  // reliable than legacy catalogue ranks for cache-era finishes, and keeps
  // inventory and trade cards aligned with crate odds. Knives and gloves
  // retain their special-pool probability, but are presented as Covert.
  if (bool(attributes.rareSpecial)) return 6;
  switch (integer(attributes.rarityChanceBps)) {
    case 7_992:
      return 3;
    case 1_598:
      return 4;
    case 320:
      return 5;
    case 64:
      return 6;
    case 26:
      return 6;
    default:
      return fallback;
  }
}

function isGoldTierContraband(displayName: string) {
  return /\bm4a4\s*\|\s*howl\b/iu.test(displayName);
}

function presentationRarity(
  itemType: string,
  displayName: string,
  rarityRank: number,
) {
  if (itemType === "knife" || itemType === "glove") return 6;
  if (isGoldTierContraband(displayName)) return 7;
  return rarityRank;
}

function stringArray(value: unknown) {
  return asArray(value)
    .map((entry) => text(entry))
    .filter(Boolean);
}

function itemArray(value: unknown, keys: string[]) {
  if (Array.isArray(value)) return value;
  if (!isRecord(value)) return [];
  for (const key of keys) {
    const candidate = value[key];
    if (Array.isArray(candidate)) return candidate;
  }
  return [];
}

function normalizeSticker(value: unknown, index: number) {
  const record = isRecord(value) ? value : {};
  return {
    slot:
      integer(firstDefined(record, ["slot", "position", "index"]), index) ??
      index,
    itemId: text(firstDefined(record, ["itemId", "stickerItemId", "id"])),
    displayName: text(
      firstDefined(record, ["displayName", "name", "title"]),
      "Sticker",
    ),
  };
}

function normalizeEquippedSlots(record: UnknownRecord) {
  const slots = stringArray(
    firstDefined(record, ["equippedSlots", "equippedSlotKeys", "slots"]),
  );
  const explicitSlot = text(firstDefined(record, ["equippedSlot", "slot"]));
  const nestedLoadout = isRecord(record.loadout) ? record.loadout : null;
  const nestedSlots = nestedLoadout
    ? stringArray(firstDefined(nestedLoadout, ["slots", "equippedSlots"]))
    : [];
  return [
    ...new Set([
      ...slots,
      ...nestedSlots,
      ...(explicitSlot ? [explicitSlot] : []),
    ]),
  ];
}

export function economyItems(value: unknown) {
  return itemArray(value, ["items", "inventory", "catalogue", "entries"]).map(
    toEconomyItem,
  );
}

export function economyCatalogueItems(value: unknown) {
  return itemArray(value, ["items", "catalogue", "entries", "marketItems"]).map(
    toEconomyItem,
  );
}

export function economyCrates(value: unknown): EconomyCrateView[] {
  return itemArray(value, ["crates", "items", "entries"]).map((entry) => {
    const item = toEconomyItem(entry);
    const record = isRecord(entry) ? entry : {};
    return {
      ...item,
      code:
        text(
          firstDefined(record, ["code", "crateCode", "lootTableCode"]),
          "",
        ) || null,
      priceTokens: number(
        firstDefined(record, [
          "priceTokens",
          "cratePriceTokens",
          "directPurchasePriceTokens",
          "displayPriceTokens",
          "marketPriceTokens",
          "price",
        ]),
        item.cratePriceTokens ?? item.marketPriceTokens,
      ),
      possibleItems: integer(
        firstDefined(record, ["possibleItems", "itemCount", "contentsCount"]),
      ),
    };
  });
}

export function toEconomyItem(value: unknown): EconomyItemView {
  const record = isRecord(value) ? value : {};
  const catalogue = isRecord(record.catalogue) ? record.catalogue : {};
  const metadata = isRecord(record.metadata)
    ? record.metadata
    : isRecord(catalogue.metadata)
      ? catalogue.metadata
      : {};
  const attributes = isRecord(record.attributes) ? record.attributes : {};
  const itemType = text(
    firstDefined(record, ["itemType", "type", "category"]),
    text(firstDefined(catalogue, ["itemType", "type", "category"]), "item"),
  ).toLowerCase();
  const id = text(firstDefined(record, ["id", "itemId", "inventoryItemId"]));
  // Inventory instance IDs are UUIDs, so do not let one mask the catalogue
  // ID nested under `catalogue`. The latter is needed for the official-art
  // fallback used by inventory, crate, and trade previews.
  const catalogueId =
    integer(firstDefined(record, ["catalogueId", "catalogId"])) ??
    integer(firstDefined(catalogue, ["id", "catalogueId", "catalogId"])) ??
    integer(firstDefined(record, ["id"]));
  const baseDisplayName = text(
    firstDefined(record, ["displayName", "name", "title"]),
    text(
      firstDefined(catalogue, ["displayName", "name", "title"]),
      text(
        firstDefined(attributes, ["displayName", "customDisplayName"]),
        id || "Unnamed item",
      ),
    ),
  );
  const stattrak = bool(firstDefined(record, ["stattrak", "statTrak"]));
  const displayName = economyItemDisplayName(baseDisplayName, stattrak);
  const stickersValue = firstDefined(record, ["stickers", "attachedStickers"]);
  const storedRarityRank =
    integer(
      firstDefined(record, ["rarityRank", "rarityLevel"]),
      integer(firstDefined(catalogue, ["rarityRank", "rarityLevel"]), 0),
    ) ?? 0;
  // Knives and gloves are Covert in this economy. M4A4 | Howl remains the
  // single Contraband/Extraordinary exception. Crate previews also place
  // per-entry attributes in metadata for the remaining item types.
  const rarityRank =
    presentationRarity(
      itemType,
      displayName,
      authoritativeCrateRarity({ ...metadata, ...attributes }, storedRarityRank),
    );
  const nestedPrice = isRecord(record.price)
    ? record.price
    : isRecord(catalogue.price)
      ? catalogue.price
      : {};
  const appliedDiscount = isRecord(record.appliedDiscount)
    ? record.appliedDiscount
    : isRecord(catalogue.appliedDiscount)
      ? catalogue.appliedDiscount
      : null;
  const discountRuleId = integer(appliedDiscount?.ruleId);
  const discountTokens = integer(appliedDiscount?.discountTokens);
  const discountName = text(appliedDiscount?.displayName, "");
  const tradableValue = firstDefined(record, ["tradable", "isTradable"]);
  const marketPriceTokens = number(
    firstDefined(record, [
      "displayPriceTokens",
      "directPurchasePriceTokens",
      "marketPriceTokens",
      "priceTokens",
      "tokenPrice",
    ]),
    number(firstDefined(nestedPrice, ["tokenPrice", "priceTokens"])),
  );
  const source = isRecord(record.source) ? record.source : {};
  const sellback = resolveEconomySellback({ marketPriceTokens, source });

  return {
    id,
    catalogueId,
    itemType,
    displayName,
    description:
      text(
        firstDefined(record, ["description", "details"]),
        text(firstDefined(metadata, ["description", "details"]), ""),
      ) || null,
    // The legacy catalogue stores the game rarity ID. Present one stable,
    // player-facing CS rarity name everywhere rather than leaking inconsistent
    // source labels such as "mythical" or "ancient" into the UI.
    rarity: rarityName(rarityRank),
    rarityRank,
    tradable: tradableValue === undefined ? true : bool(tradableValue),
    saleLocked: bool(firstDefined(record, ["saleLocked", "sale_locked"])),
    marketHashName:
      text(
        firstDefined(record, ["marketHashName", "market_hash_name"]),
        text(
          firstDefined(catalogue, ["marketHashName", "market_hash_name"]),
          "",
        ),
      ) || null,
    marketPriceTokens,
    sellbackStatus: sellback.status,
    sellbackBasisTokens:
      sellback.status === "resolved" ? sellback.sellbackBasisTokens : null,
    recordedPurchasePriceTokens:
      sellback.status === "resolved"
        ? sellback.recordedPurchasePriceTokens
        : null,
    sellbackPayoutTokens:
      sellback.status === "resolved" ? sellback.payoutTokens : null,
    sellbackPayoutCappedAtRecordedPurchasePrice:
      sellback.status === "resolved" &&
      sellback.payoutCappedAtRecordedPurchasePrice,
    marketBasePriceTokens: number(
      firstDefined(record, ["displayBasePriceTokens", "basePriceTokens"]),
      number(
        firstDefined(catalogue, [
          "displayBasePriceTokens",
          "basePriceTokens",
        ]),
        number(firstDefined(nestedPrice, ["tokenPrice", "priceTokens"])),
      ),
    ),
    marketPriceEuroCents: number(
      firstDefined(record, [
        "displayPriceEuroCents",
        "marketPriceEuroCents",
        "market_price_eur_cents",
      ]),
      number(
        firstDefined(nestedPrice, [
          "euroCents",
          "marketPriceEuroCents",
          "market_price_eur_cents",
        ]),
      ),
    ),
    marketBasePriceEuroCents: number(
      firstDefined(record, [
        "displayBasePriceEuroCents",
        "basePriceEuroCents",
      ]),
      number(
        firstDefined(catalogue, [
          "displayBasePriceEuroCents",
          "basePriceEuroCents",
        ]),
        number(firstDefined(nestedPrice, ["euroCents"])),
      ),
    ),
    marketPriceSource:
      text(
        firstDefined(record, ["displayPriceSource", "marketPriceSource"]),
        text(firstDefined(nestedPrice, ["source", "priceSource"]), ""),
      ) || null,
    marketDiscount:
      discountRuleId !== null &&
      discountTokens !== null &&
      discountTokens > 0 &&
      discountName
        ? { ruleId: discountRuleId, displayName: discountName, discountTokens }
        : null,
    marketPriceFloatValue: float(
      firstDefined(record, [
        "displayPriceFloatValue",
        "marketPriceFloatValue",
      ]),
    ),
    marketPriceWear:
      text(
        firstDefined(record, ["displayPriceWear", "marketPriceWear"]),
      ) || null,
    marketPriceFloatDiscountBps: integer(
      firstDefined(record, [
        "displayPriceFloatDiscountBps",
        "marketPriceFloatDiscountBps",
      ]),
    ),
    cratePriceTokens: number(
      firstDefined(record, [
        "cratePriceTokens",
        "casePriceTokens",
        "openPriceTokens",
      ]),
    ),
    imageUrl:
      text(
        firstDefined(record, [
          "imageUrl",
          "image_url",
          "image",
          "iconUrl",
          "icon_url",
          "steamImageUrl",
          "steam_image_url",
          "previewUrl",
        ]),
        text(
          // A historical unbox retains the exact official entry art in its
          // attributes. Prefer it to an older cache thumbnail on catalogue
          // rows so inventory and trade cards render the same item as crates.
          firstDefined(attributes, [
            "imageUrl",
            "image_url",
            "image",
            "iconUrl",
            "icon_url",
            "steamImageUrl",
            "steam_image_url",
          ]),
          text(
            firstDefined(metadata, [
              "imageUrl",
              "image_url",
              "image",
              "iconUrl",
              "icon_url",
              "steamImageUrl",
              "steam_image_url",
              "previewUrl",
            ]),
            text(
              firstDefined(catalogue, [
                "imageUrl",
                "image_url",
                "image",
                "iconUrl",
                "icon_url",
                "steamImageUrl",
                "steam_image_url",
                "previewUrl",
              ]),
              "",
            ),
          ),
        ),
      ) || null,
    definitionIndex: integer(
      firstDefined(record, ["definitionIndex", "weaponDefindex"]),
    ),
    paintkit: integer(firstDefined(record, ["paintkit", "paintKit"])),
    minFloat: float(
      firstDefined(record, ["minFloat", "floatMin", "wearMin"]),
      float(firstDefined(metadata, ["minFloat", "floatMin", "wearMin"])),
    ),
    maxFloat: float(
      firstDefined(record, ["maxFloat", "floatMax", "wearMax"]),
      float(firstDefined(metadata, ["maxFloat", "floatMax", "wearMax"])),
    ),
    floatValue: float(firstDefined(record, ["floatValue", "float", "wear"])),
    seed: integer(firstDefined(record, ["seed", "patternSeed"])),
    stattrak,
    stattrakCount:
      integer(firstDefined(record, ["stattrakCount", "statTrakCount"]), 0) ?? 0,
    nametag: text(firstDefined(record, ["nametag", "nameTag"]), "") || null,
    state: text(
      firstDefined(record, ["state", "status"]),
      "available",
    ).toLowerCase(),
    equippedSlots: normalizeEquippedSlots(record),
    stickers: asArray(stickersValue)
      .map(normalizeSticker)
      .filter((sticker) => Boolean(sticker.itemId)),
    raw: record,
  };
}

export function economyWallet(value: unknown): EconomyWalletView {
  const record = isRecord(value) ? value : {};
  return {
    balance:
      integer(firstDefined(record, ["balance", "tokens", "tokenBalance"]), 0) ??
      0,
    earned: integer(
      firstDefined(record, [
        "earned",
        "totalEarned",
        "tokensEarned",
        "lifetimeEarned",
      ]),
    ),
    spent: integer(
      firstDefined(record, [
        "spent",
        "totalSpent",
        "tokensSpent",
        "lifetimeSpent",
      ]),
    ),
  };
}

export function economyLoadout(value: unknown): EconomyLoadoutView[] {
  return itemArray(value, ["slots", "loadout", "items", "entries"]).flatMap(
    (entry) => {
      const record = isRecord(entry) ? entry : {};
      const slot = text(
        firstDefined(record, ["slot", "slotKey", "slotName", "loadoutSlot"]),
      );
      const itemId = text(
        firstDefined(record, ["itemId", "inventoryItemId", "id"]),
      );
      return slot && itemId ? [{ slot, itemId }] : [];
    },
  );
}

function tradeItems(value: unknown): EconomyTradeItemView[] {
  return itemArray(value, ["items", "offeredItems", "requestedItems"]).map(
    (entry) => {
      const record = isRecord(entry) ? entry : {};
      const item = toEconomyItem(record.item ?? entry);
      const visual = tradeWeaponPreviewFields(record.item ?? entry);
      return {
        id: text(firstDefined(record, ["itemId", "id"]), item.id),
        catalogueId: item.catalogueId,
        itemType: item.itemType,
        displayName: item.displayName,
        rarity: item.rarity,
        rarityRank: item.rarityRank,
        tradable: item.tradable,
        imageUrl: item.imageUrl,
        definitionIndex: visual.definitionIndex,
        paintkit: visual.paintkit,
        seed: visual.seed,
        raw: { attributes: visual.attributes, stickers: visual.stickers },
        floatValue: item.floatValue,
        stattrak: item.stattrak,
        stattrakCount: item.stattrakCount,
        nametag: item.nametag,
      };
    },
  );
}

export function economyTrades(value: unknown): EconomyTradeView[] {
  return itemArray(value, ["trades", "items", "entries"]).flatMap((entry) => {
    const record = isRecord(entry) ? entry : {};
    const id = text(firstDefined(record, ["id", "tradeId"]));
    if (!id) return [];
    const directionValue = text(
      firstDefined(record, ["direction", "tradeDirection"]),
    ).toLowerCase();
    const direction =
      directionValue === "incoming" || directionValue === "outgoing"
        ? directionValue
        : "unknown";
    return [
      {
        id,
        status: text(firstDefined(record, ["status", "state"]), "pending"),
        counterpartySteamId: text(
          firstDefined(record, [
            "counterpartySteamId",
            "otherSteamId",
            "targetSteamId",
            "ownerSteamId",
          ]),
          "Unknown player",
        ),
        direction,
        offeredTokens:
          integer(
            firstDefined(record, ["offeredTokens", "offerTokens"]),
            isRecord(record.offered) ? integer(record.offered.tokens, 0) : 0,
          ) ?? 0,
        requestedTokens:
          integer(
            firstDefined(record, ["requestedTokens", "requestTokens"]),
            isRecord(record.requested)
              ? integer(record.requested.tokens, 0)
              : 0,
          ) ?? 0,
        offeredItems: tradeItems(
          firstDefined(record, ["offeredItems", "offerItems"]) ??
            (isRecord(record.offered) ? record.offered.items : undefined),
        ),
        requestedItems: tradeItems(
          firstDefined(record, ["requestedItems", "requestItems"]) ??
            (isRecord(record.requested) ? record.requested.items : undefined),
        ),
        createdAt:
          text(firstDefined(record, ["createdAt", "created_at"]), "") || null,
      },
    ];
  });
}

export function itemIsTradable(item: EconomyItemView) {
  // The repository clears a matching loadout slot atomically when an offered
  // item enters escrow, so equipped items remain valid trade candidates.
  return (
    item.tradable &&
    Boolean(item.id) &&
    ["available", "owned", "inventory"].includes(item.state)
  );
}

export function itemIsVipMembership(item: EconomyItemView) {
  return item.itemType === "vip_membership";
}

export function itemSupportsLoadout(item: EconomyItemView) {
  if (itemIsVipMembership(item)) return false;
  return [
    "skin",
    "weapon",
    "knife",
    "glove",
    "agent",
    "music-kit",
    "music_kit",
    "musickit",
  ].includes(item.itemType);
}

export function itemSupportsNametag(item: EconomyItemView) {
  const catalogue = isRecord(item.raw.catalogue) ? item.raw.catalogue : {};
  const metadata = isRecord(item.raw.metadata)
    ? item.raw.metadata
    : isRecord(catalogue.metadata)
      ? catalogue.metadata
      : {};
  const attributes = isRecord(item.raw.attributes) ? item.raw.attributes : {};
  const compatibleType = ["skin", "weapon", "knife", "glove"].includes(
    item.itemType,
  );
  return (
    compatibleType &&
    (bool(firstDefined(metadata, ["supportsNametag"])) ||
      bool(firstDefined(attributes, ["supportsNametag"])))
  );
}

export function itemSupportsStickers(item: EconomyItemView) {
  return (
    (item.itemType === "skin" || item.itemType === "weapon") &&
    itemStickerSlotCount(item) > 0
  );
}

export function itemSupportsCharm(item: EconomyItemView) {
  return item.itemType === "skin" || item.itemType === "weapon";
}

export function itemCharmDefinitionIndex(item: EconomyItemView) {
  const attributes = isRecord(item.raw.attributes) ? item.raw.attributes : {};
  const keychain = isRecord(attributes.keychain) ? attributes.keychain : {};
  return integer(firstDefined(keychain, ["id", "definitionIndex", "keychain"]));
}

export function itemStickerSlotCount(item: EconomyItemView) {
  const catalogue = isRecord(item.raw.catalogue) ? item.raw.catalogue : {};
  const metadata = isRecord(item.raw.metadata)
    ? item.raw.metadata
    : isRecord(catalogue.metadata)
      ? catalogue.metadata
      : {};
  const attributes = isRecord(item.raw.attributes) ? item.raw.attributes : {};
  const count =
    integer(
      firstDefined(metadata, ["stickerSlots", "stickerSlotCount"]),
      integer(
        firstDefined(attributes, ["stickerSlots", "stickerSlotCount"]),
        0,
      ),
    ) ?? 0;
  return Math.max(0, Math.min(count, 6));
}

export function formatTokens(value: number | null | undefined) {
  if (value === null || value === undefined || !Number.isFinite(value))
    return "—";
  return new Intl.NumberFormat(undefined, { maximumFractionDigits: 0 }).format(
    value,
  );
}

export function humanize(value: string) {
  return value
    .replace(/[-_]+/g, " ")
    .replace(/\b\w/g, (letter) => letter.toUpperCase());
}

export function rarityRankClass(rarityRank: number) {
  return economyRarityRankClass(rarityRank);
}

export function rarityClass(rarityRank: number) {
  return `badge ${rarityRankClass(rarityRank)}`;
}

export function rarityName(rarityRank: number) {
  return taxonomyRarityName(rarityRank);
}
