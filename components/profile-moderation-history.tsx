import Link from "next/link";
import { ArrowRight, ShieldCheck } from "lucide-react";

import { formatDate, isActiveSanction } from "@/components/formatters";
import { PlayerIdentity } from "@/components/player-identity";
import type { ModerationRecord, PlayerDashboard } from "@/lib/data/portal-repository";
import type { PlayerIdentityData } from "@/lib/player-identities";

import styles from "@/components/profile-moderation-history.module.css";

type ProfileModerationHistoryProps = Pick<PlayerDashboard, "bans" | "sanctions"> & {
  relatedPlayerIdentities?: Readonly<Record<string, PlayerIdentityData>>;
};

function HistoryRecord({
  record,
  moderator,
  communication = false,
}: {
  record: ModerationRecord & { kind?: "Gag" | "Mute" };
  moderator?: PlayerIdentityData;
  communication?: boolean;
}) {
  const active = isActiveSanction(record.expiresAt);

  return (
    <li className={styles.record}>
      <strong className={styles.reason}>
        {record.kind ? `${record.kind} · ` : null}{record.reason}
      </strong>
      <b className={`${styles.status} badge${active ? communication ? " badge-warning" : " badge-danger" : ""}`}>
        {active ? "Active" : "Expired"}
      </b>
      <div className={styles.metadata}>
        <div className={styles.moderator}>
          <span>By</span>
          {moderator ? (
            <PlayerIdentity player={moderator} variant="inline" showSteamId={false} />
          ) : (
            <span className={styles.moderatorName}>{record.adminName || "Console"}</span>
          )}
        </div>
        <time
          className={styles.date}
          dateTime={record.createdAt ? new Date(record.createdAt * 1_000).toISOString() : undefined}
        >
          {formatDate(record.createdAt)}
        </time>
      </div>
    </li>
  );
}

export function ProfileModerationHistory({
  bans,
  sanctions,
  relatedPlayerIdentities = {},
}: ProfileModerationHistoryProps) {
  return (
    <section className={styles.section} aria-labelledby="moderation-title">
      <div className="section-heading compact">
        <p className="eyebrow"><ShieldCheck aria-hidden="true" /> Private record</p>
        <h2 id="moderation-title">Moderation history</h2>
      </div>
      <div className={styles.grid}>
        <article className={`panel ${styles.card}`} aria-labelledby="moderation-bans-title">
          <div className={styles.cardHeading}>
            <h3 id="moderation-bans-title">Bans</h3>
            <Link className={styles.appealsLink} href="/appeals">
              Appeals <ArrowRight aria-hidden="true" />
            </Link>
          </div>
          {bans.length ? (
            <ul className={styles.records}>
              {bans.map((ban) => (
                <HistoryRecord
                  key={ban.id}
                  record={ban}
                  moderator={ban.adminSteamId ? relatedPlayerIdentities[ban.adminSteamId] : undefined}
                />
              ))}
            </ul>
          ) : <p className="empty-copy">No ban history found.</p>}
        </article>
        <article className={`panel ${styles.card}`} aria-labelledby="moderation-comms-title">
          <div className={styles.cardHeading}>
            <h3 id="moderation-comms-title">Gags &amp; mutes</h3>
            <span className={styles.count}>{sanctions.length} record{sanctions.length === 1 ? "" : "s"}</span>
          </div>
          {sanctions.length ? (
            <ul className={styles.records}>
              {sanctions.map((sanction) => (
                <HistoryRecord
                  key={sanction.id}
                  record={sanction}
                  moderator={sanction.adminSteamId ? relatedPlayerIdentities[sanction.adminSteamId] : undefined}
                  communication
                />
              ))}
            </ul>
          ) : <p className="empty-copy">No gag or mute history found.</p>}
        </article>
      </div>
    </section>
  );
}
