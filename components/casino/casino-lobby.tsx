"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { Coins, Dice5, ArrowUpRight, RefreshCw } from "lucide-react";
import type { CasinoBootstrap, CasinoGame, CasinoRoundPublic } from "@/lib/casino/types";
import { RouletteGame } from "./roulette-game";
import { BlackjackGame } from "./blackjack-game";
import { CrashGame } from "./crash-game";
import { PlinkoGame } from "./plinko-game";
import { SlotsGame } from "./slots-game";
import { tokens, type GameClient, type Mutation } from "./client";

const games: { key: CasinoGame; title: string; note: string }[] = [
  { key: "roulette", title: "Roulette", note: "European · 37 pockets" },
  { key: "blackjack", title: "Blackjack", note: "Six decks · dealer stands 17" },
  { key: "crash", title: "Crash", note: "Shared live round" },
  { key: "plinko", title: "Plinko", note: "Choose your risk" },
  { key: "slots", title: "Slots", note: "Unavailable" },
];

function readPending(key: string): Mutation | null {
  const raw = localStorage.getItem(key);
  if (!raw) return null;
  const saved: unknown = JSON.parse(raw);
  if (!saved || typeof saved !== "object") throw new Error("Invalid pending request");
  const candidate = saved as Partial<Mutation>;
  if (typeof candidate.key !== "string" || !candidate.key || typeof candidate.path !== "string" || !["/api/casino/play", "/api/casino/blackjack", "/api/casino/crash/bet", "/api/casino/crash/cashout"].includes(candidate.path) || !candidate.payload || typeof candidate.payload !== "object" || Array.isArray(candidate.payload)) throw new Error("Invalid pending request");
  return candidate as Mutation;
}

function pendingRequests(legacyKey: string, prefix: string): Mutation[] {
  const requests = new Map<string, Mutation>();
  const legacy = readPending(legacyKey);
  if (legacy) requests.set(legacy.key, legacy);
  // Each key is independent: simultaneous tabs never overwrite a shared list.
  for (const key of Object.keys(localStorage).filter(key => key.startsWith(prefix)).sort()) {
    const request = readPending(key);
    if (request) {
      if (key !== prefix + request.key) throw new Error("Invalid pending request identity");
      requests.set(request.key, request);
    }
  }
  return [...requests.values()];
}

export function CasinoLobby({ initial, steamId, csrf, themeKey }: { initial: CasinoBootstrap; steamId: string; csrf: string; themeKey: string | null }) {
  const [state, setState] = useState(initial);
  const [tab, setTab] = useState<CasinoGame>(initial.activeBlackjack ? "blackjack" : "roulette");
  const [lastRound, setLastRound] = useState<CasinoRoundPublic | null>(null);
  const [pending, setPending] = useState<Mutation[]>([]);
  const [busy, setBusy] = useState(false);
  const [ready, setReady] = useState(false);
  const [stale, setStale] = useState(false);
  const [storageFailed, setStorageFailed] = useState(false);
  const [message, setMessage] = useState("");
  const [failure, setFailure] = useState("");
  const lock = useRef(false);
  const refreshing = useRef<Promise<boolean> | null>(null);
  const storageKey = `tapped.casino.pending.v1.${steamId}`;
  const storagePrefix = `tapped.casino.pending.v2.${encodeURIComponent(steamId)}.`;
  const synchronizePending = useCallback(() => {
    try {
      setPending(pendingRequests(storageKey, storagePrefix));
      setStorageFailed(false);
      return true;
    } catch {
      setStorageFailed(true);
      setFailure("Pending request storage is unavailable. Restore browser storage before placing another wager.");
      return false;
    }
  }, [storageKey, storagePrefix]);

  const refresh = useCallback(async (): Promise<boolean> => {
    if (refreshing.current) return refreshing.current;
    const task = (async () => {
      try {
        const response = await fetch("/api/casino/state", { cache: "no-store", credentials: "same-origin" });
        const result = await response.json();
        if (!response.ok || result.ok !== true) throw new Error("State unavailable");
        const snapshot = result as CasinoBootstrap;
        setState(snapshot);
        // Active receipts are historical. A fresh current table/history supersedes them,
        // including timeout settlement, another session's action, or an old-key replay.
        setLastRound(current => current?.game === "blackjack"
          ? snapshot.activeBlackjack || snapshot.history.find(round => round.game === "blackjack") || null
          : current);
        setStale(false);
        return true;
      } catch {
        setStale(true);
        return false;
      }
    })();
    refreshing.current = task;
    try { return await task; } finally { refreshing.current = null; }
  }, []);

  useEffect(() => {
    synchronizePending();
    setReady(true);
    void refresh();
    const onStorage = (event: StorageEvent) => {
      if (event.key === null || event.key === storageKey || event.key.startsWith(storagePrefix)) {
        synchronizePending();
        if (!lock.current) void refresh();
      }
    };
    window.addEventListener("storage", onStorage);
    return () => window.removeEventListener("storage", onStorage);
  }, [storageKey, storagePrefix, synchronizePending, refresh]);

  useEffect(() => {
    if (tab !== "crash" && !state.activeBlackjack) return;
    const poll = () => { if (document.visibilityState === "visible" && !lock.current) void refresh(); };
    poll();
    const timer = window.setInterval(poll, tab === "crash" ? 1000 : 5000);
    document.addEventListener("visibilitychange", poll);
    return () => { clearInterval(timer); document.removeEventListener("visibilitychange", poll); };
  }, [tab, Boolean(state.activeBlackjack), refresh]);

  const forgetRequest = (request: Mutation) => {
    localStorage.removeItem(storagePrefix + request.key);
    // Legacy records remain recoverable without a racy cross-tab migration.
    if (readPending(storageKey)?.key === request.key) localStorage.removeItem(storageKey);
    synchronizePending();
  };

  const send = async (request: Mutation) => {
    if (lock.current) return;
    lock.current = true; setBusy(true); setFailure(""); setMessage("Request in progress…");
    try {
      // Save before sending. Without durable storage, an accepted response could be lost on reload.
      try {
        localStorage.setItem(storagePrefix + request.key, JSON.stringify(request));
        if (!synchronizePending()) throw new Error("Pending request storage is unavailable.");
      } catch {
        setStorageFailed(true);
        throw new Error("Pending request storage is unavailable. Restore browser storage before placing another wager.");
      }
      // Complete any older GET before POST so its pre-wager state cannot overwrite recovery.
      if (refreshing.current) await refreshing.current;
      let response: Response;
      try {
        response = await fetch(request.path, { method: "POST", credentials: "same-origin", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ ...request.payload, idempotencyKey: request.key, csrf }) });
      } catch { throw new Error("The response was disconnected. Your wager may have been accepted. Retry the pending request to recover its result."); }
      let result;
      try { result = await response.json(); } catch { throw new Error("The response could not be read. Retry the pending request to recover its result."); }
      if (!response.ok || result.ok !== true) {
        // These guards reject before receipt lookup, so they cannot disprove an earlier acceptance.
        if (response.status === 401) throw new Error("Sign in with Steam using this account, then reload this page and retry the pending request. Your original request has been kept.");
        if (response.status === 403) throw new Error("Reload this page to renew your session verification, then retry the pending request. Your original request has been kept.");
        if (response.status < 500) { forgetRequest(request); }
        if (response.status >= 500) throw new Error("The casino is temporarily unavailable. Your request is unconfirmed; retry it before placing another wager.");
        throw new Error(result.message || "The request could not be confirmed. Retry the pending request.");
      }
      setLastRound(result.round);
      setState(current => ({ ...current, balance: result.balance }));
      forgetRequest(request);
      setMessage("Request confirmed. Refreshing your balance and rounds…");
      // A replay receipt is historical: always reconcile against fresh actual state.
      setMessage(await refresh() ? "Request confirmed. Your balance and rounds have been refreshed." : "Request confirmed. Refresh your balance and rounds before another wager.");
    } catch (error) {
      setMessage("");
      setFailure(error instanceof Error ? error.message : "The request could not be confirmed.");
    } finally { lock.current = false; setBusy(false); }
  };

  const client: GameClient = {
    state, lastRound, busy, blocked: !ready || pending.length > 0 || stale || storageFailed,
    error: value => { setFailure(value); setMessage(""); },
    mutate: async (path, payload) => {
      if (!ready || pending.length > 0 || stale || storageFailed || lock.current) return;
      await send({ path, payload, key: crypto.randomUUID() });
    },
  };

  return <section className="casino" data-theme={themeKey || "default"} data-theme-surface="global">
    <header className="casino-hero"><div><p className="casino-kicker"><Dice5 aria-hidden="true" /> Player economy / casino</p><h1>THE HOUSE<span>OF TOKENS.</span></h1><p>Four games. One wallet. Your next move.</p></div>
      <div className="casino-wallet"><Coins aria-hidden="true" /><span>Available Tokens</span><strong data-testid="token-balance">{tokens(state.balance)}</strong><a href="/market">Use Tokens in the Market <ArrowUpRight aria-hidden="true" /></a></div>
    </header>
    <div className="casino-toolbar"><p><span className={`casino-dot ${!state.settings.enabled ? "is-paused" : ""}`} /><span>{state.settings.enabled ? "Tables open" : "New wagers are paused."}</span><span className="casino-limits">{tokens(state.settings.minBet)}–{tokens(state.settings.maxBet)} Tokens per bet</span></p><button type="button" onClick={() => void refresh()} disabled={busy}><RefreshCw aria-hidden="true" />Refresh balance and rounds</button></div>
    {pending.map(request => <div key={request.key} className="casino-recovery" role="status"><div><strong>A request needs confirmation.</strong><p>It may already have changed your wallet. Recover the original request before placing another wager.</p></div><button type="button" disabled={busy} onClick={() => void send(request)}>{busy ? "Recovering…" : "Retry pending request"}</button></div>)}
    {stale && <p className="casino-alert" role="status">Live state is unavailable. Refresh your balance and rounds to continue.</p>}
    {failure && <p className="casino-alert" role="alert">{failure}</p>}
    <p className="casino-live" role="status" aria-live="polite" aria-atomic="true">{message || (busy ? "Please wait…" : "")}</p>
    <div className="casino-tabs" role="tablist" aria-label="Casino games">{games.map((game, index) => <button key={game.key} id={`tab-${game.key}`} type="button" role="tab" aria-label={game.title} aria-selected={tab === game.key} aria-controls={`panel-${game.key}`} tabIndex={tab === game.key ? 0 : -1} onClick={() => { setTab(game.key); setFailure(""); }} onKeyDown={event => {
      const next = event.key === "ArrowRight" ? (index + 1) % games.length : event.key === "ArrowLeft" ? (index + games.length - 1) % games.length : event.key === "Home" ? 0 : event.key === "End" ? games.length - 1 : null;
      if (next === null) return; event.preventDefault(); setTab(games[next].key); document.getElementById(`tab-${games[next].key}`)?.focus();
    }}><span className="casino-tab-index">0{index + 1}</span><strong>{game.title}</strong><span>{game.note}</span></button>)}</div>
    <section className="casino-panel" id={`panel-${tab}`} role="tabpanel" aria-labelledby={`tab-${tab}`} tabIndex={0}>
      {tab === "roulette" && <RouletteGame client={client} />}{tab === "blackjack" && <BlackjackGame client={client} />}{tab === "crash" && <CrashGame client={client} />}{tab === "plinko" && <PlinkoGame client={client} />}{tab === "slots" && <SlotsGame />}
    </section>
    <section className="casino-history" aria-labelledby="casino-history-title"><div><p className="casino-kicker">Your table ledger</p><h2 id="casino-history-title">Recent results</h2><p>Personal rounds only · total returns include the stake</p></div>{state.history.length ? <ol>{state.history.slice(0, 8).map(round => <li key={round.id}><span className="casino-history-game">{round.game}</span><time dateTime={round.createdAt}>{new Date(round.createdAt).toLocaleString("en-GB", { month: "short", day: "numeric", hour: "2-digit", minute: "2-digit" })}</time><span>{tokens(round.stakeTokens)} staked</span><strong>{round.payoutTokens === null ? "In progress" : `${tokens(round.payoutTokens)} returned`}</strong></li>)}</ol> : <p className="casino-empty">A clean slate. Your completed rounds will appear here.</p>}</section>
  </section>;
}
