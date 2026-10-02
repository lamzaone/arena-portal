"use client";

import type { CrashParticipantPublic } from "@/lib/casino/types";
import { tokens } from "./client";

export function CrashParticipants({ participants }: { participants: CrashParticipantPublic[] }) {
  return (
    <section className="crash-participants" aria-label="Players in this round">
      <header>
        <span>AT THE TABLE</span>
        <strong>{participants.length} players</strong>
      </header>
      {participants.length ? (
        <ol>
          {participants.map(player => (
            <li className={`crash-participant is-${player.status}`} key={player.betId}>
              <span className="crash-avatar">
                {player.avatarUrl ? (
                  <img src={player.avatarUrl} alt="" loading="lazy" referrerPolicy="no-referrer" />
                ) : (player.displayName || player.steamId).slice(0, 2).toUpperCase()}
              </span>
              <div>
                <strong>{player.displayName || player.steamId}</strong>
                <span>{tokens(player.stakeTokens)} Tokens staked</span>
              </div>
              <div className="crash-participant-status">
                <strong>
                  {player.status === "pending" ? "Ready for takeoff"
                    : player.status === "active" ? "In flight"
                    : player.status === "lost" ? "Crashed"
                    : `${((player.cashoutMultiplier ?? 100) / 100).toFixed(2)}x cashout`}
                </strong>
                <span>{player.payoutTokens === null ? "—" : `${tokens(player.payoutTokens)} Tokens returned`}</span>
              </div>
            </li>
          ))}
        </ol>
      ) : <p>The table is open. Be the first to join.</p>}
    </section>
  );
}
