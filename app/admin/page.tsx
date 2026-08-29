import Link from "next/link";
import { AlertTriangle, Ban, Gavel, LockKeyhole, ShieldCheck, Ticket, UsersRound, VolumeX } from "lucide-react";

import { adminWriteConfigured, getAdminAccess, getStaffGroupDefinitions } from "@/lib/admin/access";
import { getSession, createAdminActionToken } from "@/lib/auth/session";
import { CaseStatusTag } from "@/components/case-status-tag";
import { formatDate, formatPortalDate, isActiveSanction } from "@/components/formatters";
import { GroupBadge } from "@/components/group-badge";
import { PlayerSearchField } from "@/components/player-search-field";
import { ResilientRemoteImage } from "@/components/resilient-remote-image";
import { SignInRequired } from "@/components/sign-in-required";
import { SiteHeader } from "@/components/site-header";
import {
  StaffSubmenu,
  staffModerationSections,
  type StaffModerationSection,
} from "@/components/staff-submenu";
import { PortalToast } from "@/components/success-toast";
import { SearchNavigationForm, SearchSubmitButton } from "@/components/ui/search-field";
import { getStaffAdmins, getStaffAppeals, getStaffModeration, getStaffTickets, getStaffVips, type CaseMessage, type StaffAdmin, type StaffAppeal, type StaffSanction } from "@/lib/data/portal-repository";
import { getIdentityVipGroupDefinitions } from "@/lib/data/identity-groups";
import { getSteamProfiles, type SteamProfile } from "@/lib/steam/profiles";

type StaffTab = StaffModerationSection;
type AdminPageProps = { searchParams: Promise<{ tab?: string; page?: string; q?: string; notice?: string; error?: string }> };

const fallbackVipGroups = ["ULTIMATE", "DIAMOND", "GOLD", "SILVER", "STANDARD"];

function getPageNumber(value: string | undefined) {
  const parsed = Number.parseInt(value ?? "1", 10);
  return Number.isSafeInteger(parsed) && parsed > 0 ? parsed : 1;
}

function getTab(value: string | undefined): StaffTab {
  return staffModerationSections.some((tab) => tab.id === value) ? value as StaffTab : "bans";
}

function staffLink(tab: StaffTab, page = 1, query = "") {
  const parameters = new URLSearchParams({ tab, page: String(page) });
  if (query) parameters.set("q", query);
  return `/admin?${parameters.toString()}`;
}

function avatarInitial(name: string) {
  return name.trim().slice(0, 1).toUpperCase() || "?";
}

function isSteamId(value: string) {
  return /^7656119\d{10}$/.test(value);
}

function ProfileMention({ steamId, name }: { steamId: string | null; name: string }) {
  return steamId && isSteamId(steamId) ? <Link className="staff-admin-link" href={`/players/${steamId}`}>{name}</Link> : <>{name}</>;
}

function noticeText(value: string | undefined) {
  const notices: Record<string, string> = {
    "admin-saved": "Admin assignment saved. Admins.Core will pick it up on its next database sync.",
    "vip-saved": "VIP assignment saved. VIPCore will apply it when the player next connects.",
    "vip-removed": "VIP assignment removed.",
    "appeal-replied": "Reply sent to the appeal.",
    "appeal-unbanned": "Appeal closed as unbanned. The server bridge queued the unban.",
    "appeal-banned": "Appeal closed as still banned.",
    "ticket-replied": "Reply sent to the ticket.",
    "ticket-solved": "Ticket closed as solved.",
    "ticket-unsolved": "Ticket closed as unsolved."
  };
  return value ? notices[value] : undefined;
}

function errorText(value: string | undefined) {
  const errors: Record<string, string> = {
    "admin-permission": "Your current admin permissions cannot manage staff assignments.",
    "vip-permission": "Your current permissions cannot manage VIP assignments.",
    "unban-permission": "Appeal decisions require unban access.",
    "immunity": "You cannot act on an admin with higher immunity.",
    screenshot: "Screenshots must be PNG, JPEG, or WebP and no larger than 5 MB.",
    "game-storage": "The game database is not configured for staff management.",
    "writes-disabled": "Portal-to-server moderation actions are not configured.",
    database: "The action could not be saved. Check database configuration and try again."
  };
  return value ? errors[value] ?? "The requested staff action could not be completed." : undefined;
}

type StaffSanctionEvent = Omit<StaffSanction, "kind"> & { kind: StaffSanction["kind"] | "Silence" };

function getSanctionEvents(sanctions: StaffSanction[]): StaffSanctionEvent[] {
  const paired = new Map<string, Set<StaffSanction["kind"]>>();
  for (const sanction of sanctions) {
    const key = [sanction.steamId, sanction.reason, sanction.adminName, sanction.createdAt, sanction.expiresAt, sanction.length].join(":");
    const kinds = paired.get(key) ?? new Set<StaffSanction["kind"]>();
    kinds.add(sanction.kind);
    paired.set(key, kinds);
  }
  const returned = new Set<string>();
  return sanctions.flatMap<StaffSanctionEvent>((sanction) => {
    const key = [sanction.steamId, sanction.reason, sanction.adminName, sanction.createdAt, sanction.expiresAt, sanction.length].join(":");
    if ((paired.get(key)?.size ?? 0) === 2) {
      if (returned.has(key)) return [];
      returned.add(key);
      return [{ ...sanction, kind: "Silence" }];
    }
    return [sanction];
  });
}

function CaseMessages({ messages, steamProfiles }: { messages: CaseMessage[]; steamProfiles: Map<string, SteamProfile> }) {
  if (!messages.length) return null;
  return <div className="case-message-list">{messages.map((message) => {
    const profile = steamProfiles.get(message.authorId);
    const authorName = profile?.name ?? (message.authorType === "staff" ? "Staff member" : "Player");
    const author = <><b>{authorName}</b><small>{message.authorType === "staff" ? "Staff reply" : "Player reply"}</small></>;
    return <div key={message.id} className={`case-message ${message.authorType}`}><header className="case-message-header"><div>{isSteamId(message.authorId) ? <Link className="case-message-profile-link" href={`/players/${message.authorId}`}>{author}</Link> : author}</div><time dateTime={message.createdAt}>{formatPortalDate(message.createdAt)}</time></header><p>{message.body}</p>{message.attachments.map((attachment) => <a key={attachment.id} href={`/api/case-attachments/${attachment.id}`} target="_blank" rel="noreferrer">View screenshot: {attachment.fileName}</a>)}</div>;
  })}</div>;
}

function AppealBanSource({ appeal, steamProfiles }: { appeal: StaffAppeal; steamProfiles: Map<string, SteamProfile> }) {
  if (!appeal.ban) return null;
  const issuerName = appeal.ban.adminSteamId ? steamProfiles.get(appeal.ban.adminSteamId)?.name ?? appeal.ban.adminName : appeal.ban.adminName;
  return <p className="staff-appeal-source"><span>Original ban</span> {appeal.ban.reason} · issued by {appeal.ban.adminSteamId ? <Link href={`/players/${appeal.ban.adminSteamId}`}>{issuerName}</Link> : issuerName} on {formatDate(appeal.ban.createdAt)}</p>;
}

function AdminAssignments({ admins, csrf, canManage, groupDefinitions }: { admins: StaffAdmin[]; csrf: string; canManage: boolean; groupDefinitions: Array<{ name: string; immunity: number }> }) {
  const grouped = new Map(groupDefinitions.map((group) => [group.name, admins.filter((admin) => admin.groups.includes(group.name))]));
  const unassigned = admins.filter((admin) => !admin.groups.length);

  return <section className="staff-record-section"><div className="staff-section-heading"><div><p className="tapped-kicker"><UsersRound aria-hidden="true" /> Admins.Core</p><h2>Admin assignments</h2></div><span>{admins.length.toLocaleString()} admins</span></div>
    {canManage ? <form className="staff-management-form" action="/api/admin/staff" method="post"><input type="hidden" name="csrf" value={csrf} /><input type="hidden" name="action" value="admin-upsert" /><PlayerSearchField name="steamId" label="Staff player" mode="target" required includeSelf companionNameField="username" /><label>Display name<input name="username" maxLength={64} required placeholder="Staff name" /></label><label>Groups<select name="groups" multiple required size={Math.min(6, groupDefinitions.length)}>{groupDefinitions.map((group) => <option key={group.name} value={group.name}>{group.name} · immunity {group.immunity}</option>)}</select><small>Hold Ctrl/Cmd to assign multiple groups.</small></label><button className="button button-primary" type="submit">Save admin</button></form> : <p className="staff-readonly-note">You can review staff assignments, but only admins with <code>admins.commands.admin</code> can add or modify them.</p>}
    {[...grouped.entries(), ...(unassigned.length ? [["Unassigned", unassigned] as const] : [])].map(([groupName, entries]) => <article className="staff-group-card" key={groupName}><div><h3>{groupName === "Unassigned" ? groupName : <GroupBadge kind="admin" group={groupName} />}</h3><span>{entries.length} member{entries.length === 1 ? "" : "s"}</span></div>{entries.length ? <div className="staff-group-list">{entries.map((admin) => canManage ? <form className="staff-admin-edit" action="/api/admin/staff" method="post" key={admin.id}><input type="hidden" name="csrf" value={csrf} /><input type="hidden" name="action" value="admin-upsert" /><input type="hidden" name="steamId" value={admin.steamId} /><Link href={`/players/${admin.steamId}`}>{admin.username}<small>{admin.steamId}</small></Link><input name="username" defaultValue={admin.username} maxLength={64} required aria-label={`Display name for ${admin.username}`} /><select name="groups" multiple defaultValue={admin.groups} aria-label={`Groups for ${admin.username}`} size={Math.min(4, groupDefinitions.length)}>{groupDefinitions.map((group) => <option key={group.name} value={group.name}>{group.name}</option>)}</select><span>Immunity {admin.immunity}</span><button className="staff-unban-button" type="submit">Save</button></form> : <div className="staff-admin-read" key={admin.id}><Link href={`/players/${admin.steamId}`}>{admin.username}<small>{admin.steamId}</small></Link><span>{admin.groups.join(" + ") || "No group"}</span><span>Immunity {admin.immunity}</span></div>)}</div> : <p className="empty-copy">No admins are assigned to this group.</p>}</article>)}</section>;
}

export default async function AdminPage({ searchParams }: AdminPageProps) {
  const [session, params] = await Promise.all([getSession(), searchParams]);
  if (!session) return <SignInRequired title="Staff moderation" description="Sign in with the Steam account that has your ARENA admin group." />;

  const access = await getAdminAccess(session.steamId);
  if (!access.isAdmin) return <main className="tapped-page"><div className="shell"><SiteHeader authenticated /><section className="staff-denied"><LockKeyhole aria-hidden="true" /><p className="tapped-kicker">Restricted area</p><h1>Staff access required.</h1><p>Your Steam account does not have an active Admins.Core staff assignment for ARENA.TAPPED.RO.</p><Link className="button button-secondary" href={`/players/${session.steamId}`}>Back to profile</Link></section></div></main>;

  const requestedTab = getTab(params.tab);
  const tab = requestedTab === "appeals" && !access.canUnban ? "bans" : requestedTab;
  const page = getPageNumber(params.page);
  const query = (params.q ?? "").trim().slice(0, 64);
  const [moderation, admins, vips, appealPage, ticketPage, vipGroupDefinitions] = await Promise.all([
    tab === "bans" ? getStaffModeration(page, query) : Promise.resolve(null),
    tab === "admins" ? getStaffAdmins() : Promise.resolve([]),
    tab === "vips" ? getStaffVips() : Promise.resolve([]),
    tab === "appeals" && access.canUnban ? getStaffAppeals(page) : Promise.resolve(null),
    tab === "tickets" ? getStaffTickets(page) : Promise.resolve(null),
    tab === "vips" ? getIdentityVipGroupDefinitions() : Promise.resolve([]),
  ]);
  const vipGroups = vipGroupDefinitions.length
    ? vipGroupDefinitions.map((group) => group.name)
    : fallbackVipGroups;
  const profileIds = [
    ...(moderation?.bans.flatMap((ban) => [ban.steamId, ban.adminSteamId]) ?? []),
    ...(moderation?.sanctions.flatMap((sanction) => [sanction.steamId, sanction.adminSteamId ?? ""]) ?? []),
    ...(appealPage?.appeals.flatMap((appeal) => [appeal.steamId, appeal.ban?.adminSteamId ?? "", ...appeal.messages.map((message) => message.authorId)]) ?? []),
    ...(ticketPage?.tickets.flatMap((ticket) => [ticket.steamId, ...ticket.messages.map((message) => message.authorId)]) ?? [])
  ];
  const steamProfiles = await getSteamProfiles(profileIds);
  const csrf = createAdminActionToken(session);
  const actionsReady = adminWriteConfigured();
  const notice = noticeText(params.notice);
  const error = errorText(params.error);
  const groupDefinitions = await getStaffGroupDefinitions();
  const totalPages = moderation ? Math.max(1, Math.ceil(Math.max(moderation.banTotal, moderation.sanctionTotal) / moderation.pageSize)) : 1;
  const casePage = appealPage ?? ticketPage;
  const caseTotalPages = casePage ? Math.max(1, Math.ceil(casePage.total / casePage.pageSize)) : 1;

  return <main className="tapped-page staff-page"><div className="shell"><SiteHeader authenticated />
    <section className="staff-hero"><div><p className="tapped-kicker"><ShieldCheck aria-hidden="true" /> Staff operations</p><h1>Command<br /><span>centre.</span></h1><p>Moderate the server, manage access, and respond to player cases from one protected control room.</p></div><aside className="staff-access-card"><span>ACTIVE ROLE</span><strong>{access.groups.join(" + ")}</strong><small>Immunity {access.immunity} · Ban {access.canBan ? "allowed" : "no"} · Unban {access.canUnban ? "allowed" : "no"}</small></aside></section>
    <StaffSubmenu access={access} active={tab} />
    {notice ? <PortalToast message={notice} /> : null}
    {error ? <PortalToast variant="danger" message={error} /> : null}

    {tab === "bans" && moderation ? <>
      <section className="staff-tools"><SearchNavigationForm className="staff-search" action="/admin"><input type="hidden" name="tab" value="bans" /><div><PlayerSearchField name="q" id="staff-search" label="Find a player" mode="query" defaultQuery={query} includeSelf /><SearchSubmitButton alignWithLabel>Search</SearchSubmitButton></div></SearchNavigationForm><div className={`staff-write-status ${actionsReady ? "ready" : ""}`}><Gavel aria-hidden="true" /><span>{actionsReady ? "Server bridge actions are enabled" : "Read-only mode: server bridge is not enabled"}</span></div></section>
      {access.canBan ? <section className="staff-ban-form"><div><p className="tapped-kicker"><Ban aria-hidden="true" /> Ban player</p><h2>Queue a server ban.</h2><p>Swiftly applies the ban through its own Admins.Bans API, including offline Steam accounts.</p></div><form action="/api/admin/moderation" method="post"><input type="hidden" name="csrf" value={csrf} /><input type="hidden" name="action" value="ban" /><PlayerSearchField name="steamId" label="Player" mode="target" required includeSelf companionNameField="playerName" /><label>Player name<input name="playerName" maxLength={128} placeholder="Filled from the selected profile" /></label><label>Duration<select name="durationMinutes" defaultValue="1440"><option value="5">5 minutes</option><option value="60">1 hour</option><option value="1440">1 day</option><option value="10080">7 days</option><option value="43200">30 days</option><option value="0">Permanent</option></select></label><label>Reason<input name="reason" minLength={2} maxLength={200} required placeholder="Reason for ban" /></label><button className="button button-primary" type="submit" disabled={!actionsReady}><Gavel aria-hidden="true" /> Queue ban</button></form></section> : <section className="staff-permission-note"><LockKeyhole aria-hidden="true" /><span>Your current group can view bans but does not include <code>admins.commands.ban</code>.</span></section>}
      <section className="staff-record-section"><div className="staff-section-heading"><div><p className="tapped-kicker"><Ban aria-hidden="true" /> Live records</p><h2>Ban list</h2></div><span>{moderation.banTotal.toLocaleString()} records</span></div>{moderation.bans.length ? <div className="staff-table-scroll"><table className="staff-table"><thead><tr><th>Player</th><th>Reason</th><th>Issued by</th><th>Status</th><th>Action</th></tr></thead><tbody>{moderation.bans.map((ban) => { const profile = steamProfiles.get(ban.steamId); const displayName = profile?.name || ban.playerName; return <tr key={ban.id}><td><Link className="leaderboard-player staff-player" href={`/players/${ban.steamId}`}><ResilientRemoteImage src={profile?.avatarFull} alt={`${displayName}'s Steam avatar`} referrerPolicy="no-referrer" fallback={<span className="player-avatar-fallback" aria-hidden="true">{avatarInitial(displayName)}</span>} /><div><strong>{displayName}</strong><small>SteamID64 {ban.steamId}</small></div></Link></td><td><strong>{ban.reason}</strong><small>{formatDate(ban.createdAt)}{ban.global ? " · Global" : ""}</small></td><td>{isSteamId(ban.adminSteamId) ? <Link className="staff-admin-link" href={`/players/${ban.adminSteamId}`}>{ban.adminName}</Link> : ban.adminName}</td><td><span className={isActiveSanction(ban.expiresAt) ? "staff-status active" : "staff-status"}>{isActiveSanction(ban.expiresAt) ? "Active" : "Expired"}<small>{ban.expiresAt ? formatDate(ban.expiresAt) : "Permanent"}</small></span></td><td>{access.canUnban && isActiveSanction(ban.expiresAt) ? <form action="/api/admin/moderation" method="post"><input type="hidden" name="csrf" value={csrf} /><input type="hidden" name="action" value="unban" /><input type="hidden" name="steamId" value={ban.steamId} /><button className="staff-unban-button" type="submit" disabled={!actionsReady}>Unban</button></form> : <span className="staff-no-action">—</span>}</td></tr>; })}</tbody></table></div> : <p className="empty-copy">No bans match this search.</p>}</section>
      <section className="staff-record-section"><div className="staff-section-heading"><div><p className="tapped-kicker"><VolumeX aria-hidden="true" /> Communication</p><h2>Gag, mute &amp; silence history</h2></div><span>{moderation.sanctionTotal.toLocaleString()} raw records</span></div>{getSanctionEvents(moderation.sanctions).length ? <div className="staff-table-scroll"><table className="staff-table"><thead><tr><th>Player</th><th>Type</th><th>Reason</th><th>Issued by</th><th>Status</th></tr></thead><tbody>{getSanctionEvents(moderation.sanctions).map((sanction) => <tr key={`${sanction.id}-${sanction.kind}`}><td><Link className="staff-admin-link" href={`/players/${sanction.steamId}`}>{sanction.playerName}<small>{sanction.steamId}</small></Link></td><td><span className={`sanction-type ${sanction.kind.toLowerCase()}`}>{sanction.kind}</span></td><td><strong>{sanction.reason}</strong><small>{formatDate(sanction.createdAt)}</small></td><td><ProfileMention steamId={sanction.adminSteamId} name={steamProfiles.get(sanction.adminSteamId ?? "")?.name ?? sanction.adminName} /></td><td><span className={isActiveSanction(sanction.expiresAt) ? "staff-status active" : "staff-status"}>{isActiveSanction(sanction.expiresAt) ? "Active" : "Expired"}</span></td></tr>)}</tbody></table></div> : <p className="empty-copy">No communication sanctions match this search.</p>}</section>
      <nav className="pagination staff-pagination" aria-label="Ban list pages"><Link className={page <= 1 ? "is-disabled" : ""} aria-disabled={page <= 1} href={staffLink("bans", Math.max(1, page - 1), query)}>Previous</Link><span>Page {page} of {totalPages}</span><Link className={page >= totalPages ? "is-disabled" : ""} aria-disabled={page >= totalPages} href={staffLink("bans", Math.min(totalPages, page + 1), query)}>Next</Link></nav>
    </> : null}

    {tab === "admins" ? <AdminAssignments admins={admins} csrf={csrf} canManage={access.canManageAdmins} groupDefinitions={groupDefinitions} /> : null}

    {tab === "vips" ? <section className="staff-record-section"><div className="staff-section-heading"><div><p className="tapped-kicker">VIPCore</p><h2>VIP assignments</h2></div><span>{vips.length.toLocaleString()} active records</span></div>{access.canManageVips ? <form className="staff-management-form vip" action="/api/admin/staff" method="post"><input type="hidden" name="csrf" value={csrf} /><input type="hidden" name="action" value="vip-upsert" /><PlayerSearchField name="steamId" label="VIP player" mode="target" required includeSelf companionNameField="name" /><label>Player name<input name="name" maxLength={64} placeholder="Filled from the selected profile" /></label><label>VIP tier<select name="group">{vipGroups.map((group) => <option key={group}>{group}</option>)}</select></label><label>Duration (minutes)<input name="durationMinutes" type="number" min="0" max="525600" defaultValue="1440" required /><small>Use 0 for permanent access.</small></label><button className="button button-primary" type="submit">Save VIP</button></form> : <p className="staff-readonly-note">VIP changes require the VIPCore management permission. Your current staff role remains read-only here.</p>}{vipGroups.map((group) => { const entries = vips.filter((vip) => vip.group === group); return <article className="staff-group-card" key={group}><div><h3><GroupBadge kind="vip" group={group} /></h3><span>{entries.length} member{entries.length === 1 ? "" : "s"}</span></div>{entries.length ? <div className="staff-group-list">{entries.map((vip) => access.canManageVips ? <form className="staff-vip-edit" action="/api/admin/staff" method="post" key={`${vip.steamId}-${vip.group}`}><input type="hidden" name="csrf" value={csrf} /><input type="hidden" name="steamId" value={vip.steamId} /><input type="hidden" name="previousGroup" value={vip.group} /><Link href={`/players/${vip.steamId}`}>{vip.name}<small>{vip.steamId}</small></Link><input name="name" defaultValue={vip.name} maxLength={64} required aria-label={`Name for ${vip.name}`} /><select name="group" defaultValue={vip.group}>{vipGroups.map((name) => <option key={name}>{name}</option>)}</select><input name="durationMinutes" type="number" min="0" max="525600" defaultValue={vip.expiresAt === 0 ? 0 : Math.max(1, Math.floor((vip.expiresAt - Date.now() / 1000) / 60))} aria-label={`Duration in minutes for ${vip.name}`} /><span>{vip.expiresAt === 0 ? "Permanent" : `Ends ${formatDate(vip.expiresAt)}`}</span><button className="staff-unban-button" name="action" value="vip-upsert" type="submit">Save</button><button className="staff-danger-button" name="action" value="vip-remove" type="submit">Remove</button></form> : <div className="staff-admin-read" key={`${vip.steamId}-${vip.group}`}><Link href={`/players/${vip.steamId}`}>{vip.name}<small>{vip.steamId}</small></Link><GroupBadge kind="vip" group={vip.group} /><span>{vip.expiresAt === 0 ? "Permanent" : `Ends ${formatDate(vip.expiresAt)}`}</span></div>)}</div> : <p className="empty-copy">No VIP assignments in this tier.</p>}</article>; })}</section> : null}

    {tab === "appeals" ? access.canUnban && appealPage ? <section className="staff-record-section"><div className="staff-section-heading"><div><p className="tapped-kicker"><Ban aria-hidden="true" /> Unban review</p><h2>Appeals</h2></div><span>{appealPage.total.toLocaleString()} cases</span></div>{appealPage.appeals.length ? <div className="staff-case-list">{appealPage.appeals.map((appeal) => { const profile = steamProfiles.get(appeal.steamId); const name = profile?.name || `Steam ${appeal.steamId}`; return <article className="staff-case" key={appeal.id}><div className="staff-case-heading"><Link href={`/players/${appeal.steamId}`}>{name}<small>{appeal.steamId}</small></Link><CaseStatusTag status={appeal.status} /></div><AppealBanSource appeal={appeal} steamProfiles={steamProfiles} /><p>{appeal.body}</p><small>Opened {formatPortalDate(appeal.createdAt)} · Updated {formatPortalDate(appeal.updatedAt)}</small><CaseMessages messages={appeal.messages} steamProfiles={steamProfiles} /><form className="staff-case-form" action="/api/admin/cases" method="post" encType="multipart/form-data"><input type="hidden" name="csrf" value={csrf} /><input type="hidden" name="caseId" value={appeal.id} /><textarea name="body" maxLength={5000} placeholder="Reply to the player (optional when closing)" /><label>Screenshot (optional)<input name="screenshot" type="file" accept="image/png,image/jpeg,image/webp" /></label><div><button className="staff-unban-button" name="action" value="appeal-reply" type="submit">Reply</button><button className="staff-danger-button" name="action" value="appeal-close-banned" type="submit">Close: still banned</button><button className="button button-primary" name="action" value="appeal-close-unbanned" type="submit">Close: unbanned</button></div></form></article>; })}</div> : <p className="empty-copy">No appeals have been submitted.</p>}<nav className="pagination staff-pagination" aria-label="Appeal pages"><Link className={page <= 1 ? "is-disabled" : ""} aria-disabled={page <= 1} href={staffLink("appeals", Math.max(1, page - 1))}>Previous</Link><span>Page {page} of {caseTotalPages}</span><Link className={page >= caseTotalPages ? "is-disabled" : ""} aria-disabled={page >= caseTotalPages} href={staffLink("appeals", Math.min(caseTotalPages, page + 1))}>Next</Link></nav></section> : <section className="staff-denied"><LockKeyhole aria-hidden="true" /><p className="tapped-kicker">Unban restricted</p><h1>Appeal access requires unban permission.</h1><p>Only staff members with <code>admins.commands.unban</code> can read, reply to, or resolve ban appeals.</p></section> : null}

    {tab === "tickets" && ticketPage ? <section className="staff-record-section"><div className="staff-section-heading"><div><p className="tapped-kicker"><Ticket aria-hidden="true" /> Player support</p><h2>Tickets</h2></div><span>{ticketPage.total.toLocaleString()} cases</span></div>{ticketPage.tickets.length ? <div className="staff-case-list">{ticketPage.tickets.map((ticket) => { const profile = steamProfiles.get(ticket.steamId); const name = profile?.name || `Steam ${ticket.steamId}`; return <article className="staff-case" key={ticket.id}><div className="staff-case-heading"><Link href={`/players/${ticket.steamId}`}>{ticket.subject}<small>{name} · {ticket.steamId}</small></Link><CaseStatusTag status={ticket.status} /></div><p>{ticket.body}</p><small>{ticket.category} · Opened {formatPortalDate(ticket.createdAt)} · Updated {formatPortalDate(ticket.updatedAt)}</small><CaseMessages messages={ticket.messages} steamProfiles={steamProfiles} /><form className="staff-case-form" action="/api/admin/cases" method="post" encType="multipart/form-data"><input type="hidden" name="csrf" value={csrf} /><input type="hidden" name="caseId" value={ticket.id} /><textarea name="body" maxLength={5000} placeholder="Reply to the player (optional when closing)" /><label>Screenshot (optional)<input name="screenshot" type="file" accept="image/png,image/jpeg,image/webp" /></label><div><button className="staff-unban-button" name="action" value="ticket-reply" type="submit">Reply</button><button className="staff-danger-button" name="action" value="ticket-close-unsolved" type="submit">Close: unsolved</button><button className="button button-primary" name="action" value="ticket-close-solved" type="submit">Close: solved</button></div></form></article>; })}</div> : <p className="empty-copy">No support tickets have been submitted.</p>}<nav className="pagination staff-pagination" aria-label="Ticket pages"><Link className={page <= 1 ? "is-disabled" : ""} aria-disabled={page <= 1} href={staffLink("tickets", Math.max(1, page - 1))}>Previous</Link><span>Page {page} of {caseTotalPages}</span><Link className={page >= caseTotalPages ? "is-disabled" : ""} aria-disabled={page >= caseTotalPages} href={staffLink("tickets", Math.min(caseTotalPages, page + 1))}>Next</Link></nav></section> : null}
  </div></main>;
}
