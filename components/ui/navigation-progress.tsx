"use client";

import { usePathname, useSearchParams } from "next/navigation";
import { useCallback, useEffect, useRef, useState } from "react";

const NAVIGATION_TIMEOUT_MS = 12_000;

export function announceNavigationStart() {
  window.dispatchEvent(new Event("portal:navigation-start"));
}

function currentThemeKey() {
  const profileOwner = document.querySelector<HTMLElement>(
    '[data-theme-owner="profile"][data-theme]',
  );
  return (
    profileOwner?.dataset.theme ||
    document.documentElement.dataset.theme ||
    "default"
  );
}

function internalNavigation(anchor: HTMLAnchorElement, event: MouseEvent) {
  if (
    event.defaultPrevented ||
    event.button !== 0 ||
    event.metaKey ||
    event.ctrlKey ||
    event.shiftKey ||
    event.altKey ||
    anchor.hasAttribute("download") ||
    (anchor.target && anchor.target.toLocaleLowerCase() !== "_self")
  ) {
    return false;
  }

  let destination: URL;
  try {
    destination = new URL(anchor.href, window.location.href);
  } catch {
    return false;
  }

  if (
    destination.origin !== window.location.origin ||
    !/^https?:$/.test(destination.protocol) ||
    destination.pathname.startsWith("/api/")
  ) {
    return false;
  }

  const current = new URL(window.location.href);
  if (destination.href === current.href) return false;
  if (
    destination.pathname === current.pathname &&
    destination.search === current.search &&
    destination.hash
  ) {
    return false;
  }

  return true;
}

/**
 * Keeps the current route visually stable during App Router navigation. The
 * rail appears only after a short delay, so prefetched transitions do not
 * flash a loading state. Theme data is copied from the profile-owned surface
 * first, then from the active global theme, which keeps future theme files
 * modular without route-specific loading CSS.
 */
export function NavigationProgress() {
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const routeKey = `${pathname}?${searchParams.toString()}`;
  const previousRoute = useRef(routeKey);
  const timeout = useRef<number | null>(null);
  const [active, setActive] = useState(false);
  const [themeKey, setThemeKey] = useState("default");

  const finish = useCallback(() => {
    if (timeout.current !== null) {
      window.clearTimeout(timeout.current);
      timeout.current = null;
    }
    setActive(false);
  }, []);

  const start = useCallback(() => {
    setThemeKey(currentThemeKey());
    setActive(true);
    if (timeout.current !== null) window.clearTimeout(timeout.current);
    timeout.current = window.setTimeout(finish, NAVIGATION_TIMEOUT_MS);
  }, [finish]);

  useEffect(() => {
    if (previousRoute.current === routeKey) return;
    previousRoute.current = routeKey;
    finish();
  }, [finish, routeKey]);

  useEffect(() => {
    const onClick = (event: MouseEvent) => {
      const target = event.target;
      if (!(target instanceof Element)) return;
      const anchor = target.closest<HTMLAnchorElement>("a[href]");
      if (anchor && internalNavigation(anchor, event)) start();
    };
    const onPopState = () => start();
    const onProgrammaticStart = () => start();

    document.addEventListener("click", onClick, true);
    window.addEventListener("popstate", onPopState);
    window.addEventListener("portal:navigation-start", onProgrammaticStart);
    return () => {
      document.removeEventListener("click", onClick, true);
      window.removeEventListener("popstate", onPopState);
      window.removeEventListener("portal:navigation-start", onProgrammaticStart);
      if (timeout.current !== null) window.clearTimeout(timeout.current);
    };
  }, [start]);

  return (
    <>
      <div
        className="navigation-progress"
        data-active={active ? "true" : "false"}
        data-theme={themeKey}
        data-theme-surface="global"
        role="progressbar"
        aria-label="Loading next page"
        aria-hidden={active ? undefined : true}
      >
        <span />
      </div>
      <p className="sr-only" aria-live="polite" role="status">
        {active ? "Loading next page." : ""}
      </p>
    </>
  );
}
