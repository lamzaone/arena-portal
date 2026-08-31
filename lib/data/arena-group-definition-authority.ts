import "server-only";

import { createHash } from "node:crypto";

import type {
  Pool,
  PoolConnection,
  ResultSetHeader,
  RowDataPacket,
} from "mysql2/promise";

import { configuredGameServerGuid } from "@/lib/admin/server-scope";
import { getGameDatabasePool } from "@/lib/data/database-pools";
import { configuredArenaServerScopeLink } from "@/lib/data/arena-scope-resolution.mjs";

const UUID_NAMESPACE = "4d0af56f-9bc8-5e2c-9aa1-efbe5f8a62b4";
const GLOBAL_SCOPE_UUID = "00000000-0000-0000-0000-000000000001";
const GUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

type AuthorityGroupType = "admin" | "vip";

type AdminGroupRow = RowDataPacket & {
  Id: number | string;
  Name: string;
  Permissions: unknown;
  Servers: unknown;
  Immunity: number | string;
};

type AdminServerRow = RowDataPacket & {
  Hostname: string | null;
  GUID: string;
};

type VipGroupRow = RowDataPacket & {
  server_id: number | string;
  name: string;
  weight: number | string;
  values_json: unknown;
  enabled: number | string | boolean;
};

type ArenaScopeRow = RowDataPacket & {
  id: number | string;
  scope_uuid: string;
  scope_key: string;
  scope_type: "global" | "server";
  display_name: string;
  admin_server_guid: string | null;
  vip_server_id: number | string | null;
  enabled: number | string | boolean;
  row_version: number | string;
};

type ArenaGroupRow = RowDataPacket & {
  id: number | string;
  group_uuid: string;
  legacy_portal_group_id: number | string | null;
  group_key: string;
  group_type: "admin" | "vip" | "custom";
  external_key: string | null;
  vip_family_key: string | null;
  display_name: string;
  rank_weight: number | string;
  immunity: number | string;
  definition: unknown;
  baseline_permissions: unknown;
  capability_keys: unknown;
  enabled: number | string | boolean;
  row_version: number | string;
};

type ArenaGroupScopeRow = RowDataPacket & {
  group_id: number | string;
  scope_id: number | string;
  definition_override: unknown;
  rank_weight_override: number | string | null;
  immunity_override: number | string | null;
  enabled: number | string | boolean;
  row_version: number | string;
};

type PortalAdapterRow = RowDataPacket & {
  id: number | string;
  source_type: "admins_core" | "vipcore";
  external_key: string;
};

type PortalBridgeTarget = {
  portalGroupId: number;
  arenaGroupUuid: string;
  arenaGroupKey: string;
  arenaScopeUuid: string;
  arenaGroupType: AuthorityGroupType;
  vipFamilyKey: string | null;
  displayName: string;
  rankWeight: number;
  arenaGroupRowVersion: number;
};

type PortalCatalogueTargetRow = RowDataPacket & {
  catalogue_id: number | string;
  listing_id: number | string;
  duration_minutes: number | string;
};

type DesiredScopeAssignment = {
  scopeId: number;
  definitionOverride: Record<string, unknown> | null;
  rankWeightOverride: number | null;
  immunityOverride: number | null;
  enabled: boolean;
};

type AuthorityState = {
  scopes: ArenaScopeRow[];
  groups: ArenaGroupRow[];
  groupScopes: ArenaGroupScopeRow[];
  usedGroupKeys: Map<string, number>;
};

export type ArenaRuntimeAuthorityRenameHint = {
  sourceType: "admins_core" | "vipcore";
  previousExternalKey: string;
  nextExternalKey: string;
  adminRowId?: number;
  vipServerId?: number;
};

export class ArenaGroupDefinitionAuthorityError extends Error {
  constructor(
    public readonly code: "authority_storage" | "authority_conflict",
    message: string,
  ) {
    super(message);
    this.name = "ArenaGroupDefinitionAuthorityError";
  }
}

function authorityError(
  code: ArenaGroupDefinitionAuthorityError["code"],
  message: string,
): never {
  throw new ArenaGroupDefinitionAuthorityError(code, message);
}

function uuidBytes(uuid: string) {
  const normalized = uuid.toLowerCase().replaceAll("-", "");
  return Buffer.from(normalized, "hex");
}

function formatUuid(bytes: Uint8Array) {
  const hex = Buffer.from(bytes).toString("hex");
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
}

function deterministicUuid(name: string) {
  const digest = createHash("sha1")
    .update(uuidBytes(UUID_NAMESPACE))
    .update(Buffer.from(name, "utf8"))
    .digest()
    .subarray(0, 16);
  digest[6] = (digest[6] & 0x0f) | 0x50;
  digest[8] = (digest[8] & 0x3f) | 0x80;
  return formatUuid(digest).toLowerCase();
}

function shortHash(value: string, length = 10) {
  return createHash("sha256").update(value).digest("hex").slice(0, length);
}

function normalizedName(value: unknown) {
  return String(value ?? "").normalize("NFKC").trim().toLocaleLowerCase("en-US");
}

function sameName(left: unknown, right: unknown) {
  return normalizedName(left) === normalizedName(right);
}

function normalizedGuid(value: unknown) {
  const guid = String(value ?? "").trim().toLowerCase();
  return GUID_PATTERN.test(guid) ? guid : null;
}

function safeKeySegment(value: unknown) {
  const segment = normalizedName(value)
    .normalize("NFKD")
    .replace(/[^a-z0-9._:-]+/g, ".")
    .replace(/^[^a-z0-9]+/, "")
    .replace(/\.+/g, ".")
    .replace(/[.:-]+$/, "");
  return segment || "unnamed";
}

function boundedKey(prefix: string, value: unknown, identity: string, maximum = 64) {
  const raw = `${prefix}.${safeKeySegment(value)}`;
  if (raw.length <= maximum) return raw;
  const suffix = `.${shortHash(identity)}`;
  return `${raw.slice(0, maximum - suffix.length).replace(/[.:-]+$/, "")}${suffix}`;
}

function uniqueGroupKey(state: AuthorityState, prefix: string, name: string, identity: string) {
  const candidate = boundedKey(prefix, name, identity);
  if (!state.usedGroupKeys.has(candidate.toLowerCase())) return candidate;
  const suffix = `.${shortHash(identity)}`;
  return `${candidate.slice(0, 64 - suffix.length).replace(/[.:-]+$/, "")}${suffix}`;
}

function integerValue(value: unknown, fallback = 0) {
  const parsed = Number(value);
  return Number.isSafeInteger(parsed) ? parsed : fallback;
}

function booleanValue(value: unknown) {
  return value === true || value === 1 || value === "1" || value === "true";
}

function storedStringList(value: unknown, maximumEntries = 1_000) {
  let values: unknown[] = [];
  if (Array.isArray(value)) {
    values = value;
  } else if (typeof value === "string" && value.trim()) {
    try {
      const parsed: unknown = JSON.parse(value);
      values = Array.isArray(parsed) ? parsed : value.split(/[\r\n,]+/);
    } catch {
      values = value.split(/[\r\n,]+/);
    }
  }
  const unique = new Map<string, string>();
  for (const entry of values) {
    const text = String(entry ?? "").normalize("NFKC").trim();
    if (!text || text.length > 255 || /[\u0000-\u001f\u007f]/.test(text)) continue;
    const identity = normalizedName(text);
    if (!unique.has(identity)) unique.set(identity, text);
    if (unique.size >= maximumEntries) break;
  }
  return [...unique.values()];
}

function permissionList(value: unknown) {
  return storedStringList(value)
    .map((permission) => permission.toLocaleLowerCase("en-US"))
    .filter(
      (permission) =>
        permission === "*" || /^[a-z0-9][a-z0-9.*:_-]{0,95}$/.test(permission),
    );
}

function parseJson(value: unknown): unknown {
  if (typeof value !== "string") return value;
  try {
    return JSON.parse(value) as unknown;
  } catch {
    return null;
  }
}

function jsonObject(value: unknown) {
  const parsed = parseJson(value);
  return parsed && typeof parsed === "object" && !Array.isArray(parsed)
    ? parsed as Record<string, unknown>
    : null;
}

function canonicalJson(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(canonicalJson).join(",")}]`;
  if (value && typeof value === "object") {
    return `{${Object.entries(value as Record<string, unknown>)
      .sort(([left], [right]) => left.localeCompare(right))
      .map(([key, entry]) => `${JSON.stringify(key)}:${canonicalJson(entry)}`)
      .join(",")}}`;
  }
  return JSON.stringify(value) ?? "null";
}

function sameJson(left: unknown, right: unknown) {
  return canonicalJson(parseJson(left)) === canonicalJson(right);
}

function actorValue(value: unknown) {
  const actor = String(value ?? "system:runtime-definition-sync")
    .normalize("NFKC")
    .trim()
    .slice(0, 64);
  return actor || "system:runtime-definition-sync";
}

function authorityStorageMissing(error: unknown) {
  const candidate = error as { code?: unknown; errno?: unknown };
  return candidate.code === "ER_NO_SUCH_TABLE" || candidate.errno === 1146 ||
    candidate.code === "ER_BAD_FIELD_ERROR" || candidate.errno === 1054;
}

function rethrowAuthorityStorage(error: unknown): never {
  if (error instanceof ArenaGroupDefinitionAuthorityError) throw error;
  if (authorityStorageMissing(error)) {
    authorityError(
      "authority_storage",
      "Arena group authority migration 001 is required before runtime group definitions can be changed.",
    );
  }
  throw error;
}

async function loadAuthorityState(connection: PoolConnection): Promise<AuthorityState> {
  const [scopes] = await connection.query<ArenaScopeRow[]>(
    "SELECT id, scope_uuid, scope_key, scope_type, display_name, admin_server_guid, " +
      "vip_server_id, enabled, row_version FROM arena_scopes ORDER BY id FOR UPDATE",
  );
  const [groups] = await connection.query<ArenaGroupRow[]>(
    "SELECT id, group_uuid, legacy_portal_group_id, group_key, group_type, external_key, " +
      "vip_family_key, display_name, rank_weight, immunity, definition, " +
      "baseline_permissions, capability_keys, enabled, row_version " +
      "FROM arena_groups ORDER BY id FOR UPDATE",
  );
  const [groupScopes] = await connection.query<ArenaGroupScopeRow[]>(
    "SELECT group_id, scope_id, definition_override, rank_weight_override, immunity_override, " +
      "enabled, row_version FROM arena_group_scopes ORDER BY group_id, scope_id FOR UPDATE",
  );
  return {
    scopes,
    groups,
    groupScopes,
    usedGroupKeys: new Map(
      groups.map((group) => [String(group.group_key).toLowerCase(), integerValue(group.id)]),
    ),
  };
}

async function ensureScope(
  connection: PoolConnection,
  state: AuthorityState,
  input: {
    scopeUuid: string;
    scopeKey: string;
    scopeType: "global" | "server";
    displayName: string;
    adminServerGuid: string | null;
    vipServerId: number | null;
  },
) {
  const byUuid = state.scopes.find(
    (scope) => String(scope.scope_uuid).toLowerCase() === input.scopeUuid,
  );
  const byAdminGuid = input.adminServerGuid
    ? state.scopes.find((scope) => sameName(scope.admin_server_guid, input.adminServerGuid))
    : null;
  const byVipServer = input.vipServerId === null
    ? null
    : state.scopes.find(
        (scope) => scope.vip_server_id !== null && integerValue(scope.vip_server_id, -1) === input.vipServerId,
      );
  const matches = [...new Set([byUuid, byAdminGuid, byVipServer].filter(Boolean))];
  if (matches.length > 1) {
    authorityError(
      "authority_conflict",
      `Arena scope locators for ${input.displayName} resolve to different stored scopes. Merge the split Admins.Core/VIPCore scopes before changing definitions.`,
    );
  }
  let scope = matches[0] ?? null;
  if (!scope) {
    const [result] = await connection.execute<ResultSetHeader>(
      "INSERT INTO arena_scopes " +
        "(scope_uuid, scope_key, scope_type, display_name, admin_server_guid, vip_server_id, enabled, row_version) " +
        "VALUES (?, ?, ?, ?, ?, ?, TRUE, 1)",
      [
        input.scopeUuid,
        input.scopeKey,
        input.scopeType,
        input.displayName.slice(0, 100),
        input.adminServerGuid,
        input.vipServerId,
      ],
    );
    scope = {
      id: result.insertId,
      scope_uuid: input.scopeUuid,
      scope_key: input.scopeKey,
      scope_type: input.scopeType,
      display_name: input.displayName.slice(0, 100),
      admin_server_guid: input.adminServerGuid,
      vip_server_id: input.vipServerId,
      enabled: true,
      row_version: 1,
    } as ArenaScopeRow;
    state.scopes.push(scope);
    return scope;
  }
  const existingAdminGuid = normalizedGuid(scope.admin_server_guid);
  const existingVipServer = scope.vip_server_id === null
    ? null
    : integerValue(scope.vip_server_id, -1);
  if (
    existingAdminGuid && input.adminServerGuid && existingAdminGuid !== input.adminServerGuid
  ) {
    authorityError("authority_conflict", "An Arena scope is already bound to another Admins.Core GUID.");
  }
  if (
    existingVipServer !== null && input.vipServerId !== null && existingVipServer !== input.vipServerId
  ) {
    authorityError("authority_conflict", "An Arena scope is already bound to another VIPCore server ID.");
  }
  if (scope.scope_type !== input.scopeType) {
    authorityError("authority_conflict", "An Arena scope locator changed between global and server scope.");
  }
  const nextAdminGuid = existingAdminGuid ?? input.adminServerGuid;
  const nextVipServer = existingVipServer ?? input.vipServerId;
  const nextScopeKey = input.scopeKey;
  const nextDisplayName = input.displayName.slice(0, 100);
  const changed = nextAdminGuid !== existingAdminGuid ||
    nextVipServer !== existingVipServer ||
    String(scope.scope_key) !== nextScopeKey ||
    String(scope.display_name) !== nextDisplayName ||
    !booleanValue(scope.enabled);
  if (changed) {
    await connection.execute(
      "UPDATE arena_scopes SET scope_key = ?, display_name = ?, admin_server_guid = ?, vip_server_id = ?, " +
        "enabled = TRUE, row_version = row_version + 1 WHERE id = ?",
      [nextScopeKey, nextDisplayName, nextAdminGuid, nextVipServer, integerValue(scope.id)],
    );
    scope.scope_key = nextScopeKey;
    scope.display_name = nextDisplayName;
    scope.admin_server_guid = nextAdminGuid;
    scope.vip_server_id = nextVipServer;
    scope.enabled = true;
    scope.row_version = integerValue(scope.row_version, 1) + 1;
  }
  return scope;
}

async function ensureGlobalScope(connection: PoolConnection, state: AuthorityState) {
  return ensureScope(connection, state, {
    scopeUuid: GLOBAL_SCOPE_UUID,
    scopeKey: "global",
    scopeType: "global",
    displayName: "All ARENA servers",
    adminServerGuid: null,
    vipServerId: 0,
  });
}

async function loadScopeDirectories(connection: PoolConnection) {
  const [adminServers] = await connection.query<AdminServerRow[]>(
    "SELECT Hostname, GUID FROM servers ORDER BY Id",
  );
  const physicalServerLink = configuredArenaServerScopeLink(
    configuredGameServerGuid(),
    process.env.GAME_VIP_SERVER_ID ?? "1",
  );
  return {
    adminServerNames: new Map(
      adminServers
        .map((row) => {
          const guid = normalizedGuid(row.GUID);
          return guid ? [guid, String(row.Hostname || `Admins.Core ${guid.slice(0, 8)}`)] as const : null;
        })
        .filter((entry): entry is readonly [string, string] => Boolean(entry)),
    ),
    physicalServerLink,
  };
}

async function ensureAdminScope(
  connection: PoolConnection,
  state: AuthorityState,
  guid: string,
  displayName: string,
  vipServerId: number | null,
) {
  const existing = state.scopes.find(
    (scope) => sameName(scope.admin_server_guid, guid),
  ) ?? (vipServerId === null
    ? null
    : state.scopes.find(
        (scope) => scope.vip_server_id !== null &&
          integerValue(scope.vip_server_id, -1) === vipServerId,
      ));
  return ensureScope(connection, state, {
    scopeUuid: existing
      ? String(existing.scope_uuid).toLowerCase()
      : deterministicUuid(`scope:server:admin-guid:${guid}`),
    scopeKey: vipServerId !== null
      ? boundedKey("server", guid, guid, 96)
      : existing
        ? String(existing.scope_key)
        : boundedKey("server", guid, guid, 96),
    scopeType: "server",
    displayName,
    adminServerGuid: guid,
    vipServerId,
  });
}

async function ensureVipScope(
  connection: PoolConnection,
  state: AuthorityState,
  serverId: number,
  adminGuid: string | null,
  displayName: string,
) {
  if (serverId === 0) return ensureGlobalScope(connection, state);
  const matchedByAdminGuid = adminGuid
    ? state.scopes.find((scope) => sameName(scope.admin_server_guid, adminGuid))
    : null;
  const matchedByVipServer = state.scopes.find(
    (scope) => scope.vip_server_id !== null &&
      integerValue(scope.vip_server_id, -1) === serverId,
  );
  const existing = matchedByAdminGuid ?? matchedByVipServer ?? null;
  return ensureScope(connection, state, {
    scopeUuid: existing
      ? String(existing.scope_uuid).toLowerCase()
      : deterministicUuid(`scope:server:vip-id:${serverId}`),
    scopeKey: adminGuid
      ? boundedKey("server", adminGuid, adminGuid, 96)
      : existing
        ? String(existing.scope_key)
        : boundedKey("server", `vip-${serverId}`, String(serverId), 96),
    scopeType: "server",
    displayName,
    adminServerGuid: adminGuid,
    vipServerId: serverId,
  });
}

function adminNativeRowId(group: ArenaGroupRow) {
  const definition = jsonObject(group.definition);
  const rowId = integerValue(definition?.nativeRowId, -1);
  return rowId > 0 ? rowId : null;
}

function existingGroupForDefinition(
  state: AuthorityState,
  input: {
    groupType: AuthorityGroupType;
    externalKey: string;
    nativeAdminRowId?: number;
    renameHint?: ArenaRuntimeAuthorityRenameHint;
  },
  claimedGroupIds: Set<number>,
) {
  const candidates = state.groups.filter(
    (group) => group.group_type === input.groupType && !claimedGroupIds.has(integerValue(group.id)),
  );
  if (input.groupType === "admin" && input.nativeAdminRowId) {
    const byNativeId = candidates.find(
      (group) => adminNativeRowId(group) === input.nativeAdminRowId,
    );
    if (byNativeId) return byNativeId;
  }
  const byExternalKey = candidates.find(
    (group) => sameName(group.external_key, input.externalKey),
  );
  if (byExternalKey) return byExternalKey;
  const hint = input.renameHint;
  if (
    hint &&
    (hint.sourceType === "admins_core" ? input.groupType === "admin" : input.groupType === "vip") &&
    sameName(hint.nextExternalKey, input.externalKey)
  ) {
    return candidates.find((group) => sameName(group.external_key, hint.previousExternalKey)) ?? null;
  }
  return null;
}

async function insertAuthorityGroup(
  connection: PoolConnection,
  state: AuthorityState,
  input: {
    groupType: AuthorityGroupType;
    externalKey: string;
    displayName: string;
    rankWeight: number;
    immunity: number;
    definition: Record<string, unknown>;
    baselinePermissions: string[];
    capabilityKeys: string[];
    enabled: boolean;
    actor: string;
  },
) {
  const identity = `${input.groupType}:${normalizedName(input.externalKey)}`;
  const groupUuid = deterministicUuid(`group:${identity}`);
  const uuidOwner = state.groups.find(
    (group) => String(group.group_uuid).toLowerCase() === groupUuid,
  );
  if (uuidOwner) {
    authorityError(
      "authority_conflict",
      `Arena group UUID ${groupUuid} is already owned by another definition.`,
    );
  }
  const groupKey = uniqueGroupKey(state, input.groupType, input.externalKey, identity);
  const [result] = await connection.execute<ResultSetHeader>(
    "INSERT INTO arena_groups " +
      "(group_uuid, legacy_portal_group_id, group_key, group_type, external_key, vip_family_key, " +
      "display_name, description, badge_label, badge_icon_key, badge_color, badge_soft_color, " +
      "profile_priority, rank_weight, immunity, definition, baseline_permissions, capability_keys, " +
      "enabled, row_version, created_by_actor, updated_by_actor) " +
      "VALUES (?, NULL, ?, ?, ?, ?, ?, ?, ?, 'shield', '#f0b35a', '#ffe4b8', ?, ?, ?, ?, ?, ?, ?, 1, ?, ?)",
    [
      groupUuid,
      groupKey,
      input.groupType,
      input.externalKey,
      input.groupType === "vip" ? "vipcore" : null,
      input.displayName.slice(0, 100),
      input.groupType === "vip"
        ? "VIPCore runtime group"
        : "Admins.Core runtime group",
      input.displayName.toLocaleUpperCase("en-US").slice(0, 32),
      Math.max(-32_768, Math.min(32_767, input.rankWeight)),
      input.rankWeight,
      input.immunity,
      JSON.stringify(input.definition),
      JSON.stringify(input.baselinePermissions),
      JSON.stringify(input.capabilityKeys),
      input.enabled,
      input.actor,
      input.actor,
    ],
  );
  const group = {
    id: result.insertId,
    group_uuid: groupUuid,
    legacy_portal_group_id: null,
    group_key: groupKey,
    group_type: input.groupType,
    external_key: input.externalKey,
    vip_family_key: input.groupType === "vip" ? "vipcore" : null,
    display_name: input.displayName.slice(0, 100),
    rank_weight: input.rankWeight,
    immunity: input.immunity,
    definition: input.definition,
    baseline_permissions: input.baselinePermissions,
    capability_keys: input.capabilityKeys,
    enabled: input.enabled,
    row_version: 1,
  } as ArenaGroupRow;
  state.groups.push(group);
  state.usedGroupKeys.set(groupKey.toLowerCase(), result.insertId);
  return group;
}

async function updateAuthorityGroup(
  connection: PoolConnection,
  group: ArenaGroupRow,
  input: {
    externalKey: string;
    displayName: string;
    previousExternalKey?: string | null;
    rankWeight: number;
    immunity: number;
    definition: Record<string, unknown>;
    baselinePermissions: string[];
    capabilityKeys: string[];
    enabled: boolean;
    actor: string;
  },
) {
  const shouldRenameDisplay = sameName(group.display_name, group.external_key) ||
    Boolean(input.previousExternalKey && sameName(group.display_name, input.previousExternalKey));
  const displayName = shouldRenameDisplay
    ? input.displayName.slice(0, 100)
    : String(group.display_name);
  const changed = String(group.external_key ?? "") !== input.externalKey ||
    (group.group_type === "vip" && group.vip_family_key !== "vipcore") ||
    displayName !== String(group.display_name) ||
    integerValue(group.rank_weight) !== input.rankWeight ||
    integerValue(group.immunity) !== input.immunity ||
    !sameJson(group.definition, input.definition) ||
    !sameJson(group.baseline_permissions, input.baselinePermissions) ||
    !sameJson(group.capability_keys, input.capabilityKeys) ||
    booleanValue(group.enabled) !== input.enabled;
  if (!changed) return group;
  await connection.execute(
    "UPDATE arena_groups SET external_key = ?, vip_family_key = ?, display_name = ?, " +
      "rank_weight = ?, immunity = ?, definition = ?, baseline_permissions = ?, capability_keys = ?, " +
      "enabled = ?, updated_by_actor = ?, row_version = row_version + 1 WHERE id = ?",
    [
      input.externalKey,
      group.group_type === "vip" ? "vipcore" : null,
      displayName,
      input.rankWeight,
      input.immunity,
      JSON.stringify(input.definition),
      JSON.stringify(input.baselinePermissions),
      JSON.stringify(input.capabilityKeys),
      input.enabled,
      input.actor,
      integerValue(group.id),
    ],
  );
  group.external_key = input.externalKey;
  group.vip_family_key = group.group_type === "vip" ? "vipcore" : null;
  group.display_name = displayName;
  group.rank_weight = input.rankWeight;
  group.immunity = input.immunity;
  group.definition = input.definition;
  group.baseline_permissions = input.baselinePermissions;
  group.capability_keys = input.capabilityKeys;
  group.enabled = input.enabled;
  group.row_version = integerValue(group.row_version, 1) + 1;
  return group;
}

async function setGroupEnabled(
  connection: PoolConnection,
  group: ArenaGroupRow,
  enabled: boolean,
  actor: string,
) {
  if (booleanValue(group.enabled) === enabled) return;
  await connection.execute(
    "UPDATE arena_groups SET enabled = ?, updated_by_actor = ?, row_version = row_version + 1 WHERE id = ?",
    [enabled, actor, integerValue(group.id)],
  );
  group.enabled = enabled;
  group.row_version = integerValue(group.row_version, 1) + 1;
}

function groupScopeRow(state: AuthorityState, groupId: number, scopeId: number) {
  return state.groupScopes.find(
    (row) => integerValue(row.group_id) === groupId && integerValue(row.scope_id) === scopeId,
  ) ?? null;
}

async function upsertGroupScope(
  connection: PoolConnection,
  state: AuthorityState,
  groupId: number,
  desired: DesiredScopeAssignment,
  actor: string,
) {
  const existing = groupScopeRow(state, groupId, desired.scopeId);
  if (!existing) {
    await connection.execute(
      "INSERT INTO arena_group_scopes " +
        "(group_id, scope_id, definition_override, rank_weight_override, immunity_override, enabled, " +
        "row_version, created_by_actor, updated_by_actor) VALUES (?, ?, ?, ?, ?, ?, 1, ?, ?)",
      [
        groupId,
        desired.scopeId,
        desired.definitionOverride === null ? null : JSON.stringify(desired.definitionOverride),
        desired.rankWeightOverride,
        desired.immunityOverride,
        desired.enabled,
        actor,
        actor,
      ],
    );
    state.groupScopes.push({
      group_id: groupId,
      scope_id: desired.scopeId,
      definition_override: desired.definitionOverride,
      rank_weight_override: desired.rankWeightOverride,
      immunity_override: desired.immunityOverride,
      enabled: desired.enabled,
      row_version: 1,
    } as ArenaGroupScopeRow);
    return;
  }
  const changed = !sameJson(existing.definition_override, desired.definitionOverride) ||
    (existing.rank_weight_override === null
      ? null
      : integerValue(existing.rank_weight_override)) !== desired.rankWeightOverride ||
    (existing.immunity_override === null
      ? null
      : integerValue(existing.immunity_override)) !== desired.immunityOverride ||
    booleanValue(existing.enabled) !== desired.enabled;
  if (!changed) return;
  await connection.execute(
    "UPDATE arena_group_scopes SET definition_override = ?, rank_weight_override = ?, " +
      "immunity_override = ?, enabled = ?, updated_by_actor = ?, row_version = row_version + 1 " +
      "WHERE group_id = ? AND scope_id = ?",
    [
      desired.definitionOverride === null ? null : JSON.stringify(desired.definitionOverride),
      desired.rankWeightOverride,
      desired.immunityOverride,
      desired.enabled,
      actor,
      groupId,
      desired.scopeId,
    ],
  );
  existing.definition_override = desired.definitionOverride;
  existing.rank_weight_override = desired.rankWeightOverride;
  existing.immunity_override = desired.immunityOverride;
  existing.enabled = desired.enabled;
  existing.row_version = integerValue(existing.row_version, 1) + 1;
}

async function synchronizeGroupScopes(
  connection: PoolConnection,
  state: AuthorityState,
  group: ArenaGroupRow,
  desiredScopes: DesiredScopeAssignment[],
  actor: string,
) {
  const groupId = integerValue(group.id);
  const desiredByScope = new Map(desiredScopes.map((scope) => [scope.scopeId, scope]));
  const globalScope = state.scopes.find(
    (scope) => String(scope.scope_uuid).toLowerCase() === GLOBAL_SCOPE_UUID,
  );
  if (
    globalScope &&
    group.legacy_portal_group_id !== null &&
    booleanValue(group.enabled) &&
    !desiredByScope.has(integerValue(globalScope.id))
  ) {
    desiredByScope.set(integerValue(globalScope.id), {
      scopeId: integerValue(globalScope.id),
      definitionOverride: null,
      rankWeightOverride: null,
      immunityOverride: null,
      enabled: true,
    });
  }
  for (const desired of [...desiredByScope.values()].sort((left, right) => left.scopeId - right.scopeId)) {
    await upsertGroupScope(connection, state, groupId, desired, actor);
  }
  const existingRows = state.groupScopes.filter(
    (row) => integerValue(row.group_id) === groupId,
  );
  for (const existing of existingRows) {
    const scopeId = integerValue(existing.scope_id);
    if (desiredByScope.has(scopeId) || !booleanValue(existing.enabled)) continue;
    await connection.execute(
      "UPDATE arena_group_scopes SET enabled = FALSE, updated_by_actor = ?, " +
        "row_version = row_version + 1 WHERE group_id = ? AND scope_id = ? AND enabled = TRUE",
      [actor, groupId, scopeId],
    );
    existing.enabled = false;
    existing.row_version = integerValue(existing.row_version, 1) + 1;
  }
}

async function synchronizeAdminsCoreDefinitions(
  connection: PoolConnection,
  state: AuthorityState,
  actor: string,
  renameHint?: ArenaRuntimeAuthorityRenameHint,
) {
  const [rows] = await connection.query<AdminGroupRow[]>(
    "SELECT Id, Name, Permissions, Servers, Immunity FROM `groups` ORDER BY Id FOR UPDATE",
  );
  const directories = await loadScopeDirectories(connection);
  const claimed = new Set<number>();
  for (const row of rows) {
    const rowId = integerValue(row.Id, -1);
    const name = String(row.Name ?? "").normalize("NFKC").trim();
    if (rowId < 1 || !name) continue;
    const permissions = permissionList(row.Permissions);
    const servers = storedStringList(row.Servers, 256)
      .map(normalizedGuid)
      .filter((guid): guid is string => Boolean(guid));
    const immunity = Math.max(0, integerValue(row.Immunity));
    const definition = {
      source: "admins_core",
      nativeRowId: rowId,
      name,
      permissions,
      servers,
      immunity,
    };
    let group = existingGroupForDefinition(state, {
      groupType: "admin",
      externalKey: name,
      nativeAdminRowId: rowId,
      renameHint,
    }, claimed);
    if (!group) {
      group = await insertAuthorityGroup(connection, state, {
        groupType: "admin",
        externalKey: name,
        displayName: name,
        rankWeight: immunity,
        immunity,
        definition,
        baselinePermissions: permissions,
        capabilityKeys: permissions,
        enabled: servers.length > 0,
        actor,
      });
    } else {
      group = await updateAuthorityGroup(connection, group, {
        externalKey: name,
        displayName: name,
        previousExternalKey: renameHint?.sourceType === "admins_core"
          ? renameHint.previousExternalKey
          : null,
        rankWeight: immunity,
        immunity,
        definition,
        baselinePermissions: permissions,
        capabilityKeys: permissions,
        enabled: servers.length > 0,
        actor,
      });
    }
    claimed.add(integerValue(group.id));
    const desiredScopes: DesiredScopeAssignment[] = [];
    for (const guid of servers) {
      const linkedVipServerId = directories.physicalServerLink?.adminServerGuid === guid
        ? directories.physicalServerLink.vipServerId
        : null;
      const scope = await ensureAdminScope(
        connection,
        state,
        guid,
        directories.adminServerNames.get(guid) ?? `Admins.Core server ${guid.slice(0, 8)}`,
        linkedVipServerId,
      );
      desiredScopes.push({
        scopeId: integerValue(scope.id),
        definitionOverride: definition,
        rankWeightOverride: null,
        immunityOverride: immunity,
        enabled: true,
      });
    }
    await synchronizeGroupScopes(connection, state, group, desiredScopes, actor);
  }
  for (const group of state.groups.filter((candidate) => candidate.group_type === "admin")) {
    if (claimed.has(integerValue(group.id))) continue;
    await setGroupEnabled(connection, group, false, actor);
    await synchronizeGroupScopes(connection, state, group, [], actor);
  }
}

function parsedVipValues(value: unknown) {
  const parsed = jsonObject(value);
  return {
    values: parsed ?? {},
    valid: parsed !== null,
  };
}

async function synchronizeVipCoreDefinitions(
  connection: PoolConnection,
  state: AuthorityState,
  actor: string,
  renameHint?: ArenaRuntimeAuthorityRenameHint,
) {
  const [rows] = await connection.query<VipGroupRow[]>(
    "SELECT server_id, name, weight, values_json, enabled " +
      "FROM vip_group_definitions ORDER BY server_id, name FOR UPDATE",
  );
  const directories = await loadScopeDirectories(connection);
  const grouped = new Map<string, VipGroupRow[]>();
  for (const row of rows) {
    const serverId = integerValue(row.server_id, -1);
    const name = String(row.name ?? "").normalize("NFKC").trim();
    if (serverId < 0 || !name) continue;
    const key = normalizedName(name);
    const definitions = grouped.get(key) ?? [];
    definitions.push(row);
    grouped.set(key, definitions);
  }
  const effectiveRenameHint = renameHint?.sourceType === "vipcore" &&
    !grouped.has(normalizedName(renameHint.previousExternalKey))
    ? renameHint
    : undefined;
  const claimed = new Set<number>();
  for (const definitions of [...grouped.values()].sort((left, right) =>
    normalizedName(left[0]?.name).localeCompare(normalizedName(right[0]?.name)))) {
    const name = String(definitions[0].name).normalize("NFKC").trim();
    const scopes = definitions.map((row) => {
      const serverId = integerValue(row.server_id, -1);
      const weight = Math.max(0, integerValue(row.weight));
      const parsed = parsedVipValues(row.values_json);
      const nativeEnabled = booleanValue(row.enabled);
      return {
        serverId,
        name: String(row.name),
        weight,
        values: parsed.values,
        valid: parsed.valid,
        nativeEnabled,
        enabled: nativeEnabled && parsed.valid,
      };
    });
    const rankWeight = scopes.reduce((maximum, scope) => Math.max(maximum, scope.weight), 0);
    const enabled = scopes.some((scope) => scope.enabled);
    const capabilityKeys = [...new Set(scopes.flatMap((scope) => Object.keys(scope.values)))]
      .map((key) => key.normalize("NFKC").trim())
      .filter((key) => key.length > 0 && key.length <= 128 && !/[\u0000-\u001f\u007f]/.test(key))
      .sort()
      .slice(0, 1_000);
    const definition = {
      source: "vipcore",
      vipFamilyKey: "vipcore",
      name,
      scopes: scopes.map((scope) => ({
        nativeServerId: scope.serverId,
        name: scope.name,
        weight: scope.weight,
        enabled: scope.nativeEnabled,
        valuesValid: scope.valid,
        values: scope.values,
      })),
    };
    let group = existingGroupForDefinition(state, {
      groupType: "vip",
      externalKey: name,
      renameHint: effectiveRenameHint,
    }, claimed);
    if (!group) {
      group = await insertAuthorityGroup(connection, state, {
        groupType: "vip",
        externalKey: name,
        displayName: name,
        rankWeight,
        immunity: 0,
        definition,
        baselinePermissions: [],
        capabilityKeys,
        enabled,
        actor,
      });
    } else {
      group = await updateAuthorityGroup(connection, group, {
        externalKey: name,
        displayName: name,
        previousExternalKey: effectiveRenameHint
          ? effectiveRenameHint.previousExternalKey
          : null,
        rankWeight,
        immunity: 0,
        definition,
        baselinePermissions: [],
        capabilityKeys,
        enabled,
        actor,
      });
    }
    claimed.add(integerValue(group.id));
    const desiredScopes: DesiredScopeAssignment[] = [];
    for (const scopeDefinition of scopes) {
      const linkedAdminGuid =
        directories.physicalServerLink?.vipServerId === scopeDefinition.serverId
          ? directories.physicalServerLink.adminServerGuid
          : null;
      const existingAdminScope = linkedAdminGuid
        ? state.scopes.find((scope) => sameName(scope.admin_server_guid, linkedAdminGuid))
        : null;
      const scope = await ensureVipScope(
        connection,
        state,
        scopeDefinition.serverId,
        linkedAdminGuid,
        existingAdminScope?.display_name
          ? String(existingAdminScope.display_name)
          : `VIPCore server ${scopeDefinition.serverId}`,
      );
      desiredScopes.push({
        scopeId: integerValue(scope.id),
        definitionOverride: {
          source: "vipcore",
          nativeServerId: scopeDefinition.serverId,
          name: scopeDefinition.name,
          weight: scopeDefinition.weight,
          enabled: scopeDefinition.nativeEnabled,
          valuesValid: scopeDefinition.valid,
          values: scopeDefinition.values,
        },
        rankWeightOverride: scopeDefinition.weight,
        immunityOverride: null,
        enabled: scopeDefinition.enabled,
      });
    }
    await synchronizeGroupScopes(connection, state, group, desiredScopes, actor);
  }
  for (const group of state.groups.filter((candidate) => candidate.group_type === "vip")) {
    if (claimed.has(integerValue(group.id))) continue;
    await setGroupEnabled(connection, group, false, actor);
    await synchronizeGroupScopes(connection, state, group, [], actor);
  }
}

export async function synchronizeAdminsCoreGroupAuthorityInTransaction(
  connection: PoolConnection,
  input: {
    actorSteamId: string;
    renameHint?: ArenaRuntimeAuthorityRenameHint;
  },
) {
  try {
    const state = await loadAuthorityState(connection);
    await ensureGlobalScope(connection, state);
    await synchronizeAdminsCoreDefinitions(
      connection,
      state,
      actorValue(input.actorSteamId),
      input.renameHint,
    );
  } catch (error) {
    rethrowAuthorityStorage(error);
  }
}

export async function synchronizeVipCoreGroupAuthorityInTransaction(
  connection: PoolConnection,
  input: {
    actorSteamId: string;
    renameHint?: ArenaRuntimeAuthorityRenameHint;
  },
) {
  try {
    const state = await loadAuthorityState(connection);
    await ensureGlobalScope(connection, state);
    await synchronizeVipCoreDefinitions(
      connection,
      state,
      actorValue(input.actorSteamId),
      input.renameHint,
    );
  } catch (error) {
    rethrowAuthorityStorage(error);
  }
}

export async function synchronizeArenaRuntimeGroupAuthority(input: {
  actorSteamId?: string | null;
} = {}) {
  const pool = getGameDatabasePool();
  if (!pool) {
    authorityError("authority_storage", "The Arena game database is not configured.");
  }
  const connection = await pool.getConnection();
  try {
    await connection.beginTransaction();
    // Runtime mutations claim these native definition sets before touching
    // Arena rows. Keep the same global order here so an automatic catalogue
    // refresh cannot deadlock a concurrent Connected Groups edit.
    await connection.query(
      "SELECT Id FROM `groups` ORDER BY Id FOR UPDATE",
    );
    await connection.query(
      "SELECT server_id, name FROM vip_group_definitions ORDER BY server_id, name FOR UPDATE",
    );
    const state = await loadAuthorityState(connection);
    await ensureGlobalScope(connection, state);
    const actor = actorValue(input.actorSteamId);
    await synchronizeAdminsCoreDefinitions(connection, state, actor);
    await synchronizeVipCoreDefinitions(connection, state, actor);
    await connection.commit();
  } catch (error) {
    await connection.rollback();
    rethrowAuthorityStorage(error);
  } finally {
    connection.release();
  }
}

async function linkPortalAdaptersInArena(
  pool: Pool,
  adapters: PortalAdapterRow[],
  actor: string,
) {
  const connection = await pool.getConnection();
  try {
    await connection.beginTransaction();
    const state = await loadAuthorityState(connection);
    const globalScope = await ensureGlobalScope(connection, state);
    const targets: PortalBridgeTarget[] = [];
    for (const adapter of adapters) {
      const portalGroupId = integerValue(adapter.id, -1);
      const groupType: AuthorityGroupType = adapter.source_type === "admins_core" ? "admin" : "vip";
      const group = state.groups.find(
        (candidate) =>
          candidate.group_type === groupType && sameName(candidate.external_key, adapter.external_key),
      );
      if (!group || portalGroupId < 1) continue;
      const currentPortalId = group.legacy_portal_group_id === null
        ? null
        : integerValue(group.legacy_portal_group_id, -1);
      if (currentPortalId !== null && currentPortalId !== portalGroupId) {
        authorityError(
          "authority_conflict",
          `Arena group ${group.group_key} is linked to another Portal adapter.`,
        );
      }
      const portalIdOwner = state.groups.find(
        (candidate) =>
          integerValue(candidate.legacy_portal_group_id, -1) === portalGroupId &&
          integerValue(candidate.id) !== integerValue(group.id),
      );
      if (portalIdOwner) {
        authorityError(
          "authority_conflict",
          `Portal group ${portalGroupId} is linked to another Arena group.`,
        );
      }
      if (currentPortalId === null) {
        await connection.execute(
          "UPDATE arena_groups SET legacy_portal_group_id = ?, updated_by_actor = ?, " +
            "row_version = row_version + 1 WHERE id = ? AND legacy_portal_group_id IS NULL",
          [portalGroupId, actor, integerValue(group.id)],
        );
        group.legacy_portal_group_id = portalGroupId;
        group.row_version = integerValue(group.row_version, 1) + 1;
      }
      if (booleanValue(group.enabled)) {
        await upsertGroupScope(connection, state, integerValue(group.id), {
          scopeId: integerValue(globalScope.id),
          definitionOverride: null,
          rankWeightOverride: null,
          immunityOverride: null,
          enabled: true,
        }, actor);
      }
      targets.push({
        portalGroupId,
        arenaGroupUuid: String(group.group_uuid).toLowerCase(),
        arenaGroupKey: String(group.group_key),
        arenaScopeUuid: String(globalScope.scope_uuid).toLowerCase(),
        arenaGroupType: groupType,
        vipFamilyKey: group.vip_family_key,
        displayName: String(group.display_name),
        rankWeight: integerValue(group.rank_weight),
        arenaGroupRowVersion: integerValue(group.row_version, 1),
      });
    }
    await connection.commit();
    return targets;
  } catch (error) {
    await connection.rollback();
    rethrowAuthorityStorage(error);
  } finally {
    connection.release();
  }
}

/**
 * Links Portal's presentation/commerce adapter IDs back to their Arena-owned
 * definitions after the Portal catalogue transaction commits. Portal keeps no
 * authoritative permissions, perks, or memberships here; the bridge columns
 * are only durable delivery coordinates for inventory products and rewards.
 */
export async function synchronizePortalRuntimeGroupProjection(
  portalPool: Pool,
  input: { actorSteamId?: string | null } = {},
) {
  const [adapters] = await portalPool.query<PortalAdapterRow[]>(
    "SELECT id, source_type, external_key FROM portal_identity_groups " +
      "WHERE source_type IN ('admins_core', 'vipcore') AND external_key IS NOT NULL " +
      "ORDER BY id",
  );
  const gamePool = getGameDatabasePool();
  if (!gamePool) {
    authorityError("authority_storage", "The Arena game database is not configured.");
  }
  const targets = await linkPortalAdaptersInArena(
    gamePool,
    adapters,
    actorValue(input.actorSteamId),
  );
  if (!targets.length) return;
  const connection = await portalPool.getConnection();
  try {
    await connection.beginTransaction();
    for (const target of targets) {
      await connection.execute(
        "UPDATE portal_identity_group_listings SET arena_group_uuid = ?, arena_group_key = ?, " +
          "arena_scope_uuid = COALESCE(arena_scope_uuid, ?), arena_group_row_version = ? " +
          "WHERE group_id = ? AND (arena_group_uuid IS NULL OR arena_group_uuid = ?)",
        [
          target.arenaGroupUuid,
          target.arenaGroupKey,
          target.arenaScopeUuid,
          target.arenaGroupRowVersion,
          target.portalGroupId,
          target.arenaGroupUuid,
        ],
      );
      await connection.execute(
        "UPDATE portal_identity_group_rewards SET arena_group_uuid = ?, arena_group_key = ?, " +
          "arena_scope_uuid = COALESCE(arena_scope_uuid, ?) " +
          "WHERE group_id = ? AND (arena_group_uuid IS NULL OR arena_group_uuid = ?)",
        [
          target.arenaGroupUuid,
          target.arenaGroupKey,
          target.arenaScopeUuid,
          target.portalGroupId,
          target.arenaGroupUuid,
        ],
      );
      const [catalogueTargets] = await connection.query<PortalCatalogueTargetRow[]>(
        "SELECT target.catalogue_id, target.listing_id, listing.duration_minutes " +
          "FROM portal_arena_group_catalogue_targets AS target " +
          "INNER JOIN portal_identity_group_listings AS listing ON listing.id = target.listing_id " +
          "WHERE listing.group_id = ? AND target.arena_group_uuid = ? " +
          "ORDER BY target.catalogue_id FOR UPDATE",
        [target.portalGroupId, target.arenaGroupUuid],
      );
      for (const catalogueTarget of catalogueTargets) {
        const durationMinutes = integerValue(catalogueTarget.duration_minutes);
        const snapshot = {
          schemaVersion: 1,
          legacyPortalGroupId: target.portalGroupId,
          listingId: integerValue(catalogueTarget.listing_id),
          arenaGroupUuid: target.arenaGroupUuid,
          arenaGroupKey: target.arenaGroupKey,
          arenaScopeUuid: target.arenaScopeUuid,
          groupType: target.arenaGroupType,
          vipFamilyKey: target.vipFamilyKey,
          displayName: target.displayName,
          rankWeight: target.rankWeight,
          arenaGroupRowVersion: target.arenaGroupRowVersion,
          durationMinutes,
        };
        await connection.execute(
          "UPDATE portal_arena_group_catalogue_targets SET legacy_portal_group_id = ?, " +
            "arena_group_key = ?, arena_scope_uuid = ?, arena_group_type = ?, " +
            "arena_group_row_version = ?, duration_minutes = ?, target_snapshot = ? " +
            "WHERE catalogue_id = ? AND arena_group_uuid = ?",
          [
            target.portalGroupId,
            target.arenaGroupKey,
            target.arenaScopeUuid,
            target.arenaGroupType,
            target.arenaGroupRowVersion,
            durationMinutes,
            JSON.stringify(snapshot),
            integerValue(catalogueTarget.catalogue_id),
            target.arenaGroupUuid,
          ],
        );
      }
    }
    await connection.commit();
  } catch (error) {
    await connection.rollback();
    rethrowAuthorityStorage(error);
  } finally {
    connection.release();
  }
}
