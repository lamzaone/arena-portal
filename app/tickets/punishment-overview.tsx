import Link from "next/link";
import { ShieldCheck, ShieldAlert } from "lucide-react";
import { formatDate, isActiveSanction } from "@/components/formatters";
import { PlayerIdentity } from "@/components/player-identity";
import { ThemedPlayerContainer } from "@/components/ui/themed-player-container";
import type { PlayerDashboard } from "@/lib/data/portal-repository";
import type { PlayerIdentityData } from "@/lib/player-identities";
import styles from "./support-workspace.module.css";

export function PunishmentOverview({ profile, identities, viewerSteamId }: { profile: Pick<PlayerDashboard, "bans" | "sanctions" | "sourceConnected">; identities: Readonly<Record<string, PlayerIdentityData>>; viewerSteamId: string }) {
  const records = [
    ...profile.bans.map((record) => ({ ...record, kind: "Ban" })),
    ...profile.sanctions.map((record) => ({ ...record, kind: record.kind })),
  ].filter((record) => isActiveSanction(record.expiresAt));
  return <ThemedPlayerContainer as="section" containerKind="case" ownerSteamId={viewerSteamId} profileThemeKey={identities[viewerSteamId]?.profileThemeKey} className={styles.overview} aria-labelledby="active-punishments-title">
    <div className={styles.overviewHeading}>
      <div>{records.length ? <ShieldAlert aria-hidden="true" /> : <ShieldCheck aria-hidden="true" />}<div><p className="tapped-kicker">Your current status</p><h2 id="active-punishments-title">Active punishments</h2></div></div>
      <span className={styles.count}>{profile.sourceConnected ? `${records.length} active` : "Status unavailable"}</span>
    </div>
    {records.length ? <div className={styles.punishmentGrid}>{records.map((record) => {
      const issuer = record.adminSteamId ? identities[record.adminSteamId] : undefined;
      return <article className={styles.punishment} key={`${record.kind}-${record.id}`}>
        <span className={styles.punishmentKind}>{record.kind}</span><strong>{record.reason}</strong>
        <p>Issued by {issuer ? <PlayerIdentity player={issuer} variant="inline" showSteamId={false} /> : record.adminName || "Console"} on {formatDate(record.createdAt)}.</p>
        <small>{record.expiresAt ? `Ends ${formatDate(record.expiresAt)}` : "Permanent · requires staff review"}</small>
      </article>;
    })}</div> : <p className={styles.statusCopy}>{profile.sourceConnected ? "Your account has no active bans or communication restrictions." : "Your current punishment status is temporarily unavailable. You can still follow your conversations below."}</p>}
    {records.some((record) => record.kind === "Ban") ? <p className={styles.statusCopy}>Use <Link href="/appeals">ban appeals</Link> to request a ban review. For other restrictions or account help, open a <Link href="/tickets">support ticket</Link>.</p> : null}
  </ThemedPlayerContainer>;
}
