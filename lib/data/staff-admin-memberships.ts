import "server-only";

import {
  type PoolConnection,
  type ResultSetHeader,
  type RowDataPacket,
} from "mysql2/promise";

import {
  isAssignedToConfiguredGameServer,
} from "@/lib/admin/server-scope";
import {
  getGameDatabasePool,
  getPortalDatabasePool,
} from "@/lib/data/database-pools";
import {
  acquireIdentityCatalogueMutationLock,
  releaseIdentityCatalogueMutationLock,
} from "@/lib/data/identity-catalogue-lock";
import {
  reconcileIdentityGroupMembershipRewardsInTransaction,
  reconcileIdentityGroupRewards,
} from "@/lib/data/identity-groups";

const maximumTimestampSeconds = 2_147_483_000;

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
};

type PortalAdminDefinitionRow = RowDataPacket & {
  id: string | number;
  external_key: string;
  enabled: string | number | boolean;
  rank_weight: string | number;
};

type EffectivePortalGroupRow = RowDataPacket & {
  id: string | number;
  external_key: string;
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

function durationMinutes(value: number) {
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
  if (row.revoked_at !== null) return "revoked";
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

async function readPortalAdminRows() {
  const pool = getPortalDatabasePool();
  if (!pool) return [] as PortalAdminMembershipRow[];
  const [rows] = await pool.query<PortalAdminMembershipRow[]>(
    "SELECT membership.group_id, membership.steam_id, membership.starts_at, membership.expires_at, " +
      "membership.revoked_at, membership.updated_at, identity_group.display_name, identity_group.external_key, " +
      "identity_group.enabled AS group_enabled, external_definition.rank_weight " +
      "FROM portal_identity_group_memberships AS membership " +
      "INNER JOIN portal_identity_groups AS identity_group ON identity_group.id = membership.group_id " +
      "LEFT JOIN portal_identity_external_group_definitions AS external_definition " +
      "ON external_definition.group_id = identity_group.id " +
      "AND external_definition.source_type COLLATE utf8mb4_unicode_ci = 'admins_core' " +
      "AND external_definition.external_key COLLATE utf8mb4_unicode_ci = identity_group.external_key COLLATE utf8mb4_unicode_ci " +
      "WHERE identity_group.source_type = 'admins_core' " +
      "ORDER BY membership.steam_id, membership.group_id",
  );
  return rows;
}

export async function getStaffAdminMembershipSnapshot(): Promise<
  StaffAdminMembershipSnapshot
> {
  const [nativeRows, portalRows] = await Promise.all([
    readNativeAdminRows(),
    readPortalAdminRows(),
  ]);
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
    return {
      recordKey: `portal:${steamId}:${groupId}`,
      source: "portal",
      steamId,
      name: nativeNames.get(steamId) ?? `Steam ${steamId}`,
      group: String(row.external_key ?? row.display_name),
      groupId,
      adminId: null,
      storedGroup: null,
      serverGuids: [],
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

async function withPortalTransaction<T>(
  targetSteamId: string,
  work: (connection: PoolConnection) => Promise<T>,
) {
  const pool = getPortalDatabasePool();
  if (!pool) {
    adminMembershipError(
      "admin-portal-storage",
      "The portal identity database is not configured.",
    );
  }
  const connection = await pool.getConnection();
  let catalogueLockAcquired = false;
  try {
    catalogueLockAcquired =
      await acquireIdentityCatalogueMutationLock(connection);
    if (!catalogueLockAcquired) {
      adminMembershipError(
        "admin-portal-storage",
        "The connected-group catalogue is busy. Retry this action shortly.",
      );
    }
    await connection.beginTransaction();
    await connection.execute(
      "INSERT INTO portal_token_accounts (steam_id) VALUES (?) " +
        "ON DUPLICATE KEY UPDATE steam_id = VALUES(steam_id)",
      [targetSteamId],
    );
    await connection.query(
      "SELECT steam_id FROM portal_token_accounts WHERE steam_id = ? FOR UPDATE",
      [targetSteamId],
    );
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
    let connectionDiscarded = false;
    if (catalogueLockAcquired) {
      try {
        await releaseIdentityCatalogueMutationLock(connection);
      } catch {
        connection.destroy();
        connectionDiscarded = true;
      }
    }
    if (!connectionDiscarded) connection.release();
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

async function lockPortalAdminContext(
  connection: PoolConnection,
  steamId: string,
) {
  const [definitions] = await connection.query<PortalAdminDefinitionRow[]>(
    "SELECT identity_group.id, identity_group.external_key, identity_group.enabled, " +
      "external_definition.rank_weight " +
      "FROM portal_identity_groups AS identity_group " +
      "INNER JOIN portal_identity_external_group_definitions AS external_definition " +
      "ON external_definition.group_id = identity_group.id " +
      "AND external_definition.source_type COLLATE utf8mb4_unicode_ci = 'admins_core' " +
      "AND external_definition.external_key COLLATE utf8mb4_unicode_ci = identity_group.external_key COLLATE utf8mb4_unicode_ci " +
      "WHERE identity_group.source_type = 'admins_core' " +
      "ORDER BY identity_group.id FOR UPDATE",
  );
  const [memberships] = await connection.query<PortalAdminMembershipRow[]>(
    "SELECT membership.group_id, membership.steam_id, membership.starts_at, membership.expires_at, " +
      "membership.revoked_at, membership.updated_at, identity_group.display_name, identity_group.external_key, " +
      "identity_group.enabled AS group_enabled, external_definition.rank_weight " +
      "FROM portal_identity_group_memberships AS membership " +
      "INNER JOIN portal_identity_groups AS identity_group ON identity_group.id = membership.group_id " +
      "LEFT JOIN portal_identity_external_group_definitions AS external_definition " +
      "ON external_definition.group_id = identity_group.id " +
      "AND external_definition.source_type COLLATE utf8mb4_unicode_ci = 'admins_core' " +
      "AND external_definition.external_key COLLATE utf8mb4_unicode_ci = identity_group.external_key COLLATE utf8mb4_unicode_ci " +
      "WHERE membership.steam_id = ? AND identity_group.source_type = 'admins_core' " +
      "ORDER BY membership.group_id FOR UPDATE",
    [steamId],
  );
  return { definitions, memberships };
}

function requireEnabledDefinition(
  definitions: PortalAdminDefinitionRow[],
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

function requireMutablePortalMembership(
  memberships: PortalAdminMembershipRow[],
  groupId: number,
) {
  const membership = memberships.find((row) => Number(row.group_id) === groupId);
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
  portalDefinition: Pick<PortalAdminDefinitionRow, "external_key">,
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
  context: Awaited<ReturnType<typeof lockPortalAdminContext>>,
  runtimeDefinitions: RuntimeAdminGroupRow[],
  actorImmunity: number,
) {
  const definitionsById = new Map(
    context.definitions.map((definition) => [Number(definition.id), definition]),
  );
  for (const membership of context.memberships) {
    if (portalStatus(membership) !== "active") continue;
    if (isFounderGroup(membership.external_key)) {
      adminMembershipError(
        "admin-membership-founder",
        "A portal Founder membership cannot be managed through staff actions.",
      );
    }
    if (!asBoolean(membership.group_enabled)) continue;
    const definition = definitionsById.get(Number(membership.group_id));
    if (!definition || !asBoolean(definition.enabled)) continue;
    const liveDefinition = requireLiveRuntimeDefinition(
      definition,
      runtimeDefinitions,
    );
    requireRankWithinActor(liveDefinition.immunity, actorImmunity);
  }
}

async function reconcilePortalAdminRewards(
  connection: PoolConnection,
  input: {
    steamId: string;
    nativeGroupNames: string[];
    definitions: PortalAdminDefinitionRow[];
    actorSteamId: string;
  },
) {
  const [portalGroups] = await connection.query<EffectivePortalGroupRow[]>(
    "SELECT identity_group.id, identity_group.external_key " +
      "FROM portal_identity_group_memberships AS membership " +
      "INNER JOIN portal_identity_groups AS identity_group " +
      "ON identity_group.id = membership.group_id AND identity_group.enabled = TRUE " +
      "INNER JOIN portal_identity_external_group_definitions AS external_definition " +
      "ON external_definition.group_id = identity_group.id " +
      "AND external_definition.source_type COLLATE utf8mb4_unicode_ci = 'admins_core' " +
      "AND external_definition.external_key COLLATE utf8mb4_unicode_ci = identity_group.external_key COLLATE utf8mb4_unicode_ci " +
      "WHERE membership.steam_id = ? AND identity_group.source_type = 'admins_core' " +
      "AND membership.revoked_at IS NULL AND membership.starts_at <= CURRENT_TIMESTAMP " +
      "AND (membership.expires_at IS NULL OR membership.expires_at > CURRENT_TIMESTAMP) " +
      "ORDER BY identity_group.id FOR UPDATE",
    [input.steamId],
  );
  const effectiveIds = new Set(
    portalGroups
      .filter((group) => !isFounderGroup(group.external_key))
      .map((group) => Number(group.id)),
  );
  const definitionsByName = new Map<string, PortalAdminDefinitionRow>();
  for (const definition of input.definitions) {
    if (!asBoolean(definition.enabled)) continue;
    const key = groupIdentity(definition.external_key);
    if (!definitionsByName.has(key)) definitionsByName.set(key, definition);
  }
  for (const nativeGroupName of input.nativeGroupNames) {
    const definition = definitionsByName.get(groupIdentity(nativeGroupName));
    if (definition) effectiveIds.add(Number(definition.id));
  }
  return reconcileIdentityGroupMembershipRewardsInTransaction(connection, {
    steamId: input.steamId,
    effectiveGroupIds: [...effectiveIds],
    authoritativeSources: ["admins_core"],
    actorSteamId: input.actorSteamId,
  });
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
  const minutes = durationMinutes(input.durationMinutes);
  const actorImmunity = requireActorImmunity(input.actorImmunity);
  const reason = optionalReason(input.reason);
  return withPortalTransaction(steamId, async (connection) =>
    withGameTransaction(async (gameConnection) => {
      const nativeContext = await lockScopedNativeAdminContext(gameConnection, steamId);
      if (nativeContext.immunity > actorImmunity) {
        adminMembershipError(
          "admin-membership-immunity",
          "The target administrator has greater immunity than the acting administrator.",
        );
      }
      const context = await lockPortalAdminContext(connection, steamId);
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
      const existing = context.memberships.find(
        (membership) => Number(membership.group_id) === groupId,
      );
      if (
        existing &&
        existing.revoked_at === null &&
        portalStatus(existing) !== "expired"
      ) {
        adminMembershipError(
          "admin-membership-conflict",
          "That portal Admin membership already exists; extend it instead.",
        );
      }
      const expiresAt = new Date(Date.now() + minutes * 60_000);
      if (expiresAt.getTime() > maximumTimestampSeconds * 1_000) {
        adminMembershipError(
          "admin-membership-invalid",
          "The Admin membership expiry exceeds the supported date.",
        );
      }
      await connection.execute(
        "INSERT INTO portal_identity_group_memberships " +
          "(group_id, steam_id, starts_at, expires_at, granted_by_steam_id, grant_reason, revoked_at, revoked_by_steam_id) " +
          "VALUES (?, ?, CURRENT_TIMESTAMP, ?, ?, ?, NULL, NULL) " +
          "ON DUPLICATE KEY UPDATE starts_at = CURRENT_TIMESTAMP, expires_at = VALUES(expires_at), " +
          "granted_by_steam_id = VALUES(granted_by_steam_id), grant_reason = VALUES(grant_reason), " +
          "revoked_at = NULL, revoked_by_steam_id = NULL",
        [groupId, steamId, expiresAt, actorSteamId, reason],
      );
      await reconcilePortalAdminRewards(connection, {
        steamId,
        nativeGroupNames: nativeContext.groupNames,
        definitions: context.definitions,
        actorSteamId,
      });
      return {
        recordKey: `portal:${steamId}:${groupId}`,
        groupId,
        steamId,
        expiresAt: expiresAt.toISOString(),
      };
    }),
  );
}

export async function extendStaffAdminMembership(input: {
  reference: StaffAdminPortalMembershipReference;
  extensionMinutes: number;
  actorSteamId: string;
  actorImmunity: number;
  expectedExpiresAt?: string | null;
}) {
  const steamId = requireSteamId(input.reference.steamId);
  const actorSteamId = requireSteamId(input.actorSteamId);
  const groupId = requirePositiveId(
    input.reference.groupId,
    "The portal Admin group ID",
  );
  const addedMinutes = durationMinutes(input.extensionMinutes);
  const actorImmunity = requireActorImmunity(input.actorImmunity);
  return withPortalTransaction(steamId, async (connection) =>
    withGameTransaction(async (gameConnection) => {
    const nativeContext = await lockScopedNativeAdminContext(gameConnection, steamId);
    if (nativeContext.immunity > actorImmunity) {
      adminMembershipError(
        "admin-membership-immunity",
        "The target administrator has greater immunity than the acting administrator.",
      );
    }
    const context = await lockPortalAdminContext(connection, steamId);
    requirePortalTargetWithinActor(
      context,
      nativeContext.definitions,
      actorImmunity,
    );
    const membership = requireMutablePortalMembership(
      context.memberships,
      groupId,
    );
    if (membership.revoked_at !== null) {
      adminMembershipError(
        "admin-membership-not-found",
        "That portal Admin membership has been revoked.",
      );
    }
    const definition = requireEnabledDefinition(context.definitions, groupId);
    const liveDefinition = requireLiveRuntimeDefinition(
      definition,
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
    const [updated] = await connection.execute<ResultSetHeader>(
      "UPDATE portal_identity_group_memberships " +
        // Extending a future assignment must not activate it early. Keep its
        // scheduled start intact and move only the entitlement's end date.
        "SET expires_at = ?, " +
        "granted_by_steam_id = ? " +
        "WHERE group_id = ? AND steam_id = ? AND revoked_at IS NULL " +
        "AND ABS(TIMESTAMPDIFF(SECOND, expires_at, ?)) <= 1",
      [expiresAt, actorSteamId, groupId, steamId, expectedExpiry],
    );
    if (updated.affectedRows !== 1) {
      adminMembershipError(
        "admin-membership-stale",
        "That portal Admin membership changed before it could be extended.",
      );
    }
    await reconcilePortalAdminRewards(connection, {
      steamId,
      nativeGroupNames: nativeContext.groupNames,
      definitions: context.definitions,
      actorSteamId,
    });
    return {
      recordKey: `portal:${steamId}:${groupId}`,
      groupId,
      steamId,
      expiresAt: expiresAt.toISOString(),
    };
    }),
  );
}

function requireNativeReference(reference: StaffAdminNativeMembershipReference) {
  return {
    steamId: requireSteamId(reference.steamId),
    adminId: requirePositiveId(reference.adminId, "The native Admin row ID"),
    storedGroup: exactStoredGroup(reference.storedGroup),
  };
}

function requirePortalReference(reference: StaffAdminPortalMembershipReference) {
  return {
    steamId: requireSteamId(reference.steamId),
    groupId: requirePositiveId(
      reference.groupId,
      "The portal Admin group ID",
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
  const result = await withPortalTransaction(
    reference.steamId,
    async (portalConnection) =>
    withGameTransaction(async (connection) => {
    const nativeContext = await lockScopedNativeAdminContext(
      connection,
      reference.steamId,
    );
    const portalContext = await lockPortalAdminContext(
      portalConnection,
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
    }),
  );
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
  return withPortalTransaction(reference.steamId, async (connection) =>
    withGameTransaction(async (gameConnection) => {
    const nativeContext = await lockScopedNativeAdminContext(
      gameConnection,
      reference.steamId,
    );
    if (nativeContext.immunity > actorImmunity) {
      adminMembershipError(
        "admin-membership-immunity",
        "The target administrator has greater immunity than the acting administrator.",
      );
    }
    const context = await lockPortalAdminContext(connection, reference.steamId);
    requirePortalTargetWithinActor(
      context,
      nativeContext.definitions,
      actorImmunity,
    );
    const membership = requireMutablePortalMembership(
      context.memberships,
      reference.groupId,
    );
    if (membership.revoked_at !== null) {
      adminMembershipError(
        "admin-membership-not-found",
        "That portal Admin membership has already been revoked.",
      );
    }
    const definition = context.definitions.find(
      (row) => Number(row.id) === reference.groupId,
    );
    if (definition && asBoolean(definition.enabled)) {
      const liveDefinition = requireLiveRuntimeDefinition(
        definition,
        nativeContext.definitions,
      );
      requireRankWithinActor(liveDefinition.immunity, actorImmunity);
    }
    const [updated] = await connection.execute<ResultSetHeader>(
      "UPDATE portal_identity_group_memberships SET revoked_at = CURRENT_TIMESTAMP, " +
        "revoked_by_steam_id = ? WHERE group_id = ? AND steam_id = ? AND revoked_at IS NULL",
      [actorSteamId, reference.groupId, reference.steamId],
    );
    if (updated.affectedRows !== 1) {
      adminMembershipError(
        "admin-membership-stale",
        "That portal Admin membership changed before it could be removed.",
      );
    }
    await reconcilePortalAdminRewards(connection, {
      steamId: reference.steamId,
      nativeGroupNames: nativeContext.groupNames,
      definitions: context.definitions,
      actorSteamId,
    });
    return {
      recordKey: `portal:${reference.steamId}:${reference.groupId}`,
      steamId: reference.steamId,
      groupId: reference.groupId,
    };
    }),
  );
}
