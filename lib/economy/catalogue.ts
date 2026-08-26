import "server-only";

import {
  getEconomyCatalogue,
  getEconomyCrates,
  type EconomyCatalogueFilter,
  type EconomyCataloguePage,
  type EconomyCratePage,
} from "@/lib/data/portal-repository";

const CATALOGUE_PAGE_SIZE = 100;

export async function getCompleteEconomyCatalogue(
  filter: Omit<EconomyCatalogueFilter, "page" | "pageSize"> = {},
): Promise<EconomyCataloguePage> {
  const first = await getEconomyCatalogue({
    ...filter,
    page: 1,
    pageSize: CATALOGUE_PAGE_SIZE,
  });
  const pageCount = Math.ceil(first.total / CATALOGUE_PAGE_SIZE);
  if (pageCount <= 1) return first;

  const items = [...first.items];
  for (let page = 2; page <= pageCount; page += 1) {
    const result = await getEconomyCatalogue({
      ...filter,
      page,
      pageSize: CATALOGUE_PAGE_SIZE,
    });
    items.push(...result.items);
  }
  return { ...first, items };
}

export async function getCompleteEconomyCrates(
  filter: Omit<EconomyCatalogueFilter, "page" | "pageSize" | "itemTypes"> = {},
): Promise<EconomyCratePage> {
  const first = await getEconomyCrates({
    ...filter,
    page: 1,
    pageSize: CATALOGUE_PAGE_SIZE,
  });
  const pageCount = Math.ceil(first.total / CATALOGUE_PAGE_SIZE);
  if (pageCount <= 1) return first;

  const crates = [...first.crates];
  for (let page = 2; page <= pageCount; page += 1) {
    const result = await getEconomyCrates({
      ...filter,
      page,
      pageSize: CATALOGUE_PAGE_SIZE,
    });
    crates.push(...result.crates);
  }
  return { ...first, crates };
}
