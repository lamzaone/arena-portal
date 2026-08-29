import { randomUUID } from "node:crypto";

import Link from "next/link";
import {
  Database,
  Gift,
  KeyRound,
  LockKeyhole,
  RefreshCw,
  ShieldCheck,
  Tags,
  UsersRound,
} from "lucide-react";

import {
  IdentityGroupBadge,
  identityGroupBadgeIconOptions,
} from "@/components/identity-group-badge";
import { PlayerSearchField } from "@/components/player-search-field";
import { PlayerIdentity } from "@/components/player-identity";
import { CatalogueSearchField } from "@/components/economy/catalogue-search-field";
import { SignInRequired } from "@/components/sign-in-required";
import { StaffSubmenu } from "@/components/staff-submenu";
import { PortalToast } from "@/components/success-toast";
import { PortalShell } from "@/components/ui/portal-shell";
import { getAdminAccess } from "@/lib/admin/access";
import { createAdminActionToken, getSession } from "@/lib/auth/session";
import {
  getIdentityAdminSnapshot,
  identityGroupStorageConfigured,
  type IdentityAdminSnapshot,
  type IdentityGroup,
  type IdentityPrivilege,
} from "@/lib/data/identity-groups";
import {
  resolvePlayerIdentities,
  type PlayerIdentityData,
} from "@/lib/player-identities";

import {
  PermissionPicker,
  SearchableCatalogue,
  type PermissionCatalogueOption,
} from "./groups-controls";
import styles from "./groups-page.module.css";

type GroupsPageProps = {
  searchParams: Promise<{ notice?: string; error?: string }>;
};

const chatColors = [
  "[default]",
  "[white]",
  "[silver]",
  "[red]",
  "[lightred]",
  "[orange]",
  "[gold]",
  "[yellow]",
  "[lime]",
  "[green]",
  "[blue]",
  "[lightblue]",
  "[purple]",
  "[lightpurple]",
  "[teamcolor]",
];

const noticeMessages: Record<string, string> = {
  "group-created": "Custom group created.",
  "group-updated": "Group presentation saved.",
  "group-archived": "Custom group archived and its active memberships revoked.",
  "membership-assigned": "Group membership assigned and missing rewards delivered.",
  "membership-removed": "Custom group membership revoked.",
  "tag-created": "Chat tag created.",
  "tag-updated": "Chat tag saved.",
  "group-tag-attached": "Chat tag attached to the group.",
  "group-tag-detached": "Chat tag detached from the group.",
  "player-tag-granted": "Player tag granted.",
  "player-tag-revoked": "Player tag revoked.",
  "privilege-created": "Privilege definition created.",
  "privilege-updated": "Privilege definition saved.",
  "group-privilege-attached": "Privilege granted to the group.",
  "group-privilege-detached": "Privilege removed from the group.",
  "player-privilege-granted": "Direct player privilege granted.",
  "player-privilege-revoked": "Direct player privilege revoked.",
  "reward-added": "Group reward added and delivered to current custom members.",
  "reward-retired":
    "Group reward retired. Account-bound awarded items were removed from inventories; tradable awards were retained.",
  "catalogue-synced": "External group definitions and discovered permissions were synchronized.",
};

const errorMessages: Record<string, string> = {
  verification: "The form expired. Refresh this page and try again.",
  "founder-required": "Only the externally assigned Founder can manage identity groups.",
  founder_required: "Only the externally assigned Founder can manage identity groups.",
  invalid_input: "Review the submitted fields and try again.",
  group_not_found: "That group no longer exists.",
  custom_group_required: "Only custom groups accept portal-managed memberships.",
  external_group: "External Admins.Core and VIPCore adapters cannot be archived.",
  definition_not_found: "The selected tag or privilege is unavailable.",
  reward_exists: "That catalogue item is already an active reward for this group.",
  catalogue_not_found: "The selected catalogue item is unavailable.",
  reserved_privilege: "Founder and unrestricted wildcard authority are reserved.",
  request_replayed: "That action was already submitted. Refresh before trying again.",
  storage_unavailable: "The portal identity database is not configured.",
  catalogue_sync_failed: "The external group catalogue could not be imported. Check migration 014 and the configured JSON/JSONC paths.",
  database: "The identity action could not be saved. Apply migrations through 014 and check the portal database.",
};

function MutationFields({
  csrf,
  action,
}: {
  csrf: string;
  action?: string;
}) {
  return (
    <>
      <input type="hidden" name="csrf" value={csrf} />
      <input type="hidden" name="requestKey" value={randomUUID()} />
      {action ? <input type="hidden" name="action" value={action} /> : null}
    </>
  );
}

function GroupOption({ group }: { group: IdentityGroup }) {
  return (
    <option value={group.id}>
      {group.displayName} · {sourceLabel(group)}
    </option>
  );
}

function sourceLabel(group: IdentityGroup) {
  if (group.sourceType === "admins_core") return "Admins.Core";
  if (group.sourceType === "vipcore") return "VIPCore";
  return "Portal custom";
}

function formatSyncedAt(value: string | null | undefined) {
  if (!value) return "Not synchronized yet";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "Sync time unavailable";
  return new Intl.DateTimeFormat("en-GB", {
    dateStyle: "medium",
    timeStyle: "short",
    timeZone: "Europe/Bucharest",
  }).format(date);
}

function privilegeOptions(privileges: IdentityPrivilege[]): PermissionCatalogueOption[] {
  return privileges.filter((privilege) => privilege.enabled).map((privilege) => ({
    id: privilege.id,
    key: privilege.key,
    displayName: privilege.displayName,
    description: privilege.description,
    scope: privilege.scope,
    sensitive: privilege.sensitive,
  }));
}

function privilegeSourceSummary(privilege: IdentityPrivilege) {
  if (!privilege.sources.length) return "Portal-defined";
  return privilege.sources.map((source) => source.sourceReference
    ? `${source.sourceKind} · ${source.sourceReference}`
    : source.sourceKind).join(" · ");
}

function GroupCard({
  group,
  snapshot,
  csrf,
  playerIdentities,
}: {
  group: IdentityGroup;
  snapshot: IdentityAdminSnapshot;
  csrf: string;
  playerIdentities: Readonly<Record<string, PlayerIdentityData>>;
}) {
  const availablePermissions = privilegeOptions(snapshot.privileges);
  const externalDefinition = group.externalDefinition;
  const sourceDescription = group.sourceType === "custom"
    ? `${group.memberCount} portal member${group.memberCount === 1 ? "" : "s"}`
    : `External key · ${group.externalKey ?? "Unlinked"}`;
  return (
    <article className="staff-group-card" data-enabled={group.enabled ? "true" : "false"}>
      <div>
        <div className={styles.cardTitle}>
          <h3>
            <IdentityGroupBadge group={group} />
          </h3>
          <span className={styles.sourceBadge} data-source={group.sourceType}>{sourceLabel(group)}</span>
          <span className={styles.statusBadge} data-enabled={group.enabled ? "true" : "false"}>
            {group.enabled ? "Enabled" : "Disabled"}
          </span>
          <code className={styles.groupKey}>{group.key}</code>
        </div>
        <span>{sourceDescription}</span>
      </div>

      {externalDefinition ? (
        <section className={styles.externalDefinition} aria-labelledby={`group-${group.id}-source-title`}>
          <div className={styles.externalDefinitionHeading}>
            <div>
              <span className={styles.controlLabel}>Read-only source definition</span>
              <strong id={`group-${group.id}-source-title`}>{sourceLabel(group)} baseline</strong>
            </div>
            <span>Synced {formatSyncedAt(externalDefinition.syncedAt)}</span>
          </div>
          <dl className={styles.definitionFacts}>
            <div><dt>Rank weight</dt><dd>{externalDefinition.rankWeight}</dd></div>
            <div><dt>Source</dt><dd>{externalDefinition.sourceKind}</dd></div>
            <div><dt>Reference</dt><dd>{externalDefinition.sourceReference ?? "Portal discovery"}</dd></div>
          </dl>
          <div className={styles.definitionLists}>
            <div>
              <strong>Baseline permissions</strong>
              {externalDefinition.baselinePermissions.length ? (
                <ul aria-label={`${group.displayName} baseline permissions`}>
                  {externalDefinition.baselinePermissions.map((permission, index) => <li key={`${permission}:${index}`}><code>{permission}</code></li>)}
                </ul>
              ) : <p>No source permission reported.</p>}
            </div>
            <div>
              <strong>Capabilities</strong>
              {externalDefinition.capabilityKeys.length ? (
                <ul aria-label={`${group.displayName} capabilities`}>
                  {externalDefinition.capabilityKeys.map((capability, index) => <li key={`${capability}:${index}`}><code>{capability}</code></li>)}
                </ul>
              ) : <p>No source capability reported.</p>}
            </div>
          </div>
        </section>
      ) : group.sourceType !== "custom" ? (
        <p className={styles.externalMembershipNote}>
          This adapter has not received a source definition yet. Synchronize the external catalogue to discover its baseline access.
        </p>
      ) : null}

      <form className="staff-management-form" action="/api/admin/groups" method="post" aria-label={`Edit ${group.displayName} definition`}>
        <MutationFields csrf={csrf} />
        <input type="hidden" name="groupId" value={group.id} />
        <label>
          Display name
          <input name="displayName" defaultValue={group.displayName} maxLength={100} required />
        </label>
        <label>
          Description
          <input name="description" defaultValue={group.description ?? ""} maxLength={255} />
        </label>
        <label>
          Badge label
          <input name="badgeLabel" defaultValue={group.badgeLabel} maxLength={32} required />
        </label>
        <label>
          Badge icon
          <select name="badgeIconKey" defaultValue={group.badgeIconKey}>
            {identityGroupBadgeIconOptions.map((option) => (
              <option key={option.value} value={option.value}>{option.label}</option>
            ))}
          </select>
        </label>
        <label>
          Accent
          <input name="badgeColor" type="color" defaultValue={group.badgeColor} required />
        </label>
        <label>
          Badge background
          <input name="badgeSoftColor" type="color" defaultValue={group.badgeSoftColor} required />
        </label>
        <label>
          Profile priority
          <input name="profilePriority" type="number" min="-32768" max="32767" defaultValue={group.profilePriority} required />
        </label>
        <label>
          Status
          <select name="enabled" defaultValue={group.enabled ? "true" : "false"}>
            <option value="true">Enabled</option>
            <option value="false">Disabled</option>
          </select>
        </label>
        <button className="button button-primary" name="action" value="group-update" type="submit">
          Save group
        </button>
        {group.sourceType === "custom" ? (
          <button className="staff-danger-button" name="action" value="group-archive" type="submit">
            Archive
          </button>
        ) : null}
      </form>

      <details className={styles.groupDetails}>
        <summary>Tags, additional privileges, rewards{group.sourceType === "custom" ? ", and members" : ""}</summary>
        <div className="staff-group-list">
          <form className="staff-management-form" action="/api/admin/groups" method="post">
            <MutationFields csrf={csrf} />
            <input type="hidden" name="groupId" value={group.id} />
            <label>
              Chat tag
              <select name="tagId" required defaultValue="">
                <option value="" disabled>Choose a tag</option>
                {snapshot.tags.filter((tag) => tag.enabled).map((tag) => <option key={tag.id} value={tag.id}>{tag.text}</option>)}
              </select>
            </label>
            <label>
              Order
              <input name="sortOrder" type="number" min="0" max="65535" defaultValue="0" required />
            </label>
            <button className="staff-unban-button" name="action" value="group-tag-attach" type="submit">Attach tag</button>
            <button className="staff-danger-button" name="action" value="group-tag-detach" type="submit">Detach tag</button>
          </form>
          <p>{group.tags.length ? group.tags.map((tag) => tag.text).join(" · ") : "No group tag. Chat remains untagged."}</p>

          <form className={`staff-management-form ${styles.relationshipForm}`} action="/api/admin/groups" method="post">
            <MutationFields csrf={csrf} action="group-privilege-attach" />
            <input type="hidden" name="groupId" value={group.id} />
            <PermissionPicker
              id={`group-${group.id}-permission-search`}
              label="Additional privilege"
              permissions={availablePermissions}
              required
            />
            <button className="staff-unban-button" type="submit" disabled={!availablePermissions.length}>Grant privilege</button>
          </form>
          {group.privileges.length ? (
            <div className={styles.relationshipList} aria-label={`${group.displayName} additional privileges`}>
              {group.privileges.map((privilege) => (
                <form className={styles.relationshipRow} action="/api/admin/groups" method="post" key={privilege.id}>
                  <MutationFields csrf={csrf} action="group-privilege-detach" />
                  <input type="hidden" name="groupId" value={group.id} />
                  <input type="hidden" name="privilegeId" value={privilege.id} />
                  <span><strong>{privilege.displayName}</strong><code>{privilege.key}</code></span>
                  <span className={styles.scopeBadge} data-scope={privilege.scope}>{privilege.scope}</span>
                  <button className="staff-danger-button" type="submit">Remove</button>
                </form>
              ))}
            </div>
          ) : <p className={styles.externalMembershipNote}>No additional portal-managed privileges.</p>}

          <form className="staff-management-form" action="/api/admin/groups" method="post">
            <MutationFields csrf={csrf} action="reward-add" />
            <input type="hidden" name="groupId" value={group.id} />
            <CatalogueSearchField
              id={`group-${group.id}-reward-catalogue`}
              name="catalogueId"
              label="Find a reward item"
              required
            />
            <label>
              Quantity
              <input name="quantity" type="number" min="1" max="25" defaultValue="1" required />
            </label>
            <label>
              Trade policy
              <select name="tradePolicy" defaultValue="account_bound">
                <option value="account_bound">Account-bound</option>
                <option value="tradable">Tradable</option>
              </select>
            </label>
            <button className="button button-primary" type="submit"><Gift aria-hidden="true" /> Add reward</button>
          </form>
          {group.rewards.filter((reward) => reward.enabled).map((reward) => (
            <form className="staff-admin-edit" action="/api/admin/groups" method="post" key={reward.id}>
              <MutationFields csrf={csrf} action="reward-retire" />
              <input type="hidden" name="rewardId" value={reward.id} />
              <span>{reward.quantity}× {reward.catalogueName}</span>
              <span>{reward.tradePolicy === "tradable" ? "Tradable" : "Account-bound"}</span>
              <button className="staff-danger-button" type="submit">Retire</button>
            </form>
          ))}

          {group.sourceType === "custom" ? group.memberships.map((membership) => (
              <form className="staff-admin-edit" action="/api/admin/groups" method="post" key={membership.steamId}>
                <MutationFields csrf={csrf} action="membership-remove" />
                <input type="hidden" name="groupId" value={group.id} />
                <input type="hidden" name="steamId" value={membership.steamId} />
                <PlayerIdentity player={playerIdentities[membership.steamId] ?? { steamId: membership.steamId, displayName: membership.steamId, avatarUrl: null, presence: "unknown", profileThemeKey: null, identityGroups: [] }} variant="compact" />
                <span>{membership.expiresAt ? `Until ${new Date(membership.expiresAt).toLocaleDateString()}` : "Permanent"}</span>
                <button className="staff-danger-button" type="submit">Remove</button>
              </form>
            )) : (
              <p className={styles.externalMembershipNote}>
                Membership is owned by {sourceLabel(group)} under <code>{group.externalKey}</code>. Manage players from the existing Admins or VIPs staff tab.
              </p>
            )}
        </div>
      </details>
    </article>
  );
}

export default async function GroupsPage({ searchParams }: GroupsPageProps) {
  const [session, params] = await Promise.all([getSession(), searchParams]);
  if (!session) {
    return <SignInRequired title="Identity groups" description="Sign in with the Founder Steam account to manage groups, tags, privileges, and rewards." />;
  }
  const access = await getAdminAccess(session.steamId);
  if (!access.isAdmin || !access.isFounder || !access.canManageGroups) {
    return (
      <PortalShell authenticated>
        <section className="staff-denied">
          <LockKeyhole aria-hidden="true" />
          <p className="tapped-kicker">Founder restricted</p>
          <h1>Identity group access denied.</h1>
          <p>Only the exact Founder assignment from Admins.Core on this server can open this control surface.</p>
          <Link className="button button-secondary" href={`/players/${session.steamId}`}>Back to profile</Link>
        </section>
      </PortalShell>
    );
  }

  let snapshot: IdentityAdminSnapshot = {
    groups: [],
    tags: [],
    privileges: [],
    directTagGrants: [],
    directPrivilegeGrants: [],
    catalogueStatus: {
      adminsCoreDefinitions: 0,
      vipCoreDefinitions: 0,
      discoveredPrivileges: 0,
      lastSyncedAt: null,
    },
  };
  let storageError = !identityGroupStorageConfigured();
  if (!storageError) {
    try {
      snapshot = await getIdentityAdminSnapshot();
    } catch {
      storageError = true;
    }
  }
  const csrf = createAdminActionToken(session);
  const playerIdentities = await resolvePlayerIdentities([
    ...snapshot.groups.flatMap((group) => group.memberships.map((membership) => ({ steamId: membership.steamId }))),
    ...snapshot.directTagGrants.map((grant) => ({ steamId: grant.steamId })),
    ...snapshot.directPrivilegeGrants.map((grant) => ({ steamId: grant.steamId })),
  ]);
  const externalGroups = snapshot.groups.filter((group) => group.sourceType !== "custom");
  const customGroupDefinitions = snapshot.groups.filter((group) => group.sourceType === "custom");
  const customGroups = customGroupDefinitions.filter((group) => group.enabled);
  const availablePermissions = privilegeOptions(snapshot.privileges);
  const notice = params.notice ? noticeMessages[params.notice] : null;
  const error = params.error ? errorMessages[params.error] ?? "The identity action could not be completed." : null;

  return (
    <PortalShell authenticated className="staff-page">
        <section className="staff-hero">
          <div>
            <p className="tapped-kicker"><UsersRound aria-hidden="true" /> Identity control</p>
            <h1>Groups &amp;<br /><span>privileges.</span></h1>
            <p>Create custom identities, connect stable chat tags, assign tightly scoped privileges, and deliver catalogue-backed rewards.</p>
          </div>
          <aside className="staff-access-card">
            <span>ROOT AUTHORITY</span>
            <strong>FOUNDER</strong>
            <small>Anchored to Admins.Core · Portal groups cannot grant this role</small>
          </aside>
        </section>
        <StaffSubmenu access={access} active="groups" />
        {notice ? <PortalToast message={notice} /> : null}
        {error ? <PortalToast variant="danger" message={error} /> : null}
        {storageError ? <PortalToast variant="danger" message="Identity storage is unavailable. Apply portal migrations through db/014_external_identity_catalogue.sql." /> : null}

        <section className="staff-record-section" aria-labelledby="external-group-definitions-title">
          <div className="staff-section-heading">
            <div>
              <p className="tapped-kicker"><Database aria-hidden="true" /> Connected identities</p>
              <h2 id="external-group-definitions-title">Admins.Core &amp; VIPCore</h2>
            </div>
            <form className={styles.syncForm} action="/api/admin/groups" method="post">
              <MutationFields csrf={csrf} action="external-catalogue-sync" />
              <span>Last sync · {formatSyncedAt(snapshot.catalogueStatus.lastSyncedAt)}</span>
              <button className="staff-unban-button" type="submit" disabled={storageError}>
                <RefreshCw aria-hidden="true" /> Synchronize catalogue
              </button>
            </form>
          </div>
          <p className={styles.sectionIntro}>
            These database-backed adapters define how externally owned groups appear and what they receive in ARENA. Source rank, permissions, capabilities, and membership remain read-only; tags, badges, rewards, and additional grants are portal-managed.
          </p>
          <div className={styles.catalogueStatus} aria-label="External identity catalogue status">
            <div><span>Admins.Core groups</span><strong>{snapshot.catalogueStatus.adminsCoreDefinitions}</strong></div>
            <div><span>VIPCore groups</span><strong>{snapshot.catalogueStatus.vipCoreDefinitions}</strong></div>
            <div><span>Discovered permissions</span><strong>{snapshot.catalogueStatus.discoveredPrivileges}</strong></div>
          </div>
          {externalGroups.length ? externalGroups.map((group) => (
            <GroupCard key={group.id} group={group} snapshot={snapshot} csrf={csrf} playerIdentities={playerIdentities} />
          )) : (
            <p className="empty-copy">No external definitions are available. Synchronize the catalogue after applying the identity migrations.</p>
          )}
        </section>

        <section className="staff-record-section">
          <div className="staff-section-heading"><div><p className="tapped-kicker"><ShieldCheck aria-hidden="true" /> Custom identity</p><h2>Create a group</h2></div><span>{customGroups.length} custom groups</span></div>
          <form className="staff-management-form" action="/api/admin/groups" method="post">
            <MutationFields csrf={csrf} action="group-create" />
            <label>Stable key<input name="groupKey" pattern="[a-z0-9][a-z0-9._:-]{0,63}" maxLength={64} required placeholder="beta_testers" /></label>
            <label>Display name<input name="displayName" maxLength={100} required placeholder="Beta Testers" /></label>
            <label>Description<input name="description" maxLength={255} placeholder="What this group represents" /></label>
            <label>Badge label<input name="badgeLabel" maxLength={32} required placeholder="BETA" /></label>
            <label>Badge icon<select name="badgeIconKey" defaultValue="shield">{identityGroupBadgeIconOptions.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}</select></label>
            <label>Accent<input name="badgeColor" type="color" defaultValue="#f0b35a" required /></label>
            <label>Badge background<input name="badgeSoftColor" type="color" defaultValue="#ffe4b8" required /></label>
            <label>Profile priority<input name="profilePriority" type="number" min="-32768" max="32767" defaultValue="0" required /></label>
            <button className="button button-primary" type="submit">Create group</button>
          </form>
        </section>

        <section className="staff-record-section">
          <div className="staff-section-heading"><div><p className="tapped-kicker"><UsersRound aria-hidden="true" /> Membership</p><h2>Assign a custom group</h2></div><span>Founder audited</span></div>
          <form className="staff-management-form" action="/api/admin/groups" method="post">
            <MutationFields csrf={csrf} />
            <PlayerSearchField name="steamId" label="Player" mode="target" required includeSelf />
            <label>Custom group<select name="groupId" required defaultValue=""><option value="" disabled>Choose a group</option>{customGroups.map((group) => <GroupOption key={group.id} group={group} />)}</select></label>
            <label>Duration (minutes)<input name="durationMinutes" type="number" min="0" max="525600" defaultValue="0" required /><small>0 is permanent.</small></label>
            <label>Reason<input name="reason" maxLength={180} placeholder="Optional internal reason" /></label>
            <button className="button button-primary" name="action" value="membership-assign" type="submit">Assign group</button>
            <button className="staff-danger-button" name="action" value="membership-remove" type="submit">Remove group</button>
          </form>
        </section>

        <section className="staff-record-section">
          <div className="staff-section-heading"><div><p className="tapped-kicker"><Tags aria-hidden="true" /> GlobalChatTags</p><h2>Tag definitions</h2></div><span>{snapshot.tags.length} tags</span></div>
          <form className="staff-management-form" action="/api/admin/groups" method="post">
            <MutationFields csrf={csrf} action="tag-create" />
            <label>Stable key<input name="tagKey" pattern="[a-z0-9][a-z0-9._:-]{0,63}" required placeholder="group.beta" /></label>
            <label>Tag text<input name="tagText" maxLength={64} required placeholder="[BETA]" /></label>
            <label>Tag color<select name="colorToken" defaultValue="[gold]">{chatColors.map((color) => <option key={color}>{color}</option>)}</select></label>
            <label>Name color<select name="nameColorToken" defaultValue=""><option value="">Inherit</option>{chatColors.map((color) => <option key={color}>{color}</option>)}</select></label>
            <label>Message color<select name="messageColorToken" defaultValue=""><option value="">Inherit</option>{chatColors.map((color) => <option key={color}>{color}</option>)}</select></label>
            <button className="button button-primary" type="submit">Create tag</button>
          </form>
          <div className="staff-group-list">
            {snapshot.tags.map((tag) => <form className="staff-admin-edit" action="/api/admin/groups" method="post" key={tag.id}><MutationFields csrf={csrf} action="tag-update" /><input type="hidden" name="tagId" value={tag.id} /><input name="tagText" defaultValue={tag.text} maxLength={64} required aria-label={`Text for ${tag.key}`} /><select name="colorToken" defaultValue={tag.colorToken} aria-label={`Color for ${tag.key}`}>{chatColors.map((color) => <option key={color}>{color}</option>)}</select><select name="nameColorToken" defaultValue={tag.nameColorToken ?? ""} aria-label={`Name color for ${tag.key}`}><option value="">Inherit</option>{chatColors.map((color) => <option key={color}>{color}</option>)}</select><select name="messageColorToken" defaultValue={tag.messageColorToken ?? ""} aria-label={`Message color for ${tag.key}`}><option value="">Inherit</option>{chatColors.map((color) => <option key={color}>{color}</option>)}</select><select name="enabled" defaultValue={tag.enabled ? "true" : "false"} aria-label={`Status for ${tag.key}`}><option value="true">Enabled</option><option value="false">Disabled</option></select><button className="staff-unban-button" type="submit">Save</button></form>)}
          </div>
        </section>

        <section className="staff-record-section">
          <div className="staff-section-heading"><div><p className="tapped-kicker"><KeyRound aria-hidden="true" /> Authorization</p><h2>Permission catalogue</h2></div><span>{snapshot.privileges.length} definitions</span></div>
          <p className={styles.sectionIntro}>
            Synchronized game permissions and portal-defined privileges share one searchable catalogue. Discovery provenance is read-only; display details, sensitivity, status, and additive group or player grants remain Founder-managed.
          </p>
          <form className="staff-management-form" action="/api/admin/groups" method="post">
            <MutationFields csrf={csrf} action="privilege-create" />
            <label>Privilege key<input name="privilegeKey" pattern="[a-z0-9][a-z0-9.*:_-]{0,95}" maxLength={96} required placeholder="portal.showcase.manage" title="Lowercase letters, numbers, dots, colons, underscores, dashes, or wildcards" /></label>
            <label>Display name<input name="displayName" maxLength={100} required placeholder="Manage showcases" /></label>
            <label>Description<input name="description" maxLength={255} placeholder="What this privilege allows" /></label>
            <label>Scope<select name="scope" defaultValue="portal"><option value="portal">Portal</option><option value="game">Game server</option></select></label>
            <label>Sensitivity<select name="sensitive" defaultValue="false"><option value="false">Standard</option><option value="true">Sensitive</option></select></label>
            <button className="button button-primary" type="submit">Create privilege</button>
          </form>
          <SearchableCatalogue
            id="permission-catalogue-search"
            label="Search permission catalogue"
            placeholder="Permission key, name, scope, source, or description"
            emptyMessage="No permission definitions match that search."
            entries={snapshot.privileges.map((privilege) => ({
              id: String(privilege.id),
              searchText: [
                privilege.key,
                privilege.displayName,
                privilege.description ?? "",
                privilege.scope,
                privilege.sensitive ? "sensitive" : "standard",
                privilege.enabled ? "enabled" : "disabled",
                privilegeSourceSummary(privilege),
              ].join(" "),
              content: (
                <form className={`staff-admin-edit ${styles.privilegeEditor}`} action="/api/admin/groups" method="post">
                  <MutationFields csrf={csrf} action="privilege-update" />
                  <input type="hidden" name="privilegeId" value={privilege.id} />
                  <div className={styles.privilegeIdentity}>
                    <strong>{privilege.displayName}</strong>
                    <code>{privilege.key}</code>
                    <div className={styles.privilegeMeta}>
                      <span className={styles.scopeBadge} data-scope={privilege.scope}>{privilege.scope}</span>
                      {privilege.sensitive ? <span className={styles.sensitiveBadge}>Sensitive</span> : null}
                    </div>
                    <small>{privilegeSourceSummary(privilege)}</small>
                  </div>
                  <input name="displayName" defaultValue={privilege.displayName} maxLength={100} required aria-label={`Display name for ${privilege.key}`} />
                  <input name="description" defaultValue={privilege.description ?? ""} maxLength={255} aria-label={`Description for ${privilege.key}`} />
                  <select name="sensitive" defaultValue={privilege.sensitive ? "true" : "false"} aria-label={`Sensitivity for ${privilege.key}`}><option value="false">Standard</option><option value="true">Sensitive</option></select>
                  <select name="enabled" defaultValue={privilege.enabled ? "true" : "false"} aria-label={`Status for ${privilege.key}`}><option value="true">Enabled</option><option value="false">Disabled</option></select>
                  <button className="staff-unban-button" type="submit" aria-label={`Save ${privilege.key}`}>Save</button>
                </form>
              ),
            }))}
          />
        </section>

        <section className="staff-record-section">
          <div className="staff-section-heading"><div><p className="tapped-kicker"><KeyRound aria-hidden="true" /> Direct awards</p><h2>Player-specific tag or privilege</h2></div><span>Optional expiry</span></div>
          <form className="staff-management-form" action="/api/admin/groups" method="post">
            <MutationFields csrf={csrf} />
            <PlayerSearchField name="steamId" label="Player" mode="target" required includeSelf />
            <label>Chat tag<select name="tagId" defaultValue=""><option value="">No tag selected</option>{snapshot.tags.filter((tag) => tag.enabled).map((tag) => <option key={tag.id} value={tag.id}>{tag.text}</option>)}</select></label>
            <PermissionPicker
              id="direct-player-permission-search"
              label="Player privilege"
              permissions={availablePermissions}
            />
            <label>Duration (minutes)<input name="durationMinutes" type="number" min="0" max="525600" defaultValue="0" required /></label>
            <label>Reason<input name="reason" maxLength={180} placeholder="Optional internal reason" /></label>
            <button className="staff-unban-button" name="action" value="player-tag-grant" type="submit">Grant tag</button>
            <button className="staff-danger-button" name="action" value="player-tag-revoke" type="submit">Revoke tag</button>
            <button className="staff-unban-button" name="action" value="player-privilege-grant" type="submit">Grant privilege</button>
            <button className="staff-danger-button" name="action" value="player-privilege-revoke" type="submit">Revoke privilege</button>
          </form>
          <div className="staff-group-list">
            {snapshot.directTagGrants.map((grant) => (
              <form className="staff-admin-edit" action="/api/admin/groups" method="post" key={`${grant.steamId}:${grant.tag.id}`}>
                <MutationFields csrf={csrf} action="player-tag-revoke" />
                <input type="hidden" name="steamId" value={grant.steamId} />
                <input type="hidden" name="tagId" value={grant.tag.id} />
                <PlayerIdentity player={playerIdentities[grant.steamId] ?? { steamId: grant.steamId, displayName: grant.steamId, avatarUrl: null, presence: "unknown", profileThemeKey: null, identityGroups: [] }} variant="compact" />
                <strong>{grant.tag.text}</strong>
                <span>{grant.expiresAt ? `Until ${new Date(grant.expiresAt).toLocaleDateString()}` : "Permanent"}</span>
                <button className="staff-danger-button" type="submit">Revoke tag</button>
              </form>
            ))}
            {snapshot.directPrivilegeGrants.map((grant) => (
              <form className="staff-admin-edit" action="/api/admin/groups" method="post" key={`${grant.steamId}:${grant.privilege.id}`}>
                <MutationFields csrf={csrf} action="player-privilege-revoke" />
                <input type="hidden" name="steamId" value={grant.steamId} />
                <input type="hidden" name="privilegeId" value={grant.privilege.id} />
                <PlayerIdentity player={playerIdentities[grant.steamId] ?? { steamId: grant.steamId, displayName: grant.steamId, avatarUrl: null, presence: "unknown", profileThemeKey: null, identityGroups: [] }} variant="compact" />
                <strong>{grant.privilege.displayName}</strong>
                <span>{grant.expiresAt ? `Until ${new Date(grant.expiresAt).toLocaleDateString()}` : "Permanent"}</span>
                <button className="staff-danger-button" type="submit">Revoke privilege</button>
              </form>
            ))}
            {!snapshot.directTagGrants.length && !snapshot.directPrivilegeGrants.length ? (
              <p className="empty-copy">No active direct player tags or privileges.</p>
            ) : null}
          </div>
        </section>

        <section className="staff-record-section">
          <div className="staff-section-heading"><div><p className="tapped-kicker"><ShieldCheck aria-hidden="true" /> Registry</p><h2>Custom identity groups</h2></div><span>{customGroupDefinitions.length} definitions</span></div>
          {customGroupDefinitions.length ? customGroupDefinitions.map((group) => <GroupCard key={group.id} group={group} snapshot={snapshot} csrf={csrf} playerIdentities={playerIdentities} />) : <p className="empty-copy">No custom groups have been created yet.</p>}
        </section>
    </PortalShell>
  );
}
