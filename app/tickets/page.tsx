import { AlertTriangle, MessageSquareText, Ticket } from "lucide-react";

import { AccountNav } from "@/components/account-nav";
import { formatPortalDate } from "@/components/formatters";
import { SignInRequired } from "@/components/sign-in-required";
import { SiteHeader } from "@/components/site-header";
import { getSession } from "@/lib/auth/session";
import { getTickets, portalStorageConfigured } from "@/lib/data/portal-repository";

type TicketsPageProps = {
  searchParams: Promise<{ submitted?: string; error?: string; vip?: string; plan?: string; price?: string }>;
};

function getVipRequest(params: { vip?: string; plan?: string; price?: string }) {
  const vip = typeof params.vip === "string" && /^[A-Z][A-Z0-9_-]{1,30}$/.test(params.vip) ? params.vip : null;
  const plan = params.plan === "permanent" ? "permanent" : params.plan === "access" ? "access" : null;
  const price = typeof params.price === "string" && /^[1-9][0-9]{0,3}$/.test(params.price) ? Number(params.price) : null;
  if (!vip || !plan || !price) return null;

  return {
    subject: `${vip} VIP ${plan === "permanent" ? "permanent access" : "access"} - EUR ${price}`,
    body: `I would like to purchase ${plan === "permanent" ? "permanent" : "VIP"} access for the ${vip} tier at the listed price of EUR ${price}. Please contact me with payment instructions.`
  };
}

export default async function TicketsPage({ searchParams }: TicketsPageProps) {
  const session = await getSession();
  if (!session) return <SignInRequired title="Support tickets" description="Use your verified Steam account to report bugs, player issues, staff concerns, or request VIP privately." />;

  const [tickets, params] = await Promise.all([getTickets(session.steamId), searchParams]);
  const storageReady = portalStorageConfigured();
  const vipRequest = getVipRequest(params);

  return (
    <main><div className="shell"><SiteHeader authenticated /><AccountNav current="/tickets" />
      <section className="page-heading"><div><p className="eyebrow"><Ticket aria-hidden="true" /> Player support</p><h1>Tickets</h1><p>Open a private ticket for a player report, an admin report, a bug, account help, or a VIP purchase request.</p></div></section>
      {params.submitted && <div className="notice notice-success">Ticket created. You can follow its status below.</div>}
      {params.error && <div className="notice notice-danger"><AlertTriangle aria-hidden="true" /> Ticket could not be submitted. Check the form and portal storage setup.</div>}
      {storageReady ? <form className="panel form-panel" action="/api/tickets" method="post"><div className="panel-heading"><h2>{vipRequest ? "Request VIP purchase" : "Create ticket"}</h2><p>{vipRequest ? "Your chosen VIP tier and price are prefilled below. Staff will provide payment instructions privately." : "Reports will be sent to the Discord staff workflow once the bot is connected."}</p></div><div className="form-grid"><label htmlFor="ticket-category">Category<select id="ticket-category" name="category" defaultValue={vipRequest ? "vip" : "player-report"}><option value="player-report">Report a player</option><option value="admin-report">Report an admin</option><option value="bug">Bug report</option><option value="account">Account help</option><option value="vip">VIP purchase</option><option value="other">Other</option></select></label><label htmlFor="ticket-subject">Subject<input id="ticket-subject" name="subject" minLength={4} maxLength={120} required placeholder="Short summary" defaultValue={vipRequest?.subject} /></label></div><label htmlFor="ticket-body">Details<textarea id="ticket-body" name="body" minLength={10} maxLength={5000} required placeholder="Include names, approximate time, map, and any evidence links that can help staff investigate." defaultValue={vipRequest?.body} /></label><button className="button button-primary" type="submit"><MessageSquareText aria-hidden="true" /> Submit ticket</button></form> : <div className="notice notice-info"><AlertTriangle aria-hidden="true" /> Portal storage needs to be configured before tickets can be submitted. Run <code>db/001_portal.sql</code> in the separate portal database.</div>}
      <section className="history-section"><div className="section-heading compact"><p className="eyebrow">Your cases</p><h2>Ticket history</h2></div>{tickets.length ? <div className="timeline">{tickets.map((ticket) => <article key={ticket.id} className="timeline-item"><div><span className="badge">{ticket.status}</span><h3>{ticket.subject}</h3><p>{ticket.body}</p><small>{ticket.category} - Updated {formatPortalDate(ticket.updatedAt)}</small></div></article>)}</div> : <p className="empty-copy">No tickets have been created from this Steam account.</p>}</section>
    </div></main>
  );
}
