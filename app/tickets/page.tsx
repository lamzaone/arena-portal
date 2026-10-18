import { AlertTriangle, MessageSquareText, Ticket } from "lucide-react";
import Link from "next/link";
import styles from "./support-workspace.module.css";
import { PunishmentOverview } from "./punishment-overview";

import { CaseStatusTag } from "@/components/case-status-tag";
import { CaseConversation } from "@/components/case-conversation";
import { SignInRequired } from "@/components/sign-in-required";
import { PortalToast } from "@/components/success-toast";
import { PageHeading } from "@/components/ui/page-heading";
import { PortalShell } from "@/components/ui/portal-shell";
import { ThemedPlayerContainer } from "@/components/ui/themed-player-container";
import { getSession } from "@/lib/auth/session";
import { getIdentityGroupListing, type IdentityGroupListing } from "@/lib/data/identity-group-listings";
import { getTickets, getPlayerDashboard, portalStorageConfigured, type PortalTicket } from "@/lib/data/portal-repository";
import {
  identityGroupListingRequestCopy,
  isPublishedDonationListing,
} from "@/lib/identity-group-listing-presentation";
import {
  resolvePlayerIdentities,
  type PlayerIdentityData,
} from "@/lib/player-identities";

type TicketsPageProps = {
  searchParams: Promise<{ submitted?: string; replied?: string; error?: string; listing?: string }>;
};

function listingId(value: string | undefined) {
  if (!value || !/^\d{1,18}$/.test(value)) return null;
  const parsed = Number(value);
  return Number.isSafeInteger(parsed) && parsed > 0 ? parsed : null;
}

function getVipRequest(listing: IdentityGroupListing | null) {
  return listing && isPublishedDonationListing(listing)
    ? identityGroupListingRequestCopy(listing)
    : null;
}

function canReply(ticket: PortalTicket) {
  return !["solved", "unsolved", "closed"].includes(ticket.status);
}

function EvidenceGuidance() {
  return <p className="evidence-guidance"><strong>Evidence:</strong> include an unlisted YouTube link in your message, or attach up to five PNG, JPEG, or WebP screenshots (5 MB each).</p>;
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
  const owner = playerIdentities[viewerSteamId];
  return <ThemedPlayerContainer as="article" className="case-card" containerKind="case" ownerSteamId={viewerSteamId} profileThemeKey={owner?.profileThemeKey}>
    <header className="case-card-header">
      <div><span className="case-card-category">{ticket.category.replace(/-/g, " ")}<span className={styles.caseNumber}>#{ticket.id}</span></span><h3>{ticket.subject}</h3></div>
      <CaseStatusTag status={ticket.status} />
    </header>
    <CaseConversation openingBody={ticket.body} openingAt={ticket.createdAt} openingAuthorId={viewerSteamId} messages={ticket.messages} viewerSteamId={viewerSteamId} playerIdentities={playerIdentities} />
    {canReply(ticket) ? <details className={styles.reply}><summary><MessageSquareText aria-hidden="true" /> Reply to staff</summary><TicketReplyForm ticket={ticket} /></details> : <p className="case-closed-copy">This ticket is closed. Open a new ticket if you need further help.</p>}
  </ThemedPlayerContainer>;
}

export default async function TicketsPage({ searchParams }: TicketsPageProps) {
  const session = await getSession();
  if (!session) return <SignInRequired title="Support tickets" description="Use your verified Steam account to report bugs, player issues, staff concerns, or request VIP privately." />;

  const [tickets, profile, params] = await Promise.all([getTickets(session.steamId), getPlayerDashboard(session.steamId), searchParams]);
  const openTickets = tickets.filter(canReply);
  const closedTickets = tickets.filter((ticket) => !canReply(ticket));
  const requestedListingId = listingId(params.listing);
  let requestedListing: IdentityGroupListing | null = null;
  if (requestedListingId) {
    try {
      requestedListing = await getIdentityGroupListing(requestedListingId);
    } catch (error) {
      console.error("Ticket membership listing lookup failed", error);
    }
  }
  const playerIdentities = await resolvePlayerIdentities(
    [session.steamId, ...profile.bans.map((ban) => ban.adminSteamId ?? ""), ...profile.sanctions.map((sanction) => sanction.adminSteamId ?? ""), ...tickets.flatMap((ticket) => ticket.messages.map((message) => message.authorId))]
      .map((steamId) => ({ steamId })),
  );
  const storageReady = portalStorageConfigured();
  const vipRequest = getVipRequest(requestedListing);
  const invalidListingRequest = Boolean(params.listing) && !vipRequest;
  const error = params.error === "screenshot"
    ? "Screenshots must be PNG, JPEG, or WebP, with no more than five files up to 5 MB each."
    : params.error === "closed"
      ? "That ticket is closed and cannot receive another reply."
      : params.error === "listing"
        ? "That membership listing is no longer published. Choose a current option from the VIP page."
        : "Ticket could not be submitted. Check the form and portal storage setup.";

  return (
    <PortalShell authenticated className="tapped-page">
      <PageHeading eyebrow={<><Ticket aria-hidden="true" /> Player support</>} title="Tickets" description="Get private help with reports, bugs, your account, or a membership purchase." actions={<div className={styles.headingActions}><a className="button button-secondary" href="#open-tickets">Open tickets ({openTickets.length})</a><Link className="button button-quiet" href="/appeals">Ban appeals</Link></div>} />
      {params.submitted && <PortalToast message="Ticket created. You can follow staff updates and reply below." />}
      {params.replied && <PortalToast message="Your reply and any screenshots were sent to staff." />}
      {params.error && <PortalToast variant="danger" message={error} />}
      {invalidListingRequest ? <PortalToast variant="danger" message="That membership listing is no longer published. Choose a current option from the VIP page." /> : null}
      <PunishmentOverview profile={profile} identities={playerIdentities} viewerSteamId={session.steamId} />
      <div className={styles.workspace}>
      <div className={styles.actionArea}>
      <div className={styles.composer}>
      {storageReady ? <form className="panel form-panel" action="/api/tickets" method="post" encType="multipart/form-data"><input type="hidden" name="action" value="create" />{vipRequest && requestedListing ? <input type="hidden" name="listingId" value={requestedListing.id} /> : null}<div className="panel-heading"><h2>{vipRequest ? "Request membership purchase" : "Create ticket"}</h2><p>{vipRequest ? "Review the membership, duration, and price below. These details are fixed for this request." : "Choose a category and describe what happened. Staff replies appear in your ticket history."}</p></div><div className="form-grid"><label htmlFor="ticket-category">Category<select id="ticket-category" name="category" defaultValue={vipRequest ? "vip" : "player-report"}><option value="player-report">Report a player</option><option value="admin-report">Report an admin</option><option value="bug">Bug report</option><option value="account">Account help</option><option value="vip">VIP purchase</option><option value="other">Other</option></select></label><label htmlFor="ticket-subject">Subject<input id="ticket-subject" name="subject" minLength={4} maxLength={120} required placeholder="Short summary" defaultValue={vipRequest?.subject} readOnly={Boolean(vipRequest)} /></label></div><label htmlFor="ticket-body">Details<textarea id="ticket-body" name="body" minLength={10} maxLength={5000} required placeholder="Include names, approximate time, map, and any evidence links that can help staff investigate." defaultValue={vipRequest?.body} readOnly={Boolean(vipRequest)} /></label><label htmlFor="ticket-screenshots">Screenshots (optional)<input id="ticket-screenshots" name="screenshots" type="file" accept="image/png,image/jpeg,image/webp" multiple /></label><EvidenceGuidance /><button className="button button-primary" type="submit"><MessageSquareText aria-hidden="true" /> Submit ticket</button></form> : <div className="notice notice-info"><AlertTriangle aria-hidden="true" /> Portal storage needs to be configured before tickets can be submitted.</div>}
      </div>
      <aside className={styles.supportNote} aria-label="Support guidance"><h2>A clear path to help</h2><p>Choose the closest category, describe what happened, and attach the evidence staff needs. Your conversation stays private.</p><p>Already sent a ticket? Add updates to the same conversation below so staff can follow the full story.</p><p>Appealing a ban? Use <Link href="/appeals">ban appeals</Link> to request a review.</p></aside>
      </div>
      <section id="open-tickets" className={`case-history ${styles.history}`} aria-labelledby="open-tickets-title"><div className="section-heading compact"><h2 id="open-tickets-title">Open tickets</h2><span className={styles.count}>{openTickets.length} open</span></div>{openTickets.length ? <div className="case-card-list">{openTickets.map((ticket) => <TicketCase key={ticket.id} ticket={ticket} playerIdentities={playerIdentities} viewerSteamId={session.steamId} />)}</div> : <p className="empty-copy">No open tickets. Create a ticket above when you need help.</p>}</section>
      <section id="ticket-history" className={`history-section case-history ${styles.history}`} aria-labelledby="ticket-history-title"><div className="section-heading compact"><h2 id="ticket-history-title">Ticket history</h2><span className={styles.count}>{closedTickets.length} closed / {tickets.length} total</span></div>{closedTickets.length ? <div className="case-card-list">{closedTickets.map((ticket) => <TicketCase key={ticket.id} ticket={ticket} playerIdentities={playerIdentities} viewerSteamId={session.steamId} />)}</div> : <p className="empty-copy">Your completed tickets will appear here.</p>}</section>
      </div>
    </PortalShell>
  );
}
