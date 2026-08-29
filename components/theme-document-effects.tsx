"use client";

import { useEffect } from "react";

import { PORTAL_THEME_CHANGE_EVENT } from "@/lib/themes/runtime";
import type { PortalThemeDocumentEffects } from "@/lib/themes/types";

export function ThemeDocumentEffects({
  effects,
}: {
  effects: PortalThemeDocumentEffects | undefined;
}) {
  const cursorGrid = effects?.cursorGrid;

  useEffect(() => {
    if (!cursorGrid) return;

    const root = document.documentElement;
    const previousCursorGrid = root.getAttribute("data-theme-cursor-grid");
    root.setAttribute("data-theme-cursor-grid", cursorGrid);
    window.dispatchEvent(new Event(PORTAL_THEME_CHANGE_EVENT));

    return () => {
      if (previousCursorGrid === null) {
        root.removeAttribute("data-theme-cursor-grid");
      } else {
        root.setAttribute("data-theme-cursor-grid", previousCursorGrid);
      }
      window.dispatchEvent(new Event(PORTAL_THEME_CHANGE_EVENT));
    };
  }, [cursorGrid]);

  return null;
}
