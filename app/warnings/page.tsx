import Link from "next/link";
import { getSession } from "@/lib/auth/session";
import { getWarningsPage } from "@/lib/data/warnings";
import { warningStatus } from "@/lib/moderation/warning-policy";
import { PortalShell } from "@/components/ui/portal-shell";

export default async function WarningTracker({ searchParams }: { searchParams: Promise<{ q?: string; page?: string }> }) {
  const [session, params] = await Promise.all([getSession(), searchParams]);
  const page = Math.max(1, Math.min(100000, Number.parseInt(params.page ?? "1", 10) || 1));
  let listing;
  try { listing = await getWarningsPage(params.q, page); }
  catch { return <PortalShell authenticated={Boolean(session)}><h1>Warning tracker</h1><p>Warning history is temporarily unavailable.</p></PortalShell>; }
  const href = (number: number) => `/warnings?page=${number}&q=${encodeURIComponent(params.q ?? "")}`;
  return <PortalShell authenticated={Boolean(session)}>
    <section className="panel"><p className="eyebrow">Community moderation</p><h1>Warning tracker</h1><p>Active, expired and revoked warnings remain visible in each player's history.</p>
      <form action="/warnings" method="get"><label>Player name or SteamID<input name="q" maxLength={100} defaultValue={params.q} /></label><button type="submit" className="button button-primary">Search</button></form>
    </section>
    <section className="panel"><div className="table-scroll"><table><thead><tr><th>Player</th><th>Warning reason</th><th>Issuer</th><th>Issued / expiry (UTC)</th><th>Status</th></tr></thead><tbody>
      {listing.warnings.map(warning => <tr key={warning.id}>
        <td><Link href={`/players/${warning.steamId}`}>{warning.playerName}</Link><br /><small>{warning.steamId}</small></td>
        <td>{warning.reason}</td><td><Link href={`/players/${warning.issuerSteamId}`}>{warning.issuerName}</Link></td>
        <td><time dateTime={new Date(warning.issuedAt).toISOString()}>{new Date(warning.issuedAt).toLocaleString("en-GB", { timeZone: "UTC" })}</time><br /><time dateTime={new Date(warning.expiresAt).toISOString()}>{new Date(warning.expiresAt).toLocaleString("en-GB", { timeZone: "UTC" })}</time></td>
        <td><span className={`badge ${warningStatus(warning) === "Active" ? "badge-warning" : ""}`}>{warningStatus(warning)}</span></td>
      </tr>)}
    </tbody></table></div>
    {!listing.total ? <p>No warnings found.</p> : <nav aria-label="Warnings pages"><p>{listing.total} warnings · Page {page}</p>{page > 1 ? <Link href={href(page - 1)}>Previous</Link> : null}{page * 30 < listing.total ? <Link href={href(page + 1)}>Next</Link> : null}</nav>}
    </section>
  </PortalShell>;
}
