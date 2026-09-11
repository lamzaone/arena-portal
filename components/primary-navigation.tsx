"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { Menu } from "lucide-react";
import { useEffect, useRef } from "react";

import { isPrimaryNavigationLinkActive } from "./primary-navigation-routes";

const primaryLinks = [
  { href: "/", label: "Home" },
  { href: "/modes", label: "Modes" },
  { href: "/vip", label: "VIP" },
  { href: "/ranking", label: "Ranking" },
  { href: "/staff", label: "Staff" },
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
  const menuRef = useRef<HTMLDetailsElement>(null);
  const previousPathname = useRef(pathname);

  useEffect(() => {
    const menu = menuRef.current;
    if (!menu) return;
    if (previousPathname.current !== pathname) menu.open = false;
    previousPathname.current = pathname;
    const closeOutside = (event: PointerEvent) => {
      if (event.target instanceof Node && !menu.contains(event.target)) menu.open = false;
    };
    const closeWithEscape = (event: KeyboardEvent) => {
      if (event.key === "Escape" && menu.open) {
        menu.open = false;
        menu.querySelector("summary")?.focus();
      }
    };
    document.addEventListener("pointerdown", closeOutside);
    document.addEventListener("keydown", closeWithEscape);
    return () => {
      document.removeEventListener("pointerdown", closeOutside);
      document.removeEventListener("keydown", closeWithEscape);
    };
  }, [pathname]);

  return (
    <>
      <nav className="main-nav" aria-label="Primary navigation">
        <PrimaryNavigationLinks pathname={pathname} />
      </nav>
      <details ref={menuRef} className="mobile-nav">
        <summary aria-label="Primary navigation menu">
          <Menu aria-hidden="true" />
        </summary>
        <nav aria-label="Primary navigation" onClick={(event) => {
          if (event.target instanceof Element && event.target.closest("a") && menuRef.current) {
            menuRef.current.open = false;
          }
        }}>
          <PrimaryNavigationLinks pathname={pathname} />
        </nav>
      </details>
    </>
  );
}
