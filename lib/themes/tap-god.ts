import type { PortalThemeDefinition } from "@/lib/themes/types";

export const tapGodTheme = {
  key: "tap_god",
  displayName: "TAP GOD",
  previewImageUrl: "/images/economy/profile-themes/tap-god.svg",
  surfaces: {
    global: {
      className: "global-theme-tap-god",
      background: "tapGodRain",
      documentEffects: { cursorGrid: "hidden" },
    },
    profile: {
      className: "profile-theme-tap-god",
      avatarAdornment: {
        className: "tap-god-avatar-mark",
        icon: "crown",
      },
      background: "tapGodRain",
      documentEffects: { cursorGrid: "hidden" },
      badge: {
        className: "tap-god-theme-badge",
        detail: "Profile theme",
        icon: "crown",
        label: "TAP GOD",
      },
    },
    smallProfile: {
      className: "small-profile-theme-tap-god ranking-theme-tap-god",
      badge: {
        className:
          "leaderboard-theme-badge tap-god-leaderboard-theme-badge",
        detail: "Theme",
        icon: "crown",
        label: "TAP GOD",
      },
    },
  },
} satisfies PortalThemeDefinition;
