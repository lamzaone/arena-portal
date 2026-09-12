import type { PortalThemeDefinition } from "@/lib/themes/types";

export const shadowTheme = {
  key: "shadow",
  displayName: "Shadow",
  description: "Obsidian surfaces, an embossed TAPPED monogram, drifting shadow forms and a moving platinum edge across the site.",
  previewImageUrl: "/images/economy/profile-themes/shadow.svg",
  surfaces: {
    global: {
      className: "global-theme-shadow",
      background: "shadowAtmosphere",
      documentEffects: { cursorGrid: "hidden" },
    },
    profile: {
      className: "profile-theme-shadow",
      background: "shadowAtmosphere",
      heroDecoration: "shadowAura",
      documentEffects: { cursorGrid: "hidden" },
      avatarAdornment: { className: "shadow-avatar-mark", icon: "eclipse" },
      badge: { className: "shadow-theme-badge", detail: "Site theme", icon: "eclipse", label: "SHADOW" },
    },
    smallProfile: {
      className: "small-profile-theme-shadow",
      badge: { className: "leaderboard-theme-badge shadow-theme-badge", detail: "Theme", icon: "eclipse", label: "SHADOW" },
    },
    playerContainer: { className: "player-container-theme-shadow" },
  },
} satisfies PortalThemeDefinition;
