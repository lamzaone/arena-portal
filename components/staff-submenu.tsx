import {
  Archive,
  ArrowUpRight,
  BadgeCheck,
  Ban,
  Boxes,
  KeyRound,
  Ticket,
  UsersRound,
  ShieldCheck,
} from "lucide-react";
import Link from "next/link";

import type { SectionNavItem } from "@/components/ui/section-nav";
import type { AdminAccess } from "@/lib/admin/access";

export const staffModerationSections = [
  { id: "bans", label: "Bans", icon: Ban },
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
  "isAdmin" | "canUnban" | "canViewEconomy" | "canManageEconomy"
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
      href: `/admin/${section.id}`,
      label: section.label,
      icon: section.icon,
      scroll: true,
    }));

  const community: SectionNavItem[] = access.isAdmin
    ? [{ key: "groups", href: "/admin/groups", label: "Groups & access", icon: UsersRound, scroll: true }]
    : [];
  const economy: SectionNavItem[] = [];
  if (access.canViewEconomy) {
    economy.push({ key: "items", href: "/admin/items", label: "Items", icon: Boxes, scroll: true });
    economy.push({ key: "inventories", href: "/admin/inventories", label: "Inventories", icon: Archive, scroll: true });
  }
  if (access.canManageEconomy) {
    economy.push({ key: "redeem", href: "/admin/redeem", label: "Redeem codes", icon: KeyRound, scroll: true });
  }

  return (
    <nav className="staff-navigation" data-ui="staff-nav" aria-label="Staff panel sections">
      <div className="staff-navigation-heading"><ShieldCheck aria-hidden="true" /><span>Staff workspace</span></div>
      {[
        { label: "Moderation", items },
        { label: "Community", items: community },
        { label: "Economy", items: economy },
      ].filter((group) => group.items.length > 0).map((group) => (
        <div className="staff-navigation-group" key={group.label}>
          <p>{group.label}</p>
          <div className="staff-navigation-links">
            {group.items.map((item) => {
              const Icon = item.icon;
              return <Link key={item.key} href={item.href} scroll={item.scroll} aria-current={item.key === active ? "page" : undefined}>
                {Icon ? <Icon aria-hidden="true" /> : null}<span>{item.label}</span>
              </Link>;
            })}
          </div>
        </div>
      ))}
      <Link href="/" className="staff-navigation-return">Back to site<ArrowUpRight aria-hidden="true" /></Link>
    </nav>
  );
}
