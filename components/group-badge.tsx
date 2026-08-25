import { Crown, ShieldCheck } from "lucide-react";
import type { CSSProperties } from "react";

import { getGroupPresentation, type RoleKind } from "@/lib/content/group-presentation";

type GroupBadgeProps = {
  kind: RoleKind;
  group: string;
  className?: string;
};

export function GroupBadge({ kind, group, className = "" }: GroupBadgeProps) {
  const presentation = getGroupPresentation(kind, group);
  const Icon = kind === "vip" ? Crown : ShieldCheck;
  return <span className={`role-badge role-badge-${kind} ${className}`.trim()} style={{ "--role-color": presentation.color, "--role-soft": presentation.softColor } as CSSProperties}><Icon aria-hidden="true" /> <span>{kind === "vip" ? "VIP" : "ADMIN"}</span> {presentation.name}</span>;
}
