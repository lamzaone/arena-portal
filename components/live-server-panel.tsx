"use client";

import Link from "next/link";
import { Crosshair, ExternalLink, UserRound, Zap } from "lucide-react";
import { useEffect, useMemo, useState } from "react";

import { ResilientRemoteImage } from "@/components/resilient-remote-image";
import { browserPollingEnvironment, createVisiblePoller } from "@/lib/server-link/client-polling";
import { currentRoster, playerLinks, statusAtClientTime, trustedSteamAvatarUrl } from "@/lib/server-link/presentation";
import type { PublicStatus } from "@/lib/server-link/protocol";

import styles from "./live-server-panel.module.css";

type PlayerEnrichmentResponse = {
  players: Array<{ steamId: string; avatarUrl: string | null }>;
};

const POLL_INTERVAL_MS = 10_000;
const LOST_AFTER_MS = 45_000;

function statusLabel(status: PublicStatus | null) {
  if (status?.state === "online") return "Online";
  if (status?.state === "lost") return "Connection lost";
  return "Status unavailable";
}

function lastUpdate(status: PublicStatus | null) {
  if (!status?.lastSeenAt) return null;
  const instant = new Date(status.lastSeenAt);
  if (!Number.isFinite(instant.getTime())) return null;
  return {
    dateTime: instant.toISOString(),
    label: instant.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit", second: "2-digit" }),
  };
}

async function fetchJson<T>(url: string, signal: AbortSignal): Promise<T> {
  const response = await fetch(url, { cache: "no-store", signal });
  if (!response.ok) throw new Error(`Request failed with status ${response.status}.`);
  return await response.json() as T;
}

export function LiveServerPanel() {
  const [status, setStatus] = useState<PublicStatus | null>(null);
  const [statusReceivedAt, setStatusReceivedAt] = useState(0);
  const [clientNow, setClientNow] = useState(() => Date.now());
  const [statusReadFailed, setStatusReadFailed] = useState(false);
  const [avatars, setAvatars] = useState<Record<string, string | null>>({});

  useEffect(() => {
    const poller = createVisiblePoller({
      environment: browserPollingEnvironment(),
      intervalMs: POLL_INTERVAL_MS,
      requestTimeoutMs: 5_000,
      request: (signal) => fetchJson<PublicStatus>("/api/server-status", signal),
      onSuccess(value) {
        const receivedAt = Date.now();
        setStatus(value);
        setStatusReceivedAt(receivedAt);
        setClientNow(receivedAt);
        setStatusReadFailed(false);
      },
      onFailure() {
        setClientNow(Date.now());
        setStatusReadFailed(true);
      },
    });
    return () => poller.dispose();
  }, []);

  useEffect(() => {
    if (status?.state !== "online" || !status.lastSeenAt) return;
    const serverAge = Date.parse(status.checkedAt) - Date.parse(status.lastSeenAt);
    if (!Number.isFinite(serverAge)) return;
    const expiresIn = LOST_AFTER_MS - Math.max(0, serverAge);
    if (expiresIn <= 0) {
      setClientNow(Date.now());
      return;
    }
    const timer = window.setTimeout(() => setClientNow(Date.now()), expiresIn + 1);
    return () => window.clearTimeout(timer);
  }, [status, statusReceivedAt]);

  const visibleStatus = status ? statusAtClientTime(status, statusReceivedAt, clientNow) : null;
  const roster = visibleStatus ? currentRoster(visibleStatus) : [];
  const rosterKey = roster.map((player) => player.steamId).join(",");

  useEffect(() => {
    setAvatars({});
    if (!rosterKey) return;
    const controller = new AbortController();
    const signal = AbortSignal.any([controller.signal, AbortSignal.timeout(5_000)]);
    void fetchJson<PlayerEnrichmentResponse>("/api/server-link/players", signal)
      .then((payload) => {
        if (controller.signal.aborted) return;
        const rosterIds = new Set(rosterKey.split(","));
        setAvatars(Object.fromEntries(payload.players.flatMap((player) => {
          if (!rosterIds.has(player.steamId)) return [];
          return [[player.steamId, trustedSteamAvatarUrl(player.avatarUrl)]];
        })));
      })
      .catch(() => {
        // Steam identity is decorative; roster names and links stay available.
      });
    return () => controller.abort();
  }, [rosterKey]);

  const updated = lastUpdate(visibleStatus);
  const playerCount = visibleStatus?.players !== null && visibleStatus?.players !== undefined && visibleStatus.maxPlayers !== null
    ? `${visibleStatus.players} / ${visibleStatus.maxPlayers}`
    : "—";
  const map = visibleStatus?.map ?? "Awaiting link";
  const bots = visibleStatus?.bots ?? 0;
  const label = statusLabel(visibleStatus);
  const statusClass = visibleStatus?.state === "online"
    ? styles.online
    : visibleStatus?.state === "lost"
      ? styles.lost
      : styles.unknown;
  const rosterRows = useMemo(() => roster.flatMap((player) => {
    const links = playerLinks(player.steamId);
    return links ? [{ ...player, links }] : [];
  }), [roster]);

  return (
    <aside className={`arena-visual hero-reveal hero-delay ${styles.panel}`} aria-label="ARENA.TAPPED.RO live overview">
      <div className={styles.topline}>
        <span>ARENA // LIVE TERMINAL</span>
        <span className={`${styles.status} ${statusClass}`} role="status" aria-live="polite">
          <i aria-hidden="true" />{label}
        </span>
      </div>

      <div className={styles.overview}>
        <div className={styles.core} aria-hidden="true">
          <div className={`${styles.ring} ${styles.outerRing}`} />
          <div className={`${styles.ring} ${styles.innerRing}`} />
          <div className={styles.diamond}><Crosshair /></div>
          <span>1V1</span>
        </div>
        <dl className={styles.metrics}>
          <div><dt>Players</dt><dd>{playerCount}</dd></div>
          <div><dt>Map</dt><dd className={styles.mapValue}>{map}</dd></div>
          <div><dt>Bots</dt><dd>{bots > 0 ? bots : "None"}</dd></div>
          <div><dt>Last update</dt><dd>{updated ? <time dateTime={updated.dateTime}>{updated.label}</time> : "No snapshot"}</dd></div>
        </dl>
      </div>

      <section className={styles.roster} aria-labelledby="playing-now-title">
        <header className={styles.rosterHeader}>
          <div>
            <span className={styles.liveMark}><Zap aria-hidden="true" /> Live roster</span>
            <h2 id="playing-now-title">Playing now</h2>
          </div>
          {visibleStatus?.state === "online" ? <span>{rosterRows.length} connected</span> : null}
        </header>

        {rosterRows.length > 0 ? (
          <ul className={styles.rosterList}>
            {rosterRows.map((player) => (
              <li key={player.steamId}>
                <Link className={styles.playerLink} href={player.links.portal}>
                  <ResilientRemoteImage
                    src={avatars[player.steamId]}
                    alt={`${player.name}'s Steam avatar`}
                    className={styles.avatar}
                    loading="lazy"
                    referrerPolicy="no-referrer"
                    fallback={<span className={styles.avatarFallback} aria-hidden="true"><UserRound /></span>}
                  />
                  <span className={styles.playerCopy}>
                    <strong>{player.name}</strong>
                    <small>{player.steamId}</small>
                  </span>
                </Link>
                <a
                  className={styles.steamLink}
                  href={player.links.steam}
                  target="_blank"
                  rel="noreferrer"
                  aria-label={`Open ${player.name}'s Steam profile in a new tab`}
                  title="Steam profile"
                >
                  <ExternalLink aria-hidden="true" />
                </a>
              </li>
            ))}
          </ul>
        ) : (
          <p className={styles.emptyRoster}>
            {visibleStatus?.state === "online"
              ? "The server is online and waiting for its next challenger."
              : visibleStatus?.state === "lost"
                ? "The last snapshot is stale. No players are shown as currently connected."
                : "Live roster unavailable while the server link is being checked."}
          </p>
        )}
      </section>

      <div className={styles.bottomline}>
        <span><Zap aria-hidden="true" /> Arena system</span>
        <span>{statusReadFailed ? "Live refresh delayed" : "ARENA.TAPPED.RO"}</span>
      </div>
    </aside>
  );
}
