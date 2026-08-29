export const IDENTITY_GROUP_BADGE_ICON_OPTIONS = [
  { value: "shield", label: "Shield" },
  { value: "crown", label: "Crown" },
  { value: "star", label: "Star" },
  { value: "badge", label: "Badge" },
  { value: "sparkles", label: "Sparkles" },
  { value: "users", label: "Users" },
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
