import type { CSSProperties } from "react";

type RainDropStyle = CSSProperties & {
  "--rain-x": string;
  "--rain-delay": string;
  "--rain-duration": string;
  "--rain-length": string;
  "--rain-opacity": string;
  "--rain-drift": string;
  "--rain-width": string;
};

const rainDrops = Array.from({ length: 56 }, (_, index) => {
  const style: RainDropStyle = {
    "--rain-x": `${(index * 37 + 11) % 101}%`,
    "--rain-delay": `${-((index * 0.61) % 7.9).toFixed(2)}s`,
    "--rain-duration": `${(2.75 + (index % 9) * 0.27).toFixed(2)}s`,
    "--rain-length": `${88 + (index % 8) * 19}px`,
    "--rain-opacity": `${(0.34 + (index % 6) * 0.1).toFixed(3)}`,
    "--rain-drift": `${-46 + (index % 7) * 11}px`,
    "--rain-width": index % 7 === 0 ? "3px" : "1px",
  };
  return {
    className: `${index % 7 === 0 ? "is-heavy" : ""}${index % 4 === 0 ? " is-distant" : ""}${index % 11 === 0 ? " is-blood-drop" : ""}`.trim(),
    style,
  };
});

export function TapGodRainBackground() {
  return (
    <div className="tap-god-rain-background" aria-hidden="true">
      <span className="tap-god-blood-moon" />
      <span className="tap-god-rain-architecture" />
      <span className="tap-god-rain-haze" />
      <span className="tap-god-blood-tide" />
      <div className="tap-god-rain-field">
        {rainDrops.map((drop, index) => (
          <i className={drop.className} style={drop.style} key={index} />
        ))}
      </div>
      <span className="tap-god-rain-flash" />
    </div>
  );
}
