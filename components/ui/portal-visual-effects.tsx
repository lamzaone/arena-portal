"use client";

import { Pause, Play } from "lucide-react";
import { useEffect, useState } from "react";

export const VISUAL_EFFECTS_CHANGE = "portal:visual-effects-change";

/** Pause decorative motion without interrupting dialogs, loading or game results. */
export function PortalVisualEffects() {
  const [paused, setPaused] = useState(false);
  const [reduced, setReduced] = useState(false);

  useEffect(() => {
    try { setPaused(localStorage.getItem("portal:decorative-motion") === "paused"); } catch { /* Storage is optional. */ }
  }, []);

  useEffect(() => {
    const media = matchMedia("(prefers-reduced-motion: reduce)");
    const sync = () => {
      setReduced(media.matches);
      document.documentElement.dataset.visualMotion = paused || media.matches || document.hidden ? "paused" : "active";
      window.dispatchEvent(new Event(VISUAL_EFFECTS_CHANGE));
    };
    sync();
    media.addEventListener("change", sync);
    document.addEventListener("visibilitychange", sync);
    return () => {
      media.removeEventListener("change", sync);
      document.removeEventListener("visibilitychange", sync);
    };
  }, [paused]);

  function toggle() {
    const next = !paused;
    setPaused(next);
    try { localStorage.setItem("portal:decorative-motion", next ? "paused" : "active"); } catch { /* Storage is optional. */ }
  }
  const label = reduced ? "System reduced motion is enabled" : paused ? "Resume visual effects" : "Pause visual effects";
  return <button className="portal-visual-control" type="button" aria-label={label} title={label} aria-pressed={paused || reduced} onClick={toggle} disabled={reduced}>
    {paused || reduced ? <Play aria-hidden="true" /> : <Pause aria-hidden="true" />}<span>{reduced ? "Reduced motion" : paused ? "Effects paused" : "Visual effects"}</span>
  </button>;
}
