"use client";

import { useEffect, useRef, useState } from "react";
import { GameLayout, StakeField, tokens, validStake, type GameClient } from "./client";
import { CrashParticipants } from "./crash-participants";

export function CrashGame({ client }: { client: GameClient }) {
  const [stake, setStake] = useState(String(client.state.settings.minBet));
  const [target, setTarget] = useState("2.00");
  const [automatic, setAutomatic] = useState(true);
  const [confirmed, setConfirmed] = useState(false);
  const [elapsed, setElapsed] = useState(0);
  const snapshot = client.state.crash;
  const received = useRef(0);
  useEffect(() => { received.current = performance.now(); setElapsed(0); }, [snapshot]);
  useEffect(() => {
    const reduced=window.matchMedia('(prefers-reduced-motion: reduce)');
    let frame=0,last=0;
    const tick=(now:number)=>{if(document.visibilityState==="visible"&&now-last>=(reduced.matches?250:32)){last=now;setElapsed(Math.max(0,now-received.current));}frame=requestAnimationFrame(tick);};
    frame=requestAnimationFrame(tick);
    return ()=>cancelAnimationFrame(frame);
  }, []);
  const serverNow = (snapshot?.serverTime || 0) + elapsed;
  const flyingMs = snapshot ? Math.max(0, serverNow - snapshot.startAt) : 0;
  const multiplier = snapshot?.phase === "flying" ? Math.min(10000, Math.max(snapshot.multiplier, Math.floor(100 * Math.exp(.00006 * flyingMs)))) : snapshot?.multiplier ?? 100;
  const seconds = snapshot ? Math.max(0, Math.ceil((snapshot.startAt - serverNow) / 1000)) : 0;
  const graphMs = snapshot?.phase === "crashed" ? Math.max(0, (snapshot.crashesAt || snapshot.serverTime) - snapshot.startAt) : flyingMs;
  const graphWindow = Math.max(20000, graphMs);
  const graphMaximum = Math.max(200, Math.ceil(multiplier / 100) * 100);
  const graph = Array.from({ length: 31 }, (_, index) => {
    const time = graphMs * index / 30;
    const value = Math.min(multiplier, Math.floor(100 * Math.exp(.00006 * time)));
    return { x: 40 + time / graphWindow * 390, y: 255 - 210 * (value - 100) / (graphMaximum - 100) };
  });
  const graphPoints = graph.map(({ x, y }) => `${x},${y}`).join(" ");
  const tip = graph[graph.length - 1];
  const bet = snapshot?.bet;
  const canBet = snapshot?.phase === "betting" && !bet;
  const canCashout = snapshot?.phase === "flying" && bet?.status === "active";
  return <GameLayout title="Crash" subtitle="A shared flight. Choose your exit." stage={<>
    <div className="crash-stage-heading"><span className="casino-kicker">{snapshot?.phase === "betting" ? "BETS OPEN" : snapshot?.phase === "flying" ? "IN FLIGHT" : snapshot?.phase === "crashed" ? "ROUND CRASHED" : "WAITING FOR LIVE STATE"}</span><strong data-testid="crash-multiplier">{snapshot?.phase === "betting" ? `${seconds}s` : `${(multiplier / 100).toFixed(2)}x`}</strong><p>{snapshot?.phase === "flying" ? "Live estimate · the server settles cashouts" : snapshot?.phase === "betting" ? "Place your bet before takeoff" : "The next betting window opens after cooldown"}</p></div>
    <svg viewBox="0 0 480 300" className={`crash-chart ${snapshot?.phase === "crashed" ? "is-crashed" : ""}`} role="img" aria-label={`Crash chart: ${snapshot?.phase || "loading"}`}>
      {[45,115,185,255].map(y => <line key={y} x1="40" y1={y} x2="455" y2={y} className="crash-grid" />)}{[40,145,250,355,455].map(x => <line key={x} x1={x} y1="25" x2={x} y2="255" className="crash-grid" />)}
      <text x="8" y="260" className="crash-axis">1x</text><text x="8" y="48" className="crash-axis">{graphMaximum / 100}x</text><text x="410" y="282" className="crash-axis">TIME →</text>
      {snapshot?.phase !== "betting" && snapshot && <><polygon points={`40,255 ${graphPoints} ${tip.x},255`} className="crash-area" /><polyline points={graphPoints} fill="none" className="crash-line" strokeWidth="4" /><circle cx={tip.x} cy={tip.y} r="7" className="crash-tip" /></>}
    </svg><div className="crash-recent" aria-label="Recent Crash outcomes">{snapshot?.recent.slice(0, 6).map(item => <span key={item.roundId}>{(item.multiplier / 100).toFixed(2)}x</span>)}</div><CrashParticipants participants={snapshot?.participants??[]}/>
  </>} rules={<><p>Shared 8-second betting window, then the multiplier grows until the round crashes. A manual cashout uses the server’s current multiplier. Your optional automatic target is stored with the bet and works while disconnected.</p><p>Automatic targets range from 1.01x to 99.99x. A crash exactly at your target loses. The multiplier caps at 100x and can crash instantly at 1x. The theoretical total return at automatic targets is approximately 99% before whole-Token rounding.</p><p>The chart and timer are visual estimates synchronized to server time; they do not decide the payout. A 5-second cooldown follows a crash.</p></>}>
    {!snapshot ? <p className="casino-control-note">Connecting to the shared round. Refresh to check its status.</p> : bet ? <div className="crash-bet"><span>Your saved bet</span><strong>{tokens(bet.stakeTokens)} Tokens</strong><p>Auto cashout: {bet.autoCashout === null ? "Off" : `${(bet.autoCashout / 100).toFixed(2)}x`}</p><p>{bet.status === "pending" ? "Waiting for takeoff" : bet.status === "active" ? "In flight" : bet.status === "lost" ? "Round lost · 0 Tokens returned" : `Cashed out at ${((bet.cashoutMultiplier || 100) / 100).toFixed(2)}x · ${tokens(bet.payoutTokens || 0)} Tokens returned`}</p>{canCashout && <button type="button" className="casino-primary" disabled={client.busy || client.blocked} onClick={() => void client.mutate("/api/casino/crash/cashout", { roundId: snapshot.roundId })}>Cash out</button>}</div> : <form noValidate onSubmit={event => {
      event.preventDefault(); const value = validStake(stake, client); if (value === null) return;
      let autoCashout: number | null = null;
      if (automatic) {
        if (!/^\d+(?:\.\d{1,2})?$/.test(target)) { client.error("Enter an auto cashout target from 1.01x to 99.99x, with at most two decimals."); return; }
        const [whole, fraction = ""] = target.split("."); autoCashout = Number(whole) * 100 + Number(fraction.padEnd(2, "0"));
        if (!Number.isSafeInteger(autoCashout) || autoCashout < 101 || autoCashout > 9999) { client.error("Enter an auto cashout target from 1.01x to 99.99x."); return; }
        if (!confirmed) { client.error("Confirm your auto cashout target before joining the round."); return; }
      }
      if (!canBet) { client.error("The betting window is closed. Wait for the next round."); return; }
      void client.mutate("/api/casino/crash/bet", { roundId: snapshot.roundId, stake: value, autoCashout });
    }}><StakeField value={stake} onChange={setStake} client={client} /><label className="casino-check"><input type="checkbox" checked={automatic} onChange={event => { setAutomatic(event.target.checked); setConfirmed(false); }} disabled={client.busy || client.blocked} />Use auto cashout</label>{automatic && <><label className="casino-field">Auto cashout (x)<input type="number" inputMode="decimal" min="1.01" max="99.99" step="0.01" value={target} onChange={event => { setTarget(event.target.value); setConfirmed(false); }} disabled={client.busy || client.blocked} /></label><label className="casino-check"><input type="checkbox" aria-label="Confirm auto cashout target" checked={confirmed} onChange={event => setConfirmed(event.target.checked)} disabled={client.busy || client.blocked} />I confirm the {target || "—"}x auto target</label></>}<button className="casino-primary" disabled={client.busy || client.blocked || !client.state.settings.enabled || !canBet}>Join round</button><p className="casino-control-note">{canBet ? "Your target cannot be changed once the bet is accepted." : "Wait for the next betting window."}</p></form>}
  </GameLayout>;
}
