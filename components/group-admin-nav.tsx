import {
  Database,
  Gift,
  KeyRound,
  ShieldCheck,
  ShoppingBag,
  Sparkles,
  Tags,
  UsersRound,
} from "lucide-react";

import { SectionNav } from "@/components/ui/section-nav";

export type GroupAdminNavKey =
  | "connected"
  | "create"
  | "membership"
  | "tags"
  | "permissions"
  | "awards"
  | "perks"
  | "listings";

const groupAdminNavItems = [
  {
    key: "connected",
    href: "/admin/groups?tab=connected",
    label: "Connected groups",
    icon: Database,
  },
  {
    key: "create",
    href: "/admin/groups?tab=create",
    label: "Create group",
    icon: ShieldCheck,
  },
  {
    key: "membership",
    href: "/admin/groups?tab=membership",
    label: "Membership",
    icon: UsersRound,
  },
  {
    key: "tags",
    href: "/admin/groups?tab=tags",
    label: "Chat tags",
    icon: Tags,
  },
  {
    key: "permissions",
    href: "/admin/groups?tab=permissions",
    label: "Permissions",
    icon: KeyRound,
  },
  {
    key: "awards",
    href: "/admin/groups?tab=awards",
    label: "Direct awards",
    icon: Gift,
  },
  {
    key: "perks",
    href: "/admin/groups/perks",
    label: "VIP perks",
    icon: Sparkles,
  },
  {
    key: "listings",
    href: "/admin/groups/listings",
    label: "Shop listings",
    icon: ShoppingBag,
  },
] as const;

export function GroupAdminNav({
  activeKey,
  selectedGroupId = null,
}: {
  activeKey: GroupAdminNavKey;
  selectedGroupId?: number | null;
}) {
  const items = groupAdminNavItems.map((item) => ({
    ...item,
    href:
      item.key === "connected" && selectedGroupId !== null
        ? `${item.href}&group=${encodeURIComponent(String(selectedGroupId))}`
        : item.href,
  }));

  return (
    <SectionNav
      activeKey={activeKey}
      ariaLabel="Group management sections"
      dense
      items={items}
    />
  );
}
