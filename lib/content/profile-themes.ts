import {
  getPortalTheme,
  getPortalThemeSurface,
  isOwnedPortalThemeKey,
  isPortalThemeKey,
  resolvePortalThemeSurface,
  type PortalThemeKey,
} from "@/lib/themes/registry";
import type {
  PortalThemeDefinition,
  PortalThemeSurfaceDefinition,
} from "@/lib/themes/types";

/** @deprecated Prefer the canonical global/profile/smallProfile surface names. */
export type ProfileThemeSurface =
  | "global"
  | "profile"
  | "smallProfile"
  | "rankingEntry";

export type ProfileThemeSurfacePresentation = PortalThemeSurfaceDefinition;

export type TrustedProfileTheme = Omit<PortalThemeDefinition, "surfaces"> & {
  surfaces: {
    global?: ProfileThemeSurfacePresentation;
    profile: ProfileThemeSurfacePresentation;
    smallProfile?: ProfileThemeSurfacePresentation;
    /** @deprecated Compatibility alias for smallProfile. */
    rankingEntry?: ProfileThemeSurfacePresentation;
  };
};

export function isTrustedProfileThemeKey(
  value: string | null | undefined,
): value is PortalThemeKey {
  return isPortalThemeKey(value);
}

export function isTrustedOwnedProfileThemeKey(
  value: string | null | undefined,
): value is Exclude<PortalThemeKey, "default"> {
  return isOwnedPortalThemeKey(value);
}

/**
 * Compatibility view used by existing profile/settings callers. The canonical
 * registry names the compact public surface smallProfile; rankingEntry remains
 * an alias until all consumers have migrated.
 */
export function getTrustedProfileTheme(
  value: string | null | undefined,
): TrustedProfileTheme {
  const theme = getPortalTheme(value);
  const profile = resolvePortalThemeSurface(value, "profile").surface;
  const global = getPortalThemeSurface(value, "global") ?? undefined;
  const smallProfile =
    getPortalThemeSurface(value, "smallProfile") ?? undefined;

  return {
    key: theme.key,
    displayName: theme.displayName,
    previewImageUrl: theme.previewImageUrl,
    surfaces: {
      ...(global ? { global } : {}),
      profile,
      ...(smallProfile ? { smallProfile, rankingEntry: smallProfile } : {}),
    },
  };
}

export function getTrustedProfileThemeSurface(
  value: string | null | undefined,
  surface: ProfileThemeSurface,
): ProfileThemeSurfacePresentation | null {
  return getPortalThemeSurface(
    value,
    surface === "rankingEntry" ? "smallProfile" : surface,
  );
}
