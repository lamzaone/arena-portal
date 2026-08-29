"use client";

import { useEffect } from "react";

import { PORTAL_THEME_CHANGE_EVENT } from "@/lib/themes/runtime";

export function CursorGridBackground() {
  useEffect(() => {
    const root = document.documentElement;
    const finePointer = window.matchMedia("(pointer: fine)");
    const reducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)");
    let frame = 0;
    let latestPoint: { x: number; y: number } | null = null;
    let renderedPoint = { x: window.innerWidth / 2, y: window.innerHeight * 0.36 };

    const cursorGridHidden = () =>
      root.getAttribute("data-theme-cursor-grid") === "hidden";

    const reset = () => {
      latestPoint = null;
      renderedPoint = { x: window.innerWidth / 2, y: window.innerHeight * 0.36 };
      if (frame) window.cancelAnimationFrame(frame);
      frame = 0;
      root.style.removeProperty("--cursor-grid-x");
      root.style.removeProperty("--cursor-grid-y");
      root.style.removeProperty("--cursor-grid-offset-x");
      root.style.removeProperty("--cursor-grid-offset-y");
    };

    const paint = () => {
      frame = 0;
      if (!latestPoint) return;
      const x = renderedPoint.x + (latestPoint.x - renderedPoint.x) * 0.16;
      const y = renderedPoint.y + (latestPoint.y - renderedPoint.y) * 0.16;
      renderedPoint = { x, y };
      root.style.setProperty("--cursor-grid-x", `${x}px`);
      root.style.setProperty("--cursor-grid-y", `${y}px`);
      root.style.setProperty("--cursor-grid-offset-x", `${(x - window.innerWidth / 2) * -0.028}px`);
      root.style.setProperty("--cursor-grid-offset-y", `${(y - window.innerHeight / 2) * -0.028}px`);
      if (Math.abs(latestPoint.x - x) > 0.25 || Math.abs(latestPoint.y - y) > 0.25) frame = window.requestAnimationFrame(paint);
    };

    const onPointerMove = (event: PointerEvent) => {
      if (cursorGridHidden()) return;
      latestPoint = { x: event.clientX, y: event.clientY };
      if (!frame) frame = window.requestAnimationFrame(paint);
    };

    const sync = () => {
      const enabled =
        finePointer.matches &&
        !reducedMotion.matches &&
        !cursorGridHidden();
      root.classList.toggle("has-cursor-grid", enabled);
      if (!enabled) reset();
    };

    sync();
    window.addEventListener("pointermove", onPointerMove, { passive: true });
    window.addEventListener("blur", reset);
    finePointer.addEventListener("change", sync);
    reducedMotion.addEventListener("change", sync);
    window.addEventListener(PORTAL_THEME_CHANGE_EVENT, sync);
    // Keep older effect components interoperable during the theme migration.
    window.addEventListener("arena:profile-theme-change", sync);

    return () => {
      if (frame) window.cancelAnimationFrame(frame);
      window.removeEventListener("pointermove", onPointerMove);
      window.removeEventListener("blur", reset);
      finePointer.removeEventListener("change", sync);
      reducedMotion.removeEventListener("change", sync);
      window.removeEventListener(PORTAL_THEME_CHANGE_EVENT, sync);
      window.removeEventListener("arena:profile-theme-change", sync);
      root.classList.remove("has-cursor-grid");
      reset();
    };
  }, []);

  return <div className="cursor-grid-background" aria-hidden="true" />;
}
