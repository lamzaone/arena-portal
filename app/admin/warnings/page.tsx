import { randomUUID } from "node:crypto";
import Link from "next/link";
import { CircleAlert, ShieldCheck } from "lucide-react";

import { getAdminAccess, adminWriteConfigured } from "@/lib/admin/access";
import { getSession, createAdminActionToken } from "@/lib/auth/session";
import { getWarningsPage } from "@/lib/data/warnings";
import { canManageWarnings, warningStatus } from "@/lib/moderation/warning-policy";
import { formatPortalDate } from "@/components/formatters";
import { PortalShell } from "@/components/ui/portal-shell";
import { AdminPageHeader } from "@/components/ui/admin-page-header";
import { DataTable } from "@/components/ui/data-table";
import { LinkPagination } from "@/components/ui/link-pagination";
import { StaffSubmenu } from "@/components/staff-submenu";
import { SignInRequired } from "@/components/sign-in-required";
import { PlayerSearchField } from "@/components/player-search-field";
import { PortalToast } from "@/components/success-toast";
import { SearchNavigationForm, SearchSubmitButton } from "@/components/ui/search-field";
import { ServerSearchField } from "@/components/ui/server-search-field";

import styles from "./warnings.module.css";

type SearchParams = { q?: string; page?: string; error?: string; notice?: string };

function WarningTime({ value }: { value: number }) {
  const iso = new Date(value).toISOString();
  return <time dateTime={iso}>{formatPortalDate(iso)}</time>;
}

export default async function WarningsPage({ searchParams }: { searchParams: Promise<SearchParams> }) {
  const session = await getSession();
  if (!session) return <SignInRequired title="Warnings" description="Sign in with Steam to access staff warnings." />;
  const actor = await getAdminAccess(session.steamId);
  if (!actor.isAdmin) return <PortalShell authenticated className="staff-page"><section className="staff-denied"><ShieldCheck aria-hidden="true" /><p className="tapped-kicker">Restricted area</p><h1>Staff access required.</h1><p>Your account needs an active staff assignment to view warnings.</p></section></PortalShell>;

  const params = await searchParams;
  const query = (params.q ?? "").trim().slice(0, 100);
  const page = Math.max(1, Math.min(100000, Number.parseInt(params.page ?? "1", 10) || 1));
  const navigation = <StaffSubmenu access={actor} active="warnings" />;
  const header = <AdminPageHeader title="Warnings" description="Issue warnings, review player history, and revoke active records. Players acknowledge active warnings in game." access={actor} />;
  let listing;
  try { listing = await getWarningsPage(query, page); }
  catch {
    return <PortalShell authenticated className="staff-page" navigation={navigation}>{header}<section className={`panel ${styles.unavailable}`} role="status"><CircleAlert aria-hidden="true" /><h2>Warning history is temporarily unavailable.</h2><p>Check the portal database and warning migration, then try again.</p></section></PortalShell>;
  }
  const csrf = createAdminActionToken(session);
  const enabled = adminWriteConfigured();
  const canIssue = canManageWarnings(actor, "issue") && enabled;
  const canRevoke = canManageWarnings(actor, "revoke") && enabled;
  const now = Date.now();
  const href = (targetPage: number) => {
    const values = new URLSearchParams({ page: String(targetPage) });
    if (query) values.set("q", query);
    return `/admin/warnings?${values}`;
  };

  return <PortalShell authenticated className="staff-page" navigation={navigation}>
    {header}
    {params.notice ? <PortalToast message={params.notice} /> : null}
    {params.error ? <PortalToast message={params.error} variant="danger" /> : null}

    {canIssue ? <section className={`panel ${styles.panel}`} aria-labelledby="issue-warning-title">
      <div className={styles.sectionHeading}><div><p className="tapped-kicker"><CircleAlert aria-hidden="true" /> Player conduct</p><h2 id="issue-warning-title">Issue a warning</h2></div><span>History is retained after expiry</span></div>
      <form action="/api/admin/warnings" method="post" className={styles.issueForm}>
        <input type="hidden" name="csrf" value={csrf} /><input type="hidden" name="action" value="issue" /><input type="hidden" name="id" value={randomUUID()} />
        <PlayerSearchField name="steamId" label="Player" mode="target" companionNameField="playerName" required />
        <label>Player name<input name="playerName" maxLength={128} placeholder="Filled when you choose a player" /></label>
        <label>Expiry in minutes<input name="durationMinutes" type="number" min={1} max={525600} defaultValue={10080} aria-label="Expiry in minutes" aria-describedby="warning-duration-help" required /><small id="warning-duration-help">Default: 7 days</small></label>
        <label className={styles.reasonField}>Reason<textarea name="reason" minLength={2} maxLength={500} required placeholder="Explain the behaviour the player needs to correct." rows={3} /></label>
        <div className={styles.formFooter}><span>The player will be asked to acknowledge this warning.</span><button type="submit" className="button button-primary"><CircleAlert aria-hidden="true" />Issue warning</button></div>
      </form>
    </section> : <p className={`staff-permission-note ${styles.permission}`}><ShieldCheck aria-hidden="true" /><span>{enabled ? "Issuing warnings requires the warn permission on this server." : "Moderation actions are currently unavailable. Warning history remains visible."}</span></p>}

    <section className={`panel ${styles.panel}`} aria-labelledby="warning-history-title">
      <div className={styles.sectionHeading}><div><p className="tapped-kicker"><ShieldCheck aria-hidden="true" /> Moderation history</p><h2 id="warning-history-title">Warning tracker</h2></div><span>{listing.total.toLocaleString()} {listing.total === 1 ? "record" : "records"}</span></div>
      <SearchNavigationForm className={styles.search} action="/admin/warnings" aria-label="Search warning records" resetFields={["page"]}>
        <ServerSearchField id="warning-search" name="q" label="Player name or SteamID" defaultValue={query} maxLength={100} placeholder="Find a player..." />
        <SearchSubmitButton variant="secondary" />
      </SearchNavigationForm>
      {listing.warnings.length ? <DataTable className={styles.tableFrame} tableClassName={`staff-table ${styles.table}`} caption="Staff warning records">
        <thead><tr><th scope="col">Player</th><th scope="col">Reason</th><th scope="col">Issuer</th><th scope="col">Issued / expiry · UTC</th><th scope="col">Status</th><th scope="col">Action</th></tr></thead>
        <tbody>{listing.warnings.map(warning => {
          const status = warningStatus(warning, now);
          return <tr key={warning.id}>
            <td><Link className={styles.playerLink} href={`/players/${warning.steamId}`}>{warning.playerName}</Link><small>{warning.steamId}</small></td>
            <td className={styles.reason}><strong>{warning.reason}</strong>{warning.revokeReason ? <small>Revocation: {warning.revokeReason}</small> : null}</td>
            <td><Link className={styles.playerLink} href={`/players/${warning.issuerSteamId}`}>{warning.issuerName}</Link></td>
            <td className={styles.dates}><small>Issued</small><WarningTime value={warning.issuedAt} /><small>Expires</small><WarningTime value={warning.expiresAt} /></td>
            <td><span className={`${styles.status} ${styles[status.toLowerCase()]}`}>{status}</span>{warning.acknowledgedAt ? <small className={styles.acknowledged}>Acknowledged</small> : null}</td>
            <td>{status === "Active" && canRevoke ? <form className={styles.revokeForm} action="/api/admin/warnings" method="post" aria-label={`Revoke warning for ${warning.playerName}`}>
              <input type="hidden" name="csrf" value={csrf} /><input type="hidden" name="action" value="revoke" /><input type="hidden" name="id" value={warning.id} />
              <label htmlFor={`revoke-${warning.id}`}>Revocation reason<input id={`revoke-${warning.id}`} name="reason" minLength={2} maxLength={500} required placeholder="Explain this correction" /></label><button className="staff-danger-button" type="submit">Revoke</button>
            </form> : <span className={styles.noAction}>—</span>}</td>
          </tr>;
        })}</tbody>
      </DataTable> : <p className={styles.empty} role="status">{query ? "No warnings match this search." : "No warnings recorded."}</p>}
      {listing.total > 0 ? <LinkPagination page={page} totalPages={Math.ceil(listing.total / 30)} label="Warning history pages" hrefForPage={href} /> : null}
    </section>
  </PortalShell>;
}
