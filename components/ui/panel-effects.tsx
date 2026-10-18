"use client";

import { useEffect } from "react";
import { usePathname } from "next/navigation";
import { VISUAL_EFFECTS_CHANGE } from "./portal-visual-effects";

/** Motion decorates artwork only, keeping controls and fixed overlays stable. */
export function PanelEffects() {
  const pathname = usePathname();

  useEffect(() => {
    const motion = window.matchMedia("(prefers-reduced-motion: no-preference)");
    const pointer = window.matchMedia("(hover: hover) and (pointer: fine)");
    const cards = "[data-panel-light], [data-depth-card], [data-ui='panel'], .panel, [data-ui='item-card'], [data-ui='player-owned-container'], [data-ui='feature-card'], .home-page .bento-card, .modes-page .duel-main-card, .vip-page [data-ui='vip-tier-card']";
    const artwork = "[data-depth-art], .bento-icon, .duel-main-icon, [data-part='artwork'] img, [data-ui='item-artwork'] img";
    let active: HTMLElement | null = null;
    let activeCard: HTMLElement | null = null;
    let frame = 0;

    const reset = () => {
      cancelAnimationFrame(frame);
      frame = 0;
      active?.style.removeProperty("--panel-rotate-x");
      active?.style.removeProperty("--panel-rotate-y");
      active?.removeAttribute("data-panel-depth");
      activeCard?.style.removeProperty("--panel-light-x");
      activeCard?.style.removeProperty("--panel-light-y");
      activeCard?.removeAttribute("data-panel-lit");
      active = null;
      activeCard = null;
    };
    const move = (event: PointerEvent) => {
      if (!motion.matches || !pointer.matches || event.pointerType === "touch" || document.documentElement.dataset.visualMotion === "paused") { reset(); return; }
      const card = event.target instanceof Element ? event.target.closest<HTMLElement>(cards) : null;
      if (card?.closest('[data-paused="true"]')) { reset(); return; }
      const target = Array.from(card?.querySelectorAll<HTMLElement>(artwork) ?? []).find(element => element.closest(cards) === card) ?? null;
      if (activeCard !== card || active !== target) reset();
      if (!card) return;
      active = target;
      activeCard = card;
      const bounds = card.getBoundingClientRect();
      const x = Math.max(-1, Math.min(1, (event.clientX - bounds.left) / bounds.width * 2 - 1));
      const y = Math.max(-1, Math.min(1, (event.clientY - bounds.top) / bounds.height * 2 - 1));
      const depth = Math.max(.4, Math.min(1.6, Number.parseFloat(getComputedStyle(card).getPropertyValue("--theme-effect-depth")) || .65));
      cancelAnimationFrame(frame);
      frame = requestAnimationFrame(() => {
        card.dataset.panelLit = "true";
        card.style.setProperty("--panel-light-x", `${(x + 1) * 50}%`);
        card.style.setProperty("--panel-light-y", `${(y + 1) * 50}%`);
        if (target) {
          target.dataset.panelDepth = "active";
          target.style.setProperty("--panel-rotate-x", `${-y * 5 * depth}deg`);
          target.style.setProperty("--panel-rotate-y", `${x * 7 * depth}deg`);
        }
      });
    };

    document.addEventListener("pointermove", move, { passive: true });
    document.documentElement.addEventListener("pointerleave", reset);
    window.addEventListener("blur", reset);
    window.addEventListener(VISUAL_EFFECTS_CHANGE, reset);
    motion.addEventListener("change", reset);
    pointer.addEventListener("change", reset);
    return () => {
      reset();
      document.removeEventListener("pointermove", move);
      document.documentElement.removeEventListener("pointerleave", reset);
      window.removeEventListener("blur", reset);
      window.removeEventListener(VISUAL_EFFECTS_CHANGE, reset);
      motion.removeEventListener("change", reset);
      pointer.removeEventListener("change", reset);
    };
  }, [pathname]);

  return null;
}
