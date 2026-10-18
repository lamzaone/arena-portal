import type { PortalThemeDefinition } from "@/lib/themes/types";

export const defaultTheme = {
  key: "default",
  displayName: "ARENA default",
  previewImageUrl: null,
  surfaces: {
    global: {
      className: "global-theme-default",
      background: "portalAtmosphere",
      documentEffects: { cursorGrid: "hidden" },
    },
    profile: {
      className: "profile-theme-default",
      background: "portalAtmosphere",
      documentEffects: { cursorGrid: "hidden" },
    },
    smallProfile: {
      className: "small-profile-theme-default",
    },
    playerContainer: {
      className: "player-container-theme-default",
    },
  },
} satisfies PortalThemeDefinition;
