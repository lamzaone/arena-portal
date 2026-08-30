import {
  Archive,
  BadgeCheck,
  Ban,
  Boxes,
  Crown,
  KeyRound,
  ShieldCheck,
  Ticket,
  UsersRound,
} from "lucide-react";

import { SectionNav, type SectionNavItem } from "@/components/ui/section-nav";
import type { AdminAccess } from "@/lib/admin/access";

export const staffModerationSections = [
  { id: "bans", label: "Bans", icon: Ban },
  { id: "admins", label: "Admins", icon: ShieldCheck },
  { id: "vips", label: "VIPs", icon: Crown },
  { id: "appeals", label: "Appeals", icon: BadgeCheck },
  { id: "tickets", label: "Tickets", icon: Ticket },
] as const;

export type StaffModerationSection =
  (typeof staffModerationSections)[number]["id"];
export type StaffSection =
  | StaffModerationSection
  | "groups"
  | "items"
  | "inventories"
  | "redeem";

type StaffSubmenuAccess = Pick<
  AdminAccess,
  "canUnban" | "canViewEconomy" | "canManageEconomy" | "canManageGroups"
>;

export function StaffSubmenu({
  access,
  active,
}: {
  access: StaffSubmenuAccess;
  active: StaffSection;
}) {
  const items: SectionNavItem[] = staffModerationSections
    .filter((section) => section.id !== "appeals" || access.canUnban)
    .map((section) => ({
      key: section.id,
      href: `/admin?tab=${section.id}&page=1`,
      label: section.label,
      icon: section.icon,
    }));

  if (access.canManageGroups) {
    items.push({ key: "groups", href: "/admin/groups", label: "Groups", icon: UsersRound });
  }
  if (access.canViewEconomy) {
    items.push({ key: "items", href: "/admin/items", label: "Items", icon: Boxes });
    items.push({ key: "inventories", href: "/admin/inventories", label: "Inventories", icon: Archive });
  }
  if (access.canManageEconomy) {
    items.push({ key: "redeem", href: "/admin/redeem", label: "Redeem codes", icon: KeyRound });
  }

  return (
    <SectionNav
      activeKey={active}
      ariaLabel="Staff panel sections"
      className="staff-section-menu"
      dense
      items={items}
    />
  );
}
