"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useId, useRef, useState } from "react";
import { NavigationIndicator } from "@/components/ui/navigation-indicator";

import { isPrimaryNavigationLinkActive } from "./primary-navigation-routes";

const primaryLinks = [
  { href: "/", label: "Home" },
  { href: "/modes", label: "Modes" },
  { href: "/vip", label: "VIP" },
  { href: "/ranking", label: "Ranking" },
  { href: "/staff", label: "Staff" },
] as const;

function PrimaryNavigationLinks({ pathname }: { pathname: string | null }) {
  return primaryLinks.map(({ href, label }, index) => {
    const active = isPrimaryNavigationLinkActive(pathname, href);

    return (
      <Link
        key={href}
        href={href}
        className={active ? "active" : ""}
        aria-current={active ? "page" : undefined}
      >
        <span className="nav-index" aria-hidden="true">0{index + 1}</span>
        <span>{label}</span>
      </Link>
    );
  });
}

export function PrimaryNavigation() {
  const pathname = usePathname();
  const menuRef = useRef<HTMLDivElement>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const [open, setOpen] = useState(false);
  const [openedPath, setOpenedPath] = useState(pathname);
  const menuId = useId();
  const expanded = open && openedPath === pathname;

  useEffect(() => { setOpen(false); }, [pathname]);

  useEffect(() => {
    const menu = menuRef.current;
    if (!menu) return;
    const closeOutside = (event: PointerEvent) => {
      if (event.target instanceof Node && !menu.contains(event.target)) setOpen(false);
    };
    const closeWithEscape = (event: KeyboardEvent) => {
      if (event.key === "Escape" && expanded) {
        setOpen(false);
        triggerRef.current?.focus();
      }
    };
    document.addEventListener("pointerdown", closeOutside);
    document.addEventListener("keydown", closeWithEscape);
    const desktop = window.matchMedia("(min-width: 1101px)");
    const closeDesktop = () => { if (desktop.matches) setOpen(false); };
    desktop.addEventListener("change", closeDesktop);
    return () => {
      document.removeEventListener("pointerdown", closeOutside);
      document.removeEventListener("keydown", closeWithEscape);
      desktop.removeEventListener("change", closeDesktop);
    };
  }, [expanded]);

  return (
    <>
      <nav className="main-nav" aria-label="Primary navigation">
        <NavigationIndicator />
        <PrimaryNavigationLinks pathname={pathname} />
      </nav>
      <div ref={menuRef} className="mobile-nav" data-open={expanded}>
        <button
          ref={triggerRef}
          className="mobile-nav-trigger"
          type="button"
          aria-label={expanded ? "Close navigation menu" : "Open navigation menu"}
          aria-expanded={expanded}
          aria-controls={menuId}
          onClick={() => { setOpenedPath(pathname); setOpen(!expanded); }}
        >
          <span /><span />
        </button>
        <nav id={menuId} aria-label="Primary navigation" inert={!expanded} onClick={(event) => {
          if (event.target instanceof Element && event.target.closest("a") && menuRef.current) {
            setOpen(false);
          }
        }}>
          <PrimaryNavigationLinks pathname={pathname} />
        </nav>
      </div>
    </>
  );
}
