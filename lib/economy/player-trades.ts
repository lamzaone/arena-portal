import "server-only";

import { getPlayerEconomyTrades, type EconomyTradeFilter, type EconomyTradePage } from "@/lib/data/portal-repository";

const TRADE_PAGE_SIZE = 50;

export async function getCompletePlayerEconomyTrades(steamId: string, filter: Omit<EconomyTradeFilter, "page" | "pageSize"> = {}): Promise<EconomyTradePage> {
  const first = await getPlayerEconomyTrades(steamId, { ...filter, page: 1, pageSize: TRADE_PAGE_SIZE });
  const pageCount = Math.ceil(first.total / TRADE_PAGE_SIZE);
  if (pageCount <= 1) return first;

  const pages = await Promise.all(Array.from({ length: pageCount - 1 }, (_, index) => getPlayerEconomyTrades(steamId, {
    ...filter,
    page: index + 2,
    pageSize: TRADE_PAGE_SIZE
  })));
  return { ...first, trades: [ ...first.trades, ...pages.flatMap((page) => page.trades) ] };
}
