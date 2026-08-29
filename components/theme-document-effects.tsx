"use client";

import { useEffect, useRef } from "react";

import { PORTAL_THEME_CHANGE_EVENT } from "@/lib/themes/runtime";
import type { PortalThemeDocumentEffects } from "@/lib/themes/types";

type EffectRegistration = {
  cursorGrid: NonNullable<PortalThemeDocumentEffects["cursorGrid"]>;
  priority: number;
  sequence: number;
};

const registrations = new Map<symbol, EffectRegistration>();
let registrationSequence = 0;
let baselineCursorGrid: string | null = null;
let hasBaseline = false;

function setCursorGrid(value: string | null) {
  const root = document.documentElement;
  const current = root.getAttribute("data-theme-cursor-grid");
  if (current === value) return;

  if (value === null) root.removeAttribute("data-theme-cursor-grid");
  else root.setAttribute("data-theme-cursor-grid", value);

  window.dispatchEvent(new Event(PORTAL_THEME_CHANGE_EVENT));
}

function syncDocumentEffects() {
  let winner: EffectRegistration | undefined;

  for (const registration of registrations.values()) {
    if (
      !winner ||
      registration.priority > winner.priority ||
      (registration.priority === winner.priority &&
        registration.sequence > winner.sequence)
    ) {
      winner = registration;
    }
  }

  setCursorGrid(winner?.cursorGrid ?? (hasBaseline ? baselineCursorGrid : null));
}

export function ThemeDocumentEffects({
  effects,
  priority = 0,
}: {
  effects: PortalThemeDocumentEffects;
  priority?: number;
}) {
  const cursorGrid = effects.cursorGrid ?? "visible";
  const registrationId = useRef(Symbol("theme-document-effects"));

  useEffect(() => {
    if (registrations.size === 0) {
      baselineCursorGrid = document.documentElement.getAttribute(
        "data-theme-cursor-grid",
      );
      hasBaseline = true;
    }

    const id = registrationId.current;
    registrations.set(id, {
      cursorGrid,
      priority,
      sequence: ++registrationSequence,
    });
    syncDocumentEffects();

    return () => {
      registrations.delete(id);
      syncDocumentEffects();

      if (registrations.size === 0) {
        baselineCursorGrid = null;
        hasBaseline = false;
      }
    };
  }, [cursorGrid, priority]);

  return null;
}
