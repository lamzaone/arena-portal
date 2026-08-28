"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { Archive, Coins, Gift, MessageSquare, Shield, ShoppingBag, Ticket, TicketCheck, UserRound } from "lucide-react";

const links = [
  { href: "/dashboard", label: "Profile", icon: UserRound },
  { href: "/inventory", label: "Inventory", icon: Archive },
  { href: "/crates", label: "Crates", icon: Gift },
  { href: "/market", label: "Market", icon: ShoppingBag },
  { href: "/redeem", label: "Redeem", icon: TicketCheck },
  { href: "/trades", label: "Trades", icon: Coins },
  { href: "/appeals", label: "Ban appeals", icon: Shield },
  { href: "/tickets", label: "Tickets", icon: Ticket }
];

export function AccountNav() {
  const pathname = usePathname();

  return (
    <nav className="account-nav" aria-label="Account navigation">
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
