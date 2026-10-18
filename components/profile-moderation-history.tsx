import Link from "next/link";
import { ArrowRight, Ban, ShieldCheck, VolumeX } from "lucide-react";

import { formatDate, isActiveSanction } from "@/components/formatters";
import { PlayerIdentity } from "@/components/player-identity";
import { ProfileHistoryList } from "@/components/profile-history-list";
import { ProfileHistoryPagination, type ProfileHistoryPages } from "@/components/profile-history-pagination";
import type { ModerationRecord, PlayerDashboard } from "@/lib/data/portal-repository";
import type { PlayerModerationHistory } from "@/lib/data/player-moderation-history";
import type { PlayerIdentityData } from "@/lib/player-identities";

import styles from "@/components/profile-moderation-history.module.css";

type ProfileModerationHistoryProps = Pick<PlayerDashboard, "bans" | "sanctions"> & {
  relatedPlayerIdentities?: Readonly<Record<string, PlayerIdentityData>>;
  steamId: string;
  history?: PlayerModerationHistory;
  pages?: ProfileHistoryPages;
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
  steamId,
  history,
  pages = { warnings: 1, bans: 1, comms: 1 },
}: ProfileModerationHistoryProps) {
  const banRecords = history?.bans.records ?? bans;
  const commsRecords = history?.sanctions.records ?? sanctions;
  const banTotal = history?.bans.total ?? bans.length;
  const commsTotal = history?.sanctions.total ?? sanctions.length;
  return (
    <section className={styles.section} aria-labelledby="moderation-title">
      <div className="section-heading compact">
        <p className="eyebrow"><ShieldCheck aria-hidden="true" /> Private record</p>
        <h2 id="moderation-title">Moderation history</h2>
      </div>
      <div className={styles.grid}>
        <article className={`panel ${styles.card}`} aria-labelledby="moderation-bans-title">
          <div className={styles.cardHeading}>
            <h3 id="moderation-bans-title"><Ban aria-hidden="true" /> Bans <span className={styles.count}>{banTotal}</span></h3>
            <Link className={styles.appealsLink} href="/appeals">
              Appeals <ArrowRight aria-hidden="true" />
            </Link>
          </div>
          {history?.bans.available === false ? <p className="empty-copy">Ban history is temporarily unavailable.</p> : banRecords.length ? (
            <ProfileHistoryList key={history?.bans.page ?? 1} page={history?.bans.page} label="bans" total={banTotal} pagination={history ? <ProfileHistoryPagination steamId={steamId} kind="bans" pages={pages} {...history.bans} /> : null} items={banRecords.map((ban) => (
                <HistoryRecord
                  key={ban.id}
                  record={ban}
                  moderator={ban.adminSteamId ? relatedPlayerIdentities[ban.adminSteamId] : undefined}
                />
              ))} />
          ) : <p className="empty-copy">No ban history found.</p>}
        </article>
        <article className={`panel ${styles.card}`} aria-labelledby="moderation-comms-title">
          <div className={styles.cardHeading}>
            <h3 id="moderation-comms-title"><VolumeX aria-hidden="true" /> Gags &amp; mutes</h3>
            <span className={styles.count}>{commsTotal} record{commsTotal === 1 ? "" : "s"}</span>
          </div>
          {history?.sanctions.available === false ? <p className="empty-copy">Gag and mute history is temporarily unavailable.</p> : commsRecords.length ? (
            <ProfileHistoryList key={history?.sanctions.page ?? 1} page={history?.sanctions.page} label="gags and mutes" total={commsTotal} pagination={history ? <ProfileHistoryPagination steamId={steamId} kind="comms" pages={pages} {...history.sanctions} /> : null} items={commsRecords.map((sanction) => (
                <HistoryRecord
                  key={sanction.id}
                  record={sanction}
                  moderator={sanction.adminSteamId ? relatedPlayerIdentities[sanction.adminSteamId] : undefined}
                  communication
                />
              ))} />
          ) : <p className="empty-copy">No gag or mute history found.</p>}
        </article>
      </div>
    </section>
  );
}
