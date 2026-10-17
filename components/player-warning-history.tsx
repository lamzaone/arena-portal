import { getPlayerWarnings } from "@/lib/data/warnings";
import { warningStatus } from "@/lib/moderation/warning-policy";
import Link from "next/link";
import styles from "./profile-moderation-history.module.css";

export async function PlayerWarningHistory({ steamId }: { steamId: string }) {
  let warnings;
  try { warnings = await getPlayerWarnings(steamId); }
  catch { return <section className={`panel ${styles.section}`}><h2>Warnings</h2><p>Warning history is temporarily unavailable.</p></section>; }
  return <section className={`panel ${styles.card} ${styles.section}`} aria-labelledby="warning-history-title">
    <div className={styles.cardHeading}><h2 id="warning-history-title">Warnings</h2><span className={styles.count}>{warnings.length} {warnings.length === 1 ? "record" : "records"}</span></div>
    {warnings.length ? <ul className={styles.records}>{warnings.map(warning => <li key={warning.id} className={styles.record}>
      <strong className={styles.reason}>{warning.reason}</strong>
      <b className={`${styles.status} ${styles.warningStatus}`} data-warning-status={warningStatus(warning).toLowerCase()}>{warningStatus(warning)}</b>
      <div className={styles.metadata}><span>By <Link href={`/players/${warning.issuerSteamId}`}>{warning.issuerName}</Link></span>
        <time dateTime={new Date(warning.issuedAt).toISOString()}>Issued {new Date(warning.issuedAt).toLocaleString("en-GB", { timeZone: "UTC" })} UTC</time>
        <time dateTime={new Date(warning.expiresAt).toISOString()}>Expires {new Date(warning.expiresAt).toLocaleString("en-GB", { timeZone: "UTC" })} UTC</time>
      </div>{warning.revokeReason ? <p>Revocation: {warning.revokeReason}</p> : null}
    </li>)}</ul> : <p className="empty-copy">No warnings found.</p>}
  </section>;
}
