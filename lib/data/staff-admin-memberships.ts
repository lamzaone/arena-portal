import "server-only";

import { createHash } from "node:crypto";

import {
  type PoolConnection,
  type ResultSetHeader,
  type RowDataPacket,
} from "mysql2/promise";

import {
  configuredGameServerGuid,
  isAssignedToConfiguredGameServer,
} from "@/lib/admin/server-scope";
import { getGameDatabasePool } from "@/lib/data/database-pools";
import {
  reconcileIdentityGroupRewards,
} from "@/lib/data/identity-groups";

const maximumTimestampSeconds = 2_147_483_000;
const arenaUuidPattern =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;

export type StaffAdminMembershipSource = "native" | "portal";
export type StaffAdminMembershipStatus =
  | "active"
  | "expired"
  | "scheduled"
  | "revoked";

export type StaffAdminMembershipRecord = {
  recordKey: string;
  source: StaffAdminMembershipSource;
  steamId: string;
  name: string;
  group: string;
  groupId: number | null;
  adminId: number | null;
  storedGroup: string | null;
  membershipUuid: string | null;
  scopeId: number | null;
  scopeKey: string | null;
  scopeName: string | null;
  scopeType: "global" | "server" | null;
  rowVersion: number | null;
  serverGuids: string[];
  startsAt: string | null;
  expiresAt: string | null;
  updatedAt: string | null;
  status: StaffAdminMembershipStatus;
  permanent: boolean;
  immunity: number | null;
  enabled: boolean;
};

export type StaffAdminMembershipPlayer = {
  steamId: string;
  name: string;
  records: StaffAdminMembershipRecord[];
  activeGroupCount: number;
};

export type StaffAdminMembershipSnapshot = {
  records: StaffAdminMembershipRecord[];
  players: StaffAdminMembershipPlayer[];
};

export type StaffAdminNativeMembershipReference = {
  source: "native";
  steamId: string;
  adminId: number;
  storedGroup: string;
};

export type StaffAdminPortalMembershipReference = {
  source: "portal";
  steamId: string;
  groupId: number;
  membershipUuid: string;
  scopeId: number;
  rowVersion: number;
};

export type StaffAdminMembershipReference =
  | StaffAdminNativeMembershipReference
  | StaffAdminPortalMembershipReference;

export class StaffAdminMembershipError extends Error {
  constructor(
    public readonly code:
      | "admin-membership-invalid"
      | "admin-membership-not-found"
      | "admin-membership-permanent"
      | "admin-membership-conflict"
      | "admin-membership-stale"
      | "admin-membership-founder"
      | "admin-membership-immunity"
      | "admin-game-storage"
      | "admin-portal-storage",
    message: string,
  ) {
    super(message);
    this.name = "StaffAdminMembershipError";
  }
}

type NativeAdminRow = RowDataPacket & {
  Id: string | number;
  SteamId64: string;
  Username: string | null;
  Permissions: unknown;
  Groups: unknown;
  Immunity: string | number;
  Servers: unknown;
};

type RuntimeAdminGroupRow = RowDataPacket & {
  Name: string;
  Servers: unknown;
  Immunity: string | number;
};

type PortalAdminMembershipRow = RowDataPacket & {
  group_id: string | number;
  steam_id: string;
  starts_at: Date | string;
  expires_at: Date | string | null;
  revoked_at: Date | string | null;
  updated_at: Date | string;
  display_name: string;
  external_key: string | null;
  group_enabled: string | number | boolean;
  rank_weight: string | number | null;
  membership_uuid?: string;
  arena_group_id?: string | number;
  scope_id?: string | number;
  scope_uuid?: string;
  scope_key?: string;
  scope_name?: string;
  scope_type?: "global" | "server";
  admin_server_guid?: string | null;
  membership_status?: "active" | "revoked" | "superseded" | "conflict";
  row_version?: string | number;
};

type ArenaAdminDefinitionRow = RowDataPacket & {
  id: string | number;
  arena_group_id: string | number;
  group_uuid: string;
  scope_id: string | number;
  scope_uuid: string;
  scope_type: "global" | "server";
  external_key: string;
  enabled: string | number | boolean;
  rank_weight: string | number;
};

function adminMembershipError(
  code: StaffAdminMembershipError["code"],
  message: string,
): never {
  throw new StaffAdminMembershipError(code, message);
}

function requireSteamId(value: string) {
  const steamId = String(value).trim();
  if (!/^7656119\d{10}$/.test(steamId)) {
    adminMembershipError(
      "admin-membership-invalid",
      "The player SteamID64 is invalid.",
    );
  }
  return steamId;
}

function requirePositiveId(value: number, label: string) {
  if (!Number.isSafeInteger(value) || value < 1) {
    adminMembershipError(
      "admin-membership-invalid",
      `${label} is invalid.`,
    );
  }
  return value;
}

function requireActorImmunity(value: number) {
  if (!Number.isSafeInteger(value) || value < 0 || value > 2_147_483_647) {
    adminMembershipError(
      "admin-membership-invalid",
      "The acting administrator immunity is invalid.",
    );
  }
  return value;
}

function assignmentDurationMinutes(value: number) {
  if (!Number.isSafeInteger(value) || value < 0 || value > 525_600) {
    adminMembershipError(
      "admin-membership-invalid",
      "The Admin assignment duration must be between 0 and 525600 minutes; 0 is permanent.",
    );
  }
  return value;
}

function extensionDurationMinutes(value: number) {
  if (!Number.isSafeInteger(value) || value < 1 || value > 525_600) {
    adminMembershipError(
      "admin-membership-invalid",
      "The Admin assignment duration must be between 1 and 525600 minutes.",
    );
  }
  return value;
}

function exactStoredGroup(value: unknown) {
  const group = String(value ?? "");
  if (
    group.length < 1 ||
    group.length > 100 ||
    /[\u0000-\u001f\u007f]/.test(group)
  ) {
    adminMembershipError(
      "admin-membership-invalid",
      "The stored Admins.Core group reference is invalid.",
    );
  }
  return group;
}

function optionalReason(value: string | null | undefined) {
  const reason = String(value ?? "").normalize("NFKC").trim();
  if (!reason) return null;
  if (reason.length > 180 || /[\u0000-\u001f\u007f]/.test(reason)) {
    adminMembershipError(
      "admin-membership-invalid",
      "The Admin assignment reason is invalid.",
    );
  }
  return reason;
}

function storedStringList(value: unknown) {
  let entries: unknown[] = [];
  if (Array.isArray(value)) {
    entries = value;
  } else if (typeof value === "string" && value.trim()) {
    try {
      const parsed: unknown = JSON.parse(value);
      entries = Array.isArray(parsed) ? parsed : value.split(",");
    } catch {
      entries = value.split(",");
    }
  }
  const result = new Map<string, string>();
  for (const entry of entries) {
    const text = String(entry ?? "").trim();
    if (!text || text.length > 255 || /[\r\n\0]/.test(text)) continue;
    const key = text.normalize("NFKC").toLocaleLowerCase("en-US");
    if (!result.has(key)) result.set(key, text);
  }
  return [...result.values()];
}

function groupIdentity(value: unknown) {
  return String(value ?? "")
    .normalize("NFKC")
    .trim()
    .toLocaleLowerCase("en-US");
}

function isFounderGroup(value: unknown) {
  return groupIdentity(value) === "founder";
}

function asBoolean(value: unknown) {
  return value === true || value === 1 || value === "1";
}

function arenaAuthorityMissing(error: unknown) {
  const candidate = error as { code?: unknown; errno?: unknown };
  return candidate.code === "ER_NO_SUCH_TABLE" ||
    candidate.errno === 1146 ||
    candidate.code === "ER_BAD_FIELD_ERROR" ||
    candidate.errno === 1054;
}

function deterministicArenaUuid(seed: string) {
  const hex = createHash("sha256")
    .update(`arena-admin-membership:${seed}`)
    .digest("hex");
  const bytes = hex.slice(0, 32).split("");
  bytes[12] = "5";
  bytes[16] = ((Number.parseInt(bytes[16], 16) & 0x3) | 0x8).toString(16);
  const value = bytes.join("");
  return `${value.slice(0, 8)}-${value.slice(8, 12)}-${value.slice(12, 16)}-${value.slice(16, 20)}-${value.slice(20)}`;
}

function preferArenaDefinitionScope(
  candidate: Pick<PortalAdminMembershipRow, "scope_type" | "scope_id">,
  current: Pick<PortalAdminMembershipRow, "scope_type" | "scope_id">,
) {
  const candidateServer = candidate.scope_type === "server";
  const currentServer = current.scope_type === "server";
  if (candidateServer !== currentServer) return candidateServer;
  return Number(candidate.scope_id) < Number(current.scope_id);
}

function asDate(value: Date | string | null | undefined) {
  if (value === null || value === undefined) return null;
  const date = value instanceof Date ? value : new Date(value);
  if (!Number.isFinite(date.getTime())) {
    adminMembershipError(
      "admin-membership-stale",
      "A stored Admin membership date is invalid.",
    );
  }
  return date;
}

function toIso(value: Date | string | null | undefined) {
  return asDate(value)?.toISOString() ?? null;
}

function portalStatus(
  row: PortalAdminMembershipRow,
  now = new Date(),
): StaffAdminMembershipStatus {
  if (
    row.revoked_at !== null ||
    (row.membership_status !== undefined && row.membership_status !== "active")
  ) {
    return "revoked";
  }
  const startsAt = asDate(row.starts_at)!;
  const expiresAt = asDate(row.expires_at);
  if (startsAt.getTime() > now.getTime()) return "scheduled";
  if (expiresAt && expiresAt.getTime() <= now.getTime()) return "expired";
  return "active";
}

async function readNativeAdminRows() {
  const pool = getGameDatabasePool();
  if (!pool) return [] as NativeAdminRow[];
  const [rows] = await pool.query<NativeAdminRow[]>(
    "SELECT Id, SteamId64, Username, Permissions, Groups, Immunity, Servers " +
      "FROM admins ORDER BY Username, SteamId64, Id",
  );
  return rows;
}

async function readArenaAdminRows(): Promise<{
  available: boolean;
  rows: PortalAdminMembershipRow[];
}> {
  const pool = getGameDatabasePool();
  if (!pool) {
    adminMembershipError(
      "admin-game-storage",
      "The arena group authority database is not configured.",
    );
  }
  try {
    const [rows] = await pool.query<PortalAdminMembershipRow[]>(
      "SELECT membership.membership_uuid, membership.steam_id, " +
        "membership.starts_at, membership.expires_at, membership.revoked_at, " +
        "membership.updated_at, membership.status AS membership_status, membership.row_version, " +
        "arena_group.id AS arena_group_id, arena_group.legacy_portal_group_id AS group_id, " +
        "arena_group.display_name, arena_group.external_key, " +
        "(arena_group.enabled AND group_scope.enabled AND scope.enabled) AS group_enabled, " +
        "COALESCE(group_scope.immunity_override, arena_group.immunity) AS rank_weight, " +
        "scope.id AS scope_id, scope.scope_uuid, scope.scope_key, " +
        "scope.display_name AS scope_name, scope.scope_type, scope.admin_server_guid " +
        "FROM arena_group_memberships AS membership " +
        "INNER JOIN arena_groups AS arena_group ON arena_group.id = membership.group_id " +
        "INNER JOIN arena_group_scopes AS group_scope ON group_scope.group_id = membership.group_id " +
        "AND group_scope.scope_id = membership.scope_id " +
        "INNER JOIN arena_scopes AS scope ON scope.id = membership.scope_id " +
        "WHERE arena_group.group_type = 'admin' " +
        "AND arena_group.legacy_portal_group_id IS NOT NULL " +
        "AND membership.provenance_type <> 'legacy_admins' " +
        "AND (scope.scope_type = 'global' OR (scope.scope_type = 'server' " +
        "AND LOWER(scope.admin_server_guid) = LOWER(?))) " +
        "ORDER BY membership.steam_id, arena_group.legacy_portal_group_id, " +
        "scope.scope_type DESC, scope.id",
      [configuredGameServerGuid()],
    );
    // Do not collapse by legacy group ID: the same group can be held in both
    // global and server scopes, and each row must remain independently mutable.
    return { available: true, rows };
  } catch (error) {
    if (arenaAuthorityMissing(error)) return { available: false, rows: [] };
    throw error;
  }
}

export async function getStaffAdminMembershipSnapshot(): Promise<
  StaffAdminMembershipSnapshot
> {
  const [nativeRows, arenaRows] = await Promise.all([
    readNativeAdminRows(),
    readArenaAdminRows(),
  ]);
  // `source: "portal"` and the portal-shaped group ID remain an API/UI
  // compatibility contract. Arena is the only live membership authority;
  // an unavailable rolling-upgrade schema fails closed to no managed rows.
  const portalRows = arenaRows.available ? arenaRows.rows : [];
  const nativeNames = new Map<string, string>();
  const nativeRecords: StaffAdminMembershipRecord[] = [];
  for (const row of nativeRows) {
    const steamId = requireSteamId(String(row.SteamId64));
    const adminId = Number(row.Id);
    if (!Number.isSafeInteger(adminId) || adminId < 1) {
      adminMembershipError(
        "admin-membership-stale",
        "A native Admins.Core row ID is invalid.",
      );
    }
    const name = String(row.Username ?? "").trim() || `Steam ${steamId}`;
    nativeNames.set(steamId, name);
    const serverGuids = storedStringList(row.Servers);
    for (const storedGroup of storedStringList(row.Groups)) {
      nativeRecords.push({
        recordKey: `native:${adminId}:${encodeURIComponent(storedGroup)}`,
        source: "native",
        steamId,
        name,
        group: storedGroup,
        groupId: null,
        adminId,
        storedGroup,
        membershipUuid: null,
        scopeId: null,
        scopeKey: null,
        scopeName: null,
        scopeType: null,
        rowVersion: null,
        serverGuids,
        startsAt: null,
        expiresAt: null,
        updatedAt: null,
        status: "active",
        permanent: true,
        immunity: null,
        enabled: isAssignedToConfiguredGameServer(serverGuids),
      });
    }
  }

  const portalRecords: StaffAdminMembershipRecord[] = portalRows.map((row) => {
    const steamId = requireSteamId(String(row.steam_id));
    const groupId = Number(row.group_id);
    if (!Number.isSafeInteger(groupId) || groupId < 1) {
      adminMembershipError(
        "admin-membership-stale",
        "A portal Admin group ID is invalid.",
      );
    }
    const rankWeight = row.rank_weight === null ? null : Number(row.rank_weight);
    if (rankWeight !== null && !Number.isSafeInteger(rankWeight)) {
      adminMembershipError(
        "admin-membership-stale",
        "A portal Admin group immunity is invalid.",
      );
    }
    let membershipUuid: string | null = null;
    let scopeId: number | null = null;
    let scopeKey: string | null = null;
    let scopeName: string | null = null;
    let scopeType: "global" | "server" | null = null;
    let rowVersion: number | null = null;
    let serverGuids: string[] = [];
    if (arenaRows.available) {
      const identity = requireArenaMembershipIdentity(row);
      membershipUuid = identity.membershipUuid;
      scopeId = identity.scopeId;
      rowVersion = identity.rowVersion;
      scopeKey = String(row.scope_key ?? "").trim();
      scopeName = String(row.scope_name ?? "").trim();
      scopeType = row.scope_type === "global" || row.scope_type === "server"
        ? row.scope_type
        : null;
      const serverGuid = String(row.admin_server_guid ?? "").trim();
      if (!scopeKey || !scopeName || scopeType === null) {
        adminMembershipError(
          "admin-membership-stale",
          "An arena Admin membership scope is invalid.",
        );
      }
      serverGuids = serverGuid ? [serverGuid] : [];
    }
    return {
      recordKey: membershipUuid
        ? `portal:${membershipUuid}`
        : `portal-fallback:${steamId}:${groupId}`,
      source: "portal",
      steamId,
      name: nativeNames.get(steamId) ?? `Steam ${steamId}`,
      group: String(row.external_key ?? row.display_name),
      groupId,
      adminId: null,
      storedGroup: null,
      membershipUuid,
      scopeId,
      scopeKey,
      scopeName,
      scopeType,
      rowVersion,
      serverGuids,
      startsAt: toIso(row.starts_at),
      expiresAt: toIso(row.expires_at),
      updatedAt: toIso(row.updated_at),
      status: portalStatus(row),
      permanent: row.expires_at === null,
      immunity: rankWeight,
      enabled: asBoolean(row.group_enabled) && rankWeight !== null,
    };
  });

  const records = [...nativeRecords, ...portalRecords].sort((left, right) =>
    left.name.localeCompare(right.name, "en", { sensitivity: "base" }) ||
    left.steamId.localeCompare(right.steamId) ||
    left.group.localeCompare(right.group, "en", { sensitivity: "base" }) ||
    left.recordKey.localeCompare(right.recordKey));
  const recordsBySteamId = new Map<string, StaffAdminMembershipRecord[]>();
  for (const record of records) {
    const playerRecords = recordsBySteamId.get(record.steamId) ?? [];
    playerRecords.push(record);
    recordsBySteamId.set(record.steamId, playerRecords);
  }
  const players = [...recordsBySteamId].map(([steamId, playerRecords]) => ({
    steamId,
    name:
      playerRecords.find((record) => !record.name.startsWith("Steam "))?.name ??
      playerRecords[0]?.name ??
      `Steam ${steamId}`,
    records: playerRecords,
    activeGroupCount: new Set(
      playerRecords
        .filter((record) => record.status === "active" && record.enabled)
        .map((record) => groupIdentity(record.group)),
    ).size,
  })).sort((left, right) =>
    left.name.localeCompare(right.name, "en", { sensitivity: "base" }) ||
    left.steamId.localeCompare(right.steamId));

  return { records, players };
}

async function withGameTransaction<T>(
  work: (connection: PoolConnection) => Promise<T>,
) {
  const pool = getGameDatabasePool();
  if (!pool) {
    adminMembershipError(
      "admin-game-storage",
      "The Admins.Core database is not configured.",
    );
  }
  const connection = await pool.getConnection();
  try {
    await connection.beginTransaction();
    const result = await work(connection);
    await connection.commit();
    return result;
  } catch (error) {
    try {
      await connection.rollback();
    } catch {
      // Preserve the original mutation error.
    }
    throw error;
  } finally {
    connection.release();
  }
}

async function lockScopedNativeAdminContext(
  connection: PoolConnection,
  steamIdInput: string,
) {
  const steamId = requireSteamId(steamIdInput);
  // Runtime group editing locks `groups` before cascading through `admins`.
  // Use the same order so immunity is computed from one stable native snapshot.
  const [definitions] = await connection.query<RuntimeAdminGroupRow[]>(
    "SELECT Name, Servers, Immunity FROM `groups` ORDER BY Name, Id FOR UPDATE",
  );
  const [rows] = await connection.query<NativeAdminRow[]>(
    "SELECT Id, SteamId64, Username, Permissions, Groups, Immunity, Servers " +
      "FROM admins WHERE SteamId64 = ? LIMIT 1 FOR UPDATE",
    [steamId],
  );
  const row = rows[0];
  if (!row) {
    return { row, definitions, groupNames: [] as string[], immunity: 0 };
  }
  const groupNames = storedStringList(row.Groups);
  const serverGuids = storedStringList(row.Servers);
  const storedImmunity = Number(row.Immunity);
  const immunity = Math.max(
    storedImmunity,
    runtimeImmunity(groupNames, serverGuids, definitions),
  );
  if (!Number.isSafeInteger(storedImmunity) || storedImmunity < 0 ||
      !Number.isSafeInteger(immunity) || immunity < 0) {
    adminMembershipError(
      "admin-membership-stale",
      "The native Admins.Core immunity is invalid.",
    );
  }
  return {
    row,
    definitions,
    groupNames: isAssignedToConfiguredGameServer(serverGuids)
      ? groupNames
      : [],
    // Whole-row Admins.Core mutations can affect every server scope. Preserve
    // the global locked immunity even when the target is not currently assigned
    // to this portal's server, so a lower actor cannot adopt and overwrite it.
    immunity,
  };
}

async function lockArenaAdminContext(
  connection: PoolConnection,
  steamId: string,
) {
  const serverGuid = configuredGameServerGuid();
  const [definitionRows] = await connection.query<ArenaAdminDefinitionRow[]>(
    "SELECT arena_group.legacy_portal_group_id AS id, " +
      "arena_group.id AS arena_group_id, arena_group.group_uuid, " +
      "arena_group.external_key, TRUE AS enabled, " +
      "COALESCE(group_scope.immunity_override, arena_group.immunity) AS rank_weight, " +
      "scope.id AS scope_id, scope.scope_uuid, scope.scope_key, " +
      "scope.display_name AS scope_name, scope.scope_type, scope.admin_server_guid " +
      "FROM arena_groups AS arena_group " +
      "INNER JOIN arena_group_scopes AS group_scope ON group_scope.group_id = arena_group.id " +
      "INNER JOIN arena_scopes AS scope ON scope.id = group_scope.scope_id " +
      "WHERE arena_group.group_type = 'admin' " +
      "AND arena_group.legacy_portal_group_id IS NOT NULL " +
      "AND arena_group.enabled = TRUE AND group_scope.enabled = TRUE AND scope.enabled = TRUE " +
      "AND (scope.scope_type = 'global' OR (scope.scope_type = 'server' " +
      "AND LOWER(scope.admin_server_guid) = LOWER(?))) " +
      "ORDER BY arena_group.legacy_portal_group_id, scope.scope_type DESC, scope.id " +
      "FOR UPDATE",
    [serverGuid],
  );
  const [memberships] = await connection.query<PortalAdminMembershipRow[]>(
    "SELECT membership.membership_uuid, membership.steam_id, membership.starts_at, " +
      "membership.expires_at, membership.revoked_at, membership.updated_at, " +
      "membership.status AS membership_status, membership.row_version, " +
      "arena_group.legacy_portal_group_id AS group_id, arena_group.id AS arena_group_id, " +
      "arena_group.display_name, arena_group.external_key, " +
      "(arena_group.enabled AND group_scope.enabled AND scope.enabled) AS group_enabled, " +
      "COALESCE(group_scope.immunity_override, arena_group.immunity) AS rank_weight, " +
      "scope.id AS scope_id, scope.scope_uuid, scope.scope_type " +
      "FROM arena_group_memberships AS membership " +
      "INNER JOIN arena_groups AS arena_group ON arena_group.id = membership.group_id " +
      "INNER JOIN arena_group_scopes AS group_scope ON group_scope.group_id = membership.group_id " +
      "AND group_scope.scope_id = membership.scope_id " +
      "INNER JOIN arena_scopes AS scope ON scope.id = membership.scope_id " +
      "WHERE membership.steam_id = ? AND arena_group.group_type = 'admin' " +
      "AND arena_group.legacy_portal_group_id IS NOT NULL " +
      "AND membership.provenance_type <> 'legacy_admins' " +
      "AND (scope.scope_type = 'global' OR (scope.scope_type = 'server' " +
      "AND LOWER(scope.admin_server_guid) = LOWER(?))) " +
      "ORDER BY arena_group.legacy_portal_group_id, scope.scope_type DESC, scope.id " +
      "FOR UPDATE",
    [steamId, serverGuid],
  );
  const definitionsByPortalId = new Map<number, ArenaAdminDefinitionRow>();
  for (const definition of definitionRows) {
    const portalGroupId = Number(definition.id);
    const current = definitionsByPortalId.get(portalGroupId);
    if (!current || preferArenaDefinitionScope(definition, current)) {
      definitionsByPortalId.set(portalGroupId, definition);
    }
  }
  const definitions = [...definitionsByPortalId.values()];
  return { definitions, memberships };
}

function requireEnabledDefinition(
  definitions: ArenaAdminDefinitionRow[],
  groupId: number,
) {
  const definition = definitions.find((row) => Number(row.id) === groupId);
  if (!definition || !asBoolean(definition.enabled)) {
    adminMembershipError(
      "admin-membership-stale",
      "The selected Admins.Core group is not an enabled connected definition.",
    );
  }
  if (isFounderGroup(definition.external_key)) {
    adminMembershipError(
      "admin-membership-founder",
      "Founder authority cannot be assigned, extended, or removed through a portal membership.",
    );
  }
  return definition;
}

function requireMutableArenaMembership(
  memberships: PortalAdminMembershipRow[],
  reference: Pick<
    StaffAdminPortalMembershipReference,
    "groupId" | "membershipUuid" | "scopeId" | "rowVersion"
  >,
) {
  const membership = memberships.find((row) =>
    String(row.membership_uuid ?? "") === reference.membershipUuid &&
    Number(row.scope_id) === reference.scopeId &&
    Number(row.group_id) === reference.groupId
  );
  if (!membership) {
    adminMembershipError(
      "admin-membership-not-found",
      "That portal Admin membership no longer exists.",
    );
  }
  if (isFounderGroup(membership.external_key)) {
    adminMembershipError(
      "admin-membership-founder",
      "Founder authority cannot be assigned, extended, or removed through a portal membership.",
    );
  }
  const identity = requireArenaMembershipIdentity(membership);
  if (identity.rowVersion !== reference.rowVersion) {
    adminMembershipError(
      "admin-membership-stale",
      "That arena Admin membership changed before it could be managed. Refresh before retrying.",
    );
  }
  return membership;
}

function requireRankWithinActor(rankValue: unknown, actorImmunity: number) {
  const rank = Number(rankValue);
  if (!Number.isSafeInteger(rank) || rank < 0) {
    adminMembershipError(
      "admin-membership-stale",
      "The connected Admin group immunity is invalid.",
    );
  }
  if (rank > actorImmunity) {
    adminMembershipError(
      "admin-membership-immunity",
      "The connected Admin group has greater immunity than the acting administrator.",
    );
  }
  return rank;
}

function requireLiveRuntimeDefinition(
  portalDefinition: { external_key: string | null },
  runtimeDefinitions: RuntimeAdminGroupRow[],
) {
  const identity = groupIdentity(portalDefinition.external_key);
  const matches = runtimeDefinitions.filter(
    (definition) =>
      groupIdentity(definition.Name) === identity &&
      isAssignedToConfiguredGameServer(storedStringList(definition.Servers)),
  );
  if (matches.length !== 1) {
    adminMembershipError(
      "admin-membership-stale",
      "The selected Admins.Core group is no longer a unique live definition for this server.",
    );
  }
  const immunity = Number(matches[0].Immunity);
  if (!Number.isSafeInteger(immunity) || immunity < 0) {
    adminMembershipError(
      "admin-membership-stale",
      "The live Admins.Core group immunity is invalid.",
    );
  }
  return { definition: matches[0], immunity };
}

function requirePortalTargetWithinActor(
  context: Awaited<ReturnType<typeof lockArenaAdminContext>>,
  runtimeDefinitions: RuntimeAdminGroupRow[],
  actorImmunity: number,
) {
  for (const membership of context.memberships) {
    if (portalStatus(membership) !== "active") continue;
    if (isFounderGroup(membership.external_key)) {
      adminMembershipError(
        "admin-membership-founder",
        "A portal Founder membership cannot be managed through staff actions.",
      );
    }
    if (!asBoolean(membership.group_enabled)) continue;
    const liveDefinition = requireLiveRuntimeDefinition(
      membership,
      runtimeDefinitions,
    );
    requireRankWithinActor(liveDefinition.immunity, actorImmunity);
  }
}

function requireArenaDefinitionIdentity(definition: ArenaAdminDefinitionRow) {
  const arenaGroupId = Number(definition.arena_group_id);
  const scopeId = Number(definition.scope_id);
  if (
    !Number.isSafeInteger(arenaGroupId) ||
    arenaGroupId < 1 ||
    !Number.isSafeInteger(scopeId) ||
    scopeId < 1 ||
    !arenaUuidPattern.test(String(definition.group_uuid)) ||
    !arenaUuidPattern.test(String(definition.scope_uuid))
  ) {
    adminMembershipError(
      "admin-membership-stale",
      "The connected arena Admin group mapping is invalid.",
    );
  }
  return {
    arenaGroupId,
    scopeId,
    groupUuid: String(definition.group_uuid),
    scopeUuid: String(definition.scope_uuid),
  };
}

function requireArenaMembershipIdentity(membership: PortalAdminMembershipRow) {
  const membershipUuid = String(membership.membership_uuid ?? "");
  const arenaGroupId = Number(membership.arena_group_id);
  const scopeId = Number(membership.scope_id);
  const rowVersion = Number(membership.row_version);
  if (
    !arenaUuidPattern.test(membershipUuid) ||
    !Number.isSafeInteger(arenaGroupId) ||
    arenaGroupId < 1 ||
    !Number.isSafeInteger(scopeId) ||
    scopeId < 1 ||
    !Number.isSafeInteger(rowVersion) ||
    rowVersion < 1
  ) {
    adminMembershipError(
      "admin-membership-stale",
      "The arena Admin membership identity is invalid.",
    );
  }
  return { membershipUuid, arenaGroupId, scopeId, rowVersion };
}

async function writeArenaAdminMembershipOutbox(
  connection: PoolConnection,
  input: {
    action: "assigned" | "extended" | "revoked";
    membershipUuid: string;
    arenaGroupId: number;
    portalGroupId: number;
    scopeId: number;
    steamId: string;
    startsAt: Date | string;
    expiresAt: Date | string | null;
    status: "active" | "revoked";
    rowVersion: number;
    actorSteamId: string;
    reason: string | null;
    metadata?: Record<string, unknown>;
  },
) {
  const eventType = `identity.group_membership.${input.action}`;
  const deduplicationKey =
    `admin-membership:${input.membershipUuid}:${input.rowVersion}:${input.action}`;
  const eventUuid = deterministicArenaUuid(`outbox:${deduplicationKey}`);
  await connection.execute(
    "INSERT INTO arena_membership_outbox " +
      "(event_uuid, deduplication_key, event_type, aggregate_type, aggregate_key, " +
      "membership_uuid, steam_id, group_id, scope_id, payload) " +
      "VALUES (?, ?, ?, 'arena_group_membership', ?, ?, ?, ?, ?, ?)",
    [
      eventUuid,
      deduplicationKey,
      eventType,
      input.membershipUuid,
      input.membershipUuid,
      input.steamId,
      input.arenaGroupId,
      input.scopeId,
      JSON.stringify({
        schemaVersion: 1,
        action: input.action,
        groupType: "admin",
        membershipUuid: input.membershipUuid,
        legacyPortalGroupId: input.portalGroupId,
        steamId: input.steamId,
        arenaGroupId: input.arenaGroupId,
        scopeId: input.scopeId,
        startsAt: toIso(input.startsAt),
        expiresAt: toIso(input.expiresAt),
        status: input.status,
        rowVersion: input.rowVersion,
        actorSteamId: input.actorSteamId,
        reason: input.reason,
        ...input.metadata,
      }),
    ],
  );
}

export async function assignStaffAdminMembership(input: {
  steamId: string;
  groupId: number;
  durationMinutes: number;
  actorSteamId: string;
  actorImmunity: number;
  reason?: string | null;
}) {
  const steamId = requireSteamId(input.steamId);
  const actorSteamId = requireSteamId(input.actorSteamId);
  const groupId = requirePositiveId(input.groupId, "The portal Admin group ID");
  const minutes = assignmentDurationMinutes(input.durationMinutes);
  const actorImmunity = requireActorImmunity(input.actorImmunity);
  const reason = optionalReason(input.reason);
  return withGameTransaction(async (connection) => {
    const nativeContext = await lockScopedNativeAdminContext(connection, steamId);
    if (nativeContext.immunity > actorImmunity) {
      adminMembershipError(
        "admin-membership-immunity",
        "The target administrator has greater immunity than the acting administrator.",
      );
    }
    const context = await lockArenaAdminContext(connection, steamId);
    requirePortalTargetWithinActor(
      context,
      nativeContext.definitions,
      actorImmunity,
    );
    const definition = requireEnabledDefinition(context.definitions, groupId);
    const liveDefinition = requireLiveRuntimeDefinition(
      definition,
      nativeContext.definitions,
    );
    requireRankWithinActor(liveDefinition.immunity, actorImmunity);
    const now = new Date();
    const expiresAt = minutes === 0
      ? null
      : new Date(now.getTime() + minutes * 60_000);
    if (expiresAt && expiresAt.getTime() > maximumTimestampSeconds * 1_000) {
      adminMembershipError(
        "admin-membership-invalid",
        "The Admin membership expiry exceeds the supported date.",
      );
    }
    const target = requireArenaDefinitionIdentity(definition);
    const targetExisting = context.memberships.find(
      (membership) =>
        Number(membership.arena_group_id) === target.arenaGroupId &&
        Number(membership.scope_id) === target.scopeId,
    );
    if (
      targetExisting &&
      targetExisting.membership_status === "active" &&
      targetExisting.revoked_at === null &&
      portalStatus(targetExisting) !== "expired"
    ) {
      adminMembershipError(
        "admin-membership-conflict",
        "That Admin membership already exists in the selected arena scope; extend it instead.",
      );
    }
    const membershipUuid = targetExisting
      ? requireArenaMembershipIdentity(targetExisting).membershipUuid
      : deterministicArenaUuid(
          `membership:${steamId}:${target.groupUuid}:${target.scopeUuid}`,
        );
    let rowVersion = 1;
    if (targetExisting) {
      const identity = requireArenaMembershipIdentity(targetExisting);
      if (
        targetExisting.membership_status !== "active" &&
        targetExisting.membership_status !== "revoked"
      ) {
        adminMembershipError(
          "admin-membership-stale",
          "That arena Admin membership is in a state that cannot be reassigned.",
        );
      }
      rowVersion = identity.rowVersion + 1;
      const [updated] = await connection.execute<ResultSetHeader>(
        "UPDATE arena_group_memberships SET starts_at = ?, expires_at = ?, status = 'active', " +
          "provenance_type = 'staff', provenance_reference = ?, source_inventory_item_id = NULL, " +
          "origin_command_uuid = NULL, granted_by_actor = ?, grant_reason = ?, " +
          "revoked_at = NULL, revoked_by_actor = NULL, revoke_reason = NULL, " +
          "row_version = row_version + 1 " +
          "WHERE membership_uuid = ? AND row_version = ?",
        [
          now,
          expiresAt,
          `staff-admin:${groupId}:${target.scopeUuid}`,
          actorSteamId,
          reason,
          membershipUuid,
          identity.rowVersion,
        ],
      );
      if (updated.affectedRows !== 1) {
        adminMembershipError(
          "admin-membership-stale",
          "That arena Admin membership changed before it could be assigned.",
        );
      }
    } else {
      await connection.execute(
        "INSERT INTO arena_group_memberships " +
          "(membership_uuid, group_id, scope_id, steam_id, starts_at, expires_at, status, " +
          "provenance_type, provenance_reference, granted_by_actor, grant_reason, row_version) " +
          "VALUES (?, ?, ?, ?, ?, ?, 'active', 'staff', ?, ?, ?, 1)",
        [
          membershipUuid,
          target.arenaGroupId,
          target.scopeId,
          steamId,
          now,
          expiresAt,
          `staff-admin:${groupId}:${target.scopeUuid}`,
          actorSteamId,
          reason,
        ],
      );
    }
    await writeArenaAdminMembershipOutbox(connection, {
      action: "assigned",
      membershipUuid,
      arenaGroupId: target.arenaGroupId,
      portalGroupId: groupId,
      scopeId: target.scopeId,
      steamId,
      startsAt: now,
      expiresAt,
      status: "active",
      rowVersion,
      actorSteamId,
      reason,
    });
    return {
      recordKey: `portal:${membershipUuid}`,
      membershipUuid,
      scopeId: target.scopeId,
      rowVersion,
      groupId,
      steamId,
      expiresAt: expiresAt?.toISOString() ?? null,
    };
  });
}

export async function extendStaffAdminMembership(input: {
  reference: StaffAdminPortalMembershipReference;
  extensionMinutes: number;
  actorSteamId: string;
  actorImmunity: number;
  expectedExpiresAt?: string | null;
}) {
  const reference = requirePortalReference(input.reference);
  const steamId = reference.steamId;
  const actorSteamId = requireSteamId(input.actorSteamId);
  const groupId = reference.groupId;
  const addedMinutes = extensionDurationMinutes(input.extensionMinutes);
  const actorImmunity = requireActorImmunity(input.actorImmunity);
  return withGameTransaction(async (connection) => {
    const nativeContext = await lockScopedNativeAdminContext(connection, steamId);
    if (nativeContext.immunity > actorImmunity) {
      adminMembershipError(
        "admin-membership-immunity",
        "The target administrator has greater immunity than the acting administrator.",
      );
    }
    const context = await lockArenaAdminContext(connection, steamId);
    requirePortalTargetWithinActor(
      context,
      nativeContext.definitions,
      actorImmunity,
    );
    const membership = requireMutableArenaMembership(
      context.memberships,
      reference,
    );
    if (
      membership.revoked_at !== null ||
      membership.membership_status !== "active"
    ) {
      adminMembershipError(
        "admin-membership-not-found",
        "That portal Admin membership has been revoked.",
      );
    }
    if (!asBoolean(membership.group_enabled)) {
      adminMembershipError(
        "admin-membership-stale",
        "That arena Admin group or scope is no longer enabled.",
      );
    }
    const liveDefinition = requireLiveRuntimeDefinition(
      membership,
      nativeContext.definitions,
    );
    requireRankWithinActor(liveDefinition.immunity, actorImmunity);
    if (membership.expires_at === null) {
      adminMembershipError(
        "admin-membership-permanent",
        "Permanent Admin memberships cannot be extended.",
      );
    }
    const currentExpiry = asDate(membership.expires_at)!;
    const expectedExpiry = asDate(input.expectedExpiresAt);
    if (
      expectedExpiry === null ||
      Math.abs(expectedExpiry.getTime() - currentExpiry.getTime()) > 1_000
    ) {
      adminMembershipError(
        "admin-membership-stale",
        "That Admin membership expiry changed before it could be extended. Refresh before retrying.",
      );
    }
    const expiresAt = new Date(
      Math.max(Date.now(), currentExpiry.getTime()) + addedMinutes * 60_000,
    );
    if (expiresAt.getTime() > maximumTimestampSeconds * 1_000) {
      adminMembershipError(
        "admin-membership-invalid",
        "The Admin membership expiry exceeds the supported date.",
      );
    }
    const identity = requireArenaMembershipIdentity(membership);
    const rowVersion = identity.rowVersion + 1;
    const [updated] = await connection.execute<ResultSetHeader>(
      "UPDATE arena_group_memberships " +
        // Extending a future assignment must not activate it early. Keep its
        // scheduled start intact and move only the entitlement's end date.
        "SET expires_at = ?, " +
        "granted_by_actor = ?, row_version = row_version + 1 " +
        "WHERE membership_uuid = ? AND row_version = ? AND status = 'active' " +
        "AND ABS(TIMESTAMPDIFF(SECOND, expires_at, ?)) <= 1",
      [
        expiresAt,
        actorSteamId,
        identity.membershipUuid,
        identity.rowVersion,
        expectedExpiry,
      ],
    );
    if (updated.affectedRows !== 1) {
      adminMembershipError(
        "admin-membership-stale",
        "That portal Admin membership changed before it could be extended.",
      );
    }
    await writeArenaAdminMembershipOutbox(connection, {
      action: "extended",
      membershipUuid: identity.membershipUuid,
      arenaGroupId: identity.arenaGroupId,
      portalGroupId: groupId,
      scopeId: identity.scopeId,
      steamId,
      startsAt: membership.starts_at,
      expiresAt,
      status: "active",
      rowVersion,
      actorSteamId,
      reason: null,
      metadata: {
        previousExpiresAt: currentExpiry.toISOString(),
        extensionMinutes: addedMinutes,
      },
    });
    return {
      recordKey: `portal:${identity.membershipUuid}`,
      membershipUuid: identity.membershipUuid,
      scopeId: identity.scopeId,
      rowVersion,
      groupId,
      steamId,
      expiresAt: expiresAt.toISOString(),
    };
  });
}

function requireNativeReference(reference: StaffAdminNativeMembershipReference) {
  return {
    steamId: requireSteamId(reference.steamId),
    adminId: requirePositiveId(reference.adminId, "The native Admin row ID"),
    storedGroup: exactStoredGroup(reference.storedGroup),
  };
}

function requirePortalReference(reference: StaffAdminPortalMembershipReference) {
  const membershipUuid = String(reference.membershipUuid ?? "").trim();
  if (!arenaUuidPattern.test(membershipUuid)) {
    adminMembershipError(
      "admin-membership-invalid",
      "The arena Admin membership reference is invalid.",
    );
  }
  return {
    steamId: requireSteamId(reference.steamId),
    groupId: requirePositiveId(
      reference.groupId,
      "The portal Admin group ID",
    ),
    membershipUuid,
    scopeId: requirePositiveId(reference.scopeId, "The arena scope ID"),
    rowVersion: requirePositiveId(
      reference.rowVersion,
      "The arena membership row version",
    ),
  };
}

function runtimeImmunity(
  remainingGroups: string[],
  adminServerGuids: string[],
  definitions: RuntimeAdminGroupRow[],
) {
  const remaining = new Set(remainingGroups.map(groupIdentity));
  const servers = new Set(
    adminServerGuids.map((server) => server.toLocaleLowerCase("en-US")),
  );
  let immunity = 0;
  for (const definition of definitions) {
    if (!remaining.has(groupIdentity(definition.Name))) continue;
    const applies = storedStringList(definition.Servers).some((server) =>
      servers.has(server.toLocaleLowerCase("en-US")));
    if (!applies) continue;
    const value = Number(definition.Immunity);
    if (Number.isSafeInteger(value)) immunity = Math.max(immunity, value);
  }
  return immunity;
}

async function detachNativeAdminGroup(
  referenceInput: StaffAdminNativeMembershipReference,
  actorImmunity: number,
) {
  const reference = requireNativeReference(referenceInput);
  const result = await withGameTransaction(async (connection) => {
    const nativeContext = await lockScopedNativeAdminContext(
      connection,
      reference.steamId,
    );
    const portalContext = await lockArenaAdminContext(
      connection,
      reference.steamId,
    );
    requirePortalTargetWithinActor(
      portalContext,
      nativeContext.definitions,
      actorImmunity,
    );
    const row = nativeContext.row;
    if (!row || Number(row.Id) !== reference.adminId) {
      adminMembershipError(
        "admin-membership-not-found",
        "That native Admins.Core row no longer exists.",
      );
    }
    const serverGuids = storedStringList(row.Servers);
    if (!isAssignedToConfiguredGameServer(serverGuids)) {
      adminMembershipError(
        "admin-membership-stale",
        "That native Admin is not assigned to the configured game server.",
      );
    }
    const groups = storedStringList(row.Groups);
    if (!groups.includes(reference.storedGroup)) {
      adminMembershipError(
        "admin-membership-stale",
        "That exact native Admin group assignment changed before it could be removed.",
      );
    }
    if (isFounderGroup(reference.storedGroup)) {
      adminMembershipError(
        "admin-membership-founder",
        "Founder authority cannot be removed through the portal.",
      );
    }
    const storedImmunity = Number(row.Immunity);
    const currentImmunity = nativeContext.immunity;
    if (
      !Number.isSafeInteger(storedImmunity) ||
      storedImmunity < 0 ||
      !Number.isSafeInteger(currentImmunity) ||
      currentImmunity < 0
    ) {
      adminMembershipError(
        "admin-membership-stale",
        "The target native Admin immunity is invalid.",
      );
    }
    if (currentImmunity > actorImmunity) {
      adminMembershipError(
        "admin-membership-immunity",
        "The target administrator has greater immunity than the acting administrator.",
      );
    }
    const removedIdentity = groupIdentity(reference.storedGroup);
    const remainingGroups = groups.filter(
      (group) => groupIdentity(group) !== removedIdentity,
    );
    const [updated] = await connection.execute<ResultSetHeader>(
      "UPDATE admins SET Groups = ? WHERE Id = ? AND SteamId64 = ?",
      [
        JSON.stringify(remainingGroups),
        reference.adminId,
        reference.steamId,
      ],
    );
    if (updated.affectedRows !== 1) {
      adminMembershipError(
        "admin-membership-stale",
        "That native Admin row changed before it could be updated.",
      );
    }
    return {
      recordKey: `native:${reference.adminId}:${encodeURIComponent(reference.storedGroup)}`,
      steamId: reference.steamId,
      remainingGroups,
      scopedRemainingGroups: isAssignedToConfiguredGameServer(serverGuids)
        ? remainingGroups
        : [],
      immunity: storedImmunity,
    };
  });
  await reconcileIdentityGroupRewards({
    steamId: reference.steamId,
    adminGroupNames: result.scopedRemainingGroups,
  });
  return result;
}

export async function removeStaffAdminMembership(input: {
  reference: StaffAdminMembershipReference;
  actorSteamId: string;
  actorImmunity: number;
}) {
  const actorSteamId = requireSteamId(input.actorSteamId);
  const actorImmunity = requireActorImmunity(input.actorImmunity);
  if (input.reference.source === "native") {
    return detachNativeAdminGroup(input.reference, actorImmunity);
  }

  const reference = requirePortalReference(input.reference);
  return withGameTransaction(async (connection) => {
    const nativeContext = await lockScopedNativeAdminContext(
      connection,
      reference.steamId,
    );
    if (nativeContext.immunity > actorImmunity) {
      adminMembershipError(
        "admin-membership-immunity",
        "The target administrator has greater immunity than the acting administrator.",
      );
    }
    const context = await lockArenaAdminContext(connection, reference.steamId);
    requirePortalTargetWithinActor(
      context,
      nativeContext.definitions,
      actorImmunity,
    );
    const membership = requireMutableArenaMembership(
      context.memberships,
      reference,
    );
    if (
      membership.revoked_at !== null ||
      membership.membership_status !== "active"
    ) {
      adminMembershipError(
        "admin-membership-not-found",
        "That portal Admin membership has already been revoked.",
      );
    }
    const liveDefinition = requireLiveRuntimeDefinition(
      membership,
      nativeContext.definitions,
    );
    requireRankWithinActor(liveDefinition.immunity, actorImmunity);
    const identity = requireArenaMembershipIdentity(membership);
    const rowVersion = identity.rowVersion + 1;
    const revokedAt = new Date();
    const [updated] = await connection.execute<ResultSetHeader>(
      "UPDATE arena_group_memberships SET status = 'revoked', revoked_at = ?, " +
        "revoked_by_actor = ?, revoke_reason = 'Removed by staff', " +
        "row_version = row_version + 1 " +
        "WHERE membership_uuid = ? AND row_version = ? AND status = 'active'",
      [
        revokedAt,
        actorSteamId,
        identity.membershipUuid,
        identity.rowVersion,
      ],
    );
    if (updated.affectedRows !== 1) {
      adminMembershipError(
        "admin-membership-stale",
        "That portal Admin membership changed before it could be removed.",
      );
    }
    await writeArenaAdminMembershipOutbox(connection, {
      action: "revoked",
      membershipUuid: identity.membershipUuid,
      arenaGroupId: identity.arenaGroupId,
      portalGroupId: reference.groupId,
      scopeId: identity.scopeId,
      steamId: reference.steamId,
      startsAt: membership.starts_at,
      expiresAt: membership.expires_at,
      status: "revoked",
      rowVersion,
      actorSteamId,
      reason: "Removed by staff",
      metadata: { revokedAt: revokedAt.toISOString() },
    });
    return {
      recordKey: `portal:${identity.membershipUuid}`,
      membershipUuid: identity.membershipUuid,
      scopeId: identity.scopeId,
      rowVersion,
      steamId: reference.steamId,
      groupId: reference.groupId,
    };
  });
}
