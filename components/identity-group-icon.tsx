import {
  BadgeCheck,
  BookOpen,
  Bot,
  CircleCheckBig,
  CodeXml,
  Crosshair,
  Crown,
  Diamond,
  Flag,
  Flame,
  Gem,
  Handshake,
  Headphones,
  Heart,
  Medal,
  ShieldCheck,
  Sparkles,
  Star,
  Swords,
  Target,
  Trophy,
  UsersRound,
  Wrench,
  Zap,
  type LucideIcon,
} from "lucide-react";

import {
  isIdentityGroupBadgeIconKey,
  type IdentityGroupBadgeIconKey,
} from "@/lib/content/identity-group-badges";

const icons = {
  shield: ShieldCheck,
  crown: Crown,
  star: Star,
  badge: BadgeCheck,
  sparkles: Sparkles,
  users: UsersRound,
  medal: Medal,
  trophy: Trophy,
  gem: Gem,
  diamond: Diamond,
  swords: Swords,
  crosshair: Crosshair,
  target: Target,
  flame: Flame,
  zap: Zap,
  heart: Heart,
  handshake: Handshake,
  book: BookOpen,
  headphones: Headphones,
  flag: Flag,
  wrench: Wrench,
  code: CodeXml,
  bot: Bot,
  verified: CircleCheckBig,
} satisfies Record<IdentityGroupBadgeIconKey, LucideIcon>;

export function IdentityGroupIcon({
  icon,
  className,
  fallback = "badge",
}: {
  icon: string;
  className?: string;
  fallback?: IdentityGroupBadgeIconKey;
}) {
  const Icon = icons[isIdentityGroupBadgeIconKey(icon) ? icon : fallback];
  return <Icon className={className} aria-hidden="true" />;
}
