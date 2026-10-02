"use client";

import { useEffect, useRef, useState } from "react";

export const roulettePockets = [0, 32, 15, 19, 4, 21, 2, 25, 17, 34, 6, 27, 13, 36, 11, 30, 8, 23, 10, 5, 24, 16, 33, 1, 20, 14, 31, 9, 22, 18, 29, 7, 28, 12, 35, 3, 26];
const red = new Set([1, 3, 5, 7, 9, 12, 14, 16, 18, 19, 21, 23, 25, 27, 30, 32, 34, 36]);
const point = (angle: number, radius: number) => [200 + Math.sin(angle) * radius, 200 - Math.cos(angle) * radius];
const pocketAngle = (number: number) => (roulettePockets.indexOf(number) + .5) / 37 * 360;

export function RouletteWheel({ roundId, number, color, onRevealing }: {
  roundId: string | null;
  number: number | null;
  color?: string;
  onRevealing: (value: boolean) => void;
}) {
  const seen = useRef(roundId);
  const angle = useRef(-pocketAngle(number ?? 0));
  const [frame, setFrame] = useState({ wheel: angle.current, ball: 0, radius: 166, revealing: false });

  useEffect(() => {
    if (!roundId || seen.current === roundId) return;
    seen.current = roundId;
    const reduced = window.matchMedia('(prefers-reduced-motion: reduce)');
    const target = -pocketAngle(number ?? 0);
    const startAngle = angle.current;
    const endAngle = startAngle + 1440 + ((target - startAngle) % 360 + 360) % 360;
    let raf = 0;
    const start = performance.now();

    const finish = () => {
      cancelAnimationFrame(raf);
      angle.current = endAngle;
      setFrame({ wheel: endAngle, ball: 0, radius: 166, revealing: false });
      onRevealing(false);
    };
    if (reduced.matches || document.hidden) {
      finish();
      return;
    }
    onRevealing(true);

    const tick = (now: number) => {
      const progress = Math.min(1, (now - start) / 3900);
      // Integrated smooth velocity: short acceleration, then a long brake.
      // Both tracks share this continuous curve and retain opposite directions.
      const launch = .16;
      const phase = progress < launch ? progress / launch : (progress - launch) / (1 - launch);
      const ease = progress < launch
        ? launch * (2 * phase ** 3 - phase ** 4)
        : launch + (1 - launch) * (2 * phase - 2 * phase ** 3 + phase ** 4);
      const landing = Math.max(0, (progress - .65) / .35);
      setFrame({
        wheel: startAngle + (endAngle - startAngle) * ease,
        ball: 1800 * (1 - ease),
        radius: 182 - 16 * (1 - (1 - landing) ** 2),
        revealing: progress < 1,
      });
      if (progress < 1) raf = requestAnimationFrame(tick);
      else finish();
    };
    raf = requestAnimationFrame(tick);

    const visibility = () => { if (document.hidden) finish(); };
    const motion = () => { if (reduced.matches) finish(); };
    document.addEventListener('visibilitychange', visibility);
    reduced.addEventListener('change', motion);
    return () => {
      cancelAnimationFrame(raf);
      document.removeEventListener('visibilitychange', visibility);
      reduced.removeEventListener('change', motion);
    };
  }, [roundId, number, onRevealing]);

  const ball = point(frame.ball * Math.PI / 180, frame.radius);
  return (
    <div className="roulette-wheel-wrap">
      <svg
        viewBox="0 0 400 400"
        role="img"
        aria-label={number === null ? "European roulette wheel" : `Roulette wheel: ${number}, ${color}`}
        className="roulette-wheel"
        data-revealing={frame.revealing}
      >
        <defs>
          <radialGradient id="casino-metal">
            <stop stopColor="#f9e8b2" />
            <stop offset=".5" stopColor="#96784b" />
            <stop offset=".76" stopColor="#dec78b" />
            <stop offset="1" stopColor="#59452c" />
          </radialGradient>
          <radialGradient id="casino-hub">
            <stop stopColor="#4b3930" />
            <stop offset="1" stopColor="#171519" />
          </radialGradient>
        </defs>
        <circle cx="200" cy="200" r="194" fill="url(#casino-metal)" />
        <circle cx="200" cy="200" r="186" fill="#211b18" stroke="#cbb078" strokeWidth="2" />
        <g className="roulette-rotor" transform={`rotate(${frame.wheel} 200 200)`}>
          {roulettePockets.map((value, index) => {
            const start = index / 37 * 2 * Math.PI;
            const end = (index + 1) / 37 * 2 * Math.PI;
            const a = point(start, 177);
            const b = point(end, 177);
            const c = point(end, 126);
            const d = point(start, 126);
            const text = point((start + end) / 2, 148);
            return (
              <g key={value} data-pocket={value} data-x={text[0]} data-y={text[1]}>
                <path
                  d={`M ${a} A 177 177 0 0 1 ${b} L ${c} A 126 126 0 0 0 ${d} Z`}
                  fill={value === 0 ? "#176e52" : red.has(value) ? "#a12b36" : "#15181a"}
                  stroke="#c4a96d"
                  strokeWidth=".8"
                />
                <text
                  x={text[0]}
                  y={text[1]}
                  textAnchor="middle"
                  dominantBaseline="middle"
                  transform={`rotate(${(index + .5) / 37 * 360},${text[0]},${text[1]})`}
                  fill="#fff5df"
                  fontSize="12"
                  fontWeight="700"
                >
                  {value}
                </text>
              </g>
            );
          })}
          <circle cx="200" cy="200" r="124" fill="url(#casino-hub)" stroke="#b49864" strokeWidth="2" />
          <circle cx="200" cy="200" r="105" fill="none" stroke="#b49864" strokeDasharray="2 5" />
          <path d="M200 118L216 184L282 200L216 216L200 282L184 216L118 200L184 184Z" fill="url(#casino-metal)" />
        </g>
        <circle cx="200" cy="200" r="43" fill="#151719" stroke="#d0b77f" strokeWidth="3" />
        <text x="200" y="213" textAnchor="middle" fill="#f4dfad" fontSize="38" fontWeight="800">
          {frame.revealing ? "•" : number ?? "T"}
        </text>
        <circle className="roulette-ball" cx={ball[0]} cy={ball[1]} r="5.5" fill="#fff8e4" stroke="#b09763" strokeWidth="1.5" />
      </svg>
      <p className="casino-stage-caption" role="status">
        {frame.revealing ? "Revealing spin…" : number === null ? "PLACE YOUR CHIPS" : `${number} / ${color?.toUpperCase()}`}
      </p>
    </div>
  );
}
