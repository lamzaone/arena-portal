import "server-only";

import { randomUUID } from "node:crypto";

import {
  type PoolConnection,
  type ResultSetHeader,
  type RowDataPacket,
} from "mysql2/promise";

import {
  getGameDatabasePool,
  getPortalDatabasePool,
} from "@/lib/data/database-pools";
import {
  reconcileIdentityGroupRewards,
} from "@/lib/data/identity-groups";
import { synchronizeArenaVipAuthorityForPlayer } from "@/lib/data/arena-vip-authority-sync";

const steamId64Base = 76561197960265728n;
const maximumTimestampSeconds = 2_147_483_000;

export type StaffVipMembershipSource = "native" | "portal";
export type StaffVipMembershipStatus =
  | "active"
  | "expired"
  | "scheduled"
  | "revoked";

export type StaffVipMembershipRecord = {
  recordKey: string;
  source: StaffVipMembershipSource;
  steamId: string;
  name: string;
  group: string;
  groupId: number | null;
  arenaGroupId: number | null;
  membershipUuid: string | null;
  scopeId: number | null;
  accountId: string | null;
  serverId: number | null;
  startsAt: string | null;
  expiresAt: string | null;
  updatedAt: string | null;
  status: StaffVipMembershipStatus;
  permanent: boolean;
  inConfiguredScope: boolean;
  suppressedByPortal: boolean;
  consolidationEligible: boolean;
  consolidationBlockedReason: string | null;
};

export type StaffVipMembershipPlayer = {
  steamId: string;
  name: string;
  records: StaffVipMembershipRecord[];
  activeTierCount: number;
  needsConsolidation: boolean;
};

export type StaffVipMembershipSnapshot = {
  records: StaffVipMembershipRecord[];
  players: StaffVipMembershipPlayer[];
  conversionStorageAvailable: boolean;
};

export type StaffVipServerScope = {
  id: number;
  label: string;
  description: string;
  hasDefinitions: boolean;
  scopeId: number | null;
  scopeKey: string | null;
  scopeType: "global" | "server" | null;
  adminServerGuid: string | null;
};

export type StaffVipNativeMembershipReference = {
  source: "native";
  steamId: string;
  accountId: string;
  serverId: number;
  storedGroup: string;
};

export type StaffVipPortalMembershipReference = {
  source: "portal";
  steamId: string;
  groupId: number;
  arenaGroupId: number;
  membershipUuid: string;
  scopeId: number;
};

export type StaffVipMembershipReference =
  | StaffVipNativeMembershipReference
  | StaffVipPortalMembershipReference;

export type StaffVipMembershipExpiryMode =
  | "keep"
  | "extend"
  | "replace"
  | "permanent";

export class StaffVipMembershipError extends Error {
  constructor(
    public readonly code:
      | "vip-membership-invalid"
      | "vip-membership-not-found"
      | "vip-membership-permanent"
      | "vip-membership-conflict"
      | "vip-membership-stale"
      | "vip-conversion-storage"
      | "vip-game-storage"
      | "vip-portal-storage",
    message: string,
  ) {
    super(message);
    this.name = "StaffVipMembershipError";
  }
}

type NativeVipRow = RowDataPacket & {
  account_id: string | number;
  name: string | null;
  lastvisit: string | number | null;
  sid: string | number;
  group: string;
  expires: string | number;
};

type PortalVipRow = RowDataPacket & {
  group_id: string | number | null;
  arena_group_id: string | number;
  membership_uuid: string;
  scope_id: string | number;
  server_id: string | number | null;
  steam_id: string;
  starts_at: Date | string;
  expires_at: Date | string | null;
  revoked_at: Date | string | null;
  updated_at: Date | string;
  display_name: string;
  external_key: string | null;
  rank_weight: string | number | null;
  group_enabled: string | number | boolean;
  membership_status: "active" | "revoked" | "superseded" | "conflict";
  row_version: string | number;
  vip_family_key: string;
  subscription_status: "active" | "ended" | "conflict" | null;
  legacy_suppressed_until: Date | string | null;
  legacy_suppressed_permanently: string | number | boolean | null;
};

type ArenaVipSuppressionRow = RowDataPacket & {
  steam_id: string;
  server_id: string | number | null;
  legacy_suppressed_until: Date | string | null;
  legacy_suppressed_permanently: string | number | boolean;
};

type VipConversionStateRow = RowDataPacket & {
  steam_id: string;
  group_id: string | number;
  entitlement_expires_at: Date | string | null;
  native_suppressed_until: Date | string | null;
  native_suppressed_permanently: string | number | boolean;
};

type VipGroupDefinitionRow = RowDataPacket & {
  id: string | number;
  external_key: string | null;
  enabled: string | number | boolean;
  external_definition_group_id: string | number | null;
  external_definition: unknown;
};

type RuntimeVipGroupDefinitionRow = RowDataPacket & {
  server_id: string | number;
  name: string;
  enabled: string | number | boolean;
};

type VipServerScopeRow = RowDataPacket & {
  server_id: string | number;
  server_ip: string | null;
  port: string | number | null;
  guid: string | null;
  hostname: string | null;
  definition_count: string | number;
};

type ArenaVipScopeRow = RowDataPacket & {
  scope_id: string | number;
  scope_key: string;
  scope_type: "global" | "server";
  server_id: string | number;
  display_name: string;
  admin_server_guid: string | null;
  definition_count: string | number;
};

function membershipError(
  code: StaffVipMembershipError["code"],
  message: string,
): never {
  throw new StaffVipMembershipError(code, message);
}

function configuredVipServerId() {
  const parsed = Number.parseInt(process.env.GAME_VIP_SERVER_ID ?? "1", 10);
  return Number.isSafeInteger(parsed) && parsed >= 0 ? parsed : 1;
}

function requireSteamId(value: string) {
  const steamId = String(value).trim();
  if (!/^7656119\d{10}$/.test(steamId)) {
    membershipError("vip-membership-invalid", "The player SteamID64 is invalid.");
  }
  return steamId;
}

function nativeAccountToSteamId(value: unknown) {
  const accountId = String(value ?? "").trim();
  if (!/^\d{1,20}$/.test(accountId)) {
    membershipError("vip-membership-invalid", "A native VIP account ID is invalid.");
  }
  const numeric = BigInt(accountId);
  return (numeric >= steamId64Base ? numeric : numeric + steamId64Base).toString();
}

function shortAccountId(steamId: string) {
  return (BigInt(steamId) - steamId64Base).toString();
}

function requireNativeReference(
  reference: StaffVipNativeMembershipReference,
) {
  const steamId = requireSteamId(reference.steamId);
  const accountId = String(reference.accountId).trim();
  if (nativeAccountToSteamId(accountId) !== steamId) {
    membershipError(
      "vip-membership-invalid",
      "The native VIP account ID does not match the selected player.",
    );
  }
  if (
    !Number.isSafeInteger(reference.serverId) ||
    reference.serverId < 0 ||
    reference.serverId > 2_147_483_647
  ) {
    membershipError("vip-membership-invalid", "The native VIP server scope is invalid.");
  }
  const storedGroup = String(reference.storedGroup);
  if (
    storedGroup.length < 1 ||
    storedGroup.length > 64 ||
    /[\u0000-\u001f\u007f]/.test(storedGroup)
  ) {
    membershipError("vip-membership-invalid", "The stored VIP group is invalid.");
  }
  return { steamId, accountId, serverId: reference.serverId, storedGroup };
}

function requireVipServerId(value: number) {
  if (
    !Number.isSafeInteger(value) ||
    value < 0 ||
    value > 2_147_483_647
  ) {
    membershipError("vip-membership-invalid", "The VIP server scope is invalid.");
  }
  return value;
}

function requireVipGroupName(value: string) {
  const group = String(value);
  if (
    group.length < 1 ||
    group.length > 64 ||
    /[\u0000-\u001f\u007f]/.test(group)
  ) {
    membershipError("vip-membership-invalid", "The VIP group is invalid.");
  }
  return group;
}

function requirePortalReference(
  reference: StaffVipPortalMembershipReference,
) {
  const steamId = requireSteamId(reference.steamId);
  if (
    !Number.isSafeInteger(reference.groupId) || reference.groupId < 1 ||
    !Number.isSafeInteger(reference.arenaGroupId) || reference.arenaGroupId < 1 ||
    !Number.isSafeInteger(reference.scopeId) || reference.scopeId < 1 ||
    !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(
      String(reference.membershipUuid),
    )
  ) {
    membershipError("vip-membership-invalid", "The exact Arena VIP membership reference is invalid.");
  }
  return {
    source: "portal" as const,
    steamId,
    groupId: reference.groupId,
    arenaGroupId: reference.arenaGroupId,
    scopeId: reference.scopeId,
    membershipUuid: String(reference.membershipUuid).toLowerCase(),
  };
}

function extensionSeconds(minutes: number) {
  if (!Number.isSafeInteger(minutes) || minutes < 1 || minutes > 525_600) {
    membershipError(
      "vip-membership-invalid",
      "The VIP extension must be between 1 minute and 525600 minutes.",
    );
  }
  return minutes * 60;
}

function expectedNativeExpirySeconds(value: string | null | undefined) {
  const milliseconds = Date.parse(String(value ?? ""));
  if (!Number.isFinite(milliseconds) || milliseconds <= 0) {
    membershipError(
      "vip-membership-invalid",
      "The expected native VIP expiry is missing or invalid. Refresh before extending.",
    );
  }
  const seconds = Math.floor(milliseconds / 1_000);
  if (!Number.isSafeInteger(seconds) || seconds < 1) {
    membershipError(
      "vip-membership-invalid",
      "The expected native VIP expiry is invalid. Refresh before extending.",
    );
  }
  return seconds;
}

function numericExpiry(value: unknown) {
  const expiry = Number(value ?? 0);
  if (!Number.isSafeInteger(expiry) || expiry < 0) {
    membershipError("vip-membership-stale", "The stored VIP expiry is invalid.");
  }
  return expiry;
}

function asBoolean(value: unknown) {
  return value === true || value === 1 || value === "1";
}

function asDate(value: Date | string | null | undefined) {
  if (value === null || value === undefined) return null;
  const date = value instanceof Date ? value : new Date(value);
  if (!Number.isFinite(date.getTime())) {
    membershipError("vip-membership-stale", "A stored VIP date is invalid.");
  }
  return date;
}

function iso(value: Date | string | null | undefined) {
  return asDate(value)?.toISOString() ?? null;
}

function portalStatus(row: PortalVipRow, now: Date): StaffVipMembershipStatus {
  if (
    row.revoked_at !== null ||
    row.membership_status !== "active" ||
    row.subscription_status === "ended" ||
    row.subscription_status === "conflict"
  ) return "revoked";
  const startsAt = asDate(row.starts_at)!;
  const expiresAt = asDate(row.expires_at);
  if (startsAt.getTime() > now.getTime()) return "scheduled";
  if (expiresAt && expiresAt.getTime() <= now.getTime()) return "expired";
  return "active";
}

function nativeStatus(row: NativeVipRow, nowSeconds: number): StaffVipMembershipStatus {
  const expires = numericExpiry(row.expires);
  return expires !== 0 && expires <= nowSeconds ? "expired" : "active";
}

function runtimeGroupIdentity(value: unknown) {
  return String(value ?? "").replace(/[a-z]/g, (character) =>
    String.fromCharCode(character.charCodeAt(0) - 32));
}

function isMissingConversionStorage(error: unknown) {
  const candidate = error as { code?: unknown; errno?: unknown };
  return candidate.code === "ER_NO_SUCH_TABLE" ||
    candidate.errno === 1146 ||
    candidate.code === "ER_BAD_FIELD_ERROR" ||
    candidate.errno === 1054;
}

async function readNativeRows() {
  const pool = getGameDatabasePool();
  if (!pool) return [] as NativeVipRow[];
  const [rows] = await pool.query<NativeVipRow[]>(
    "SELECT account_id, name, lastvisit, sid, `group`, expires FROM vip_users " +
      "ORDER BY account_id, sid, `group`, expires DESC",
  );
  return rows;
}

export async function getStaffVipServerScopes(): Promise<StaffVipServerScope[]> {
  const pool = getGameDatabasePool();
  if (!pool) return [];
  try {
    const [authorityRows] = await pool.query<ArenaVipScopeRow[]>(
      "SELECT scope.id AS scope_id, scope.scope_key, scope.scope_type, " +
        "scope.vip_server_id AS server_id, scope.display_name, scope.admin_server_guid, " +
        "COUNT(identity_group.id) AS definition_count " +
        "FROM arena_scopes AS scope " +
        "LEFT JOIN arena_group_scopes AS group_scope " +
        "ON group_scope.scope_id = scope.id AND group_scope.enabled = TRUE " +
        "LEFT JOIN arena_groups AS identity_group " +
        "ON identity_group.id = group_scope.group_id " +
        "AND identity_group.group_type = 'vip' AND identity_group.enabled = TRUE " +
        "WHERE scope.enabled = TRUE AND scope.vip_server_id IS NOT NULL " +
        "GROUP BY scope.id, scope.scope_key, scope.scope_type, scope.vip_server_id, " +
        "scope.display_name, scope.admin_server_guid " +
        "ORDER BY scope.vip_server_id",
    );
    if (authorityRows.length) {
      return authorityRows.map((row) => {
        const id = Number(row.server_id);
        const definitionCount = Number(row.definition_count ?? 0);
        return {
          id,
          label: id === 0
            ? "All ARENA servers"
            : String(row.display_name).trim() || `Arena server ${id}`,
          description: definitionCount
            ? `${definitionCount} VIP tier definitions`
            : "No enabled VIP tier definitions",
          hasDefinitions: definitionCount > 0,
          scopeId: Number(row.scope_id),
          scopeKey: String(row.scope_key).trim() || null,
          scopeType: row.scope_type,
          adminServerGuid: String(row.admin_server_guid ?? "").trim() || null,
        };
      });
    }
  } catch (error) {
    const candidate = error as { code?: unknown; errno?: unknown };
    if (candidate.code !== "ER_NO_SUCH_TABLE" && candidate.errno !== 1146) {
      throw error;
    }
  }
  const [scopeRows, sharedDefinitionRows] = await Promise.all([
    pool.query<VipServerScopeRow[]>(
      "SELECT vip_server.serverId AS server_id, vip_server.serverIp AS server_ip, " +
        "vip_server.port, vip_server.GUID AS guid, admin_server.Hostname AS hostname, " +
        "COUNT(definition.name) AS definition_count " +
        "FROM vip_servers AS vip_server " +
        "LEFT JOIN servers AS admin_server ON admin_server.GUID = vip_server.GUID " +
        "LEFT JOIN vip_group_definitions AS definition ON definition.server_id = vip_server.serverId " +
        "GROUP BY vip_server.serverId, vip_server.serverIp, vip_server.port, vip_server.GUID, admin_server.Hostname " +
        "ORDER BY vip_server.serverId",
    ),
    pool.query<Array<RowDataPacket & { definition_count: string | number }>>(
      "SELECT COUNT(*) AS definition_count FROM vip_group_definitions WHERE server_id = 0",
    ),
  ]);
  const sharedDefinitionCount = Number(sharedDefinitionRows[0][0]?.definition_count ?? 0);
  return [
    {
      id: 0,
      label: "All ARENA servers",
      description: sharedDefinitionCount
        ? `${sharedDefinitionCount} VIP tier definitions`
        : "Legacy shared scope; no scope-specific tier definitions",
      hasDefinitions: sharedDefinitionCount > 0,
      scopeId: null,
      scopeKey: "global",
      scopeType: "global",
      adminServerGuid: null,
    },
    ...scopeRows[0].map((row): StaffVipServerScope => {
      const id = Number(row.server_id);
      const endpoint = row.server_ip && row.port
        ? `${row.server_ip}:${row.port}`
        : null;
      const definitionCount = Number(row.definition_count ?? 0);
      return {
        id,
        label: String(row.hostname ?? "").trim() || `Arena server ${id}`,
        description: [
          `VIP scope ${id}`,
          endpoint,
          definitionCount
            ? `${definitionCount} tier definitions`
            : "no tier definitions",
        ].filter(Boolean).join(" · "),
        hasDefinitions: definitionCount > 0,
        scopeId: null,
        scopeKey: null,
        scopeType: "server",
        adminServerGuid: String(row.guid ?? "").trim() || null,
      };
    }),
  ];
}

async function readPortalRows() {
  const pool = getGameDatabasePool();
  if (!pool) return [] as PortalVipRow[];
  const [rows] = await pool.query<PortalVipRow[]>(
    "SELECT identity_group.legacy_portal_group_id AS group_id, " +
      "identity_group.id AS arena_group_id, membership.membership_uuid, " +
      "membership.scope_id, identity_scope.vip_server_id AS server_id, " +
      "membership.steam_id, membership.starts_at, membership.expires_at, " +
      "membership.revoked_at, membership.updated_at, membership.status AS membership_status, " +
      "membership.row_version, identity_group.display_name, identity_group.external_key, " +
      "identity_group.vip_family_key, " +
      "(identity_group.enabled AND group_scope.enabled AND identity_scope.enabled) AS group_enabled, " +
      "COALESCE(group_scope.rank_weight_override, identity_group.rank_weight) AS rank_weight, " +
      "subscription.status AS subscription_status, subscription.legacy_suppressed_until, " +
      "subscription.legacy_suppressed_permanently " +
      "FROM arena_group_memberships AS membership " +
      "INNER JOIN arena_groups AS identity_group ON identity_group.id = membership.group_id " +
      "INNER JOIN arena_group_scopes AS group_scope ON group_scope.group_id = membership.group_id " +
      "AND group_scope.scope_id = membership.scope_id " +
      "INNER JOIN arena_scopes AS identity_scope ON identity_scope.id = membership.scope_id " +
      "LEFT JOIN arena_vip_subscriptions AS subscription ON subscription.steam_id = membership.steam_id " +
      "AND subscription.scope_id = membership.scope_id " +
      "AND subscription.vip_family_key = identity_group.vip_family_key " +
      "AND subscription.group_id = membership.group_id " +
      "AND subscription.membership_uuid = membership.membership_uuid " +
      "WHERE identity_group.group_type = 'vip' " +
      "AND membership.provenance_type <> 'legacy_vip_users' " +
      "ORDER BY membership.steam_id, membership.scope_id, identity_group.rank_weight DESC, membership.membership_uuid",
  );
  return rows;
}

async function readVipGroupDefinitions() {
  const pool = getPortalDatabasePool();
  if (!pool) return [] as VipGroupDefinitionRow[];
  const [rows] = await pool.query<VipGroupDefinitionRow[]>(
    "SELECT identity_group.id, identity_group.external_key, identity_group.enabled, " +
      "external_definition.group_id AS external_definition_group_id, " +
      "external_definition.definition AS external_definition " +
      "FROM portal_identity_groups AS identity_group " +
      "LEFT JOIN portal_identity_external_group_definitions AS external_definition " +
      "ON external_definition.group_id = identity_group.id " +
      "AND external_definition.source_type COLLATE utf8mb4_unicode_ci = identity_group.source_type COLLATE utf8mb4_unicode_ci " +
      "AND external_definition.external_key COLLATE utf8mb4_unicode_ci = identity_group.external_key COLLATE utf8mb4_unicode_ci " +
      "WHERE identity_group.source_type = 'vipcore' ORDER BY identity_group.id",
  );
  return rows;
}

async function readConversionStates() {
  const pool = getGameDatabasePool();
  if (!pool) {
    return { rows: [] as VipConversionStateRow[], available: false };
  }
  try {
    const [rows] = await pool.query<VipConversionStateRow[]>(
      "SELECT subscription.steam_id, " +
        "MAX(COALESCE(identity_group.legacy_portal_group_id, 0)) AS group_id, " +
        "MAX(subscription.expires_at) AS entitlement_expires_at, " +
        "MAX(subscription.legacy_suppressed_until) AS native_suppressed_until, " +
        "MAX(subscription.legacy_suppressed_permanently) AS native_suppressed_permanently " +
        "FROM arena_vip_subscriptions AS subscription " +
        "LEFT JOIN arena_groups AS identity_group ON identity_group.id = subscription.group_id " +
        "GROUP BY subscription.steam_id ORDER BY subscription.steam_id",
    );
    return { rows, available: true };
  } catch (error) {
    if (isMissingConversionStorage(error)) {
      return { rows: [] as VipConversionStateRow[], available: false };
    }
    throw error;
  }
}

function suppressionIsActive(state: VipConversionStateRow | undefined, now: Date) {
  if (!state) return false;
  if (asBoolean(state.native_suppressed_permanently)) return true;
  const until = asDate(state.native_suppressed_until);
  return Boolean(until && until.getTime() > now.getTime());
}

function nativeRecordKey(row: NativeVipRow) {
  return `native:${String(row.account_id)}:${Number(row.sid)}:${encodeURIComponent(String(row.group))}`;
}

function selectedNativeRecordKeys(rows: NativeVipRow[]) {
  const serverId = configuredVipServerId();
  const scopedRows = rows.filter((row) => serverId === 0 || Number(row.sid) === serverId);
  const rowsBySteamId = new Map<string, NativeVipRow[]>();
  for (const row of scopedRows) {
    const steamId = nativeAccountToSteamId(row.account_id);
    const playerRows = rowsBySteamId.get(steamId) ?? [];
    playerRows.push(row);
    rowsBySteamId.set(steamId, playerRows);
  }

  const selected = new Set<string>();
  for (const [steamId, playerRows] of rowsBySteamId) {
    const fullIdRows = playerRows.filter((row) => String(row.account_id) === steamId);
    const runtimeRows = fullIdRows.length
      ? fullIdRows
      : playerRows.filter((row) => String(row.account_id) === shortAccountId(steamId));
    for (const row of runtimeRows) selected.add(nativeRecordKey(row));
  }
  return selected;
}

function definitionIsAvailable(definition: VipGroupDefinitionRow | undefined) {
  if (!definition || definition.external_definition_group_id === null) return false;
  let runtimeDefinition: Record<string, unknown> | null = null;
  try {
    const rawDefinition = definition.external_definition;
    const parsed = typeof rawDefinition === "string"
      ? JSON.parse(rawDefinition) as unknown
      : Buffer.isBuffer(rawDefinition)
        ? JSON.parse(rawDefinition.toString("utf8")) as unknown
        : rawDefinition;
    runtimeDefinition = parsed !== null && typeof parsed === "object" && !Array.isArray(parsed)
      ? parsed as Record<string, unknown>
      : null;
  } catch {
    runtimeDefinition = null;
  }
  const runtimeEnabledValue = runtimeDefinition?.enabled;
  const runtimeEnabled = runtimeDefinition !== null &&
    (runtimeEnabledValue === undefined || asBoolean(runtimeEnabledValue));
  return Boolean(
    asBoolean(definition.enabled) &&
    runtimeEnabled,
  );
}

export async function getStaffVipMembershipSnapshot(): Promise<
  StaffVipMembershipSnapshot
> {
  const [nativeRows, portalRows, definitions, conversion] = await Promise.all([
    readNativeRows(),
    readPortalRows(),
    readVipGroupDefinitions(),
    readConversionStates(),
  ]);
  const now = new Date();
  const nowSeconds = Math.floor(now.getTime() / 1_000);
  const statesBySteamId = new Map(
    conversion.rows.map((row) => [String(row.steam_id), row]),
  );
  const namesBySteamId = new Map<string, string>();
  for (const row of nativeRows) {
    const name = String(row.name ?? "").trim();
    if (!name) continue;
    namesBySteamId.set(nativeAccountToSteamId(row.account_id), name);
  }
  const selectedNativeKeys = selectedNativeRecordKeys(nativeRows);
  const activeSelectedNativeTiersBySteamId = new Map<string, Set<string>>();
  for (const row of nativeRows) {
    if (!selectedNativeKeys.has(nativeRecordKey(row)) || nativeStatus(row, nowSeconds) !== "active") {
      continue;
    }
    const steamId = nativeAccountToSteamId(row.account_id);
    const tiers = activeSelectedNativeTiersBySteamId.get(steamId) ?? new Set<string>();
    tiers.add(runtimeGroupIdentity(row.group));
    activeSelectedNativeTiersBySteamId.set(steamId, tiers);
  }
  const definitionsById = new Map(
    definitions.map((definition) => [Number(definition.id), definition]),
  );
  const availableExternalKeys = new Set(
    definitions
      .filter((definition) => definitionIsAvailable(definition))
      .map((definition) => runtimeGroupIdentity(definition.external_key)),
  );
  const runtimeServerId = configuredVipServerId();

  const nativeRecords: StaffVipMembershipRecord[] = nativeRows.map((row) => {
    const accountId = String(row.account_id);
    const steamId = nativeAccountToSteamId(accountId);
    const serverId = Number(row.sid);
    const group = String(row.group);
    const expiry = numericExpiry(row.expires);
    const status = nativeStatus(row, nowSeconds);
    const inConfiguredScope = runtimeServerId === 0 || serverId === runtimeServerId;
    const selectedByRuntime = selectedNativeKeys.has(nativeRecordKey(row));
    const activeSelectedTierCount = activeSelectedNativeTiersBySteamId.get(steamId)?.size ?? 0;
    let consolidationBlockedReason: string | null = null;
    if (status !== "active") {
      consolidationBlockedReason = "Only an active native VIP row can be kept.";
    } else if (!inConfiguredScope) {
      consolidationBlockedReason =
        `This row belongs to server ${serverId}; this portal manages VIP server scope ${runtimeServerId}.`;
    } else if (!selectedByRuntime) {
      consolidationBlockedReason =
        "VIPCore would not select this row for the configured server and account identity.";
    } else if (activeSelectedTierCount !== 1) {
      consolidationBlockedReason =
        "Remove the extra active native VIP tiers before keeping a native tier.";
    } else if (!availableExternalKeys.has(runtimeGroupIdentity(group))) {
      consolidationBlockedReason =
        "This tier is not an enabled connected VIPCore definition.";
    }
    return {
      recordKey: nativeRecordKey(row),
      source: "native",
      steamId,
      name: String(row.name ?? "").trim() || `Steam ${steamId}`,
      group,
      groupId: null,
      arenaGroupId: null,
      membershipUuid: null,
      scopeId: null,
      accountId,
      serverId,
      startsAt: null,
      expiresAt: expiry === 0 ? null : new Date(expiry * 1_000).toISOString(),
      updatedAt: null,
      status,
      permanent: expiry === 0,
      inConfiguredScope,
      suppressedByPortal: suppressionIsActive(statesBySteamId.get(steamId), now),
      consolidationEligible: consolidationBlockedReason === null,
      consolidationBlockedReason,
    };
  });
  const portalRecords: StaffVipMembershipRecord[] = portalRows.map((row) => {
    const steamId = String(row.steam_id);
    const groupId = Number(row.group_id);
    const arenaGroupId = Number(row.arena_group_id);
    const scopeId = Number(row.scope_id);
    const membershipUuid = String(row.membership_uuid).toLowerCase();
    const serverId = row.server_id === null ? null : Number(row.server_id);
    if (
      !Number.isSafeInteger(groupId) || groupId < 1 ||
      !Number.isSafeInteger(arenaGroupId) || arenaGroupId < 1 ||
      !Number.isSafeInteger(scopeId) || scopeId < 1 ||
      !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/.test(membershipUuid) ||
      (serverId !== null && (!Number.isSafeInteger(serverId) || serverId < 0))
    ) {
      membershipError(
        "vip-membership-stale",
        "An Arena VIP membership has an invalid group or scope projection.",
      );
    }
    const status = portalStatus(row, now);
    const definition = definitionsById.get(groupId);
    let consolidationBlockedReason: string | null = null;
    if (status !== "active") {
      consolidationBlockedReason = "Only an active Arena VIP membership can be kept.";
    } else if (!definitionIsAvailable(definition)) {
      consolidationBlockedReason =
        "This Arena tier is disabled or its VIPCore definition is unavailable.";
    } else if (!conversion.available) {
      consolidationBlockedReason =
        "Arena VIP subscription storage is unavailable.";
    }
    return {
      recordKey: `arena:${membershipUuid}`,
      source: "portal",
      steamId,
      name: namesBySteamId.get(steamId) ?? `Steam ${steamId}`,
      group: String(row.external_key ?? row.display_name),
      groupId,
      arenaGroupId,
      membershipUuid,
      scopeId,
      accountId: null,
      serverId,
      startsAt: iso(row.starts_at),
      expiresAt: iso(row.expires_at),
      updatedAt: iso(row.updated_at),
      status,
      permanent: row.expires_at === null,
      inConfiguredScope: true,
      suppressedByPortal: false,
      consolidationEligible: consolidationBlockedReason === null,
      consolidationBlockedReason,
    };
  });
  const records = [...nativeRecords, ...portalRecords].sort((left, right) =>
    left.name.localeCompare(right.name, "en", { sensitivity: "base" }) ||
    left.steamId.localeCompare(right.steamId) ||
    left.group.localeCompare(right.group, "en", { sensitivity: "base" }) ||
    left.recordKey.localeCompare(right.recordKey));
  const recordsBySteamId = new Map<string, StaffVipMembershipRecord[]>();
  for (const record of records) {
    const playerRecords = recordsBySteamId.get(record.steamId) ?? [];
    playerRecords.push(record);
    recordsBySteamId.set(record.steamId, playerRecords);
  }
  const players = [...recordsBySteamId].map(([steamId, playerRecords]) => {
    const activeRecords = playerRecords.filter(
      (record) => record.status === "active" && record.inConfiguredScope,
    );
    const activeTiersByScope = new Map<string, Set<string>>();
    for (const record of activeRecords) {
      if (record.source === "native" && record.suppressedByPortal) continue;
      const scopeKey = record.serverId === null
        ? `arena-scope:${record.scopeId ?? "unknown"}`
        : `vip-server:${record.serverId}`;
      const tiers = activeTiersByScope.get(scopeKey) ?? new Set<string>();
      tiers.add(runtimeGroupIdentity(record.group));
      activeTiersByScope.set(scopeKey, tiers);
    }
    const activeTierCount = [...activeTiersByScope.values()].reduce(
      (total, tiers) => total + tiers.size,
      0,
    );
    return {
      steamId,
      name: playerRecords.find((record) => !record.name.startsWith("Steam "))?.name ??
        playerRecords[0]?.name ??
        `Steam ${steamId}`,
      records: playerRecords,
      activeTierCount,
      needsConsolidation: [...activeTiersByScope.values()].some(
        (tiers) => tiers.size > 1,
      ),
    };
  }).sort((left, right) =>
    left.name.localeCompare(right.name, "en", { sensitivity: "base" }) ||
    left.steamId.localeCompare(right.steamId));

  return {
    records,
    players,
    conversionStorageAvailable: conversion.available,
  };
}

async function readSelectedNativeRowsForSteamId(steamIdInput: string) {
  const steamId = requireSteamId(steamIdInput);
  const pool = getGameDatabasePool();
  if (!pool) {
    membershipError("vip-game-storage", "The game VIP database is not configured.");
  }
  const serverId = configuredVipServerId();
  const shared = serverId === 0;
  const readAccount = async (accountId: string) => {
    const [rows] = await pool.query<NativeVipRow[]>(
      "SELECT account_id, name, lastvisit, sid, `group`, expires FROM vip_users WHERE account_id = ? " +
        (shared ? "" : "AND sid = ? ") +
        "ORDER BY sid, `group`, expires DESC",
      shared ? [accountId] : [accountId, serverId],
    );
    return rows;
  };
  const fullRows = await readAccount(steamId);
  return fullRows.length ? fullRows : readAccount(shortAccountId(steamId));
}

async function activeNativeGroupNames(steamId: string) {
  const now = Math.floor(Date.now() / 1_000);
  return [
    ...new Set(
      (await readSelectedNativeRowsForSteamId(steamId))
        .filter((row) => {
          const expires = numericExpiry(row.expires);
          return expires === 0 || expires > now;
        })
        .map((row) => String(row.group)),
    ),
  ];
}

async function withGameTransaction<T>(
  work: (connection: PoolConnection) => Promise<T>,
) {
  const pool = getGameDatabasePool();
  if (!pool) {
    membershipError("vip-game-storage", "The game VIP database is not configured.");
  }
  const connection = await pool.getConnection();
  try {
    await connection.beginTransaction();
    const result = await work(connection);
    await connection.commit();
    return result;
  } catch (error) {
    await connection.rollback();
    throw error;
  } finally {
    connection.release();
  }
}

type ArenaVipSubscriptionMutationRow = RowDataPacket & {
  steam_id: string;
  scope_id: string | number;
  vip_family_key: string;
  group_id: string | number | null;
  membership_uuid: string | null;
  status: "active" | "ended" | "conflict";
  starts_at: Date | string | null;
  expires_at: Date | string | null;
  legacy_suppressed_until: Date | string | null;
  legacy_suppressed_permanently: string | number | boolean;
  row_version: string | number;
};

type ArenaVipTargetRow = RowDataPacket & {
  arena_group_id: string | number;
  legacy_portal_group_id: string | number | null;
  group_uuid: string;
  group_name: string;
  vip_family_key: string;
  rank_weight: string | number;
  scope_id: string | number;
  scope_uuid: string;
  server_id: string | number | null;
};

function requireArenaRowVersion(value: unknown) {
  const version = Number(value);
  if (!Number.isSafeInteger(version) || version < 1) {
    membershipError("vip-membership-stale", "The Arena VIP row version is invalid.");
  }
  return version;
}

async function lockExactArenaVipMembership(
  connection: PoolConnection,
  referenceInput: StaffVipPortalMembershipReference,
) {
  const reference = requirePortalReference(referenceInput);
  const [groupRows] = await connection.query<Array<RowDataPacket & {
    vip_family_key: string;
  }>>(
    "SELECT identity_group.vip_family_key FROM arena_groups AS identity_group " +
      "INNER JOIN arena_group_scopes AS group_scope ON group_scope.group_id = identity_group.id " +
      "AND group_scope.scope_id = ? " +
      "WHERE identity_group.id = ? AND identity_group.group_type = 'vip' " +
      "AND identity_group.legacy_portal_group_id = ? LIMIT 1",
    [reference.scopeId, reference.arenaGroupId, reference.groupId],
  );
  const family = String(groupRows[0]?.vip_family_key ?? "").trim();
  if (!family) {
    membershipError("vip-membership-not-found", "That Arena VIP group or scope no longer exists.");
  }
  // Match the inventory activation writer's lock order: subscription first,
  // exact membership second. This avoids deadlocks between staff edits and a
  // simultaneous item activation for the same player/scope/family.
  const [subscriptions] = await connection.query<ArenaVipSubscriptionMutationRow[]>(
    "SELECT steam_id, scope_id, vip_family_key, group_id, membership_uuid, status, " +
      "starts_at, expires_at, legacy_suppressed_until, legacy_suppressed_permanently, row_version " +
      "FROM arena_vip_subscriptions WHERE steam_id = ? AND scope_id = ? " +
      "AND vip_family_key = ? LIMIT 1 FOR UPDATE",
    [reference.steamId, reference.scopeId, family],
  );
  const [memberships] = await connection.query<PortalVipRow[]>(
    "SELECT identity_group.legacy_portal_group_id AS group_id, " +
      "identity_group.id AS arena_group_id, membership.membership_uuid, " +
      "membership.scope_id, identity_scope.vip_server_id AS server_id, " +
      "membership.steam_id, membership.starts_at, membership.expires_at, " +
      "membership.revoked_at, membership.updated_at, membership.status AS membership_status, " +
      "membership.row_version, identity_group.display_name, identity_group.external_key, " +
      "identity_group.vip_family_key, " +
      "(identity_group.enabled AND group_scope.enabled AND identity_scope.enabled) AS group_enabled, " +
      "COALESCE(group_scope.rank_weight_override, identity_group.rank_weight) AS rank_weight, " +
      "subscription.status AS subscription_status, subscription.legacy_suppressed_until, " +
      "subscription.legacy_suppressed_permanently " +
      "FROM arena_group_memberships AS membership " +
      "INNER JOIN arena_groups AS identity_group ON identity_group.id = membership.group_id " +
      "INNER JOIN arena_group_scopes AS group_scope ON group_scope.group_id = membership.group_id " +
      "AND group_scope.scope_id = membership.scope_id " +
      "INNER JOIN arena_scopes AS identity_scope ON identity_scope.id = membership.scope_id " +
      "LEFT JOIN arena_vip_subscriptions AS subscription ON subscription.steam_id = membership.steam_id " +
      "AND subscription.scope_id = membership.scope_id " +
      "AND subscription.vip_family_key = identity_group.vip_family_key " +
      "AND subscription.group_id = membership.group_id " +
      "AND subscription.membership_uuid = membership.membership_uuid " +
      "WHERE membership.membership_uuid = ? AND membership.steam_id = ? " +
      "AND membership.group_id = ? AND membership.scope_id = ? " +
      "AND identity_group.group_type = 'vip' LIMIT 1 FOR UPDATE",
    [
      reference.membershipUuid,
      reference.steamId,
      reference.arenaGroupId,
      reference.scopeId,
    ],
  );
  const membership = memberships[0];
  if (!membership || Number(membership.group_id) !== reference.groupId) {
    membershipError(
      "vip-membership-not-found",
      "That exact Arena VIP membership no longer exists.",
    );
  }
  return { reference, membership, subscription: subscriptions[0] };
}

function requireActiveArenaVipContext(
  context: Awaited<ReturnType<typeof lockExactArenaVipMembership>>,
) {
  const { membership, subscription, reference } = context;
  if (
    membership.membership_status !== "active" ||
    membership.revoked_at !== null ||
    !subscription ||
    subscription.status !== "active" ||
    Number(subscription.group_id) !== reference.arenaGroupId ||
    String(subscription.membership_uuid).toLowerCase() !== reference.membershipUuid
  ) {
    membershipError(
      "vip-membership-not-found",
      "That exact Arena VIP membership is no longer active.",
    );
  }
  return subscription;
}

async function writeArenaVipHistoryAndOutbox(
  connection: PoolConnection,
  input: {
    action: "staff.assigned" | "staff.edited" | "staff.extended" | "staff.revoked" | "staff.consolidated";
    steamId: string;
    scopeId: number;
    family: string;
    membershipUuid: string;
    fromGroupId: number | null;
    toGroupId: number | null;
    portalGroupId: number | null;
    actorSteamId: string;
    beforeExpiresAt: Date | string | null;
    afterExpiresAt: Date | string | null;
    rowVersion: number;
    metadata?: Record<string, unknown>;
  },
) {
  const transitionUuid = randomUUID().toLowerCase();
  const eventUuid = randomUUID().toLowerCase();
  const payload = {
    schemaVersion: 1,
    action: input.action,
    groupType: "vip",
    steamId: input.steamId,
    scopeId: input.scopeId,
    vipFamilyKey: input.family,
    membershipUuid: input.membershipUuid,
    fromArenaGroupId: input.fromGroupId,
    toArenaGroupId: input.toGroupId,
    legacyPortalGroupId: input.portalGroupId,
    beforeExpiresAt: iso(input.beforeExpiresAt),
    afterExpiresAt: iso(input.afterExpiresAt),
    rowVersion: input.rowVersion,
    actorSteamId: input.actorSteamId,
    ...input.metadata,
  };
  await connection.execute(
    "INSERT INTO arena_vip_subscription_history " +
      "(transition_uuid, steam_id, scope_id, vip_family_key, action, from_group_id, " +
      "to_group_id, membership_uuid, actor_steam_id, before_expires_at, after_expires_at, metadata) " +
      "VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)",
    [
      transitionUuid,
      input.steamId,
      input.scopeId,
      input.family,
      input.action,
      input.fromGroupId,
      input.toGroupId,
      input.membershipUuid,
      input.actorSteamId,
      input.beforeExpiresAt,
      input.afterExpiresAt,
      JSON.stringify(payload),
    ],
  );
  const arenaGroupId = input.toGroupId ?? input.fromGroupId;
  if (arenaGroupId === null) return;
  await connection.execute(
    "INSERT INTO arena_membership_outbox " +
      "(event_uuid, deduplication_key, event_type, aggregate_type, aggregate_key, " +
      "membership_uuid, steam_id, group_id, scope_id, payload) " +
      "VALUES (?, ?, ?, 'arena_vip_subscription', ?, ?, ?, ?, ?, ?)",
    [
      eventUuid,
      `vip-membership:${input.membershipUuid}:${input.rowVersion}:${input.action}`,
      `identity.vip_subscription.${input.action.split(".")[1]}`,
      `${input.steamId}:${input.scopeId}:${input.family}`,
      input.membershipUuid,
      input.steamId,
      arenaGroupId,
      input.scopeId,
      JSON.stringify(payload),
    ],
  );
}

async function reconcileArenaVipRewardsFailSoft(steamId: string) {
  try {
    await reconcileIdentityGroupRewards({ steamId, vipGroupNames: [] });
  } catch {
    // Arena is authoritative and the outbox remains pending. Inventory reward
    // reconciliation can be retried without rolling back or misreporting the
    // already-committed access change.
  }
}

async function lockRuntimeVipDefinitions(
  connection: PoolConnection,
  serverId = configuredVipServerId(),
) {
  const [rows] = await connection.query<RuntimeVipGroupDefinitionRow[]>(
    "SELECT server_id, name, enabled FROM vip_group_definitions " +
      "WHERE server_id = ? ORDER BY name FOR UPDATE",
    [serverId],
  );
  return rows;
}

function requireLiveEnabledVipDefinition(
  definitions: RuntimeVipGroupDefinitionRow[],
  groupName: unknown,
) {
  const identity = runtimeGroupIdentity(groupName);
  const matches = definitions.filter(
    (definition) => runtimeGroupIdentity(definition.name) === identity,
  );
  if (matches.length !== 1 || !asBoolean(matches[0].enabled)) {
    membershipError(
      "vip-membership-stale",
      "The selected VIPCore tier is no longer a unique enabled live definition for this server.",
    );
  }
  return matches[0];
}

async function requireFreshLiveVipDefinition(groupName: unknown) {
  return withGameTransaction(async (connection) => {
    const definitions = await lockRuntimeVipDefinitions(connection);
    return requireLiveEnabledVipDefinition(definitions, groupName);
  });
}

async function withNativeVipAdvisoryLock<T>(
  steamId: string,
  rejectActiveArenaSubscription: boolean,
  work: () => Promise<T>,
) {
  const pool = getGameDatabasePool();
  if (!pool) {
    membershipError("vip-game-storage", "The Arena VIP database is not configured.");
  }
  const connection = await pool.getConnection();
  const lockName = `arena:vip:staff:${steamId}`;
  let acquired = false;
  let discarded = false;
  try {
    const [lockRows] = await connection.query<Array<RowDataPacket & {
      acquired: number | null;
    }>>("SELECT GET_LOCK(?, 10) AS acquired", [lockName]);
    acquired = Number(lockRows[0]?.acquired) === 1;
    if (!acquired) {
      membershipError(
        "vip-membership-conflict",
        "Another VIP change is in progress for this player.",
      );
    }
    if (rejectActiveArenaSubscription) {
      const [activeRows] = await connection.query<RowDataPacket[]>(
        "SELECT subscription.steam_id FROM arena_vip_subscriptions AS subscription " +
          "INNER JOIN arena_group_memberships AS membership " +
          "ON membership.membership_uuid = subscription.membership_uuid " +
          "WHERE subscription.steam_id = ? AND subscription.status = 'active' " +
          "AND subscription.starts_at <= CURRENT_TIMESTAMP(6) " +
          "AND (subscription.expires_at IS NULL OR subscription.expires_at > CURRENT_TIMESTAMP(6)) " +
          "AND membership.provenance_type <> 'legacy_vip_users' LIMIT 1",
        [steamId],
      );
      if (activeRows.length) {
        membershipError(
          "vip-membership-conflict",
          "This player already has Arena-authoritative VIP access. Edit that exact scoped membership instead.",
        );
      }
    }
    return await work();
  } finally {
    if (acquired) {
      try {
        await connection.query("SELECT RELEASE_LOCK(?)", [lockName]);
      } catch {
        connection.destroy();
        discarded = true;
      }
    }
    if (!discarded) connection.release();
  }
}

export async function withSerializedNativeVipMutation<T>(
  steamIdInput: string,
  mutation: () => Promise<T>,
) {
  const steamId = requireSteamId(steamIdInput);
  // This is a serialization boundary, not a distributed transaction: the
  // portal connection keeps paid/staff VIP conversion out while `mutation`
  // commits in the game database. A portal commit failure after that game
  // commit can produce an ambiguous response, but cannot reopen the race—the
  // next activation acquires this row only after the native write is visible.
  return withNativeVipAdvisoryLock(steamId, true, mutation);
}

export async function withSerializedNativeVipRemoval<T>(
  steamIdInput: string,
  removal: () => Promise<T>,
) {
  const steamId = requireSteamId(steamIdInput);
  // Removal is cleanup: acquire the shared token-first mutex so paid
  // activation cannot read a half-finished native state, but intentionally do
  // not reject an active portal membership or suppression ledger.
  return withNativeVipAdvisoryLock(steamId, false, removal);
}

export async function extendStaffVipMembership(input: {
  reference: StaffVipMembershipReference;
  extensionMinutes: number;
  actorSteamId: string;
  expectedExpiresAt?: string | null;
}) {
  const actorSteamId = requireSteamId(input.actorSteamId);
  const addedSeconds = extensionSeconds(input.extensionMinutes);
  if (input.reference.source === "native") {
    const reference = requireNativeReference(input.reference);
    const expectedExpiry = expectedNativeExpirySeconds(input.expectedExpiresAt);
    const result = await withSerializedNativeVipMutation(reference.steamId, () =>
      withGameTransaction(async (connection) => {
        const definitions = await lockRuntimeVipDefinitions(
          connection,
          reference.serverId,
        );
        requireLiveEnabledVipDefinition(definitions, reference.storedGroup);
        const shortId = shortAccountId(reference.steamId);
        const [candidateRows] = await connection.query<NativeVipRow[]>(
          "SELECT account_id, name, lastvisit, sid, `group`, expires FROM vip_users " +
            "WHERE account_id IN (?, ?) AND sid = ? " +
            "ORDER BY account_id, sid, `group`, expires DESC FOR UPDATE",
          [reference.steamId, shortId, reference.serverId],
        );
        const fullIdRows = candidateRows.filter(
          (candidate) => String(candidate.account_id) === reference.steamId,
        );
        const selectedRows = fullIdRows.length
          ? fullIdRows
          : candidateRows.filter(
              (candidate) => String(candidate.account_id) === shortId,
            );
        const row = selectedRows.find(
          (candidate) =>
            String(candidate.account_id) === reference.accountId &&
            Number(candidate.sid) === reference.serverId &&
            String(candidate.group) === reference.storedGroup,
        );
        if (!row) membershipError("vip-membership-not-found", "That native VIP row no longer exists.");
        const currentExpiry = numericExpiry(row.expires);
        if (currentExpiry === 0) {
          membershipError("vip-membership-permanent", "Permanent VIP access cannot be extended.");
        }
        if (currentExpiry !== expectedExpiry) {
          membershipError(
            "vip-membership-stale",
            "That native VIP expiry changed before it could be extended. Refresh before retrying.",
          );
        }
        const now = Math.floor(Date.now() / 1_000);
        const activeTiers = new Set(
          selectedRows
            .filter((candidate) => {
              const expiry = numericExpiry(candidate.expires);
              return expiry === 0 || expiry > now;
            })
            .map((candidate) => runtimeGroupIdentity(candidate.group)),
        );
        if (
          activeTiers.size !== 1 ||
          !activeTiers.has(runtimeGroupIdentity(reference.storedGroup))
        ) {
          membershipError(
            "vip-membership-conflict",
            "Consolidate the player's overlapping native VIP tiers before extending one.",
          );
        }
        const expires = Math.max(now, currentExpiry) + addedSeconds;
        if (expires > maximumTimestampSeconds) {
          membershipError("vip-membership-invalid", "The VIP extension exceeds the supported expiry date.");
        }
        const [update] = await connection.execute<ResultSetHeader>(
          "UPDATE vip_users SET expires = ? " +
            "WHERE account_id = ? AND sid = ? AND `group` = ? AND expires = ?",
          [
            expires,
            reference.accountId,
            reference.serverId,
            reference.storedGroup,
            expectedExpiry,
          ],
        );
        if (update.affectedRows !== 1) {
          membershipError("vip-membership-stale", "That native VIP row changed before it could be extended.");
        }
        await synchronizeArenaVipAuthorityForPlayer(connection, reference.steamId);
        return {
          recordKey: `native:${reference.accountId}:${reference.serverId}:${encodeURIComponent(reference.storedGroup)}`,
          expiresAt: new Date(expires * 1_000).toISOString(),
        };
      }),
    );
    await reconcileIdentityGroupRewards({
      steamId: reference.steamId,
      vipGroupNames: await activeNativeGroupNames(reference.steamId),
    });
    return result;
  }

  const reference = requirePortalReference(input.reference);
  const result = await withGameTransaction(async (connection) => {
    const context = await lockExactArenaVipMembership(connection, reference);
    const subscription = requireActiveArenaVipContext(context);
    const target = context.membership;
    const startsAt = asDate(target.starts_at)!;
    if (startsAt.getTime() > Date.now()) {
      membershipError("vip-membership-invalid", "A scheduled VIP membership cannot be extended yet.");
    }
    if (target.expires_at === null) {
      membershipError("vip-membership-permanent", "Permanent VIP access cannot be extended.");
    }
    if (!asBoolean(target.group_enabled)) {
      membershipError("vip-membership-stale", "The selected Arena VIP tier or scope is disabled.");
    }
    const serverId = target.server_id === null ? null : Number(target.server_id);
    if (serverId === null || !Number.isSafeInteger(serverId) || serverId < 0) {
      membershipError("vip-membership-stale", "The selected Arena VIP scope has no VIPCore server mapping.");
    }
    const definitions = await lockRuntimeVipDefinitions(connection, serverId);
    requireLiveEnabledVipDefinition(definitions, target.external_key);
    const currentExpiry = asDate(target.expires_at)!;
    const expectedExpiry = asDate(input.expectedExpiresAt);
    if (
      expectedExpiry === null ||
      Math.abs(expectedExpiry.getTime() - currentExpiry.getTime()) > 1_000
    ) {
      membershipError(
        "vip-membership-stale",
        "That Arena VIP expiry changed before it could be extended. Refresh before retrying.",
      );
    }
    const expiresAt = new Date(
      Math.max(Date.now(), currentExpiry.getTime()) + addedSeconds * 1_000,
    );
    if (expiresAt.getTime() > maximumTimestampSeconds * 1_000) {
      membershipError("vip-membership-invalid", "The VIP extension exceeds the supported expiry date.");
    }
    const membershipVersion = requireArenaRowVersion(target.row_version);
    const subscriptionVersion = requireArenaRowVersion(subscription.row_version);
    const suppressionUntil = asBoolean(subscription.legacy_suppressed_permanently)
      ? null
      : new Date(Math.max(
          expiresAt.getTime(),
          asDate(subscription.legacy_suppressed_until)?.getTime() ?? 0,
        ));
    const [membershipUpdate] = await connection.execute<ResultSetHeader>(
      "UPDATE arena_group_memberships SET expires_at = ?, granted_by_actor = ?, " +
        "row_version = row_version + 1 WHERE membership_uuid = ? AND row_version = ? " +
        "AND status = 'active' AND ABS(TIMESTAMPDIFF(SECOND, expires_at, ?)) <= 1",
      [expiresAt, actorSteamId, reference.membershipUuid, membershipVersion, expectedExpiry],
    );
    if (membershipUpdate.affectedRows !== 1) {
      membershipError("vip-membership-stale", "That Arena VIP membership changed before it could be extended.");
    }
    const [subscriptionUpdate] = await connection.execute<ResultSetHeader>(
      "UPDATE arena_vip_subscriptions SET expires_at = ?, legacy_suppressed_until = ?, " +
        "row_version = row_version + 1 WHERE steam_id = ? AND scope_id = ? " +
        "AND vip_family_key = ? AND row_version = ? AND status = 'active' " +
        "AND membership_uuid = ? AND group_id = ?",
      [
        expiresAt,
        suppressionUntil,
        reference.steamId,
        reference.scopeId,
        target.vip_family_key,
        subscriptionVersion,
        reference.membershipUuid,
        reference.arenaGroupId,
      ],
    );
    if (subscriptionUpdate.affectedRows !== 1) {
      membershipError("vip-membership-stale", "That Arena VIP subscription changed before it could be extended.");
    }
    await writeArenaVipHistoryAndOutbox(connection, {
      action: "staff.extended",
      steamId: reference.steamId,
      scopeId: reference.scopeId,
      family: target.vip_family_key,
      membershipUuid: reference.membershipUuid,
      fromGroupId: reference.arenaGroupId,
      toGroupId: reference.arenaGroupId,
      portalGroupId: reference.groupId,
      actorSteamId,
      beforeExpiresAt: currentExpiry,
      afterExpiresAt: expiresAt,
      rowVersion: membershipVersion + 1,
      metadata: { extensionSeconds: addedSeconds },
    });
    return {
      recordKey: `arena:${reference.membershipUuid}`,
      expiresAt: expiresAt.toISOString(),
    };
  });
  await reconcileArenaVipRewardsFailSoft(reference.steamId);
  return result;
}

async function editArenaStaffVipMembership(input: {
  reference: StaffVipPortalMembershipReference;
  actorSteamId: string;
  newGroup: string;
  newServerId: number;
  expiryMode: StaffVipMembershipExpiryMode;
  durationMinutes: number;
  expectedExpiresAt?: string | null;
}) {
  const actorSteamId = requireSteamId(input.actorSteamId);
  const reference = requirePortalReference(input.reference);
  const newGroup = requireVipGroupName(input.newGroup);
  const newServerId = requireVipServerId(input.newServerId);
  const durationSeconds = input.expiryMode === "extend" || input.expiryMode === "replace"
    ? extensionSeconds(input.durationMinutes)
    : 0;
  const result = await withGameTransaction(async (connection) => {
    const [targetRows] = await connection.query<ArenaVipTargetRow[]>(
      "SELECT identity_group.id AS arena_group_id, identity_group.legacy_portal_group_id, " +
        "identity_group.group_uuid, identity_group.external_key AS group_name, " +
        "identity_group.vip_family_key, " +
        "COALESCE(group_scope.rank_weight_override, identity_group.rank_weight) AS rank_weight, " +
        "identity_scope.id AS scope_id, identity_scope.scope_uuid, " +
        "identity_scope.vip_server_id AS server_id " +
        "FROM arena_groups AS identity_group " +
        "INNER JOIN arena_group_scopes AS group_scope ON group_scope.group_id = identity_group.id " +
        "INNER JOIN arena_scopes AS identity_scope ON identity_scope.id = group_scope.scope_id " +
        "WHERE identity_group.group_type = 'vip' AND identity_group.enabled = TRUE " +
        "AND group_scope.enabled = TRUE AND identity_scope.enabled = TRUE " +
        "AND identity_scope.vip_server_id = ? " +
        "AND UPPER(identity_group.external_key) = UPPER(?) " +
        "ORDER BY identity_group.id, identity_scope.id FOR UPDATE",
      [newServerId, newGroup],
    );
    if (targetRows.length !== 1) {
      membershipError(
        "vip-membership-stale",
        "The destination VIP tier is not a unique enabled Arena definition in that scope.",
      );
    }
    const target = targetRows[0];
    const targetArenaGroupId = Number(target.arena_group_id);
    const targetPortalGroupId = Number(target.legacy_portal_group_id);
    const targetScopeId = Number(target.scope_id);
    if (
      !Number.isSafeInteger(targetArenaGroupId) || targetArenaGroupId < 1 ||
      !Number.isSafeInteger(targetPortalGroupId) || targetPortalGroupId < 1 ||
      !Number.isSafeInteger(targetScopeId) || targetScopeId < 1
    ) {
      membershipError(
        "vip-membership-stale",
        "The destination VIP tier is not connected to its portal presentation.",
      );
    }
    const runtimeDefinitions = await lockRuntimeVipDefinitions(connection, newServerId);
    requireLiveEnabledVipDefinition(runtimeDefinitions, target.group_name);

    // Lock all subscription rows for this player in canonical order before
    // taking membership locks. Cross-scope moves can otherwise deadlock when
    // two staff requests move opposite directions at the same time.
    const [playerSubscriptions] = await connection.query<ArenaVipSubscriptionMutationRow[]>(
      "SELECT steam_id, scope_id, vip_family_key, group_id, membership_uuid, status, " +
        "starts_at, expires_at, legacy_suppressed_until, legacy_suppressed_permanently, row_version " +
        "FROM arena_vip_subscriptions WHERE steam_id = ? " +
        "ORDER BY scope_id, vip_family_key FOR UPDATE",
      [reference.steamId],
    );
    const context = await lockExactArenaVipMembership(connection, input.reference);
    const sourceSubscription = requireActiveArenaVipContext(context);
    const source = context.membership;
    if (source.vip_family_key !== target.vip_family_key) {
      membershipError(
        "vip-membership-conflict",
        "VIP memberships cannot be moved between independent VIP families.",
      );
    }
    const currentExpiry = asDate(source.expires_at);
    const expectedExpiry = asDate(input.expectedExpiresAt);
    if (currentExpiry === null) {
      if (String(input.expectedExpiresAt ?? "").trim()) {
        membershipError("vip-membership-stale", "That Arena VIP permanence changed. Refresh before retrying.");
      }
    } else if (
      expectedExpiry === null ||
      Math.abs(expectedExpiry.getTime() - currentExpiry.getTime()) > 1_000
    ) {
      membershipError("vip-membership-stale", "That Arena VIP expiry changed. Refresh before retrying.");
    }
    const now = new Date();
    let nextExpiry = currentExpiry;
    if (input.expiryMode === "permanent") {
      nextExpiry = null;
    } else if (input.expiryMode === "replace") {
      nextExpiry = new Date(now.getTime() + durationSeconds * 1_000);
    } else if (input.expiryMode === "extend") {
      if (currentExpiry === null) {
        membershipError("vip-membership-permanent", "Permanent VIP access cannot be extended.");
      }
      nextExpiry = new Date(
        Math.max(now.getTime(), currentExpiry.getTime()) + durationSeconds * 1_000,
      );
    }
    if (nextExpiry && nextExpiry.getTime() > maximumTimestampSeconds * 1_000) {
      membershipError("vip-membership-invalid", "The VIP expiry exceeds the supported date range.");
    }
    const targetSubscription = playerSubscriptions.find(
      (row) =>
        Number(row.scope_id) === targetScopeId &&
        row.vip_family_key === target.vip_family_key,
    );
    const sameSubscription =
      targetScopeId === reference.scopeId &&
      target.vip_family_key === source.vip_family_key;
    if (
      !sameSubscription &&
      targetSubscription?.status === "active"
    ) {
      membershipError(
        "vip-membership-conflict",
        "The destination scope already has an active VIP subscription in this family.",
      );
    }
    const targetSuppressedPermanently = asBoolean(
      targetSubscription?.legacy_suppressed_permanently,
    );
    if (nextExpiry && targetSuppressedPermanently) {
      membershipError(
        "vip-membership-permanent",
        "A permanent preserved VIP in the destination scope cannot be replaced by timed access.",
      );
    }
    const [targetMembershipRows] = await connection.query<Array<RowDataPacket & {
      membership_uuid: string;
      status: "active" | "revoked" | "superseded" | "conflict";
      row_version: string | number;
    }>>(
      "SELECT membership_uuid, status, row_version FROM arena_group_memberships " +
        "WHERE group_id = ? AND scope_id = ? AND steam_id = ? LIMIT 1 FOR UPDATE",
      [targetArenaGroupId, targetScopeId, reference.steamId],
    );
    const targetExisting = targetMembershipRows[0];
    const sameMembership =
      targetArenaGroupId === reference.arenaGroupId &&
      targetScopeId === reference.scopeId;
    if (!sameMembership && targetExisting?.status === "active") {
      membershipError(
        "vip-membership-conflict",
        "The destination tier already has an active Arena membership.",
      );
    }

    const sourceMembershipVersion = requireArenaRowVersion(source.row_version);
    let targetMembershipUuid = reference.membershipUuid;
    let targetMembershipVersion = sourceMembershipVersion + 1;
    if (sameMembership) {
      const [updated] = await connection.execute<ResultSetHeader>(
        "UPDATE arena_group_memberships SET expires_at = ?, granted_by_actor = ?, " +
          "grant_reason = 'Edited by staff', row_version = row_version + 1 " +
          "WHERE membership_uuid = ? AND row_version = ? AND status = 'active'",
        [nextExpiry, actorSteamId, reference.membershipUuid, sourceMembershipVersion],
      );
      if (updated.affectedRows !== 1) {
        membershipError("vip-membership-stale", "That Arena VIP membership changed before it could be edited.");
      }
    } else {
      const [revoked] = await connection.execute<ResultSetHeader>(
        "UPDATE arena_group_memberships SET status = 'revoked', revoked_at = CURRENT_TIMESTAMP(6), " +
          "revoked_by_actor = ?, revoke_reason = 'Moved by staff', row_version = row_version + 1 " +
          "WHERE membership_uuid = ? AND row_version = ? AND status = 'active'",
        [actorSteamId, reference.membershipUuid, sourceMembershipVersion],
      );
      if (revoked.affectedRows !== 1) {
        membershipError("vip-membership-stale", "That Arena VIP membership changed before it could be moved.");
      }
      if (targetExisting) {
        const existingVersion = requireArenaRowVersion(targetExisting.row_version);
        if (targetExisting.status === "conflict") {
          membershipError("vip-membership-conflict", "The destination membership is marked as a conflict.");
        }
        targetMembershipUuid = String(targetExisting.membership_uuid).toLowerCase();
        targetMembershipVersion = existingVersion + 1;
        const [reactivated] = await connection.execute<ResultSetHeader>(
          "UPDATE arena_group_memberships SET starts_at = ?, expires_at = ?, status = 'active', " +
            "provenance_type = 'staff', provenance_reference = ?, source_inventory_item_id = NULL, " +
            "origin_command_uuid = NULL, granted_by_actor = ?, grant_reason = 'Moved by staff', " +
            "revoked_at = NULL, revoked_by_actor = NULL, revoke_reason = NULL, " +
            "row_version = row_version + 1 WHERE membership_uuid = ? AND row_version = ?",
          [
            now,
            nextExpiry,
            `staff-vip:${target.group_uuid}:${target.scope_uuid}`,
            actorSteamId,
            targetMembershipUuid,
            existingVersion,
          ],
        );
        if (reactivated.affectedRows !== 1) {
          membershipError("vip-membership-stale", "The destination Arena VIP membership changed.");
        }
      } else {
        targetMembershipUuid = randomUUID().toLowerCase();
        targetMembershipVersion = 1;
        await connection.execute(
          "INSERT INTO arena_group_memberships " +
            "(membership_uuid, group_id, scope_id, steam_id, starts_at, expires_at, status, " +
            "provenance_type, provenance_reference, granted_by_actor, grant_reason, row_version) " +
            "VALUES (?, ?, ?, ?, ?, ?, 'active', 'staff', ?, ?, 'Moved by staff', 1)",
          [
            targetMembershipUuid,
            targetArenaGroupId,
            targetScopeId,
            reference.steamId,
            now,
            nextExpiry,
            `staff-vip:${target.group_uuid}:${target.scope_uuid}`,
            actorSteamId,
          ],
        );
      }
    }

    if (!sameSubscription) {
      const sourceSubscriptionVersion = requireArenaRowVersion(sourceSubscription.row_version);
      const [ended] = await connection.execute<ResultSetHeader>(
        "UPDATE arena_vip_subscriptions SET group_id = NULL, membership_uuid = NULL, " +
          "status = 'ended', starts_at = NULL, expires_at = NULL, row_version = row_version + 1 " +
          "WHERE steam_id = ? AND scope_id = ? AND vip_family_key = ? " +
          "AND row_version = ? AND membership_uuid = ?",
        [
          reference.steamId,
          reference.scopeId,
          source.vip_family_key,
          sourceSubscriptionVersion,
          reference.membershipUuid,
        ],
      );
      if (ended.affectedRows !== 1) {
        membershipError("vip-membership-stale", "The source Arena VIP subscription changed.");
      }
    }

    const suppressionPermanent = nextExpiry === null || targetSuppressedPermanently;
    const suppressionUntil = suppressionPermanent
      ? null
      : new Date(Math.max(
          nextExpiry!.getTime(),
          asDate(targetSubscription?.legacy_suppressed_until)?.getTime() ?? 0,
        ));
    if (targetSubscription) {
      const targetSubscriptionVersion = requireArenaRowVersion(targetSubscription.row_version);
      const [updated] = await connection.execute<ResultSetHeader>(
        "UPDATE arena_vip_subscriptions SET group_id = ?, group_type = 'vip', membership_uuid = ?, " +
          "status = 'active', starts_at = ?, expires_at = ?, legacy_suppressed_until = ?, " +
          "legacy_suppressed_permanently = ?, last_command_uuid = NULL, row_version = row_version + 1 " +
          "WHERE steam_id = ? AND scope_id = ? AND vip_family_key = ? AND row_version = ?",
        [
          targetArenaGroupId,
          targetMembershipUuid,
          now,
          nextExpiry,
          suppressionUntil,
          suppressionPermanent,
          reference.steamId,
          targetScopeId,
          target.vip_family_key,
          targetSubscriptionVersion,
        ],
      );
      if (updated.affectedRows !== 1) {
        membershipError("vip-membership-stale", "The destination Arena VIP subscription changed.");
      }
    } else {
      await connection.execute(
        "INSERT INTO arena_vip_subscriptions " +
          "(steam_id, scope_id, vip_family_key, group_id, group_type, membership_uuid, status, " +
          "starts_at, expires_at, legacy_suppressed_until, legacy_suppressed_permanently, row_version) " +
          "VALUES (?, ?, ?, ?, 'vip', ?, 'active', ?, ?, ?, ?, 1)",
        [
          reference.steamId,
          targetScopeId,
          target.vip_family_key,
          targetArenaGroupId,
          targetMembershipUuid,
          now,
          nextExpiry,
          suppressionUntil,
          suppressionPermanent,
        ],
      );
    }
    await writeArenaVipHistoryAndOutbox(connection, {
      action: "staff.edited",
      steamId: reference.steamId,
      scopeId: targetScopeId,
      family: target.vip_family_key,
      membershipUuid: targetMembershipUuid,
      fromGroupId: reference.arenaGroupId,
      toGroupId: targetArenaGroupId,
      portalGroupId: targetPortalGroupId,
      actorSteamId,
      beforeExpiresAt: currentExpiry,
      afterExpiresAt: nextExpiry,
      rowVersion: targetMembershipVersion,
      metadata: {
        previousScopeId: reference.scopeId,
        previousMembershipUuid: reference.membershipUuid,
        expiryMode: input.expiryMode,
      },
    });
    return {
      recordKey: `arena:${targetMembershipUuid}`,
      group: String(target.group_name),
      serverId: newServerId,
      expiresAt: nextExpiry?.toISOString() ?? null,
    };
  });
  await reconcileArenaVipRewardsFailSoft(reference.steamId);
  return result;
}

/**
 * Edits one exact VIP record regardless of its server scope. Native rows stay
 * in VIPCore's compatibility table; normalized Arena memberships are edited
 * by UUID and scope so equal tiers on different servers cannot be confused.
 */
export async function editStaffVipMembership(input: {
  reference: StaffVipMembershipReference;
  actorSteamId: string;
  newGroup: string;
  newServerId: number;
  expiryMode: StaffVipMembershipExpiryMode;
  durationMinutes: number;
  expectedExpiresAt?: string | null;
}) {
  requireSteamId(input.actorSteamId);
  if (input.reference.source === "portal") {
    return editArenaStaffVipMembership({
      ...input,
      reference: input.reference,
    });
  }
  const reference = requireNativeReference(input.reference);
  const newGroup = requireVipGroupName(input.newGroup);
  const newServerId = requireVipServerId(input.newServerId);
  const expiryMode = input.expiryMode;
  if (!["keep", "extend", "replace", "permanent"].includes(expiryMode)) {
    membershipError("vip-membership-invalid", "The VIP expiry edit mode is invalid.");
  }
  const durationSeconds = expiryMode === "extend" || expiryMode === "replace"
    ? extensionSeconds(input.durationMinutes)
    : 0;

  const result = await withSerializedNativeVipRemoval(
    reference.steamId,
    () => withGameTransaction(async (connection) => {
      const [rows] = await connection.query<NativeVipRow[]>(
        "SELECT account_id, name, lastvisit, sid, `group`, expires FROM vip_users " +
          "WHERE account_id = ? AND sid = ? AND `group` = ? LIMIT 1 FOR UPDATE",
        [reference.accountId, reference.serverId, reference.storedGroup],
      );
      const row = rows[0];
      if (!row) {
        membershipError("vip-membership-not-found", "That native VIP row no longer exists.");
      }
      const currentExpiry = numericExpiry(row.expires);
      if (currentExpiry !== 0) {
        const expectedExpiry = expectedNativeExpirySeconds(input.expectedExpiresAt);
        if (currentExpiry !== expectedExpiry) {
          membershipError(
            "vip-membership-stale",
            "That native VIP expiry changed before it could be edited. Refresh before retrying.",
          );
        }
      } else if (String(input.expectedExpiresAt ?? "").trim()) {
        membershipError(
          "vip-membership-stale",
          "That native VIP permanence changed before it could be edited. Refresh before retrying.",
        );
      }

      const movingScope = newServerId !== reference.serverId;
      const changingTier = newGroup !== reference.storedGroup;
      if (movingScope || changingTier) {
        const definitions = await lockRuntimeVipDefinitions(connection, newServerId);
        requireLiveEnabledVipDefinition(definitions, newGroup);
      }

      const shortId = shortAccountId(reference.steamId);
      const [targetRows] = await connection.query<NativeVipRow[]>(
        "SELECT account_id, name, lastvisit, sid, `group`, expires FROM vip_users " +
          "WHERE account_id IN (?, ?) AND sid = ? " +
          "ORDER BY account_id, `group`, expires DESC FOR UPDATE",
        [reference.steamId, shortId, newServerId],
      );
      const fullIdRows = targetRows.filter(
        (candidate) => String(candidate.account_id) === reference.steamId,
      );
      const runtimeRows = fullIdRows.length
        ? fullIdRows
        : targetRows.filter(
            (candidate) => String(candidate.account_id) === shortId,
          );
      const now = Math.floor(Date.now() / 1_000);
      const activeOtherRows = runtimeRows.filter((candidate) => {
        const isSource =
          String(candidate.account_id) === reference.accountId &&
          Number(candidate.sid) === reference.serverId &&
          String(candidate.group) === reference.storedGroup;
        if (isSource) return false;
        const expiry = numericExpiry(candidate.expires);
        return expiry === 0 || expiry > now;
      });
      if (activeOtherRows.length) {
        membershipError(
          "vip-membership-conflict",
          "The destination scope already has active VIP access. Remove or consolidate that exact row first.",
        );
      }

      let nextExpiry = currentExpiry;
      if (expiryMode === "permanent") {
        nextExpiry = 0;
      } else if (expiryMode === "replace") {
        nextExpiry = now + durationSeconds;
      } else if (expiryMode === "extend") {
        if (currentExpiry === 0) {
          membershipError(
            "vip-membership-permanent",
            "Permanent VIP access cannot be extended. Choose a replacement expiry explicitly.",
          );
        }
        nextExpiry = Math.max(now, currentExpiry) + durationSeconds;
      }
      if (nextExpiry > maximumTimestampSeconds) {
        membershipError(
          "vip-membership-invalid",
          "The VIP expiry exceeds the supported date range.",
        );
      }

      const tupleChanged = movingScope || changingTier;
      if (tupleChanged) {
        const [target] = await connection.query<NativeVipRow[]>(
          "SELECT account_id, name, lastvisit, sid, `group`, expires FROM vip_users " +
            "WHERE account_id = ? AND sid = ? AND `group` = ? LIMIT 1 FOR UPDATE",
          [reference.accountId, newServerId, newGroup],
        );
        if (target.length) {
          membershipError(
            "vip-membership-conflict",
            "An exact VIP row already exists for that tier and scope.",
          );
        }
        const [deleted] = await connection.execute<ResultSetHeader>(
          "DELETE FROM vip_users WHERE account_id = ? AND sid = ? AND `group` = ? AND expires = ?",
          [
            reference.accountId,
            reference.serverId,
            reference.storedGroup,
            currentExpiry,
          ],
        );
        if (deleted.affectedRows !== 1) {
          membershipError(
            "vip-membership-stale",
            "That native VIP row changed before it could be moved.",
          );
        }
        await connection.execute(
          "INSERT INTO vip_users (account_id, name, lastvisit, sid, `group`, expires) " +
            "VALUES (?, ?, ?, ?, ?, ?)",
          [
            reference.accountId,
            String(row.name ?? "").trim() || `Steam ${reference.steamId}`,
            now,
            newServerId,
            newGroup,
            nextExpiry,
          ],
        );
      } else {
        const [updated] = await connection.execute<ResultSetHeader>(
          "UPDATE vip_users SET expires = ?, lastvisit = ? " +
            "WHERE account_id = ? AND sid = ? AND `group` = ? AND expires = ?",
          [
            nextExpiry,
            now,
            reference.accountId,
            reference.serverId,
            reference.storedGroup,
            currentExpiry,
          ],
        );
        if (updated.affectedRows !== 1) {
          membershipError(
            "vip-membership-stale",
            "That native VIP row changed before it could be edited.",
          );
        }
      }
      await synchronizeArenaVipAuthorityForPlayer(connection, reference.steamId);
      return {
        recordKey: `native:${reference.accountId}:${newServerId}:${encodeURIComponent(newGroup)}`,
        group: newGroup,
        serverId: newServerId,
        expiresAt: nextExpiry === 0
          ? null
          : new Date(nextExpiry * 1_000).toISOString(),
      };
    }),
  );
  await reconcileIdentityGroupRewards({
    steamId: reference.steamId,
    vipGroupNames: await activeNativeGroupNames(reference.steamId),
  });
  return result;
}

export async function removeStaffVipMembership(input: {
  reference: StaffVipMembershipReference;
  actorSteamId: string;
}) {
  const actorSteamId = requireSteamId(input.actorSteamId);
  if (input.reference.source === "native") {
    const reference = requireNativeReference(input.reference);
    const result = await withSerializedNativeVipRemoval(reference.steamId, () =>
      withGameTransaction(async (connection) => {
        const [deleted] = await connection.execute<ResultSetHeader>(
          "DELETE FROM vip_users WHERE account_id = ? AND sid = ? AND `group` = ?",
          [reference.accountId, reference.serverId, reference.storedGroup],
        );
        if (deleted.affectedRows !== 1) {
          membershipError("vip-membership-not-found", "That native VIP row no longer exists.");
        }
        await synchronizeArenaVipAuthorityForPlayer(connection, reference.steamId);
        return {
          recordKey: `native:${reference.accountId}:${reference.serverId}:${encodeURIComponent(reference.storedGroup)}`,
        };
      }),
    );
    await reconcileIdentityGroupRewards({
      steamId: reference.steamId,
      vipGroupNames: await activeNativeGroupNames(reference.steamId),
    });
    return result;
  }

  const reference = requirePortalReference(input.reference);
  const result = await withGameTransaction(async (connection) => {
    const context = await lockExactArenaVipMembership(connection, reference);
    const subscription = requireActiveArenaVipContext(context);
    const membershipVersion = requireArenaRowVersion(context.membership.row_version);
    const subscriptionVersion = requireArenaRowVersion(subscription.row_version);
    const revokedAt = new Date();
    const [membershipUpdate] = await connection.execute<ResultSetHeader>(
      "UPDATE arena_group_memberships SET status = 'revoked', revoked_at = ?, " +
        "revoked_by_actor = ?, revoke_reason = 'Removed by staff', " +
        "row_version = row_version + 1 WHERE membership_uuid = ? " +
        "AND row_version = ? AND status = 'active'",
      [revokedAt, actorSteamId, reference.membershipUuid, membershipVersion],
    );
    if (membershipUpdate.affectedRows !== 1) {
      membershipError("vip-membership-stale", "That Arena VIP membership changed before it could be removed.");
    }
    const [subscriptionUpdate] = await connection.execute<ResultSetHeader>(
      "UPDATE arena_vip_subscriptions SET group_id = NULL, membership_uuid = NULL, " +
        "status = 'ended', starts_at = NULL, expires_at = NULL, last_command_uuid = NULL, " +
        "row_version = row_version + 1 WHERE steam_id = ? AND scope_id = ? " +
        "AND vip_family_key = ? AND row_version = ? AND membership_uuid = ? AND group_id = ?",
      [
        reference.steamId,
        reference.scopeId,
        context.membership.vip_family_key,
        subscriptionVersion,
        reference.membershipUuid,
        reference.arenaGroupId,
      ],
    );
    if (subscriptionUpdate.affectedRows !== 1) {
      membershipError("vip-membership-stale", "That Arena VIP subscription changed before it could be removed.");
    }
    await writeArenaVipHistoryAndOutbox(connection, {
      action: "staff.revoked",
      steamId: reference.steamId,
      scopeId: reference.scopeId,
      family: context.membership.vip_family_key,
      membershipUuid: reference.membershipUuid,
      fromGroupId: reference.arenaGroupId,
      toGroupId: null,
      portalGroupId: reference.groupId,
      actorSteamId,
      beforeExpiresAt: context.membership.expires_at,
      afterExpiresAt: null,
      rowVersion: membershipVersion + 1,
      metadata: { revokedAt: revokedAt.toISOString() },
    });
    return { recordKey: `arena:${reference.membershipUuid}` };
  });
  await reconcileArenaVipRewardsFailSoft(reference.steamId);
  return result;
}

export async function consolidateStaffVipMemberships(input: {
  target: StaffVipMembershipReference;
  actorSteamId: string;
}) {
  const actorSteamId = requireSteamId(input.actorSteamId);
  if (input.target.source === "native") {
    const target = requireNativeReference(input.target);
    const result = await withSerializedNativeVipRemoval(target.steamId, () =>
      withGameTransaction(async (connection) => {
        const definitions = await lockRuntimeVipDefinitions(connection, target.serverId);
        requireLiveEnabledVipDefinition(definitions, target.storedGroup);
        const shortId = shortAccountId(target.steamId);
        const [rawRows] = await connection.query<NativeVipRow[]>(
          "SELECT account_id, name, lastvisit, sid, `group`, expires FROM vip_users " +
            "WHERE account_id IN (?, ?) AND sid = ? " +
            "ORDER BY account_id, `group`, expires DESC FOR UPDATE",
          [target.steamId, shortId, target.serverId],
        );
        const fullRows = rawRows.filter((row) => String(row.account_id) === target.steamId);
        const selectedRows = fullRows.length
          ? fullRows
          : rawRows.filter((row) => String(row.account_id) === shortId);
        const nowSeconds = Math.floor(Date.now() / 1_000);
        const activeRows = selectedRows.filter((row) => {
          const expiry = numericExpiry(row.expires);
          return expiry === 0 || expiry > nowSeconds;
        });
        const exactTarget = activeRows.find((row) =>
          String(row.account_id) === target.accountId &&
          String(row.group) === target.storedGroup);
        if (!exactTarget) {
          membershipError(
            "vip-membership-not-found",
            "The selected native VIP is not an active runtime row.",
          );
        }
        const activeTiers = new Set(
          activeRows.map((row) => runtimeGroupIdentity(row.group)),
        );
        if (activeTiers.size !== 1) {
          membershipError(
            "vip-membership-conflict",
            "Remove the other active native VIP tiers before keeping this one.",
          );
        }
        const applicableServerIds = target.serverId === 0
          ? [0]
          : [0, target.serverId];
        const [subscriptions] = await connection.query<Array<
          ArenaVipSubscriptionMutationRow & { server_id: string | number | null }
        >>(
          "SELECT subscription.steam_id, subscription.scope_id, subscription.vip_family_key, " +
            "subscription.group_id, subscription.membership_uuid, subscription.status, " +
            "subscription.starts_at, subscription.expires_at, " +
            "subscription.legacy_suppressed_until, subscription.legacy_suppressed_permanently, " +
            "subscription.row_version, identity_scope.vip_server_id AS server_id " +
            "FROM arena_vip_subscriptions AS subscription " +
            "INNER JOIN arena_scopes AS identity_scope ON identity_scope.id = subscription.scope_id " +
            `WHERE subscription.steam_id = ? AND identity_scope.vip_server_id IN (${applicableServerIds.map(() => "?").join(", ")}) ` +
            "ORDER BY subscription.scope_id, subscription.vip_family_key FOR UPDATE",
          [target.steamId, ...applicableServerIds],
        );
        for (const subscription of subscriptions) {
          if (subscription.membership_uuid && subscription.status === "active") {
            await connection.execute(
              "UPDATE arena_group_memberships SET status = 'revoked', revoked_at = CURRENT_TIMESTAMP(6), " +
                "revoked_by_actor = ?, revoke_reason = 'Native VIP kept by staff', " +
                "row_version = row_version + 1 WHERE membership_uuid = ? AND status = 'active'",
              [actorSteamId, subscription.membership_uuid],
            );
          }
          await connection.execute(
            "UPDATE arena_vip_subscriptions SET group_id = NULL, membership_uuid = NULL, " +
              "status = 'ended', starts_at = NULL, expires_at = NULL, " +
              "legacy_suppressed_until = NULL, legacy_suppressed_permanently = FALSE, " +
              "last_command_uuid = NULL, row_version = row_version + 1 " +
              "WHERE steam_id = ? AND scope_id = ? AND vip_family_key = ?",
            [target.steamId, Number(subscription.scope_id), subscription.vip_family_key],
          );
        }
        await synchronizeArenaVipAuthorityForPlayer(connection, target.steamId);
        return {
          recordKey: `native:${target.accountId}:${target.serverId}:${encodeURIComponent(target.storedGroup)}`,
          keptSource: "native" as const,
        };
      }),
    );
    await reconcileArenaVipRewardsFailSoft(target.steamId);
    return result;
  }

  const target = requirePortalReference(input.target);
  const result = await withGameTransaction(async (connection) => {
    const context = await lockExactArenaVipMembership(connection, target);
    requireActiveArenaVipContext(context);
    const [otherRows] = await connection.query<Array<RowDataPacket & {
      membership_uuid: string;
      row_version: string | number;
    }>>(
      "SELECT membership.membership_uuid, membership.row_version " +
        "FROM arena_group_memberships AS membership " +
        "INNER JOIN arena_groups AS identity_group ON identity_group.id = membership.group_id " +
        "WHERE membership.steam_id = ? AND membership.scope_id = ? " +
        "AND identity_group.group_type = 'vip' AND identity_group.vip_family_key = ? " +
        "AND membership.status = 'active' AND membership.membership_uuid <> ? " +
        "ORDER BY membership.membership_uuid FOR UPDATE",
      [
        target.steamId,
        target.scopeId,
        context.membership.vip_family_key,
        target.membershipUuid,
      ],
    );
    for (const row of otherRows) {
      const rowVersion = requireArenaRowVersion(row.row_version);
      const [updated] = await connection.execute<ResultSetHeader>(
        "UPDATE arena_group_memberships SET status = 'superseded', revoked_at = CURRENT_TIMESTAMP(6), " +
          "revoked_by_actor = ?, revoke_reason = 'Consolidated by staff', " +
          "row_version = row_version + 1 WHERE membership_uuid = ? " +
          "AND row_version = ? AND status = 'active'",
        [actorSteamId, String(row.membership_uuid), rowVersion],
      );
      if (updated.affectedRows !== 1) {
        membershipError("vip-membership-stale", "A conflicting Arena VIP membership changed.");
      }
    }
    const targetVersion = requireArenaRowVersion(context.membership.row_version);
    await writeArenaVipHistoryAndOutbox(connection, {
      action: "staff.consolidated",
      steamId: target.steamId,
      scopeId: target.scopeId,
      family: context.membership.vip_family_key,
      membershipUuid: target.membershipUuid,
      fromGroupId: target.arenaGroupId,
      toGroupId: target.arenaGroupId,
      portalGroupId: target.groupId,
      actorSteamId,
      beforeExpiresAt: context.membership.expires_at,
      afterExpiresAt: context.membership.expires_at,
      rowVersion: targetVersion,
      metadata: {
        supersededMembershipUuids: otherRows.map((row) => String(row.membership_uuid)),
      },
    });
    return {
      recordKey: `arena:${target.membershipUuid}`,
      keptSource: "portal" as const,
    };
  });
  await reconcileArenaVipRewardsFailSoft(target.steamId);
  return result;
}
