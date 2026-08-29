import Link from "next/link";

import type { AdminAccess } from "@/lib/admin/access";

export const staffModerationSections = [
  { id: "bans", label: "Bans" },
  { id: "admins", label: "Admins" },
  { id: "vips", label: "VIPs" },
  { id: "appeals", label: "Appeals" },
  { id: "tickets", label: "Tickets" },
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
  const linkClass = (section: StaffSection) =>
    active === section ? "active" : undefined;

  return (
    <nav className="staff-tabs" aria-label="Staff panel sections">
      {staffModerationSections
        .filter((section) => section.id !== "appeals" || access.canUnban)
        .map((section) => (
          <Link
            key={section.id}
            className={linkClass(section.id)}
            href={`/admin?tab=${section.id}&page=1`}
            aria-current={active === section.id ? "page" : undefined}
          >
            {section.label}
          </Link>
        ))}
      {access.canManageGroups ? (
        <Link
          className={linkClass("groups")}
          href="/admin/groups"
          aria-current={active === "groups" ? "page" : undefined}
        >
          Groups
        </Link>
      ) : null}
      {access.canViewEconomy ? (
        <Link
          className={linkClass("items")}
          href="/admin/items"
          aria-current={active === "items" ? "page" : undefined}
        >
          Items
        </Link>
      ) : null}
      {access.canViewEconomy ? (
        <Link
          className={linkClass("inventories")}
          href="/admin/inventories"
          aria-current={active === "inventories" ? "page" : undefined}
        >
          Inventories
        </Link>
      ) : null}
      {access.canManageEconomy ? (
        <Link
          className={linkClass("redeem")}
          href="/admin/redeem"
          aria-current={active === "redeem" ? "page" : undefined}
        >
          Redeem codes
        </Link>
      ) : null}
    </nav>
  );
}
