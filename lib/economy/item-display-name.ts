const stattrakPrefix = /^StatTrak(?:™)?\s+/iu;
const starredStattrakPrefix = /^★\s*StatTrak(?:™)?\s+/iu;
const starPrefix = /^★\s*/u;

/**
 * Presents StatTrak item names in Counter-Strike's order. The formatter is
 * idempotent because catalogue and provider names may already contain either
 * the current or a legacy StatTrak prefix.
 */
export function economyItemDisplayName(
  displayName: string,
  stattrak: boolean,
) {
  const normalized = displayName.trim();
  if (!stattrak || !normalized) return normalized;

  if (starredStattrakPrefix.test(normalized)) {
    return `★ StatTrak™ ${normalized.replace(starredStattrakPrefix, "")}`;
  }

  if (stattrakPrefix.test(normalized)) {
    const bareName = normalized.replace(stattrakPrefix, "");
    return starPrefix.test(bareName)
      ? `★ StatTrak™ ${bareName.replace(starPrefix, "")}`
      : `StatTrak™ ${bareName}`;
  }

  return starPrefix.test(normalized)
    ? `★ StatTrak™ ${normalized.replace(starPrefix, "")}`
    : `StatTrak™ ${normalized}`;
}
