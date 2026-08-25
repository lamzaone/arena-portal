import Link from "next/link";
import { AlertTriangle, Ban, CheckCircle2, Gavel, LockKeyhole, Search, ShieldCheck, VolumeX } from "lucide-react";

import { adminWriteConfigured, getAdminAccess } from "@/lib/admin/access";
import { getSession, createAdminActionToken } from "@/lib/auth/session";
import { formatDate, isActiveSanction } from "@/components/formatters";
import { SignInRequired } from "@/components/sign-in-required";
import { SiteHeader } from "@/components/site-header";
import { getStaffModeration, type StaffSanction } from "@/lib/data/portal-repository";

type AdminPageProps = { searchParams: Promise<{ page?: string; q?: string; notice?: string; error?: string }> };

function getPageNumber(value: string | undefined) {
  const parsed = Number.parseInt(value ?? "1", 10);
  return Number.isSafeInteger(parsed) && parsed > 0 ? parsed : 1;
}

function moderationLink(page: number, query: string) {
  const parameters = new URLSearchParams({ page: String(page) });
  if (query) parameters.set("q", query);
  return `/admin?${parameters.toString()}`;
}

function getSanctionEvents(sanctions: StaffSanction[]) {
  const paired = new Map<string, Set<StaffSanction["kind"]>>();
  for (const sanction of sanctions) {
    const key = [sanction.steamId, sanction.reason, sanction.adminName, sanction.createdAt, sanction.expiresAt, sanction.length].join(":");
    const kinds = paired.get(key) ?? new Set<StaffSanction["kind"]>();
    kinds.add(sanction.kind);
    paired.set(key, kinds);
  }
  const returned = new Set<string>();
  return sanctions.flatMap((sanction) => {
    const key = [sanction.steamId, sanction.reason, sanction.adminName, sanction.createdAt, sanction.expiresAt, sanction.length].join(":");
    const kinds = paired.get(key) ?? new Set<StaffSanction["kind"]>();
    if (kinds.size === 2) {
      if (returned.has(key)) return [];
      returned.add(key);
      return [{ ...sanction, kind: "Silence" }];
    }
    return [sanction];
  });
}

export default async function AdminPage({ searchParams }: AdminPageProps) {
  const [session, params] = await Promise.all([getSession(), searchParams]);
  if (!session) return <SignInRequired title="Staff moderation" description="Sign in with the Steam account that has your ARENA admin group." />;

  const access = await getAdminAccess(session.steamId);
  if (!access.isAdmin) return <main className="tapped-page"><div className="shell"><SiteHeader authenticated /><section className="staff-denied"><LockKeyhole aria-hidden="true" /><p className="tapped-kicker">Restricted area</p><h1>Staff access required.</h1><p>Your Steam account does not have an active Admins.Core staff assignment for ARENA.TAPPED.RO.</p><Link className="button button-secondary" href="/dashboard">Back to profile</Link></section></div></main>;

  const page = getPageNumber(params.page);
  const query = (params.q ?? "").trim().slice(0, 64);
  const [moderation] = await Promise.all([getStaffModeration(page, query)]);
  const totalPages = Math.max(1, Math.ceil(Math.max(moderation.banTotal, moderation.sanctionTotal) / moderation.pageSize));
  const currentPage = Math.min(moderation.page, totalPages);
  const csrf = createAdminActionToken(session);
  const sanctionEvents = getSanctionEvents(moderation.sanctions);
  const actionsReady = adminWriteConfigured();

  return (
    <main className="tapped-page staff-page"><div className="shell"><SiteHeader authenticated />
      <section className="staff-hero"><div><p className="tapped-kicker"><ShieldCheck aria-hidden="true" /> Staff operations</p><h1>Moderation<br /><span>control room.</span></h1><p>Review the live ban list and all communication sanctions from Swiftly. Permissions and immunity follow the configured Admins.Core groups.</p></div><aside className="staff-access-card"><span>ACTIVE ROLE</span><strong>{access.groups.join(" + ")}</strong><small>Immunity {access.immunity} - Ban: {access.canBan ? "allowed" : "no"} - Unban: {access.canUnban ? "allowed" : "no"}</small></aside></section>

      {params.notice && <div className="notice notice-success"><CheckCircle2 aria-hidden="true" /> {params.notice.startsWith("ban-queued-") ? `Ban request queued (#${params.notice.slice("ban-queued-".length)}). The server bridge will apply it shortly.` : params.notice.startsWith("unban-queued-") ? `Unban request queued (#${params.notice.slice("unban-queued-".length)}). The server bridge will apply it shortly.` : "Moderation request queued."}</div>}
      {params.error && <div className="notice notice-danger"><AlertTriangle aria-hidden="true" /> {params.error === "writes-disabled" ? "Moderation writes are disabled until the portal bridge is configured and enabled." : params.error === "immunity" ? "You cannot ban an admin with equal or higher immunity." : "The moderation action could not be queued. Check your permissions and the submitted values."}</div>}

      <section className="staff-tools"><form className="staff-search" action="/admin" method="get"><label htmlFor="staff-search">Find a player</label><div><input id="staff-search" name="q" defaultValue={query} placeholder="SteamID64 or player name" /><button type="submit"><Search aria-hidden="true" /> Search</button></div></form><div className={`staff-write-status ${actionsReady ? "ready" : ""}`}><Gavel aria-hidden="true" /><span>{actionsReady ? "Server bridge actions are enabled" : "Read-only mode: server bridge is not enabled"}</span></div></section>

      {access.canBan ? <section className="staff-ban-form"><div><p className="tapped-kicker"><Ban aria-hidden="true" /> Ban player</p><h2>Queue an offline SteamID ban.</h2><p>Normal server ban only. The portal validates staff permissions first; Swiftly then applies the queued request through its own bans API.</p></div><form action="/api/admin/moderation" method="post"><input type="hidden" name="csrf" value={csrf} /><input type="hidden" name="action" value="ban" /><label>SteamID64<input name="steamId" inputMode="numeric" pattern="7656119[0-9]{10}" required placeholder="7656119..." /></label><label>Player name<input name="playerName" maxLength={128} placeholder="Optional display name" /></label><label>Duration<select name="durationMinutes" defaultValue="1440"><option value="5">5 minutes</option><option value="60">1 hour</option><option value="1440">1 day</option><option value="10080">7 days</option><option value="43200">30 days</option><option value="0">Permanent</option></select></label><label>Reason<input name="reason" minLength={2} maxLength={200} required placeholder="Reason for ban" /></label><button className="button button-primary" type="submit" disabled={!actionsReady}><Gavel aria-hidden="true" /> Queue ban</button></form></section> : <section className="staff-permission-note"><LockKeyhole aria-hidden="true" /><span>Your current group can view moderation records but does not include <code>admins.commands.ban</code>.</span></section>}

      <section className="staff-record-section"><div className="staff-section-heading"><div><p className="tapped-kicker"><Ban aria-hidden="true" /> Live records</p><h2>Ban list</h2></div><span>{moderation.banTotal.toLocaleString()} records</span></div>{moderation.bans.length ? <div className="staff-table-scroll"><table className="staff-table"><thead><tr><th>Player</th><th>Reason</th><th>Issued by</th><th>Status</th><th>Action</th></tr></thead><tbody>{moderation.bans.map((ban) => <tr key={ban.id}><td><strong>{ban.playerName}</strong><small>{ban.steamId}</small></td><td><strong>{ban.reason}</strong><small>{formatDate(ban.createdAt)}{ban.global ? " - Global" : ""}</small></td><td>{ban.adminName}</td><td><span className={isActiveSanction(ban.expiresAt) ? "staff-status active" : "staff-status"}>{isActiveSanction(ban.expiresAt) ? "Active" : "Expired"}<small>{ban.expiresAt ? formatDate(ban.expiresAt) : "Permanent"}</small></span></td><td>{access.canUnban && isActiveSanction(ban.expiresAt) ? <form action="/api/admin/moderation" method="post"><input type="hidden" name="csrf" value={csrf} /><input type="hidden" name="action" value="unban" /><input type="hidden" name="steamId" value={ban.steamId} /><button className="staff-unban-button" type="submit" disabled={!actionsReady}>Unban</button></form> : <span className="staff-no-action">-</span>}</td></tr>)}</tbody></table></div> : <p className="empty-copy">No bans match this search.</p>}</section>

      <section className="staff-record-section"><div className="staff-section-heading"><div><p className="tapped-kicker"><VolumeX aria-hidden="true" /> Communication record</p><h2>Gag, mute and silence history</h2></div><span>{moderation.sanctionTotal.toLocaleString()} raw records</span></div>{sanctionEvents.length ? <div className="staff-table-scroll"><table className="staff-table"><thead><tr><th>Player</th><th>Type</th><th>Reason</th><th>Issued by</th><th>Status</th></tr></thead><tbody>{sanctionEvents.map((sanction) => <tr key={`${sanction.id}-${sanction.kind}`}><td><strong>{sanction.playerName}</strong><small>{sanction.steamId}</small></td><td><span className={`sanction-type ${sanction.kind.toLowerCase()}`}>{sanction.kind}</span></td><td><strong>{sanction.reason}</strong><small>{formatDate(sanction.createdAt)}{sanction.global ? " - Global" : ""}</small></td><td>{sanction.adminName}</td><td><span className={isActiveSanction(sanction.expiresAt) ? "staff-status active" : "staff-status"}>{isActiveSanction(sanction.expiresAt) ? "Active" : "Expired"}<small>{sanction.expiresAt ? formatDate(sanction.expiresAt) : "Permanent"}</small></span></td></tr>)}</tbody></table></div> : <p className="empty-copy">No communication sanctions match this search.</p>}</section>
      <nav className="pagination staff-pagination" aria-label="Moderation pages"><Link className={currentPage <= 1 ? "is-disabled" : ""} aria-disabled={currentPage <= 1} href={currentPage <= 1 ? moderationLink(1, query) : moderationLink(currentPage - 1, query)}>Previous</Link><span>Page {currentPage} of {totalPages}</span><Link className={currentPage >= totalPages ? "is-disabled" : ""} aria-disabled={currentPage >= totalPages} href={currentPage >= totalPages ? moderationLink(currentPage, query) : moderationLink(currentPage + 1, query)}>Next</Link></nav>
    </div></main>
  );
}
