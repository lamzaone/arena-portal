export type TrustedProfileTheme = {
  key: string;
  className: string;
  previewImageUrl: string | null;
};

// Theme presentation stays in source control. A database entitlement only
// unlocks one of these keys and can never inject CSS, markup, or remote assets
// into a player's public profile.
const trustedProfileThemes = {
  default: {
    key: "default",
    className: "profile-theme-default",
    previewImageUrl: null,
  },
  beta_tester: {
    key: "beta_tester",
    className: "profile-theme-beta-tester",
    previewImageUrl: "/images/economy/profile-themes/beta-tester.svg",
  },
} satisfies Record<string, TrustedProfileTheme>;

export function isTrustedProfileThemeKey(
  value: string | null | undefined,
): value is keyof typeof trustedProfileThemes {
  return Boolean(value && Object.hasOwn(trustedProfileThemes, value));
}

export function isTrustedOwnedProfileThemeKey(
  value: string | null | undefined,
) {
  return value !== "default" && isTrustedProfileThemeKey(value);
}

export function getTrustedProfileTheme(
  value: string | null | undefined,
): TrustedProfileTheme {
  return isTrustedProfileThemeKey(value)
    ? trustedProfileThemes[value]
    : trustedProfileThemes.default;
}
