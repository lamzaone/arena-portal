import { randomUUID } from "node:crypto";

import { LockKeyhole, PackagePlus, Settings2, ShieldCheck, Sparkles, UsersRound } from "lucide-react";

import { GroupAdminNav } from "@/components/group-admin-nav";
import { PlayerIdentity } from "@/components/player-identity";
import { PlayerSearchField } from "@/components/player-search-field";
import { SignInRequired } from "@/components/sign-in-required";
import { StaffSubmenu } from "@/components/staff-submenu";
import { PortalToast } from "@/components/success-toast";
import { PortalShell } from "@/components/ui/portal-shell";
import { LinkPagination } from "@/components/ui/link-pagination";
import { SectionNav } from "@/components/ui/section-nav";
import { getAdminAccess } from "@/lib/admin/access";
import { createAdminActionToken, getSession } from "@/lib/auth/session";
import { getVipPerkAdminSnapshot, vipPerkStorageConfigured, type VipPerkAdminSnapshot, type VipPerkDefinition } from "@/lib/data/vip-perks";
import { isMissingVipPerkStorageSchemaError } from "@/lib/data/vip-perk-storage-errors";
import { resolvePlayerIdentities } from "@/lib/player-identities";

import { ConfirmSubmitButton } from "../groups-controls";
import styles from "./vip-perk-admin.module.css";

const views = [
  { id: "definitions", label: "Definitions", icon: Settings2 },
  { id: "assign", label: "Assignments", icon: PackagePlus },
  { id: "active", label: "Active grants", icon: UsersRound },
] as const;
type View = (typeof views)[number]["id"];

function view(value: string | undefined): View {
  return views.some((entry) => entry.id === value) ? value as View : "definitions";
}

function pageNumber(value: string | undefined) {
  const parsed = Number.parseInt(value ?? "1", 10);
  return Number.isSafeInteger(parsed) && parsed > 0 ? parsed : 1;
}

function Fields({ csrf, action }: { csrf: string; action: string }) {
  return <><input type="hidden" name="csrf" value={csrf} /><input type="hidden" name="requestKey" value={randomUUID()} /><input type="hidden" name="action" value={action} /></>;
}

function PerkOptions({ perks }: { perks: VipPerkDefinition[] }) {
  return perks.filter((perk) => perk.enabled).map((perk) => <option key={perk.id} value={perk.id}>{perk.displayName} · {perk.key}</option>);
}

function configuration(value: unknown) {
  try { return JSON.stringify(value, null, 2); } catch { return "{}"; }
}

function expiry(value: string | null) {
  if (!value) return "Permanent";
  return new Intl.DateTimeFormat("en-GB", { dateStyle: "medium", timeStyle: "short", timeZone: "Europe/Bucharest" }).format(new Date(value));
}

const notices: Record<string, string> = {
  "perk-created": "VIP perk definition created.",
  "perk-updated": "VIP perk definition saved.",
  "player-granted": "VIP perk granted to the player.",
  "group-granted": "VIP perk attached to the custom group.",
  "grant-revoked": "VIP perk grant revoked.",
};

const errors: Record<string, string> = {
  verification: "The form expired. Refresh and try again.",
  "founder-required": "Only the externally assigned Founder can manage VIP perks.",
  founder_required: "Only the externally assigned Founder can manage VIP perks.",
  invalid_input: "Review the submitted fields and try again.",
  perk_exists: "A VIP perk already uses that key.",
  perk_not_found: "Choose an enabled VIP perk.",
  group_not_found: "Choose an enabled custom portal group.",
  grant_not_found: "That active grant no longer exists.",
  shop_grant_immutable: "Token-shop grants are protected from direct revocation until an audited refund workflow is available.",
  idempotency_conflict: "This request key was already used with different values. Refresh the page before trying again.",
  storage: "VIP perk storage is unavailable. Apply migration 019 and check the portal database.",
};

export default async function VipPerkAdminPage({ searchParams }: { searchParams: Promise<{ view?: string; page?: string; notice?: string; error?: string }> }) {
  const session = await getSession();
  if (!session) return <SignInRequired title="Founder sign-in required" description="Sign in with the externally assigned Founder account to manage VIP perks." />;
  const access = await getAdminAccess(session.steamId);
  if (!access.isFounder || !access.canManageGroups) {
    return <PortalShell authenticated><section className="catalog-empty"><LockKeyhole aria-hidden="true" /><h1>Founder access required.</h1><p>VIP perk definitions and assignments are protected group-management actions.</p></section></PortalShell>;
  }
  const params = await searchParams;
  const activeView = view(params.view);
  let snapshot: VipPerkAdminSnapshot = { perks: [], offers: [], customGroups: [], playerGrants: [], groupGrants: [], grantTotal: 0, grantPage: 1, grantPageSize: 50 };
  let storageError = !vipPerkStorageConfigured();
  let migrationNeeded = false;
  if (!storageError) {
    try {
      snapshot = await getVipPerkAdminSnapshot({ includeOffers: false, includeGrants: activeView === "active", grantPage: pageNumber(params.page), grantPageSize: 50 });
    } catch (error) {
      storageError = true;
      migrationNeeded = isMissingVipPerkStorageSchemaError(error);
      if (!migrationNeeded) console.error("VIP perk admin snapshot failed", error);
    }
  }
  const identities = await resolvePlayerIdentities(snapshot.playerGrants.flatMap((grant) => grant.steamId ? [{ steamId: grant.steamId }] : []));
  const csrf = createAdminActionToken(session);

  return (
    <PortalShell authenticated className={`staff-page ${styles.page}`}>
      <section className="staff-hero">
        <div><p className="tapped-kicker"><Sparkles aria-hidden="true" /> VIP feature control</p><h1>Individual<br /><span>perks.</span></h1><p>Define VIPCore features once and grant them to custom groups or individual players without manufacturing a VIP membership.</p></div>
        <aside className="staff-access-card"><span>RUNTIME CONTRACT</span><strong>{snapshot.perks.filter((perk) => perk.enabled).length} PERKS</strong><small>Portal grants · VIPCore feature keys · audited mutations</small></aside>
      </section>
      <StaffSubmenu access={access} active="groups" />
      <GroupAdminNav activeKey="perks" />
      <div className={styles.subsectionHeading}><Sparkles aria-hidden="true" /><div><span>VIP perks</span><strong>Choose a management page</strong></div></div>
      <SectionNav
        activeKey={activeView}
        ariaLabel="VIP perk management sections"
        dense
        items={views.map((entry) => ({
          key: entry.id,
          href: `/admin/groups/perks?view=${entry.id}`,
          label: entry.label,
          icon: entry.icon,
        }))}
      />
      {params.notice && notices[params.notice] ? <PortalToast message={notices[params.notice]} /> : null}
      {params.error ? <PortalToast variant="danger" message={errors[params.error] ?? "The VIP perk action could not be completed."} /> : null}
      {storageError ? <PortalToast variant="danger" message={migrationNeeded
        ? "VIP perk tables are missing or incomplete. Apply db/019_vip_perks.sql to the database configured by PORTAL_DATABASE_URL, then refresh this page."
        : "VIP perk storage is unavailable. Configure PORTAL_DATABASE_URL and apply db/019_vip_perks.sql to that database."} /> : null}

      {activeView === "definitions" ? <section className="staff-record-section">
        <div className="staff-section-heading"><div><p className="tapped-kicker"><Settings2 aria-hidden="true" /> Runtime definitions</p><h2>Perk catalogue</h2></div><span>{snapshot.perks.length} definitions</span></div>
        <p className={styles.intro}>The stable key must exactly match the feature registered by VIPCore. Configuration is the standalone default applied to direct and custom-group grants.</p>
        <form className={`staff-management-form ${styles.createForm}`} action="/api/admin/vip-perks" method="post">
          <Fields csrf={csrf} action="perk-create" />
          <label>Feature key<input name="perkKey" pattern="[a-z0-9][a-z0-9._:-]{0,95}" maxLength={96} placeholder="vip.feature" required /></label>
          <label>Display name<input name="displayName" maxLength={100} required /></label>
          <label>Category<input name="category" pattern="[a-z0-9][a-z0-9_-]{0,47}" maxLength={48} defaultValue="gameplay" required /></label>
          <label className={styles.wide}>Description<input name="description" maxLength={255} /></label>
          <label className={styles.wide}>Default plugin configuration<textarea name="configuration" rows={4} defaultValue="{}" spellCheck={false} required /><small>Valid JSON. Use the exact shape expected by the registered feature module.</small></label>
          <button className="button button-primary" type="submit"><Sparkles aria-hidden="true" /> Create definition</button>
        </form>
        <div className={styles.definitionList}>
          {snapshot.perks.map((perk) => <details className={styles.definition} key={perk.id}><summary><span><strong>{perk.displayName}</strong><code>{perk.key}</code></span><span className={styles.status} data-enabled={perk.enabled ? "true" : "false"}>{perk.enabled ? "Enabled" : "Disabled"}</span></summary><form className="staff-management-form" action="/api/admin/vip-perks" method="post"><Fields csrf={csrf} action="perk-update" /><input type="hidden" name="perkId" value={perk.id} /><label>Display name<input name="displayName" maxLength={100} defaultValue={perk.displayName} required /></label><label>Category<input name="category" pattern="[a-z0-9][a-z0-9_-]{0,47}" maxLength={48} defaultValue={perk.category} required /></label><label>Status<select name="enabled" defaultValue={perk.enabled ? "true" : "false"}><option value="true">Enabled</option><option value="false">Disabled</option></select></label><label className={styles.wide}>Description<input name="description" maxLength={255} defaultValue={perk.description ?? ""} /></label><label className={styles.wide}>Default plugin configuration<textarea name="configuration" rows={6} defaultValue={configuration(perk.configuration)} spellCheck={false} required /></label><button className="button button-primary" type="submit">Save definition</button></form></details>)}
        </div>
      </section> : null}

      {activeView === "assign" ? <section className="staff-record-section">
        <div className="staff-section-heading"><div><p className="tapped-kicker"><PackagePlus aria-hidden="true" /> Timed assignment</p><h2>Grant a perk</h2></div><span>0 minutes is permanent</span></div>
        <p className={styles.intro}>Direct grants take precedence over custom-group configuration. An optional override lets one grant use different plugin settings without duplicating the definition.</p>
        <div className={styles.assignGrid}>
          <form className="staff-management-form" action="/api/admin/vip-perks" method="post"><Fields csrf={csrf} action="player-grant" /><div className={styles.formTitle}><UsersRound aria-hidden="true" /><div><strong>Individual player</strong><span>One account, independent of VIP tier.</span></div></div><PlayerSearchField name="steamId" label="Player" mode="target" required includeSelf /><label>VIP perk<select name="perkId" defaultValue="" required><option value="" disabled>Choose a perk</option><PerkOptions perks={snapshot.perks} /></select></label><label>Duration (minutes)<input name="durationMinutes" type="number" min="0" max="525600" defaultValue="43200" required /><small>Examples: 1440 = 1 day, 43200 = 30 days, 0 = permanent.</small></label><label>Reason<input name="reason" maxLength={180} /></label><label>Configuration override<textarea name="configurationOverride" rows={4} placeholder="Leave empty to use the perk default" spellCheck={false} /></label><button className="button button-primary" type="submit">Grant to player</button></form>
          <form className="staff-management-form" action="/api/admin/vip-perks" method="post"><Fields csrf={csrf} action="group-grant" /><div className={styles.formTitle}><ShieldCheck aria-hidden="true" /><div><strong>Custom group</strong><span>Effective for every active custom-group member.</span></div></div><label>Custom group<select name="groupId" defaultValue="" required><option value="" disabled>Choose a custom group</option>{snapshot.customGroups.filter((group) => group.enabled).map((group) => <option key={group.id} value={group.id}>{group.displayName} · {group.key}</option>)}</select></label><label>VIP perk<select name="perkId" defaultValue="" required><option value="" disabled>Choose a perk</option><PerkOptions perks={snapshot.perks} /></select></label><label>Grant duration (minutes)<input name="durationMinutes" type="number" min="0" max="525600" defaultValue="0" required /><small>The member must also have an active group membership.</small></label><label>Reason<input name="reason" maxLength={180} /></label><label>Configuration override<textarea name="configurationOverride" rows={4} placeholder="Leave empty to use the perk default" spellCheck={false} /></label><button className="button button-primary" type="submit">Attach to group</button></form>
        </div>
      </section> : null}

      {activeView === "active" ? <section className="staff-record-section">
        <div className="staff-section-heading"><div><p className="tapped-kicker"><UsersRound aria-hidden="true" /> Effective sources</p><h2>Active direct grants</h2></div><span>{snapshot.grantTotal} grants</span></div>
        <p className={styles.intro}>This is the source ledger, so overlapping grants remain visible. The public VIP perks roster combines them into one effective expiration per player and perk.</p>
        <div className={styles.grantList}>
          {snapshot.playerGrants.map((grant) => {
            const player = <PlayerIdentity player={identities[grant.steamId ?? ""] ?? { steamId: grant.steamId ?? "", displayName: grant.steamId ?? "Unknown", avatarUrl: null, presence: "unknown", profileThemeKey: null, identityGroups: [] }} variant="compact" />;
            const description = <div><strong>{grant.perkName}</strong><span>{grant.sourceType === "shop" ? "Token shop" : "Staff grant"} · {expiry(grant.expiresAt)}</span></div>;
            if (grant.sourceType === "shop") {
              return <div className={styles.grantRow} key={`player:${grant.id}`}>{player}{description}<span className={styles.protectedGrant} title="Token-shop grants require an audited refund workflow before they can be revoked"><LockKeyhole aria-hidden="true" /> Protected purchase</span></div>;
            }
            return <form className={styles.grantRow} action="/api/admin/vip-perks" method="post" key={`player:${grant.id}`}><Fields csrf={csrf} action="grant-revoke" /><input type="hidden" name="grantType" value="player" /><input type="hidden" name="grantId" value={grant.id} />{player}{description}<ConfirmSubmitButton className="staff-danger-button" confirmation={`Revoke ${grant.perkName} from ${grant.steamId}?`}>Revoke</ConfirmSubmitButton></form>;
          })}
          {snapshot.groupGrants.map((grant) => <form className={styles.grantRow} action="/api/admin/vip-perks" method="post" key={`group:${grant.id}`}><Fields csrf={csrf} action="grant-revoke" /><input type="hidden" name="grantType" value="group" /><input type="hidden" name="grantId" value={grant.id} /><span className={styles.groupIdentity}><ShieldCheck aria-hidden="true" /><span><strong>{grant.groupName}</strong><small>Custom group</small></span></span><div><strong>{grant.perkName}</strong><span>Group grant · {expiry(grant.expiresAt)}</span></div><ConfirmSubmitButton className="staff-danger-button" confirmation={`Revoke ${grant.perkName} from ${grant.groupName ?? "this custom group"}?`}>Revoke</ConfirmSubmitButton></form>)}
          {!snapshot.playerGrants.length && !snapshot.groupGrants.length ? <p className="empty-copy">No active standalone perk grants.</p> : null}
        </div>
        {snapshot.grantTotal > snapshot.grantPageSize ? <LinkPagination className={styles.pagination} page={snapshot.grantPage} totalPages={Math.ceil(snapshot.grantTotal / snapshot.grantPageSize)} label="Active VIP perk grant pages" hrefForPage={(page) => `/admin/groups/perks?view=active&page=${page}`} /> : null}
      </section> : null}
    </PortalShell>
  );
}
