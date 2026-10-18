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
  { value: "castle", label: "Owner · Castle" },
  { value: "shield_user", label: "Administrator · Shield" },
  { value: "shield_half", label: "Senior staff · Split shield" },
  { value: "shield_question", label: "Trial staff · Shield" },
  { value: "chevrons", label: "Leadership · Chevrons" },
  { value: "command", label: "Command" },
  { value: "landmark", label: "Headquarters" },
  { value: "scroll", label: "Secretary · Scroll" },
  { value: "gavel", label: "Moderator · Gavel" },
  { value: "scales", label: "Fair play · Scales" },
  { value: "key", label: "Access · Key" },
  { value: "megaphone", label: "Community · Megaphone" },
  { value: "graduation", label: "Mentor · Graduation" },
  { value: "helping", label: "Helper · Hand" },
  { value: "gamepad", label: "Player · Gamepad" },
  { value: "siren", label: "Enforcement · Siren" },
  { value: "eye", label: "Observer · Eye" },
  { value: "briefcase", label: "Manager · Briefcase" },
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

export function isCustomGroupBadgeIconKey(value: string): boolean {
  return /^custom\.[a-f0-9]{24}$/.test(value);
}

export function customGroupBadgeIconUrl(value: string): string | null {
  return isCustomGroupBadgeIconKey(value) ? `/api/group-badges/${value.slice(7)}` : null;
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
