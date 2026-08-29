import { Crown, Zap } from "lucide-react";

import {
  getTrustedProfileTheme,
  type ProfileThemeSurface,
} from "@/lib/content/profile-themes";

type ProfileThemeSurfaceBadgeProps = {
  surface: ProfileThemeSurface;
  themeKey: string | null | undefined;
};

const surfaceClassNames: Record<ProfileThemeSurface, string> = {
  profile: "is-profile",
  rankingEntry: "is-ranking-entry",
};

const badgeIcons = { crown: Crown, zap: Zap };

export function ProfileThemeSurfaceBadge({
  surface,
  themeKey,
}: ProfileThemeSurfaceBadgeProps) {
  const theme = getTrustedProfileTheme(themeKey);
  const badge = theme.surfaces[surface]?.badge;
  if (!badge) return null;

  const Icon = badgeIcons[badge.icon];

  return (
    <span
      className={`profile-theme-surface-badge ${surfaceClassNames[surface]} ${badge.className}`}
      data-profile-theme-badge={theme.key}
    >
      <Icon aria-hidden="true" />
      <span>{badge.label}</span>
      <small>{badge.detail}</small>
    </span>
  );
}
