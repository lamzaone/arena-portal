"use client";

import { useState } from "react";
import type { RouletteResult, RouletteSelection } from "@/lib/casino/types";
import { GameLayout, Result, StakeField, validStake, type GameClient } from "./client";

const pockets = [0,32,15,19,4,21,2,25,17,34,6,27,13,36,11,30,8,23,10,5,24,16,33,1,20,14,31,9,22,18,29,7,28,12,35,3,26];
const red = new Set([1,3,5,7,9,12,14,16,18,19,21,23,25,27,30,32,34,36]);
const point = (angle: number, radius: number) => [200 + Math.sin(angle) * radius, 200 - Math.cos(angle) * radius];
const options: { label: string; selection: RouletteSelection }[] = [
  { label: "Red · 2x", selection: { kind: "color", value: "red" } }, { label: "Black · 2x", selection: { kind: "color", value: "black" } },
  { label: "Odd · 2x", selection: { kind: "parity", value: "odd" } }, { label: "Even · 2x", selection: { kind: "parity", value: "even" } },
  { label: "Low (1–18) · 2x", selection: { kind: "range", value: "low" } }, { label: "High (19–36) · 2x", selection: { kind: "range", value: "high" } },
  ...([1,2,3] as const).map(value => ({ label: `Dozen ${value} · 3x`, selection: { kind: "dozen", value } as RouletteSelection })),
  ...([1,2,3] as const).map(value => ({ label: `Column ${value} · 3x`, selection: { kind: "column", value } as RouletteSelection })),
];

export function RouletteGame({ client }: { client: GameClient }) {
  const [stake, setStake] = useState(String(client.state.settings.minBet));
  const [choice, setChoice] = useState("0");
  const [number, setNumber] = useState("7");
  const round = client.lastRound?.game === "roulette" ? client.lastRound : client.state.history.find(item => item.game === "roulette") || null;
  const result = round?.details as RouletteResult | undefined;
  const ball = point((pockets.indexOf(result?.number ?? 0) + .5) / 37 * 2 * Math.PI, 166);
  return <GameLayout title="Roulette" subtitle="One spin. Thirty-seven possibilities." stage={<>
    <div className="roulette-caption"><span>EUROPEAN TABLE</span><span>0 — 36</span></div>
    <svg viewBox="0 0 400 400" role="img" aria-label={result ? `Roulette wheel: ${result.number}, ${result.color}` : "European roulette wheel"} className="roulette-wheel" key={round?.id || "idle"}>
      <circle cx="200" cy="200" r="192" className="roulette-rim" /><circle cx="200" cy="200" r="181" fill="#8d7950" />
      {pockets.map((value, index) => {
        const start = index / 37 * 2 * Math.PI, end = (index + 1) / 37 * 2 * Math.PI;
        const a = point(start, 177), b = point(end, 177), c = point(end, 126), d = point(start, 126), text = point((start + end) / 2, 148);
        return <g key={value}><path d={`M ${a} A 177 177 0 0 1 ${b} L ${c} A 126 126 0 0 0 ${d} Z`} fill={value === 0 ? "#155c49" : red.has(value) ? "#9e2337" : "#161a20"} stroke="#b7985a" strokeWidth=".8" /><text x={text[0]} y={text[1]} textAnchor="middle" dominantBaseline="middle" transform={`rotate(${(index + .5) / 37 * 360},${text[0]},${text[1]})`} fill="#fff4df" fontSize="12" fontWeight="700">{value}</text></g>;
      })}
      <circle cx="200" cy="200" r="124" className="roulette-center" /><circle cx="200" cy="200" r="105" fill="none" stroke="#b7985a" strokeWidth="1" strokeDasharray="2 5" /><path d="M 200 118 L 218 184 L 282 200 L 218 216 L 200 282 L 182 216 L 118 200 L 182 184 Z" fill="#b7985a" opacity=".45" />
      <circle cx="200" cy="200" r="42" fill="#121316" stroke="#c6ad78" /><text x="200" y="213" textAnchor="middle" fill="#f3ddaf" fontSize="38" fontWeight="800">{result?.number ?? "T"}</text>
      <circle cx={ball[0]} cy={ball[1]} r="6" fill="#fff7e4" stroke="#aa8d51" strokeWidth="2" />
    </svg><p className="casino-stage-caption">{result ? `${result.number} / ${result.color.toUpperCase()}` : "PLACE YOUR SELECTION"}</p>
  </>} rules={<><p>Single zero. Straight number: 36x. Dozen or column: 3x. Red/black, odd/even, low/high: 2x. Zero loses every outside selection.</p><p>Each pocket has a 1 in 37 chance. The theoretical total return is 36/37 (97.30%). Columns group numbers by their position in the 1–36 table.</p></>}>
    <form noValidate onSubmit={event => { event.preventDefault(); const value = validStake(stake, client); if (value === null) return; const selection = choice === "number" ? { kind: "number", value: Number(number) } as RouletteSelection : options[Number(choice)].selection; if (selection.kind === "number" && (!Number.isSafeInteger(selection.value) || number.trim() === "" || selection.value < 0 || selection.value > 36)) { client.error("Choose a whole roulette number from 0 to 36."); return; } void client.mutate("/api/casino/play", { game: "roulette", stake: value, selection }); }}>
      <StakeField value={stake} onChange={setStake} client={client} />
      <label className="casino-field">Selection<select value={choice} onChange={event => setChoice(event.target.value)} disabled={client.busy || client.blocked}>{options.map((option, index) => <option key={index} value={index}>{option.label}</option>)}<option value="number">Straight number · 36x</option></select></label>
      {choice === "number" && <label className="casino-field">Pocket number<input type="number" min="0" max="36" step="1" value={number} onChange={event => setNumber(event.target.value)} disabled={client.busy || client.blocked} /></label>}
      <p className="casino-control-note">One selection per spin. Your result is saved before it is revealed.</p><button className="casino-primary" disabled={client.busy || client.blocked || !client.state.settings.enabled}>Spin wheel</button>
    </form><Result round={round} />
  </GameLayout>;
}
