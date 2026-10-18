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
  Trash2,
  UsersRound,
} from "lucide-react";

import { GroupAdminNav } from "@/components/group-admin-nav";
import {
  IdentityGroupBadge,
} from "@/components/identity-group-badge";
import { GroupBadgeSymbolPicker } from "@/components/group-badge-symbol-picker";
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
import { groupWorkspaceTab, groupSourceForTab } from "@/lib/admin/group-workspace";
import { GroupTagCreationFields } from "./group-tag-creation-fields";
import { CustomPerkWorkspace } from "./perks/custom-perk-workspace";
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
import { TagColorFields } from "./tag-color-fields";
import tagStyles from "./tag-color-fields.module.css";

type GroupsPageProps = {
  searchParams: Promise<{
    notice?: string;
    error?: string;
    group?: string;
    tab?: string;
    assignment?: string;
    player?: string;
    view?: string;
    page?: string;
  }>;
};

const noticeMessages: Record<string, string> = {
  "group-created-tag-pending": "Group created. Its tag could not be assigned. Open the group chat settings to create and assign it; do not recreate the group.",
  "external-group-created-tag-pending": "Runtime group created. Synchronize the catalogue, then open its chat settings to create and assign the tag; do not recreate the group.",
  "group-created": "Custom group created.",
  "group-updated": "Group presentation saved.",
  "group-archived": "Custom group archived and its active memberships revoked.",
  "membership-assigned": "Group membership assigned and missing rewards delivered.",
  "membership-removed": "Arena group membership revoked.",
  "membership-edited": "Membership expiry updated.",
  "admin-edited": "Admin membership updated.",
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
  "external-admin-group-deleted": "Admin group deleted and its memberships revoked. Unrelated assignments and direct permissions were preserved.",
  "external-admin-group-created": "Admins.Core group created in Arena and linked to its portal presentation.",
  "external-admin-group-updated": "Admins.Core name, permissions, scope, and immunity saved.",
  "external-vip-group-created": "VIPCore group created in Arena and linked to its portal presentation.",
  "external-vip-group-updated": "VIPCore weight, status, and perk configuration saved.",
  "external-vip-group-deleted": "VIPCore group removed from the Arena server.",
  "external-group-delete-sync-pending":
    "The runtime definition was removed, but its portal presentation has not refreshed yet. Use Synchronize catalogue to finish cleanup.",
  "external-group-saved-sync-pending":
    "The runtime group was saved, but its portal adapter could not refresh yet. Use Synchronize catalogue after checking portal storage.",
  "admin-saved": "Admin assignment saved. Admins.Core will pick it up on its next database sync.",
  "admin-assigned": "Admin membership assigned. Admins.Core will refresh live permissions within a few seconds.",
  "admin-extended": "Admin membership extended from its current expiry.",
  "admin-removed": "The exact Admin membership was removed.",
  "vip-saved": "VIP assignment saved. VIPCore will apply it when the player next connects.",
  "vip-removed": "VIP assignment removed.",
  "vip-extended": "VIP membership extended from its current expiry.",
  "vip-consolidated": "VIP conflict consolidated without deleting preserved native records.",
};

const errorMessages: Record<string, string> = {
  verification: "The form expired. Refresh this page and try again.",
  badge_symbol_invalid: "Choose a valid PNG, WebP or JPG symbol, up to 256 KB and 512 × 512 pixels.",
  badge_symbol_storage: "Custom symbol uploads are not enabled on this installation yet. Your group has not been changed.",
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
  rich_chat_migration_required: "Apply arena-portal/db/033_rich_chat_tag_styles.sql to the Portal database before creating or saving chat tags.",
  independent_chat_effects_migration_required: "Apply arena-portal/db/034_independent_chat_effects.sql to save independent effect settings. Your existing settings have been kept.",
  storage_unavailable: "The connected Arena group storage is not configured.",
  game_group_authority_storage:
    "Arena group authority is unavailable. Apply game migration 001 and check the game database connection.",
  game_group_authority_conflict:
    "The Arena group or scope locator conflicts with another authority record. Refresh, then inspect the connected group mapping.",
  catalogue_sync_failed: "The external group catalogue could not be imported. Check migration 014 and the configured JSON/JSONC paths.",
  external_group_in_use: "This group still has active memberships or pending membership operations. Resolve them before deleting its definition.",
  external_group_scope_conflict: "This definition cannot be matched to one unambiguous group and scope. Synchronize the catalogue and resolve duplicate or mixed scope mappings before deleting it.",
  external_group_details: "Review the runtime group fields and try again.",
  external_group_exists: "A runtime group already uses that name in this server scope.",
  external_group_not_found: "That runtime definition changed. Refresh the page before saving again.",
  founder_invariant: "Founder cannot be renamed, lose wildcard access, or be removed from this server.",
  "admin-permission": "Your current admin permissions cannot manage staff assignments.",
  "vip-permission": "Your current permissions cannot manage VIP assignments.",
  immunity: "You cannot act on an admin with higher immunity.",
  forbidden: "Your current staff assignment cannot perform that action.",
  steamid: "Choose a valid Steam player.",
  "admin-details": "Review the Admin group and duration. Use 0 minutes for permanent access.",
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
        <MutationFields csrf={csrf} />
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
          <button className="button button-primary" type="submit" name="action" value="external-admin-group-update">Save Admins.Core definition</button>
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
      <MutationFields csrf={csrf} />
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
        <button className="button button-primary" name="action" value="external-vip-group-update" type="submit">Save VIPCore definition</button>
      </div>
    </form>
  );
}

function GroupDeleteControl({ group, definition, csrf }: {
  group: IdentityGroup; definition: RuntimeExternalGroup | null; csrf: string;
}) {
  const type = groupType(group);
  const label = type === "admin" ? "Admin" : type === "vip" ? "VIP" : "Custom";
  if (group.sourceType === "admins_core" && [group.externalKey, definition?.name].some(name => name?.normalize("NFKC").trim().toLowerCase() === "founder")) {
    return <span className={styles.groupDeleteUnavailable}>Founder is protected.</span>;
  }
  if (type !== "custom" && !definition) {
    return <span className={styles.groupDeleteUnavailable}>Synchronize the runtime definition to delete this group.</span>;
  }
  const action = type === "custom" ? "group-archive" : type === "admin" ? "external-admin-group-delete" : "external-vip-group-delete";
  const confirmation = type === "custom"
    ? `Delete ${group.displayName}? This archives the custom group, revokes its memberships and removes account-bound rewards. Its history is retained under disabled groups.`
    : type === "admin"
      ? `Delete ${definition!.name} from Admins.Core? This removes native assignments and revokes Arena memberships in every scope bound to this definition. Recreating the group will not restore those memberships.`
      : `Delete ${definition!.name} from VIPCore? This removes its live tier definition and disables its marketplace offers. Active memberships must be removed first.`;
  return <form className={styles.groupDeleteControl} action="/api/admin/groups" method="post" aria-label={`Delete ${group.displayName} group`}>
    <MutationFields csrf={csrf} action={action} />
    <input type="hidden" name="returnTab" value={type} />
    <input type="hidden" name="groupId" value={group.id} />
    {definition ? <input type="hidden" name="previousName" value={definition.name} /> : null}
    {definition?.sourceType === "admins_core" ? <input type="hidden" name="runtimeRowId" value={definition.rowId} /> : null}
    <ConfirmSubmitButton className="staff-danger-button" confirmation={confirmation}><Trash2 aria-hidden="true" />Delete {label} group</ConfirmSubmitButton>
    {type === "custom" ? <small>Archives the group and revokes its memberships.</small> : type === "vip" && group.memberCount > 0 ? <small>Remove active memberships before deleting.</small> : null}
  </form>;
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
            <GroupDeleteControl group={group} definition={runtimeDefinition} csrf={csrf} />
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

      {group.sourceType !== "custom" ? <details className={styles.groupDetails}>
        <summary><span>Edit live {sourceLabel(group)} settings</span><small>Permissions, perks &amp; server scope</small></summary>
        <RuntimeSourceEditor group={group} definition={runtimeDefinition} csrf={csrf} />
      </details> : null}

      <details className={styles.groupDetails}>
      <summary><span>Edit identity &amp; badge</span><small>Name, colors, visibility &amp; priority</small></summary>
      <form className={`staff-management-form ${styles.groupPresentationForm}`} action="/api/admin/groups" method="post" encType="multipart/form-data" aria-label={`Edit ${group.displayName} presentation`}>
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
            <GroupBadgeSymbolPicker initialIcon={group.badgeIconKey} />
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
        </div>
      </form>
      </details>

      <details className={styles.groupDetails}>
        <summary>
          <span>Chat tags, permissions &amp; rewards</span>
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
                  <input name="sortOrder" type="number" min="-1000000" max="1000000" defaultValue="0" required />
                </label>
                <div className={styles.inlineActions}>
                  <button className="staff-unban-button" name="action" value="group-tag-attach" type="submit">Attach</button>
                  <button className="staff-danger-button" name="action" value="group-tag-detach" type="submit">Detach</button>
                </div>
              </form>
              <details className={styles.groupDetails} open={!group.tags.length}>
                <summary>Create &amp; assign a tag</summary>
                <form className={tagStyles.form} action="/api/admin/groups" method="post">
                  <MutationFields csrf={csrf} action="tag-create" />
                  <input type="hidden" name="groupId" value={group.id} />
                  <input type="hidden" name="tagTarget" value={`group:${group.id}`} />
                  <label>Stable tag key<input name="tagKey" defaultValue={`group.${group.id}.${randomUUID().slice(0, 8)}`} required /></label>
                  <TagColorFields text={`[${group.badgeLabel}]`} color={group.badgeColor} showSaveBar={false} />
                  <button className="button button-primary" type="submit" disabled={snapshot.richChatTagsAvailable === false}>Create &amp; assign tag</button>
                </form>
              </details>
              {group.tags.map(tag => <details key={tag.id} className={styles.groupDetails}>
                <summary>{tag.text} | Edit tag</summary>
                <form className={tagStyles.form} action="/api/admin/groups" method="post">
                  <MutationFields csrf={csrf} action="tag-update" />
                  <input type="hidden" name="groupId" value={group.id} />
                  <input type="hidden" name="tagId" value={tag.id} />
                  <TagColorFields text={tag.text} color={tag.colorToken} nameColor={tag.nameColorToken} messageColor={tag.messageColorToken} tagStyle={tag.tagStyle} nameStyle={tag.nameStyle} messageStyle={tag.messageStyle} badgeKey={tag.badgeKey} />
                  <label>Status<select name="enabled" defaultValue={tag.enabled ? "true" : "false"}><option value="true">Enabled</option><option value="false">Disabled</option></select></label>
                  <button className="staff-unban-button" type="submit">Save tag</button>
                </form>
              </details>)}
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

  let activeTab = groupWorkspaceTab(params.tab, params.assignment);
  let groupSource = groupSourceForTab(activeTab);
  const isTypeWorkspace = groupSource !== null;

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
  const needsIdentitySnapshot = true;
  let storageError = needsIdentitySnapshot && !identityGroupStorageConfigured();
  if (needsIdentitySnapshot && !storageError) {
    try {
      snapshot = await getIdentityAdminSnapshot();
    } catch {
      storageError = true;
    }
  }
  if ((!params.tab || params.tab === "connected") && /^\d+$/.test(params.group ?? "")) {
    const selected = snapshot.groups.find(group => group.id === Number(params.group));
    activeTab = groupWorkspaceTab(params.tab, params.assignment, selected?.sourceType);
    groupSource = groupSourceForTab(activeTab);
  }
  let runtimeExternalGroups: RuntimeExternalGroup[] = [];
  let runtimeDefinitionError = false;
  if (
    access.canManageGroups &&
    isTypeWorkspace &&
    gameStorageConfigured()
  ) {
    try {
      runtimeExternalGroups = await getRuntimeExternalGroups();
    } catch {
      runtimeDefinitionError = true;
    }
  } else if (
    access.canManageGroups &&
    isTypeWorkspace
  ) {
    runtimeDefinitionError = true;
  }
  let externalMembershipError = false;
  const externalGroups = snapshot.groups.filter(
    (group) => group.sourceType !== "custom" && group.externalKey,
  );
  if (isTypeWorkspace && externalGroups.length && gameStorageConfigured()) {
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
  } else if (isTypeWorkspace && externalGroups.length) {
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
  if (isTypeWorkspace) {
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
  if (isTypeWorkspace) {
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
  const playerIdentities = await resolvePlayerIdentities([
    ...snapshot.groups.flatMap(group => group.memberships.map(member => ({ steamId: member.steamId }))),
    ...sourceAwareAdminPlayers.map(player => ({ steamId: player.steamId, displayName: player.name })),
    ...sourceAwareVipPlayers.map(player => ({ steamId: player.steamId, displayName: player.name })),
    ...snapshot.directTagGrants.map(grant => ({ steamId: grant.steamId })),
    ...snapshot.directPrivilegeGrants.map(grant => ({ steamId: grant.steamId })),
  ]);
  // Keep stale external adapters visible while they still carry memberships,
  // presentation links, or a definition that needs repair. A successfully
  // deleted, empty runtime adapter is a retained rollback tombstone and should
  // not remain in the active Connected Groups workspace.
  const connectedGroups = snapshot.groups.filter((group) =>
    group.sourceType === "custom" ||
    Boolean(runtimeDefinitionForGroup(group, runtimeExternalGroups)) ||
    group.enabled ||
    Boolean(group.externalDefinition) ||
    group.memberCount > 0 ||
    group.tags.length > 0 ||
    group.privileges.length > 0 ||
    group.rewards.length > 0).filter(group => group.sourceType === groupSource);
  const availablePermissions = privilegeOptions(snapshot.privileges);
  const notice = params.notice && Object.hasOwn(noticeMessages, params.notice) ? noticeMessages[params.notice] : null;
  const error = params.error ? (Object.hasOwn(errorMessages, params.error) ? errorMessages[params.error] : undefined) ?? "The identity action could not be completed." : null;
  const selectedGroupId = /^\d+$/.test(params.group ?? "") ? Number(params.group) : null;
  const assignmentView = activeTab === "custom-access" ? "custom" : activeTab;
  const typeLabel = activeTab === "admin" ? "Admin" : activeTab === "vip" ? "VIP" : "Custom";


  return (
    <PortalShell authenticated className="staff-page" navigation={<StaffSubmenu access={access} active="groups" />}>
        <AdminPageHeader
          id="group-management-title"
          title="Groups & accesses"
          description="The right role. The right access. Manage your community's groups, identities, and benefits in one place."
          access={access}
          className={styles.pageHero}
        />

        <GroupAdminNav
          activeKey={activeTab}
          selectedGroupId={selectedGroupId}
          canManageGroups={access.canManageGroups}
        />
        {notice ? <PortalToast message={notice} /> : null}
        {error ? <PortalToast variant="danger" message={error} /> : null}
        {storageError ? <PortalToast variant="danger" message="Connected group storage is unavailable. Apply the Arena authority migration and the portal commerce bridge migration, then check both database connections." /> : null}
        {snapshot.richChatTagsAvailable === false ? <PortalToast variant="danger" message="Existing groups and tags are available. To create or save chat tags, apply arena-portal/db/033_rich_chat_tag_styles.sql to the Portal database." /> : null}
        {externalMembershipError ? <PortalToast variant="danger" message="One or more live Admins.Core/VIPCore membership lists could not be read. Connected group counts may be incomplete until the game database is available." /> : null}
        {adminAssignmentError ? <PortalToast variant="danger" message="Live Admins.Core assignments could not be read. Admin assignment actions are disabled, but available VIP records remain manageable." /> : null}
        {vipAssignmentError ? <PortalToast variant="danger" message="Live VIPCore assignments could not be read. VIP assignment actions are disabled, but available Admin records remain manageable." /> : null}
        {vipScopeError ? <PortalToast variant="danger" message="VIP server scopes could not be read. Existing exact VIP rows remain manageable, but new grants and moves require a live destination scope." /> : null}
        {membershipInventoryError ? <PortalToast variant="danger" message="VIP inventory context could not be loaded. Arena assignments remain manageable; open Inventories to inspect portal-owned items separately." /> : null}
        {runtimeDefinitionError ? <PortalToast variant="danger" message="Runtime Admins.Core/VIPCore definitions could not be read. Connected presentation remains visible, but native fields cannot be edited until the game database is available." /> : null}

        {activeTab === "custom-access" && access.canManageGroups ? <nav className={styles.accessOverview} aria-label="Custom access tools" data-panel-light>
          <div><KeyRound aria-hidden="true" /><span><strong>Build a distinct identity</strong><small>Reusable styles and privileges, with precise control over who receives them.</small></span></div>
          <div className={styles.accessShortcuts}>
            <a href="#tag-definitions"><Tags aria-hidden="true" /><span><strong>Chat tags</strong><small>{snapshot.tags.length} definitions</small></span></a>
            <a href="#permission-catalogue"><ShieldCheck aria-hidden="true" /><span><strong>Permissions</strong><small>{snapshot.privileges.length} definitions</small></span></a>
            <a href="#direct-awards"><UsersRound aria-hidden="true" /><span><strong>Player grants</strong><small>{snapshot.directTagGrants.length + snapshot.directPrivilegeGrants.length} active</small></span></a>
            <a href="#vip-perks"><Gift aria-hidden="true" /><span><strong>VIP perks</strong><small>Define &amp; assign</small></span></a>
          </div>
        </nav> : null}

        {isTypeWorkspace && access.canManageGroups ? <details id="create-group" className={`staff-record-section ${styles.createDisclosure}`}><summary><ShieldCheck aria-hidden="true" /><span>Create {typeLabel} group</span></summary>
          <p className={styles.sectionIntro}>Create a {typeLabel.toLowerCase()} group with its badge and optional chat tag. Configure its access here and add members after saving.</p>
          {activeTab === "custom" ? <><div className={styles.createTypeHeading}>
            <span className={styles.sourceBadge} data-source="custom">Arena custom</span>
            <strong>Custom Arena identity and presentation</strong>
          </div>
          <form className={`staff-management-form ${styles.createGroupForm}`} action="/api/admin/groups" method="post" encType="multipart/form-data">
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
                <GroupBadgeSymbolPicker />
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
            <GroupTagCreationFields />
            <div className={styles.formActions}><button className="button button-primary" type="submit">Create group</button></div>
          </form></> : null}
          <div className={`${styles.runtimeCreateGrid} ${styles.singleCreateGrid}`}>
            {activeTab === "admin" ? <form className={`staff-management-form ${styles.runtimeCreateForm}`} action="/api/admin/groups" method="post">
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
              <GroupTagCreationFields />
              <button className="button button-primary" type="submit">Create Admins.Core group</button>
            </form> : null}

            {activeTab === "vip" ? <form className={`staff-management-form ${styles.runtimeCreateForm}`} action="/api/admin/groups" method="post">
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
              <GroupTagCreationFields />
              <button className="button button-primary" type="submit">Create VIPCore group</button>
            </form> : null}
          </div>
        </details> : null}

        {isTypeWorkspace ? <section id="connected-groups" className="staff-record-section" aria-labelledby="external-group-definitions-title">
          <div className="staff-section-heading">
            <div>
              <p className="tapped-kicker"><Database aria-hidden="true" /> Group workspace</p>
              <h2 id="external-group-definitions-title">{typeLabel} groups &amp; members</h2>
            </div>
            {access.canManageGroups ? <form className={styles.syncForm} action="/api/admin/groups" method="post">
              <MutationFields csrf={csrf} action="external-catalogue-sync" />
              <span>Last sync · {formatSyncedAt(snapshot.catalogueStatus.lastSyncedAt)}</span>
              <button className="staff-unban-button" type="submit" disabled={storageError}>
                <RefreshCw aria-hidden="true" /> Synchronize catalogue
              </button>
            </form> : null}
          </div>
          <p className={styles.sectionIntro}>
            Choose a group below to customize its identity, manage benefits, and keep player access up to date.
          </p>
          <div className={styles.catalogueStatus} aria-label={`${typeLabel} group overview`}>
            <div><UsersRound aria-hidden="true" /><span>{typeLabel} groups</span><strong>{connectedGroups.length}</strong></div>
            <div><ShieldCheck aria-hidden="true" /><span>Enabled</span><strong>{connectedGroups.filter(group => group.enabled).length}</strong></div>
            <div><KeyRound aria-hidden="true" /><span>Memberships</span><strong>{connectedGroups.reduce((total, group) => total + group.memberCount, 0)}</strong></div>
            <div><Tags aria-hidden="true" /><span>Linked tags</span><strong>{connectedGroups.reduce((total, group) => total + group.tags.length, 0)}</strong></div>
          </div>
          {connectedGroups.length ? (
            <GroupWorkspace id="connected-groups-workspace" groups={groupWorkspaceEntries(connectedGroups)} initialSelectedId={selectedGroupId}>
              {connectedGroups.map((group) => (
                <div key={group.id} className={styles.typeWorkspace}>
                  {access.canManageGroups ? <GroupCard group={group} snapshot={snapshot} csrf={csrf} playerIdentities={playerIdentities} runtimeDefinitions={runtimeExternalGroups} /> : <header className="staff-section-heading"><h3><IdentityGroupBadge group={group} /></h3><span>{group.memberCount} members</span></header>}
                  <AssignmentsWorkspace csrf={csrf} identities={playerIdentities} adminPlayers={sourceAwareAdminPlayers} vipPlayers={sourceAwareVipPlayers} groups={snapshot.groups} vipGroups={vipGroups} vipScopes={staffVipServerScopes} inventorySummaries={membershipInventorySummaries} canManageAdmins={access.canManageAdmins && !adminAssignmentError} canManageGroups={access.canManageGroups && access.isFounder} canManageVips={access.canManageVips && !vipAssignmentError} assignmentView={assignmentView} groupFilterId={group.id} initialPlayerSteamId={params.player} lockView requestKeySeed={randomUUID()} />
                </div>
              ))}
            </GroupWorkspace>
          ) : (
            <p className="empty-copy">No connected definitions are available. Synchronize the catalogue after applying the identity migrations.</p>
          )}
        </section> : null}

        {activeTab === "custom-access" && access.canManageGroups ? <section id="tag-definitions" className="staff-record-section">
          <div className="staff-section-heading"><div><p className="tapped-kicker"><Tags aria-hidden="true" /> GlobalChatTags</p><h2>Tag definitions</h2></div><span>{snapshot.tags.length} tags</span></div>
          <p className={tagStyles.intro}>Build a Workshop chat look with custom HEX colors, named swatches, text effects and badges. Style the tag, player name and message separately; the preview updates as you edit.</p>
          <details className={styles.groupDetails}><summary>Create &amp; assign a custom tag</summary><form className={tagStyles.form} action="/api/admin/groups" method="post">
            <MutationFields csrf={csrf} action="tag-create" />
            <label>Assign new tag to<select name="tagTarget" defaultValue="none"><option value="none">Catalogue only</option><option value="player">Player below</option>{snapshot.groups.filter(group => group.enabled).map(group => <option key={group.id} value={`group:${group.id}`}>{group.displayName}</option>)}</select></label>
            <PlayerSearchField name="steamId" label="Player (when selected)" mode="target" includeSelf />
            <label>Player award duration (minutes)<input name="durationMinutes" type="number" min="0" max="525600" defaultValue="0" /><small>0 is permanent. Group tags follow membership.</small></label>
            <label>Stable key<input name="tagKey" pattern="[a-z0-9][a-z0-9._:-]{0,63}" required placeholder="group.beta" /></label>
            <TagColorFields />
            <div className={tagStyles.footer}><button className="button button-primary" type="submit" disabled={snapshot.richChatTagsAvailable === false}>Create tag</button></div>
          </form></details>
          <div className="staff-group-list">
            {snapshot.tags.map((tag) => (
              <details key={tag.id} className={styles.groupDetails}><summary><strong>{tag.text}</strong><code>{tag.key}</code><span>{tag.enabled ? "Enabled" : "Disabled"} | Edit tag</span></summary><form className={tagStyles.form} action="/api/admin/groups" method="post" aria-label={`Edit tag ${tag.key}`}>
                <MutationFields csrf={csrf} action="tag-update" />
                <input type="hidden" name="tagId" value={tag.id} />
                <strong className={tagStyles.tagKey}>{tag.key}</strong>
                <TagColorFields text={tag.text} color={tag.colorToken} nameColor={tag.nameColorToken} messageColor={tag.messageColorToken} tagStyle={tag.tagStyle} nameStyle={tag.nameStyle} messageStyle={tag.messageStyle} badgeKey={tag.badgeKey} />
                <div className={tagStyles.footer}>
                  <label>Status<select name="enabled" defaultValue={tag.enabled ? "true" : "false"}><option value="true">Enabled</option><option value="false">Disabled</option></select></label>
                  <button className="staff-unban-button" type="submit" disabled={snapshot.richChatTagsAvailable === false}>Save tag</button>
                </div>
              </form></details>
            ))}
          </div>
        </section> : null}

        {activeTab === "custom-access" && access.canManageGroups ? <section id="permission-catalogue" className="staff-record-section">
          <div className="staff-section-heading"><div><p className="tapped-kicker"><KeyRound aria-hidden="true" /> Authorization</p><h2>Permission catalogue</h2></div><span>{snapshot.privileges.length} definitions</span></div>
          <p className={styles.sectionIntro}>
            Synchronized game permissions and portal-defined privileges share one searchable catalogue. Discovery provenance is read-only; display details, sensitivity, status, and additive group or player grants remain Founder-managed.
          </p>
          <details className={styles.groupDetails}><summary><span>Create a permission</span><small>Add a reusable privilege</small></summary>
          <form className="staff-management-form" action="/api/admin/groups" method="post">
            <MutationFields csrf={csrf} action="privilege-create" />
            <label>Privilege key<input name="privilegeKey" pattern="[a-z0-9][a-z0-9.*:_-]{0,95}" maxLength={96} required placeholder="portal.showcase.manage" title="Lowercase letters, numbers, dots, colons, underscores, dashes, or wildcards" /></label>
            <label>Display name<input name="displayName" maxLength={100} required placeholder="Manage showcases" /></label>
            <label>Description<input name="description" maxLength={255} placeholder="What this privilege allows" /></label>
            <label>Scope<select name="scope" defaultValue="portal"><option value="portal">Portal</option><option value="game">Game server</option></select></label>
            <label>Sensitivity<select name="sensitive" defaultValue="false"><option value="false">Standard</option><option value="true">Sensitive</option></select></label>
            <button className="button button-primary" type="submit">Create privilege</button>
          </form>
          </details>
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

        {activeTab === "custom-access" && access.canManageGroups ? <section id="direct-awards" className="staff-record-section">
          <div className="staff-section-heading"><div><p className="tapped-kicker"><KeyRound aria-hidden="true" /> Direct awards</p><h2>Player-specific tag or privilege</h2></div><span>Optional expiry</span></div>
          <p className={styles.sectionIntro}>Direct grants are exceptions for one player. Group-based access remains easier to audit and should be preferred whenever possible.</p>
          <div className={styles.directAwardGrid}>
            <details className={styles.directGrantDisclosure}><summary><Tags aria-hidden="true" /><span>Player chat tag</span></summary>
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
            </details>
            <details className={styles.directGrantDisclosure}><summary><KeyRound aria-hidden="true" /><span>Player permission</span></summary>
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
            </details>
          </div>
          <details className={styles.directGrantDisclosure}><summary><UsersRound aria-hidden="true" /><span>Group permission exception</span></summary>
          <form className="staff-management-form" action="/api/admin/groups" method="post">
            <MutationFields csrf={csrf} />
            <label>Group exception<select name="groupId" required defaultValue=""><option value="" disabled>Choose a group</option>{snapshot.groups.filter(group => group.enabled).map(group => <option key={group.id} value={group.id}>{group.displayName}</option>)}</select></label>
            <PermissionPicker id="custom-group-privilege" label="Group privilege" permissions={availablePermissions} required />
            <button className="staff-unban-button" name="action" value="group-privilege-attach">Grant to group</button>
            <button className="staff-danger-button" name="action" value="group-privilege-detach">Remove from group</button>
          </form>
          </details>
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
        {activeTab === "custom-access" && access.canManageGroups ? <CustomPerkWorkspace searchParams={searchParams} /> : null}
    </PortalShell>
  );
}
