"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { Archive, Crosshair, Coins, Gift, MessageSquare, Shield, ShoppingBag, Ticket, TicketCheck, UserRound } from "lucide-react";

const accountLinks = [
  { href: "/inventory", label: "Inventory", icon: Archive },
  { href: "/loadout", label: "Loadout", icon: Crosshair },
  { href: "/crates", label: "Crates", icon: Gift },
  { href: "/market", label: "Market", icon: ShoppingBag },
  { href: "/redeem", label: "Redeem", icon: TicketCheck },
  { href: "/trades", label: "Trades", icon: Coins },
  { href: "/appeals", label: "Ban appeals", icon: Shield },
  { href: "/tickets", label: "Tickets", icon: Ticket }
];

type AccountNavProps = {
  profileHref: string;
  themeKey: string;
};

export function AccountNav({ profileHref, themeKey }: AccountNavProps) {
  const pathname = usePathname();
  const links = [
    { href: profileHref, label: "Profile", icon: UserRound },
    ...accountLinks,
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
          className={pathname === href ? "active" : ""}
          aria-current={pathname === href ? "page" : undefined}
        >
          <Icon aria-hidden="true" /> {label}
        </Link>
      ))}
      <span className="account-nav-note"><MessageSquare aria-hidden="true" /> Discord link coming with the bot</span>
    </nav>
  );
}
