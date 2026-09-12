"use client";

import { useLayoutEffect, useRef } from "react";

/** A single moving surface shared by links; the active link keeps its own rail. */
export function NavigationIndicator() {
  const ref = useRef<HTMLSpanElement>(null);

  useLayoutEffect(() => {
    const indicator = ref.current;
    const track = indicator?.parentElement;
    if (!indicator || !track) return;
    let frame = 0;
    let readyFrame = 0;
    let hovered: HTMLElement | null = null;
    const items = 'a[href], button[role="tab"]';
    const active = () => track.querySelector<HTMLElement>('[aria-current="page"], [aria-selected="true"]');
    const update = () => {
      const focused = track.contains(document.activeElement)
        ? (document.activeElement as Element)?.closest<HTMLElement>(items)
        : null;
      const target = hovered ?? focused ?? active();
      if (!target) {
        indicator.dataset.visible = "false";
        return;
      }
      const bounds = track.getBoundingClientRect();
      const item = target.getBoundingClientRect();
      indicator.style.width = `${item.width}px`;
      indicator.style.height = `${item.height}px`;
      indicator.style.transform = `translate3d(${item.left - bounds.left + track.scrollLeft - track.clientLeft}px, ${item.top - bounds.top + track.scrollTop - track.clientTop}px, 0)`;
      indicator.dataset.visible = "true";
    };
    const schedule = () => {
      cancelAnimationFrame(frame);
      frame = requestAnimationFrame(update);
    };
    const onPointer = (event: PointerEvent) => {
      if (event.pointerType === "touch") return;
      hovered = event.target instanceof Element ? event.target.closest<HTMLElement>(items) : null;
      schedule();
    };
    const leave = () => { hovered = null; schedule(); };
    const observer = new ResizeObserver(schedule);
    observer.observe(track);
    track.querySelectorAll(items).forEach((item) => observer.observe(item));
    const mutations = new MutationObserver(schedule);
    mutations.observe(track, { subtree: true, attributes: true, attributeFilter: ["aria-current", "aria-selected"], childList: true });
    track.addEventListener("pointerover", onPointer);
    track.addEventListener("pointerleave", leave);
    track.addEventListener("focusin", schedule);
    track.addEventListener("focusout", schedule);
    update();
    // Position before enabling interpolation to avoid a slide from the origin.
    readyFrame = requestAnimationFrame(() => { indicator.dataset.ready = "true"; });
    return () => {
      cancelAnimationFrame(frame);
      cancelAnimationFrame(readyFrame);
      observer.disconnect();
      mutations.disconnect();
      track.removeEventListener("pointerover", onPointer);
      track.removeEventListener("pointerleave", leave);
      track.removeEventListener("focusin", schedule);
      track.removeEventListener("focusout", schedule);
    };
  }, []);

  return <span ref={ref} className="navigation-indicator" aria-hidden="true" />;
}
