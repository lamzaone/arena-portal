import type { PortalThemeDefinition } from "@/lib/themes/types";

export const betaTesterTheme = {
  key: "beta_tester",
  displayName: "BETA TESTER",
  previewImageUrl: "/images/economy/profile-themes/beta-tester.svg",
  surfaces: {
    global: {
      className: "global-theme-beta-tester",
    },
    profile: {
      className: "profile-theme-beta-tester",
      avatarAdornment: {
        className: "beta-tester-avatar-mark",
        icon: "zap",
      },
      badge: {
        className: "beta-tester-theme-badge",
        detail: "Profile theme",
        icon: "zap",
        label: "BETA TESTER",
      },
    },
    smallProfile: {
      // Keep the ranking class during the migration. New compact profile
      // objects use the first, surface-oriented class.
      className: "small-profile-theme-beta-tester ranking-theme-beta-tester",
      badge: {
        className: "leaderboard-theme-badge",
        detail: "Theme",
        icon: "zap",
        label: "BETA TESTER",
      },
    },
    playerContainer: {
      className: "player-container-theme-beta-tester ranking-theme-beta-tester",
    },
  },
} satisfies PortalThemeDefinition;
