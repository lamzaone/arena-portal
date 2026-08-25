import Link from "next/link";
import { AlertTriangle, MessageSquareText, Shield } from "lucide-react";

import { AccountNav } from "@/components/account-nav";
import { CaseStatusTag } from "@/components/case-status-tag";
import { CaseConversation } from "@/components/case-conversation";
import { formatDate, formatPortalDate, isActiveSanction } from "@/components/formatters";
import { SignInRequired } from "@/components/sign-in-required";
import { SiteHeader } from "@/components/site-header";
import { getSession } from "@/lib/auth/session";
import { getAppealEligibility, getAppeals, getPlayerDashboard, portalStorageConfigured, type AppealBan, type BanAppeal } from "@/lib/data/portal-repository";
import { getSteamProfiles, type SteamProfile } from "@/lib/steam/profiles";

type AppealsPageProps = { searchParams: Promise<{ submitted?: string; replied?: string; error?: string }> };

function canReply(appeal: BanAppeal) {
  return !["closed-banned", "closed-unbanned", "closed"].includes(appeal.status);
}

function EvidenceGuidance() {
  return <p className="evidence-guidance"><strong>Evidence:</strong> paste video evidence as an unlisted YouTube link in your appeal or reply. Attach up to five PNG, JPEG, or WebP screenshots (5 MB each) below.</p>;
}

function AppealReplyForm({ appeal }: { appeal: BanAppeal }) {
  return <form className="case-player-reply" action="/api/appeals" method="post" encType="multipart/form-data">
    <input type="hidden" name="action" value="reply" />
    <input type="hidden" name="caseId" value={appeal.id} />
    <label htmlFor={`appeal-reply-${appeal.id}`}>Reply to staff<textarea id={`appeal-reply-${appeal.id}`} name="body" maxLength={5000} placeholder="Reply with any extra context or an unlisted YouTube evidence link." /></label>
    <label htmlFor={`appeal-screenshots-${appeal.id}`}>Screenshots (optional)<input id={`appeal-screenshots-${appeal.id}`} name="screenshots" type="file" accept="image/png,image/jpeg,image/webp" multiple /></label>
    <EvidenceGuidance />
    <button className="button button-secondary" type="submit"><MessageSquareText aria-hidden="true" /> Send reply</button>
  </form>;
}

function AdminProfileMention({ steamId, name }: { steamId: string | null; name: string }) {
  return steamId ? <Link className="profile-mention-link" href={`/players/${steamId}`}>{name || "Admin"}</Link> : <>{name || "Console"}</>;
}

function AppealBanContext({ ban, steamProfiles }: { ban: AppealBan | null; steamProfiles: Map<string, SteamProfile> }) {
  if (!ban) return null;
  const issuerName = ban.adminSteamId ? steamProfiles.get(ban.adminSteamId)?.name ?? ban.adminName : ban.adminName;
  return <aside className="case-ban-context"><span>Original ban</span><strong>{ban.reason}</strong><small>Initiated by <AdminProfileMention steamId={ban.adminSteamId} name={issuerName} /> on {formatDate(ban.createdAt)}.</small></aside>;
}

function AppealCase({ appeal, steamProfiles, viewerSteamId }: { appeal: BanAppeal; steamProfiles: Map<string, SteamProfile>; viewerSteamId: string }) {
  return <article className="case-card">
    <header className="case-card-header">
      <div><span className="case-card-category">Ban appeal</span><h3>Appeal #{appeal.id}</h3></div>
      <CaseStatusTag status={appeal.status} />
    </header>
    <AppealBanContext ban={appeal.ban} steamProfiles={steamProfiles} />
    <CaseConversation openingBody={appeal.body} openingAt={appeal.createdAt} openingAuthorId={viewerSteamId} messages={appeal.messages} steamProfiles={steamProfiles} viewerSteamId={viewerSteamId} />
    {canReply(appeal) ? <AppealReplyForm appeal={appeal} /> : <p className="case-closed-copy">This appeal has been closed by staff.</p>}
  </article>;
}

export default async function AppealsPage({ searchParams }: AppealsPageProps) {
  const session = await getSession();
  if (!session) return <SignInRequired title="Ban appeals" description="Ban appeals are private and are available only from the Steam account that was sanctioned." />;

  const [profile, appeals, params] = await Promise.all([getPlayerDashboard(session.steamId), getAppeals(session.steamId), searchParams]);
  const activeBan = profile.bans.find((ban) => isActiveSanction(ban.expiresAt));
  const steamProfiles = await getSteamProfiles([session.steamId, activeBan?.adminSteamId ?? "", ...appeals.flatMap((appeal) => [appeal.ban?.adminSteamId ?? "", ...appeal.messages.map((message) => message.authorId)])]);
  const appealEligibility = activeBan ? await getAppealEligibility(session.steamId, activeBan.id) : null;
  const storageReady = portalStorageConfigured();
  const error = params.error === "screenshot" ? "Screenshots must be PNG, JPEG, or WebP, with no more than five files up to 5 MB each." : params.error === "closed" ? "That appeal has already been closed and cannot receive another reply." : params.error === "cooldown" ? "A previous appeal was closed as still banned. You can submit another appeal seven days after that decision." : "Your appeal could not be submitted. Check the required details and portal database setup.";

  return (
    <main><div className="shell"><SiteHeader authenticated /><AccountNav current="/appeals" />
      <section className="page-heading"><div><p className="eyebrow"><Shield aria-hidden="true" /> Moderation review</p><h1>Ban appeals</h1><p>Appeals are unlocked only while a current ban is active.</p></div></section>
      {params.submitted && <div className="notice notice-success">Your appeal was submitted. Staff updates will appear below.</div>}
      {params.replied && <div className="notice notice-success">Your reply and any screenshots were sent to staff.</div>}
      {params.error && <div className="notice notice-danger"><AlertTriangle aria-hidden="true" /> {error}</div>}
      {activeBan ? <>
        <section className="panel appeal-ban"><div><span className="badge badge-danger">Active ban</span><h2>{activeBan.reason}</h2><p>Issued by <AdminProfileMention steamId={activeBan.adminSteamId} name={activeBan.adminSteamId ? steamProfiles.get(activeBan.adminSteamId)?.name ?? activeBan.adminName : activeBan.adminName} /> on {formatDate(activeBan.createdAt)}. {activeBan.expiresAt ? `Ends ${formatDate(activeBan.expiresAt)}.` : "This ban is permanent until reviewed."}</p></div></section>
        {storageReady && appealEligibility?.eligible ? <form className="panel form-panel" action="/api/appeals" method="post" encType="multipart/form-data"><input type="hidden" name="action" value="create" /><div className="panel-heading"><h2>Submit an appeal</h2><p>Explain what happened, take responsibility where appropriate, and include useful context.</p></div><label htmlFor="appeal-body">Your appeal</label><textarea id="appeal-body" name="body" minLength={20} maxLength={5000} required placeholder="Write your appeal…" /><label htmlFor="appeal-screenshots">Screenshots (optional)<input id="appeal-screenshots" name="screenshots" type="file" accept="image/png,image/jpeg,image/webp" multiple /></label><EvidenceGuidance /><button className="button button-primary" type="submit">Submit appeal</button></form> : !storageReady ? <div className="notice notice-info"><AlertTriangle aria-hidden="true" /> Portal storage needs to be configured before appeals can be submitted.</div> : <div className="notice notice-warning"><AlertTriangle aria-hidden="true" /> Your previous appeal was closed as still banned. You can submit a new appeal after <strong>{appealEligibility?.eligibleAt ? formatPortalDate(appealEligibility.eligibleAt) : "the seven-day review cooldown"}</strong>.</div>}
      </> : <section className="empty-state compact"><h2>No active ban</h2><p>Your account has no active ban, so no appeal is needed. Previous appeals remain visible below if any exist.</p></section>}
      <section className="history-section case-history"><div className="section-heading compact"><p className="eyebrow">Appeal timeline</p><h2>Your submitted appeals</h2></div>{appeals.length ? <div className="case-card-list">{appeals.map((appeal) => <AppealCase key={appeal.id} appeal={appeal} steamProfiles={steamProfiles} viewerSteamId={session.steamId} />)}</div> : <p className="empty-copy">No appeals have been submitted from this Steam account.</p>}</section>
    </div></main>
  );
}
