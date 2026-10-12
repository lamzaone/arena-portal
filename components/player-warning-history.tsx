import { getPlayerWarnings } from "@/lib/data/warnings";
import { warningStatus } from "@/lib/moderation/warning-policy";
import Link from "next/link";
import styles from "./profile-moderation-history.module.css";

export async function PlayerWarningHistory({ steamId }: { steamId: string }) {
  let warnings;
  try { warnings = await getPlayerWarnings(steamId); }
  catch { return <section className="panel"><h2>Warnings</h2><p>Warning history is temporarily unavailable.</p></section>; }
  return <section className={`panel ${styles.card}`} aria-labelledby="warning-history-title">
    <div className={styles.cardHeading}><h2 id="warning-history-title">Warnings</h2><Link href="/warnings">Warning tracker</Link></div>
    {warnings.length ? <ul className={styles.records}>{warnings.map(warning => <li key={warning.id} className={styles.record}>
      <strong className={styles.reason}>{warning.reason}</strong>
      <b className={`${styles.status} badge ${warningStatus(warning) === "Active" ? "badge-warning" : ""}`}>{warningStatus(warning)}</b>
      <div className={styles.metadata}><span>By <Link href={`/players/${warning.issuerSteamId}`}>{warning.issuerName}</Link></span>
        <time dateTime={new Date(warning.issuedAt).toISOString()}>Issued {new Date(warning.issuedAt).toLocaleString("en-GB", { timeZone: "UTC" })} UTC</time>
        <time dateTime={new Date(warning.expiresAt).toISOString()}>Expires {new Date(warning.expiresAt).toLocaleString("en-GB", { timeZone: "UTC" })} UTC</time>
      </div>{warning.revokeReason ? <p>Revocation: {warning.revokeReason}</p> : null}
    </li>)}</ul> : <p className="empty-copy">No warnings found.</p>}
  </section>;
}
