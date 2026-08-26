import "server-only";

import {
  getPlayerEconomyInventory,
  type EconomyInventoryFilter,
  type EconomyInventoryPage,
} from "@/lib/data/portal-repository";

const INVENTORY_PAGE_SIZE = 100;

// The player-facing inventory needs local search and filtering, so gather the
// complete server-authoritative collection instead of silently showing only
// the repository's first default page. The repository still bounds each SQL
// query to 100 rows.
export async function getCompletePlayerEconomyInventory(
  steamId: string,
  filter: Omit<EconomyInventoryFilter, "page" | "pageSize"> = {},
): Promise<EconomyInventoryPage> {
  const first = await getPlayerEconomyInventory(steamId, {
    ...filter,
    page: 1,
    pageSize: INVENTORY_PAGE_SIZE,
  });
  const pageCount = Math.ceil(first.total / INVENTORY_PAGE_SIZE);
  if (pageCount <= 1) return first;

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
  return { ...first, items };
}
