import "server-only";

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
  acquireIdentityCatalogueMutationLock,
  releaseIdentityCatalogueMutationLock,
} from "@/lib/data/identity-catalogue-lock";
import {
  reconcileIdentityGroupMembershipRewardsInTransaction,
  reconcileIdentityGroupRewards,
} from "@/lib/data/identity-groups";

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
};

export type StaffVipMembershipReference =
  | StaffVipNativeMembershipReference
  | StaffVipPortalMembershipReference;

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
  group_id: string | number;
  steam_id: string;
  starts_at: Date | string;
  expires_at: Date | string | null;
  revoked_at: Date | string | null;
  updated_at: Date | string;
  display_name: string;
  external_key: string | null;
  rank_weight: string | number | null;
  group_enabled: string | number | boolean;
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
  const configuredServerId = configuredVipServerId();
  if (configuredServerId !== 0 && reference.serverId !== configuredServerId) {
    membershipError(
      "vip-membership-invalid",
      "That native VIP row belongs to another server scope and is read-only here.",
    );
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

function requirePortalReference(
  reference: StaffVipPortalMembershipReference,
) {
  const steamId = requireSteamId(reference.steamId);
  if (!Number.isSafeInteger(reference.groupId) || reference.groupId < 1) {
    membershipError("vip-membership-invalid", "The portal VIP group ID is invalid.");
  }
  return { steamId, groupId: reference.groupId };
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
  if (row.revoked_at !== null) return "revoked";
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

async function readPortalRows() {
  const pool = getPortalDatabasePool();
  if (!pool) return [] as PortalVipRow[];
  const [rows] = await pool.query<PortalVipRow[]>(
    "SELECT membership.group_id, membership.steam_id, membership.starts_at, membership.expires_at, " +
      "membership.revoked_at, membership.updated_at, identity_group.display_name, identity_group.external_key, " +
      "identity_group.enabled AS group_enabled, external_definition.rank_weight " +
      "FROM portal_identity_group_memberships AS membership " +
      "INNER JOIN portal_identity_groups AS identity_group ON identity_group.id = membership.group_id " +
      "LEFT JOIN portal_identity_external_group_definitions AS external_definition " +
      "ON external_definition.group_id = identity_group.id " +
      "AND external_definition.source_type COLLATE utf8mb4_unicode_ci = identity_group.source_type COLLATE utf8mb4_unicode_ci " +
      "AND external_definition.external_key COLLATE utf8mb4_unicode_ci = identity_group.external_key COLLATE utf8mb4_unicode_ci " +
      "WHERE identity_group.source_type = 'vipcore' " +
      "ORDER BY membership.steam_id, membership.group_id",
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
  const pool = getPortalDatabasePool();
  if (!pool) {
    return { rows: [] as VipConversionStateRow[], available: false };
  }
  try {
    const [rows] = await pool.query<VipConversionStateRow[]>(
      "SELECT steam_id, group_id, entitlement_expires_at, native_suppressed_until, " +
        "native_suppressed_permanently FROM portal_vip_membership_conversion_state ORDER BY steam_id",
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
    const status = portalStatus(row, now);
    const definition = definitionsById.get(groupId);
    let consolidationBlockedReason: string | null = null;
    if (status !== "active") {
      consolidationBlockedReason = "Only an active portal VIP membership can be kept.";
    } else if (!definitionIsAvailable(definition)) {
      consolidationBlockedReason =
        "This portal tier is disabled or its VIPCore definition is unavailable.";
    } else if (!conversion.available) {
      consolidationBlockedReason =
        "VIP conversion storage is unavailable; apply migration 022 before keeping a portal tier.";
    }
    return {
      recordKey: `portal:${steamId}:${groupId}`,
      source: "portal",
      steamId,
      name: namesBySteamId.get(steamId) ?? `Steam ${steamId}`,
      group: String(row.external_key ?? row.display_name),
      groupId,
      accountId: null,
      serverId: null,
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
    const activeTiers = new Set(
      activeRecords
        .filter((record) =>
          !(record.source === "native" && record.suppressedByPortal))
        .map((record) => runtimeGroupIdentity(record.group)),
    );
    const hasSuppressedNativeRecovery = activeRecords.some(
      (record) => record.source === "native" && record.suppressedByPortal,
    );
    return {
      steamId,
      name: playerRecords.find((record) => !record.name.startsWith("Steam "))?.name ??
        playerRecords[0]?.name ??
        `Steam ${steamId}`,
      records: playerRecords,
      activeTierCount: activeTiers.size,
      needsConsolidation: activeTiers.size > 1 || hasSuppressedNativeRecovery,
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

async function nativeSuppressionFloor(steamId: string) {
  const now = Math.floor(Date.now() / 1_000);
  const activeRows = (await readSelectedNativeRowsForSteamId(steamId)).filter((row) => {
    const expires = numericExpiry(row.expires);
    return expires === 0 || expires > now;
  });
  return {
    permanent: activeRows.some((row) => numericExpiry(row.expires) === 0),
    untilMs: activeRows.reduce((latest, row) => {
      const expires = numericExpiry(row.expires);
      return expires === 0 ? latest : Math.max(latest, expires * 1_000);
    }, 0),
    rows: activeRows,
  };
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

async function lockRuntimeVipDefinitions(connection: PoolConnection) {
  const [rows] = await connection.query<RuntimeVipGroupDefinitionRow[]>(
    "SELECT server_id, name, enabled FROM vip_group_definitions " +
      "WHERE server_id = ? ORDER BY name FOR UPDATE",
    [configuredVipServerId()],
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

async function lockVipMutationSteamAccount(
  connection: PoolConnection,
  steamId: string,
) {
  // Paid VIP activation takes this portal_token_accounts row first (through
  // portal-repository lockTokenAccounts), before VIP groups, memberships, the
  // conversion ledger, or native VIP reads. Staff mutations use the identical
  // per-SteamID mutex and order, and hold it across their game-DB work.
  await connection.execute(
    "INSERT INTO portal_steam_accounts (steam_id) VALUES (?) " +
      "ON DUPLICATE KEY UPDATE updated_at = CURRENT_TIMESTAMP",
    [steamId],
  );
  await connection.execute(
    "INSERT INTO portal_token_accounts (steam_id) VALUES (?) " +
      "ON DUPLICATE KEY UPDATE steam_id = VALUES(steam_id)",
    [steamId],
  );
  const [rows] = await connection.query<RowDataPacket[]>(
    "SELECT steam_id FROM portal_token_accounts WHERE steam_id = ? ORDER BY steam_id FOR UPDATE",
    [steamId],
  );
  if (rows.length !== 1) {
    membershipError(
      "vip-portal-storage",
      "The portal could not acquire the player's VIP serialization lock.",
    );
  }
}

async function withPortalTransaction<T>(
  steamIdInput: string,
  work: (connection: PoolConnection) => Promise<T>,
) {
  const steamId = requireSteamId(steamIdInput);
  const pool = getPortalDatabasePool();
  if (!pool) {
    membershipError("vip-portal-storage", "The portal VIP database is not configured.");
  }
  const connection = await pool.getConnection();
  let catalogueLockAcquired = false;
  try {
    catalogueLockAcquired =
      await acquireIdentityCatalogueMutationLock(connection);
    if (!catalogueLockAcquired) {
      membershipError(
        "vip-portal-storage",
        "The connected-group catalogue is busy. Retry this action shortly.",
      );
    }
    await connection.beginTransaction();
    await lockVipMutationSteamAccount(connection, steamId);
    const result = await work(connection);
    await connection.commit();
    return result;
  } catch (error) {
    await connection.rollback();
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

async function lockPortalVipContext(
  connection: PoolConnection,
  steamId: string,
  options: { allowMissingConversionState?: boolean } = {},
) {
  const [definitions] = await connection.query<VipGroupDefinitionRow[]>(
    "SELECT identity_group.id, identity_group.external_key, identity_group.enabled, " +
      "external_definition.group_id AS external_definition_group_id, " +
      "external_definition.definition AS external_definition " +
      "FROM portal_identity_groups AS identity_group " +
      "LEFT JOIN portal_identity_external_group_definitions AS external_definition " +
      "ON external_definition.group_id = identity_group.id " +
      "AND external_definition.source_type COLLATE utf8mb4_unicode_ci = identity_group.source_type COLLATE utf8mb4_unicode_ci " +
      "AND external_definition.external_key COLLATE utf8mb4_unicode_ci = identity_group.external_key COLLATE utf8mb4_unicode_ci " +
      "WHERE identity_group.source_type = 'vipcore' ORDER BY identity_group.id FOR UPDATE",
  );
  const [memberships] = await connection.query<PortalVipRow[]>(
    "SELECT membership.group_id, membership.steam_id, membership.starts_at, membership.expires_at, " +
      "membership.revoked_at, membership.updated_at, identity_group.display_name, identity_group.external_key, " +
      "identity_group.enabled AS group_enabled, external_definition.rank_weight " +
      "FROM portal_identity_group_memberships AS membership " +
      "INNER JOIN portal_identity_groups AS identity_group ON identity_group.id = membership.group_id " +
      "LEFT JOIN portal_identity_external_group_definitions AS external_definition " +
      "ON external_definition.group_id = identity_group.id " +
      "AND external_definition.source_type COLLATE utf8mb4_unicode_ci = identity_group.source_type COLLATE utf8mb4_unicode_ci " +
      "AND external_definition.external_key COLLATE utf8mb4_unicode_ci = identity_group.external_key COLLATE utf8mb4_unicode_ci " +
      "WHERE membership.steam_id = ? AND identity_group.source_type = 'vipcore' " +
      "ORDER BY membership.group_id FOR UPDATE",
    [steamId],
  );
  let state: VipConversionStateRow | undefined;
  try {
    const [states] = await connection.query<VipConversionStateRow[]>(
      "SELECT steam_id, group_id, entitlement_expires_at, native_suppressed_until, " +
        "native_suppressed_permanently FROM portal_vip_membership_conversion_state " +
        "WHERE steam_id = ? LIMIT 1 FOR UPDATE",
      [steamId],
    );
    state = states[0];
  } catch (error) {
    if (isMissingConversionStorage(error)) {
      if (options.allowMissingConversionState) {
        return { definitions, memberships, state: undefined };
      }
      membershipError(
        "vip-conversion-storage",
        "VIP conversion storage is unavailable. Apply migration 022 first.",
      );
    }
    throw error;
  }
  return { definitions, memberships, state };
}

function activePortalRows(rows: PortalVipRow[], now = new Date()) {
  return rows.filter((row) => portalStatus(row, now) === "active");
}

function conversionStateIsActive(
  state: VipConversionStateRow | undefined,
  now = new Date(),
) {
  if (!state) return false;
  const expiry = asDate(state.entitlement_expires_at);
  return expiry === null || expiry.getTime() > now.getTime();
}

function assertActiveConversionStateMatchesPortalMembership(
  state: VipConversionStateRow | undefined,
  memberships: PortalVipRow[],
  now = new Date(),
) {
  if (!conversionStateIsActive(state, now)) return;

  const stateGroupId = Number(state!.group_id);
  const membership = memberships.find((row) =>
    Number(row.group_id) === stateGroupId && portalStatus(row, now) === "active");
  if (!membership) {
    membershipError(
      "vip-membership-stale",
      "The active VIP conversion ledger has no matching active portal membership. Reconcile the account before extending or consolidating it.",
    );
  }

  // Entitlement permanence is represented by entitlement_expires_at itself.
  // native_suppressed_permanently only preserves an underlying native row and
  // must not turn a timed portal entitlement into a permanent one here.
  const ledgerExpiry = asDate(state!.entitlement_expires_at);
  const membershipExpiry = asDate(membership.expires_at);
  const permanenceMatches = (ledgerExpiry === null) === (membershipExpiry === null);
  const expiryMatches = ledgerExpiry === null || membershipExpiry === null
    ? permanenceMatches
    : Math.abs(ledgerExpiry.getTime() - membershipExpiry.getTime()) <= 1_000;
  if (!expiryMatches) {
    membershipError(
      "vip-membership-stale",
      "The active VIP conversion ledger expiry does not match its portal membership. Reconcile the account before extending or consolidating it.",
    );
  }
}

async function upsertPortalConversionState(
  connection: PoolConnection,
  input: {
    steamId: string;
    groupId: number;
    expiresAt: Date | null;
    state: VipConversionStateRow | undefined;
    nativeFloor: Awaited<ReturnType<typeof nativeSuppressionFloor>>;
  },
) {
  const existingPermanent = asBoolean(input.state?.native_suppressed_permanently);
  if (input.expiresAt && (existingPermanent || input.nativeFloor.permanent)) {
    membershipError(
      "vip-membership-permanent",
      "A permanent preserved VIP cannot be replaced by a timed portal membership.",
    );
  }
  const permanent = input.expiresAt === null || existingPermanent || input.nativeFloor.permanent;
  const existingUntil = asDate(input.state?.native_suppressed_until)?.getTime() ?? 0;
  const suppressedUntilMs = Math.max(
    Date.now(),
    input.expiresAt?.getTime() ?? 0,
    existingUntil,
    input.nativeFloor.untilMs,
  );
  if (!permanent && suppressedUntilMs > maximumTimestampSeconds * 1_000) {
    membershipError(
      "vip-membership-invalid",
      "The VIP suppression period exceeds the supported expiry date.",
    );
  }
  await connection.execute(
    "INSERT INTO portal_vip_membership_conversion_state " +
      "(steam_id, group_id, entitlement_expires_at, native_suppressed_until, native_suppressed_permanently) " +
      "VALUES (?, ?, ?, ?, ?) ON DUPLICATE KEY UPDATE group_id = VALUES(group_id), " +
      "entitlement_expires_at = VALUES(entitlement_expires_at), " +
      "native_suppressed_until = VALUES(native_suppressed_until), " +
      "native_suppressed_permanently = VALUES(native_suppressed_permanently)",
    [
      input.steamId,
      input.groupId,
      input.expiresAt,
      permanent ? null : new Date(suppressedUntilMs),
      permanent,
    ],
  );
}

async function reconcilePortalVipRewards(
  connection: PoolConnection,
  steamId: string,
  effectiveGroupIds: number[],
  actorSteamId: string,
) {
  return reconcileIdentityGroupMembershipRewardsInTransaction(connection, {
    steamId,
    effectiveGroupIds,
    authoritativeSources: ["vipcore"],
    actorSteamId,
  });
}

async function assertNoActivePortalVipConversionStateInTransaction(
  connection: PoolConnection,
  steamId: string,
) {
  const [rows] = await connection.query<RowDataPacket[]>(
    "SELECT membership.steam_id FROM portal_identity_group_memberships AS membership " +
      "INNER JOIN portal_identity_groups AS identity_group ON identity_group.id = membership.group_id " +
      "WHERE membership.steam_id = ? AND identity_group.source_type = 'vipcore' " +
      "AND membership.revoked_at IS NULL AND membership.starts_at <= CURRENT_TIMESTAMP " +
      "AND (membership.expires_at IS NULL OR membership.expires_at > CURRENT_TIMESTAMP) " +
      "LIMIT 1",
    [steamId],
  );
  if (rows.length) {
    membershipError(
      "vip-membership-conflict",
      "This player has an active portal VIP. Manage that membership instead of creating a latent native row.",
    );
  }
  // Heal an inactive ledger left by an earlier cross-database commit failure
  // before deciding whether a new native mutation is blocked.
  await reconcileInactiveNativeSuppression(connection, steamId);
  try {
    const [suppressionRows] = await connection.query<RowDataPacket[]>(
      "SELECT steam_id FROM portal_vip_membership_conversion_state WHERE steam_id = ? " +
        "AND (native_suppressed_permanently = TRUE OR native_suppressed_until > CURRENT_TIMESTAMP) LIMIT 1",
      [steamId],
    );
    if (suppressionRows.length) {
      membershipError(
        "vip-membership-conflict",
        "This player's preserved native VIP rows are controlled by a portal conversion. Consolidate the account before changing native access.",
      );
    }
  } catch (error) {
    if (isMissingConversionStorage(error)) {
      membershipError(
        "vip-conversion-storage",
        "VIP conversion storage is unavailable. Apply migration 022 before changing native VIP access.",
      );
    }
    throw error;
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
  return withPortalTransaction(steamId, async (connection) => {
    await assertNoActivePortalVipConversionStateInTransaction(connection, steamId);
    return mutation();
  });
}

async function reconcileInactiveNativeSuppression(
  connection: PoolConnection,
  steamId: string,
) {
  let state: VipConversionStateRow | undefined;
  try {
    const [states] = await connection.query<VipConversionStateRow[]>(
      "SELECT steam_id, group_id, entitlement_expires_at, native_suppressed_until, " +
        "native_suppressed_permanently FROM portal_vip_membership_conversion_state " +
        "WHERE steam_id = ? LIMIT 1 FOR UPDATE",
      [steamId],
    );
    state = states[0];
  } catch (error) {
    // Native cleanup remains available before migration 022. Without the
    // conversion table there is no suppression ledger to reconcile.
    if (isMissingConversionStorage(error)) return;
    throw error;
  }
  if (!state || conversionStateIsActive(state)) return;

  // A portal entitlement that has ended may deliberately keep legacy native
  // rows suppressed until staff finishes resolving them. Once one exact row
  // is removed, reduce that floor to the rows that still exist; after the last
  // row, remove the otherwise-orphaned ledger so future native grants are not
  // blocked forever.
  const nativeFloor = await nativeSuppressionFloor(steamId);
  if (!nativeFloor.rows.length) {
    await connection.execute(
      "DELETE FROM portal_vip_membership_conversion_state WHERE steam_id = ?",
      [steamId],
    );
    return;
  }
  await connection.execute(
    "UPDATE portal_vip_membership_conversion_state " +
      "SET native_suppressed_until = ?, native_suppressed_permanently = ? " +
      "WHERE steam_id = ?",
    [
      nativeFloor.permanent ? null : new Date(nativeFloor.untilMs),
      nativeFloor.permanent,
      steamId,
    ],
  );
}

export async function withSerializedNativeVipRemoval<T>(
  steamIdInput: string,
  removal: () => Promise<T>,
) {
  const steamId = requireSteamId(steamIdInput);
  // Removal is cleanup: acquire the shared token-first mutex so paid
  // activation cannot read a half-finished native state, but intentionally do
  // not reject an active portal membership or suppression ledger.
  return withPortalTransaction(steamId, async (connection) => {
    const result = await removal();
    await reconcileInactiveNativeSuppression(connection, steamId);
    return result;
  });
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
        const definitions = await lockRuntimeVipDefinitions(connection);
        requireLiveEnabledVipDefinition(definitions, reference.storedGroup);
        const configuredServerId = configuredVipServerId();
        const shortId = shortAccountId(reference.steamId);
        const [candidateRows] = await connection.query<NativeVipRow[]>(
          "SELECT account_id, name, lastvisit, sid, `group`, expires FROM vip_users " +
            "WHERE account_id IN (?, ?) " +
            (configuredServerId === 0 ? "" : "AND sid = ? ") +
            "ORDER BY account_id, sid, `group`, expires DESC FOR UPDATE",
          configuredServerId === 0
            ? [reference.steamId, shortId]
            : [reference.steamId, shortId, configuredServerId],
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
  return withPortalTransaction(reference.steamId, async (connection) => {
    const context = await lockPortalVipContext(connection, reference.steamId);
    assertActiveConversionStateMatchesPortalMembership(
      context.state,
      context.memberships,
    );
    const nativeFloor = await nativeSuppressionFloor(reference.steamId);
    if (!conversionStateIsActive(context.state) && nativeFloor.rows.length) {
      membershipError(
        "vip-membership-conflict",
        "This legacy portal VIP overlaps active native access. Consolidate the account before extending it so native time is not silently discarded.",
      );
    }
    const target = context.memberships.find(
      (row) => Number(row.group_id) === reference.groupId,
    );
    if (!target || target.revoked_at !== null) {
      membershipError("vip-membership-not-found", "That portal VIP membership no longer exists.");
    }
    const startsAt = asDate(target.starts_at)!;
    if (startsAt.getTime() > Date.now()) {
      membershipError("vip-membership-invalid", "A scheduled VIP membership cannot be extended yet.");
    }
    if (target.expires_at === null) {
      membershipError("vip-membership-permanent", "Permanent VIP access cannot be extended.");
    }
    const targetDefinition = context.definitions.find(
      (definition) =>
        Number(definition.id) === reference.groupId && definitionIsAvailable(definition),
    );
    if (!targetDefinition) {
      membershipError(
        "vip-membership-stale",
        "The selected portal VIP tier is not an enabled connected group.",
      );
    }
    await requireFreshLiveVipDefinition(targetDefinition.external_key);
    const currentExpiry = asDate(target.expires_at)!;
    const expectedExpiry = asDate(input.expectedExpiresAt);
    if (
      expectedExpiry === null ||
      Math.abs(expectedExpiry.getTime() - currentExpiry.getTime()) > 1_000
    ) {
      membershipError(
        "vip-membership-stale",
        "That portal VIP expiry changed before it could be extended. Refresh before retrying.",
      );
    }
    const expiresAt = new Date(
      Math.max(Date.now(), currentExpiry.getTime()) + addedSeconds * 1_000,
    );
    if (expiresAt.getTime() > maximumTimestampSeconds * 1_000) {
      membershipError("vip-membership-invalid", "The VIP extension exceeds the supported expiry date.");
    }
    const otherActiveGroups = new Set(
      activePortalRows(context.memberships)
        .filter((row) => Number(row.group_id) !== reference.groupId)
        .map((row) => Number(row.group_id)),
    );
    if (otherActiveGroups.size) {
      membershipError(
        "vip-membership-conflict",
        "Consolidate the player's overlapping portal VIP tiers before extending one.",
      );
    }
    if (
      conversionStateIsActive(context.state) &&
      Number(context.state!.group_id) !== reference.groupId
    ) {
      membershipError(
        "vip-membership-conflict",
        "The VIP conversion ledger targets another tier. Consolidate the account first.",
      );
    }
    const [updated] = await connection.execute<ResultSetHeader>(
      "UPDATE portal_identity_group_memberships SET expires_at = ? " +
        "WHERE group_id = ? AND steam_id = ? AND revoked_at IS NULL " +
        "AND ABS(TIMESTAMPDIFF(SECOND, expires_at, ?)) <= 1",
      [
        expiresAt,
        reference.groupId,
        reference.steamId,
        expectedExpiry,
      ],
    );
    if (updated.affectedRows !== 1) {
      membershipError(
        "vip-membership-stale",
        "That portal VIP membership changed before it could be extended.",
      );
    }
    await upsertPortalConversionState(connection, {
      steamId: reference.steamId,
      groupId: reference.groupId,
      expiresAt,
      state: context.state,
      nativeFloor,
    });
    await reconcilePortalVipRewards(
      connection,
      reference.steamId,
      [reference.groupId],
      actorSteamId,
    );
    return {
      recordKey: `portal:${reference.steamId}:${reference.groupId}`,
      expiresAt: expiresAt.toISOString(),
    };
  });
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
  return withPortalTransaction(reference.steamId, async (connection) => {
    const context = await lockPortalVipContext(connection, reference.steamId);
    const nativeFloor = await nativeSuppressionFloor(reference.steamId);
    const target = context.memberships.find(
      (row) => Number(row.group_id) === reference.groupId,
    );
    if (!target || target.revoked_at !== null) {
      membershipError("vip-membership-not-found", "That portal VIP membership no longer exists.");
    }
    const remainingActive = activePortalRows(context.memberships).filter(
      (row) => Number(row.group_id) !== reference.groupId,
    );
    if (
      conversionStateIsActive(context.state) &&
      Number(context.state!.group_id) === reference.groupId &&
      remainingActive.length
    ) {
      membershipError(
        "vip-membership-conflict",
        "Choose the surviving tier with the consolidate action before removing the authoritative portal VIP.",
      );
    }
    const [updated] = await connection.execute<ResultSetHeader>(
      "UPDATE portal_identity_group_memberships SET revoked_at = CURRENT_TIMESTAMP, " +
        "revoked_by_steam_id = ? WHERE group_id = ? AND steam_id = ? AND revoked_at IS NULL",
      [actorSteamId, reference.groupId, reference.steamId],
    );
    if (updated.affectedRows !== 1) {
      membershipError("vip-membership-stale", "That portal VIP membership changed before it could be removed.");
    }
    if (context.state && Number(context.state.group_id) === reference.groupId) {
      if (nativeFloor.rows.length) {
        await connection.execute(
          "UPDATE portal_vip_membership_conversion_state SET entitlement_expires_at = CURRENT_TIMESTAMP, " +
            "native_suppressed_until = ?, native_suppressed_permanently = ? " +
            "WHERE steam_id = ?",
          [
            nativeFloor.permanent ? null : new Date(nativeFloor.untilMs),
            nativeFloor.permanent,
            reference.steamId,
          ],
        );
      } else {
        await connection.execute(
          "DELETE FROM portal_vip_membership_conversion_state WHERE steam_id = ?",
          [reference.steamId],
        );
      }
    }
    const remainingGroupIds = [...new Set(
      remainingActive
        .filter((row) => asBoolean(row.group_enabled))
        .map((row) => Number(row.group_id)),
    )];
    await reconcilePortalVipRewards(
      connection,
      reference.steamId,
      remainingGroupIds.length === 1 ? remainingGroupIds : [],
      actorSteamId,
    );
    return { recordKey: `portal:${reference.steamId}:${reference.groupId}` };
  });
}

export async function consolidateStaffVipMemberships(input: {
  target: StaffVipMembershipReference;
  actorSteamId: string;
}) {
  const actorSteamId = requireSteamId(input.actorSteamId);
  if (input.target.source === "native") {
    const target = requireNativeReference(input.target);
    return withPortalTransaction(target.steamId, async (connection) => {
      const context = await lockPortalVipContext(connection, target.steamId, {
        allowMissingConversionState: true,
      });
      assertActiveConversionStateMatchesPortalMembership(
        context.state,
        context.memberships,
      );
      // Keep the paid-activation order: token account, VIP groups,
      // memberships/ledger, then the game-side native snapshot. Cooperative
      // portal/staff writers are serialized; an out-of-band game DB writer
      // remains outside MySQL's cross-database transaction boundary.
      const activeNativeRows = (await readSelectedNativeRowsForSteamId(target.steamId))
        .filter((row) => {
          const expires = numericExpiry(row.expires);
          return expires === 0 || expires > Math.floor(Date.now() / 1_000);
        });
      const exactTarget = activeNativeRows.find((row) =>
        String(row.account_id) === target.accountId &&
        Number(row.sid) === target.serverId &&
        String(row.group) === target.storedGroup);
      if (!exactTarget) {
        membershipError(
          "vip-membership-not-found",
          "The selected native VIP is not an active runtime row.",
        );
      }
      const activeNativeTiers = new Set(
        activeNativeRows.map((row) => runtimeGroupIdentity(row.group)),
      );
      if (activeNativeTiers.size !== 1) {
        membershipError(
          "vip-membership-conflict",
          "Remove the other active native VIP tiers explicitly before keeping a native tier.",
        );
      }
      const matchingDefinition = context.definitions.find((definition) =>
        definitionIsAvailable(definition) &&
        runtimeGroupIdentity(definition.external_key) === runtimeGroupIdentity(target.storedGroup));
      if (!matchingDefinition) {
        membershipError(
          "vip-membership-stale",
          "The selected native tier is not an enabled connected VIPCore group.",
        );
      }
      await requireFreshLiveVipDefinition(target.storedGroup);
      await connection.execute(
        "UPDATE portal_identity_group_memberships AS membership " +
          "INNER JOIN portal_identity_groups AS identity_group ON identity_group.id = membership.group_id " +
          "SET membership.revoked_at = CURRENT_TIMESTAMP, membership.revoked_by_steam_id = ? " +
          "WHERE membership.steam_id = ? AND identity_group.source_type = 'vipcore' " +
          "AND membership.revoked_at IS NULL",
        [actorSteamId, target.steamId],
      );
      try {
        await connection.execute(
          "DELETE FROM portal_vip_membership_conversion_state WHERE steam_id = ?",
          [target.steamId],
        );
      } catch (error) {
        if (!isMissingConversionStorage(error)) throw error;
      }
      await reconcilePortalVipRewards(
        connection,
        target.steamId,
        [Number(matchingDefinition.id)],
        actorSteamId,
      );
      return {
        recordKey: `native:${target.accountId}:${target.serverId}:${encodeURIComponent(target.storedGroup)}`,
        keptSource: "native" as const,
      };
    });
  }

  const target = requirePortalReference(input.target);
  return withPortalTransaction(target.steamId, async (connection) => {
    const context = await lockPortalVipContext(connection, target.steamId);
    assertActiveConversionStateMatchesPortalMembership(
      context.state,
      context.memberships,
    );
    const nativeFloor = await nativeSuppressionFloor(target.steamId);
    const targetRow = context.memberships.find(
      (row) => Number(row.group_id) === target.groupId,
    );
    if (!targetRow || portalStatus(targetRow, new Date()) !== "active") {
      membershipError(
        "vip-membership-not-found",
        "The selected portal VIP is not currently active.",
      );
    }
    const targetDefinition = context.definitions.find(
      (definition) =>
        Number(definition.id) === target.groupId && definitionIsAvailable(definition),
    );
    if (!targetDefinition) {
      membershipError(
        "vip-membership-stale",
        "The selected portal VIP tier is not an enabled connected group.",
      );
    }
    await requireFreshLiveVipDefinition(targetDefinition.external_key);
    const expiresAt = asDate(targetRow.expires_at);
    await connection.execute(
      "UPDATE portal_identity_group_memberships AS membership " +
        "INNER JOIN portal_identity_groups AS identity_group ON identity_group.id = membership.group_id " +
        "SET membership.revoked_at = CURRENT_TIMESTAMP, membership.revoked_by_steam_id = ? " +
        "WHERE membership.steam_id = ? AND identity_group.source_type = 'vipcore' " +
        "AND membership.group_id <> ? AND membership.revoked_at IS NULL",
      [actorSteamId, target.steamId, target.groupId],
    );
    await upsertPortalConversionState(connection, {
      steamId: target.steamId,
      groupId: target.groupId,
      expiresAt,
      state: context.state,
      nativeFloor,
    });
    await reconcilePortalVipRewards(
      connection,
      target.steamId,
      [target.groupId],
      actorSteamId,
    );
    return {
      recordKey: `portal:${target.steamId}:${target.groupId}`,
      keptSource: "portal" as const,
    };
  });
}
