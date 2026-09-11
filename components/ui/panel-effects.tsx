"use client";

import { useEffect } from "react";
import { usePathname } from "next/navigation";

/** Motion decorates artwork only, keeping controls and fixed overlays stable. */
export function PanelEffects() {
  const pathname = usePathname();

  useEffect(() => {
    const motion = window.matchMedia("(prefers-reduced-motion: no-preference)");
    const pointer = window.matchMedia("(hover: hover) and (pointer: fine)");
    const cards = ".home-page .bento-card, .modes-page .duel-main-card, .vip-page [data-ui='vip-tier-card']";
    const artwork = ".bento-icon, .duel-main-icon, [data-part='artwork'] img";
    let active: HTMLElement | null = null;
    let frame = 0;

    const reset = () => {
      cancelAnimationFrame(frame);
      frame = 0;
      active?.style.removeProperty("--panel-rotate-x");
      active?.style.removeProperty("--panel-rotate-y");
      active?.removeAttribute("data-panel-depth");
      active = null;
    };
    const move = (event: PointerEvent) => {
      if (!motion.matches || !pointer.matches || event.pointerType === "touch") return;
      const card = event.target instanceof Element ? event.target.closest<HTMLElement>(cards) : null;
      const target = card?.querySelector<HTMLElement>(artwork) ?? null;
      if (active !== target) reset();
      if (!card || !target) return;
      active = target;
      const bounds = card.getBoundingClientRect();
      const x = Math.max(-1, Math.min(1, (event.clientX - bounds.left) / bounds.width * 2 - 1));
      const y = Math.max(-1, Math.min(1, (event.clientY - bounds.top) / bounds.height * 2 - 1));
      cancelAnimationFrame(frame);
      frame = requestAnimationFrame(() => {
        target.dataset.panelDepth = "active";
        target.style.setProperty("--panel-rotate-x", `${-y * 6}deg`);
        target.style.setProperty("--panel-rotate-y", `${x * 8}deg`);
      });
    };

    document.addEventListener("pointermove", move, { passive: true });
    document.documentElement.addEventListener("pointerleave", reset);
    window.addEventListener("blur", reset);
    motion.addEventListener("change", reset);
    pointer.addEventListener("change", reset);
    return () => {
      reset();
      document.removeEventListener("pointermove", move);
      document.documentElement.removeEventListener("pointerleave", reset);
      window.removeEventListener("blur", reset);
      motion.removeEventListener("change", reset);
      pointer.removeEventListener("change", reset);
    };
  }, [pathname]);

  return null;
}
