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

import { GroupAdminNav } from "@/components/group-admin-nav";
import {
  IdentityGroupBadge,
  identityGroupBadgeIconOptions,
} from "@/components/identity-group-badge";
import { PlayerSearchField } from "@/components/player-search-field";
import { PlayerIdentity } from "@/components/player-identity";
import { ThemedPlayerContainer } from "@/components/ui/themed-player-container";
import { CatalogueSearchField } from "@/components/economy/catalogue-search-field";
import { SignInRequired } from "@/components/sign-in-required";
import { StaffSubmenu } from "@/components/staff-submenu";
import { PortalToast } from "@/components/success-toast";
import { AdminPageHeader } from "@/components/ui/admin-page-header";
import { PortalShell } from "@/components/ui/portal-shell";
import { getAdminAccess } from "@/lib/admin/access";
import { configuredGameServerGuid } from "@/lib/admin/server-scope";
import { createAdminActionToken, getSession } from "@/lib/auth/session";
import {
  getIdentityAdminSnapshot,
  getIdentityVipGroupDefinitions,
  identityGroupStorageConfigured,
  type IdentityAdminSnapshot,
  type IdentityGroup,
  type IdentityPrivilege,
} from "@/lib/data/identity-groups";
import {
  getRuntimeExternalGroups,
  type RuntimeExternalGroup,
} from "@/lib/data/external-group-management";
import {
  gameStorageConfigured,
  getExternalIdentityGroupMembershipIndex,
  getStaffVips,
  type StaffVip,
} from "@/lib/data/portal-repository";
import {
  getStaffAdminMembershipSnapshot,
  type StaffAdminMembershipPlayer,
} from "@/lib/data/staff-admin-memberships";
import {
  getStaffVipServerScopes,
  getStaffVipMembershipSnapshot,
  type StaffVipServerScope,
  type StaffVipMembershipPlayer,
} from "@/lib/data/staff-vip-memberships";
import {
  getStaffMembershipInventorySummaries,
  type StaffMembershipInventorySummary,
} from "@/lib/data/staff-membership-inventory";
import {
  visibleVipGroups,
} from "./vip-group-visibility";
import { AssignmentsWorkspace } from "./assignments-workspace";
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
    assignment?: string;
  }>;
};

const groupAdminTabs = [
  "connected",
  "create",
  "membership",
  "tags",
  "permissions",
  "awards",
] as const;

type GroupAdminTab = (typeof groupAdminTabs)[number];

function groupAdminTab(value: string | undefined): GroupAdminTab {
  return groupAdminTabs.some((tab) => tab === value)
    ? (value as GroupAdminTab)
    : "connected";
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
  "membership-removed": "Arena group membership revoked.",
  "membership-extended": "Membership expiry extended from its existing end date.",
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
  "external-admin-group-created": "Admins.Core group created in Arena and linked to its portal presentation.",
  "external-admin-group-updated": "Admins.Core name, permissions, scope, and immunity saved.",
  "external-vip-group-created": "VIPCore group created in Arena and linked to its portal presentation.",
  "external-vip-group-updated": "VIPCore weight, status, and perk configuration saved.",
  "external-group-saved-sync-pending":
    "The runtime group was saved, but its portal adapter could not refresh yet. Use Synchronize catalogue after checking portal storage.",
  "admin-saved": "Admin assignment saved. Admins.Core will pick it up on its next database sync.",
  "admin-assigned": "Timed Admins.Core membership assigned.",
  "admin-extended": "Admin membership extended from its current expiry.",
  "admin-removed": "The exact Admin membership was removed.",
  "vip-saved": "VIP assignment saved. VIPCore will apply it when the player next connects.",
  "vip-removed": "VIP assignment removed.",
  "vip-extended": "VIP membership extended from its current expiry.",
  "vip-consolidated": "VIP conflict consolidated without deleting preserved native records.",
};

const errorMessages: Record<string, string> = {
  verification: "The form expired. Refresh this page and try again.",
  "founder-required": "Only the externally assigned Founder can manage identity groups.",
  founder_required: "Only the externally assigned Founder can manage identity groups.",
  invalid_input: "Review the submitted fields and try again.",
  group_exists: "A connected Arena group already uses that stable key.",
  group_not_found: "That group no longer exists.",
  custom_group_required: "Only custom groups accept direct Arena memberships here.",
  group_disabled: "That group is disabled and cannot receive new members.",
  membership_not_found: "That membership no longer exists or was already revoked.",
  membership_permanent: "That membership is already permanent and cannot be extended.",
  vip_conversion_required: "Use the source-aware VIP membership controls so tiers cannot stack.",
  external_group: "External Admins.Core and VIPCore adapters cannot be archived.",
  definition_not_found: "The selected tag or privilege is unavailable.",
  reward_exists: "That catalogue item is already an active reward for this group.",
  catalogue_not_found: "The selected catalogue item is unavailable.",
  reserved_privilege: "Founder and unrestricted wildcard authority are reserved.",
  request_replayed: "That action was already submitted. Refresh before trying again.",
  storage_unavailable: "The connected Arena group storage is not configured.",
  game_group_authority_storage:
    "Arena group authority is unavailable. Apply game migration 001 and check the game database connection.",
  game_group_authority_conflict:
    "The Arena group or scope locator conflicts with another authority record. Refresh, then inspect the connected group mapping.",
  catalogue_sync_failed: "The external group catalogue could not be imported. Check migration 014 and the configured JSON/JSONC paths.",
  external_group_details: "Review the runtime group fields and try again.",
  external_group_exists: "A runtime group already uses that name in this server scope.",
  external_group_not_found: "That runtime definition changed. Refresh the page before saving again.",
  founder_invariant: "Founder cannot be renamed, lose wildcard access, or be removed from this server.",
  "admin-permission": "Your current admin permissions cannot manage staff assignments.",
  "vip-permission": "Your current permissions cannot manage VIP assignments.",
  immunity: "You cannot act on an admin with higher immunity.",
  forbidden: "Your current staff assignment cannot perform that action.",
  steamid: "Choose a valid Steam player.",
  "admin-details": "Review the admin name, groups, server scope, and immunity.",
  "admin-membership-invalid": "That exact Admin membership reference, group, or duration is invalid.",
  "admin-membership-not-found": "That Admin membership no longer exists.",
  "admin-membership-permanent": "A permanent Admin membership cannot be extended.",
  "admin-membership-conflict": "That Admin membership already exists. Extend it instead.",
  "admin-membership-stale": "The Admin membership or connected definition changed. Refresh before trying again.",
  "admin-membership-founder": "Founder authority cannot be assigned, removed, or extended from this membership workflow.",
  "admin-membership-immunity": "That Admin group or player has higher immunity than your assignment.",
  "admin-game-storage": "The native Admins.Core database is unavailable.",
  "admin-portal-storage": "The legacy Admin membership projection is unavailable.",
  "vip-details": "Review the VIP tier, duration, and server scope.",
  "vip-membership-invalid": "That exact VIP membership reference or duration is invalid.",
  "vip-membership-not-found": "That VIP membership no longer exists.",
  "vip-membership-permanent": "A permanent VIP membership cannot be extended or replaced by timed access.",
  "vip-membership-conflict": "Resolve the conflicting VIP records before making that change.",
  "vip-membership-stale": "The VIP membership changed. Refresh before trying again.",
  "vip-conversion-storage": "Apply the Arena group-authority migration before managing canonical VIP memberships.",
  "vip-game-storage": "The native VIP database is unavailable.",
  "vip-portal-storage": "The VIP presentation or inventory projection is unavailable; Arena access was not moved to the portal database.",
  "game-storage": "The game database is not configured for group assignments.",
  game_storage: "The game database is not configured for runtime group definitions.",
  action: "That group assignment action is not supported.",
  database: "The identity action could not be saved. Check the Arena authority and portal commerce migrations.",
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

function sourceLabel(group: IdentityGroup) {
  if (group.sourceType === "admins_core") return "Admins.Core";
  if (group.sourceType === "vipcore") return "VIPCore";
  return "Arena custom";
}

function groupType(group: IdentityGroup): GroupWorkspaceEntry["groupType"] {
  if (group.sourceType === "admins_core") return "admin";
  if (group.sourceType === "vipcore") return "vip";
  return "custom";
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
    groupType: groupType(group),
    enabled: group.enabled,
    accent: group.badgeColor,
    memberCount: group.memberCount,
    tagCount: group.tags.length,
    privilegeCount: group.privileges.length,
    rewardCount: group.rewards.filter((reward) => reward.enabled).length,
  }));
}

function runtimeDefinitionForGroup(
  group: IdentityGroup,
  definitions: RuntimeExternalGroup[],
) {
  if (group.sourceType === "custom" || !group.externalKey) return null;
  const identity = group.externalKey.trim().toLocaleLowerCase("en-US");
  return definitions.find(
    (definition) =>
      definition.sourceType === group.sourceType &&
      definition.name.trim().toLocaleLowerCase("en-US") === identity,
  ) ?? null;
}

function RuntimeSourceEditor({
  group,
  definition,
  csrf,
}: {
  group: IdentityGroup;
  definition: RuntimeExternalGroup | null;
  csrf: string;
}) {
  if (group.sourceType === "custom") return null;
  if (!definition) {
    return (
      <aside className={styles.runtimeDefinitionMissing} role="status">
        <strong>No editable runtime definition</strong>
        <span>
          This name was discovered from a live assignment, but it does not have
          a matching row in the {sourceLabel(group)} definition table. Create
          the definition or remove the stale assignment.
        </span>
      </aside>
    );
  }

  if (definition.sourceType === "admins_core") {
    const founder = definition.name.trim().toLocaleLowerCase("en-US") === "founder";
    return (
      <form
        className={`staff-management-form ${styles.runtimeDefinitionForm}`}
        action="/api/admin/groups"
        method="post"
        aria-label={`Edit ${definition.name} Admins.Core definition`}
      >
        <MutationFields csrf={csrf} action="external-admin-group-update" />
        <input type="hidden" name="groupId" value={group.id} />
        <input type="hidden" name="runtimeRowId" value={definition.rowId} />
        <input type="hidden" name="previousName" value={definition.name} />
        <div className={styles.runtimeDefinitionHeading}>
          <div>
            <span className={styles.controlLabel}>Live Admins.Core definition</span>
            <strong>Authorization source</strong>
          </div>
          <p>Changes are read by Admins.Core from the database; JSON is only the initial seed.</p>
        </div>
        {founder ? (
          <p className={styles.invariantNotice}>
            Founder is the portal trust anchor. Its immunity and additional permissions remain editable,
            but its name, wildcard permission, and current server scope are enforced when saving.
          </p>
        ) : null}
        <div className={styles.runtimeDefinitionGrid}>
          <label>
            Runtime name
            <input name="name" defaultValue={definition.name} maxLength={100} required readOnly={founder} />
          </label>
          <label>
            Immunity
            <input name="immunity" type="number" min="0" max="1000000" defaultValue={definition.immunity} required />
          </label>
          <label className={styles.fullField}>
            Permissions
            <textarea name="permissions" rows={Math.min(12, Math.max(5, definition.permissions.length + 1))} defaultValue={definition.permissions.join("\n")} spellCheck={false} required={founder} />
            <small>One permission per line. Add or remove keys here; <code>*</code> remains mandatory for Founder.</small>
          </label>
          <label className={styles.fullField}>
            Server GUIDs
            <textarea name="serverGuids" rows={Math.min(6, Math.max(3, definition.serverGuids.length + 1))} defaultValue={definition.serverGuids.join("\n")} spellCheck={false} required />
            <small>One GUID per line. Removing this arena scope also removes the group from its connected catalogue.</small>
          </label>
        </div>
        <div className={styles.formActions}>
          <button className="button button-primary" type="submit">Save Admins.Core definition</button>
        </div>
      </form>
    );
  }

  const capabilityCount = Object.keys(definition.values).length;
  return (
    <form
      className={`staff-management-form ${styles.runtimeDefinitionForm}`}
      action="/api/admin/groups"
      method="post"
      aria-label={`Edit ${definition.name} VIPCore definition`}
    >
      <MutationFields csrf={csrf} action="external-vip-group-update" />
      <input type="hidden" name="groupId" value={group.id} />
      <input type="hidden" name="previousName" value={definition.name} />
      <div className={styles.runtimeDefinitionHeading}>
        <div>
          <span className={styles.controlLabel}>Live VIPCore definition</span>
          <strong>Tier perks &amp; priority</strong>
        </div>
        <p>{capabilityCount} configured perk{capabilityCount === 1 ? "" : "s"} in server scope {definition.serverId}.</p>
      </div>
      <div className={styles.runtimeDefinitionGrid}>
        <label>
          Runtime name
          <input name="name" defaultValue={definition.name} maxLength={64} required />
        </label>
        <label>
          Weight
          <input name="weight" type="number" min="0" max="1000000" defaultValue={definition.weight} required />
          <small>Higher weight wins if legacy data temporarily contains several tiers.</small>
        </label>
        <label>
          Runtime status
          <select name="runtimeEnabled" defaultValue={definition.enabled ? "true" : "false"}>
            <option value="true">Enabled</option>
            <option value="false">Disabled</option>
          </select>
        </label>
        <label className={styles.fullField}>
          Perks and configuration (JSON)
          <textarea
            className={styles.jsonEditor}
            name="valuesJson"
            rows={Math.min(28, Math.max(10, capabilityCount * 3))}
            defaultValue={JSON.stringify(definition.values, null, 2)}
            spellCheck={false}
            required
          />
          <small>Each top-level key is a VIPCore perk. Add a property to grant it; remove the property to revoke it from this tier.</small>
        </label>
      </div>
      <div className={styles.formActions}>
        <button className="button button-primary" type="submit">Save VIPCore definition</button>
      </div>
    </form>
  );
}

function GroupCard({
  group,
  snapshot,
  csrf,
  playerIdentities,
  runtimeDefinitions,
}: {
  group: IdentityGroup;
  snapshot: IdentityAdminSnapshot;
  csrf: string;
  playerIdentities: Readonly<Record<string, PlayerIdentityData>>;
  runtimeDefinitions: RuntimeExternalGroup[];
}) {
  const availablePermissions = privilegeOptions(snapshot.privileges);
  const externalDefinition = group.externalDefinition;
  const runtimeDefinition = runtimeDefinitionForGroup(group, runtimeDefinitions);
  const isFounderAdapter = group.sourceType === "admins_core" &&
    group.externalKey?.normalize("NFKC").trim().toLocaleLowerCase("en-US") === "founder";
  const sourceDescription = group.sourceType === "custom"
    ? `${group.memberCount} Arena member${group.memberCount === 1 ? "" : "s"}`
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
              <span className={styles.controlLabel}>Synchronized source summary</span>
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

      <RuntimeSourceEditor group={group} definition={runtimeDefinition} csrf={csrf} />

      <form className={`staff-management-form ${styles.groupPresentationForm}`} action="/api/admin/groups" method="post" aria-label={`Edit ${group.displayName} presentation`}>
        <MutationFields csrf={csrf} />
        <input type="hidden" name="groupId" value={group.id} />
        <div className={styles.presentationHeading}>
          <div>
              <span>{group.sourceType === "custom" ? "Group presentation" : "Portal presentation layer"}</span>
            <strong>Player-facing identity</strong>
          </div>
          <p>{group.sourceType === "custom"
            ? "Edit how this custom group is identified throughout ARENA."
            : `These display settings are the portal theme layer. Runtime ${sourceLabel(group)} access and perks are edited separately above.`}</p>
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
              {isFounderAdapter ? (
                <>
                  <input type="hidden" name="enabled" value="true" />
                  <select value="true" disabled aria-label="Founder protected status">
                    <option value="true">Enabled (protected)</option>
                  </select>
                  <small>Founder is the protected root adapter and cannot be disabled.</small>
                </>
              ) : group.sourceType === "vipcore" ? (
                <>
                  <input type="hidden" name="enabled" value={group.enabled ? "true" : "false"} />
                  <select value={group.enabled ? "true" : "false"} disabled aria-label="VIPCore runtime status">
                    <option value="true">Enabled by VIPCore</option>
                    <option value="false">Disabled by VIPCore</option>
                  </select>
                  <small>Runtime status is authoritative. Change it in the VIPCore definition editor above.</small>
                </>
              ) : (
                <>
                  <select name="enabled" defaultValue={group.enabled ? "true" : "false"}>
                    <option value="true">Enabled</option>
                    <option value="false">Disabled</option>
                  </select>
                  <small>Disabling revokes active account-bound rewards until the group is enabled again.</small>
                </>
              )}
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
          <span>{group.sourceType === "custom" ? "Group access, rewards & members" : "Portal presentation & inventory"}</span>
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
              <div><h4 id={`group-${group.id}-members-title`}>Membership</h4><p>{group.sourceType === "custom" ? "Arena-authoritative players currently assigned to this group." : `Combined ${sourceLabel(group)} Arena records. Exact scope actions stay separate.`}</p></div>
              <strong>{group.memberCount}</strong>
            </div>
            <div className={styles.managementBody}>
              {group.sourceType !== "custom" ? (
                <div className={styles.memberWorkspaceAction}>
                  <Link className={styles.memberSourceLink} href={`/admin/groups?tab=membership&assignment=${group.sourceType === "vipcore" ? "vip" : "admin"}#${group.sourceType === "vipcore" ? "vip-assignments" : "admin-assignments"}`}>
                    Add, extend, or remove exact memberships
                  </Link>
                </div>
              ) : null}
              {group.enabled &&
              (group.sourceType === "custom" ||
                (group.sourceType === "admins_core" &&
                  group.externalKey?.trim().toLocaleLowerCase("en-US") !== "founder")) ? (
                <form className={`staff-management-form ${styles.compactManagementForm} ${styles.memberAssignForm}`} action="/api/admin/groups" method="post">
                  <MutationFields csrf={csrf} action="membership-assign" />
                  <input type="hidden" name="groupId" value={group.id} />
                  <PlayerSearchField name="steamId" label="Add player" mode="target" required includeSelf />
                  <label>Duration (minutes)<input name="durationMinutes" type="number" min="0" max="525600" defaultValue="0" required /><small>0 is permanent.</small></label>
                  <label>Reason<input name="reason" maxLength={180} placeholder="Optional internal reason" /></label>
                  <button className="button button-primary" type="submit">Add member</button>
                </form>
              ) : null}
              {group.memberships.map((membership) => {
                const authoritativeExternal = membership.grantReason?.startsWith("Authoritative ") ?? false;
                const portalManaged = group.sourceType === "custom" ||
                  (group.sourceType === "admins_core" && !authoritativeExternal);
                return portalManaged ? (
                <ThemedPlayerContainer as="form" containerKind="management" ownerSteamId={membership.steamId} profileThemeKey={playerIdentities[membership.steamId]?.profileThemeKey} className={`${styles.memberRow} ${styles.editableMemberRow}`} action="/api/admin/groups" method="post" key={membership.membershipUuid ?? `${membership.steamId}:${membership.scopeId ?? "global"}`}>
                  <MutationFields csrf={csrf} />
                  <input type="hidden" name="groupId" value={group.id} />
                  <input type="hidden" name="steamId" value={membership.steamId} />
                  <input type="hidden" name="membershipUuid" value={membership.membershipUuid ?? ""} />
                  <input type="hidden" name="scopeId" value={membership.scopeId ?? ""} />
                  <input type="hidden" name="rowVersion" value={membership.rowVersion ?? ""} />
                  <PlayerIdentity player={playerIdentities[membership.steamId] ?? { steamId: membership.steamId, displayName: membership.steamId, avatarUrl: null, presence: "unknown", profileThemeKey: null, identityGroups: [] }} variant="compact" />
                  <span>{membership.expiresAt ? <><span>Expires</span><time dateTime={membership.expiresAt}>{formatSyncedAt(membership.expiresAt)}</time></> : "Permanent"}{membership.scopeName ? <> · {membership.scopeName}</> : null}</span>
                  {membership.expiresAt ? <input name="durationMinutes" type="number" min="1" max="525600" defaultValue="1440" aria-label={`Minutes to extend ${membership.steamId}`} /> : null}
                  {membership.expiresAt ? <button className="staff-unban-button" name="action" value="membership-extend" type="submit">Extend</button> : null}
                  <ConfirmSubmitButton className="staff-danger-button" name="action" value="membership-remove" confirmation={`Remove ${membership.steamId} from ${group.displayName}?`}>Remove</ConfirmSubmitButton>
                </ThemedPlayerContainer>
              ) : (
                <ThemedPlayerContainer containerKind="management" ownerSteamId={membership.steamId} profileThemeKey={playerIdentities[membership.steamId]?.profileThemeKey} className={styles.memberRow} key={membership.membershipUuid ?? `${membership.steamId}:${membership.scopeId ?? "external"}`}>
                  <PlayerIdentity player={playerIdentities[membership.steamId] ?? { steamId: membership.steamId, displayName: membership.steamId, avatarUrl: null, presence: "unknown", profileThemeKey: null, identityGroups: [] }} variant="compact" />
                  <span>{membership.expiresAt ? <>Expires <time dateTime={membership.expiresAt}>{formatSyncedAt(membership.expiresAt)}</time></> : `Active in ${sourceLabel(group)}`}</span>
                  <Link className={styles.memberSourceLink} href={`/admin/groups?tab=membership&assignment=${group.sourceType === "vipcore" ? "vip" : "admin"}#${group.sourceType === "vipcore" ? "vip-assignments" : "admin-assignments"}`}>
                    Manage
                  </Link>
                </ThemedPlayerContainer>
              );})}
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
    return <SignInRequired title="Identity groups" description="Sign in with your ARENA staff Steam account to review group assignments." />;
  }
  const access = await getAdminAccess(session.steamId);
  if (!access.isAdmin) {
    return (
      <PortalShell authenticated>
        <section className="staff-denied">
          <LockKeyhole aria-hidden="true" />
          <p className="tapped-kicker">Staff restricted</p>
          <h1>Identity group access denied.</h1>
          <p>An active Admins.Core staff assignment on this server is required to review groups.</p>
          <Link className="button button-secondary" href={`/players/${session.steamId}`}>Back to profile</Link>
        </section>
      </PortalShell>
    );
  }

  const requestedTab = groupAdminTab(params.tab);
  const activeTab = access.canManageGroups ? requestedTab : "membership";

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
  const needsIdentitySnapshot = access.canManageGroups || activeTab === "membership";
  let storageError = needsIdentitySnapshot && !identityGroupStorageConfigured();
  if (needsIdentitySnapshot && !storageError) {
    try {
      snapshot = await getIdentityAdminSnapshot();
    } catch {
      storageError = true;
    }
  }
  let runtimeExternalGroups: RuntimeExternalGroup[] = [];
  let runtimeDefinitionError = false;
  if (
    access.canManageGroups &&
    (activeTab === "connected" || activeTab === "create") &&
    gameStorageConfigured()
  ) {
    try {
      runtimeExternalGroups = await getRuntimeExternalGroups();
    } catch {
      runtimeDefinitionError = true;
    }
  } else if (
    access.canManageGroups &&
    (activeTab === "connected" || activeTab === "create")
  ) {
    runtimeDefinitionError = true;
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
        const combined = new Map(
          group.memberships.map((membership) => [membership.steamId, membership]),
        );
        for (const steamId of steamIds) {
          if (combined.has(steamId)) continue;
          combined.set(steamId, {
            steamId,
            startsAt: new Date(0).toISOString(),
            expiresAt: null,
            grantReason: `Authoritative ${sourceLabel(group)} membership`,
          });
        }
        group.memberships = [...combined.values()].sort((left, right) =>
          left.steamId.localeCompare(right.steamId),
        );
        group.memberCount = group.memberships.length;
      }
    } catch {
      externalMembershipError = true;
    }
  } else if (activeTab === "connected" && externalGroups.length) {
    externalMembershipError = true;
  }
  let adminAssignmentError = false;
  let vipAssignmentError = false;
  let vipScopeError = false;
  let membershipInventoryError = false;
  let staffVips: StaffVip[] = [];
  let sourceAwareAdminPlayers: StaffAdminMembershipPlayer[] = [];
  let sourceAwareVipPlayers: StaffVipMembershipPlayer[] = [];
  let staffVipServerScopes: StaffVipServerScope[] = [];
  let membershipInventorySummaries: Record<
    string,
    StaffMembershipInventorySummary
  > = {};
  let staffVipGroupDefinitions = snapshot.groups
    .filter((group) => group.sourceType === "vipcore")
    .map((group) => group.externalKey ?? group.displayName);
  if (activeTab === "membership") {
    if (gameStorageConfigured()) {
      try {
        const adminMembershipSnapshot = await getStaffAdminMembershipSnapshot();
        sourceAwareAdminPlayers = adminMembershipSnapshot.players;
      } catch {
        adminAssignmentError = true;
      }
      try {
        const vipMembershipSnapshot = await getStaffVipMembershipSnapshot();
        sourceAwareVipPlayers = vipMembershipSnapshot.players;
      } catch {
        vipAssignmentError = true;
      }
      const [vipsResult, vipDefinitionsResult, vipScopesResult] = await Promise.allSettled([
        getStaffVips(),
        getIdentityVipGroupDefinitions(),
        getStaffVipServerScopes(),
      ]);
      if (vipsResult.status === "fulfilled") staffVips = vipsResult.value;
      if (vipDefinitionsResult.status === "fulfilled" && vipDefinitionsResult.value.length) {
        staffVipGroupDefinitions = vipDefinitionsResult.value.map((group) => group.name);
      }
      if (vipScopesResult.status === "fulfilled") {
        staffVipServerScopes = vipScopesResult.value;
      } else {
        vipScopeError = true;
      }
    } else {
      adminAssignmentError = true;
      vipAssignmentError = true;
    }
  }
  if (activeTab === "membership") {
    try {
      membershipInventorySummaries = await getStaffMembershipInventorySummaries([
        ...sourceAwareAdminPlayers.map((player) => player.steamId),
        ...sourceAwareVipPlayers.map((player) => player.steamId),
        ...snapshot.groups
          .filter((group) => group.sourceType === "custom")
          .flatMap((group) => group.memberships.map((membership) => membership.steamId)),
      ]);
    } catch {
      membershipInventoryError = true;
    }
  }
  const vipGroups = visibleVipGroups(
    staffVipGroupDefinitions,
    staffVips,
  );
  const csrf = createAdminActionToken(session);
  const playerIdentities = await resolvePlayerIdentities(
    activeTab === "connected"
      ? snapshot.groups.flatMap((group) =>
          group.memberships.map((membership) => ({ steamId: membership.steamId })),
        )
        : activeTab === "membership"
          ? [
              ...sourceAwareAdminPlayers.map((player) => ({
                steamId: player.steamId,
                displayName: player.name,
              })),
              ...staffVips.map((vip) => ({
                steamId: vip.steamId,
                displayName: vip.name,
              })),
              ...sourceAwareVipPlayers.map((player) => ({
                steamId: player.steamId,
                displayName: player.name,
              })),
              ...snapshot.groups
                .filter((group) => group.sourceType === "custom")
                .flatMap((group) => group.memberships.map((membership) => ({
                  steamId: membership.steamId,
                }))),
            ]
          : activeTab === "awards"
        ? [
            ...snapshot.directTagGrants.map((grant) => ({ steamId: grant.steamId })),
            ...snapshot.directPrivilegeGrants.map((grant) => ({ steamId: grant.steamId })),
          ]
        : [],
  );
  // The connected registry is the canonical inventory of identities. Keep
  // runtime-only adapters visible even if their richer definition could not be
  // loaded yet; hiding them would also hide their authoritative memberships.
  const connectedGroups = snapshot.groups;
  const availablePermissions = privilegeOptions(snapshot.privileges);
  const notice = params.notice ? noticeMessages[params.notice] : null;
  const error = params.error ? errorMessages[params.error] ?? "The identity action could not be completed." : null;
  const selectedGroupId = /^\d+$/.test(params.group ?? "") ? Number(params.group) : null;
  const assignmentView = params.assignment === "admin" ||
    params.assignment === "vip" ||
    params.assignment === "custom"
    ? params.assignment
    : "all";

  return (
    <PortalShell authenticated className="staff-page">
        <AdminPageHeader
          id="group-management-title"
          title="Group management"
          description="Review Admin, VIP, and custom identities in one place; authorized staff can manage assignments and Founder-owned group configuration."
          access={access}
        />
        <StaffSubmenu access={access} active="groups" />
        <GroupAdminNav
          activeKey={activeTab}
          selectedGroupId={selectedGroupId}
          canManageGroups={access.canManageGroups}
        />
        {notice ? <PortalToast message={notice} /> : null}
        {error ? <PortalToast variant="danger" message={error} /> : null}
        {storageError ? <PortalToast variant="danger" message="Connected group storage is unavailable. Apply the Arena authority migration and the portal commerce bridge migration, then check both database connections." /> : null}
        {externalMembershipError ? <PortalToast variant="danger" message="One or more live Admins.Core/VIPCore membership lists could not be read. Connected group counts may be incomplete until the game database is available." /> : null}
        {adminAssignmentError ? <PortalToast variant="danger" message="Live Admins.Core assignments could not be read. Admin assignment actions are disabled, but available VIP records remain manageable." /> : null}
        {vipAssignmentError ? <PortalToast variant="danger" message="Live VIPCore assignments could not be read. VIP assignment actions are disabled, but available Admin records remain manageable." /> : null}
        {vipScopeError ? <PortalToast variant="danger" message="VIP server scopes could not be read. Existing exact VIP rows remain manageable, but new grants and moves require a live destination scope." /> : null}
        {membershipInventoryError ? <PortalToast variant="danger" message="VIP inventory context could not be loaded. Arena assignments remain manageable; open Inventories to inspect portal-owned items separately." /> : null}
        {runtimeDefinitionError ? <PortalToast variant="danger" message="Runtime Admins.Core/VIPCore definitions could not be read. Connected presentation remains visible, but native fields cannot be edited until the game database is available." /> : null}

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
            Admins.Core, VIPCore, and custom identities share one Arena-owned registry with explicit global and server scopes. The portal keeps only presentation, marketplace, reward, and inventory projections.
          </p>
          <div className={styles.catalogueStatus} aria-label="External identity catalogue status">
            <div><span>Admins.Core groups</span><strong>{snapshot.catalogueStatus.adminsCoreDefinitions}</strong></div>
            <div><span>VIPCore groups</span><strong>{snapshot.catalogueStatus.vipCoreDefinitions}</strong></div>
            <div><span>Discovered permissions</span><strong>{snapshot.catalogueStatus.discoveredPrivileges}</strong></div>
          </div>
          {connectedGroups.length ? (
            <GroupWorkspace id="connected-groups-workspace" groups={groupWorkspaceEntries(connectedGroups)} initialSelectedId={selectedGroupId}>
              {connectedGroups.map((group) => (
                <GroupCard key={group.id} group={group} snapshot={snapshot} csrf={csrf} playerIdentities={playerIdentities} runtimeDefinitions={runtimeExternalGroups} />
              ))}
            </GroupWorkspace>
          ) : (
            <p className="empty-copy">No connected definitions are available. Synchronize the catalogue after applying the identity migrations.</p>
          )}
        </section> : null}

        {activeTab === "create" ? <section id="create-group" className="staff-record-section">
          <div className="staff-section-heading"><div><p className="tapped-kicker"><ShieldCheck aria-hidden="true" /> Connected identity</p><h2>Create a group</h2></div><span>Custom · Admin · VIP</span></div>
          <p className={styles.sectionIntro}>Create an Arena custom identity or a real Admins.Core/VIPCore runtime definition. Access is stored in Arena; the portal theme and commerce layers are connected automatically.</p>
          <div className={styles.createTypeHeading}>
            <span className={styles.sourceBadge} data-source="custom">Arena custom</span>
            <strong>Custom Arena identity and presentation</strong>
          </div>
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
          <div className={styles.runtimeCreateGrid}>
            <form className={`staff-management-form ${styles.runtimeCreateForm}`} action="/api/admin/groups" method="post">
              <MutationFields csrf={csrf} action="external-admin-group-create" />
              <div className={styles.createTypeHeading}>
                <span className={styles.sourceBadge} data-source="admins_core">Admins.Core</span>
                <strong>New administrator group</strong>
              </div>
              <p>Creates an editable row in <code>groups</code>. Admins.Core reloads the database definition; the JSON file is not changed.</p>
              <div className={styles.runtimeDefinitionGrid}>
                <label>Runtime name<input name="name" maxLength={100} required placeholder="Community Manager" /></label>
                <label>Immunity<input name="immunity" type="number" min="0" max="1000000" defaultValue="10" required /></label>
                <label className={styles.fullField}>Permissions<textarea name="permissions" rows={7} defaultValue="admins.notify" spellCheck={false} /><small>One permission per line.</small></label>
                <label className={styles.fullField}>Server GUIDs<textarea name="serverGuids" rows={3} defaultValue={configuredGameServerGuid()} spellCheck={false} required /><small>One server GUID per line.</small></label>
              </div>
              <button className="button button-primary" type="submit">Create Admins.Core group</button>
            </form>

            <form className={`staff-management-form ${styles.runtimeCreateForm}`} action="/api/admin/groups" method="post">
              <MutationFields csrf={csrf} action="external-vip-group-create" />
              <div className={styles.createTypeHeading}>
                <span className={styles.sourceBadge} data-source="vipcore">VIPCore</span>
                <strong>New VIP tier</strong>
              </div>
              <p>Creates an editable row in <code>vip_group_definitions</code> for the configured arena scope.</p>
              <div className={styles.runtimeDefinitionGrid}>
                <label>Runtime name<input name="name" maxLength={64} required placeholder="PLATINUM" /></label>
                <label>Weight<input name="weight" type="number" min="0" max="1000000" defaultValue="0" required /></label>
                <label>Runtime status<select name="runtimeEnabled" defaultValue="true"><option value="true">Enabled</option><option value="false">Disabled</option></select></label>
                <label className={styles.fullField}>Perks and configuration (JSON)<textarea className={styles.jsonEditor} name="valuesJson" rows={12} defaultValue={'{\n  "vip.health": {\n    "Health": 110\n  }\n}'} spellCheck={false} required /><small>Each top-level property is a VIPCore feature key.</small></label>
              </div>
              <button className="button button-primary" type="submit">Create VIPCore group</button>
            </form>
          </div>
        </section> : null}

        {activeTab === "membership" ? <>
          <AssignmentsWorkspace
            csrf={csrf}
            identities={playerIdentities}
            adminPlayers={sourceAwareAdminPlayers}
            vipPlayers={sourceAwareVipPlayers}
            groups={snapshot.groups}
            vipGroups={vipGroups}
            vipScopes={staffVipServerScopes}
            inventorySummaries={membershipInventorySummaries}
            canManageAdmins={access.canManageAdmins && !adminAssignmentError}
            canManageGroups={access.canManageGroups && access.isFounder}
            canManageVips={access.canManageVips && !vipAssignmentError}
            assignmentView={assignmentView}
            requestKeySeed={randomUUID()}
          />
        </> : null}

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
              <ThemedPlayerContainer as="form" containerKind="management" ownerSteamId={grant.steamId} profileThemeKey={playerIdentities[grant.steamId]?.profileThemeKey} className="staff-admin-edit" action="/api/admin/groups" method="post" key={`${grant.steamId}:${grant.tag.id}`}>
                <MutationFields csrf={csrf} action="player-tag-revoke" />
                <input type="hidden" name="steamId" value={grant.steamId} />
                <input type="hidden" name="tagId" value={grant.tag.id} />
                <PlayerIdentity player={playerIdentities[grant.steamId] ?? { steamId: grant.steamId, displayName: grant.steamId, avatarUrl: null, presence: "unknown", profileThemeKey: null, identityGroups: [] }} variant="compact" />
                <strong>{grant.tag.text}</strong>
                <span>{grant.expiresAt ? `Until ${new Date(grant.expiresAt).toLocaleDateString()}` : "Permanent"}</span>
                <button className="staff-danger-button" type="submit">Revoke tag</button>
              </ThemedPlayerContainer>
            ))}
            {snapshot.directPrivilegeGrants.map((grant) => (
              <ThemedPlayerContainer as="form" containerKind="management" ownerSteamId={grant.steamId} profileThemeKey={playerIdentities[grant.steamId]?.profileThemeKey} className="staff-admin-edit" action="/api/admin/groups" method="post" key={`${grant.steamId}:${grant.privilege.id}`}>
                <MutationFields csrf={csrf} action="player-privilege-revoke" />
                <input type="hidden" name="steamId" value={grant.steamId} />
                <input type="hidden" name="privilegeId" value={grant.privilege.id} />
                <PlayerIdentity player={playerIdentities[grant.steamId] ?? { steamId: grant.steamId, displayName: grant.steamId, avatarUrl: null, presence: "unknown", profileThemeKey: null, identityGroups: [] }} variant="compact" />
                <strong>{grant.privilege.displayName}</strong>
                <span>{grant.expiresAt ? `Until ${new Date(grant.expiresAt).toLocaleDateString()}` : "Permanent"}</span>
                <button className="staff-danger-button" type="submit">Revoke privilege</button>
              </ThemedPlayerContainer>
            ))}
            {!snapshot.directTagGrants.length && !snapshot.directPrivilegeGrants.length ? (
              <p className="empty-copy">No active direct player tags or privileges.</p>
            ) : null}
          </div>
        </section> : null}
    </PortalShell>
  );
}
