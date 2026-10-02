"use client";

import { useEffect, useState } from "react";
import type { PlinkoBatchResult, PlinkoResult, PlinkoRisk, PlinkoRows } from "@/lib/casino/types";
import { plinkoPaytable } from "@/lib/casino/plinko";
import { GameLayout, Result, StakeField, multiple, tokens, validStake, type GameClient } from "./client";
import { PlinkoBoard } from "./plinko-board";

export function PlinkoGame({ client }: { client: GameClient }) {
  const round = client.lastRound?.game === "plinko"
    ? client.lastRound
    : client.state.history.find(item => item.game === "plinko") ?? null;
  const previous = round?.details as PlinkoBatchResult | PlinkoResult | undefined;
  const [stake, setStake] = useState(String(client.state.settings.minBet));
  const [rows, setRows] = useState<PlinkoRows>(previous?.rows ?? 12);
  const [risk, setRisk] = useState<PlinkoRisk>(previous?.risk ?? "medium");
  const [count, setCount] = useState("1");
  const [active, setActive] = useState(0);

  useEffect(() => {
    if (previous) {
      setRows(previous.rows);
      setRisk(previous.risk);
    }
  }, [round?.id]);

  const table = plinkoPaytable(rows, risk);
  const cost = Number(stake) * Number(count);
  const disabled = client.busy || client.blocked || !client.state.settings.enabled;

  return (
    <GameLayout
      title="Plinko"
      subtitle="A cascade of chances. Make room for the next drop."
      stage={(
        <>
          <div className="plinko-board-label">
            <span>{rows} ROWS / {risk.toUpperCase()} RISK</span>
            <span>{active ? `${active} IN PLAY` : "BALLS READY"}</span>
          </div>
          <PlinkoBoard
            round={round}
            rows={rows}
            risk={risk}
            paytable={previous?.rows === rows && previous.risk === risk ? previous.paytable : table}
            onActiveChange={setActive}
          />
        </>
      )}
      rules={(
        <>
          <p>Every peg sends the ball left or right with equal probability. Choose 8, 12 or 16 rows and low, medium or high risk. Higher risk puts larger returns at the edges and smaller returns in the center.</p>
          <p>Drop 1–20 balls per batch. Each ball has its own result. Stakes are limited to {tokens(client.state.settings.maxBet)} Tokens per ball; the full batch costs stake × ball count.</p>
          <p>Table expected total return is at most 97%. Returns are rounded down to whole Tokens.</p>
          <ol className="plinko-paytable" aria-label="Plinko total return paytable">
            {table.map((value, bin) => (
              <li key={bin}>
                <span>Bin {bin}</span>
                <strong>{multiple(value, 10000)}x</strong>
              </li>
            ))}
          </ol>
        </>
      )}
    >
      <form noValidate onSubmit={event => {
        event.preventDefault();
        const value = validStake(stake, client);
        if (value === null) return;
        const ballCount = Number(count);
        if (!Number.isSafeInteger(ballCount) || ballCount < 1 || ballCount > 20) {
          client.error("Choose between 1 and 20 balls per batch.");
          return;
        }
        if (!Number.isSafeInteger(value * ballCount) || value * ballCount > client.state.balance) {
          client.error("Your Token balance is too low for this full batch cost.");
          return;
        }
        void client.mutate("/api/casino/play", { game: "plinko", stake: value, selection: { rows, risk, ballCount } });
      }}>
        <StakeField value={stake} onChange={setStake} client={client} />
        <label className="casino-field">
          Ball count
          <input
            type="number"
            inputMode="numeric"
            min="1"
            max="20"
            step="1"
            value={count}
            onChange={event => setCount(event.target.value)}
            disabled={disabled}
          />
        </label>
        <div className="plinko-settings">
          <label className="casino-field">
            Rows
            <select
              aria-label="Rows"
              value={rows}
              onChange={event => setRows(Number(event.target.value) as PlinkoRows)}
              disabled={disabled || active > 0}
            >
              {[8, 12, 16].map(value => <option key={value}>{value}</option>)}
            </select>
          </label>
          <label className="casino-field">
            Risk
            <select
              aria-label="Risk"
              value={risk}
              onChange={event => setRisk(event.target.value as PlinkoRisk)}
              disabled={disabled || active > 0}
            >
              {["low", "medium", "high"].map(value => <option key={value}>{value}</option>)}
            </select>
          </label>
        </div>
        <div className="casino-cost" data-testid="plinko-cost">
          <span>FULL BATCH COST</span>
          <strong>{Number.isSafeInteger(cost) && cost >= 0 ? tokens(cost) : "—"} <small>Tokens</small></strong>
          <span>{stake || "—"} per ball × {count || "—"} balls</span>
        </div>
        <button className="casino-primary" disabled={disabled || active > 60}>
          {Number(count) === 1 ? "Drop ball" : "Drop balls"}
        </button>
        <p className="casino-control-note">
          {active
            ? "Keep dropping while balls fall. Rows and risk unlock when the board clears."
            : "Each ball settles on its own. Drop a batch or play one at a time."}
        </p>
      </form>
      <Result round={round} />
    </GameLayout>
  );
}
