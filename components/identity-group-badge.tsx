import {
  BadgeCheck,
  Crown,
  ShieldCheck,
  Sparkles,
  Star,
  UsersRound,
} from "lucide-react";
import type { CSSProperties } from "react";

import type { EffectiveIdentityGroup } from "@/lib/data/identity-groups";

type IdentityGroupBadgeProps = {
  group: Pick<
    EffectiveIdentityGroup,
    | "displayName"
    | "badgeLabel"
    | "badgeIconKey"
    | "badgeColor"
    | "badgeSoftColor"
    | "sourceType"
  >;
  compact?: boolean;
  className?: string;
};

const icons = {
  badge: BadgeCheck,
  crown: Crown,
  shield: ShieldCheck,
  sparkles: Sparkles,
  star: Star,
  users: UsersRound,
} as const;

export function IdentityGroupBadge({
  group,
  compact = false,
  className = "",
}: IdentityGroupBadgeProps) {
  const Icon = icons[group.badgeIconKey as keyof typeof icons] ?? BadgeCheck;
  const sourceLabel =
    group.sourceType === "admins_core"
      ? "Admin"
      : group.sourceType === "vipcore"
        ? "VIP"
        : "Group";

  return (
    <span
      className={`identity-group-badge${compact ? " is-compact" : ""} ${className}`.trim()}
      style={
        {
          "--identity-badge-color": group.badgeColor,
          "--identity-badge-soft": group.badgeSoftColor,
        } as CSSProperties
      }
      title={`${group.displayName} · ${sourceLabel}`}
    >
      <Icon aria-hidden="true" />
      <span>{group.badgeLabel}</span>
      {!compact ? <small>{group.displayName}</small> : null}
    </span>
  );
}
