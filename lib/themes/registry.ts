import { betaTesterTheme } from "@/lib/themes/beta-tester";
import { defaultTheme } from "@/lib/themes/default";
import { tapGodTheme } from "@/lib/themes/tap-god";
import { rankThemes } from "@/lib/themes/ranks";
import type {
  PortalThemeDefinition,
  PortalThemeSurface,
  PortalThemeSurfaceMap,
} from "@/lib/themes/types";

// Presentation remains source-controlled. Database entitlements may select a
// key from this registry, but can never inject classes, markup, or assets.
export const portalThemes = {
  default: defaultTheme,
  beta_tester: betaTesterTheme,
  tap_god: tapGodTheme,
  ...rankThemes,
} as const satisfies Record<string, PortalThemeDefinition>;

export type PortalThemeKey = keyof typeof portalThemes;

export function isPortalThemeKey(
  value: string | null | undefined,
): value is PortalThemeKey {
  return Boolean(value && Object.hasOwn(portalThemes, value));
}

export function isOwnedPortalThemeKey(
  value: string | null | undefined,
): value is Exclude<PortalThemeKey, "default"> {
  return value !== "default" && isPortalThemeKey(value);
}

export function getPortalTheme(
  value: string | null | undefined,
): PortalThemeDefinition {
  return isPortalThemeKey(value) ? portalThemes[value] : portalThemes.default;
}

export function getPortalThemeSurface<Surface extends PortalThemeSurface>(
  value: string | null | undefined,
  surface: Surface,
): PortalThemeSurfaceMap[Surface] | null {
  return (getPortalTheme(value).surfaces[surface] ||
    null) as PortalThemeSurfaceMap[Surface] | null;
}

export type ResolvedPortalThemeSurface<Surface extends PortalThemeSurface> = {
  surface: PortalThemeSurfaceMap[Surface];
  theme: PortalThemeDefinition;
};

/**
 * Resolves an effective presentation. A theme can opt out of any individual
 * surface; that surface then inherits the source-controlled default theme.
 */
export function resolvePortalThemeSurface<Surface extends PortalThemeSurface>(
  value: string | null | undefined,
  surfaceName: Surface,
): ResolvedPortalThemeSurface<Surface> {
  const requestedTheme = getPortalTheme(value);
  const requestedSurface = requestedTheme.surfaces[
    surfaceName
  ] as PortalThemeSurfaceMap[Surface] | false;
  if (requestedSurface) {
    return { surface: requestedSurface, theme: requestedTheme };
  }

  const defaultSurface = portalThemes.default.surfaces[
    surfaceName
  ] as PortalThemeSurfaceMap[Surface] | false;
  if (!defaultSurface) {
    throw new Error(`The default theme must define the ${surfaceName} surface.`);
  }
  return { surface: defaultSurface, theme: portalThemes.default };
}
