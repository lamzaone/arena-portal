export type InventoryPageRequest = {
  page: number;
  pageSize: number;
  query: string;
  type: string;
  rarity: string;
  sort: string;
  hideEquipped: boolean;
};

export function inventoryPageRequest(input: InventoryPageRequest) {
  const params = new URLSearchParams();
  params.set("page", String(input.page));
  params.set("pageSize", String(input.pageSize));
  if (input.query.trim()) params.set("q", input.query.trim());
  if (input.type !== "all") params.set("type", input.type);
  if (input.rarity !== "all") params.set("rarity", input.rarity);
  if (input.sort !== "newest") params.set("sort", input.sort);
  if (input.hideEquipped) params.set("hideEquipped", "1");
  return params.toString();
}

export function pageForInventoryAnchor(page: number, oldSize: number, newSize: number) {
  return Math.floor(((page - 1) * oldSize) / newSize) + 1;
}
