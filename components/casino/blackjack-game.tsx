"use client";

import { useState } from "react";
import type { BlackjackPublicState, Card } from "@/lib/casino/types";
import { GameLayout, Result, StakeField, tokens, validStake, type GameClient } from "./client";

const suits = { hearts: "♥", diamonds: "♦", clubs: "♣", spades: "♠" };
function PlayingCard({ card, label = "Dealer hole card" }: { card: Card | null; label?: string }) {
  if (!card) return <div className="casino-card is-back" role="img" aria-label={label}><span>◆</span></div>;
  return <div key={`${card.rank}:${card.suit}`} className={`casino-card ${card.suit === "hearts" || card.suit === "diamonds" ? "is-red" : ""}`} role="img" aria-label={`${card.rank} of ${card.suit}`}><span>{card.rank}<small>{suits[card.suit]}</small></span><b aria-hidden="true">{suits[card.suit]}</b><span aria-hidden="true">{card.rank}<small>{suits[card.suit]}</small></span></div>;
}

export function BlackjackGame({ client }: { client: GameClient }) {
  const minimum = Math.max(2, client.state.settings.minBet);
  const [stake, setStake] = useState(String(minimum + minimum % 2));
  const round = client.state.activeBlackjack || (client.lastRound?.game === "blackjack" ? client.lastRound : client.state.history.find(item => item.game === "blackjack") || null);
  const result = round?.details as BlackjackPublicState | undefined;
  const active = result?.status === "active";
  const hand = result?.hands[result.currentHand];
  return <GameLayout title="Blackjack" subtitle="Read the table. Make your hand." stage={<div className="blackjack-felt">
    <div className="blackjack-table-label">BLACKJACK PAYS 3 : 2<span>DEALER STANDS ON ALL 17</span></div>
    <div className="blackjack-dealer"><p>Dealer {result && <strong>{result.dealer.total}{result.dealer.soft ? " soft" : ""}{active ? " shown" : ""}</strong>}</p><div className="casino-card-row">{result ? result.dealer.cards.map((card, index) => <PlayingCard key={index} card={card} />) : <><PlayingCard card={null} label="Face-down preview card" /><PlayingCard card={null} label="Face-down preview card" /></>}</div></div>
    <div className="blackjack-hands">{result ? result.hands.map((item, index) => <div className={`blackjack-hand ${active && result.currentHand === index ? "is-current" : ""}`} key={index}><p>Hand {index + 1} <strong>{item.total}{item.soft ? " soft" : ""}</strong></p><div className="casino-card-row">{item.cards.map((card, cardIndex) => <PlayingCard key={cardIndex} card={card} />)}</div><span>{tokens(item.stakeTokens)} Tokens · {item.status}{active && result.currentHand === index ? " · your turn" : ""}</span></div>) : <p className="blackjack-empty">YOUR SEAT IS READY</p>}</div>
  </div>} rules={<><p>Fresh six-deck shoe each round. A natural returns 2.5x, ordinary wins 2x, pushes 1x. Dealer checks for a natural and stands on soft 17. Even stakes keep natural returns in whole Tokens.</p><p>Double on two cards, including after a split: add the hand’s stake and draw one card. Split equal ranks to a maximum of four hands. Split aces draw once and stand; split 21 pays as an ordinary win.</p><p>An inactive hand is automatically stood after {Math.round(client.state.settings.blackjackTimeoutMs / 60000)} minutes. Refresh restores your saved table.</p></>}>
    {active ? <><div className="casino-hand-summary"><span>Current hand</span><strong>{hand?.total ?? "—"}</strong><p>{tokens(result.totalStakeTokens)} Tokens committed</p></div><div className="blackjack-actions">{(["hit", "stand", "double", "split"] as const).map(action => {
      const additional = action === "double" || action === "split";
      return <button type="button" key={action} className={action === "stand" ? "casino-primary" : ""} disabled={client.busy || client.blocked || !result.availableActions.includes(action) || (additional && (!client.state.settings.enabled || client.state.balance < (hand?.stakeTokens || 0)))} onClick={() => void client.mutate("/api/casino/blackjack", { roundId: round!.id, action })}>{action[0].toUpperCase() + action.slice(1)}</button>;
    })}</div><p className="casino-control-note">Double and split add {tokens(hand?.stakeTokens || 0)} Tokens. {client.state.balance < (hand?.stakeTokens || 0) ? "Your balance is too low for an additional stake." : ""} Hit and stand remain available when new wagers are paused.</p></> : <form noValidate onSubmit={event => { event.preventDefault(); const value = validStake(stake, client, true); if (value !== null) void client.mutate("/api/casino/blackjack", { action: "start", stake: value }); }}><StakeField value={stake} onChange={setStake} client={client} even /><p className="casino-control-note">One saved table at a time. You can return to an unfinished hand.</p><button className="casino-primary" disabled={client.busy || client.blocked || !client.state.settings.enabled}>Deal cards</button></form>}
    <Result round={round} />
  </GameLayout>;
}
