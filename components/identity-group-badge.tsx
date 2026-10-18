import type { CSSProperties } from "react";

import { IdentityGroupIcon } from "@/components/identity-group-icon";
import { IDENTITY_GROUP_BADGE_ICON_OPTIONS } from "@/lib/content/identity-group-badges";
import type { IdentityGroupBadgeData } from "@/lib/data/identity-groups";
import styles from "./identity-group-badge.module.css";

type IdentityGroupBadgeProps = {
  group: IdentityGroupBadgeData;
  compact?: boolean;
  className?: string;
  listItem?: boolean;
};

type IdentityGroupBadgeListProps = {
  groups: readonly IdentityGroupBadgeData[];
  compact?: boolean;
  className?: string;
  label?: string;
};

export const identityGroupBadgeIconOptions =
  IDENTITY_GROUP_BADGE_ICON_OPTIONS;

export function IdentityGroupBadge({
  group,
  compact = false,
  className = "",
  listItem = false,
}: IdentityGroupBadgeProps) {
  const sourceLabel =
    group.sourceType === "admins_core"
      ? "Admins.Core"
      : group.sourceType === "vipcore"
        ? "VIPCore"
        : "Portal";

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
      aria-label={`${group.badgeLabel}, ${group.displayName}, ${sourceLabel} group`}
      role={listItem ? "listitem" : undefined}
    >
      <span className={styles.symbol} aria-hidden="true"><IdentityGroupIcon icon={group.badgeIconKey} /></span>
      <span>{group.badgeLabel}</span>
    </span>
  );
}

export function IdentityGroupBadgeList({
  groups,
  compact = false,
  className = "",
  label = "Player groups",
}: IdentityGroupBadgeListProps) {
  if (!groups.length) return null;

  return (
    <span
      className={`identity-group-badge-list ${className}`.trim()}
      role="list"
      aria-label={label}
    >
      {groups.map((group) => (
        <IdentityGroupBadge
          key={`${group.sourceType}:${group.id}`}
          group={group}
          compact={compact}
          listItem
        />
      ))}
    </span>
  );
}
