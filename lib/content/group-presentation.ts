function key(value: string) {
  return value.trim().replace(/[\s-]+/g, "_").toUpperCase();
}

export function normalizeVipGroup(value: string) {
  return key(value).replace(/^VIP_/, "").replace(/_/g, " ");
}
