"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { Archive, Crosshair, Coins, Link2, Settings2, Shield, ShoppingBag, Ticket, TicketCheck, UserRound } from "lucide-react";

const accountLinks = [
  { href: "/inventory", label: "Inventory", icon: Archive },
  { href: "/loadout", label: "Loadout", icon: Crosshair },
  { href: "/market", label: "Market", icon: ShoppingBag },
  { href: "/redeem", label: "Redeem", icon: TicketCheck },
  { href: "/trades", label: "Trades", icon: Coins },
  { href: "/appeals", label: "Ban appeals", icon: Shield },
  { href: "/tickets", label: "Tickets", icon: Ticket },
  { href: "/discord-link", label: "Discord", icon: Link2 }
];

type AccountNavProps = {
  profileHref: string;
  themeKey: string;
  settingsActive?: boolean;
};

export function AccountNav({ profileHref, themeKey, settingsActive = false }: AccountNavProps) {
  const pathname = usePathname();
  const activeHref = settingsActive ? "/settings" : pathname;
  const links = [
    { href: profileHref, label: "Profile", icon: UserRound },
    ...accountLinks,
    { href: "/settings", label: "Settings", icon: Settings2 },
  ];

  return (
    <nav
      className="account-nav"
      aria-label="Account navigation"
      data-theme={themeKey}
      data-theme-surface="global"
    >
      {links.map(({ href, label, icon: Icon }) => (
        <Link
          key={href}
          href={href}
          className={activeHref === href ? "active" : ""}
          aria-current={activeHref === href ? "page" : undefined}
        >
          <Icon aria-hidden="true" /> {label}
        </Link>
      ))}
    </nav>
  );
}
