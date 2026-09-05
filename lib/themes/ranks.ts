import type { PortalThemeDefinition, PortalThemeIconKey } from "@/lib/themes/types";

type RankThemeOptions = {
  name: string;
  family: "vip" | "staff";
  level: 1 | 2 | 3 | 4 | 5;
  color: string;
  icon: PortalThemeIconKey;
};

// Source-controlled colors match the group's public badge palette. Membership
// and entitlement are handled by group rewards; this module grants no access.
const rankThemeOptions = {
  vip_silver: { name: "VIP Silver", family: "vip", level: 1, color: "#c8d0df", icon: "medal" },
  vip_gold: { name: "VIP Gold", family: "vip", level: 2, color: "#ffd34d", icon: "medal" },
  vip_diamond: { name: "VIP Diamond", family: "vip", level: 3, color: "#58b8ff", icon: "gem" },
  vip_ultimate: { name: "VIP Ultimate", family: "vip", level: 4, color: "#b46cff", icon: "sparkles" },
  staff: { name: "Staff", family: "staff", level: 1, color: "#b9bfd0", icon: "shield" },
  moderator: { name: "Moderator", family: "staff", level: 2, color: "#6ce5bd", icon: "shieldCheck" },
  administrator: { name: "Administrator", family: "staff", level: 3, color: "#ffb56a", icon: "shieldCheck" },
  senior_administrator: { name: "Sr. Administrator", family: "staff", level: 4, color: "#b192ff", icon: "shieldCheck" },
  owner: { name: "Owner", family: "staff", level: 5, color: "#e60000", icon: "crown" },
} as const satisfies Record<string, RankThemeOptions>;

export type RankThemeKey = keyof typeof rankThemeOptions;

function defineRankTheme<Key extends RankThemeKey>(key: Key): PortalThemeDefinition & { key: Key } {
  const { name, family, level, color, icon } = rankThemeOptions[key];
  const slug = key.replaceAll("_", "-");
  const classes = `rank-theme rank-theme-${slug} rank-level-${level}`;
  const global = level >= 3;
  return {
    key,
    displayName: name,
    previewImageUrl: `/images/economy/profile-themes/${slug}.svg`,
    progression: {
      family,
      level,
      accentColor: color,
      features: [
        "Signature palette", "Avatar crest",
        ...(level >= 2 ? ["Animated highlights"] : []),
        ...(global ? ["Themed site UI", "Public player cards", "Ambient light"] : []),
        ...(level >= 4 ? ["Orbit details", "Drifting particles"] : []),
        ...(level >= 5 ? ["Crown halo", "Layered crest"] : []),
      ],
    },
    surfaces: {
      profile: {
        className: `profile-theme-rank ${classes}`,
        avatarAdornment: { className: "rank-avatar-mark", icon },
        badge: { className: "rank-theme-badge", detail: "Profile theme", icon, label: name },
        background: "rankAtmosphere",
        documentEffects: { cursorGrid: "hidden" },
      },
      global: global ? {
        className: `global-theme-rank ${classes}`,
        background: "rankAtmosphere",
        documentEffects: { cursorGrid: "hidden" },
      } : false,
      smallProfile: global ? {
        className: `small-profile-theme-rank ${classes}`,
        badge: { className: "rank-compact-badge leaderboard-theme-badge", detail: "Theme", icon, label: name },
      } : false,
      playerContainer: global ? { className: `player-container-theme-rank ${classes}` } : false,
    },
  };
}

export const rankThemes = {
  vip_silver: defineRankTheme("vip_silver"),
  vip_gold: defineRankTheme("vip_gold"),
  vip_diamond: defineRankTheme("vip_diamond"),
  vip_ultimate: defineRankTheme("vip_ultimate"),
  staff: defineRankTheme("staff"),
  moderator: defineRankTheme("moderator"),
  administrator: defineRankTheme("administrator"),
  senior_administrator: defineRankTheme("senior_administrator"),
  owner: defineRankTheme("owner"),
} satisfies Record<RankThemeKey, PortalThemeDefinition>;
