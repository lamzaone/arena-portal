"use client";

import { useState } from "react";
import type { PlinkoResult, PlinkoRisk, PlinkoRows } from "@/lib/casino/types";
import { plinkoPaytable } from "@/lib/casino/plinko";
import { GameLayout, Result, StakeField, multiple, validStake, type GameClient } from "./client";

export function PlinkoGame({ client }: { client: GameClient }) {
  const [stake, setStake] = useState(String(client.state.settings.minBet));
  const [rows, setRows] = useState<PlinkoRows>(12);
  const [risk, setRisk] = useState<PlinkoRisk>("medium");
  const round = client.lastRound?.game === "plinko" ? client.lastRound : client.state.history.find(item => item.game === "plinko") || null;
  const result = round?.details as PlinkoResult | undefined;
  const boardRows = result?.rows ?? rows;
  let offset = 0;
  const path = result?.path.map((direction, index) => { offset += direction === 0 ? -1 : 1; return `${210 + offset * 10},${32 + (index + 1) * 17}`; });
  const table = plinkoPaytable(rows, risk);
  return <GameLayout title="Plinko" subtitle="Follow the fall. Find your pocket." stage={<>
    <div className="plinko-board-label"><span>{boardRows} ROWS</span><span>{(result?.risk || risk).toUpperCase()} RISK</span></div>
    <svg viewBox={`0 0 420 ${70 + boardRows * 17}`} className="plinko-board" role="img" aria-label={result ? `Plinko path to bin ${result.bin}, ${multiple(result.multiplier, 10000)}x return` : "Triangular Plinko peg board"}>
      {Array.from({ length: boardRows }, (_, row) => Array.from({ length: row + 3 }, (_, peg) => <circle key={`${row}-${peg}`} cx={210 + (peg - (row + 2) / 2) * 20} cy={49 + row * 17} r="2.8" className="plinko-peg" />))}
      {path && <polyline className="plinko-path" key={round?.id} points={`210,32 ${path.join(" ")}`} fill="none" strokeWidth="3" pathLength="1" />}
      <circle cx={result ? 210 + (result.bin * 2 - boardRows) * 10 : 210} cy={result ? 40 + boardRows * 17 : 32} r="6" className="plinko-ball" />
      {Array.from({ length: boardRows + 1 }, (_, bin) => <rect key={bin} x={210 + (bin * 2 - boardRows) * 10 - 8} y={47 + boardRows * 17} width="16" height="12" rx="2" className={result?.bin === bin ? "plinko-bin is-winner" : "plinko-bin"} />)}
    </svg><p className="casino-stage-caption" data-testid={result ? "plinko-result" : undefined}>{result ? `BIN ${result.bin} / ${multiple(result.multiplier, 10000)}x RETURN` : "DROP INTO POSSIBILITY"}</p>
  </>} rules={<><p>Every peg sends the ball left or right with equal probability. Choose 8, 12 or 16 rows and low, medium or high risk. Higher risk puts larger returns at the edges and smaller returns in the center.</p><p>Table expected total return is at most 97%. Returns are rounded down to whole Tokens, so smaller stakes can return less.</p><p>Next drop paytable · {rows} rows / {risk} risk · left to right:</p><ol className="plinko-paytable" aria-label="Plinko total return paytable">{table.map((value, bin) => <li key={bin}><span>Bin {bin}</span><strong>{multiple(value, 10000)}x</strong></li>)}</ol></>}>
    <form noValidate onSubmit={event => { event.preventDefault(); const value = validStake(stake, client); if (value !== null) void client.mutate("/api/casino/play", { game: "plinko", stake: value, selection: { rows, risk } }); }}>
      <StakeField value={stake} onChange={setStake} client={client} /><label className="casino-field">Rows<select value={rows} onChange={event => setRows(Number(event.target.value) as PlinkoRows)} disabled={client.busy || client.blocked}>{[8,12,16].map(value => <option key={value}>{value}</option>)}</select></label><label className="casino-field">Risk<select value={risk} onChange={event => setRisk(event.target.value as PlinkoRisk)} disabled={client.busy || client.blocked}>{["low","medium","high"].map(value => <option key={value}>{value}</option>)}</select></label><button className="casino-primary" disabled={client.busy || client.blocked || !client.state.settings.enabled}>Drop ball</button>
    </form><Result round={round} />
  </GameLayout>;
}
