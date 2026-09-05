import { Crown, Gem, Medal, Shield, ShieldCheck, Sparkles, Zap, type LucideIcon } from "lucide-react";
import type { ComponentType, SVGProps } from "react";

import { TapGodRainBackground } from "@/components/tap-god-rain-background";
import { RankThemeBackground } from "@/components/rank-theme-background";
import type {
  PortalThemeBackgroundKey,
  PortalThemeIconKey,
  PortalThemeSurface,
} from "@/lib/themes/types";

const themeIcons = {
  crown: Crown,
  zap: Zap,
  shield: Shield,
  shieldCheck: ShieldCheck,
  gem: Gem,
  medal: Medal,
  sparkles: Sparkles,
} satisfies Record<PortalThemeIconKey, LucideIcon>;

const themeBackgrounds = {
  tapGodRain: TapGodRainBackground,
  rankAtmosphere: RankThemeBackground,
} satisfies Record<PortalThemeBackgroundKey, ComponentType>;

type ThemeIconProps = SVGProps<SVGSVGElement> & {
  name: PortalThemeIconKey;
};

export function ThemeIcon({ name, ...props }: ThemeIconProps) {
  const Icon = themeIcons[name];
  return <Icon {...props} />;
}

export function ThemeBackground({
  name,
  surface,
  themeKey,
}: {
  name: PortalThemeBackgroundKey;
  surface: Extract<PortalThemeSurface, "global" | "profile">;
  themeKey: string;
}) {
  const Background = themeBackgrounds[name];
  return (
    <div
      className="theme-background-slot"
      data-theme-background={name}
      data-theme-background-surface={surface}
      data-theme-background-theme={themeKey}
    >
      <Background />
    </div>
  );
}
