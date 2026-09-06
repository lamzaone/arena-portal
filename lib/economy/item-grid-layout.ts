export const ITEM_GRID_MAX_COLUMNS = 5;
export const ITEM_GRID_MAX_ROWS = 4;
export const ITEM_GRID_MAX_PAGE_SIZE = ITEM_GRID_MAX_COLUMNS * ITEM_GRID_MAX_ROWS;

export function itemGridColumns(width: number) {
  const available = Number.isFinite(width) ? Math.max(0, width) : 0;
  return Math.min(ITEM_GRID_MAX_COLUMNS, Math.max(1, Math.floor((available + 12) / 202)));
}

export function itemGridPageSize(width: number) {
  return itemGridColumns(width) * ITEM_GRID_MAX_ROWS;
}

export function normalizeItemGridPageSize(value: unknown) {
  const size = Number(value);
  return Number.isInteger(size) && size >= ITEM_GRID_MAX_ROWS && size <= ITEM_GRID_MAX_PAGE_SIZE && size % ITEM_GRID_MAX_ROWS === 0
    ? size
    : ITEM_GRID_MAX_PAGE_SIZE;
}
