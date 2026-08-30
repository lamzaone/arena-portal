import { randomUUID } from "node:crypto";

import Link from "next/link";
import {
  Database,
  Gift,
  KeyRound,
  LockKeyhole,
  RefreshCw,
  ShieldCheck,
  Sparkles,
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
  gameStorageConfigured,
  getExternalIdentityGroupMembershipIndex,
} from "@/lib/data/portal-repository";
import {
  resolvePlayerIdentities,
  type PlayerIdentityData,
} from "@/lib/player-identities";

import {
  ConfirmSubmitButton,
  GroupWorkspace,
  PermissionPicker,
  SearchableCatalogue,
  type GroupWorkspaceEntry,
  type PermissionCatalogueOption,
} from "./groups-controls";
import styles from "./groups-page.module.css";

type GroupsPageProps = {
  searchParams: Promise<{
    notice?: string;
    error?: string;
    group?: string;
    tab?: string;
  }>;
};

const groupAdminTabs = [
  { id: "connected", label: "Connected groups", icon: Database },
  { id: "create", label: "Create group", icon: ShieldCheck },
  { id: "membership", label: "Membership", icon: UsersRound },
  { id: "tags", label: "Chat tags", icon: Tags },
  { id: "permissions", label: "Permissions", icon: KeyRound },
  { id: "awards", label: "Direct awards", icon: Gift },
] as const;

type GroupAdminTab = (typeof groupAdminTabs)[number]["id"];

function groupAdminTab(value: string | undefined): GroupAdminTab {
  return groupAdminTabs.some((tab) => tab.id === value)
    ? (value as GroupAdminTab)
    : "connected";
}

function groupTabHref(tab: GroupAdminTab, selectedGroupId: number | null) {
  const search = new URLSearchParams({ tab });
  if (tab === "connected" && selectedGroupId !== null) {
    search.set("group", String(selectedGroupId));
  }
  return `/admin/groups?${search.toString()}`;
}

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

function groupWorkspaceEntries(groups: IdentityGroup[]): GroupWorkspaceEntry[] {
  return groups.map((group) => ({
    id: group.id,
    key: group.key,
    displayName: group.displayName,
    source: sourceLabel(group),
    enabled: group.enabled,
    accent: group.badgeColor,
    memberCount: group.memberCount,
    tagCount: group.tags.length,
    privilegeCount: group.privileges.length,
    rewardCount: group.rewards.filter((reward) => reward.enabled).length,
  }));
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
  const activeRewards = group.rewards.filter((reward) => reward.enabled);
  return (
    <article id={`group-${group.id}`} className="staff-group-card" data-enabled={group.enabled ? "true" : "false"}>
      <header className={styles.groupCardHeader}>
        <div className={styles.groupCardIdentity}>
          <div className={styles.cardTitle}>
            <h3>
              <IdentityGroupBadge group={group} />
            </h3>
            <span className={styles.sourceBadge} data-source={group.sourceType}>{sourceLabel(group)}</span>
            <span className={styles.statusBadge} data-enabled={group.enabled ? "true" : "false"}>
              {group.enabled ? "Enabled" : "Disabled"}
            </span>
          </div>
          <p>{group.description || sourceDescription}</p>
          <code className={styles.groupKey}>{group.key}</code>
        </div>
        <dl className={styles.groupCardStats} aria-label={`${group.displayName} relationship totals`}>
          <div><dt>Tags</dt><dd>{group.tags.length}</dd></div>
          <div><dt>Privileges</dt><dd>{group.privileges.length}</dd></div>
          <div><dt>Rewards</dt><dd>{activeRewards.length}</dd></div>
          <div><dt>Members</dt><dd>{group.memberCount}</dd></div>
        </dl>
      </header>

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

      <form className={`staff-management-form ${styles.groupPresentationForm}`} action="/api/admin/groups" method="post" aria-label={`Edit ${group.displayName} presentation`}>
        <MutationFields csrf={csrf} />
        <input type="hidden" name="groupId" value={group.id} />
        <div className={styles.presentationHeading}>
          <div>
            <span>{group.sourceType === "custom" ? "Group presentation" : "Portal-managed presentation"}</span>
            <strong>Player-facing identity</strong>
          </div>
          <p>{group.sourceType === "custom"
            ? "Edit how this custom group is identified throughout ARENA."
            : `These display settings do not change the read-only ${sourceLabel(group)} rank, permissions, capabilities, or membership.`}</p>
        </div>
        <fieldset className={styles.formSection}>
          <legend>Identity</legend>
          <p>Human-readable details shown across staff tools and player-facing group surfaces.</p>
          <div className={styles.formGrid}>
            <label>
              Display name
              <input name="displayName" defaultValue={group.displayName} maxLength={100} required />
            </label>
            <label>
              Description
              <input name="description" defaultValue={group.description ?? ""} maxLength={255} />
            </label>
          </div>
        </fieldset>
        <fieldset className={styles.formSection}>
          <legend>Badge presentation</legend>
          <p>Controls the reusable badge shown on profiles, tables, and compact player cards.</p>
          <div className={`${styles.formGrid} ${styles.badgeFormGrid}`}>
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
            <label className={styles.colorField}>
              Accent
              <input name="badgeColor" type="color" defaultValue={group.badgeColor} required />
            </label>
            <label className={styles.colorField}>
              Badge background
              <input name="badgeSoftColor" type="color" defaultValue={group.badgeSoftColor} required />
            </label>
          </div>
        </fieldset>
        <fieldset className={styles.formSection}>
          <legend>Visibility &amp; priority</legend>
          <p>Priority resolves which group leads when a player belongs to several identities.</p>
          <div className={styles.formGrid}>
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
              <small>Disabling revokes active account-bound rewards until the group is enabled again.</small>
            </label>
          </div>
        </fieldset>
        <div className={styles.formActions}>
          <button className="button button-primary" name="action" value="group-update" type="submit">
            Save presentation
          </button>
          {group.sourceType === "custom" ? (
            <ConfirmSubmitButton
              className="staff-danger-button"
              name="action"
              value="group-archive"
              confirmation={`Archive ${group.displayName}? All active memberships will be revoked and account-bound group rewards removed from player inventories.`}
            >
              Archive group
            </ConfirmSubmitButton>
          ) : null}
        </div>
      </form>

      <details className={styles.groupDetails} open>
        <summary>
          <span>{group.sourceType === "custom" ? "Group access, rewards & members" : "Portal-managed overrides"}</span>
          <small>{group.tags.length} tags · {group.privileges.length} privileges · {activeRewards.length} rewards</small>
        </summary>
        <div className={styles.managementGrid}>
          <section className={styles.managementSection} aria-labelledby={`group-${group.id}-tags-title`}>
            <div className={styles.managementHeading}>
              <span className={styles.managementIcon}><Tags aria-hidden="true" /></span>
              <div><h4 id={`group-${group.id}-tags-title`}>Chat presentation</h4><p>Attach a reusable GlobalChatTags definition.</p></div>
              <strong>{group.tags.length}</strong>
            </div>
            <div className={styles.managementBody}>
              <form className={`staff-management-form ${styles.compactManagementForm}`} action="/api/admin/groups" method="post">
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
                  Display order
                  <input name="sortOrder" type="number" min="0" max="65535" defaultValue="0" required />
                </label>
                <div className={styles.inlineActions}>
                  <button className="staff-unban-button" name="action" value="group-tag-attach" type="submit">Attach</button>
                  <button className="staff-danger-button" name="action" value="group-tag-detach" type="submit">Detach</button>
                </div>
              </form>
              <p className={styles.relationshipSummary}>{group.tags.length ? group.tags.map((tag) => tag.text).join(" · ") : "No chat tag attached."}</p>
            </div>
          </section>

          <section className={styles.managementSection} aria-labelledby={`group-${group.id}-access-title`}>
            <div className={styles.managementHeading}>
              <span className={styles.managementIcon}><KeyRound aria-hidden="true" /></span>
              <div><h4 id={`group-${group.id}-access-title`}>Additional access</h4><p>Portal-managed grants added on top of the source baseline.</p></div>
              <strong>{group.privileges.length}</strong>
            </div>
            <div className={styles.managementBody}>
              <form className={`staff-management-form ${styles.compactManagementForm}`} action="/api/admin/groups" method="post">
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
              ) : <p className={styles.relationshipSummary}>No additional portal-managed privileges.</p>}
            </div>
          </section>

          <section className={styles.managementSection} aria-labelledby={`group-${group.id}-rewards-title`}>
            <div className={styles.managementHeading}>
              <span className={styles.managementIcon}><Gift aria-hidden="true" /></span>
              <div><h4 id={`group-${group.id}-rewards-title`}>Catalogue rewards</h4><p>Items delivered while this group membership is active.</p></div>
              <strong>{activeRewards.length}</strong>
            </div>
            <div className={styles.managementBody}>
              <form className={`staff-management-form ${styles.compactManagementForm}`} action="/api/admin/groups" method="post">
                <MutationFields csrf={csrf} action="reward-add" />
                <input type="hidden" name="groupId" value={group.id} />
                <CatalogueSearchField
                  id={`group-${group.id}-reward-catalogue`}
                  name="catalogueId"
                  label="Find a reward item"
                  required
                />
                <div className={styles.rewardOptions}>
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
                </div>
                <button className="button button-primary" type="submit"><Gift aria-hidden="true" /> Add reward</button>
              </form>
              <div className={styles.relationshipList}>
                {activeRewards.map((reward) => (
                  <form className={styles.rewardRow} action="/api/admin/groups" method="post" key={reward.id}>
                    <MutationFields csrf={csrf} action="reward-retire" />
                    <input type="hidden" name="rewardId" value={reward.id} />
                    <input type="hidden" name="groupId" value={group.id} />
                    <span><strong>{reward.quantity}× {reward.catalogueName}</strong><small>{reward.tradePolicy === "tradable" ? "Tradable" : "Account-bound"}</small></span>
                    <ConfirmSubmitButton
                      className="staff-danger-button"
                      confirmation={reward.tradePolicy === "account_bound"
                        ? `Retire ${reward.catalogueName}? Account-bound awarded items will be removed from member inventories.`
                        : `Retire ${reward.catalogueName}? Existing tradable awards will remain, but no new awards will be delivered.`}
                    >
                      Retire
                    </ConfirmSubmitButton>
                  </form>
                ))}
                {!activeRewards.length ? <p className={styles.relationshipSummary}>No active catalogue rewards.</p> : null}
              </div>
            </div>
          </section>

          <section className={styles.managementSection} aria-labelledby={`group-${group.id}-members-title`}>
            <div className={styles.managementHeading}>
              <span className={styles.managementIcon}><UsersRound aria-hidden="true" /></span>
              <div><h4 id={`group-${group.id}-members-title`}>Membership</h4><p>{group.sourceType === "custom" ? "Portal-managed players currently assigned to this group." : `Owned by ${sourceLabel(group)} and read-only here.`}</p></div>
              <strong>{group.memberCount}</strong>
            </div>
            <div className={styles.managementBody}>
              {group.memberships.map((membership) => group.sourceType === "custom" ? (
                <form className={styles.memberRow} action="/api/admin/groups" method="post" key={membership.steamId}>
                  <MutationFields csrf={csrf} action="membership-remove" />
                  <input type="hidden" name="groupId" value={group.id} />
                  <input type="hidden" name="steamId" value={membership.steamId} />
                  <PlayerIdentity player={playerIdentities[membership.steamId] ?? { steamId: membership.steamId, displayName: membership.steamId, avatarUrl: null, presence: "unknown", profileThemeKey: null, identityGroups: [] }} variant="compact" />
                  <span>{membership.expiresAt ? `Until ${new Date(membership.expiresAt).toLocaleDateString()}` : "Permanent"}</span>
                  <button className="staff-danger-button" type="submit">Remove</button>
                </form>
              ) : (
                <div className={styles.memberRow} key={membership.steamId}>
                  <PlayerIdentity player={playerIdentities[membership.steamId] ?? { steamId: membership.steamId, displayName: membership.steamId, avatarUrl: null, presence: "unknown", profileThemeKey: null, identityGroups: [] }} variant="compact" />
                  <span>Active in {sourceLabel(group)}</span>
                  <Link className={styles.memberSourceLink} href={`/admin?tab=${group.sourceType === "vipcore" ? "vips" : "admins"}&page=1`}>
                    Manage
                  </Link>
                </div>
              ))}
              {!group.memberships.length ? (
                <p className={styles.relationshipSummary}>
                  {group.sourceType === "custom"
                    ? "No active custom members."
                    : `No active ${sourceLabel(group)} database memberships.`}
                </p>
              ) : null}
            </div>
          </section>
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

  const activeTab = groupAdminTab(params.tab);

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
  let externalMembershipError = false;
  const externalGroups = snapshot.groups.filter(
    (group) => group.sourceType !== "custom" && group.externalKey,
  );
  if (activeTab === "connected" && externalGroups.length && gameStorageConfigured()) {
    try {
      const memberships = await getExternalIdentityGroupMembershipIndex();
      for (const group of externalGroups) {
        const externalKey = group.externalKey;
        if (!externalKey) continue;
        const lookupKey = `${group.sourceType}\0${externalKey
          .normalize("NFKC")
          .trim()
          .toLocaleLowerCase("en-US")}`;
        const steamIds = memberships.get(lookupKey) ?? [];
        group.memberships = steamIds.map((steamId) => ({
          steamId,
          startsAt: new Date(0).toISOString(),
          expiresAt: null,
          grantReason: `Authoritative ${sourceLabel(group)} membership`,
        }));
        group.memberCount = group.memberships.length;
      }
    } catch {
      externalMembershipError = true;
    }
  } else if (activeTab === "connected" && externalGroups.length) {
    externalMembershipError = true;
  }
  const csrf = createAdminActionToken(session);
  const playerIdentities = await resolvePlayerIdentities(
    activeTab === "connected"
      ? snapshot.groups.flatMap((group) =>
          group.memberships.map((membership) => ({ steamId: membership.steamId })),
        )
      : activeTab === "awards"
        ? [
            ...snapshot.directTagGrants.map((grant) => ({ steamId: grant.steamId })),
            ...snapshot.directPrivilegeGrants.map((grant) => ({ steamId: grant.steamId })),
          ]
        : [],
  );
  const customGroupDefinitions = snapshot.groups.filter((group) => group.sourceType === "custom");
  // The connected registry is the canonical inventory of identities. Keep
  // runtime-only adapters visible even if their richer definition could not be
  // loaded yet; hiding them would also hide their authoritative memberships.
  const connectedGroups = snapshot.groups;
  const customGroups = customGroupDefinitions.filter((group) => group.enabled);
  const availablePermissions = privilegeOptions(snapshot.privileges);
  const notice = params.notice ? noticeMessages[params.notice] : null;
  const error = params.error ? errorMessages[params.error] ?? "The identity action could not be completed." : null;
  const selectedGroupId = /^\d+$/.test(params.group ?? "") ? Number(params.group) : null;

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
        <nav className={styles.sectionNav} aria-label="Group management sections">
          {groupAdminTabs.map((tab) => {
            const Icon = tab.icon;
            const active = tab.id === activeTab;
            return (
              <Link
                key={tab.id}
                href={groupTabHref(tab.id, selectedGroupId)}
                aria-label={tab.label}
                aria-current={active ? "page" : undefined}
                data-active={active ? "true" : "false"}
              >
                <Icon aria-hidden="true" />
                <span>{tab.label}</span>
              </Link>
            );
          })}
          <Link href="/admin/groups/perks" aria-label="VIP perks">
            <Sparkles aria-hidden="true" />
            <span>VIP perks</span>
          </Link>
        </nav>
        {notice ? <PortalToast message={notice} /> : null}
        {error ? <PortalToast variant="danger" message={error} /> : null}
        {storageError ? <PortalToast variant="danger" message="Identity storage is unavailable. Apply portal migrations through db/014_external_identity_catalogue.sql." /> : null}
        {externalMembershipError ? <PortalToast variant="danger" message="One or more live Admins.Core/VIPCore membership lists could not be read. Connected group counts may be incomplete until the game database is available." /> : null}

        {activeTab === "connected" ? <section id="connected-groups" className="staff-record-section" aria-labelledby="external-group-definitions-title">
          <div className="staff-section-heading">
            <div>
              <p className="tapped-kicker"><Database aria-hidden="true" /> Connected identities</p>
              <h2 id="external-group-definitions-title">All connected groups</h2>
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
            Admins.Core, VIPCore, and portal-created identities share one connected registry. External definitions and active memberships come from the live plug-in database after its optional JSON bootstrap; custom membership remains portal-managed.
          </p>
          <div className={styles.catalogueStatus} aria-label="External identity catalogue status">
            <div><span>Admins.Core groups</span><strong>{snapshot.catalogueStatus.adminsCoreDefinitions}</strong></div>
            <div><span>VIPCore groups</span><strong>{snapshot.catalogueStatus.vipCoreDefinitions}</strong></div>
            <div><span>Discovered permissions</span><strong>{snapshot.catalogueStatus.discoveredPrivileges}</strong></div>
          </div>
          {connectedGroups.length ? (
            <GroupWorkspace id="connected-groups-workspace" groups={groupWorkspaceEntries(connectedGroups)} initialSelectedId={selectedGroupId}>
              {connectedGroups.map((group) => (
                <GroupCard key={group.id} group={group} snapshot={snapshot} csrf={csrf} playerIdentities={playerIdentities} />
              ))}
            </GroupWorkspace>
          ) : (
            <p className="empty-copy">No connected definitions are available. Synchronize the catalogue after applying the identity migrations.</p>
          )}
        </section> : null}

        {activeTab === "create" ? <section id="create-group" className="staff-record-section">
          <div className="staff-section-heading"><div><p className="tapped-kicker"><ShieldCheck aria-hidden="true" /> Custom identity</p><h2>Create a group</h2></div><span>{customGroups.length} custom groups</span></div>
          <p className={styles.sectionIntro}>Start with a stable internal key, then define the player-facing identity and badge. Tags, access, rewards, and members are attached after creation.</p>
          <form className={`staff-management-form ${styles.createGroupForm}`} action="/api/admin/groups" method="post">
            <MutationFields csrf={csrf} action="group-create" />
            <fieldset className={styles.formSection}>
              <legend>Group identity</legend>
              <p>The stable key is permanent and used by integrations. The name and description can change later.</p>
              <div className={styles.formGrid}>
                <label>Stable key<input name="groupKey" pattern="[a-z0-9][a-z0-9._:-]{0,63}" maxLength={64} required placeholder="beta_testers" /><small>Lowercase letters, numbers, dots, dashes, colons, or underscores.</small></label>
                <label>Display name<input name="displayName" maxLength={100} required placeholder="Beta Testers" /></label>
                <label className={styles.fullField}>Description<input name="description" maxLength={255} placeholder="What this group represents" /></label>
              </div>
            </fieldset>
            <fieldset className={styles.formSection}>
              <legend>Badge presentation</legend>
              <p>These values feed the shared badge component across profiles, tables, and compact player cards.</p>
              <div className={`${styles.formGrid} ${styles.badgeFormGrid}`}>
                <label>Badge label<input name="badgeLabel" maxLength={32} required placeholder="BETA" /></label>
                <label>Badge icon<select name="badgeIconKey" defaultValue="shield">{identityGroupBadgeIconOptions.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}</select></label>
                <label className={styles.colorField}>Accent<input name="badgeColor" type="color" defaultValue="#f0b35a" required /></label>
                <label className={styles.colorField}>Badge background<input name="badgeSoftColor" type="color" defaultValue="#ffe4b8" required /></label>
              </div>
            </fieldset>
            <fieldset className={styles.formSection}>
              <legend>Profile ordering</legend>
              <p>Higher values take visual priority when one player belongs to multiple groups.</p>
              <div className={styles.formGrid}>
                <label>Profile priority<input name="profilePriority" type="number" min="-32768" max="32767" defaultValue="0" required /></label>
              </div>
            </fieldset>
            <div className={styles.formActions}><button className="button button-primary" type="submit">Create group</button></div>
          </form>
        </section> : null}

        {activeTab === "membership" ? <section id="membership" className="staff-record-section">
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
        </section> : null}

        {activeTab === "tags" ? <section id="tag-definitions" className="staff-record-section">
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
        </section> : null}

        {activeTab === "permissions" ? <section id="permission-catalogue" className="staff-record-section">
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
        </section> : null}

        {activeTab === "awards" ? <section id="direct-awards" className="staff-record-section">
          <div className="staff-section-heading"><div><p className="tapped-kicker"><KeyRound aria-hidden="true" /> Direct awards</p><h2>Player-specific tag or privilege</h2></div><span>Optional expiry</span></div>
          <p className={styles.sectionIntro}>Direct grants are exceptions for one player. Group-based access remains easier to audit and should be preferred whenever possible.</p>
          <div className={styles.directAwardGrid}>
            <form className={`staff-management-form ${styles.directAwardForm}`} action="/api/admin/groups" method="post" aria-labelledby="direct-tag-title">
              <MutationFields csrf={csrf} />
              <div className={styles.directAwardHeading}><Tags aria-hidden="true" /><div><strong id="direct-tag-title">Direct chat tag</strong><span>Grant or revoke one reusable tag.</span></div></div>
              <PlayerSearchField name="steamId" label="Player" mode="target" required includeSelf />
              <label>Chat tag<select name="tagId" required defaultValue=""><option value="" disabled>Choose a tag</option>{snapshot.tags.filter((tag) => tag.enabled).map((tag) => <option key={tag.id} value={tag.id}>{tag.text}</option>)}</select></label>
              <div className={styles.formGrid}>
                <label>Duration (minutes)<input name="durationMinutes" type="number" min="0" max="525600" defaultValue="0" required /><small>0 is permanent.</small></label>
                <label>Reason<input name="reason" maxLength={180} placeholder="Optional internal reason" /></label>
              </div>
              <div className={styles.inlineActions}>
                <button className="staff-unban-button" name="action" value="player-tag-grant" type="submit">Grant tag</button>
                <button className="staff-danger-button" name="action" value="player-tag-revoke" type="submit">Revoke tag</button>
              </div>
            </form>
            <form className={`staff-management-form ${styles.directAwardForm}`} action="/api/admin/groups" method="post" aria-labelledby="direct-privilege-title">
              <MutationFields csrf={csrf} />
              <div className={styles.directAwardHeading}><KeyRound aria-hidden="true" /><div><strong id="direct-privilege-title">Direct privilege</strong><span>Add or remove one scoped permission.</span></div></div>
              <PlayerSearchField name="steamId" label="Player" mode="target" required includeSelf />
              <PermissionPicker
                id="direct-player-permission-search"
                label="Player privilege"
                permissions={availablePermissions}
                required
              />
              <div className={styles.formGrid}>
                <label>Duration (minutes)<input name="durationMinutes" type="number" min="0" max="525600" defaultValue="0" required /><small>0 is permanent.</small></label>
                <label>Reason<input name="reason" maxLength={180} placeholder="Optional internal reason" /></label>
              </div>
              <div className={styles.inlineActions}>
                <button className="staff-unban-button" name="action" value="player-privilege-grant" type="submit">Grant privilege</button>
                <button className="staff-danger-button" name="action" value="player-privilege-revoke" type="submit">Revoke privilege</button>
              </div>
            </form>
          </div>
          <div className={styles.subsectionHeading}>
            <div><strong>Active direct awards</strong><span>Review and revoke player-specific exceptions.</span></div>
            <small>{snapshot.directTagGrants.length + snapshot.directPrivilegeGrants.length} active</small>
          </div>
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
        </section> : null}
    </PortalShell>
  );
}
