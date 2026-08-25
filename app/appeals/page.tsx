import { AlertTriangle, Shield } from "lucide-react";

import { AccountNav } from "@/components/account-nav";
import { formatDate, formatPortalDate, isActiveSanction } from "@/components/formatters";
import { SignInRequired } from "@/components/sign-in-required";
import { SiteHeader } from "@/components/site-header";
import { getSession } from "@/lib/auth/session";
import { getAppeals, getPlayerDashboard, portalStorageConfigured } from "@/lib/data/portal-repository";

type AppealsPageProps = { searchParams: Promise<{ submitted?: string; error?: string }> };

export default async function AppealsPage({ searchParams }: AppealsPageProps) {
  const session = await getSession();
  if (!session) return <SignInRequired title="Ban appeals" description="Ban appeals are private and are available only from the Steam account that was sanctioned." />;

  const [profile, appeals, params] = await Promise.all([getPlayerDashboard(session.steamId), getAppeals(session.steamId), searchParams]);
  const activeBan = profile.bans.find((ban) => isActiveSanction(ban.expiresAt));
  const storageReady = portalStorageConfigured();

  return (
    <main><div className="shell"><SiteHeader authenticated /><AccountNav current="/appeals" />
      <section className="page-heading"><div><p className="eyebrow"><Shield aria-hidden="true" /> Moderation review</p><h1>Ban appeals</h1><p>Appeals are unlocked only while a current ban is active.</p></div></section>
      {params.submitted && <div className="notice notice-success">Your appeal was submitted. Staff updates will appear below.</div>}
      {params.error && <div className="notice notice-danger"><AlertTriangle aria-hidden="true" /> Your appeal could not be submitted. Check the required details and portal database setup.</div>}
      {activeBan ? <>
        <section className="panel appeal-ban"><div><span className="badge badge-danger">Active ban</span><h2>{activeBan.reason}</h2><p>Issued by {activeBan.adminName || "Console"} on {formatDate(activeBan.createdAt)}. {activeBan.expiresAt ? `Ends ${formatDate(activeBan.expiresAt)}.` : "This ban is permanent until reviewed."}</p></div></section>
        {storageReady ? <form className="panel form-panel" action="/api/appeals" method="post"><div className="panel-heading"><h2>Submit an appeal</h2><p>Explain what happened, take responsibility where appropriate, and include useful context.</p></div><label htmlFor="appeal-body">Your appeal</label><textarea id="appeal-body" name="body" minLength={20} maxLength={5000} required placeholder="Write your appeal…" /><button className="button button-primary" type="submit">Submit appeal</button></form> : <div className="notice notice-info"><AlertTriangle aria-hidden="true" /> Portal storage needs to be configured before appeals can be submitted. Run <code>db/001_portal.sql</code> in the separate portal database.</div>}
      </> : <section className="empty-state compact"><h2>No active ban</h2><p>Your account has no active ban, so no appeal is needed. Previous appeals remain visible below if any exist.</p></section>}
      <section className="history-section"><div className="section-heading compact"><p className="eyebrow">Appeal timeline</p><h2>Your submitted appeals</h2></div>{appeals.length ? <div className="timeline">{appeals.map((appeal) => <article key={appeal.id} className="timeline-item"><div><span className="badge">{appeal.status}</span><h3>Appeal #{appeal.id}</h3><p>{appeal.body}</p><small>Updated {formatPortalDate(appeal.updatedAt)}</small></div></article>)}</div> : <p className="empty-copy">No appeals have been submitted from this Steam account.</p>}</section>
    </div></main>
  );
}
