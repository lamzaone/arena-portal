import { getPlayerWarningsPage } from "@/lib/data/warnings";
import { warningStatus } from "@/lib/moderation/warning-policy";
import Link from "next/link";
import { AlertTriangle } from "lucide-react";
import { ProfileHistoryList } from "./profile-history-list";
import { ProfileHistoryPagination, type ProfileHistoryPages } from "./profile-history-pagination";
import styles from "./profile-moderation-history.module.css";

export async function PlayerWarningHistory({ steamId, pages = { warnings: 1, bans: 1, comms: 1 } }: { steamId: string; pages?: ProfileHistoryPages }) {
  let history;
  try { history = await getPlayerWarningsPage(steamId, pages.warnings); }
  catch { return <section className={`panel ${styles.section}`}><h2>Warnings</h2><p>Warning history is temporarily unavailable.</p></section>; }
  const { warnings, total, page, pageSize } = history;
  return <section className={`panel ${styles.card} ${styles.section}`} aria-labelledby="warning-history-title">
    <div className={styles.cardHeading}><h2 id="warning-history-title"><AlertTriangle aria-hidden="true" /> Warnings</h2><span className={styles.count}>{total} {total === 1 ? "record" : "records"}</span></div>
    {warnings.length ? <ProfileHistoryList key={page} page={page} label="warnings" total={total} pagination={<ProfileHistoryPagination steamId={steamId} kind="warnings" pages={pages} page={page} pageSize={pageSize} total={total} />} items={warnings.map(warning => <li key={warning.id} className={styles.record}>
      <strong className={styles.reason}>{warning.reason}</strong>
      <b className={`${styles.status} ${styles.warningStatus}`} data-warning-status={warningStatus(warning).toLowerCase()}>{warningStatus(warning)}</b>
      <div className={styles.metadata}><span>By <Link href={`/players/${warning.issuerSteamId}`}>{warning.issuerName}</Link></span>
        <time dateTime={new Date(warning.issuedAt).toISOString()}>Issued {new Date(warning.issuedAt).toLocaleString("en-GB", { timeZone: "UTC" })} UTC</time>
        <time dateTime={new Date(warning.expiresAt).toISOString()}>Expires {new Date(warning.expiresAt).toLocaleString("en-GB", { timeZone: "UTC" })} UTC</time>
      </div>{warning.revokeReason ? <p className={styles.revocation}>Revocation: {warning.revokeReason}</p> : null}
    </li>)} /> : <p className="empty-copy">No warnings found.</p>}
  </section>;
}
