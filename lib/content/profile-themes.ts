export type ProfileThemeSurface = "profile" | "rankingEntry";

export type ProfileThemeSurfacePresentation = {
  className: string;
  badge?: {
    className: string;
    detail: string;
    icon: "crown" | "zap";
    label: string;
  };
};

type ProfileThemeSurfaces = Partial<
  Record<ProfileThemeSurface, ProfileThemeSurfacePresentation>
> & {
  profile: ProfileThemeSurfacePresentation;
};

export type TrustedProfileTheme = {
  key: string;
  displayName: string;
  previewImageUrl: string | null;
  surfaces: ProfileThemeSurfaces;
};

// Theme presentation and surface support stay in source control. A database
// entitlement only unlocks one of these keys and can never inject CSS, markup,
// or remote assets into a player's profile or another public portal surface.
const trustedProfileThemes = {
  default: {
    key: "default",
    displayName: "ARENA default",
    previewImageUrl: null,
    surfaces: {
      profile: { className: "profile-theme-default" },
    },
  },
  beta_tester: {
    key: "beta_tester",
    displayName: "BETA TESTER",
    previewImageUrl: "/images/economy/profile-themes/beta-tester.svg",
    surfaces: {
      profile: {
        className: "profile-theme-beta-tester",
        badge: {
          className: "beta-tester-theme-badge",
          detail: "Profile theme",
          icon: "zap",
          label: "BETA TESTER",
        },
      },
      rankingEntry: {
        className: "ranking-theme-beta-tester",
        badge: {
          className: "leaderboard-theme-badge",
          detail: "Theme",
          icon: "zap",
          label: "BETA TESTER",
        },
      },
    },
  },
  tap_god: {
    key: "tap_god",
    displayName: "TAP GOD",
    previewImageUrl: "/images/economy/profile-themes/tap-god.svg",
    surfaces: {
      profile: {
        className: "profile-theme-tap-god",
        badge: {
          className: "tap-god-theme-badge",
          detail: "Profile theme",
          icon: "crown",
          label: "TAP GOD",
        },
      },
      rankingEntry: {
        className: "ranking-theme-tap-god",
        badge: {
          className: "leaderboard-theme-badge tap-god-leaderboard-theme-badge",
          detail: "Theme",
          icon: "crown",
          label: "TAP GOD",
        },
      },
    },
  },
} satisfies Record<string, TrustedProfileTheme>;

export function isTrustedProfileThemeKey(
  value: string | null | undefined,
): value is keyof typeof trustedProfileThemes {
  return Boolean(value && Object.hasOwn(trustedProfileThemes, value));
}

export function isTrustedOwnedProfileThemeKey(
  value: string | null | undefined,
): value is Exclude<keyof typeof trustedProfileThemes, "default"> {
  return value !== "default" && isTrustedProfileThemeKey(value);
}

export function getTrustedProfileTheme(
  value: string | null | undefined,
): TrustedProfileTheme {
  return isTrustedProfileThemeKey(value)
    ? trustedProfileThemes[value]
    : trustedProfileThemes.default;
}

export function getTrustedProfileThemeSurface(
  value: string | null | undefined,
  surface: ProfileThemeSurface,
): ProfileThemeSurfacePresentation | null {
  return getTrustedProfileTheme(value).surfaces[surface] ?? null;
}
