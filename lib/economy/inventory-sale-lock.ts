type SaleCandidate = {
  catalogueId: number | null;
  saleLocked: boolean;
  state: string;
  stickers: readonly unknown[];
  tradable: boolean;
};

export function canSellInventoryItem(item: SaleCandidate) {
  return (
    item.state === "available" &&
    item.tradable &&
    !item.saleLocked &&
    item.stickers.length === 0 &&
    item.catalogueId !== null
  );
}
