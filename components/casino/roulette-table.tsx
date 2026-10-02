"use client";

import type { CSSProperties } from "react";
import type { RouletteBet, RouletteSelection } from "@/lib/casino/types";
import { tokens } from "./client";

const red = new Set([1, 3, 5, 7, 9, 12, 14, 16, 18, 19, 21, 23, 25, 27, 30, 32, 34, 36]);
export const roulettePosition = (selection: RouletteSelection) => `${selection.kind}:${selection.value}`;

export function RouletteTable({ bets, winning, disabled, place }: {
  bets: RouletteBet[];
  winning: Set<string>;
  disabled: boolean;
  place: (selection: RouletteSelection) => void;
}) {
  const cell = (label: string, selection: RouletteSelection, className = "", style?: CSSProperties) => {
    const key = roulettePosition(selection);
    const amount = bets.find(b => roulettePosition(b.selection) === key)?.stakeTokens;
    return (
      <button
        key={key}
        type="button"
        aria-label={selection.kind === "number" ? `Number ${selection.value}` : label}
        className={`roulette-position ${className}`}
        style={style}
        data-winning={winning.has(key)}
        disabled={disabled}
        onClick={() => place(selection)}
      >
        <span>{label}</span>
        {amount !== undefined && (
          <b className="roulette-stack" aria-label={`${tokens(amount)} Tokens placed`}>{tokens(amount)}</b>
        )}
      </button>
    );
  };

  return (
    <div className="roulette-table" aria-label="Roulette betting table">
      <div className="roulette-table-inscription">
        EUROPEAN ROULETTE <span>SINGLE ZERO • PLACE YOUR CHIPS</span>
      </div>
      <div className="roulette-numbers">
        {cell("0", { kind: "number", value: 0 }, "is-zero", { gridColumn: 1, gridRow: "1 / span 3" })}
        {Array.from({ length: 36 }, (_, index) => cell(
          String(index + 1),
          { kind: "number", value: index + 1 },
          red.has(index + 1) ? "is-red" : "is-black",
          { gridColumn: Math.floor(index / 3) + 2, gridRow: 3 - index % 3 },
        ))}
        {([3, 2, 1] as const).map((value, index) => cell(
          `Column ${value}`,
          { kind: "column", value },
          "is-column",
          { gridColumn: 14, gridRow: index + 1, "--mobile-column": value } as CSSProperties,
        ))}
      </div>
      <div className="roulette-dozens">
        {([1, 2, 3] as const).map(value => cell(
          `${value === 1 ? "1st" : value === 2 ? "2nd" : "3rd"} 12`,
          { kind: "dozen", value },
        ))}
      </div>
      <div className="roulette-outside">
        {cell("1–18", { kind: "range", value: "low" })}
        {cell("Even", { kind: "parity", value: "even" })}
        {cell("Red", { kind: "color", value: "red" }, "is-red")}
        {cell("Black", { kind: "color", value: "black" }, "is-black")}
        {cell("Odd", { kind: "parity", value: "odd" })}
        {cell("19–36", { kind: "range", value: "high" })}
      </div>
    </div>
  );
}
