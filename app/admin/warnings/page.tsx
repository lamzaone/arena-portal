import { randomUUID } from "node:crypto";
import Link from "next/link";
import { getAdminAccess, adminWriteConfigured } from "@/lib/admin/access";
import { getSession, createAdminActionToken } from "@/lib/auth/session";
import { getWarningsPage } from "@/lib/data/warnings";
import { canManageWarnings, warningStatus } from "@/lib/moderation/warning-policy";
import { PortalShell } from "@/components/ui/portal-shell";
import { AdminPageHeader } from "@/components/ui/admin-page-header";
import { StaffSubmenu } from "@/components/staff-submenu";
import { SignInRequired } from "@/components/sign-in-required";
import { PlayerSearchField } from "@/components/player-search-field";

export default async function WarningsPage({ searchParams }: { searchParams: Promise<{ q?: string; page?: string; error?: string; notice?: string }> }) {
  const session = await getSession();
  if (!session) return <SignInRequired title="Warnings" description="Sign in with Steam to access staff warnings." />;
  const actor = await getAdminAccess(session.steamId);
  if (!actor.isAdmin) return <PortalShell authenticated><p>Staff access is required.</p></PortalShell>;
  const params = await searchParams;
  const page = Math.max(1, Math.min(100000, Number.parseInt(params.page ?? "1", 10) || 1));
  let listing;
  try { listing = await getWarningsPage(params.q, page); }
  catch { return <PortalShell authenticated navigation={<StaffSubmenu access={actor} active="warnings" />}><p>Warning storage is unavailable. Apply migration 040 to the portal database.</p></PortalShell>; }
  const csrf = createAdminActionToken(session);
  const enabled = adminWriteConfigured();
  return <PortalShell authenticated navigation={<StaffSubmenu access={actor} active="warnings" />}>
    <AdminPageHeader title="Warnings" description="Issue warnings that remain in the player's history after they expire. Players acknowledge active warnings in game." access={actor} />
    {params.notice ? <p role="status">{params.notice}</p> : null}{params.error ? <p role="alert">{params.error}</p> : null}
    {canManageWarnings(actor, "issue") && enabled ? <section className="panel"><h2>Issue a warning</h2>
      <form action="/api/admin/warnings" method="post" className="staff-form">
        <input type="hidden" name="csrf" value={csrf} /><input type="hidden" name="action" value="issue" /><input type="hidden" name="id" value={randomUUID()} />
        <PlayerSearchField name="steamId" label="Player" mode="target" companionNameField="playerName" required />
        <label>Player name<input name="playerName" maxLength={128} /></label>
        <label>Expiry in minutes<input name="durationMinutes" type="number" min={1} max={525600} defaultValue={10080} required /></label>
        <label>Reason<textarea name="reason" minLength={2} maxLength={500} required /></label>
        <button type="submit" className="button button-primary">Issue warning</button>
      </form></section> : <p>Issuing requires the warn permission on this server.</p>}
    <section className="panel"><h2>Warning tracker</h2>
      <form action="/admin/warnings" method="get"><label>Search players<input name="q" defaultValue={params.q} maxLength={100} /></label><button type="submit">Search</button></form>
      <div className="table-scroll"><table><thead><tr><th>Player</th><th>Reason</th><th>Issuer</th><th>Issued / expiry (UTC)</th><th>Status</th><th>Action</th></tr></thead><tbody>
      {listing.warnings.map(warning => <tr key={warning.id}>
        <td><Link href={`/players/${warning.steamId}`}>{warning.playerName}</Link><br /><small>{warning.steamId}</small></td>
        <td>{warning.reason}</td><td><Link href={`/players/${warning.issuerSteamId}`}>{warning.issuerName}</Link></td>
        <td>{new Date(warning.issuedAt).toISOString()}<br />{new Date(warning.expiresAt).toISOString()}</td>
        <td>{warningStatus(warning)}{warning.acknowledgedAt ? <small> · Acknowledged</small> : null}</td>
        <td>{warningStatus(warning) === "Active" && canManageWarnings(actor, "revoke") && enabled ? <form action="/api/admin/warnings" method="post">
          <input type="hidden" name="csrf" value={csrf} /><input type="hidden" name="action" value="revoke" /><input type="hidden" name="id" value={warning.id} />
          <label>Revocation reason<input name="reason" minLength={2} maxLength={500} required /></label><button type="submit">Revoke</button>
        </form> : warning.revokeReason}</td>
      </tr>)}</tbody></table></div>
      {!listing.total ? <p>No warnings found.</p> : <p>{listing.total} records · Page {page} {page > 1 ? <Link href={`/admin/warnings?page=${page - 1}&q=${encodeURIComponent(params.q ?? "")}`}>Previous</Link> : null} {page * 30 < listing.total ? <Link href={`/admin/warnings?page=${page + 1}&q=${encodeURIComponent(params.q ?? "")}`}>Next</Link> : null}</p>}
    </section>
  </PortalShell>;
}
