import { AlertTriangle, MessageSquareText, Ticket } from "lucide-react";

import { CaseStatusTag } from "@/components/case-status-tag";
import { CaseConversation } from "@/components/case-conversation";
import { SignInRequired } from "@/components/sign-in-required";
import { PortalToast } from "@/components/success-toast";
import { PageHeading } from "@/components/ui/page-heading";
import { PortalShell } from "@/components/ui/portal-shell";
import { getSession } from "@/lib/auth/session";
import { getTickets, portalStorageConfigured, type PortalTicket } from "@/lib/data/portal-repository";
import {
  resolvePlayerIdentities,
  type PlayerIdentityData,
} from "@/lib/player-identities";

type TicketsPageProps = {
  searchParams: Promise<{ submitted?: string; replied?: string; error?: string; vip?: string; plan?: string; price?: string }>;
};

function getVipRequest(params: { vip?: string; plan?: string; price?: string }) {
  const vip = typeof params.vip === "string" && /^[A-Z][A-Z0-9_-]{1,30}$/.test(params.vip) ? params.vip : null;
  const plan = params.plan === "permanent" ? "permanent" : params.plan === "access" ? "access" : null;
  if (!vip || !plan) return null;

  return {
    subject: `${vip} VIP ${plan === "permanent" ? "permanent access" : "access"}`,
    body: `I would like to purchase ${plan === "permanent" ? "permanent" : "VIP"} access for the ${vip} tier. Please contact me with payment instructions.`
  };
}

function canReply(ticket: PortalTicket) {
  return !["solved", "unsolved", "closed"].includes(ticket.status);
}

function EvidenceGuidance() {
  return <p className="evidence-guidance"><strong>Evidence:</strong> paste video evidence as an unlisted YouTube link in your message. Attach up to five PNG, JPEG, or WebP screenshots (5 MB each) below.</p>;
}

function TicketReplyForm({ ticket }: { ticket: PortalTicket }) {
  return <form className="case-player-reply" action="/api/tickets" method="post" encType="multipart/form-data">
    <input type="hidden" name="action" value="reply" />
    <input type="hidden" name="caseId" value={ticket.id} />
    <label htmlFor={`ticket-reply-${ticket.id}`}>Reply to staff<textarea id={`ticket-reply-${ticket.id}`} name="body" maxLength={5000} placeholder="Reply with any further context or an unlisted YouTube evidence link." /></label>
    <label htmlFor={`ticket-screenshots-${ticket.id}`}>Screenshots (optional)<input id={`ticket-screenshots-${ticket.id}`} name="screenshots" type="file" accept="image/png,image/jpeg,image/webp" multiple /></label>
    <EvidenceGuidance />
    <button className="button button-secondary" type="submit"><MessageSquareText aria-hidden="true" /> Send reply</button>
  </form>;
}

function TicketCase({ ticket, playerIdentities, viewerSteamId }: { ticket: PortalTicket; playerIdentities: Readonly<Record<string, PlayerIdentityData>>; viewerSteamId: string }) {
  return <article className="case-card">
    <header className="case-card-header">
      <div><span className="case-card-category">{ticket.category.replace(/-/g, " ")}</span><h3>{ticket.subject}</h3></div>
      <CaseStatusTag status={ticket.status} />
    </header>
    <CaseConversation openingBody={ticket.body} openingAt={ticket.createdAt} openingAuthorId={viewerSteamId} messages={ticket.messages} viewerSteamId={viewerSteamId} playerIdentities={playerIdentities} />
    {canReply(ticket) ? <TicketReplyForm ticket={ticket} /> : <p className="case-closed-copy">This ticket is closed. Open a new ticket if you need further help.</p>}
  </article>;
}

export default async function TicketsPage({ searchParams }: TicketsPageProps) {
  const session = await getSession();
  if (!session) return <SignInRequired title="Support tickets" description="Use your verified Steam account to report bugs, player issues, staff concerns, or request VIP privately." />;

  const [tickets, params] = await Promise.all([getTickets(session.steamId), searchParams]);
  const playerIdentities = await resolvePlayerIdentities(
    [session.steamId, ...tickets.flatMap((ticket) => ticket.messages.map((message) => message.authorId))]
      .map((steamId) => ({ steamId })),
  );
  const storageReady = portalStorageConfigured();
  const vipRequest = getVipRequest(params);
  const error = params.error === "screenshot" ? "Screenshots must be PNG, JPEG, or WebP, with no more than five files up to 5 MB each." : params.error === "closed" ? "That ticket is closed and cannot receive another reply." : "Ticket could not be submitted. Check the form and portal storage setup.";

  return (
    <PortalShell authenticated className="tapped-page">
      <PageHeading eyebrow={<><Ticket aria-hidden="true" /> Player support</>} title="Tickets" description="Open a private ticket for a player report, an admin report, a bug, account help, or a VIP purchase request." />
      {params.submitted && <PortalToast message="Ticket created. You can follow staff updates and reply below." />}
      {params.replied && <PortalToast message="Your reply and any screenshots were sent to staff." />}
      {params.error && <PortalToast variant="danger" message={error} />}
      {storageReady ? <form className="panel form-panel" action="/api/tickets" method="post" encType="multipart/form-data"><input type="hidden" name="action" value="create" /><div className="panel-heading"><h2>{vipRequest ? "Request VIP purchase" : "Create ticket"}</h2><p>{vipRequest ? "Your chosen VIP tier and access plan are prefilled below. Staff will provide payment instructions privately." : "Reports will be sent to the Discord staff workflow once the bot is connected."}</p></div><div className="form-grid"><label htmlFor="ticket-category">Category<select id="ticket-category" name="category" defaultValue={vipRequest ? "vip" : "player-report"}><option value="player-report">Report a player</option><option value="admin-report">Report an admin</option><option value="bug">Bug report</option><option value="account">Account help</option><option value="vip">VIP purchase</option><option value="other">Other</option></select></label><label htmlFor="ticket-subject">Subject<input id="ticket-subject" name="subject" minLength={4} maxLength={120} required placeholder="Short summary" defaultValue={vipRequest?.subject} /></label></div><label htmlFor="ticket-body">Details<textarea id="ticket-body" name="body" minLength={10} maxLength={5000} required placeholder="Include names, approximate time, map, and any evidence links that can help staff investigate." defaultValue={vipRequest?.body} /></label><label htmlFor="ticket-screenshots">Screenshots (optional)<input id="ticket-screenshots" name="screenshots" type="file" accept="image/png,image/jpeg,image/webp" multiple /></label><EvidenceGuidance /><button className="button button-primary" type="submit"><MessageSquareText aria-hidden="true" /> Submit ticket</button></form> : <div className="notice notice-info"><AlertTriangle aria-hidden="true" /> Portal storage needs to be configured before tickets can be submitted.</div>}
      <section className="history-section case-history"><div className="section-heading compact"><p className="eyebrow">Your cases</p><h2>Ticket history</h2></div>{tickets.length ? <div className="case-card-list">{tickets.map((ticket) => <TicketCase key={ticket.id} ticket={ticket} playerIdentities={playerIdentities} viewerSteamId={session.steamId} />)}</div> : <p className="empty-copy">No tickets have been created from this Steam account.</p>}</section>
    </PortalShell>
  );
}
