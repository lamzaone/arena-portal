"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { Archive, Crosshair, Coins, Link2, Settings2, Shield, ShoppingBag, Ticket, TicketCheck, UserRound } from "lucide-react";
import { useEffect, useRef } from "react";
import { NavigationIndicator } from "@/components/ui/navigation-indicator";
import { isPrimaryNavigationLinkActive } from "./primary-navigation-routes";

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
  const navRef = useRef<HTMLElement>(null);
  const activeHref = settingsActive ? "/settings" : pathname;
  const links = [
    { href: profileHref, label: "Profile", icon: UserRound },
    ...accountLinks,
    { href: "/settings", label: "Settings", icon: Settings2 },
  ];

  useEffect(() => {
    const nav = navRef.current;
    const current = nav?.querySelector<HTMLElement>('[aria-current="page"]');
    if (!nav || !current) return;
    // Scroll only the rail, preserving the page's scroll restoration.
    nav.scrollTo({ left: current.offsetLeft - (nav.clientWidth - current.offsetWidth) / 2, behavior: "instant" });
  }, [activeHref]);

  return (
    <nav
      ref={navRef}
      className="account-nav"
      aria-label="Account navigation"
      data-theme={themeKey}
      data-theme-surface="global"
    >
      <NavigationIndicator />
      {links.map(({ href, label, icon: Icon }) => (
        <Link
          key={href}
          href={href}
          className={isPrimaryNavigationLinkActive(activeHref, href) ? "active" : ""}
          aria-current={isPrimaryNavigationLinkActive(activeHref, href) ? "page" : undefined}
          data-group-start={href === "/appeals" || href === "/settings" ? "true" : undefined}
        >
          <Icon aria-hidden="true" /><span>{label}</span>
        </Link>
      ))}
    </nav>
  );
}
