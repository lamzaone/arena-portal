import { randomUUID } from "node:crypto";
import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";

import { NextResponse } from "next/server";

import { canActOnTarget, getAdminAccess } from "@/lib/admin/access";
import { getSession, verifyAdminActionToken } from "@/lib/auth/session";
import {
  addStaffCustomCrateLootEntry,
  createEconomyDiscountRule,
  createStaffCustomCrate,
  EconomyRepositoryError,
  getEconomyCatalogueItem,
  recordEconomyPrice,
  removeStaffCustomCrateLootEntry,
  staffAdjustTokens,
  staffAttachStickerToEconomyItem,
  staffClearEconomyLoadoutSlot,
  staffDetachEconomySticker,
  staffEquipEconomyItem,
  staffGrantEconomyItem,
  staffSetEconomyItemState,
  staffTransferEconomyItem,
  staffUpdateEconomyItem,
  setEconomyCatalogueArtwork,
  setEconomyDiscountRuleEnabled,
  setEconomyCatalogueMarketplaceStatus,
  setEconomyCatalogueMarketHash,
  updateStaffCustomCrate,
  updateEconomyDiscountRule,
  type EconomyDiscountTargetType,
  type EconomyItemType,
  type EconomyLoadoutSlotInput,
  type StaffCustomEconomyItem,
  type StaffEconomyItemCustomization,
  type StaffStickerGrant,
} from "@/lib/data/portal-repository";
import { getSkinportHistoricalPrice } from "@/lib/economy/skinport-prices";
import {
  ECONOMY_ITEM_TYPES,
  ECONOMY_MAX_RARITY_RANK,
  isCustomProductItemType,
} from "@/lib/economy/item-taxonomy";

const itemTypes: readonly EconomyItemType[] = ECONOMY_ITEM_TYPES;
const artworkContentTypes = new Map([
  ["image/jpeg", "jpg"],
  ["image/png", "png"],
  ["image/webp", "webp"],
]);
const maxArtworkBytes = 5 * 1024 * 1024;

function returnPage(value: string | null) {
  if (!value || !/^\d{1,6}$/.test(value)) return null;
  const parsed = Number(value);
  return Number.isSafeInteger(parsed) && parsed > 1 ? parsed : null;
}

function redirect(
  request: Request,
  key: "notice" | "error",
  value: string,
  steamId?: string,
  crateId?: number,
) {
  const requestUrl = new URL(request.url);
  const url = new URL(
    requestUrl.searchParams.get("returnTo") === "inventories"
      ? "/admin/inventories"
      : "/admin/items",
    request.url,
  );
  if (requestUrl.searchParams.get("returnTo") === "inventories") {
    const returnQuery = requestUrl.searchParams.get("returnQ")?.trim().slice(0, 64);
    const returnPlayerPage = returnPage(requestUrl.searchParams.get("returnPage"));
    const returnInventoryPage = returnPage(
      requestUrl.searchParams.get("returnInventoryPage"),
    );
    if (returnQuery) url.searchParams.set("q", returnQuery);
    if (returnPlayerPage)
      url.searchParams.set("page", String(returnPlayerPage));
    if (returnInventoryPage)
      url.searchParams.set("inventoryPage", String(returnInventoryPage));
  } else {
    const returnTab = requestUrl.searchParams.get("returnTab");
    if (
      returnTab === "marketplace" ||
      returnTab === "crates" ||
      returnTab === "discount"
    ) {
      url.searchParams.set("tab", returnTab);
    }
  }
  url.searchParams.set(key, value);
  if (steamId && /^7656119\d{10}$/.test(steamId))
    url.searchParams.set("steamId", steamId);
  if (crateId && Number.isSafeInteger(crateId) && crateId > 0)
    url.searchParams.set("crate", String(crateId));
  return NextResponse.redirect(url, 303);
}

function formText(formData: FormData, name: string, maximum = 256) {
  const value = formData.get(name);
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  return trimmed && trimmed.length <= maximum ? trimmed : null;
}

function optionalText(formData: FormData, name: string, maximum = 256) {
  const value = formData.get(name);
  if (typeof value !== "string") return undefined;
  const trimmed = value.trim();
  if (!trimmed) return undefined;
  return trimmed.length <= maximum ? trimmed : null;
}

function integer(
  value: string | undefined | null,
  minimum: number,
  maximum = Number.MAX_SAFE_INTEGER,
) {
  if (!value) return null;
  const parsed = Number(value);
  return Number.isSafeInteger(parsed) && parsed >= minimum && parsed <= maximum
    ? parsed
    : null;
}

function optionalInteger(
  formData: FormData,
  name: string,
  minimum: number,
  maximum = Number.MAX_SAFE_INTEGER,
) {
  const value = optionalText(formData, name, 32);
  if (value === undefined) return undefined;
  if (value === null) return null;
  return integer(value, minimum, maximum);
}

function optionalFloat(formData: FormData, name: string) {
  const value = optionalText(formData, name, 32);
  if (value === undefined) return undefined;
  if (value === null) return null;
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed >= 0 && parsed <= 1
    ? Number(parsed.toFixed(6))
    : null;
}

function discountPercentageBps(formData: FormData) {
  const value = optionalText(formData, "discountPercentage", 8);
  if (value === undefined) return 0;
  if (value === null || !/^\d{1,3}(?:\.\d{1,2})?$/.test(value)) return null;
  const basisPoints = Math.round(Number(value) * 100);
  return Number.isSafeInteger(basisPoints) && basisPoints <= 10_000
    ? basisPoints
    : null;
}

function discountUtcDate(formData: FormData, name: string) {
  const value = optionalText(formData, name, 40);
  if (value === undefined) return { valid: true as const, value: null };
  if (value === null) return { valid: false as const, value: null };
  // datetime-local has no zone. The discount editor labels these controls UTC
  // and this conversion makes the persisted boundary independent of host TZ.
  const normalized = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/.test(value)
    ? `${value}:00.000Z`
    : value;
  const parsed = new Date(normalized);
  return Number.isFinite(parsed.getTime())
    ? { valid: true as const, value: parsed.toISOString() }
    : { valid: false as const, value: null };
}

function discountExclusions(formData: FormData) {
  const value = optionalText(formData, "discountExclusions", 5_500);
  if (value === undefined) return [];
  if (value === null) return null;
  const entries = value.split(/[\s,;]+/).filter(Boolean);
  if (entries.length > 250 || entries.some((entry) => !/^\d+$/.test(entry)))
    return null;
  const ids = [...new Set(entries.map(Number))];
  return ids.every(
    (catalogueId) => Number.isSafeInteger(catalogueId) && catalogueId > 0,
  )
    ? ids
    : null;
}

function parseDiscountRule(formData: FormData) {
  const displayName = formText(formData, "discountName", 120);
  const targetTypeValue = formText(formData, "discountTargetType", 32);
  const targetType: EconomyDiscountTargetType | null =
    targetTypeValue === "catalogue_item" || targetTypeValue === "item_type"
      ? targetTypeValue
      : null;
  const catalogueId = optionalInteger(
    formData,
    "discountCatalogueId",
    1,
  );
  const itemTypeValue = optionalText(formData, "discountItemType", 32);
  const itemType =
    typeof itemTypeValue === "string" &&
    itemTypes.includes(itemTypeValue as EconomyItemType)
      ? (itemTypeValue as EconomyItemType)
      : itemTypeValue === undefined
        ? undefined
        : null;
  const percentageBps = discountPercentageBps(formData);
  const fixedTokensValue = optionalText(
    formData,
    "discountFixedTokens",
    20,
  );
  const fixedTokens = integer(
    fixedTokensValue === undefined ? "0" : fixedTokensValue,
    0,
    10_000_000_000,
  );
  const priorityValue = optionalText(formData, "discountPriority", 8);
  const priority = integer(
    priorityValue === undefined ? "0" : priorityValue,
    -32_768,
    32_767,
  );
  const startsAt = discountUtcDate(formData, "discountStartsAt");
  const endsAt = discountUtcDate(formData, "discountEndsAt");
  const excludedCatalogueIds = discountExclusions(formData);
  if (
    !displayName ||
    !targetType ||
    fixedTokensValue === null ||
    priorityValue === null ||
    percentageBps === null ||
    fixedTokens === null ||
    priority === null ||
    !startsAt.valid ||
    !endsAt.valid ||
    excludedCatalogueIds === null ||
    (percentageBps === 0 && fixedTokens === 0) ||
    (targetType === "catalogue_item" &&
      (catalogueId === undefined || catalogueId === null)) ||
    (targetType === "item_type" && !itemType)
  ) {
    return null;
  }
  return {
    displayName,
    targetType,
    catalogueId: targetType === "catalogue_item" ? catalogueId : null,
    itemType: targetType === "item_type" ? itemType : null,
    percentageBps,
    fixedTokens,
    priority,
    enabled: formData.get("discountEnabled") === "true",
    startsAt: startsAt.value,
    endsAt: endsAt.value,
    excludedCatalogueIds:
      targetType === "item_type" ? excludedCatalogueIds : [],
  };
}

function crateActionErrorKey(error: unknown, crateId: number | null) {
  if (!crateId || !(error instanceof EconomyRepositoryError)) return null;
  if (error.code === "loot_table_empty") return "crate-reward-required";
  if (error.code === "duplicate_reward") return "custom-crate-duplicate";
  if (
    [
      "catalogue_not_found",
      "catalogue_unavailable",
      "item_not_found",
      "incompatible_item",
    ].includes(error.code)
  ) {
    return "custom-crate-reward";
  }
  return null;
}

function parseJsonRecord(value: string | undefined, maximum = 12_000) {
  if (!value) return undefined;
  if (value.length > maximum) return null;
  try {
    const parsed: unknown = JSON.parse(value);
    return parsed && typeof parsed === "object" && !Array.isArray(parsed)
      ? (parsed as Record<string, unknown>)
      : null;
  } catch {
    return null;
  }
}

function validSteamId(value: string | null) {
  return value && /^7656119\d{10}$/.test(value) ? value : null;
}

function actionIdempotencyKey(formData: FormData, action: string) {
  const supplied = formText(formData, "idempotencyKey", 128);
  return supplied && /^[A-Za-z0-9_-]{16,128}$/.test(supplied)
    ? supplied
    : `admin-${action}-${randomUUID().replaceAll("-", "")}`;
}

function parseSlot(formData: FormData): EconomyLoadoutSlotInput | null {
  const slotType = formText(formData, "slotType", 32);
  const team = formText(formData, "slotTeam", 4);
  if (slotType === "music_kit") return { slotType };
  if (
    (slotType === "knife" || slotType === "glove" || slotType === "agent") &&
    (team === "T" || team === "CT")
  )
    return { slotType, team };
  if (slotType === "weapon" && (team === "T" || team === "CT")) {
    const definitionIndex = integer(
      formText(formData, "slotDefinitionIndex", 16),
      1,
      65_535,
    );
    return definitionIndex === null
      ? null
      : { slotType, team, definitionIndex };
  }
  return null;
}

function parseCustomization(
  formData: FormData,
): StaffEconomyItemCustomization | null {
  const seed = optionalInteger(formData, "seed", 0, 1000);
  const floatValue = optionalFloat(formData, "floatValue");
  const stattrakCount = optionalInteger(formData, "stattrakCount", 0);
  const stattrakValue = optionalText(formData, "stattrak", 5);
  const nametag = optionalText(formData, "nametag", 128);
  const attributesText = optionalText(formData, "attributes", 12_000);
  const attributes =
    attributesText === undefined
      ? undefined
      : attributesText === null
        ? null
        : parseJsonRecord(attributesText);
  if (
    seed === null ||
    floatValue === null ||
    stattrakCount === null ||
    nametag === null ||
    attributes === null ||
    stattrakValue === null ||
    (stattrakValue !== undefined &&
      stattrakValue !== "true" &&
      stattrakValue !== "false")
  )
    return null;

  const customization: StaffEconomyItemCustomization = {};
  if (seed !== undefined) customization.seed = seed;
  if (floatValue !== undefined) customization.floatValue = floatValue;
  if (stattrakCount !== undefined) customization.stattrakCount = stattrakCount;
  if (stattrakValue !== undefined)
    customization.stattrak = stattrakValue === "true";
  if (nametag !== undefined) customization.nametag = nametag;
  if (formData.get("clearNametag") === "true") customization.nametag = null;
  if (attributes !== undefined) customization.attributes = attributes;
  return customization;
}

function parseCustomItem(
  formData: FormData,
  prefix = "",
): StaffCustomEconomyItem | null {
  const itemTypeValue = formText(formData, `${prefix}itemType`, 32);
  const itemType = itemTypes.includes(itemTypeValue as EconomyItemType)
    ? (itemTypeValue as EconomyItemType)
    : null;
  const displayName = formText(formData, `${prefix}displayName`, 180);
  const definitionIndex = optionalInteger(
    formData,
    `${prefix}definitionIndex`,
    0,
    65_535,
  );
  const paintkit = optionalInteger(formData, `${prefix}paintkit`, 0, 2_000_000);
  const rarityRank = optionalInteger(
    formData,
    `${prefix}rarityRank`,
    0,
    ECONOMY_MAX_RARITY_RANK,
  );
  const metadataText = optionalText(formData, `${prefix}metadata`, 12_000);
  const metadata =
    metadataText === undefined
      ? undefined
      : metadataText === null
        ? null
        : parseJsonRecord(metadataText);
  if (
    !itemType ||
    !displayName ||
    definitionIndex === null ||
    paintkit === null ||
    rarityRank === null ||
    metadata === null
  )
    return null;
  return {
    itemType,
    displayName,
    definitionIndex:
      definitionIndex === undefined ? undefined : definitionIndex,
    paintkit: paintkit === undefined ? undefined : paintkit,
    rarityRank: rarityRank === undefined ? undefined : rarityRank,
    metadata: metadata === undefined ? undefined : metadata,
  };
}

function parseInitialStickers(formData: FormData): StaffStickerGrant[] | null {
  const raw = optionalText(formData, "initialStickers", 12_000);
  if (raw === undefined) return [];
  if (raw === null) return null;
  try {
    const parsed: unknown = JSON.parse(raw);
    if (!Array.isArray(parsed) || parsed.length > 6) return null;
    const grants: StaffStickerGrant[] = [];
    for (const entry of parsed) {
      if (!entry || typeof entry !== "object" || Array.isArray(entry))
        return null;
      const record = entry as Record<string, unknown>;
      const slot =
        typeof record.slot === "number" &&
        Number.isSafeInteger(record.slot) &&
        record.slot >= 0 &&
        record.slot <= 5
          ? record.slot
          : null;
      const catalogueId =
        typeof record.catalogueId === "number" &&
        Number.isSafeInteger(record.catalogueId) &&
        record.catalogueId > 0
          ? record.catalogueId
          : undefined;
      const custom = record.customItem;
      const customItem =
        custom && typeof custom === "object" && !Array.isArray(custom)
          ? (custom as StaffCustomEconomyItem)
          : undefined;
      const customization =
        record.customization &&
        typeof record.customization === "object" &&
        !Array.isArray(record.customization)
          ? (record.customization as StaffEconomyItemCustomization)
          : undefined;
      if (
        slot === null ||
        (catalogueId === undefined) === (customItem === undefined)
      )
        return null;
      if (
        customItem &&
        (!itemTypes.includes(customItem.itemType) ||
          customItem.itemType !== "sticker" ||
          !customItem.displayName?.trim())
      )
        return null;
      grants.push({ slot, catalogueId, customItem, customization });
    }
    return grants;
  } catch {
    return null;
  }
}

function catalogueMarketVersion(metadata: Record<string, unknown>) {
  for (const key of ["marketVersion", "skinportVersion", "priceVersion"]) {
    const value = metadata[key];
    if (typeof value === "string" && value.trim() && value.trim().length <= 120)
      return value.trim();
  }
  return null;
}

async function saveCatalogueArtwork(value: FormDataEntryValue | null) {
  if (!(value instanceof File) || value.size === 0) return null;
  const extension = artworkContentTypes.get(value.type);
  if (!extension || value.size > maxArtworkBytes) throw new Error("artwork");
  const directory = path.join(
    process.cwd(),
    "public",
    "images",
    "economy",
    "custom",
  );
  await mkdir(directory, { recursive: true });
  const fileName = `staff-${randomUUID()}.${extension}`;
  await writeFile(
    path.join(directory, fileName),
    Buffer.from(await value.arrayBuffer()),
    { flag: "wx" },
  );
  return `/images/economy/custom/${fileName}`;
}

async function ensureActorCanTarget(
  actorSteamId: string,
  targetSteamId: string,
) {
  const [actor, target] = await Promise.all([
    getAdminAccess(actorSteamId),
    getAdminAccess(targetSteamId),
  ]);
  return actor.isAdmin && (!target.isAdmin || canActOnTarget(actor, target));
}

export async function POST(request: Request) {
  const session = await getSession();
  if (!session)
    return NextResponse.redirect(new URL("/api/auth/steam", request.url), 303);

  const formData = await request.formData();
  if (!verifyAdminActionToken(session, String(formData.get("csrf") ?? "")))
    return redirect(request, "error", "verification");

  const actor = await getAdminAccess(session.steamId);
  if (!actor.isAdmin || !actor.canViewEconomy)
    return redirect(request, "error", "permission");

  const action = formText(formData, "action", 48);
  const targetSteamId = validSteamId(formText(formData, "steamId", 17));
  const crateContextId = integer(formText(formData, "crateId", 20), 1);
  const idempotencyKey = actionIdempotencyKey(formData, action ?? "unknown");
  const reason = formText(formData, "reason", 180);

  try {
    if (action === "discount-rule-create") {
      if (!actor.canManageEconomy)
        return redirect(request, "error", "manage-permission");
      const rule = parseDiscountRule(formData);
      if (!rule) return redirect(request, "error", "discount-details");
      await createEconomyDiscountRule({
        actorSteamId: actor.steamId,
        ...rule,
        idempotencyKey,
      });
      return redirect(request, "notice", "discount-created");
    }

    if (action === "discount-rule-update") {
      if (!actor.canManageEconomy)
        return redirect(request, "error", "manage-permission");
      const ruleId = integer(formText(formData, "discountRuleId", 20), 1);
      const rule = parseDiscountRule(formData);
      if (ruleId === null || !rule)
        return redirect(request, "error", "discount-details");
      await updateEconomyDiscountRule({
        actorSteamId: actor.steamId,
        ruleId,
        ...rule,
        idempotencyKey,
      });
      return redirect(request, "notice", "discount-saved");
    }

    if (action === "discount-rule-enabled-set") {
      if (!actor.canManageEconomy)
        return redirect(request, "error", "manage-permission");
      const ruleId = integer(formText(formData, "discountRuleId", 20), 1);
      const enabledValue = formText(formData, "discountEnabled", 5);
      if (
        ruleId === null ||
        (enabledValue !== "true" && enabledValue !== "false")
      ) {
        return redirect(request, "error", "discount-details");
      }
      await setEconomyDiscountRuleEnabled({
        actorSteamId: actor.steamId,
        ruleId,
        enabled: enabledValue === "true",
        idempotencyKey,
      });
      return redirect(
        request,
        "notice",
        enabledValue === "true" ? "discount-enabled" : "discount-disabled",
      );
    }

    if (action === "catalogue-artwork-set") {
      if (!actor.canManageEconomy)
        return redirect(request, "error", "manage-permission");
      const catalogueId = integer(formText(formData, "catalogueId", 20), 1);
      const providedArtworkUrl = optionalText(formData, "artworkUrl", 512);
      if (catalogueId === null || providedArtworkUrl === null)
        return redirect(request, "error", "artwork");
      const uploadedArtworkUrl = await saveCatalogueArtwork(
        formData.get("artworkFile"),
      );
      const artworkUrl = uploadedArtworkUrl ?? providedArtworkUrl;
      if (!artworkUrl) return redirect(request, "error", "artwork");
      await setEconomyCatalogueArtwork({
        actorSteamId: actor.steamId,
        catalogueId,
        artworkUrl,
        idempotencyKey,
      });
      return redirect(
        request,
        "notice",
        "artwork-saved",
        targetSteamId ?? undefined,
      );
    }

    if (action === "market-name-set") {
      if (!actor.canManageEconomy)
        return redirect(request, "error", "manage-permission");
      const catalogueId = integer(formText(formData, "catalogueId", 20), 1);
      const marketHashName = formText(formData, "marketHashName", 255);
      if (catalogueId === null || !marketHashName)
        return redirect(request, "error", "market-name");
      await setEconomyCatalogueMarketHash({
        actorSteamId: actor.steamId,
        catalogueId,
        marketHashName,
        idempotencyKey,
      });
      return redirect(
        request,
        "notice",
        "market-name-saved",
        targetSteamId ?? undefined,
      );
    }

    if (action === "market-status-set") {
      if (!actor.canManageEconomy)
        return redirect(request, "error", "manage-permission");
      const catalogueId = integer(formText(formData, "catalogueId", 20), 1);
      const marketEnabled = formData.get("marketEnabled") === "true";
      if (catalogueId === null) return redirect(request, "error", "catalogue");
      await setEconomyCatalogueMarketplaceStatus({
        actorSteamId: actor.steamId,
        catalogueId,
        marketEnabled,
        idempotencyKey,
      });
      return redirect(
        request,
        "notice",
        marketEnabled ? "market-enabled" : "market-disabled",
        targetSteamId ?? undefined,
        crateContextId ?? undefined,
      );
    }

    if (action === "price-refresh") {
      if (!actor.canManageEconomy)
        return redirect(request, "error", "manage-permission");
      const catalogueId = integer(formText(formData, "catalogueId", 20), 1);
      if (catalogueId === null) return redirect(request, "error", "catalogue");
      const catalogue = await getEconomyCatalogueItem(catalogueId, true);
      if (!catalogue?.marketHashName)
        return redirect(request, "error", "market-name");
      const price = await getSkinportHistoricalPrice({
        marketHashName: catalogue.marketHashName,
        marketVersion: catalogueMarketVersion(catalogue.metadata),
      });
      if (!price) return redirect(request, "error", "price-unavailable");
      await recordEconomyPrice({
        actorSteamId: actor.steamId,
        catalogueId,
        eurCents: price.eurCents,
        source: price.source,
        sourceReference: price.sourceReference,
        idempotencyKey,
      });
      return redirect(
        request,
        "notice",
        "price-refreshed",
        targetSteamId ?? undefined,
      );
    }

    if (action === "price-set") {
      if (!actor.canManageEconomy)
        return redirect(request, "error", "manage-permission");
      const catalogueId = integer(formText(formData, "catalogueId", 20), 1);
      const eurCents = integer(
        formText(formData, "eurCents", 20),
        0,
        10_000_000,
      );
      if (catalogueId === null || eurCents === null)
        return redirect(request, "error", "price");
      await recordEconomyPrice({
        actorSteamId: actor.steamId,
        catalogueId,
        eurCents,
        source: "staff-last-known",
        sourceReference: "staff-panel",
        idempotencyKey,
      });
      return redirect(
        request,
        "notice",
        "price-saved",
        targetSteamId ?? undefined,
      );
    }

    if (action === "custom-crate-create") {
      if (!actor.canManageEconomy)
        return redirect(request, "error", "manage-permission");
      const displayName = formText(formData, "crateDisplayName", 160);
      const rarityRank = integer(
        formText(formData, "crateRarityRank", 8),
        0,
        ECONOMY_MAX_RARITY_RANK,
      );
      const directPriceTokens = integer(
        formText(formData, "crateDirectPriceTokens", 20),
        0,
        10_000_000_000,
      );
      const providedArtworkUrl = optionalText(formData, "crateArtworkUrl", 512);
      if (
        !displayName ||
        rarityRank === null ||
        directPriceTokens === null ||
        providedArtworkUrl === null
      )
        return redirect(request, "error", "custom-crate-details");
      const uploadedArtworkUrl = await saveCatalogueArtwork(
        formData.get("crateArtworkFile"),
      );
      const artworkUrl = uploadedArtworkUrl ?? providedArtworkUrl;
      if (!artworkUrl)
        return redirect(request, "error", "custom-crate-details");
      const result = await createStaffCustomCrate({
        actorSteamId: actor.steamId,
        displayName,
        rarityRank,
        directPriceTokens,
        artworkUrl,
        idempotencyKey,
      });
      return redirect(request, "notice", "custom-crate-created", undefined, result.catalogueId);
    }

    if (action === "custom-crate-update") {
      if (!actor.canManageEconomy)
        return redirect(request, "error", "manage-permission");
      const catalogueId = integer(formText(formData, "crateId", 20), 1);
      const displayName = formText(formData, "crateDisplayName", 160);
      const rarityRank = integer(
        formText(formData, "crateRarityRank", 8),
        0,
        ECONOMY_MAX_RARITY_RANK,
      );
      const directPriceTokens = integer(
        formText(formData, "crateDirectPriceTokens", 20),
        0,
        10_000_000_000,
      );
      const providedArtworkUrl = optionalText(formData, "crateArtworkUrl", 512);
      if (
        catalogueId === null ||
        !displayName ||
        rarityRank === null ||
        directPriceTokens === null ||
        providedArtworkUrl === null
      )
        return redirect(request, "error", "custom-crate-details", undefined, catalogueId ?? undefined);
      const uploadedArtworkUrl = await saveCatalogueArtwork(
        formData.get("crateArtworkFile"),
      );
      const artworkUrl = uploadedArtworkUrl ?? providedArtworkUrl;
      if (!artworkUrl)
        return redirect(request, "error", "custom-crate-details", undefined, catalogueId);
      await updateStaffCustomCrate({
        actorSteamId: actor.steamId,
        catalogueId,
        displayName,
        rarityRank,
        directPriceTokens,
        artworkUrl,
        idempotencyKey,
      });
      return redirect(request, "notice", "custom-crate-saved", undefined, catalogueId);
    }

    if (action === "custom-crate-loot-add") {
      if (!actor.canManageEconomy)
        return redirect(request, "error", "manage-permission");
      const catalogueId = integer(formText(formData, "crateId", 20), 1);
      const rewardCatalogueId = integer(
        formText(formData, "rewardCatalogueId", 20),
        1,
      );
      const weight = integer(
        formText(formData, "rewardWeight", 20),
        1,
        1_000_000_000_000,
      );
      if (catalogueId === null || rewardCatalogueId === null || weight === null)
        return redirect(request, "error", "custom-crate-reward", undefined, catalogueId ?? undefined);
      await addStaffCustomCrateLootEntry({
        actorSteamId: actor.steamId,
        catalogueId,
        rewardCatalogueId,
        weight,
        idempotencyKey,
      });
      return redirect(request, "notice", "custom-crate-reward-added", undefined, catalogueId);
    }

    if (action === "custom-crate-loot-remove") {
      if (!actor.canManageEconomy)
        return redirect(request, "error", "manage-permission");
      const catalogueId = integer(formText(formData, "crateId", 20), 1);
      const lootEntryId = integer(formText(formData, "lootEntryId", 20), 1);
      if (catalogueId === null || lootEntryId === null)
        return redirect(request, "error", "custom-crate-reward", undefined, catalogueId ?? undefined);
      await removeStaffCustomCrateLootEntry({
        actorSteamId: actor.steamId,
        catalogueId,
        lootEntryId,
        idempotencyKey,
      });
      return redirect(request, "notice", "custom-crate-reward-removed", undefined, catalogueId);
    }

    if (
      !targetSteamId ||
      !(await ensureActorCanTarget(actor.steamId, targetSteamId))
    )
      return redirect(request, "error", "target", targetSteamId ?? undefined);

    if (action === "tokens") {
      if (!actor.canAdjustEconomyTokens)
        return redirect(request, "error", "token-permission", targetSteamId);
      const tokenAction = formText(formData, "tokenAction", 12);
      const amount = integer(
        formText(formData, "amount", 20),
        0,
        10_000_000_000,
      );
      if (
        (tokenAction !== "award" &&
          tokenAction !== "take" &&
          tokenAction !== "set") ||
        amount === null ||
        !reason
      )
        return redirect(request, "error", "token-details", targetSteamId);
      await staffAdjustTokens({
        actorSteamId: actor.steamId,
        targetSteamId,
        action: tokenAction,
        amount,
        reason,
        idempotencyKey,
      });
      return redirect(request, "notice", "tokens-updated", targetSteamId);
    }

    if (action === "grant") {
      if (!actor.canGrantEconomyItems)
        return redirect(request, "error", "grant-permission", targetSteamId);
      const catalogueId = optionalInteger(formData, "catalogueId", 1);
      const customization = parseCustomization(formData);
      const stickers = parseInitialStickers(formData);
      const parsedCustomItem =
        catalogueId === undefined ? parseCustomItem(formData) : undefined;
      if (
        parsedCustomItem &&
        (parsedCustomItem.itemType === "crate" ||
          parsedCustomItem.itemType === "capsule")
      ) {
        return redirect(request, "error", "container-catalogue", targetSteamId);
      }
      if (parsedCustomItem && isCustomProductItemType(parsedCustomItem.itemType)) {
        return redirect(request, "error", "custom-product-catalogue", targetSteamId);
      }
      if (
        catalogueId === null ||
        !customization ||
        stickers === null ||
        (catalogueId === undefined && !parsedCustomItem) ||
        !reason
      )
        return redirect(request, "error", "item-details", targetSteamId);
      const customItem = parsedCustomItem ?? undefined;
      await staffGrantEconomyItem({
        actorSteamId: actor.steamId,
        targetSteamId,
        catalogueId,
        customItem,
        customization,
        tradable: formData.get("tradable") !== "false",
        stickers: stickers.length ? stickers : undefined,
        reason,
        idempotencyKey,
      });
      return redirect(request, "notice", "item-granted", targetSteamId);
    }

    if (action === "update") {
      if (!actor.canManageEconomy)
        return redirect(request, "error", "manage-permission", targetSteamId);
      const itemId = formText(formData, "itemId", 64);
      const customization = parseCustomization(formData);
      if (
        !itemId ||
        !customization ||
        !Object.keys(customization).length ||
        !reason
      )
        return redirect(request, "error", "item-details", targetSteamId);
      await staffUpdateEconomyItem({
        actorSteamId: actor.steamId,
        targetSteamId,
        itemId,
        customization,
        reason,
        idempotencyKey,
      });
      return redirect(request, "notice", "item-updated", targetSteamId);
    }

    if (action === "state") {
      if (!actor.canManageEconomy)
        return redirect(request, "error", "manage-permission", targetSteamId);
      const itemId = formText(formData, "itemId", 64);
      const state = formText(formData, "state", 16);
      if (!itemId || (state !== "available" && state !== "revoked") || !reason)
        return redirect(request, "error", "item-details", targetSteamId);
      await staffSetEconomyItemState({
        actorSteamId: actor.steamId,
        targetSteamId,
        itemId,
        state,
        reason,
        idempotencyKey,
      });
      return redirect(request, "notice", "item-state-updated", targetSteamId);
    }

    if (action === "transfer") {
      if (!actor.canManageEconomy)
        return redirect(request, "error", "manage-permission", targetSteamId);
      const itemId = formText(formData, "itemId", 64);
      const toSteamId = validSteamId(formText(formData, "toSteamId", 17));
      if (
        !itemId ||
        !toSteamId ||
        !reason ||
        !(await ensureActorCanTarget(actor.steamId, toSteamId))
      )
        return redirect(request, "error", "transfer-details", targetSteamId);
      await staffTransferEconomyItem({
        actorSteamId: actor.steamId,
        fromSteamId: targetSteamId,
        toSteamId,
        itemId,
        reason,
        idempotencyKey,
      });
      return redirect(request, "notice", "item-transferred", targetSteamId);
    }

    if (action === "attach-sticker") {
      if (!actor.canManageEconomy)
        return redirect(request, "error", "manage-permission", targetSteamId);
      const weaponItemId = formText(formData, "weaponItemId", 64);
      const stickerItemId = optionalText(formData, "stickerItemId", 64);
      const stickerCatalogueId = optionalInteger(
        formData,
        "stickerCatalogueId",
        1,
      );
      const slot = integer(formText(formData, "stickerSlot", 8), 0, 5);
      if (
        !weaponItemId ||
        stickerItemId === null ||
        stickerCatalogueId === null ||
        slot === null ||
        !reason ||
        (stickerItemId === undefined) === (stickerCatalogueId === undefined)
      )
        return redirect(request, "error", "sticker-details", targetSteamId);
      await staffAttachStickerToEconomyItem({
        actorSteamId: actor.steamId,
        targetSteamId,
        weaponItemId,
        stickerItemId,
        stickerCatalogueId,
        slot,
        reason,
        idempotencyKey,
      });
      return redirect(request, "notice", "sticker-attached", targetSteamId);
    }

    if (action === "detach-sticker") {
      if (!actor.canManageEconomy)
        return redirect(request, "error", "manage-permission", targetSteamId);
      const weaponItemId = formText(formData, "weaponItemId", 64);
      const slot = integer(formText(formData, "stickerSlot", 8), 0, 5);
      if (!weaponItemId || slot === null || !reason)
        return redirect(request, "error", "sticker-details", targetSteamId);
      await staffDetachEconomySticker({
        actorSteamId: actor.steamId,
        targetSteamId,
        weaponItemId,
        slot,
        reason,
        idempotencyKey,
      });
      return redirect(request, "notice", "sticker-detached", targetSteamId);
    }

    if (action === "equip" || action === "clear-slot") {
      if (!actor.canManageEconomyLoadouts)
        return redirect(request, "error", "loadout-permission", targetSteamId);
      const slot = parseSlot(formData);
      if (!slot || !reason)
        return redirect(request, "error", "loadout-details", targetSteamId);
      if (action === "equip") {
        const itemId = formText(formData, "itemId", 64);
        if (!itemId)
          return redirect(request, "error", "loadout-details", targetSteamId);
        await staffEquipEconomyItem({
          actorSteamId: actor.steamId,
          targetSteamId,
          itemId,
          slot,
          reason,
          idempotencyKey,
        });
        return redirect(request, "notice", "loadout-updated", targetSteamId);
      }
      await staffClearEconomyLoadoutSlot({
        actorSteamId: actor.steamId,
        targetSteamId,
        slot,
        reason,
        idempotencyKey,
      });
      return redirect(request, "notice", "loadout-cleared", targetSteamId);
    }

    return redirect(request, "error", "action", targetSteamId);
  } catch (error) {
    const discountError = action?.startsWith("discount-rule-") &&
      error instanceof EconomyRepositoryError
      ? error.code === "discount_not_found"
        ? "discount-missing"
        : "discount-details"
      : null;
    return redirect(
      request,
      "error",
      error instanceof Error && error.message === "artwork"
        ? "artwork"
        : discountError ?? crateActionErrorKey(error, crateContextId) ?? "database",
      targetSteamId ?? undefined,
      crateContextId ?? undefined,
    );
  }
}
