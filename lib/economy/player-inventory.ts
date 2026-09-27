import "server-only";

import {
  getAuthoritativeExternalIdentityMemberships,
  getPlayerEconomyInventory,
  type EconomyInventoryFilter,
  type EconomyInventoryItem,
  type EconomyInventoryPage,
} from "@/lib/data/portal-repository";
import { reconcileIdentityGroupRewards } from "@/lib/data/identity-groups";
import {
  getCachedMarketplaceVariantFallbacks,
} from "@/lib/economy/market-variant-cache";
import {
  getBrowseMarketplacePriceQuotes,
  isStattrakMarketplaceItem,
} from "@/lib/economy/market-pricing";
import type { PanelTimingReporter } from "@/lib/game-panel/timing";

const INVENTORY_PAGE_SIZE = 100;

function metadataFloat(
  metadata: Record<string, unknown>,
  keys: readonly string[],
) {
  for (const key of keys) {
    const value = metadata[key];
    if (typeof value === "number" && Number.isFinite(value)) return value;
  }
  return undefined;
}

function isLegacySteamPrice(source: string | null | undefined) {
  return source?.toLocaleLowerCase("en-US").startsWith("steam") ?? false;
}

/**
 * Applies stored market snapshots to owned items in one batched lookup. The
 * displayed value is only an estimate; selling resolves price again.
 */
export async function withCurrentMarketPrices(items: EconomyInventoryItem[]) {
  const quoteable = items.filter(
    (item) =>
      item.catalogue !== null &&
      (!item.stattrak || isStattrakMarketplaceItem(item.itemType)),
  );
  if (!quoteable.length) return items;
  const cachedFallbacks = await getCachedMarketplaceVariantFallbacks(
    quoteable.map((item) => {
      const catalogue = item.catalogue!;
      return {
        catalogueId: item.catalogueId!,
        floatValue: item.floatValue,
        stattrak: item.stattrak,
        standardFallback:
          !item.stattrak && catalogue.price && !isLegacySteamPrice(catalogue.price.source)
            ? {
                eurCents: catalogue.price.euroCents,
                source: catalogue.price.source,
                sourceReference: catalogue.price.sourceReference,
              }
            : null,
      };
    }),
  );
  const quotes = await getBrowseMarketplacePriceQuotes(
    quoteable.map((item, index) => {
      const catalogue = item.catalogue!;
      return {
        itemType: item.itemType,
        displayName: item.displayName,
        marketHashName: catalogue.marketHashName,
        metadata: catalogue.metadata,
        minFloat: metadataFloat(catalogue.metadata, [
          "minFloat",
          "floatMin",
          "wearMin",
        ]),
        maxFloat: metadataFloat(catalogue.metadata, [
          "maxFloat",
          "floatMax",
          "wearMax",
        ]),
        floatValue: item.floatValue,
        seed: item.seed,
        stattrak: item.stattrak,
        fallbackPrice: cachedFallbacks[index],
      };
    }),
  );
  const quoteByItemId = new Map(
    quoteable.map((item, index) => [item.id, quotes[index]]),
  );
  return items.map((item) => {
    const quote = quoteByItemId.get(item.id);
    if (!quote) {
      // The catalogue stores the normal item's historic snapshot. Never show
      // it as the value of a separately priced StatTrak™ instance.
      return item.stattrak
        ? {
            ...item,
            marketPriceTokens: null,
            marketPriceEuroCents: null,
            marketPriceSource: null,
            marketPriceFloatValue: null,
            marketPriceWear: null,
            marketPriceFloatDiscountBps: null,
          }
        : item;
    }
    return {
      ...item,
      marketPriceTokens: quote.eurCents,
      marketPriceEuroCents: quote.eurCents,
      marketPriceSource: quote.source,
      marketPriceFloatValue: quote.floatValue,
      marketPriceWear: quote.wear,
      marketPriceFloatDiscountBps: quote.floatDiscountBps,
    };
  });
}

// The player-facing inventory needs local search and filtering, so gather the
// complete server-authoritative collection instead of silently showing only
// the repository's first default page. The repository still bounds each SQL
// query to 100 rows.
export async function reconcilePlayerInventoryBenefits(
  steamId: string,
  onTiming?: PanelTimingReporter,
): Promise<void> {
  try {
    const membershipStarted = performance.now();
    let memberships: Awaited<ReturnType<typeof getAuthoritativeExternalIdentityMemberships>>;
    try {
      memberships = await getAuthoritativeExternalIdentityMemberships(steamId);
    } finally {
      onTiming?.("membership_lookup", performance.now() - membershipStarted);
    }
    const reconcileStarted = performance.now();
    try {
      await reconcileIdentityGroupRewards({
        steamId,
        ...memberships,
        onLockWait: onTiming ? (durationMs) => onTiming("lock_wait", durationMs) : undefined,
      });
    } finally {
      onTiming?.("reconcile", performance.now() - reconcileStarted);
    }
  } catch {
    // Never interpret an unavailable game or identity database as an empty
    // Admin/VIP membership set. The runtime or a later request retries safely.
  }
}

export async function getPlayerEconomyInventoryPage(
  steamId: string,
  filter: EconomyInventoryFilter = {},
  onTiming?: PanelTimingReporter,
): Promise<EconomyInventoryPage> {
  await reconcilePlayerInventoryBenefits(steamId, onTiming);
  const sqlStarted = performance.now();
  let result: EconomyInventoryPage;
  try {
    result = await getPlayerEconomyInventory(steamId, {...filter, pageSize: Math.min(filter.pageSize ?? 24, 48)});
  } finally {
    onTiming?.("inventory_sql", performance.now() - sqlStarted);
  }
  const quoteStarted = performance.now();
  try {
    return {...result, items:await withCurrentMarketPrices(result.items)};
  } finally {
    onTiming?.("snapshot_quote", performance.now() - quoteStarted);
  }
}

export async function getCompletePlayerEconomyInventory(
  steamId: string,
  filter: Omit<EconomyInventoryFilter, "page" | "pageSize"> = {},
): Promise<EconomyInventoryPage> {
  await reconcilePlayerInventoryBenefits(steamId);
  const first = await getPlayerEconomyInventory(steamId, {
    ...filter,
    page: 1,
    pageSize: INVENTORY_PAGE_SIZE,
  });
  const pageCount = Math.ceil(first.total / INVENTORY_PAGE_SIZE);
  if (pageCount <= 1)
    return { ...first, items: await withCurrentMarketPrices(first.items) };

  // Fetch sequentially so a very large inventory cannot monopolize the
  // portal connection pool while hydration queries are running.
  const items = [...first.items];
  for (let page = 2; page <= pageCount; page += 1) {
    const result = await getPlayerEconomyInventory(steamId, {
      ...filter,
      page,
      pageSize: INVENTORY_PAGE_SIZE,
    });
    items.push(...result.items);
  }
  return { ...first, items: await withCurrentMarketPrices(items) };
}
