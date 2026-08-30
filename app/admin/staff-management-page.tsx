import Link from "next/link";
import { AlertTriangle, Ban, Gavel, LockKeyhole, Ticket, UsersRound, VolumeX } from "lucide-react";

import { adminWriteConfigured, getAdminAccess, getStaffGroupDefinitions } from "@/lib/admin/access";
import { getSession, createAdminActionToken } from "@/lib/auth/session";
import { CaseStatusTag } from "@/components/case-status-tag";
import { formatDate, formatPortalDate, isActiveSanction } from "@/components/formatters";
import {
  IdentityGroupBadge,
} from "@/components/identity-group-badge";
import { PlayerSearchField } from "@/components/player-search-field";
import { PlayerIdentity } from "@/components/player-identity";
import { SignInRequired } from "@/components/sign-in-required";
import {
  StaffSubmenu,
  type StaffModerationSection,
} from "@/components/staff-submenu";
import { PortalToast } from "@/components/success-toast";
import { AdminPageHeader } from "@/components/ui/admin-page-header";
import { DataTable } from "@/components/ui/data-table";
import { LinkPagination } from "@/components/ui/link-pagination";
import { PortalShell } from "@/components/ui/portal-shell";
import { SearchNavigationForm, SearchSubmitButton } from "@/components/ui/search-field";
import { ThemedPlayerTableRow } from "@/components/ui/themed-player-table-row";
import { ThemedPlayerContainer } from "@/components/ui/themed-player-container";
import { identityExternalBadgeLookupKey } from "@/lib/content/identity-group-badges";
import { getStaffAdmins, getStaffAppeals, getStaffModeration, getStaffTickets, getStaffVips, type CaseMessage, type StaffAdmin, type StaffAppeal, type StaffSanction } from "@/lib/data/portal-repository";
import {
  getIdentityGroupBadgeCatalogue,
  getIdentityVipGroupDefinitions,
  type IdentityGroupBadgeData,
} from "@/lib/data/identity-groups";
import {
  resolvePlayerIdentities,
  type PlayerIdentityData,
  type PlayerIdentitySeed,
} from "@/lib/player-identities";

type StaffTab = StaffModerationSection;
export type StaffManagementSearchParams = { page?: string; q?: string; notice?: string; error?: string };
type StaffManagementPageProps = {
  section: StaffTab;
  searchParams: Promise<StaffManagementSearchParams>;
};

const fallbackVipGroups = ["ULTIMATE", "DIAMOND", "GOLD", "SILVER", "STANDARD"];

function getPageNumber(value: string | undefined) {
  const parsed = Number.parseInt(value ?? "1", 10);
  return Number.isSafeInteger(parsed) && parsed > 0 ? parsed : 1;
}

function staffLink(tab: StaffTab, page = 1, query = "") {
  const parameters = new URLSearchParams({ page: String(page) });
  if (query) parameters.set("q", query);
  return `/admin/${tab}?${parameters.toString()}`;
}

function isSteamId(value: string) {
  return /^7656119\d{10}$/.test(value);
}

type ExternalBadgeLookup = Map<string, IdentityGroupBadgeData>;

function configuredExternalBadge(
  badges: ExternalBadgeLookup,
  sourceType: "admins_core" | "vipcore",
  group: string,
) {
  return badges.get(identityExternalBadgeLookupKey(sourceType, group)) ?? null;
}

function ConfiguredExternalGroupBadge({
  badges,
  sourceType,
  group,
  compact = false,
}: {
  badges: ExternalBadgeLookup;
  sourceType: "admins_core" | "vipcore";
  group: string;
  compact?: boolean;
}) {
  const badge = configuredExternalBadge(badges, sourceType, group);
  return badge ? <IdentityGroupBadge group={badge} compact={compact} /> : <>{group}</>;
}

function ProfileMention({ steamId, name, identities }: { steamId: string | null; name: string; identities: Readonly<Record<string, PlayerIdentityData>> }) {
  const player = steamId ? identities[steamId] : undefined;
  return steamId && isSteamId(steamId) ? <PlayerIdentity player={player ?? { steamId, displayName: name, avatarUrl: null, presence: "unknown", profileThemeKey: null, identityGroups: [] }} variant="inline" className="staff-admin-link" showSteamId={false} /> : <>{name}</>;
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

function CaseMessages({ messages, identities }: { messages: CaseMessage[]; identities: Readonly<Record<string, PlayerIdentityData>> }) {
  if (!messages.length) return null;
  return <div className="case-message-list">{messages.map((message) => {
    const player = identities[message.authorId] ?? { steamId: message.authorId, displayName: message.authorType === "staff" ? "Staff member" : "Player", avatarUrl: null, presence: "unknown" as const, profileThemeKey: null, identityGroups: [] };
    return <ThemedPlayerContainer containerKind="message" ownerSteamId={player.steamId} profileThemeKey={player.profileThemeKey} key={message.id} className={`case-message ${message.authorType}`}><header className="case-message-header"><PlayerIdentity player={player} variant="compact" className="case-message-profile-link" secondary={message.authorType === "staff" ? "Staff reply" : "Player reply"} /><time dateTime={message.createdAt}>{formatPortalDate(message.createdAt)}</time></header><p>{message.body}</p>{message.attachments.map((attachment) => <a key={attachment.id} href={`/api/case-attachments/${attachment.id}`} target="_blank" rel="noreferrer">View screenshot: {attachment.fileName}</a>)}</ThemedPlayerContainer>;
  })}</div>;
}

function AppealBanSource({ appeal, identities }: { appeal: StaffAppeal; identities: Readonly<Record<string, PlayerIdentityData>> }) {
  if (!appeal.ban) return null;
  const issuer = appeal.ban.adminSteamId ? identities[appeal.ban.adminSteamId] : undefined;
  const issuerName = issuer?.displayName ?? appeal.ban.adminName;
  return <p className="staff-appeal-source"><span>Original ban</span> {appeal.ban.reason} · issued by <ProfileMention steamId={appeal.ban.adminSteamId} name={issuerName} identities={identities} /> on {formatDate(appeal.ban.createdAt)}</p>;
}

function AdminAssignments({ admins, csrf, canManage, groupDefinitions, badges, identities }: { admins: StaffAdmin[]; csrf: string; canManage: boolean; groupDefinitions: Array<{ name: string; immunity: number }>; badges: ExternalBadgeLookup; identities: Readonly<Record<string, PlayerIdentityData>> }) {
  const grouped = new Map(groupDefinitions.map((group) => [group.name, admins.filter((admin) => admin.groups.includes(group.name))]));
  const unassigned = admins.filter((admin) => !admin.groups.length);

  return <section className="staff-record-section"><div className="staff-section-heading"><div><p className="tapped-kicker"><UsersRound aria-hidden="true" /> Admins.Core</p><h2>Admin assignments</h2></div><span>{admins.length.toLocaleString()} admins</span></div>
    {canManage ? <form className="staff-management-form" action="/api/admin/staff" method="post"><input type="hidden" name="csrf" value={csrf} /><input type="hidden" name="action" value="admin-upsert" /><PlayerSearchField name="steamId" label="Staff player" mode="target" required includeSelf companionNameField="username" /><label>Display name<input name="username" maxLength={64} required placeholder="Staff name" /></label><label>Groups<select name="groups" multiple required size={Math.min(6, groupDefinitions.length)}>{groupDefinitions.map((group) => <option key={group.name} value={group.name}>{group.name} · immunity {group.immunity}</option>)}</select><small>Hold Ctrl/Cmd to assign multiple groups.</small></label><button className="button button-primary" type="submit">Save admin</button></form> : <p className="staff-readonly-note">You can review staff assignments, but only admins with <code>admins.commands.admin</code> can add or modify them.</p>}
    {[...grouped.entries(), ...(unassigned.length ? [["Unassigned", unassigned] as const] : [])].map(([groupName, entries]) => <article className="staff-group-card" key={groupName}><div><h3>{groupName === "Unassigned" ? groupName : <ConfiguredExternalGroupBadge badges={badges} sourceType="admins_core" group={groupName} />}</h3><span>{entries.length} member{entries.length === 1 ? "" : "s"}</span></div>{entries.length ? <div className="staff-group-list">{entries.map((admin) => { const identity = identities[admin.steamId] ?? { steamId: admin.steamId, displayName: admin.username, avatarUrl: null, presence: "unknown" as const, profileThemeKey: null, identityGroups: [] }; return canManage ? <ThemedPlayerContainer as="form" containerKind="management" ownerSteamId={identity.steamId} profileThemeKey={identity.profileThemeKey} className="staff-admin-edit" action="/api/admin/staff" method="post" key={admin.id}><input type="hidden" name="csrf" value={csrf} /><input type="hidden" name="action" value="admin-upsert" /><input type="hidden" name="steamId" value={admin.steamId} /><PlayerIdentity player={identity} variant="compact" /><input name="username" defaultValue={admin.username} maxLength={64} required aria-label={`Display name for ${admin.username}`} /><select name="groups" multiple defaultValue={admin.groups} aria-label={`Groups for ${admin.username}`} size={Math.min(4, groupDefinitions.length)}>{groupDefinitions.map((group) => <option key={group.name} value={group.name}>{group.name}</option>)}</select><span>Immunity {admin.immunity}</span><button className="staff-unban-button" type="submit">Save</button></ThemedPlayerContainer> : <ThemedPlayerContainer containerKind="management" ownerSteamId={identity.steamId} profileThemeKey={identity.profileThemeKey} className="staff-admin-read" key={admin.id}><PlayerIdentity player={identity} variant="compact" /><span>{admin.groups.join(" + ") || "No group"}</span><span>Immunity {admin.immunity}</span></ThemedPlayerContainer>; })}</div> : <p className="empty-copy">No admins are assigned to this group.</p>}</article>)}</section>;
}

function VipAssignments({ vips, vipGroups, csrf, canManage, badges, identities }: { vips: Awaited<ReturnType<typeof getStaffVips>>; vipGroups: string[]; csrf: string; canManage: boolean; badges: ExternalBadgeLookup; identities: Readonly<Record<string, PlayerIdentityData>> }) {
  return <section className="staff-record-section"><div className="staff-section-heading"><div><p className="tapped-kicker">VIPCore</p><h2>VIP assignments</h2></div><span>{vips.length.toLocaleString()} active records</span></div>
    {canManage ? <form className="staff-management-form vip" action="/api/admin/staff" method="post"><input type="hidden" name="csrf" value={csrf} /><input type="hidden" name="action" value="vip-upsert" /><PlayerSearchField name="steamId" label="VIP player" mode="target" required includeSelf companionNameField="name" /><label>Player name<input name="name" maxLength={64} placeholder="Filled from the selected profile" /></label><label>VIP tier<select name="group">{vipGroups.map((group) => <option key={group}>{group}</option>)}</select></label><label>Duration (minutes)<input name="durationMinutes" type="number" min="0" max="525600" defaultValue="1440" required /><small>Use 0 for permanent access.</small></label><button className="button button-primary" type="submit">Save VIP</button></form> : <p className="staff-readonly-note">VIP changes require the VIPCore management permission. Your current staff role remains read-only here.</p>}
    {vipGroups.map((group) => { const entries = vips.filter((vip) => vip.group === group); return <article className="staff-group-card" key={group}><div><h3><ConfiguredExternalGroupBadge badges={badges} sourceType="vipcore" group={group} /></h3><span>{entries.length} member{entries.length === 1 ? "" : "s"}</span></div>{entries.length ? <div className="staff-group-list">{entries.map((vip) => { const identity = identities[vip.steamId] ?? { steamId: vip.steamId, displayName: vip.name, avatarUrl: null, presence: "unknown" as const, profileThemeKey: null, identityGroups: [] }; return canManage ? <ThemedPlayerContainer as="form" containerKind="management" ownerSteamId={identity.steamId} profileThemeKey={identity.profileThemeKey} className="staff-vip-edit" action="/api/admin/staff" method="post" key={`${vip.steamId}-${vip.group}`}><input type="hidden" name="csrf" value={csrf} /><input type="hidden" name="steamId" value={vip.steamId} /><input type="hidden" name="previousGroup" value={vip.group} /><PlayerIdentity player={identity} variant="compact" /><input name="name" defaultValue={vip.name} maxLength={64} required aria-label={`Name for ${vip.name}`} /><select name="group" defaultValue={vip.group}>{vipGroups.map((name) => <option key={name}>{name}</option>)}</select><input name="durationMinutes" type="number" min="0" max="525600" defaultValue={vip.expiresAt === 0 ? 0 : Math.max(1, Math.floor((vip.expiresAt - Date.now() / 1000) / 60))} aria-label={`Duration in minutes for ${vip.name}`} /><span>{vip.expiresAt === 0 ? "Permanent" : `Ends ${formatDate(vip.expiresAt)}`}</span><button className="staff-unban-button" name="action" value="vip-upsert" type="submit">Save</button><button className="staff-danger-button" name="action" value="vip-remove" type="submit">Remove</button></ThemedPlayerContainer> : <ThemedPlayerContainer containerKind="management" ownerSteamId={identity.steamId} profileThemeKey={identity.profileThemeKey} className="staff-admin-read" key={`${vip.steamId}-${vip.group}`}><PlayerIdentity player={identity} variant="compact" /><ConfiguredExternalGroupBadge badges={badges} sourceType="vipcore" group={vip.group} compact /><span>{vip.expiresAt === 0 ? "Permanent" : `Ends ${formatDate(vip.expiresAt)}`}</span></ThemedPlayerContainer>; })}</div> : <p className="empty-copy">No VIP assignments in this tier.</p>}</article>; })}
  </section>;
}

export async function StaffManagementPage({ section, searchParams }: StaffManagementPageProps) {
  const [session, params] = await Promise.all([getSession(), searchParams]);
  if (!session) return <SignInRequired title="Staff moderation" description="Sign in with the Steam account that has your ARENA admin group." />;

  const access = await getAdminAccess(session.steamId);
  if (!access.isAdmin) return <PortalShell authenticated><section className="staff-denied"><LockKeyhole aria-hidden="true" /><p className="tapped-kicker">Restricted area</p><h1>Staff access required.</h1><p>Your Steam account does not have an active Admins.Core staff assignment for ARENA.TAPPED.RO.</p><Link className="button button-secondary" href={`/players/${session.steamId}`}>Back to profile</Link></section></PortalShell>;

  const tab = section;
  const page = getPageNumber(params.page);
  const query = (params.q ?? "").trim().slice(0, 64);
  const [moderation, admins, vips, appealPage, ticketPage, vipGroupDefinitions, badgeCatalogue] = await Promise.all([
    tab === "bans" ? getStaffModeration(page, query) : Promise.resolve(null),
    tab === "admins" ? getStaffAdmins() : Promise.resolve([]),
    tab === "vips" ? getStaffVips() : Promise.resolve([]),
    tab === "appeals" && access.canUnban ? getStaffAppeals(page) : Promise.resolve(null),
    tab === "tickets" ? getStaffTickets(page) : Promise.resolve(null),
    tab === "vips" ? getIdentityVipGroupDefinitions() : Promise.resolve([]),
    getIdentityGroupBadgeCatalogue(),
  ]);
  const vipGroups = vipGroupDefinitions.length
    ? vipGroupDefinitions.map((group) => group.name)
    : fallbackVipGroups;
  const profileSeeds: PlayerIdentitySeed[] = [
    { steamId: session.steamId, profileThemeKey: session.profileThemeKey },
    ...admins.map((admin) => ({ steamId: admin.steamId, displayName: admin.username })),
    ...vips.map((vip) => ({ steamId: vip.steamId, displayName: vip.name })),
    ...(moderation?.bans.flatMap((ban) => [
      { steamId: ban.steamId, displayName: ban.playerName },
      { steamId: ban.adminSteamId, displayName: ban.adminName },
    ]) ?? []),
    ...(moderation?.sanctions.flatMap((sanction) => [
      { steamId: sanction.steamId, displayName: sanction.playerName },
      { steamId: sanction.adminSteamId ?? "", displayName: sanction.adminName },
    ]) ?? []),
    ...(appealPage?.appeals.flatMap((appeal) => [
      { steamId: appeal.steamId },
      { steamId: appeal.ban?.adminSteamId ?? "", displayName: appeal.ban?.adminName },
      ...appeal.messages.map((message) => ({ steamId: message.authorId })),
    ]) ?? []),
    ...(ticketPage?.tickets.flatMap((ticket) => [
      { steamId: ticket.steamId },
      ...ticket.messages.map((message) => ({ steamId: message.authorId })),
    ]) ?? []),
  ];
  const playerIdentities = await resolvePlayerIdentities(profileSeeds);
  const csrf = createAdminActionToken(session);
  const actionsReady = adminWriteConfigured();
  const notice = noticeText(params.notice);
  const error = errorText(params.error);
  const groupDefinitions = await getStaffGroupDefinitions();
  const externalBadges: ExternalBadgeLookup = new Map();
  for (const badge of badgeCatalogue) {
    if (!badge.externalKey || badge.sourceType === "custom") continue;
    externalBadges.set(
      identityExternalBadgeLookupKey(badge.sourceType, badge.externalKey),
      badge,
    );
  }
  const totalPages = moderation ? Math.max(1, Math.ceil(Math.max(moderation.banTotal, moderation.sanctionTotal) / moderation.pageSize)) : 1;
  const casePage = appealPage ?? ticketPage;
  const caseTotalPages = casePage ? Math.max(1, Math.ceil(casePage.total / casePage.pageSize)) : 1;

  return <PortalShell authenticated className="staff-page">
    <AdminPageHeader
      id="staff-management-title"
      title={tab === "bans" ? "Bans" : tab === "admins" ? "Admins" : tab === "vips" ? "VIPs" : tab === "appeals" ? "Appeals" : "Tickets"}
      description="Moderate the server, manage staff and VIP access, and respond to player cases."
      access={access}
    />
    <StaffSubmenu access={access} active={tab} />
    {notice ? <PortalToast message={notice} /> : null}
    {error ? <PortalToast variant="danger" message={error} /> : null}

    {tab === "bans" && moderation ? <>
      <section className="staff-tools"><SearchNavigationForm className="staff-search" action="/admin/bans"><div><PlayerSearchField name="q" id="staff-search" label="Find a player" mode="query" defaultQuery={query} includeSelf /><SearchSubmitButton alignWithLabel>Search</SearchSubmitButton></div></SearchNavigationForm><div className={`staff-write-status ${actionsReady ? "ready" : ""}`}><Gavel aria-hidden="true" /><span>{actionsReady ? "Server bridge actions are enabled" : "Read-only mode: server bridge is not enabled"}</span></div></section>
      {access.canBan ? <section className="staff-ban-form"><div><p className="tapped-kicker"><Ban aria-hidden="true" /> Ban player</p><h2>Queue a server ban.</h2><p>Swiftly applies the ban through its own Admins.Bans API, including offline Steam accounts.</p></div><form action="/api/admin/moderation" method="post"><input type="hidden" name="csrf" value={csrf} /><input type="hidden" name="action" value="ban" /><PlayerSearchField name="steamId" label="Player" mode="target" required includeSelf companionNameField="playerName" /><label>Player name<input name="playerName" maxLength={128} placeholder="Filled from the selected profile" /></label><label>Duration<select name="durationMinutes" defaultValue="1440"><option value="5">5 minutes</option><option value="60">1 hour</option><option value="1440">1 day</option><option value="10080">7 days</option><option value="43200">30 days</option><option value="0">Permanent</option></select></label><label>Reason<input name="reason" minLength={2} maxLength={200} required placeholder="Reason for ban" /></label><button className="button button-primary" type="submit" disabled={!actionsReady}><Gavel aria-hidden="true" /> Queue ban</button></form></section> : <section className="staff-permission-note"><LockKeyhole aria-hidden="true" /><span>Your current group can view bans but does not include <code>admins.commands.ban</code>.</span></section>}
      <section className="staff-record-section"><div className="staff-section-heading"><div><p className="tapped-kicker"><Ban aria-hidden="true" /> Live records</p><h2>Ban list</h2></div><span>{moderation.banTotal.toLocaleString()} records</span></div>{moderation.bans.length ? <DataTable className="staff-table-scroll" tableClassName="staff-table" caption="Server ban records"><thead><tr><th scope="col">Player</th><th scope="col">Reason</th><th scope="col">Issued by</th><th scope="col">Status</th><th scope="col">Action</th></tr></thead><tbody>{moderation.bans.map((ban) => { const player = playerIdentities[ban.steamId] ?? { steamId: ban.steamId, displayName: ban.playerName, avatarUrl: null, presence: "unknown" as const, profileThemeKey: null, identityGroups: [] }; const issuerName = playerIdentities[ban.adminSteamId]?.displayName ?? ban.adminName; return <ThemedPlayerTableRow profileThemeKey={player.profileThemeKey} key={ban.id}><td><PlayerIdentity player={player} variant="table" className="staff-player" /></td><td><strong>{ban.reason}</strong><small>{formatDate(ban.createdAt)}{ban.global ? " · Global" : ""}</small></td><td><ProfileMention steamId={ban.adminSteamId} name={issuerName} identities={playerIdentities} /></td><td><span className={isActiveSanction(ban.expiresAt) ? "staff-status active" : "staff-status"}>{isActiveSanction(ban.expiresAt) ? "Active" : "Expired"}<small>{ban.expiresAt ? formatDate(ban.expiresAt) : "Permanent"}</small></span></td><td>{access.canUnban && isActiveSanction(ban.expiresAt) ? <form action="/api/admin/moderation" method="post"><input type="hidden" name="csrf" value={csrf} /><input type="hidden" name="action" value="unban" /><input type="hidden" name="steamId" value={ban.steamId} /><button className="staff-unban-button" type="submit" disabled={!actionsReady}>Unban</button></form> : <span className="staff-no-action">—</span>}</td></ThemedPlayerTableRow>; })}</tbody></DataTable> : <p className="empty-copy">No bans match this search.</p>}</section>
      <section className="staff-record-section"><div className="staff-section-heading"><div><p className="tapped-kicker"><VolumeX aria-hidden="true" /> Communication</p><h2>Gag, mute &amp; silence history</h2></div><span>{moderation.sanctionTotal.toLocaleString()} raw records</span></div>{getSanctionEvents(moderation.sanctions).length ? <DataTable className="staff-table-scroll" tableClassName="staff-table" caption="Communication sanction records"><thead><tr><th scope="col">Player</th><th scope="col">Type</th><th scope="col">Reason</th><th scope="col">Issued by</th><th scope="col">Status</th></tr></thead><tbody>{getSanctionEvents(moderation.sanctions).map((sanction) => { const player = playerIdentities[sanction.steamId] ?? { steamId: sanction.steamId, displayName: sanction.playerName, avatarUrl: null, presence: "unknown" as const, profileThemeKey: null, identityGroups: [] }; return <ThemedPlayerTableRow profileThemeKey={player.profileThemeKey} key={`${sanction.id}-${sanction.kind}`}><td><PlayerIdentity player={player} variant="table" /></td><td><span className={`sanction-type ${sanction.kind.toLowerCase()}`}>{sanction.kind}</span></td><td><strong>{sanction.reason}</strong><small>{formatDate(sanction.createdAt)}</small></td><td><ProfileMention steamId={sanction.adminSteamId} name={sanction.adminSteamId ? playerIdentities[sanction.adminSteamId]?.displayName ?? sanction.adminName : sanction.adminName} identities={playerIdentities} /></td><td><span className={isActiveSanction(sanction.expiresAt) ? "staff-status active" : "staff-status"}>{isActiveSanction(sanction.expiresAt) ? "Active" : "Expired"}</span></td></ThemedPlayerTableRow>; })}</tbody></DataTable> : <p className="empty-copy">No communication sanctions match this search.</p>}</section>
      <LinkPagination className="staff-pagination" page={page} totalPages={totalPages} label="Ban list pages" hrefForPage={(targetPage) => staffLink("bans", targetPage, query)} />
    </> : null}

    {tab === "admins" ? <AdminAssignments admins={admins} csrf={csrf} canManage={access.canManageAdmins} groupDefinitions={groupDefinitions} badges={externalBadges} identities={playerIdentities} /> : null}

    {tab === "vips" ? <VipAssignments vips={vips} vipGroups={vipGroups} csrf={csrf} canManage={access.canManageVips} badges={externalBadges} identities={playerIdentities} /> : null}

    {tab === "appeals" ? access.canUnban && appealPage ? <section className="staff-record-section"><div className="staff-section-heading"><div><p className="tapped-kicker"><Ban aria-hidden="true" /> Unban review</p><h2>Appeals</h2></div><span>{appealPage.total.toLocaleString()} cases</span></div>{appealPage.appeals.length ? <div className="staff-case-list">{appealPage.appeals.map((appeal) => { const identity = playerIdentities[appeal.steamId] ?? { steamId: appeal.steamId, displayName: `Steam ${appeal.steamId}`, avatarUrl: null, presence: "unknown" as const, profileThemeKey: null, identityGroups: [] }; return <ThemedPlayerContainer as="article" containerKind="case" ownerSteamId={identity.steamId} profileThemeKey={identity.profileThemeKey} className="staff-case" key={appeal.id}><div className="staff-case-heading"><PlayerIdentity player={identity} variant="compact" /><CaseStatusTag status={appeal.status} /></div><AppealBanSource appeal={appeal} identities={playerIdentities} /><p>{appeal.body}</p><small>Opened {formatPortalDate(appeal.createdAt)} · Updated {formatPortalDate(appeal.updatedAt)}</small><CaseMessages messages={appeal.messages} identities={playerIdentities} /><form className="staff-case-form" action="/api/admin/cases" method="post" encType="multipart/form-data"><input type="hidden" name="csrf" value={csrf} /><input type="hidden" name="caseId" value={appeal.id} /><textarea name="body" maxLength={5000} placeholder="Reply to the player (optional when closing)" /><label>Screenshot (optional)<input name="screenshot" type="file" accept="image/png,image/jpeg,image/webp" /></label><div><button className="staff-unban-button" name="action" value="appeal-reply" type="submit">Reply</button><button className="staff-danger-button" name="action" value="appeal-close-banned" type="submit">Close: still banned</button><button className="button button-primary" name="action" value="appeal-close-unbanned" type="submit">Close: unbanned</button></div></form></ThemedPlayerContainer>; })}</div> : <p className="empty-copy">No appeals have been submitted.</p>}<LinkPagination className="staff-pagination" page={page} totalPages={caseTotalPages} label="Appeal pages" hrefForPage={(targetPage) => staffLink("appeals", targetPage)} /></section> : <section className="staff-denied"><LockKeyhole aria-hidden="true" /><p className="tapped-kicker">Unban restricted</p><h1>Appeal access requires unban permission.</h1><p>Only staff members with <code>admins.commands.unban</code> can read, reply to, or resolve ban appeals.</p></section> : null}

    {tab === "tickets" && ticketPage ? <section className="staff-record-section"><div className="staff-section-heading"><div><p className="tapped-kicker"><Ticket aria-hidden="true" /> Player support</p><h2>Tickets</h2></div><span>{ticketPage.total.toLocaleString()} cases</span></div>{ticketPage.tickets.length ? <div className="staff-case-list">{ticketPage.tickets.map((ticket) => { const identity = playerIdentities[ticket.steamId] ?? { steamId: ticket.steamId, displayName: `Steam ${ticket.steamId}`, avatarUrl: null, presence: "unknown" as const, profileThemeKey: null, identityGroups: [] }; return <ThemedPlayerContainer as="article" containerKind="case" ownerSteamId={identity.steamId} profileThemeKey={identity.profileThemeKey} className="staff-case" key={ticket.id}><div className="staff-case-heading"><div><strong>{ticket.subject}</strong><PlayerIdentity player={identity} variant="inline" /></div><CaseStatusTag status={ticket.status} /></div><p>{ticket.body}</p><small>{ticket.category} · Opened {formatPortalDate(ticket.createdAt)} · Updated {formatPortalDate(ticket.updatedAt)}</small><CaseMessages messages={ticket.messages} identities={playerIdentities} /><form className="staff-case-form" action="/api/admin/cases" method="post" encType="multipart/form-data"><input type="hidden" name="csrf" value={csrf} /><input type="hidden" name="caseId" value={ticket.id} /><textarea name="body" maxLength={5000} placeholder="Reply to the player (optional when closing)" /><label>Screenshot (optional)<input name="screenshot" type="file" accept="image/png,image/jpeg,image/webp" /></label><div><button className="staff-unban-button" name="action" value="ticket-reply" type="submit">Reply</button><button className="staff-danger-button" name="action" value="ticket-close-unsolved" type="submit">Close: unsolved</button><button className="button button-primary" name="action" value="ticket-close-solved" type="submit">Close: solved</button></div></form></ThemedPlayerContainer>; })}</div> : <p className="empty-copy">No support tickets have been submitted.</p>}<LinkPagination className="staff-pagination" page={page} totalPages={caseTotalPages} label="Ticket pages" hrefForPage={(targetPage) => staffLink("tickets", targetPage)} /></section> : null}
  </PortalShell>;
}
