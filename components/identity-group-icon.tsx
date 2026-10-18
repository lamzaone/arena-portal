"use client";

import { useState } from "react";
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
  Castle, ShieldUser, ShieldHalf, ShieldQuestionMark, ChevronsUp, Command,
  Landmark, ScrollText, Gavel, Scale, KeyRound, Megaphone, GraduationCap,
  HandHelping, Gamepad2, Siren, Eye, BriefcaseBusiness,
} from "lucide-react";

import {
  isIdentityGroupBadgeIconKey,
  customGroupBadgeIconUrl,
  type IdentityGroupBadgeIconKey,
} from "@/lib/content/identity-group-badges";
import styles from "./identity-group-icon.module.css";

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
  castle: Castle,
  shield_user: ShieldUser,
  shield_half: ShieldHalf,
  shield_question: ShieldQuestionMark,
  chevrons: ChevronsUp,
  command: Command,
  landmark: Landmark,
  scroll: ScrollText,
  gavel: Gavel,
  scales: Scale,
  key: KeyRound,
  megaphone: Megaphone,
  graduation: GraduationCap,
  helping: HandHelping,
  gamepad: Gamepad2,
  siren: Siren,
  eye: Eye,
  briefcase: BriefcaseBusiness,
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
  const [failedIcon, setFailedIcon] = useState<string | null>(null);
  const customUrl = customGroupBadgeIconUrl(icon);
  if (customUrl && failedIcon !== icon) {
    return <img src={customUrl} width={24} height={24} alt="" aria-hidden="true" className={`${styles.custom} ${className ?? ""}`.trim()} onError={() => setFailedIcon(icon)} />;
  }
  const Icon = icons[isIdentityGroupBadgeIconKey(icon) ? icon : fallback];
  return <Icon className={className} aria-hidden="true" />;
}
