import Link from "next/link";
import { ArrowUpRight, KeyRound, ShieldCheck, ShoppingBag, UsersRound, Crown } from "lucide-react";

import styles from "./group-admin-nav.module.css";

export type GroupAdminNavKey = "admin" | "vip" | "custom" | "custom-access" | "perks" | "listings";

export function GroupAdminNav({ activeKey, selectedGroupId = null, canManageGroups = true }: {
  activeKey: GroupAdminNavKey;
  selectedGroupId?: number | null;
  canManageGroups?: boolean;
}) {
  const items = [
    { key: "admin", href: "/admin/groups?tab=admin", label: "Admin", description: "Staff roles & authority", icon: ShieldCheck },
    { key: "vip", href: "/admin/groups?tab=vip", label: "VIP", description: "Tiers, benefits & members", icon: Crown },
    { key: "custom", href: "/admin/groups?tab=custom", label: "Custom", description: "Community groups & rewards", icon: UsersRound },
    ...(canManageGroups ? [
      { key: "custom-access", href: "/admin/groups?tab=custom-access", label: "Custom tags & permissions", description: "Chat styles, privileges & perks", icon: KeyRound },
      { key: "listings", href: "/admin/groups/listings", label: "Shop listings", description: "Membership & perk offers", icon: ShoppingBag },
    ] : []),
  ].map(item => ({ ...item, href: selectedGroupId !== null && item.key === activeKey
    ? `${item.href}${item.href.includes("?") ? "&" : "?"}group=${selectedGroupId}` : item.href }));
  const selectedKey = activeKey === "perks" ? "custom-access" : activeKey;
  return (
    <nav className={`group-admin-menu ${styles.nav}`} aria-label="Group management sections" data-ui="group-admin-nav">
      {items.map(item => {
        const Icon = item.icon;
        const active = selectedKey === item.key;
        return <Link key={item.key} href={item.href} scroll={false} className={styles.item} data-active={active} aria-current={active ? "page" : undefined}>
          <span className={styles.icon}><Icon aria-hidden="true" /></span>
          <span className={styles.copy}><strong>{item.label}</strong><small>{item.description}</small></span>
          <ArrowUpRight className={styles.arrow} aria-hidden="true" />
        </Link>;
      })}
    </nav>
  );
}
