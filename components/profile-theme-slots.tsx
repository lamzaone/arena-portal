import { ThemeDocumentEffects } from "@/components/theme-document-effects";
import {
  ThemeBackground,
  ThemeIcon,
} from "@/components/theme-runtime-assets";
import { resolvePortalThemeSurface } from "@/lib/themes/registry";

type ThemeSlotProps = {
  themeKey: string | null | undefined;
};

export function GlobalThemeBackground({ themeKey }: ThemeSlotProps) {
  const { surface, theme } = resolvePortalThemeSurface(themeKey, "global");
  return surface.background ? (
    <ThemeBackground
      name={surface.background}
      surface="global"
      themeKey={theme.key}
    />
  ) : null;
}

export function GlobalThemeDocumentEffects({
  themeKey,
}: ThemeSlotProps) {
  const { surface } = resolvePortalThemeSurface(themeKey, "global");
  return (
    <ThemeDocumentEffects
      effects={{ cursorGrid: surface.documentEffects?.cursorGrid ?? "visible" }}
      priority={0}
    />
  );
}

export function ProfileThemeBackground({ themeKey }: ThemeSlotProps) {
  const { surface, theme } = resolvePortalThemeSurface(themeKey, "profile");
  return surface.background ? (
    <ThemeBackground
      name={surface.background}
      surface="profile"
      themeKey={theme.key}
    />
  ) : null;
}

export function ProfileThemeAvatarAdornment({
  themeKey,
}: ThemeSlotProps) {
  const { surface } = resolvePortalThemeSurface(themeKey, "profile");
  const adornment = surface.avatarAdornment;
  if (!adornment) return null;

  return (
    <span className={adornment.className} aria-hidden="true">
      <ThemeIcon name={adornment.icon} />
    </span>
  );
}

export function ProfileThemeDocumentEffects({
  themeKey,
}: ThemeSlotProps) {
  const { surface } = resolvePortalThemeSurface(themeKey, "profile");
  return (
    <ThemeDocumentEffects
      effects={{ cursorGrid: surface.documentEffects?.cursorGrid ?? "visible" }}
      priority={100}
    />
  );
}
