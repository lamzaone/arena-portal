"use client";

import { useEffect, type CSSProperties } from "react";

type RainDropStyle = CSSProperties & {
  "--rain-x": string;
  "--rain-delay": string;
  "--rain-duration": string;
  "--rain-length": string;
  "--rain-opacity": string;
  "--rain-drift": string;
  "--rain-width": string;
};

const rainDrops = Array.from({ length: 44 }, (_, index) => {
  const style: RainDropStyle = {
    "--rain-x": `${(index * 37 + 11) % 101}%`,
    "--rain-delay": `${-((index * 0.71) % 8.7).toFixed(2)}s`,
    "--rain-duration": `${(3.15 + (index % 9) * 0.31).toFixed(2)}s`,
    "--rain-length": `${78 + (index % 8) * 17}px`,
    "--rain-opacity": `${(0.25 + (index % 6) * 0.095).toFixed(3)}`,
    "--rain-drift": `${-38 + (index % 7) * 9}px`,
    "--rain-width": index % 9 === 0 ? "2px" : "1px",
  };
  return {
    className: `${index % 9 === 0 ? "is-heavy" : ""}${index % 4 === 0 ? " is-distant" : ""}`.trim(),
    style,
  };
});

const THEME_CHANGE_EVENT = "arena:profile-theme-change";

export function TapGodRainBackground() {
  useEffect(() => {
    const root = document.documentElement;
    root.classList.add("tap-god-theme-active");
    window.dispatchEvent(new Event(THEME_CHANGE_EVENT));

    return () => {
      root.classList.remove("tap-god-theme-active");
      window.dispatchEvent(new Event(THEME_CHANGE_EVENT));
    };
  }, []);

  return (
    <div className="tap-god-rain-background" aria-hidden="true">
      <span className="tap-god-rain-architecture" />
      <span className="tap-god-rain-haze" />
      <div className="tap-god-rain-field">
        {rainDrops.map((drop, index) => (
          <i className={drop.className} style={drop.style} key={index} />
        ))}
      </div>
      <span className="tap-god-rain-flash" />
    </div>
  );
}
