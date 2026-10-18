"use client";

import { useEffect, useState } from "react";
import { browserPollingEnvironment, createVisiblePoller } from "@/lib/server-link/client-polling";
import { playerServerPresence } from "@/lib/server-link/player-presence";
import type { PublicStatus } from "@/lib/server-link/protocol";

import styles from "./player-server-presence.module.css";

export function PlayerServerPresence({ steamId, initialStatus = null }: { steamId: string; initialStatus?: PublicStatus | null }) {
  const [snapshot, setSnapshot] = useState({ status: initialStatus, receivedAt: 0 });
  const [now, setNow] = useState(0);

  useEffect(() => {
    const receivedAt = Date.now();
    setSnapshot({ status: initialStatus, receivedAt });
    setNow(receivedAt);
    const poller = createVisiblePoller({
      environment: browserPollingEnvironment(),
      intervalMs: 10_000,
      requestTimeoutMs: 5_000,
      async request(signal) {
        const response = await fetch("/api/server-status", { cache: "no-store", signal });
        if (!response.ok) throw new Error("Server roster is unavailable.");
        return await response.json() as PublicStatus;
      },
      onSuccess(status) {
        const receivedAt = Date.now();
        setSnapshot({ status, receivedAt });
        setNow(receivedAt);
      },
      // A failed poll never renews the heartbeat. The last confirmed snapshot
      // expires below even when requests keep failing or the tab was hidden.
      onFailure() { setNow(Date.now()); },
    });
    const timer = window.setInterval(() => setNow(Date.now()), 1_000);
    return () => { poller.dispose(); window.clearInterval(timer); };
  }, [steamId, initialStatus]);

  const presence = playerServerPresence(snapshot.status, steamId, snapshot.receivedAt, now);
  const label = presence === "online" ? "Online on server" : presence === "offline" ? "Offline" : "Server status unavailable";
  const description = presence === "online" ? "Connected to ARENA.TAPPED.RO · live server roster" : presence === "offline" ? "Not connected to ARENA.TAPPED.RO · live server roster" : "The server's live roster is currently unavailable.";

  return <span className={styles.presence} data-server-presence={presence} role="status" aria-live="polite" title={description}>
    <i className={styles.indicator} aria-hidden="true" /><span>{label}</span>
  </span>;
}
