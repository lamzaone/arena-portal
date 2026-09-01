"use client";

import {
  CalendarClock,
  CalendarDays,
  Clock3,
  Crown,
  Database,
  Filter,
  Infinity as InfinityIcon,
  Network,
  PackageOpen,
  PencilLine,
  Plus,
  Server,
  ShieldAlert,
  ShieldCheck,
  Trash2,
  UserRoundCheck,
  UsersRound,
  X,
} from "lucide-react";
import Link from "next/link";
import {
  type CSSProperties,
  useDeferredValue,
  useEffect,
  useId,
  useMemo,
  useState,
} from "react";

import { IdentityGroupBadge } from "@/components/identity-group-badge";
import { PlayerIdentity } from "@/components/player-identity";
import {
  PlayerSearchField,
  type PlayerSearchResult,
} from "@/components/player-search-field";
import { ThemedPlayerContainer } from "@/components/ui/themed-player-container";
import type {
  IdentityGroup,
  IdentityGroupMembership,
} from "@/lib/data/identity-groups";
import type {
  StaffAdminMembershipPlayer,
  StaffAdminMembershipRecord,
} from "@/lib/data/staff-admin-memberships";
import type {
  StaffVipMembershipPlayer,
  StaffVipMembershipRecord,
} from "@/lib/data/staff-vip-memberships";
import type { StaffMembershipInventorySummary } from "@/lib/data/staff-membership-inventory";
import type { PlayerIdentityData } from "@/lib/player-identities";

import { ConfirmSubmitButton } from "./groups-controls";
import styles from "./assignments-workspace.module.css";

export type AssignmentWorkspaceView = "all" | "admin" | "vip" | "custom";

export type AssignmentVipScope = Readonly<{
  id: number;
  label: string;
  description?: string;
  hasDefinitions: boolean;
  scopeId?: number | null;
  scopeKey?: string | null;
  scopeType?: "global" | "server" | null;
  adminServerGuid?: string | null;
}>;

export type AssignmentsWorkspaceProps = Readonly<{
  csrf: string;
  identities: Readonly<Record<string, PlayerIdentityData>>;
  adminPlayers: readonly StaffAdminMembershipPlayer[];
  vipPlayers: readonly StaffVipMembershipPlayer[];
  groups: readonly IdentityGroup[];
  vipGroups: readonly string[];
  vipScopes?: readonly AssignmentVipScope[];
  inventorySummaries?: Readonly<Record<string, StaffMembershipInventorySummary>>;
  canManageAdmins: boolean;
  canManageVips: boolean;
  canManageGroups?: boolean;
  assignmentView?: AssignmentWorkspaceView;
  actionUrl?: string;
  customActionUrl?: string;
  requestKeySeed?: string;
}>;

type AssignmentStatus =
  | "active"
  | "expired"
  | "scheduled"
  | "revoked";

type AdminAssignment = Readonly<{
  key: string;
  kind: "admin";
  steamId: string;
  playerName: string;
  groupName: string;
  groupDefinition: IdentityGroup | null;
  scopeKeys: readonly string[];
  scopeLabels: readonly string[];
  status: AssignmentStatus;
  permanent: boolean;
  startsAt: string | null;
  expiresAt: string | null;
  needsReview: boolean;
  record: StaffAdminMembershipRecord;
}>;

type VipAssignment = Readonly<{
  key: string;
  kind: "vip";
  steamId: string;
  playerName: string;
  groupName: string;
  groupDefinition: IdentityGroup | null;
  scopeKeys: readonly string[];
  scopeLabels: readonly string[];
  status: AssignmentStatus;
  permanent: boolean;
  startsAt: string | null;
  expiresAt: string | null;
  needsReview: boolean;
  record: StaffVipMembershipRecord;
}>;

type CustomAssignment = Readonly<{
  key: string;
  kind: "custom";
  steamId: string;
  playerName: string;
  groupName: string;
  groupDefinition: IdentityGroup;
  scopeKeys: readonly string[];
  scopeLabels: readonly string[];
  status: AssignmentStatus;
  permanent: boolean;
  startsAt: string | null;
  expiresAt: string | null;
  needsReview: boolean;
  record: IdentityGroupMembership;
}>;

type Assignment = AdminAssignment | VipAssignment | CustomAssignment;

type PlayerAssignments = Readonly<{
  steamId: string;
  identity: PlayerIdentityData;
  records: readonly Assignment[];
}>;

type StatusFilter =
  | "all"
  | "active"
  | "permanent"
  | "expiring"
  | "expired"
  | "scheduled"
  | "revoked"
  | "review";

const sevenDaysMilliseconds = 7 * 24 * 60 * 60 * 1_000;
const globalArenaScopeKey = "arena:global";

const dateTimeFormatter = new Intl.DateTimeFormat("en-GB", {
  dateStyle: "medium",
  timeStyle: "short",
  timeZone: "Europe/Bucharest",
});

function normalize(value: string) {
  return value.normalize("NFKC").trim().toLocaleLowerCase("en-US");
}

function parsedTime(value: string | null) {
  if (!value) return null;
  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime()) ? null : parsed;
}

function formattedTime(value: string | null, fallback: string) {
  const parsed = parsedTime(value);
  if (!parsed) return <span>{fallback}</span>;
  return (
    <time dateTime={parsed.toISOString()} title={`${parsed.toISOString()} (UTC)`}>
      {dateTimeFormatter.format(parsed)}
    </time>
  );
}

function fallbackIdentity(steamId: string, name: string): PlayerIdentityData {
  return {
    steamId,
    displayName: name.trim() || steamId,
    avatarUrl: null,
    presence: "unknown",
    profileThemeKey: null,
    identityGroups: [],
  };
}

function groupMatches(
  group: IdentityGroup,
  kind: Assignment["kind"],
  groupName: string,
  groupId: number | null,
) {
  const source = kind === "admin"
    ? "admins_core"
    : kind === "vip"
      ? "vipcore"
      : "custom";
  if (group.sourceType !== source) return false;
  if (groupId !== null && group.id === groupId) return true;
  const wanted = normalize(groupName);
  return [group.externalKey, group.key, group.displayName]
    .filter((value): value is string => Boolean(value))
    .some((value) => normalize(value) === wanted);
}

function groupDefinition(
  groups: readonly IdentityGroup[],
  kind: Assignment["kind"],
  groupName: string,
  groupId: number | null,
) {
  return groups.find((group) => groupMatches(group, kind, groupName, groupId)) ?? null;
}

function registeredServerScopeKey(scope: AssignmentVipScope) {
  return `arena:server:${scope.id}`;
}

function registeredServerScopes(scopes: readonly AssignmentVipScope[]) {
  return scopes.filter((scope) => scope.id > 0 && scope.scopeType !== "global");
}

function findRegisteredServerScope(
  scopes: readonly AssignmentVipScope[],
  input: Readonly<{
    vipServerId?: number | null;
    authorityScopeId?: number | null;
    scopeKey?: string | null;
    adminServerGuid?: string | null;
  }>,
) {
  const serverScopes = registeredServerScopes(scopes);
  if (input.vipServerId !== null && input.vipServerId !== undefined) {
    const match = serverScopes.find((scope) => scope.id === input.vipServerId);
    if (match) return match;
  }
  if (input.authorityScopeId !== null && input.authorityScopeId !== undefined) {
    const match = serverScopes.find((scope) => scope.scopeId === input.authorityScopeId);
    if (match) return match;
  }
  const wantedScopeKey = normalize(input.scopeKey ?? "");
  if (wantedScopeKey) {
    const match = serverScopes.find((scope) => normalize(scope.scopeKey ?? "") === wantedScopeKey);
    if (match) return match;
  }
  const wantedGuid = normalize(input.adminServerGuid ?? "");
  if (wantedGuid) {
    const match = serverScopes.find((scope) => normalize(scope.adminServerGuid ?? "") === wantedGuid);
    if (match) return match;
  }
  return null;
}

function globalArenaScope() {
  return { keys: [globalArenaScopeKey], labels: ["All ARENA servers"] };
}

function registeredArenaScope(scope: AssignmentVipScope) {
  return {
    keys: [registeredServerScopeKey(scope)],
    labels: [scope.label.trim() || `Arena server ${scope.id}`],
  };
}

function unregisteredScopeKey(value: string | number | null | undefined) {
  return `arena:unregistered:${normalize(String(value ?? "unknown")) || "unknown"}`;
}

function adminScopes(
  record: StaffAdminMembershipRecord,
  vipScopes: readonly AssignmentVipScope[],
) {
  if (record.source === "portal") {
    if (record.scopeType === "global") return globalArenaScope();
    const registered = findRegisteredServerScope(vipScopes, {
      authorityScopeId: record.scopeId,
      scopeKey: record.scopeKey,
      adminServerGuid: record.serverGuids[0],
    });
    if (registered) return registeredArenaScope(registered);
    return {
      keys: [unregisteredScopeKey(record.scopeKey ?? record.scopeId)],
      labels: [record.scopeName ?? "Unregistered Arena server"],
    };
  }
  if (!record.serverGuids.length) return globalArenaScope();
  const scopes = record.serverGuids.map((guid) => {
    const registered = findRegisteredServerScope(vipScopes, { adminServerGuid: guid });
    return registered
      ? { key: registeredServerScopeKey(registered), label: registered.label }
      : { key: unregisteredScopeKey(guid), label: `Unregistered server ${guid}` };
  });
  return {
    keys: scopes.map((scope) => scope.key),
    labels: scopes.map((scope) => scope.label),
  };
}

function vipScope(
  record: StaffVipMembershipRecord,
  vipScopes: readonly AssignmentVipScope[],
) {
  const { serverId, source } = record;
  if (serverId === null) {
    return source === "portal"
      ? {
          keys: [`arena:${record.scopeId ?? "unknown"}`],
          labels: [record.scopeId
            ? `Arena scope #${record.scopeId}`
            : "Arena authority scope"],
        }
      : { keys: ["vip:none"], labels: ["Unknown VIP scope"] };
  }
  if (serverId === 0) return globalArenaScope();
  const configured = findRegisteredServerScope(vipScopes, { vipServerId: serverId });
  return {
    keys: [configured
      ? registeredServerScopeKey(configured)
      : unregisteredScopeKey(`vip-${serverId}`)],
    labels: [configured
      ? `${configured.label}${configured.hasDefinitions ? "" : " · Legacy / orphaned"}`
      : `VIP server ${serverId} · Legacy / orphaned`],
  };
}

function customScope(
  record: IdentityGroupMembership,
  vipScopes: readonly AssignmentVipScope[],
) {
  if (record.scopeType === "global") return globalArenaScope();
  const registered = findRegisteredServerScope(vipScopes, {
    authorityScopeId: record.scopeId,
    scopeKey: record.scopeKey,
  });
  if (registered) return registeredArenaScope(registered);
  return {
    keys: [unregisteredScopeKey(record.scopeKey ?? record.scopeId)],
    labels: [record.scopeName ?? "Unregistered Arena server"],
  };
}

function assignmentRecords({
  adminPlayers,
  groups,
  identities,
  vipPlayers,
  vipScopes,
}: Pick<AssignmentsWorkspaceProps, "adminPlayers" | "groups" | "identities" | "vipPlayers"> & {
  vipScopes: readonly AssignmentVipScope[];
}) {
  const assignments: Assignment[] = [];

  for (const player of adminPlayers) {
    for (const record of player.records) {
      const scopes = adminScopes(record, vipScopes);
      assignments.push({
        key: `admin:${record.recordKey}`,
        kind: "admin",
        steamId: player.steamId,
        playerName: player.name,
        groupName: record.group,
        groupDefinition: groupDefinition(groups, "admin", record.group, record.groupId),
        scopeKeys: scopes.keys,
        scopeLabels: scopes.labels,
        status: record.status,
        permanent: record.permanent,
        startsAt: record.startsAt,
        expiresAt: record.expiresAt,
        needsReview:
          (record.source === "native" && !record.enabled) ||
          (record.source === "portal" && (
            record.groupId === null ||
            !record.membershipUuid ||
            record.scopeId === null ||
            record.rowVersion === null
          )),
        record,
      });
    }
  }

  for (const player of vipPlayers) {
    for (const record of player.records) {
      const scopes = vipScope(record, vipScopes);
      assignments.push({
        key: `vip:${record.recordKey}`,
        kind: "vip",
        steamId: player.steamId,
        playerName: player.name,
        groupName: record.group,
        groupDefinition: groupDefinition(groups, "vip", record.group, record.groupId),
        scopeKeys: scopes.keys,
        scopeLabels: scopes.labels,
        status: record.status,
        permanent: record.permanent,
        startsAt: record.startsAt,
        expiresAt: record.expiresAt,
        needsReview:
          player.needsConsolidation ||
          (record.source === "portal" && record.groupId === null) ||
          (record.source === "native" &&
            (!record.accountId || record.serverId === null)),
        record,
      });
    }
  }

  const now = Date.now();
  for (const group of groups) {
    if (group.sourceType !== "custom") continue;
    for (const record of group.memberships) {
      const startsAt = parsedTime(record.startsAt);
      const expiresAt = parsedTime(record.expiresAt);
      const status: AssignmentStatus = startsAt && startsAt.getTime() > now
        ? "scheduled"
        : expiresAt && expiresAt.getTime() <= now
          ? "expired"
          : "active";
      const scope = customScope(record, vipScopes);
      assignments.push({
        key: `custom:${record.membershipUuid ?? `${group.id}:${record.steamId}:${record.startsAt}`}`,
        kind: "custom",
        steamId: record.steamId,
        playerName: identities[record.steamId]?.displayName ?? `Steam ${record.steamId}`,
        groupName: group.displayName,
        groupDefinition: group,
        scopeKeys: scope.keys,
        scopeLabels: scope.labels,
        status,
        permanent: record.expiresAt === null,
        startsAt: record.startsAt,
        expiresAt: record.expiresAt,
        needsReview:
          !record.membershipUuid ||
          !record.arenaGroupId ||
          !record.scopeId ||
          !record.rowVersion,
        record,
      });
    }
  }

  return assignments;
}

function effectiveVipScopeOptions(
  configured: readonly AssignmentVipScope[],
) {
  const scopes = new Map<number, AssignmentVipScope>();
  for (const scope of configured) {
    if (!Number.isSafeInteger(scope.id) || scope.id < 0) continue;
    scopes.set(scope.id, {
      ...scope,
      label: scope.id === 0
        ? "All ARENA servers"
        : scope.label.trim() || `VIP server ${scope.id}`,
    });
  }
  return [...scopes.values()].sort((left, right) => left.id - right.id);
}

function statusLabel(assignment: Assignment) {
  if (assignment.status === "revoked") return "Revoked";
  if (assignment.status === "expired") return "Expired";
  if (assignment.status === "scheduled") return "Scheduled";
  if (assignment.permanent) return "Permanent";
  return "Active";
}

function isExpiring(assignment: Assignment, now: number) {
  const expiry = parsedTime(assignment.expiresAt)?.getTime() ?? 0;
  return (
    assignment.status === "active" &&
    !assignment.permanent &&
    expiry > now &&
    expiry <= now + sevenDaysMilliseconds
  );
}

function matchesStatus(
  assignment: Assignment,
  filter: StatusFilter,
  now: number,
) {
  if (filter === "all") return true;
  if (filter === "permanent") {
    return assignment.status === "active" && assignment.permanent;
  }
  if (filter === "expiring") return isExpiring(assignment, now);
  if (filter === "review") return assignment.needsReview;
  return assignment.status === filter;
}

function searchableText(
  assignment: Assignment,
  identity: PlayerIdentityData | undefined,
) {
  const source = assignment.kind === "custom"
    ? "arena custom"
    : assignment.record.source;
  return normalize([
    assignment.playerName,
    identity?.displayName,
    identity?.steamId,
    assignment.steamId,
    assignment.groupName,
    assignment.kind,
    source,
    ...assignment.scopeLabels,
    statusLabel(assignment),
  ].join(" "));
}

function exactAdminReference(record: StaffAdminMembershipRecord) {
  if (!record.steamId.trim() || !record.group.trim()) return false;
  if (record.source === "portal") {
    return record.groupId !== null && record.groupId > 0 &&
      Boolean(record.membershipUuid) &&
      record.scopeId !== null && record.scopeId > 0 &&
      record.rowVersion !== null && record.rowVersion > 0;
  }
  return record.adminId !== null && record.adminId > 0 && Boolean(record.storedGroup);
}

function exactVipReference(record: StaffVipMembershipRecord) {
  if (!record.steamId.trim() || !record.group.trim()) return false;
  if (record.source === "portal") {
    return record.groupId !== null && record.groupId > 0 &&
      record.arenaGroupId !== null && record.arenaGroupId > 0 &&
      record.scopeId !== null && record.scopeId > 0 &&
      Boolean(record.membershipUuid);
  }
  return Boolean(record.accountId) && record.serverId !== null;
}

function exactCustomReference(
  group: IdentityGroup,
  record: IdentityGroupMembership,
) {
  return group.id > 0 &&
    Boolean(record.steamId) &&
    Boolean(record.membershipUuid) &&
    Boolean(record.arenaGroupId) &&
    Boolean(record.scopeId) &&
    Boolean(record.rowVersion);
}

function AdminReferenceFields({ record }: { record: StaffAdminMembershipRecord }) {
  return (
    <>
      <input type="hidden" name="steamId" value={record.steamId} />
      <input type="hidden" name="membershipSource" value={record.source} />
      {record.source === "native" ? (
        <>
          <input type="hidden" name="adminId" value={record.adminId ?? ""} />
          <input type="hidden" name="storedGroup" value={record.storedGroup ?? ""} />
        </>
      ) : (
        <>
          <input type="hidden" name="groupId" value={record.groupId ?? ""} />
          <input type="hidden" name="membershipUuid" value={record.membershipUuid ?? ""} />
          <input type="hidden" name="scopeId" value={record.scopeId ?? ""} />
          <input type="hidden" name="rowVersion" value={record.rowVersion ?? ""} />
        </>
      )}
    </>
  );
}

function VipReferenceFields({
  record,
  sourceField = "membershipSource",
}: {
  record: StaffVipMembershipRecord;
  sourceField?: "membershipSource" | "targetSource";
}) {
  return (
    <>
      <input type="hidden" name="steamId" value={record.steamId} />
      <input type="hidden" name={sourceField} value={record.source} />
      {record.source === "native" ? (
        <>
          <input type="hidden" name="accountId" value={record.accountId ?? ""} />
          <input type="hidden" name="serverId" value={record.serverId ?? ""} />
          <input type="hidden" name="storedGroup" value={record.group} />
        </>
      ) : (
        <>
          <input type="hidden" name="groupId" value={record.groupId ?? ""} />
          <input type="hidden" name="arenaGroupId" value={record.arenaGroupId ?? ""} />
          <input type="hidden" name="scopeId" value={record.scopeId ?? ""} />
          <input type="hidden" name="membershipUuid" value={record.membershipUuid ?? ""} />
        </>
      )}
    </>
  );
}

function CustomReferenceFields({
  assignment,
}: {
  assignment: CustomAssignment;
}) {
  return (
    <>
      <input type="hidden" name="groupId" value={assignment.groupDefinition.id} />
      <input type="hidden" name="steamId" value={assignment.steamId} />
      <input type="hidden" name="membershipUuid" value={assignment.record.membershipUuid ?? ""} />
      <input type="hidden" name="scopeId" value={assignment.record.scopeId ?? ""} />
      <input type="hidden" name="rowVersion" value={assignment.record.rowVersion ?? ""} />
    </>
  );
}

function GroupMark({ assignment }: { assignment: Assignment }) {
  if (assignment.groupDefinition) {
    return <IdentityGroupBadge group={assignment.groupDefinition} compact />;
  }
  return (
    <span className={styles.fallbackGroupBadge} data-kind={assignment.kind}>
      {assignment.kind === "vip" ? (
        <Crown aria-hidden="true" />
      ) : assignment.kind === "custom" ? (
        <UsersRound aria-hidden="true" />
      ) : (
        <ShieldCheck aria-hidden="true" />
      )}
      {assignment.groupName}
    </span>
  );
}

function ExtendForm({
  actionUrl,
  assignment,
  csrf,
  customActionUrl,
  requestKeySeed,
}: {
  actionUrl: string;
  assignment: Assignment;
  csrf: string;
  customActionUrl: string;
  requestKeySeed: string;
}) {
  const label = `Extend ${assignment.groupName} for ${assignment.playerName}`;
  return (
    <form
      className={styles.extendForm}
      action={assignment.kind === "custom" ? customActionUrl : actionUrl}
      method="post"
    >
      <input type="hidden" name="csrf" value={csrf} />
      {assignment.kind === "custom" ? (
        <input
          type="hidden"
          name="requestKey"
          value={`${requestKeySeed}.extend.${assignment.groupDefinition.id}.${assignment.record.rowVersion ?? 0}`}
        />
      ) : null}
      <input
        type="hidden"
        name="action"
        value={assignment.kind === "admin"
          ? "admin-membership-extend"
          : assignment.kind === "vip"
            ? "vip-membership-extend"
            : "membership-extend"}
      />
      {assignment.kind === "admin" ? (
        <AdminReferenceFields record={assignment.record} />
      ) : assignment.kind === "vip" ? (
        <VipReferenceFields record={assignment.record} />
      ) : (
        <CustomReferenceFields assignment={assignment} />
      )}
      {assignment.kind !== "custom" ? (
        <input
          type="hidden"
          name="expectedExpiresAt"
          value={assignment.expiresAt ?? ""}
        />
      ) : null}
      <label>
        <span>Add time</span>
        <span className={styles.durationInput}>
          <input
            name="durationMinutes"
            type="number"
            min="1"
            max="525600"
            step="1"
            defaultValue="1440"
            inputMode="numeric"
            aria-label={`${label} in minutes`}
            required
          />
          <small>minutes</small>
        </span>
      </label>
      <ConfirmSubmitButton
        className={styles.secondaryButton}
        confirmation={`${label} by the entered duration? Time is added after the later of now or the current expiry.`}
      >
        <CalendarClock aria-hidden="true" />
        Extend
      </ConfirmSubmitButton>
    </form>
  );
}

function RemoveForm({
  actionUrl,
  assignment,
  csrf,
  customActionUrl,
  requestKeySeed,
}: {
  actionUrl: string;
  assignment: Assignment;
  csrf: string;
  customActionUrl: string;
  requestKeySeed: string;
}) {
  return (
    <form action={assignment.kind === "custom" ? customActionUrl : actionUrl} method="post">
      <input type="hidden" name="csrf" value={csrf} />
      {assignment.kind === "custom" ? (
        <input
          type="hidden"
          name="requestKey"
          value={`${requestKeySeed}.remove.${assignment.groupDefinition.id}.${assignment.record.rowVersion ?? 0}`}
        />
      ) : null}
      <input
        type="hidden"
        name="action"
        value={assignment.kind === "admin"
          ? "admin-membership-remove"
          : assignment.kind === "vip"
            ? "vip-membership-remove"
            : "membership-remove"}
      />
      {assignment.kind === "admin" ? (
        <AdminReferenceFields record={assignment.record} />
      ) : assignment.kind === "vip" ? (
        <VipReferenceFields record={assignment.record} />
      ) : (
        <CustomReferenceFields assignment={assignment} />
      )}
      <ConfirmSubmitButton
        className={styles.dangerButton}
        confirmation={`Remove ${assignment.playerName}'s ${assignment.groupName} access from ${assignment.scopeLabels.join(", ")}? Only this exact assignment is affected.`}
      >
        <Trash2 aria-hidden="true" />
        Remove
      </ConfirmSubmitButton>
    </form>
  );
}

function ConsolidateVipForm({
  actionUrl,
  assignment,
  csrf,
}: {
  actionUrl: string;
  assignment: VipAssignment;
  csrf: string;
}) {
  return (
    <form action={actionUrl} method="post">
      <input type="hidden" name="csrf" value={csrf} />
      <input type="hidden" name="action" value="vip-membership-consolidate" />
      <VipReferenceFields record={assignment.record} sourceField="targetSource" />
      <ConfirmSubmitButton
        className={styles.warningButton}
        confirmation={`Keep ${assignment.playerName}'s ${assignment.groupName} membership in ${assignment.scopeLabels.join(", ")} and consolidate the conflicting VIP state? Review the exact tier and expiry before continuing.`}
      >
        <ShieldAlert aria-hidden="true" />
        Keep &amp; consolidate
      </ConfirmSubmitButton>
    </form>
  );
}

function VipEditForm({
  actionUrl,
  assignment,
  csrf,
  vipGroups,
  vipScopes,
}: {
  actionUrl: string;
  assignment: VipAssignment;
  csrf: string;
  vipGroups: readonly string[];
  vipScopes: readonly AssignmentVipScope[];
}) {
  const [expiryMode, setExpiryMode] = useState("keep");
  const tiers = [...new Set([assignment.groupName, ...vipGroups])]
    .filter(Boolean)
    .sort((left, right) => left.localeCompare(right, "en", { sensitivity: "base" }));
  const durationRelevant = expiryMode === "extend" || expiryMode === "replace";
  const currentServerId = assignment.record.serverId ?? 0;
  const [selectedServerId, setSelectedServerId] = useState(currentServerId);
  const availableScopes = [...vipScopes];
  if (!availableScopes.some((scope) => scope.id === currentServerId)) {
    availableScopes.push({
      id: currentServerId,
      label: currentServerId === 0
        ? "All ARENA servers"
        : `VIP server ${currentServerId}`,
      description: "Discovered from this existing membership.",
      hasDefinitions: false,
    });
  }
  availableScopes.sort((left, right) => left.id - right.id);
  const selectedScope = availableScopes.find((scope) => scope.id === selectedServerId);

  return (
    <details className={styles.editDisclosure}>
      <summary>
        <PencilLine aria-hidden="true" />
        Edit VIP access
      </summary>
      <form className={styles.editForm} action={actionUrl} method="post">
        <input type="hidden" name="csrf" value={csrf} />
        <input type="hidden" name="action" value="vip-membership-edit" />
        <VipReferenceFields record={assignment.record} />
        <input
          type="hidden"
          name="expectedExpiresAt"
          value={assignment.expiresAt ?? ""}
        />
        <label>
          VIP tier
          <select name="newGroup" defaultValue={assignment.groupName} required>
            {tiers.map((tier) => <option key={tier}>{tier}</option>)}
          </select>
        </label>
        <label>
          Server scope
          <select
            name="newServerId"
            value={String(selectedServerId)}
            onChange={(event) => setSelectedServerId(Number(event.currentTarget.value))}
            required
          >
            {availableScopes.map((scope) => (
              <option
                key={scope.id}
                value={scope.id}
                disabled={!scope.hasDefinitions && scope.id !== currentServerId}
              >
                {scope.label}{scope.hasDefinitions ? "" : " · Legacy / orphaned"}
              </option>
            ))}
          </select>
          <small>
            {selectedScope?.description ??
              "Scopes without live definitions remain available for exact legacy-row maintenance."}
          </small>
        </label>
        <label>
          Expiry change
          <select
            name="expiryMode"
            value={expiryMode}
            onChange={(event) => setExpiryMode(event.currentTarget.value)}
          >
            <option value="keep">Keep current expiry</option>
            <option value="extend">Extend from current expiry</option>
            <option value="replace">Replace remaining duration</option>
            <option value="permanent">Make permanent</option>
          </select>
        </label>
        <label data-muted={!durationRelevant ? "true" : "false"}>
          Duration (minutes)
          <input
            name="durationMinutes"
            type="number"
            min={durationRelevant ? 1 : 0}
            max="525600"
            step="1"
            defaultValue={1440}
            inputMode="numeric"
            required
          />
          <small>
            {durationRelevant
              ? "1440 = 1 day, 10080 = 7 days, 43200 = 30 days."
              : "Ignored when the current expiry is kept or made permanent."}
          </small>
        </label>
        <div className={styles.editReview}>
          <ShieldCheck aria-hidden="true" />
          <span>
            <strong>Exact record update</strong>
            <small>Tier, scope, and expiry are checked again before saving.</small>
          </span>
        </div>
        <ConfirmSubmitButton
          className={styles.primaryButton}
          confirmation={`Save the edited ${assignment.groupName} VIP membership for ${assignment.playerName}? The exact source record will be updated.`}
        >
          <ShieldCheck aria-hidden="true" />
          Save VIP access
        </ConfirmSubmitButton>
      </form>
    </details>
  );
}

function AssignmentRecordCard({
  actionUrl,
  assignment,
  canManageAdmins,
  canManageGroups,
  canManageVips,
  csrf,
  customActionUrl,
  requestKeySeed,
  vipGroups,
  vipScopes,
}: {
  actionUrl: string;
  assignment: Assignment;
  canManageAdmins: boolean;
  canManageGroups: boolean;
  canManageVips: boolean;
  csrf: string;
  customActionUrl: string;
  requestKeySeed: string;
  vipGroups: readonly string[];
  vipScopes: readonly AssignmentVipScope[];
}) {
  const canManage = assignment.kind === "admin"
    ? canManageAdmins
    : assignment.kind === "vip"
      ? canManageVips
      : canManageGroups;
  const exactReference = assignment.kind === "admin"
    ? exactAdminReference(assignment.record)
    : assignment.kind === "vip"
      ? exactVipReference(assignment.record)
      : exactCustomReference(assignment.groupDefinition, assignment.record);
  const founderProtected = assignment.kind === "admin" && normalize(assignment.groupName) === "founder";
  const mutable = canManage && exactReference && assignment.status !== "revoked" && !founderProtected;
  const canExtend = mutable && !assignment.permanent && (
    assignment.kind === "admin"
      ? assignment.record.source === "portal" && assignment.record.enabled
      : assignment.status === "active" && !assignment.needsReview
  );
  const canRemove = mutable && (
    assignment.kind === "custom" ||
    assignment.kind === "vip" ||
    (assignment.kind === "admin" && (
      assignment.record.source === "portal" || assignment.record.enabled
    ))
  );
  const accent = assignment.groupDefinition?.badgeColor ??
    (assignment.kind === "vip"
      ? "#f2c76e"
      : assignment.kind === "custom"
        ? "#78d8ac"
        : "#78a7ff");
  const soft = assignment.groupDefinition?.badgeSoftColor ??
    (assignment.kind === "vip"
      ? "#fff0bd"
      : assignment.kind === "custom"
        ? "#c9f5df"
        : "#cbdcff");

  return (
    <li
      className={styles.assignmentRecord}
      data-ui="assignment-card"
      data-kind={assignment.kind}
      data-status={assignment.status}
      style={{
        "--assignment-accent": accent,
        "--assignment-soft": soft,
      } as CSSProperties}
    >
      <span className={styles.accentRail} aria-hidden="true" />
      <div className={styles.recordHeading}>
        <div className={styles.groupIdentity}>
          <GroupMark assignment={assignment} />
          <div>
            <span>{assignment.kind === "vip"
              ? "VIP membership"
              : assignment.kind === "custom"
                ? "Custom membership"
                : "Admin assignment"}</span>
            <strong>{assignment.groupName}</strong>
          </div>
        </div>
        <div className={styles.recordStates} aria-label="Assignment state">
          <span data-state={assignment.permanent && assignment.status === "active" ? "permanent" : assignment.status}>
            {statusLabel(assignment)}
          </span>
          {assignment.kind === "vip" &&
          assignment.record.source === "native" &&
          assignment.record.suppressedByPortal ? (
            <span data-state="preserved">Preserved, not effective</span>
          ) : null}
          {assignment.needsReview ? <span data-state="review">Review</span> : null}
        </div>
      </div>

      <div className={styles.scopeList} aria-label="Assignment scopes">
        {assignment.scopeLabels.map((scope, index) => (
          <span key={`${assignment.scopeKeys[index]}:${scope}`}>
            {assignment.kind === "vip" ? <Server aria-hidden="true" /> : <Network aria-hidden="true" />}
            {scope}
          </span>
        ))}
        <span className={styles.originBadge}>
          {assignment.kind !== "custom" && assignment.record.source === "native"
            ? <Server aria-hidden="true" />
            : <Database aria-hidden="true" />}
          {assignment.kind !== "custom" && assignment.record.source === "native"
            ? "Native plug-in record"
            : "Arena authority"}
        </span>
      </div>

      <dl className={styles.timeline}>
        <div>
          <dt><CalendarDays aria-hidden="true" /> Starts</dt>
          <dd>{formattedTime(
            assignment.startsAt,
            assignment.kind !== "custom" && assignment.record.source === "native"
              ? "Native record"
              : "Not recorded",
          )}</dd>
        </div>
        <div>
          <dt><CalendarClock aria-hidden="true" /> Expires</dt>
          <dd>
            {assignment.permanent ? (
              <span className={styles.permanentValue}><InfinityIcon aria-hidden="true" /> Never</span>
            ) : formattedTime(assignment.expiresAt, "Not recorded")}
          </dd>
        </div>
      </dl>

      {assignment.needsReview ? (
        <p className={styles.reviewNote} role="status">
          <ShieldAlert aria-hidden="true" />
          {assignment.kind === "vip"
            ? "This VIP state has a conflict, suppression marker, or incomplete reference. Review it before changing time."
            : assignment.kind === "custom"
              ? "This custom membership is missing its exact Arena reference. Refresh the registry before changing it."
              : "This Admin definition or scope is unavailable. Confirm the exact record before changing it."}
        </p>
      ) : null}

      {canManage ? (
        <div className={styles.recordActions} aria-label={`Manage ${assignment.groupName} for ${assignment.playerName}`}>
          {assignment.kind === "vip" && mutable ? (
            <VipEditForm
              actionUrl={actionUrl}
              assignment={assignment}
              csrf={csrf}
              vipGroups={vipGroups}
              vipScopes={vipScopes}
            />
          ) : null}
          {assignment.kind === "vip" &&
          assignment.needsReview &&
          assignment.status === "active" &&
          assignment.record.consolidationEligible &&
          exactReference ? (
            <ConsolidateVipForm
              actionUrl={actionUrl}
              assignment={assignment}
              csrf={csrf}
            />
          ) : null}
          {canExtend ? (
            <ExtendForm
              actionUrl={actionUrl}
              assignment={assignment}
              csrf={csrf}
              customActionUrl={customActionUrl}
              requestKeySeed={requestKeySeed}
            />
          ) : null}
          {canRemove ? (
            <RemoveForm
              actionUrl={actionUrl}
              assignment={assignment}
              csrf={csrf}
              customActionUrl={customActionUrl}
              requestKeySeed={requestKeySeed}
            />
          ) : null}
          {!exactReference ? (
            <p className={styles.actionUnavailable}>
              <ShieldAlert aria-hidden="true" /> Exact record reference is unavailable.
            </p>
          ) : founderProtected ? (
            <p className={styles.actionUnavailable}>
              <ShieldCheck aria-hidden="true" /> Founder authority is protected.
            </p>
          ) : null}
        </div>
      ) : null}
    </li>
  );
}

function QuickAdd({
  actionUrl,
  adminGroups,
  canManageAdmins,
  canManageGroups,
  canManageVips,
  csrf,
  customActionUrl,
  customGroups,
  requestKeySeed,
  view,
  vipGroups,
  vipScopes,
}: {
  actionUrl: string;
  adminGroups: readonly IdentityGroup[];
  canManageAdmins: boolean;
  canManageGroups: boolean;
  canManageVips: boolean;
  csrf: string;
  customActionUrl: string;
  customGroups: readonly IdentityGroup[];
  requestKeySeed: string;
  view: AssignmentWorkspaceView;
  vipGroups: readonly string[];
  vipScopes: readonly AssignmentVipScope[];
}) {
  const generatedId = useId().replaceAll(":", "");
  const showAdmin = canManageAdmins && (view === "all" || view === "admin");
  const showVip = canManageVips && (view === "all" || view === "vip");
  const showCustom = canManageGroups && (view === "all" || view === "custom");
  const writableVipScopes = vipScopes.filter((scope) => scope.hasDefinitions);
  if (!showAdmin && !showVip && !showCustom) return null;

  return (
    <details className={styles.quickAdd} data-ui="assignment-quick-add">
      <summary>
        <span className={styles.quickAddIcon}><Plus aria-hidden="true" /></span>
        <span>
          <strong>Add access</strong>
          <small>Choose a player, group, scope, and access period.</small>
        </span>
        <span className={styles.summaryAction}>Open forms</span>
      </summary>
      <div className={styles.quickAddGrid}>
        {showAdmin ? (
          <form className={styles.addForm} action={actionUrl} method="post">
            <input type="hidden" name="csrf" value={csrf} />
            <input type="hidden" name="action" value="admin-membership-assign" />
            <header>
              <span data-kind="admin"><ShieldCheck aria-hidden="true" /></span>
              <div><strong>Add Admin access</strong><small>Creates a timed or permanent Arena assignment.</small></div>
            </header>
            <PlayerSearchField
              id={`${generatedId}-admin-player`}
              name="steamId"
              label="Player"
              mode="target"
              required
              includeSelf
            />
            <label>
              Admin group
              <select name="groupId" defaultValue="" required>
                <option value="" disabled>Choose a group</option>
                {adminGroups.map((group) => (
                  <option key={group.id} value={group.id}>
                    {group.displayName} · {group.externalKey ?? group.key}
                  </option>
                ))}
              </select>
            </label>
            <label>
              Duration (minutes)
              <input name="durationMinutes" type="number" min="0" max="525600" defaultValue="1440" required />
              <small>0 = permanent, 10 = 10 minutes, 1440 = 1 day.</small>
            </label>
            <label>
              Internal reason
              <input name="reason" maxLength={180} placeholder="Optional audit note" />
            </label>
            <button className={styles.primaryButton} type="submit" disabled={!adminGroups.length}>
              <UserRoundCheck aria-hidden="true" /> Add Admin access
            </button>
          </form>
        ) : null}

        {showVip ? (
          <form className={styles.addForm} action={actionUrl} method="post">
            <input type="hidden" name="csrf" value={csrf} />
            <input type="hidden" name="action" value="vip-upsert" />
            <input type="hidden" name="name" defaultValue="" />
            <header>
              <span data-kind="vip"><Crown aria-hidden="true" /></span>
              <div><strong>Add VIP access</strong><small>Writes the selected tier to an explicit Arena scope.</small></div>
            </header>
            <PlayerSearchField
              id={`${generatedId}-vip-player`}
              name="steamId"
              label="Player"
              mode="target"
              required
              includeSelf
              companionNameField="name"
            />
            <label>
              VIP tier
              <select name="group" defaultValue="" required>
                <option value="" disabled>Choose a tier</option>
                {vipGroups.map((group) => <option key={group}>{group}</option>)}
              </select>
            </label>
            <label>
              Server scope
              <select
                name="serverId"
                defaultValue={writableVipScopes.length ? String(writableVipScopes[0].id) : ""}
                required
              >
                {!writableVipScopes.length ? <option value="">No writable scope configured</option> : null}
                {vipScopes.map((scope) => (
                  <option key={scope.id} value={scope.id} disabled={!scope.hasDefinitions}>
                    {scope.label}{scope.hasDefinitions ? "" : " · Legacy / orphaned"}
                  </option>
                ))}
              </select>
              <small>Legacy scopes stay visible but cannot receive new grants.</small>
            </label>
            <label>
              Duration (minutes)
              <input name="durationMinutes" type="number" min="0" max="525600" defaultValue="1440" required />
              <small>0 creates permanent VIP access.</small>
            </label>
            <button className={styles.primaryButton} type="submit" disabled={!vipGroups.length || !writableVipScopes.length}>
              <UserRoundCheck aria-hidden="true" /> Add VIP access
            </button>
          </form>
        ) : null}

        {showCustom ? (
          <form className={styles.addForm} action={customActionUrl} method="post">
            <input type="hidden" name="csrf" value={csrf} />
            <input type="hidden" name="requestKey" value={`${requestKeySeed}.assign.custom`} />
            <input type="hidden" name="action" value="membership-assign" />
            <header>
              <span data-kind="custom"><UsersRound aria-hidden="true" /></span>
              <div><strong>Add custom access</strong><small>Creates an Arena-global community membership.</small></div>
            </header>
            <PlayerSearchField
              id={`${generatedId}-custom-player`}
              name="steamId"
              label="Player"
              mode="target"
              required
              includeSelf
            />
            <label>
              Custom group
              <select name="groupId" defaultValue="" required>
                <option value="" disabled>Choose a group</option>
                {customGroups.map((group) => (
                  <option key={group.id} value={group.id}>{group.displayName}</option>
                ))}
              </select>
            </label>
            <label>
              Duration (minutes)
              <input name="durationMinutes" type="number" min="0" max="525600" defaultValue="0" required />
              <small>0 creates permanent access; 10080 is 7 days.</small>
            </label>
            <label>
              Internal reason
              <input name="reason" maxLength={180} placeholder="Optional audit note" />
            </label>
            <button className={styles.primaryButton} type="submit" disabled={!customGroups.length}>
              <UserRoundCheck aria-hidden="true" /> Add custom access
            </button>
          </form>
        ) : null}
      </div>
    </details>
  );
}

function SummaryCard({
  icon: Icon,
  label,
  value,
  tone,
}: {
  icon: typeof UsersRound;
  label: string;
  value: number;
  tone: "neutral" | "success" | "warning" | "accent";
}) {
  return (
    <article className={styles.summaryCard} data-tone={tone}>
      <span><Icon aria-hidden="true" /></span>
      <div><strong>{value.toLocaleString("en-US")}</strong><small>{label}</small></div>
    </article>
  );
}

function compareAssignments(left: Assignment, right: Assignment) {
  const stateOrder = { active: 0, scheduled: 1, expired: 2, revoked: 3 } as const;
  const kindOrder = { admin: 0, vip: 1, custom: 2 } as const;
  const stateDifference = stateOrder[left.status] - stateOrder[right.status];
  if (stateDifference) return stateDifference;
  if (left.kind !== right.kind) return kindOrder[left.kind] - kindOrder[right.kind];
  return left.groupName.localeCompare(right.groupName, "en", {
    sensitivity: "base",
    numeric: true,
  });
}

export function AssignmentsWorkspace({
  csrf,
  identities,
  adminPlayers,
  vipPlayers,
  groups,
  vipGroups,
  vipScopes = [],
  inventorySummaries = {},
  canManageAdmins,
  canManageGroups = false,
  canManageVips,
  assignmentView = "all",
  actionUrl = "/api/admin/staff",
  customActionUrl = "/api/admin/groups",
  requestKeySeed = "assignment-session",
}: AssignmentsWorkspaceProps) {
  const [view, setView] = useState<AssignmentWorkspaceView>(assignmentView);
  const [query, setQuery] = useState("");
  const [selectedPlayerSteamId, setSelectedPlayerSteamId] = useState<string | null>(null);
  const [searchResetKey, setSearchResetKey] = useState(0);
  const [scope, setScope] = useState("all");
  const [status, setStatus] = useState<StatusFilter>("all");
  const deferredQuery = useDeferredValue(query);
  const generatedId = useId().replaceAll(":", "");
  const now = Date.now();

  useEffect(() => {
    setView(assignmentView);
  }, [assignmentView]);

  const effectiveVipScopes = useMemo(
    () => effectiveVipScopeOptions(vipScopes),
    [vipScopes],
  );

  const assignments = useMemo(
    () => assignmentRecords({
      adminPlayers,
      groups,
      identities,
      vipPlayers,
      vipScopes: effectiveVipScopes,
    }),
    [adminPlayers, effectiveVipScopes, groups, identities, vipPlayers],
  );
  const adminGroups = useMemo(
    () => groups.filter((group) =>
      group.enabled &&
      group.sourceType === "admins_core" &&
      normalize(group.externalKey ?? group.displayName) !== "founder"),
    [groups],
  );
  const customGroups = useMemo(
    () => groups.filter((group) => group.enabled && group.sourceType === "custom"),
    [groups],
  );
  const profileSearchPlayers = useMemo(
    () => Object.values(identities).map((identity): PlayerSearchResult => ({
      steamId: identity.steamId,
      displayName: identity.displayName,
      avatarUrl: identity.avatarUrl,
      presence: identity.presence,
      profileThemeKey: identity.profileThemeKey,
      inventoryVisibility: "private",
    })),
    [identities],
  );
  const scopeOptions = useMemo(() => {
    const options: Array<readonly [string, string]> = [["all", "All ARENA servers"]];
    for (const registered of registeredServerScopes(effectiveVipScopes)) {
      options.push([
        registeredServerScopeKey(registered),
        registered.label.trim() || `Arena server ${registered.id}`,
      ]);
    }
    return options;
  }, [effectiveVipScopes]);
  const normalizedQuery = normalize(selectedPlayerSteamId ?? deferredQuery);
  const visibleAssignments = assignments.filter((assignment) =>
    (view === "all" || assignment.kind === view) &&
    (scope === "all" ||
      assignment.scopeKeys.includes(globalArenaScopeKey) ||
      assignment.scopeKeys.includes(scope)) &&
    matchesStatus(assignment, status, now) &&
    (!normalizedQuery || searchableText(assignment, identities[assignment.steamId]).includes(normalizedQuery)));
  const groupedPlayers = useMemo(() => {
    const result = new Map<string, Assignment[]>();
    for (const assignment of visibleAssignments) {
      const records = result.get(assignment.steamId) ?? [];
      records.push(assignment);
      result.set(assignment.steamId, records);
    }
    return [...result].map(([steamId, records]): PlayerAssignments => {
      const first = records[0];
      return {
        steamId,
        identity: identities[steamId] ?? fallbackIdentity(steamId, first?.playerName ?? steamId),
        records: records.sort(compareAssignments),
      };
    }).sort((left, right) =>
      left.identity.displayName.localeCompare(right.identity.displayName, "en", {
        sensitivity: "base",
        numeric: true,
      }));
  }, [identities, visibleAssignments]);
  const allPlayerCount = new Set(assignments.map((assignment) => assignment.steamId)).size;
  const activeCount = assignments.filter((assignment) => assignment.status === "active").length;
  const expiringCount = assignments.filter((assignment) => isExpiring(assignment, now)).length;
  const reviewCount = new Set(
    assignments.filter((assignment) => assignment.needsReview).map((assignment) => assignment.steamId),
  ).size;
  const adminCount = assignments.filter((assignment) => assignment.kind === "admin").length;
  const vipCount = assignments.filter((assignment) => assignment.kind === "vip").length;
  const customCount = assignments.filter((assignment) => assignment.kind === "custom").length;
  const filtersActive = Boolean(query || selectedPlayerSteamId || scope !== "all" || status !== "all");
  const resultStatusId = `${generatedId}-results-status`;

  function clearFilters() {
    setQuery("");
    setSelectedPlayerSteamId(null);
    setSearchResetKey((current) => current + 1);
    setScope("all");
    setStatus("all");
  }

  return (
    <section
      className={styles.root}
      id="assignments"
      data-ui="assignments-workspace"
      aria-labelledby={`${generatedId}-title`}
    >
      <header className={styles.workspaceHeader}>
        <div>
          <p className={styles.eyebrow}><UsersRound aria-hidden="true" /> Access control</p>
          <h2 id={`${generatedId}-title`}>Assignments</h2>
          <p>Manage Admin, VIP, and custom access from one player-focused workspace. Every action targets one exact Arena membership and scope.</p>
        </div>
        <span className={styles.liveSource}><Database aria-hidden="true" /> Live Arena records</span>
      </header>

      <div className={styles.summaryGrid} aria-label="Assignment summary">
        <SummaryCard icon={UsersRound} label="players with access" value={allPlayerCount} tone="neutral" />
        <SummaryCard icon={UserRoundCheck} label="active records" value={activeCount} tone="success" />
        <SummaryCard icon={Clock3} label="expire within 7 days" value={expiringCount} tone="accent" />
        <SummaryCard icon={ShieldAlert} label="players need review" value={reviewCount} tone="warning" />
      </div>

      <div className={styles.segmented} role="group" aria-label="Assignment type">
        <button type="button" data-active={view === "all"} aria-pressed={view === "all"} onClick={() => setView("all")}>
          <UsersRound aria-hidden="true" /> All <span>{assignments.length}</span>
        </button>
        <button id="admin-assignments" type="button" data-active={view === "admin"} aria-pressed={view === "admin"} onClick={() => setView("admin")}>
          <ShieldCheck aria-hidden="true" /> Admin <span>{adminCount}</span>
        </button>
        <button id="vip-assignments" type="button" data-active={view === "vip"} aria-pressed={view === "vip"} onClick={() => setView("vip")}>
          <Crown aria-hidden="true" /> VIP <span>{vipCount}</span>
        </button>
        <button id="custom-assignments" type="button" data-active={view === "custom"} aria-pressed={view === "custom"} onClick={() => setView("custom")}>
          <UsersRound aria-hidden="true" /> Custom <span>{customCount}</span>
        </button>
      </div>

      <QuickAdd
        actionUrl={actionUrl}
        adminGroups={adminGroups}
        canManageAdmins={canManageAdmins}
        canManageGroups={canManageGroups}
        canManageVips={canManageVips}
        csrf={csrf}
        customActionUrl={customActionUrl}
        customGroups={customGroups}
        requestKeySeed={requestKeySeed}
        view={view}
        vipGroups={vipGroups}
        vipScopes={effectiveVipScopes}
      />

      <section className={styles.roster} aria-labelledby={`${generatedId}-roster-title`}>
        <div className={styles.rosterHeading}>
          <div>
            <p className={styles.eyebrow}><Filter aria-hidden="true" /> Membership roster</p>
            <h3 id={`${generatedId}-roster-title`}>Find and manage access</h3>
          </div>
          <output htmlFor={`${generatedId}-search ${generatedId}-scope ${generatedId}-status`}>
            <strong>{visibleAssignments.length}</strong> records · {groupedPlayers.length} players
          </output>
        </div>

        <div className={styles.filters}>
          <PlayerSearchField
            className={styles.searchField}
            id={`${generatedId}-search`}
            includeSelf
            key={searchResetKey}
            label="Search player profiles"
            localPlayers={profileSearchPlayers}
            mode="query"
            name="assignmentPlayerQuery"
            placeholder="Player name or SteamID64"
            helpText="Choose a profile for an exact match, or keep typing to filter assignments."
            onQueryChange={setQuery}
            onSelectionChange={(player) => setSelectedPlayerSteamId(player?.steamId ?? null)}
          />
          <label>
            <span>Scope</span>
            <select id={`${generatedId}-scope`} value={scope} onChange={(event) => setScope(event.currentTarget.value)}>
              {scopeOptions.map(([value, label]) => <option key={value} value={value}>{label}</option>)}
            </select>
          </label>
          <label>
            <span>Status</span>
            <select id={`${generatedId}-status`} value={status} onChange={(event) => setStatus(event.currentTarget.value as StatusFilter)}>
              <option value="all">Every status</option>
              <option value="active">Active</option>
              <option value="permanent">Permanent</option>
              <option value="expiring">Expiring in 7 days</option>
              <option value="scheduled">Scheduled</option>
              <option value="expired">Expired</option>
              <option value="revoked">Revoked</option>
              <option value="review">Needs review</option>
            </select>
          </label>
          <button className={styles.clearButton} type="button" onClick={clearFilters} disabled={!filtersActive}>
            <X aria-hidden="true" /> Clear filters
          </button>
        </div>
        <span className="sr-only" id={resultStatusId} role="status" aria-live="polite">
          {visibleAssignments.length} matching assignment{visibleAssignments.length === 1 ? "" : "s"} for {groupedPlayers.length} player{groupedPlayers.length === 1 ? "" : "s"}.
        </span>

        {groupedPlayers.length ? (
          <div className={styles.playerList}>
            {groupedPlayers.map((player) => (
              <ThemedPlayerContainer
                as="article"
                className={styles.playerCard}
                containerKind="management"
                ownerSteamId={player.steamId}
                profileThemeKey={player.identity.profileThemeKey}
                data-assignment-card="true"
                key={player.steamId}
              >
                <div
                  className={styles.playerHeader}
                >
                  <PlayerIdentity player={player.identity} variant="compact" showSteamId />
                  <span className={styles.playerCount}>
                    {player.records.length} assignment{player.records.length === 1 ? "" : "s"}
                  </span>
                </div>
                {inventorySummaries[player.steamId]?.total ? (
                  <aside className={styles.inventoryContext} aria-label={`${player.identity.displayName}'s VIP inventory`}>
                    <span className={styles.inventoryIcon}><PackageOpen aria-hidden="true" /></span>
                    <div>
                      <strong>VIP inventory</strong>
                      <span>
                        {inventorySummaries[player.steamId].available} ready
                        {inventorySummaries[player.steamId].pending || inventorySummaries[player.steamId].pendingJobs
                          ? ` · ${Math.max(inventorySummaries[player.steamId].pending, inventorySummaries[player.steamId].pendingJobs)} pending`
                          : ""}
                        {inventorySummaries[player.steamId].consumed
                          ? ` · ${inventorySummaries[player.steamId].consumed} consumed`
                          : ""}
                      </span>
                      {inventorySummaries[player.steamId].availableProducts.length ? (
                        <small>
                          {inventorySummaries[player.steamId].availableProducts
                            .slice(0, 3)
                            .map((product) => `${product.name} ×${product.count}`)
                            .join(" · ")}
                        </small>
                      ) : null}
                    </div>
                    <Link
                      href={`/admin/inventories?steamId=${encodeURIComponent(player.steamId)}&inventoryType=vip_membership`}
                    >
                      Open inventory
                    </Link>
                  </aside>
                ) : null}
                <ul className={styles.recordList} aria-label={`${player.identity.displayName}'s assignments`}>
                  {player.records.map((assignment) => (
                    <AssignmentRecordCard
                      actionUrl={actionUrl}
                      assignment={assignment}
                      canManageAdmins={canManageAdmins}
                      canManageGroups={canManageGroups}
                      canManageVips={canManageVips}
                      csrf={csrf}
                      customActionUrl={customActionUrl}
                      requestKeySeed={requestKeySeed}
                      vipGroups={vipGroups}
                      vipScopes={effectiveVipScopes}
                      key={assignment.key}
                    />
                  ))}
                </ul>
              </ThemedPlayerContainer>
            ))}
          </div>
        ) : (
          <div className={styles.empty} data-ui="empty-state">
            <ShieldCheck aria-hidden="true" />
            <div>
              <strong>No assignments match these filters</strong>
              <p>Clear a filter or search for another player, group, or scope.</p>
            </div>
            {filtersActive ? <button className={styles.secondaryButton} type="button" onClick={clearFilters}>Clear filters</button> : null}
          </div>
        )}
      </section>
    </section>
  );
}
