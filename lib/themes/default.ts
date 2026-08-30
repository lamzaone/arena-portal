import type { PortalThemeDefinition } from "@/lib/themes/types";

export const defaultTheme = {
  key: "default",
  displayName: "ARENA default",
  previewImageUrl: null,
  surfaces: {
    global: {
      className: "global-theme-default",
    },
    profile: {
      className: "profile-theme-default",
    },
    smallProfile: {
      className: "small-profile-theme-default",
    },
    playerContainer: {
      className: "player-container-theme-default",
    },
  },
} satisfies PortalThemeDefinition;
