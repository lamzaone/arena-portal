"use client";

import type { CasinoBootstrap, CasinoRoundPublic } from "@/lib/casino/types";
import type { ReactNode } from "react";

export type Mutation = { path: string; payload: Record<string, unknown>; key: string };
export type GameClient = {
  state: CasinoBootstrap;
  lastRound: CasinoRoundPublic | null;
  busy: boolean;
  blocked: boolean;
  mutate: (path: string, payload: Record<string, unknown>) => Promise<void>;
  error: (message: string) => void;
};

export const tokens = (amount: number) => amount.toLocaleString("en-US");
export const multiple = (value: number, denominator: number) => (value / denominator).toFixed(4).replace(/0+$/, "").replace(/\.$/, "");

export function validStake(text: string, client: GameClient, even = false): number | null {
  const stake = Number(text);
  const { minBet, maxBet } = client.state.settings;
  if (!text.trim() || !Number.isSafeInteger(stake) || stake < minBet || stake > maxBet) {
    client.error(`Enter a whole stake between ${tokens(minBet)} and ${tokens(maxBet)} Tokens.`);
    return null;
  }
  if (even && stake % 2 !== 0) { client.error("Blackjack stakes must be even whole Tokens."); return null; }
  if (stake > client.state.balance) { client.error("Your Token balance is too low for this stake."); return null; }
  return stake;
}

export function StakeField({ value, onChange, client, even = false }: { value: string; onChange: (value: string) => void; client: GameClient; even?: boolean }) {
  return <label className="casino-field">Stake (Tokens)
    <input type="number" inputMode="numeric" min={client.state.settings.minBet + (even ? client.state.settings.minBet % 2 : 0)} max={client.state.settings.maxBet - (even ? client.state.settings.maxBet % 2 : 0)} step={even ? 2 : 1} value={value} onChange={event => onChange(event.target.value)} disabled={client.busy || client.blocked || !client.state.settings.enabled} />
    <span>{tokens(client.state.settings.minBet)}–{tokens(client.state.settings.maxBet)} Tokens{even ? " · even stakes" : ""}</span>
  </label>;
}

export function GameLayout({ title, subtitle, stage, children, rules }: { title: string; subtitle: string; stage: ReactNode; children: ReactNode; rules: ReactNode }) {
  return <><div className="casino-game-heading"><div><p className="casino-kicker">Casino games · shared Tokens</p><h2>{title}</h2><p>{subtitle}</p></div></div>
    <div className="casino-game-grid"><div className="casino-stage">{stage}</div><div className="casino-controls">{children}</div></div>
    <details className="casino-rules" open><summary>Rules &amp; total returns</summary><div>{rules}<p>Returns include the stake. Losing bets return 0 Tokens. Outcomes and settlements are decided by the server.</p></div></details>
  </>;
}

export function Result({ round }: { round: CasinoRoundPublic | null }) {
  if (!round) return <p className="casino-result-note">Your next result will appear here.</p>;
  if (round.payoutTokens === null) return <p className="casino-result-note">Round in progress · {tokens(round.stakeTokens)} Tokens staked</p>;
  const net = round.payoutTokens - round.stakeTokens;
  return <p className={`casino-result-note ${net >= 0 ? "is-win" : ""}`}>Returned <strong>{tokens(round.payoutTokens)} Tokens</strong><span>{net > 0 ? "+" : ""}{tokens(net)} net · {tokens(round.stakeTokens)} staked</span></p>;
}
