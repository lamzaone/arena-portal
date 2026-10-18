"use client";

import { useEffect } from "react";

/** Covers native, React and dialog buttons, including keyboard activations. */
export function ButtonActionGuard() {
  useEffect(() => {
    const clicks = new WeakMap<Element, number>();
    const submissions = new WeakMap<HTMLFormElement, number>();

    function onClick(event: MouseEvent) {
      const button = event.target instanceof Element
        ? event.target.closest('button, input[type="submit"], input[type="button"], input[type="reset"]')
        : null;
      if (!button) return;
      const now = performance.now();
      const previous = clicks.get(button);
      if (previous !== undefined && now - previous < 500) {
        event.preventDefault();
        event.stopImmediatePropagation();
        return;
      }
      clicks.set(button, now);
    }

    function onSubmit(event: SubmitEvent) {
      if (!(event.target instanceof HTMLFormElement)) return;
      const form = event.target;
      const now = performance.now();
      const previous = submissions.get(form);
      if (previous !== undefined && now - previous < 500) {
        event.preventDefault();
        event.stopImmediatePropagation();
        return;
      }
      submissions.set(form, now);
    }

    // Capture runs before React handlers so duplicate actions never reach them.
    document.addEventListener("click", onClick, true);
    document.addEventListener("submit", onSubmit, true);
    return () => {
      document.removeEventListener("click", onClick, true);
      document.removeEventListener("submit", onSubmit, true);
    };
  }, []);
  return null;
}
