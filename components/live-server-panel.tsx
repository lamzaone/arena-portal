"use client";

import { Clock3, Crosshair, ExternalLink, Users, Zap } from "lucide-react";
import { useEffect, useState } from "react";

import { PlayerIdentity } from "@/components/player-identity";
import { ThemedPlayerContainer } from "@/components/ui/themed-player-container";
import type { PlayerIdentityData } from "@/lib/player-identities";
import { browserPollingEnvironment, createVisiblePoller } from "@/lib/server-link/client-polling";
import { currentRoster, formatSessionTime, formatTimeLeft, playerLinks, statusAtClientTime, trustedSteamAvatarUrl } from "@/lib/server-link/presentation";
import type { PublicStatus } from "@/lib/server-link/protocol";

import styles from "./live-server-panel.module.css";

type PlayerEnrichmentResponse = {
  players: PlayerIdentityData[];
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
  const [identities, setIdentities] = useState<Record<string, PlayerIdentityData>>({});

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
    if (status?.state !== "online") return;
    const timer = window.setInterval(() => {
      if (document.visibilityState === "visible") setClientNow(Date.now());
    }, 1_000);
    return () => window.clearInterval(timer);
  }, [status?.state]);

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
    const rosterIds = new Set(rosterKey.split(","));
    setIdentities((current) => Object.fromEntries(
      Object.entries(current).filter(([steamId]) => rosterIds.has(steamId)),
    ));
    if (!rosterKey) return;
    const poller = createVisiblePoller({
      environment: browserPollingEnvironment(),
      intervalMs: 60_000,
      requestTimeoutMs: 5_000,
      request: (signal) => fetchJson<PlayerEnrichmentResponse>("/api/server-link/players", signal),
      onSuccess(payload) {
        setIdentities(Object.fromEntries(payload.players.flatMap((player) => {
          if (!rosterIds.has(player.steamId)) return [];
          return [[player.steamId, { ...player, avatarUrl: trustedSteamAvatarUrl(player.avatarUrl) }]];
        })));
      },
      onFailure() {
        // Public profiles can fail independently; live names and stats remain available.
      },
    });
    return () => poller.dispose();
  }, [rosterKey]);

  const updated = lastUpdate(visibleStatus);
  const playerCount = visibleStatus?.players !== null && visibleStatus?.players !== undefined && visibleStatus.maxPlayers !== null
    ? `${visibleStatus.players} / ${visibleStatus.maxPlayers}`
    : "—";
  const map = visibleStatus?.map ?? "Awaiting link";
  const timeLeft = formatTimeLeft(visibleStatus, statusReceivedAt, clientNow);
  const elapsedSeconds = Math.floor(Math.max(0, clientNow - statusReceivedAt) / 1_000);
  const label = statusLabel(visibleStatus);
  const statusClass = visibleStatus?.state === "online"
    ? styles.online
    : visibleStatus?.state === "lost"
      ? styles.lost
      : styles.unknown;
  const rosterRows = roster.flatMap((player) => {
    const links = playerLinks(player.steamId);
    return links ? [{ ...player, links }] : [];
  });

  return (
    <aside className={`hero-reveal hero-delay ${styles.panel}`} aria-label="ARENA.TAPPED.RO live overview">
      <div className={styles.topline}>
        <span className={styles.terminalLabel}><Crosshair aria-hidden="true" /> Live terminal</span>
        <span className={`${styles.status} ${statusClass}`} role="status" aria-live="polite">
          <i aria-hidden="true" />{label}
        </span>
      </div>

      <div className={styles.overview}>
        <div className={styles.mapHeading}>
          <span className={styles.modeBadge}>1V1</span>
          <div><span className={styles.eyebrow}>Current map</span><h2>{map}</h2></div>
        </div>
        <dl className={styles.metrics}>
          <div><dt><Users aria-hidden="true" /> Players</dt><dd>{playerCount}</dd></div>
          <div><dt><Clock3 aria-hidden="true" /> Time left</dt><dd>{timeLeft}</dd></div>
        </dl>
      </div>

      <section className={styles.roster} aria-labelledby="playing-now-title">
        <header className={styles.rosterHeader}>
          <div>
            <h2 id="playing-now-title">Playing now</h2>
          </div>
          {visibleStatus?.state === "online" ? <span>{rosterRows.length} connected</span> : null}
        </header>

        {rosterRows.length > 0 ? (
          <>
          <div className={styles.rosterColumns} aria-hidden="true"><span>Player</span><span>Time online</span><span>Score</span><span /></div>
          <ul className={styles.rosterList}>
            {rosterRows.map((player) => (
              <ThemedPlayerContainer as="li" key={player.steamId} className={styles.playerRow} ownerSteamId={player.steamId} profileThemeKey={identities[player.steamId]?.profileThemeKey}>
                <PlayerIdentity
                  player={{
                    ...(identities[player.steamId] ?? {
                      steamId: player.steamId,
                      avatarUrl: null,
                      presence: "unknown",
                      profileThemeKey: null,
                      identityGroups: [],
                    }),
                    displayName: player.name,
                  }}
                  className={styles.playerIdentity}
                  variant="compact"
                />
                <span className={styles.sessionTime} aria-label={`Time online: ${formatSessionTime(player.connectedSeconds == null ? null : player.connectedSeconds + elapsedSeconds)}`}>
                  {formatSessionTime(player.connectedSeconds == null ? null : player.connectedSeconds + elapsedSeconds)}
                </span>
                <strong className={styles.score} aria-label={`Score: ${player.score ?? "unavailable"}`}>{player.score ?? "—"}</strong>
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
              </ThemedPlayerContainer>
            ))}
          </ul>
          </>
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
        <span><Zap aria-hidden="true" /> ARENA.TAPPED.RO</span>
        <span>{statusReadFailed ? "Live refresh delayed" : updated ? <>Updated <time dateTime={updated.dateTime}>{updated.label}</time></> : "Waiting for server"}</span>
      </div>
    </aside>
  );
}
