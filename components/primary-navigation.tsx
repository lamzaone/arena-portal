"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { Menu } from "lucide-react";

import { isPrimaryNavigationLinkActive } from "./primary-navigation-routes";

const primaryLinks = [
  { href: "/", label: "Home" },
  { href: "/modes", label: "Modes" },
  { href: "/vip", label: "VIP" },
  { href: "/ranking", label: "Ranking" },
] as const;

function PrimaryNavigationLinks({ pathname }: { pathname: string | null }) {
  return primaryLinks.map(({ href, label }) => {
    const active = isPrimaryNavigationLinkActive(pathname, href);

    return (
      <Link
        key={href}
        href={href}
        className={active ? "active" : ""}
        aria-current={active ? "page" : undefined}
      >
        {label}
      </Link>
    );
  });
}

export function PrimaryNavigation() {
  const pathname = usePathname();

  return (
    <>
      <nav className="main-nav" aria-label="Primary navigation">
        <PrimaryNavigationLinks pathname={pathname} />
      </nav>
      <details className="mobile-nav">
        <summary aria-label="Primary navigation menu">
          <Menu aria-hidden="true" />
        </summary>
        <nav aria-label="Primary navigation">
          <PrimaryNavigationLinks pathname={pathname} />
        </nav>
      </details>
    </>
  );
}
