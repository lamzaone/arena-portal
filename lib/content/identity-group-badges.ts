export const IDENTITY_GROUP_BADGE_ICON_OPTIONS = [
  { value: "shield", label: "Shield" },
  { value: "crown", label: "Crown" },
  { value: "star", label: "Star" },
  { value: "badge", label: "Badge" },
  { value: "sparkles", label: "Sparkles" },
  { value: "users", label: "Users" },
  { value: "medal", label: "Medal" },
  { value: "trophy", label: "Trophy" },
  { value: "gem", label: "Gem" },
  { value: "diamond", label: "Diamond" },
  { value: "swords", label: "Swords" },
  { value: "crosshair", label: "Crosshair" },
  { value: "target", label: "Target" },
  { value: "flame", label: "Flame" },
  { value: "zap", label: "Lightning" },
  { value: "heart", label: "Heart" },
  { value: "handshake", label: "Handshake" },
  { value: "book", label: "Book" },
  { value: "headphones", label: "Headphones" },
  { value: "flag", label: "Flag" },
  { value: "wrench", label: "Wrench" },
  { value: "code", label: "Code" },
  { value: "bot", label: "Bot" },
  { value: "verified", label: "Verified" },
] as const;

export type IdentityGroupBadgeIconKey =
  (typeof IDENTITY_GROUP_BADGE_ICON_OPTIONS)[number]["value"];

const identityGroupBadgeIconKeys = new Set<string>(
  IDENTITY_GROUP_BADGE_ICON_OPTIONS.map((option) => option.value),
);

export function isIdentityGroupBadgeIconKey(
  value: string,
): value is IdentityGroupBadgeIconKey {
  return identityGroupBadgeIconKeys.has(value);
}

export function identityExternalBadgeLookupKey(
  sourceType: "admins_core" | "vipcore",
  value: string,
) {
  let key = value
    .normalize("NFKC")
    .trim()
    .replace(/[\s-]+/g, "_")
    .toLocaleUpperCase("en-US");
  if (sourceType === "vipcore") key = key.replace(/^VIP_/, "");
  return `${sourceType}:${key}`;
}
