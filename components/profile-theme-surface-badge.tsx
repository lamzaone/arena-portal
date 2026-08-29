import {
  type ProfileThemeSurface,
} from "@/lib/content/profile-themes";
import {
  getPortalTheme,
  getPortalThemeSurface,
} from "@/lib/themes/registry";
import { ThemeIcon } from "@/components/theme-runtime-assets";
import type { PortalThemeSurface } from "@/lib/themes/types";

type ProfileThemeSurfaceBadgeProps = {
  surface: ProfileThemeSurface | PortalThemeSurface;
  themeKey: string | null | undefined;
};

const surfaceClassNames: Record<
  ProfileThemeSurface | PortalThemeSurface,
  string
> = {
  global: "is-global",
  profile: "is-profile",
  rankingEntry: "is-ranking-entry",
  smallProfile: "is-small-profile",
};

export function ProfileThemeSurfaceBadge({
  surface,
  themeKey,
}: ProfileThemeSurfaceBadgeProps) {
  const theme = getPortalTheme(themeKey);
  const canonicalSurface =
    surface === "rankingEntry" ? "smallProfile" : surface;
  const badge = getPortalThemeSurface(themeKey, canonicalSurface)?.badge;
  if (!badge) return null;

  return (
    <span
      className={`profile-theme-surface-badge ${surfaceClassNames[surface]} ${badge.className}`}
      data-profile-theme-badge={theme.key}
      data-theme={theme.key}
      data-theme-surface={
        canonicalSurface === "smallProfile"
          ? "small-profile"
          : canonicalSurface
      }
    >
      <ThemeIcon name={badge.icon} aria-hidden="true" />
      <span>{badge.label}</span>
      <small>{badge.detail}</small>
    </span>
  );
}
