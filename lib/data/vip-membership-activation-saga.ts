import "server-only";

import { createHash, randomUUID } from "node:crypto";

import {
  type PoolConnection,
  type ResultSetHeader,
  type RowDataPacket,
} from "mysql2/promise";

import { getGameDatabasePool, getPortalDatabasePool } from "@/lib/data/database-pools";
import {
  compareVipTierRates,
  convertTimedVipMembership,
  selectPreferredVipTierRateListing,
  VipMembershipConversionError,
  type VipTierRate,
  type VipTierRateListingCandidate,
  type VipTimedConversionKind,
} from "@/lib/economy/vip-membership-conversion";
import {
  canonicalVipActivationJson,
  vipSuppressionRequiresReconciliation,
  vipActivationResumeAction,
  type VipActivationJobState,
} from "@/lib/economy/vip-activation-state";

const OPERATION_NAME = "inventory.group_membership.activate";
const COMMAND_TYPE = "inventory.vip.activate.v1";
const RATE_ALGORITHM = "vip-price-ratio-seconds-v1";
const RATE_SNAPSHOT_LIFETIME_MS = 10 * 60_000;
const JOB_LEASE_MS = 30_000;
const GLOBAL_SCOPE_UUID = "00000000-0000-0000-0000-000000000001";
const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;
const STEAM_ID_PATTERN = /^7656119[0-9]{10}$/;
const KEY_PATTERN = /^[a-z0-9][a-z0-9._:-]{0,95}$/;

export type VipMembershipActivationSagaInput = {
  steamId: string;
  itemId: string;
  idempotencyKey: string;
};

export type VipMembershipActivationSagaResult = {
  itemId: string;
  catalogueId: number;
  itemGroupId: number;
  itemGroupName: string;
  groupId: number;
  groupKey: string;
  groupName: string;
  sourceType: "vipcore";
  durationMinutes: number;
  activationKind:
    | VipTimedConversionKind
    | "made-permanent"
    | "permanent-upgrade";
  previousGroupName: string | null;
  convertedDurationSeconds: number;
  conversionSourceSeconds: number;
  timeDeductedSeconds: number;
  expiresAt: string | null;
};

export class VipMembershipActivationSagaError extends Error {
  readonly code: string;

  constructor(code: string, message: string) {
    super(message);
    this.name = "VipMembershipActivationSagaError";
    this.code = code;
  }
}

class ArenaCommandRejection extends Error {
  readonly code: string;

  constructor(code: string, message: string) {
    super(message);
    this.name = "ArenaCommandRejection";
    this.code = code;
  }
}

class ActivationManualReviewError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "ActivationManualReviewError";
  }
}

type PortalOperationRow = RowDataPacket & {
  id: number | string;
  operation_name: string;
  actor_steam_id: string;
  request_hash: string;
  status: "processing" | "completed";
  result_json: unknown;
};

type PortalInventoryRow = RowDataPacket & {
  id: string;
  owner_steam_id: string;
  catalogue_id: number | string | null;
  item_type: string;
  rarity_rank: number | string;
  state: string;
  attributes: unknown;
  catalogue_metadata: unknown;
};

type PortalTargetRow = RowDataPacket & {
  catalogue_id: number | string;
  listing_id: number | string | null;
  legacy_portal_group_id: number | string | null;
  arena_group_uuid: string;
  arena_group_key: string;
  arena_scope_uuid: string;
  arena_group_type: "admin" | "vip" | "custom";
  arena_group_row_version: number | string;
  duration_minutes: number | string;
  target_snapshot: unknown;
  enabled: number | boolean;
  listing_group_id: number | string | null;
  listing_duration_minutes: number | string | null;
  token_price: number | string | null;
  market_enabled: number | boolean | null;
  listing_enabled: number | boolean | null;
};

type PortalActivationJobRow = RowDataPacket & {
  id: number | string;
  job_uuid: string;
  arena_command_uuid: string;
  economy_operation_id: number | string;
  idempotency_key: string;
  request_hash: string;
  item_id: string;
  owner_steam_id: string;
  catalogue_id: number | string;
  listing_id: number | string | null;
  arena_group_uuid: string;
  arena_group_key: string;
  arena_scope_uuid: string;
  arena_group_type: "admin" | "vip" | "custom";
  arena_group_row_version: number | string;
  duration_minutes: number | string;
  request_payload: unknown;
  rate_snapshot: unknown;
  rate_snapshot_hash: string | null;
  rate_snapshot_expires_at: Date | string | null;
  status: VipActivationJobState;
  attempts: number | string;
  available_at: Date | string;
  locked_at: Date | string | null;
  arena_receipt: unknown;
  result_json: unknown;
  error_code: string | null;
  last_error: string | null;
};

type ArenaGroupRow = RowDataPacket & {
  id: number | string;
  group_uuid: string;
  legacy_portal_group_id: number | string | null;
  group_key: string;
  group_type: "admin" | "vip" | "custom";
  vip_family_key: string | null;
  display_name: string;
  rank_weight: number | string;
  row_version: number | string;
  enabled: number | boolean;
  scope_id: number | string | null;
  scope_enabled: number | boolean | null;
};

type ArenaScopeRow = RowDataPacket & {
  id: number | string;
  scope_uuid: string;
  enabled: number | boolean;
};

type ArenaCommandRow = RowDataPacket & {
  command_uuid: string;
  issuer: string;
  issuer_request_key: string;
  request_hash: string;
  target_steam_id: string;
  source_inventory_item_id: string | null;
  status: "received" | "processing" | "applied" | "rejected" | "manual_review";
};

type ArenaReceiptRow = RowDataPacket & {
  command_uuid: string;
  outcome: "applied" | "rejected";
  membership_uuid: string | null;
  subscription_row_version: number | string | null;
  result_hash: string;
  result: unknown;
};

type ArenaSubscriptionRow = RowDataPacket & {
  steam_id: string;
  scope_id: number | string;
  vip_family_key: string;
  group_id: number | string | null;
  membership_uuid: string | null;
  status: "active" | "ended" | "conflict";
  starts_at: Date | string | null;
  expires_at: Date | string | null;
  legacy_suppressed_until: Date | string | null;
  legacy_suppressed_permanently: number | boolean;
  row_version: number | string;
};

type ArenaMembershipRow = RowDataPacket & {
  membership_uuid: string;
  group_id: number | string;
  scope_id: number | string;
  steam_id: string;
  starts_at: Date | string;
  expires_at: Date | string | null;
  status: "active" | "revoked" | "superseded" | "conflict";
  source_inventory_item_id: string | null;
  row_version: number | string;
};

type TargetSnapshot = {
  schemaVersion: 1;
  arenaGroupUuid: string;
  arenaGroupKey: string;
  arenaScopeUuid: string;
  groupType: "vip";
  vipFamilyKey: string;
  rankWeight: number;
  displayName: string;
  legacyPortalGroupId: number | null;
  arenaGroupRowVersion: number;
  durationMinutes: number;
};

type RateTierSnapshot = {
  groupUuid: string;
  groupKey: string;
  displayName: string;
  legacyPortalGroupId: number | null;
  groupRowVersion: number;
  rankWeight: number;
  listingId: number;
  durationSeconds: string;
  priceTokens: string;
};

type RateSnapshot = {
  schemaVersion: 1;
  algorithmVersion: typeof RATE_ALGORITHM;
  priceUnit: "portal-token";
  rounding: "floor-to-second";
  vipFamilyKey: string;
  scopeUuid: string;
  capturedAt: string;
  expiresAt: string;
  tiers: RateTierSnapshot[];
};

type ActivationRequestPayload = {
  schemaVersion: 1;
  operationName: typeof OPERATION_NAME;
  commandType: typeof COMMAND_TYPE;
  ownerSteamId: string;
  itemId: string;
  catalogueId: number;
  itemDurationMinutes: number;
  target: TargetSnapshot;
  rateSnapshotHash: string;
};

type ArenaReceipt = {
  commandUuid: string;
  outcome: "applied" | "rejected";
  membershipUuid: string | null;
  subscriptionRowVersion: number | null;
  resultHash: string;
  result: VipMembershipActivationSagaResult | { code: string; message: string };
};

function fail(code: string, message: string): never {
  throw new VipMembershipActivationSagaError(code, message);
}

function rejection(code: string, message: string): never {
  throw new ArenaCommandRejection(code, message);
}

function asRecord(value: unknown, label: string): Record<string, unknown> {
  let candidate = value;
  if (Buffer.isBuffer(candidate)) candidate = candidate.toString("utf8");
  if (typeof candidate === "string") {
    try {
      candidate = JSON.parse(candidate) as unknown;
    } catch {
      fail("invalid_database_value", `${label} is not valid JSON.`);
    }
  }
  if (!candidate || typeof candidate !== "object" || Array.isArray(candidate)) {
    fail("invalid_database_value", `${label} is invalid.`);
  }
  return candidate as Record<string, unknown>;
}

function asArenaRecord(value: unknown, label: string): Record<string, unknown> {
  try {
    return asRecord(value, label);
  } catch (error) {
    if (error instanceof VipMembershipActivationSagaError) {
      rejection("invalid_command", error.message);
    }
    throw error;
  }
}

function asInteger(value: unknown, label: string, minimum = 0): number {
  const number = typeof value === "number" ? value : Number(String(value));
  if (!Number.isSafeInteger(number) || number < minimum) {
    fail("invalid_database_value", `${label} is invalid.`);
  }
  return number;
}

function asArenaInteger(value: unknown, label: string, minimum = 0): number {
  try {
    return asInteger(value, label, minimum);
  } catch (error) {
    if (error instanceof VipMembershipActivationSagaError) {
      rejection("invalid_command", error.message);
    }
    throw error;
  }
}

function asBigInt(value: unknown, label: string): bigint {
  const normalized = typeof value === "bigint"
    ? value.toString()
    : typeof value === "number" && Number.isSafeInteger(value)
      ? String(value)
      : typeof value === "string"
        ? value.trim()
        : "";
  if (!/^\d+$/.test(normalized)) fail("invalid_database_value", `${label} is invalid.`);
  return BigInt(normalized);
}

function asArenaBigInt(value: unknown, label: string): bigint {
  try {
    return asBigInt(value, label);
  } catch (error) {
    if (error instanceof VipMembershipActivationSagaError) {
      rejection("invalid_rate_snapshot", error.message);
    }
    throw error;
  }
}

function asBoolean(value: unknown) {
  return value === true || value === 1 || value === "1" || value === "true";
}

function asDate(value: Date | string | null, label: string): Date | null {
  if (value === null) return null;
  const date = value instanceof Date ? value : new Date(value);
  if (!Number.isFinite(date.getTime())) fail("invalid_database_value", `${label} is invalid.`);
  return date;
}

function sha256Json(value: unknown) {
  return createHash("sha256").update(canonicalVipActivationJson(value)).digest("hex");
}

function normalizeUuid(value: unknown, label: string) {
  const uuid = String(value ?? "").trim().toLowerCase();
  if (!UUID_PATTERN.test(uuid)) fail("invalid_database_value", `${label} is invalid.`);
  return uuid;
}

function publicSteamId(value: unknown) {
  const steamId = String(value ?? "").trim();
  if (!STEAM_ID_PATTERN.test(steamId)) fail("invalid_input", "The current player is invalid.");
  return steamId;
}

function publicItemId(value: unknown) {
  const itemId = String(value ?? "").trim().toLowerCase();
  if (!UUID_PATTERN.test(itemId)) fail("invalid_input", "The group membership item is invalid.");
  return itemId;
}

function publicIdempotencyKey(value: unknown) {
  const key = String(value ?? "").trim();
  if (!/^[A-Za-z0-9_-]{16,128}$/.test(key)) {
    fail("invalid_idempotency_key", "Provide a valid idempotency key.");
  }
  return key;
}

function readMetadataInteger(record: Record<string, unknown>, key: string) {
  const value = record[key];
  if (value === null || value === undefined || value === "") return null;
  const number = typeof value === "number" ? value : Number(value);
  return Number.isSafeInteger(number) ? number : null;
}

function readMetadataString(record: Record<string, unknown>, key: string) {
  const value = record[key];
  return typeof value === "string" && value.trim() ? value.trim() : null;
}

function optionalPositiveInteger(value: unknown, label: string) {
  return value === null || value === undefined
    ? null
    : asInteger(value, label, 1);
}

function optionalArenaPositiveInteger(value: unknown, label: string) {
  return value === null || value === undefined
    ? null
    : asArenaInteger(value, label, 1);
}

function parseTargetSnapshot(row: PortalTargetRow): TargetSnapshot {
  const source = asRecord(row.target_snapshot, "Arena catalogue target snapshot");
  const schemaVersion = asInteger(source.schemaVersion, "target snapshot schema version", 1);
  const groupUuid = normalizeUuid(source.arenaGroupUuid, "target snapshot group UUID");
  const scopeUuid = normalizeUuid(source.arenaScopeUuid, "target snapshot scope UUID");
  const groupKey = String(source.arenaGroupKey ?? "").trim().toLowerCase();
  const familyKey = String(source.vipFamilyKey ?? "").trim().toLowerCase();
  const displayName = String(source.displayName ?? "").trim();
  const groupType = source.groupType;
  const rankWeight = asInteger(source.rankWeight, "target snapshot rank", -1_000_000);
  const legacyPortalGroupId = optionalPositiveInteger(
    source.legacyPortalGroupId,
    "target snapshot legacy group ID",
  );
  const groupRowVersion = asInteger(
    source.arenaGroupRowVersion,
    "target snapshot group version",
    1,
  );
  const durationMinutes = asInteger(
    source.durationMinutes,
    "target snapshot duration",
  );
  if (
    schemaVersion !== 1 ||
    groupType !== "vip" ||
    !KEY_PATTERN.test(groupKey) ||
    !KEY_PATTERN.test(familyKey) ||
    !displayName ||
    displayName.length > 100 ||
    groupUuid !== normalizeUuid(row.arena_group_uuid, "Arena catalogue group UUID") ||
    scopeUuid !== normalizeUuid(row.arena_scope_uuid, "Arena catalogue scope UUID") ||
    groupKey !== String(row.arena_group_key).trim().toLowerCase() ||
    row.arena_group_type !== "vip" ||
    groupRowVersion !== asInteger(row.arena_group_row_version, "Arena catalogue group version", 1) ||
    durationMinutes !== asInteger(row.duration_minutes, "Arena catalogue duration") ||
    legacyPortalGroupId !== optionalPositiveInteger(row.legacy_portal_group_id, "legacy portal group ID")
  ) {
    fail(
      "catalogue_unavailable",
      "This VIP product has an invalid or stale Arena target snapshot.",
    );
  }
  return {
    schemaVersion: 1,
    arenaGroupUuid: groupUuid,
    arenaGroupKey: groupKey,
    arenaScopeUuid: scopeUuid,
    groupType: "vip",
    vipFamilyKey: familyKey,
    rankWeight,
    displayName,
    legacyPortalGroupId,
    arenaGroupRowVersion: groupRowVersion,
    durationMinutes,
  };
}

function parseRateSnapshot(value: unknown): RateSnapshot {
  const source = asArenaRecord(value, "VIP rate snapshot");
  if (
    source.schemaVersion !== 1 ||
    source.algorithmVersion !== RATE_ALGORITHM ||
    source.priceUnit !== "portal-token" ||
    source.rounding !== "floor-to-second" ||
    !Array.isArray(source.tiers)
  ) {
    rejection("invalid_rate_snapshot", "The VIP rate snapshot version is invalid.");
  }
  const familyKey = String(source.vipFamilyKey ?? "").trim().toLowerCase();
  const scopeUuid = String(source.scopeUuid ?? "").trim().toLowerCase();
  const capturedAt = String(source.capturedAt ?? "");
  const expiresAt = String(source.expiresAt ?? "");
  if (
    !KEY_PATTERN.test(familyKey) ||
    !UUID_PATTERN.test(scopeUuid) ||
    !Number.isFinite(new Date(capturedAt).getTime()) ||
    !Number.isFinite(new Date(expiresAt).getTime())
  ) {
    rejection("invalid_rate_snapshot", "The VIP rate snapshot metadata is invalid.");
  }
  const tiers = source.tiers.map((entry, index) => {
    const tier = asArenaRecord(entry, `VIP rate tier ${index + 1}`);
    const groupUuid = String(tier.groupUuid ?? "").trim().toLowerCase();
    const groupKey = String(tier.groupKey ?? "").trim().toLowerCase();
    const displayName = String(tier.displayName ?? "").trim();
    if (!UUID_PATTERN.test(groupUuid) || !KEY_PATTERN.test(groupKey) || !displayName) {
      rejection("invalid_rate_snapshot", "A VIP rate tier identity is invalid.");
    }
    return {
      groupUuid,
      groupKey,
      displayName,
      legacyPortalGroupId: optionalArenaPositiveInteger(tier.legacyPortalGroupId, "VIP rate legacy group ID"),
      groupRowVersion: asArenaInteger(tier.groupRowVersion, "VIP rate group version", 1),
      rankWeight: asArenaInteger(tier.rankWeight, "VIP rate rank", -1_000_000),
      listingId: asArenaInteger(tier.listingId, "VIP rate listing ID", 1),
      durationSeconds: asArenaBigInt(tier.durationSeconds, "VIP rate duration").toString(),
      priceTokens: asArenaBigInt(tier.priceTokens, "VIP rate price").toString(),
    } satisfies RateTierSnapshot;
  });
  return {
    schemaVersion: 1,
    algorithmVersion: RATE_ALGORITHM,
    priceUnit: "portal-token",
    rounding: "floor-to-second",
    vipFamilyKey: familyKey,
    scopeUuid,
    capturedAt,
    expiresAt,
    tiers,
  };
}

function parseRequestPayload(value: unknown): ActivationRequestPayload {
  const source = asArenaRecord(value, "VIP activation request");
  const targetSource = asArenaRecord(source.target, "VIP activation target");
  const target: TargetSnapshot = {
    schemaVersion: 1,
    arenaGroupUuid: String(targetSource.arenaGroupUuid ?? "").trim().toLowerCase(),
    arenaGroupKey: String(targetSource.arenaGroupKey ?? "").trim().toLowerCase(),
    arenaScopeUuid: String(targetSource.arenaScopeUuid ?? "").trim().toLowerCase(),
    groupType: "vip",
    vipFamilyKey: String(targetSource.vipFamilyKey ?? "").trim().toLowerCase(),
    rankWeight: asArenaInteger(targetSource.rankWeight, "VIP target rank", -1_000_000),
    displayName: String(targetSource.displayName ?? "").trim(),
    legacyPortalGroupId: optionalArenaPositiveInteger(targetSource.legacyPortalGroupId, "VIP target legacy group ID"),
    arenaGroupRowVersion: asArenaInteger(targetSource.arenaGroupRowVersion, "VIP target group version", 1),
    durationMinutes: asArenaInteger(targetSource.durationMinutes, "VIP target duration"),
  };
  const payload: ActivationRequestPayload = {
    schemaVersion: 1,
    operationName: OPERATION_NAME,
    commandType: COMMAND_TYPE,
    ownerSteamId: String(source.ownerSteamId ?? ""),
    itemId: String(source.itemId ?? "").toLowerCase(),
    catalogueId: asArenaInteger(source.catalogueId, "VIP catalogue ID", 1),
    itemDurationMinutes: asArenaInteger(source.itemDurationMinutes, "VIP item duration"),
    target,
    rateSnapshotHash: String(source.rateSnapshotHash ?? "").toLowerCase(),
  };
  if (
    source.schemaVersion !== 1 ||
    source.operationName !== OPERATION_NAME ||
    source.commandType !== COMMAND_TYPE ||
    !STEAM_ID_PATTERN.test(payload.ownerSteamId) ||
    !UUID_PATTERN.test(payload.itemId) ||
    !UUID_PATTERN.test(target.arenaGroupUuid) ||
    !UUID_PATTERN.test(target.arenaScopeUuid) ||
    !KEY_PATTERN.test(target.arenaGroupKey) ||
    !KEY_PATTERN.test(target.vipFamilyKey) ||
    target.groupType !== "vip" ||
    !/^[0-9a-f]{64}$/.test(payload.rateSnapshotHash)
  ) {
    rejection("invalid_command", "The VIP activation command is invalid.");
  }
  return payload;
}

function parseResult(value: unknown): VipMembershipActivationSagaResult {
  const result = asRecord(value, "VIP activation result");
  const activationKinds = new Set([
    "activated",
    "extended",
    "lower-tier-converted",
    "upgraded",
    "made-permanent",
    "permanent-upgrade",
  ]);
  if (
    !UUID_PATTERN.test(String(result.itemId ?? "").toLowerCase()) ||
    typeof result.itemGroupName !== "string" ||
    typeof result.groupKey !== "string" ||
    typeof result.groupName !== "string" ||
    result.sourceType !== "vipcore" ||
    !activationKinds.has(String(result.activationKind))
  ) {
    fail("invalid_database_value", "The saved VIP activation result is invalid.");
  }
  return result as VipMembershipActivationSagaResult;
}

function jobSelect() {
  return "SELECT id, job_uuid, arena_command_uuid, economy_operation_id, idempotency_key, request_hash, item_id, owner_steam_id, catalogue_id, listing_id, arena_group_uuid, arena_group_key, arena_scope_uuid, arena_group_type, arena_group_row_version, duration_minutes, request_payload, rate_snapshot, rate_snapshot_hash, rate_snapshot_expires_at, status, attempts, available_at, locked_at, arena_receipt, result_json, error_code, last_error FROM portal_membership_activation_jobs ";
}

function operationRequestHash(steamId: string, itemId: string) {
  return sha256Json({
    schemaVersion: 1,
    operationName: OPERATION_NAME,
    actorSteamId: steamId,
    request: { itemId },
  });
}

async function prepareActivation(input: {
  steamId: string;
  itemId: string;
  idempotencyKey: string;
}): Promise<PortalActivationJobRow | VipMembershipActivationSagaResult> {
  const pool = getPortalDatabasePool();
  if (!pool) fail("storage_unavailable", "The portal inventory database is unavailable.");
  const connection = await pool.getConnection();
  let transaction = false;
  try {
    await connection.beginTransaction();
    transaction = true;
    const basicRequestHash = operationRequestHash(input.steamId, input.itemId);
    const [insert] = await connection.execute<ResultSetHeader>(
      "INSERT IGNORE INTO portal_economy_operations (operation_name, idempotency_key, actor_steam_id, request_hash) VALUES (?, ?, ?, ?)",
      [OPERATION_NAME, input.idempotencyKey, input.steamId, basicRequestHash],
    );
    const [operationRows] = await connection.query<PortalOperationRow[]>(
      "SELECT id, operation_name, actor_steam_id, request_hash, status, result_json FROM portal_economy_operations WHERE idempotency_key = ? LIMIT 1 FOR UPDATE",
      [input.idempotencyKey],
    );
    const operation = operationRows[0];
    if (!operation) fail("operation_unavailable", "The inventory operation could not be locked.");
    if (
      operation.operation_name !== OPERATION_NAME ||
      operation.actor_steam_id !== input.steamId ||
      operation.request_hash !== basicRequestHash
    ) {
      fail("idempotency_conflict", "This idempotency key was already used for a different request.");
    }
    if (operation.status === "completed") {
      const stored = asRecord(operation.result_json, "saved economy result");
      if (stored.error && typeof stored.error === "object") {
        const error = stored.error as Record<string, unknown>;
        fail(String(error.code || "incompatible_item"), String(error.message || "The activation was rejected."));
      }
      const result = parseResult(stored);
      await connection.commit();
      transaction = false;
      return result;
    }
    const operationId = asInteger(operation.id, "economy operation ID", 1);
    if (insert.affectedRows !== 1) {
      const [existingJobs] = await connection.query<PortalActivationJobRow[]>(
        jobSelect() + "WHERE economy_operation_id = ? LIMIT 1 FOR UPDATE",
        [operationId],
      );
      const existing = existingJobs[0];
      if (!existing) {
        fail("operation_in_progress", "The activation is being prepared. Retry shortly with the same request.");
      }
      if (
        existing.item_id.toLowerCase() !== input.itemId ||
        existing.owner_steam_id !== input.steamId ||
        existing.idempotency_key !== input.idempotencyKey
      ) {
        fail("idempotency_conflict", "This idempotency key belongs to another activation.");
      }
      await connection.commit();
      transaction = false;
      return existing;
    }

    const [itemRows] = await connection.query<PortalInventoryRow[]>(
      "SELECT item.id, item.owner_steam_id, item.catalogue_id, item.item_type, item.rarity_rank, item.state, item.attributes, catalogue.metadata AS catalogue_metadata " +
        "FROM portal_inventory_items AS item LEFT JOIN portal_economy_catalogue AS catalogue ON catalogue.id = item.catalogue_id " +
        "WHERE item.id = ? LIMIT 1 FOR UPDATE",
      [input.itemId],
    );
    const item = itemRows[0];
    if (!item) fail("item_not_found", "That inventory item does not exist.");
    if (item.owner_steam_id !== input.steamId) fail("item_not_owned", "You do not own that VIP membership item.");
    if (item.state === "activation_pending") {
      const [pendingJobs] = await connection.query<PortalActivationJobRow[]>(
        jobSelect() + "WHERE item_id = ? AND owner_steam_id = ? AND status <> 'rejected' ORDER BY id DESC LIMIT 1 FOR UPDATE",
        [input.itemId, input.steamId],
      );
      const pending = pendingJobs[0];
      if (pending && !["completed", "rejected", "manual_review"].includes(pending.status)) {
        // The newly inserted operation belongs only to this retry attempt. Roll
        // it back and resume the item's original durable command instead.
        await connection.rollback();
        transaction = false;
        return pending;
      }
      fail(
        "operation_unavailable",
        "This VIP item has a pending activation that needs staff review.",
      );
    }
    if (item.state !== "available") {
      fail("item_unavailable", "That VIP membership is consumed or reserved by another operation.");
    }
    if (item.item_type !== "vip_membership" || asInteger(item.rarity_rank, "item rarity") !== 8) {
      fail("incompatible_item", "That item is not a Special VIP membership.");
    }
    const catalogueId = asInteger(item.catalogue_id, "VIP catalogue ID", 1);
    const attributes = asRecord(item.attributes, "VIP item attributes");
    const catalogueMetadata = asRecord(item.catalogue_metadata, "VIP catalogue metadata");
    const durationMinutes = readMetadataInteger(attributes, "membershipDurationMinutes") ??
      readMetadataInteger(attributes, "vipDurationMinutes");
    const itemGroupId = readMetadataInteger(attributes, "membershipGroupId");
    const itemGroupKey = readMetadataString(attributes, "membershipGroupKey")?.toLowerCase() ?? null;
    const itemScopeUuid = readMetadataString(attributes, "membershipScopeUuid")?.toLowerCase() ?? null;
    const itemSource = readMetadataString(attributes, "membershipSourceType") ?? "vipcore";
    const catalogueGroupKey = readMetadataString(
      catalogueMetadata,
      "membershipGroupKey",
    )?.toLowerCase() ?? null;
    const catalogueSource = readMetadataString(
      catalogueMetadata,
      "membershipSourceType",
    );
    const catalogueGroupId = readMetadataInteger(catalogueMetadata, "membershipGroupId");
    const catalogueScopeUuid = readMetadataString(
      catalogueMetadata,
      "membershipScopeUuid",
    )?.toLowerCase() ?? null;
    if (
      durationMinutes === null ||
      durationMinutes < 0 ||
      durationMinutes > 525_600 ||
      itemSource !== "vipcore" ||
      (catalogueSource !== null && catalogueSource !== "vipcore") ||
      (itemGroupId !== null && catalogueGroupId !== null && itemGroupId !== catalogueGroupId)
    ) {
      fail("catalogue_unavailable", "This VIP item has an invalid immutable membership snapshot.");
    }

    const [targetRows] = await connection.query<PortalTargetRow[]>(
      "SELECT target.catalogue_id, target.listing_id, target.legacy_portal_group_id, target.arena_group_uuid, target.arena_group_key, target.arena_scope_uuid, target.arena_group_type, target.arena_group_row_version, target.duration_minutes, target.target_snapshot, target.enabled, " +
        "listing.group_id AS listing_group_id, listing.duration_minutes AS listing_duration_minutes, listing.token_price, listing.market_enabled, listing.enabled AS listing_enabled " +
        "FROM portal_arena_group_catalogue_targets AS target " +
        "LEFT JOIN portal_identity_group_listings AS listing ON listing.id = target.listing_id " +
        "WHERE target.catalogue_id = ? LIMIT 1 FOR UPDATE",
      [catalogueId],
    );
    const targetRow = targetRows[0];
    if (!targetRow || !asBoolean(targetRow.enabled) || targetRow.arena_group_type !== "vip") {
      fail("catalogue_unavailable", "This VIP item is not connected to an enabled Arena group target.");
    }
    const target = parseTargetSnapshot(targetRow);
    if (
      (target.legacyPortalGroupId !== null && itemGroupId !== null && itemGroupId !== target.legacyPortalGroupId) ||
      (target.legacyPortalGroupId !== null && catalogueGroupId !== null && catalogueGroupId !== target.legacyPortalGroupId) ||
      (itemGroupKey !== null && itemGroupKey !== target.arenaGroupKey) ||
      (catalogueGroupKey !== null && catalogueGroupKey !== target.arenaGroupKey) ||
      (itemScopeUuid !== null && itemScopeUuid !== target.arenaScopeUuid) ||
      (catalogueScopeUuid !== null && catalogueScopeUuid !== target.arenaScopeUuid)
    ) {
      fail("catalogue_unavailable", "This VIP item no longer matches its trusted Arena target.");
    }

    const [rateRows] = await connection.query<PortalTargetRow[]>(
      "SELECT target.catalogue_id, target.listing_id, target.legacy_portal_group_id, target.arena_group_uuid, target.arena_group_key, target.arena_scope_uuid, target.arena_group_type, target.arena_group_row_version, target.duration_minutes, target.target_snapshot, target.enabled, " +
        "listing.group_id AS listing_group_id, listing.duration_minutes AS listing_duration_minutes, listing.token_price, listing.market_enabled, listing.enabled AS listing_enabled " +
        "FROM portal_arena_group_catalogue_targets AS target " +
        "INNER JOIN portal_identity_group_listings AS listing ON listing.id = target.listing_id " +
        "WHERE target.arena_group_type = 'vip' AND target.arena_scope_uuid IN (?, ?) AND target.enabled = TRUE AND listing.enabled = TRUE " +
        "ORDER BY target.arena_group_uuid, listing.id FOR UPDATE",
      [target.arenaScopeUuid, GLOBAL_SCOPE_UUID],
    );
    const candidates = new Map<string, Array<VipTierRateListingCandidate & { snapshot: TargetSnapshot }>>();
    const syntheticIds = new Map<string, number>();
    for (const row of rateRows) {
      const snapshot = parseTargetSnapshot(row);
      if (snapshot.vipFamilyKey !== target.vipFamilyKey) continue;
      const listingId = asInteger(row.listing_id, "VIP listing ID", 1);
      const listingMinutes = asInteger(row.listing_duration_minutes, "VIP listing duration");
      const priceTokens = asBigInt(row.token_price, "VIP listing Token price");
      if (listingMinutes <= 0 || priceTokens <= 0n) continue;
      if (listingMinutes !== snapshot.durationMinutes || listingMinutes !== asInteger(row.duration_minutes, "target duration")) {
        fail("catalogue_unavailable", "A VIP rate listing has a stale Arena target snapshot.");
      }
      let syntheticId = syntheticIds.get(snapshot.arenaGroupUuid);
      if (!syntheticId) {
        syntheticId = syntheticIds.size + 1;
        syntheticIds.set(snapshot.arenaGroupUuid, syntheticId);
      }
      const groupCandidates = candidates.get(snapshot.arenaGroupUuid) ?? [];
      groupCandidates.push({
        groupId: syntheticId,
        listingId,
        durationSeconds: BigInt(listingMinutes) * 60n,
        priceTokens,
        marketEnabled: asBoolean(row.market_enabled),
        enabled: asBoolean(row.listing_enabled),
        snapshot,
      });
      candidates.set(snapshot.arenaGroupUuid, groupCandidates);
    }
    const selectedRates: Array<{ rate: VipTierRate; snapshot: TargetSnapshot }> = [];
    for (const groupCandidates of candidates.values()) {
      const exactScopeCandidates = groupCandidates.filter(
        (entry) => entry.snapshot.arenaScopeUuid === target.arenaScopeUuid,
      );
      const applicableCandidates = exactScopeCandidates.length > 0
        ? exactScopeCandidates
        : groupCandidates.filter(
          (entry) => entry.snapshot.arenaScopeUuid === GLOBAL_SCOPE_UUID,
        );
      const selected = selectPreferredVipTierRateListing(applicableCandidates);
      if (!selected) continue;
      const first = applicableCandidates[0].snapshot;
      if (
        applicableCandidates.some((entry) =>
          entry.snapshot.arenaGroupKey !== first.arenaGroupKey ||
          entry.snapshot.rankWeight !== first.rankWeight ||
          entry.snapshot.arenaGroupRowVersion !== first.arenaGroupRowVersion ||
          entry.snapshot.legacyPortalGroupId !== first.legacyPortalGroupId
        )
      ) {
        fail("catalogue_unavailable", "VIP listings disagree about their Arena group target.");
      }
      selectedRates.push({ rate: selected, snapshot: selected.snapshot });
    }
    selectedRates.sort((left, right) =>
      left.snapshot.rankWeight - right.snapshot.rankWeight ||
      (left.snapshot.arenaGroupUuid < right.snapshot.arenaGroupUuid
        ? -1
        : left.snapshot.arenaGroupUuid > right.snapshot.arenaGroupUuid
          ? 1
          : 0)
    );
    if (!selectedRates.some((entry) => entry.snapshot.arenaGroupUuid === target.arenaGroupUuid)) {
      fail("catalogue_unavailable", `${target.displayName} has no live finite marketplace rate.`);
    }
    const rankOwners = new Set<number>();
    for (let index = 0; index < selectedRates.length; index += 1) {
      const entry = selectedRates[index];
      if (rankOwners.has(entry.snapshot.rankWeight)) {
        fail("catalogue_unavailable", "VIP conversion is paused because two tiers have the same rank.");
      }
      rankOwners.add(entry.snapshot.rankWeight);
      if (index > 0) {
        try {
          if (compareVipTierRates(selectedRates[index - 1].rate, entry.rate) >= 0) {
            fail("catalogue_unavailable", "VIP conversion is paused because live tier rates do not increase through the ranks.");
          }
        } catch (error) {
          if (error instanceof VipMembershipConversionError) {
            fail("catalogue_unavailable", "A live VIP marketplace rate is invalid.");
          }
          throw error;
        }
      }
    }
    const capturedAt = new Date();
    const expiresAt = new Date(capturedAt.getTime() + RATE_SNAPSHOT_LIFETIME_MS);
    const rateSnapshot: RateSnapshot = {
      schemaVersion: 1,
      algorithmVersion: RATE_ALGORITHM,
      priceUnit: "portal-token",
      rounding: "floor-to-second",
      vipFamilyKey: target.vipFamilyKey,
      scopeUuid: target.arenaScopeUuid,
      capturedAt: capturedAt.toISOString(),
      expiresAt: expiresAt.toISOString(),
      tiers: selectedRates.map(({ rate, snapshot }) => ({
        groupUuid: snapshot.arenaGroupUuid,
        groupKey: snapshot.arenaGroupKey,
        displayName: snapshot.displayName,
        legacyPortalGroupId: snapshot.legacyPortalGroupId,
        groupRowVersion: snapshot.arenaGroupRowVersion,
        rankWeight: snapshot.rankWeight,
        listingId: rate.listingId,
        durationSeconds: rate.durationSeconds.toString(),
        priceTokens: rate.priceTokens.toString(),
      })),
    };
    const rateSnapshotHash = sha256Json(rateSnapshot);
    const requestPayload: ActivationRequestPayload = {
      schemaVersion: 1,
      operationName: OPERATION_NAME,
      commandType: COMMAND_TYPE,
      ownerSteamId: input.steamId,
      itemId: input.itemId,
      catalogueId,
      itemDurationMinutes: durationMinutes,
      target,
      rateSnapshotHash,
    };
    const requestHash = sha256Json(requestPayload);
    const jobUuid = randomUUID().toLowerCase();
    const commandUuid = randomUUID().toLowerCase();
    await connection.execute(
      "INSERT INTO portal_membership_activation_jobs (job_uuid, arena_command_uuid, economy_operation_id, idempotency_key, request_hash, item_id, reserved_item_id, owner_steam_id, catalogue_id, listing_id, arena_group_uuid, arena_group_key, arena_scope_uuid, arena_group_type, arena_group_row_version, duration_minutes, request_payload, rate_snapshot, rate_snapshot_hash, rate_snapshot_expires_at) " +
        "VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'vip', ?, ?, ?, ?, ?, ?)",
      [
        jobUuid,
        commandUuid,
        operationId,
        input.idempotencyKey,
        requestHash,
        input.itemId,
        input.itemId,
        input.steamId,
        catalogueId,
        targetRow.listing_id,
        target.arenaGroupUuid,
        target.arenaGroupKey,
        target.arenaScopeUuid,
        target.arenaGroupRowVersion,
        durationMinutes,
        JSON.stringify(requestPayload),
        JSON.stringify(rateSnapshot),
        rateSnapshotHash,
        expiresAt,
      ],
    );
    const [reserve] = await connection.execute<ResultSetHeader>(
      "UPDATE portal_inventory_items SET state = 'activation_pending' WHERE id = ? AND owner_steam_id = ? AND state = 'available'",
      [input.itemId, input.steamId],
    );
    if (reserve.affectedRows !== 1) fail("item_unavailable", "That VIP item could not be reserved.");
    await connection.execute(
      "INSERT INTO portal_inventory_item_events (item_id, actor_steam_id, event_type, idempotency_key, line_key, before_state, after_state, metadata) VALUES (?, ?, 'group_membership.activation_prepared', ?, 'vip-activation:prepared', ?, ?, ?)",
      [
        input.itemId,
        input.steamId,
        input.idempotencyKey,
        JSON.stringify({ ownerSteamId: input.steamId, state: "available", attributes }),
        JSON.stringify({ ownerSteamId: input.steamId, state: "activation_pending", attributes }),
        JSON.stringify({ jobUuid, commandUuid, catalogueId, requestHash, rateSnapshotHash }),
      ],
    );
    const [jobRows] = await connection.query<PortalActivationJobRow[]>(
      jobSelect() + "WHERE job_uuid = ? LIMIT 1 FOR UPDATE",
      [jobUuid],
    );
    const job = jobRows[0];
    if (!job) fail("operation_unavailable", "The VIP activation job was not saved.");
    await connection.commit();
    transaction = false;
    return job;
  } catch (error) {
    if (transaction) {
      try { await connection.rollback(); } catch { /* preserve original */ }
    }
    const candidate = error as { code?: unknown; errno?: unknown };
    if (candidate.code === "ER_NO_SUCH_TABLE" || candidate.errno === 1146 || candidate.code === "ER_BAD_FIELD_ERROR") {
      fail("storage_unavailable", "VIP activation storage is not installed on both databases.");
    }
    throw error;
  } finally {
    connection.release();
  }
}

function validateJobContract(job: PortalActivationJobRow) {
  try {
    if (
      job.arena_group_type !== "vip" ||
      !UUID_PATTERN.test(job.arena_command_uuid) ||
      !UUID_PATTERN.test(job.item_id.toLowerCase()) ||
      !STEAM_ID_PATTERN.test(job.owner_steam_id) ||
      !/^[0-9a-f]{64}$/.test(job.request_hash) ||
      !job.rate_snapshot_hash ||
      !/^[0-9a-f]{64}$/.test(job.rate_snapshot_hash)
    ) {
      throw new ActivationManualReviewError("The saved activation job identity is invalid.");
    }
    const payload = parseRequestPayload(job.request_payload);
    const rates = parseRateSnapshot(job.rate_snapshot);
    const storedRateExpiry = asDate(
      job.rate_snapshot_expires_at,
      "job rate snapshot expiry",
    );
    if (
      sha256Json(payload) !== job.request_hash ||
      sha256Json(rates) !== job.rate_snapshot_hash ||
      payload.rateSnapshotHash !== job.rate_snapshot_hash ||
      payload.ownerSteamId !== job.owner_steam_id ||
      payload.itemId !== job.item_id.toLowerCase() ||
      payload.catalogueId !== asInteger(job.catalogue_id, "job catalogue ID", 1) ||
      payload.itemDurationMinutes !== asInteger(job.duration_minutes, "job duration") ||
      payload.target.arenaGroupUuid !== job.arena_group_uuid ||
      payload.target.arenaScopeUuid !== job.arena_scope_uuid ||
      payload.target.arenaGroupKey !== job.arena_group_key ||
      payload.target.arenaGroupRowVersion !== asInteger(job.arena_group_row_version, "job group version", 1) ||
      rates.vipFamilyKey !== payload.target.vipFamilyKey ||
      rates.scopeUuid !== payload.target.arenaScopeUuid ||
      !storedRateExpiry ||
      Math.abs(storedRateExpiry.getTime() - new Date(rates.expiresAt).getTime()) > 1_000
    ) {
      throw new ActivationManualReviewError("The saved activation job hash or target does not match.");
    }
    return { payload, rates };
  } catch (error) {
    if (
      error instanceof ArenaCommandRejection ||
      error instanceof VipMembershipActivationSagaError
    ) {
      throw new ActivationManualReviewError(error.message);
    }
    throw error;
  }
}

async function claimJob(job: PortalActivationJobRow) {
  const pool = getPortalDatabasePool();
  if (!pool) fail("storage_unavailable", "The portal inventory database is unavailable.");
  const connection = await pool.getConnection();
  let transaction = false;
  try {
    await connection.beginTransaction();
    transaction = true;
    const [rows] = await connection.query<PortalActivationJobRow[]>(
      jobSelect() + "WHERE id = ? LIMIT 1 FOR UPDATE",
      [asInteger(job.id, "activation job ID", 1)],
    );
    const current = rows[0];
    if (!current) fail("operation_unavailable", "The activation job no longer exists.");
    const lockedAt = asDate(current.locked_at, "activation lease");
    const leaseIsFresh = Boolean(lockedAt && Date.now() - lockedAt.getTime() < JOB_LEASE_MS);
    const action = vipActivationResumeAction({ state: current.status, leaseIsFresh });
    if (action === "wait") {
      fail("operation_in_progress", "VIP activation is already being delivered. Retry shortly with the same request.");
    }
    if (action === "manual-review") {
      fail("operation_unavailable", "This VIP activation needs staff review; the item remains safely reserved.");
    }
    if (action === "return-rejection" || action === "return-result" || action === "finalize") {
      await connection.commit();
      transaction = false;
      return { job: current, action };
    }
    await connection.execute(
      "UPDATE portal_membership_activation_jobs SET status = 'dispatching', attempts = attempts + 1, locked_by = ?, locked_at = CURRENT_TIMESTAMP(6), last_error = NULL WHERE id = ?",
      [`portal:${process.pid}`, asInteger(current.id, "activation job ID", 1)],
    );
    current.status = "dispatching";
    await connection.commit();
    transaction = false;
    return { job: current, action: "dispatch" as const };
  } catch (error) {
    if (transaction) {
      try { await connection.rollback(); } catch { /* preserve original */ }
    }
    throw error;
  } finally {
    connection.release();
  }
}

function arenaResultHash(result: unknown) {
  return sha256Json(result);
}

function receiptFromRow(row: ArenaReceiptRow): ArenaReceipt {
  const result = asRecord(row.result, "Arena command receipt");
  const resultHash = String(row.result_hash).toLowerCase();
  if (arenaResultHash(result) !== resultHash) {
    throw new ActivationManualReviewError("The Arena command receipt hash is invalid.");
  }
  return {
    commandUuid: row.command_uuid,
    outcome: row.outcome,
    membershipUuid: row.membership_uuid,
    subscriptionRowVersion: row.subscription_row_version === null
      ? null
      : asInteger(row.subscription_row_version, "subscription row version", 1),
    resultHash,
    result: row.outcome === "applied"
      ? parseResult(result)
      : {
          code: String(result.code || "incompatible_item"),
          message: String(result.message || "The VIP activation was rejected."),
        },
  };
}

async function storeArenaRejection(
  connection: PoolConnection,
  commandUuid: string,
  error: ArenaCommandRejection,
): Promise<ArenaReceipt> {
  const result = { code: error.code, message: error.message };
  const resultHash = arenaResultHash(result);
  await connection.execute(
    "UPDATE arena_membership_commands SET status = 'rejected', reserved_inventory_item_id = NULL, error_code = ?, error_message = ?, applied_at = CURRENT_TIMESTAMP(6) WHERE command_uuid = ?",
    [error.code, error.message.slice(0, 500), commandUuid],
  );
  await connection.execute(
    "INSERT INTO arena_membership_command_receipts (command_uuid, outcome, membership_uuid, subscription_row_version, result_hash, result) VALUES (?, 'rejected', NULL, NULL, ?, ?)",
    [commandUuid, resultHash, JSON.stringify(result)],
  );
  return {
    commandUuid,
    outcome: "rejected",
    membershipUuid: null,
    subscriptionRowVersion: null,
    resultHash,
    result,
  };
}

function secondsNumber(value: bigint, label: string) {
  if (value < 0n || value > BigInt(Number.MAX_SAFE_INTEGER)) {
    rejection("invalid_duration", `${label} is outside the supported range.`);
  }
  return Number(value);
}

async function applyArenaVipCommand(job: PortalActivationJobRow): Promise<ArenaReceipt> {
  const pool = getGameDatabasePool();
  if (!pool) fail("storage_unavailable", "The Arena membership database is unavailable; your item remains reserved.");
  const { payload, rates } = validateJobContract(job);
  const connection = await pool.getConnection();
  let transaction = false;
  try {
    await connection.beginTransaction();
    transaction = true;
    const [scopeRows] = await connection.query<ArenaScopeRow[]>(
      "SELECT id, scope_uuid, enabled FROM arena_scopes WHERE scope_uuid = ? LIMIT 1",
      [payload.target.arenaScopeUuid],
    );
    const scope = scopeRows[0];
    const [targetRows] = await connection.query<ArenaGroupRow[]>(
      "SELECT identity_group.id, identity_group.group_uuid, identity_group.legacy_portal_group_id, identity_group.group_key, identity_group.group_type, identity_group.vip_family_key, identity_group.display_name, identity_group.rank_weight, identity_group.row_version, identity_group.enabled, group_scope.scope_id, group_scope.enabled AS scope_enabled " +
        "FROM arena_groups AS identity_group LEFT JOIN arena_group_scopes AS group_scope ON group_scope.group_id = identity_group.id AND group_scope.scope_id = ? " +
        "WHERE identity_group.group_uuid = ? LIMIT 1",
      [scope ? asInteger(scope.id, "Arena scope ID", 1) : 0, payload.target.arenaGroupUuid],
    );
    const target = targetRows[0];
    const validBinding = Boolean(scope && target && target.scope_id !== null);
    const targetGroupId = validBinding ? asInteger(target.id, "Arena target group ID", 1) : null;
    const targetScopeId = validBinding ? asInteger(scope!.id, "Arena target scope ID", 1) : null;
    await connection.execute(
      "INSERT IGNORE INTO arena_membership_commands (command_uuid, issuer, issuer_request_key, request_hash, command_type, actor_steam_id, target_steam_id, target_group_id, target_scope_id, vip_family_key, source_inventory_item_id, reserved_inventory_item_id, request_payload, rate_snapshot, rate_snapshot_hash, rate_snapshot_expires_at) " +
        "VALUES (?, 'portal', ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)",
      [
        job.arena_command_uuid,
        job.idempotency_key,
        job.request_hash,
        COMMAND_TYPE,
        payload.ownerSteamId,
        payload.ownerSteamId,
        targetGroupId,
        targetScopeId,
        payload.target.vipFamilyKey,
        payload.itemId,
        payload.itemId,
        JSON.stringify(payload),
        JSON.stringify(rates),
        job.rate_snapshot_hash,
        asDate(job.rate_snapshot_expires_at, "rate snapshot expiry"),
      ],
    );
    const [commandRows] = await connection.query<ArenaCommandRow[]>(
      "SELECT command_uuid, issuer, issuer_request_key, request_hash, target_steam_id, source_inventory_item_id, status FROM arena_membership_commands " +
        "WHERE command_uuid = ? OR (issuer = 'portal' AND issuer_request_key = ?) FOR UPDATE",
      [job.arena_command_uuid, job.idempotency_key],
    );
    if (
      commandRows.length !== 1 ||
      commandRows[0].command_uuid !== job.arena_command_uuid ||
      commandRows[0].issuer !== "portal" ||
      commandRows[0].issuer_request_key !== job.idempotency_key ||
      commandRows[0].request_hash !== job.request_hash ||
      commandRows[0].target_steam_id !== payload.ownerSteamId ||
      commandRows[0].source_inventory_item_id?.toLowerCase() !== payload.itemId
    ) {
      throw new ActivationManualReviewError("The Arena command identity conflicts with an existing request.");
    }
    const [receiptRows] = await connection.query<ArenaReceiptRow[]>(
      "SELECT command_uuid, outcome, membership_uuid, subscription_row_version, result_hash, result FROM arena_membership_command_receipts WHERE command_uuid = ? LIMIT 1 FOR UPDATE",
      [job.arena_command_uuid],
    );
    if (receiptRows[0]) {
      const receipt = receiptFromRow(receiptRows[0]);
      await connection.commit();
      transaction = false;
      return receipt;
    }
    if (commandRows[0].status === "applied" || commandRows[0].status === "rejected" || commandRows[0].status === "manual_review") {
      throw new ActivationManualReviewError("The Arena command is terminal but has no durable receipt.");
    }
    await connection.execute(
      "UPDATE arena_membership_commands SET status = 'processing', error_code = NULL, error_message = NULL WHERE command_uuid = ?",
      [job.arena_command_uuid],
    );

    try {
      if (!scope || !asBoolean(scope.enabled)) rejection("scope_unavailable", "The selected Arena scope is unavailable.");
      if (!target || !validBinding || !asBoolean(target.enabled) || !asBoolean(target.scope_enabled)) {
        rejection("group_unavailable", "The selected VIP group is not enabled in this Arena scope.");
      }
      const scopeId = asArenaInteger(scope.id, "Arena scope ID", 1);
      const itemGroupId = asArenaInteger(target.id, "Arena target group ID", 1);
      if (
        target.group_type !== "vip" ||
        target.group_uuid !== payload.target.arenaGroupUuid ||
        target.group_key !== payload.target.arenaGroupKey ||
        target.vip_family_key !== payload.target.vipFamilyKey ||
        target.display_name !== payload.target.displayName ||
        asArenaInteger(target.rank_weight, "Arena target rank", -1_000_000) !== payload.target.rankWeight ||
        asArenaInteger(target.row_version, "Arena target version", 1) !== payload.target.arenaGroupRowVersion ||
        optionalArenaPositiveInteger(target.legacy_portal_group_id, "Arena legacy portal group ID") !== payload.target.legacyPortalGroupId
      ) {
        rejection("stale_group_target", "The VIP group changed after this activation was prepared.");
      }
      if (sha256Json(rates) !== job.rate_snapshot_hash) rejection("invalid_rate_snapshot", "The VIP rate snapshot hash is invalid.");
      const rateExpiresAt = new Date(rates.expiresAt);
      if (rateExpiresAt.getTime() <= Date.now()) {
        rejection("rate_snapshot_expired", "Marketplace rates changed before the activation could be applied. The item was not consumed.");
      }
      const [tierRows] = await connection.query<ArenaGroupRow[]>(
        "SELECT identity_group.id, identity_group.group_uuid, identity_group.legacy_portal_group_id, identity_group.group_key, identity_group.group_type, identity_group.vip_family_key, identity_group.display_name, identity_group.rank_weight, identity_group.row_version, identity_group.enabled, group_scope.scope_id, group_scope.enabled AS scope_enabled " +
          "FROM arena_groups AS identity_group INNER JOIN arena_group_scopes AS group_scope ON group_scope.group_id = identity_group.id " +
          "WHERE group_scope.scope_id = ? AND identity_group.group_type = 'vip' AND identity_group.vip_family_key = ? AND identity_group.enabled = TRUE AND group_scope.enabled = TRUE " +
          "ORDER BY identity_group.rank_weight, identity_group.id FOR UPDATE",
        [scopeId, payload.target.vipFamilyKey],
      );
      if (!tierRows.length) rejection("group_unavailable", "No enabled VIP tiers exist in this Arena scope.");
      const tiersByUuid = new Map(tierRows.map((row) => [row.group_uuid, row] as const));
      if (tiersByUuid.size !== rates.tiers.length || rates.tiers.some((rate) => !tiersByUuid.has(rate.groupUuid))) {
        rejection("stale_rate_schedule", "The enabled VIP tier set changed after rates were captured.");
      }
      const ratesByGroupId = new Map<number, VipTierRate>();
      const snapshotByGroupId = new Map<number, RateTierSnapshot>();
      const ranks = new Set<number>();
      const rankedRates: Array<{ rank: number; rate: VipTierRate }> = [];
      for (const rateSnapshot of rates.tiers) {
        const tier = tiersByUuid.get(rateSnapshot.groupUuid)!;
        const groupId = asArenaInteger(tier.id, "Arena VIP tier ID", 1);
        const rank = asArenaInteger(tier.rank_weight, "Arena VIP tier rank", -1_000_000);
        if (
          tier.group_key !== rateSnapshot.groupKey ||
          tier.display_name !== rateSnapshot.displayName ||
          optionalArenaPositiveInteger(tier.legacy_portal_group_id, "Arena legacy group ID") !== rateSnapshot.legacyPortalGroupId ||
          asArenaInteger(tier.row_version, "Arena VIP tier version", 1) !== rateSnapshot.groupRowVersion ||
          rank !== rateSnapshot.rankWeight ||
          ranks.has(rank)
        ) {
          rejection("stale_rate_schedule", "A VIP tier changed after marketplace rates were captured.");
        }
        ranks.add(rank);
        const rate: VipTierRate = {
          groupId,
          listingId: rateSnapshot.listingId,
          durationSeconds: asArenaBigInt(rateSnapshot.durationSeconds, "VIP rate duration"),
          priceTokens: asArenaBigInt(rateSnapshot.priceTokens, "VIP rate price"),
        };
        if (rate.durationSeconds <= 0n || rate.priceTokens <= 0n) {
          rejection("invalid_rate_snapshot", "A VIP marketplace rate is not positive.");
        }
        ratesByGroupId.set(groupId, rate);
        snapshotByGroupId.set(groupId, rateSnapshot);
        rankedRates.push({ rank, rate });
      }
      rankedRates.sort((left, right) => left.rank - right.rank);
      for (let index = 1; index < rankedRates.length; index += 1) {
        try {
          if (compareVipTierRates(rankedRates[index - 1].rate, rankedRates[index].rate) >= 0) {
            rejection("invalid_rate_snapshot", "VIP marketplace rates are not strictly increasing by tier.");
          }
        } catch (error) {
          if (error instanceof VipMembershipConversionError) {
            rejection("invalid_rate_snapshot", "A captured VIP marketplace rate is invalid.");
          }
          throw error;
        }
      }

      await connection.execute(
        "INSERT IGNORE INTO arena_vip_subscriptions (steam_id, scope_id, vip_family_key, group_id, group_type, membership_uuid, status, starts_at, expires_at, legacy_suppressed_until, legacy_suppressed_permanently, last_command_uuid, row_version) " +
          "VALUES (?, ?, ?, NULL, 'vip', NULL, 'ended', NULL, NULL, NULL, FALSE, NULL, 1)",
        [payload.ownerSteamId, scopeId, payload.target.vipFamilyKey],
      );
      const [subscriptionRows] = await connection.query<ArenaSubscriptionRow[]>(
        "SELECT steam_id, scope_id, vip_family_key, group_id, membership_uuid, status, starts_at, expires_at, legacy_suppressed_until, legacy_suppressed_permanently, row_version " +
          "FROM arena_vip_subscriptions WHERE steam_id = ? AND scope_id = ? AND vip_family_key = ? LIMIT 1 FOR UPDATE",
        [payload.ownerSteamId, scopeId, payload.target.vipFamilyKey],
      );
      const subscription = subscriptionRows[0];
      if (!subscription) rejection("subscription_unavailable", "The VIP subscription could not be locked.");
      if (subscription.status === "conflict") rejection("membership_conflict", "This VIP membership needs staff reconciliation before an item can be used.");
      const now = new Date();
      const existingExpiresAt = asDate(subscription.expires_at, "VIP subscription expiry");
      const existingStartsAt = asDate(subscription.starts_at, "VIP subscription start");
      const subscriptionActive = Boolean(
        subscription.status === "active" &&
        subscription.group_id !== null &&
        subscription.membership_uuid &&
        existingStartsAt &&
        existingStartsAt.getTime() <= now.getTime() &&
        (existingExpiresAt === null || existingExpiresAt.getTime() > now.getTime()),
      );
      const suppressionUntil = asDate(subscription.legacy_suppressed_until, "legacy VIP suppression expiry");
      const suppressionPermanent = asBoolean(subscription.legacy_suppressed_permanently);
      if (vipSuppressionRequiresReconciliation({
        subscriptionStatus: subscription.status,
        subscriptionActive,
        suppressionActive: Boolean(
          suppressionPermanent ||
          (suppressionUntil && suppressionUntil.getTime() > now.getTime()),
        ),
      })) {
        rejection("membership_conflict", "Legacy VIP suppression exists without a matching active subscription. Staff must reconcile it first.");
      }
      const currentGroupId = subscriptionActive
        ? asArenaInteger(subscription.group_id, "current VIP group ID", 1)
        : null;
      const currentTier = currentGroupId === null
        ? null
        : tierRows.find((row) => asArenaInteger(row.id, "VIP tier ID", 1) === currentGroupId) ?? null;
      if (currentGroupId !== null && !currentTier) {
        rejection("membership_conflict", "The active VIP tier is no longer enabled in this scope.");
      }
      const [familyMemberships] = await connection.query<ArenaMembershipRow[]>(
        "SELECT membership.membership_uuid, membership.group_id, membership.scope_id, membership.steam_id, membership.starts_at, membership.expires_at, membership.status, membership.source_inventory_item_id, membership.row_version " +
          "FROM arena_group_memberships AS membership INNER JOIN arena_groups AS identity_group ON identity_group.id = membership.group_id " +
          "WHERE membership.steam_id = ? AND membership.scope_id = ? AND identity_group.group_type = 'vip' AND identity_group.vip_family_key = ? " +
          "ORDER BY membership.membership_uuid FOR UPDATE",
        [payload.ownerSteamId, scopeId, payload.target.vipFamilyKey],
      );
      if (familyMemberships.some((membership) => membership.status === "conflict")) {
        rejection("membership_conflict", "One or more VIP memberships in this scope need staff reconciliation.");
      }
      const effectiveMemberships = familyMemberships.filter((membership) => {
        if (membership.status !== "active") return false;
        const expiry = asDate(membership.expires_at, "VIP membership expiry");
        return expiry === null || expiry.getTime() > now.getTime();
      });
      if (
        effectiveMemberships.length !== (subscriptionActive ? 1 : 0) ||
        (subscriptionActive &&
          effectiveMemberships[0]?.membership_uuid !== subscription.membership_uuid)
      ) {
        rejection("membership_conflict", "The VIP subscription does not match the effective memberships in this scope.");
      }
      const currentMembership: ArenaMembershipRow | null = subscriptionActive
        ? effectiveMemberships[0] ?? null
        : null;
      if (subscriptionActive) {
        const membershipExpiry = currentMembership
          ? asDate(currentMembership.expires_at, "VIP membership expiry")
          : null;
        const membershipExpiryMatches = currentMembership !== null &&
          (membershipExpiry === null) === (existingExpiresAt === null) &&
          (
            membershipExpiry === null ||
            existingExpiresAt === null ||
            Math.abs(membershipExpiry.getTime() - existingExpiresAt.getTime()) <= 1_000
          );
        if (
          !currentMembership ||
          currentMembership.status !== "active" ||
          asArenaInteger(currentMembership.group_id, "membership group ID", 1) !== currentGroupId ||
          asArenaInteger(currentMembership.scope_id, "membership scope ID", 1) !== scopeId ||
          currentMembership.steam_id !== payload.ownerSteamId ||
          !membershipExpiryMatches
        ) {
          rejection("membership_conflict", "The VIP subscription and membership rows do not match.");
        }
      }

      const itemDurationSeconds = BigInt(payload.itemDurationMinutes) * 60n;
      const itemRank = asArenaInteger(target.rank_weight, "item VIP rank", -1_000_000);
      const currentRank = currentTier
        ? asArenaInteger(currentTier.rank_weight, "current VIP rank", -1_000_000)
        : null;
      const currentPermanent = Boolean(subscriptionActive && existingExpiresAt === null);
      let activationKind: VipMembershipActivationSagaResult["activationKind"];
      let convertedDurationSeconds = 0n;
      let conversionSourceSeconds = 0n;
      let timeDeductedSeconds = 0n;
      let resultGroupId = itemGroupId;
      let finalExpiresAt: Date | null;
      if (!subscriptionActive) {
        if (payload.itemDurationMinutes === 0) {
          activationKind = "made-permanent";
          finalExpiresAt = null;
        } else {
          activationKind = "activated";
          finalExpiresAt = new Date(now.getTime() + Number(itemDurationSeconds) * 1_000);
        }
      } else if (currentPermanent) {
        if (payload.itemDurationMinutes !== 0) {
          rejection("incompatible_item", `You already have permanent ${currentTier!.display_name} access. This timed item remains in your inventory.`);
        }
        if (itemGroupId === currentGroupId || itemRank <= currentRank!) {
          rejection("incompatible_item", `You already own permanent ${currentTier!.display_name} access. This item was not consumed.`);
        }
        activationKind = "permanent-upgrade";
        finalExpiresAt = null;
      } else if (payload.itemDurationMinutes === 0) {
        if (itemGroupId !== currentGroupId && itemRank <= currentRank!) {
          rejection("incompatible_item", `Permanent ${target.display_name} cannot replace your higher ${currentTier!.display_name} tier. This item was not consumed.`);
        }
        activationKind = itemGroupId === currentGroupId ? "made-permanent" : "permanent-upgrade";
        finalExpiresAt = null;
      } else {
        const remainingSeconds = BigInt(Math.max(0, Math.floor((existingExpiresAt!.getTime() - now.getTime()) / 1_000)));
        if (remainingSeconds <= 0n) rejection("membership_conflict", "The current VIP has no remaining time to convert.");
        try {
          const converted = convertTimedVipMembership({
            current: {
              groupId: currentGroupId!,
              rankWeight: currentRank!,
              remainingSeconds,
            },
            item: {
              groupId: itemGroupId,
              rankWeight: itemRank,
              durationSeconds: itemDurationSeconds,
            },
            currentRate: ratesByGroupId.get(currentGroupId!),
            itemRate: ratesByGroupId.get(itemGroupId),
          });
          activationKind = converted.kind;
          resultGroupId = converted.resultGroupId;
          convertedDurationSeconds = converted.convertedSeconds;
          conversionSourceSeconds = converted.conversionSourceSeconds;
          timeDeductedSeconds = converted.timeDeductedSeconds;
          const resultSeconds = secondsNumber(converted.resultSeconds, "converted VIP duration");
          const expiryMs = now.getTime() + resultSeconds * 1_000;
          if (!Number.isSafeInteger(expiryMs) || expiryMs > 253_402_300_799_000) {
            rejection("invalid_duration", "This VIP extension exceeds the supported expiry date.");
          }
          finalExpiresAt = new Date(expiryMs);
        } catch (error) {
          if (error instanceof VipMembershipConversionError) {
            rejection(
              error.code === "conversion-too-small" ? "conversion_too_small" : "invalid_rate_snapshot",
              error.code === "conversion-too-small"
                ? `At the captured marketplace rates, this ${target.display_name} item converts to less than one second of ${currentTier!.display_name}. Nothing was consumed.`
                : "VIP conversion could not be calculated from the captured marketplace rates.",
            );
          }
          throw error;
        }
      }
      const resultTier = tierRows.find((row) => asArenaInteger(row.id, "result VIP group ID", 1) === resultGroupId);
      const resultRateSnapshot = snapshotByGroupId.get(resultGroupId);
      if (!resultTier || !resultRateSnapshot) rejection("stale_rate_schedule", "The resulting VIP tier is missing from the captured rates.");
      const newSuppressionPermanent = suppressionPermanent || finalExpiresAt === null;
      const newSuppressionUntil = newSuppressionPermanent
        ? null
        : new Date(Math.max(suppressionUntil?.getTime() ?? 0, finalExpiresAt!.getTime()));

      const targetMembership = familyMemberships.find(
        (membership) =>
          asArenaInteger(membership.group_id, "destination VIP group ID", 1) ===
          resultGroupId,
      );
      const membershipUuid = targetMembership?.membership_uuid ?? randomUUID().toLowerCase();
      const membershipStartsAt = subscriptionActive && resultGroupId === currentGroupId
        ? existingStartsAt!
        : now;
      if (targetMembership) {
        await connection.execute(
          "UPDATE arena_group_memberships SET starts_at = ?, expires_at = ?, status = 'active', provenance_type = 'inventory', provenance_reference = ?, source_inventory_item_id = COALESCE(source_inventory_item_id, ?), origin_command_uuid = ?, granted_by_actor = ?, grant_reason = ?, revoked_at = NULL, revoked_by_actor = NULL, revoke_reason = NULL, row_version = row_version + 1 WHERE membership_uuid = ?",
          [
            membershipStartsAt,
            finalExpiresAt,
            job.job_uuid,
            payload.itemId,
            job.arena_command_uuid,
            payload.ownerSteamId,
            `Activated inventory VIP item ${payload.itemId}`,
            membershipUuid,
          ],
        );
      } else {
        await connection.execute(
          "INSERT INTO arena_group_memberships (membership_uuid, group_id, scope_id, steam_id, starts_at, expires_at, status, provenance_type, provenance_reference, source_inventory_item_id, origin_command_uuid, granted_by_actor, grant_reason) " +
            "VALUES (?, ?, ?, ?, ?, ?, 'active', 'inventory', ?, ?, ?, ?, ?)",
          [
            membershipUuid,
            resultGroupId,
            scopeId,
            payload.ownerSteamId,
            now,
            finalExpiresAt,
            job.job_uuid,
            payload.itemId,
            job.arena_command_uuid,
            payload.ownerSteamId,
            `Activated inventory VIP item ${payload.itemId}`,
          ],
        );
      }
      const nextVersion = asArenaInteger(subscription.row_version, "VIP subscription version", 1) + 1;
      await connection.execute(
        "UPDATE arena_vip_subscriptions SET group_id = ?, group_type = 'vip', membership_uuid = ?, status = 'active', starts_at = ?, expires_at = ?, legacy_suppressed_until = ?, legacy_suppressed_permanently = ?, last_command_uuid = ?, row_version = ? " +
          "WHERE steam_id = ? AND scope_id = ? AND vip_family_key = ?",
        [
          resultGroupId,
          membershipUuid,
          membershipStartsAt,
          finalExpiresAt,
          newSuppressionUntil,
          newSuppressionPermanent,
          job.arena_command_uuid,
          nextVersion,
          payload.ownerSteamId,
          scopeId,
          payload.target.vipFamilyKey,
        ],
      );
      const supersededMembershipUuids = familyMemberships
        .filter(
          (membership) =>
            membership.status === "active" &&
            membership.membership_uuid !== membershipUuid,
        )
        .map((membership) => membership.membership_uuid);
      if (supersededMembershipUuids.length) {
        await connection.execute(
          "UPDATE arena_group_memberships SET status = 'superseded', row_version = row_version + 1 " +
            `WHERE membership_uuid IN (${supersededMembershipUuids.map(() => "?").join(", ")})`,
          supersededMembershipUuids,
        );
      }
      const result: VipMembershipActivationSagaResult = {
        itemId: payload.itemId,
        catalogueId: payload.catalogueId,
        itemGroupId: payload.target.legacyPortalGroupId ?? itemGroupId,
        itemGroupName: payload.target.displayName,
        groupId: resultRateSnapshot.legacyPortalGroupId ?? resultGroupId,
        groupKey: resultTier.group_key,
        groupName: resultTier.display_name,
        sourceType: "vipcore",
        durationMinutes: payload.itemDurationMinutes,
        activationKind,
        previousGroupName: currentTier?.display_name ?? null,
        convertedDurationSeconds: secondsNumber(convertedDurationSeconds, "converted VIP duration"),
        conversionSourceSeconds: secondsNumber(conversionSourceSeconds, "VIP conversion source duration"),
        timeDeductedSeconds: secondsNumber(timeDeductedSeconds, "deducted VIP duration"),
        expiresAt: finalExpiresAt?.toISOString() ?? null,
      };
      await connection.execute(
        "INSERT INTO arena_vip_subscription_history (transition_uuid, steam_id, scope_id, vip_family_key, action, from_group_id, to_group_id, membership_uuid, command_uuid, source_inventory_item_id, actor_steam_id, before_expires_at, after_expires_at, item_duration_seconds, converted_duration_seconds, conversion_source_seconds, time_deducted_seconds, rate_snapshot_hash, metadata) " +
          "VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)",
        [
          randomUUID().toLowerCase(),
          payload.ownerSteamId,
          scopeId,
          payload.target.vipFamilyKey,
          activationKind,
          currentGroupId,
          resultGroupId,
          membershipUuid,
          job.arena_command_uuid,
          payload.itemId,
          payload.ownerSteamId,
          subscriptionActive ? existingExpiresAt : null,
          finalExpiresAt,
          itemDurationSeconds.toString(),
          convertedDurationSeconds.toString(),
          conversionSourceSeconds.toString(),
          timeDeductedSeconds.toString(),
          job.rate_snapshot_hash,
          JSON.stringify({
            schemaVersion: 1,
            jobUuid: job.job_uuid,
            activationKind,
            previousGroupName: currentTier?.display_name ?? null,
            legacySuppressedUntil: newSuppressionUntil?.toISOString() ?? null,
            legacySuppressedPermanently: newSuppressionPermanent,
          }),
        ],
      );
      const resultHash = arenaResultHash(result);
      await connection.execute(
        "UPDATE arena_membership_commands SET status = 'applied', error_code = NULL, error_message = NULL, applied_at = CURRENT_TIMESTAMP(6) WHERE command_uuid = ?",
        [job.arena_command_uuid],
      );
      await connection.execute(
        "INSERT INTO arena_membership_command_receipts (command_uuid, outcome, membership_uuid, subscription_row_version, result_hash, result) VALUES (?, 'applied', ?, ?, ?, ?)",
        [job.arena_command_uuid, membershipUuid, nextVersion, resultHash, JSON.stringify(result)],
      );
      await connection.execute(
        "INSERT INTO arena_membership_outbox (event_uuid, deduplication_key, event_type, aggregate_type, aggregate_key, command_uuid, membership_uuid, steam_id, group_id, scope_id, payload) " +
          "VALUES (?, ?, 'membership.vip.changed', 'vip_subscription', ?, ?, ?, ?, ?, ?, ?)",
        [
          randomUUID().toLowerCase(),
          `membership-command:${job.arena_command_uuid}`,
          `${payload.ownerSteamId}:${scopeId}:${payload.target.vipFamilyKey}`,
          job.arena_command_uuid,
          membershipUuid,
          payload.ownerSteamId,
          resultGroupId,
          scopeId,
          JSON.stringify({
            schemaVersion: 1,
            commandUuid: job.arena_command_uuid,
            membershipUuid,
            steamId: payload.ownerSteamId,
            groupUuid: resultTier.group_uuid,
            groupKey: resultTier.group_key,
            scopeUuid: payload.target.arenaScopeUuid,
            vipFamilyKey: payload.target.vipFamilyKey,
            status: "active",
            expiresAt: result.expiresAt,
            rowVersion: nextVersion,
            activationKind,
          }),
        ],
      );
      const receipt: ArenaReceipt = {
        commandUuid: job.arena_command_uuid,
        outcome: "applied",
        membershipUuid,
        subscriptionRowVersion: nextVersion,
        resultHash,
        result,
      };
      await connection.commit();
      transaction = false;
      return receipt;
    } catch (error) {
      if (!(error instanceof ArenaCommandRejection)) throw error;
      const receipt = await storeArenaRejection(connection, job.arena_command_uuid, error);
      await connection.commit();
      transaction = false;
      return receipt;
    }
  } catch (error) {
    if (transaction) {
      try { await connection.rollback(); } catch { /* preserve original */ }
    }
    const candidate = error as { code?: unknown; errno?: unknown };
    if (candidate.code === "ER_NO_SUCH_TABLE" || candidate.errno === 1146 || candidate.code === "ER_BAD_FIELD_ERROR") {
      fail("storage_unavailable", "Arena VIP authority storage is not installed; your item remains reserved.");
    }
    throw error;
  } finally {
    connection.release();
  }
}

async function markJobForRetry(job: PortalActivationJobRow, error: unknown) {
  const pool = getPortalDatabasePool();
  if (!pool) return;
  const message = error instanceof Error ? error.message.slice(0, 500) : "Arena delivery failed.";
  try {
    await pool.execute(
      "UPDATE portal_membership_activation_jobs SET status = 'retry_wait', available_at = CURRENT_TIMESTAMP(6) + INTERVAL 5 SECOND, locked_by = NULL, locked_at = NULL, last_error = ? " +
        "WHERE id = ? AND status = 'dispatching'",
      [message, asInteger(job.id, "activation job ID", 1)],
    );
  } catch {
    // The item remains activation_pending even if recording the retry fails.
  }
}

async function markJobForManualReview(job: PortalActivationJobRow, error: unknown) {
  const pool = getPortalDatabasePool();
  if (!pool) return;
  const message = error instanceof Error ? error.message.slice(0, 500) : "Activation consistency check failed.";
  try {
    await pool.execute(
      "UPDATE portal_membership_activation_jobs SET status = 'manual_review', locked_by = NULL, locked_at = NULL, error_code = 'receipt_mismatch', last_error = ? WHERE id = ? AND status <> 'completed'",
      [message, asInteger(job.id, "activation job ID", 1)],
    );
  } catch {
    // Never compensate inventory when persistence itself is ambiguous.
  }
}

async function persistArenaReceipt(job: PortalActivationJobRow, receipt: ArenaReceipt) {
  if (
    receipt.commandUuid !== job.arena_command_uuid ||
    arenaResultHash(receipt.result) !== receipt.resultHash
  ) {
    throw new ActivationManualReviewError("The Arena receipt does not match this activation job.");
  }
  const pool = getPortalDatabasePool();
  if (!pool) fail("storage_unavailable", "The portal inventory database is unavailable; your item remains reserved.");
  const connection = await pool.getConnection();
  let transaction = false;
  try {
    await connection.beginTransaction();
    transaction = true;
    const [rows] = await connection.query<PortalActivationJobRow[]>(
      jobSelect() + "WHERE id = ? LIMIT 1 FOR UPDATE",
      [asInteger(job.id, "activation job ID", 1)],
    );
    const current = rows[0];
    if (!current) fail("operation_unavailable", "The activation job no longer exists.");
    validateJobContract(current);
    if (current.status === "completed" || current.status === "rejected") {
      await connection.commit();
      transaction = false;
      return current;
    }
    if (receipt.outcome === "applied") {
      const result = parseResult(receipt.result);
      await connection.execute(
        "UPDATE portal_membership_activation_jobs SET status = 'arena_applied', arena_receipt = ?, result_json = ?, error_code = NULL, last_error = NULL, arena_applied_at = CURRENT_TIMESTAMP(6), locked_by = NULL, locked_at = NULL WHERE id = ?",
        [JSON.stringify(receipt), JSON.stringify(result), asInteger(current.id, "activation job ID", 1)],
      );
      current.status = "arena_applied";
      current.arena_receipt = receipt;
      current.result_json = result;
    } else {
      const rejected = receipt.result as { code: string; message: string };
      const [itemRows] = await connection.query<Array<RowDataPacket & { state: string }>>(
        "SELECT state FROM portal_inventory_items WHERE id = ? AND owner_steam_id = ? LIMIT 1 FOR UPDATE",
        [current.item_id, current.owner_steam_id],
      );
      if (itemRows[0]?.state !== "activation_pending") {
        throw new ActivationManualReviewError("A rejected activation no longer owns its pending inventory reservation.");
      }
      await connection.execute(
        "UPDATE portal_inventory_items SET state = 'available', consumed_at = NULL WHERE id = ? AND owner_steam_id = ? AND state = 'activation_pending'",
        [current.item_id, current.owner_steam_id],
      );
      await connection.execute(
        "INSERT INTO portal_inventory_item_events (item_id, actor_steam_id, event_type, idempotency_key, line_key, before_state, after_state, metadata) VALUES (?, ?, 'group_membership.activation_rejected', ?, 'vip-activation:rejected', ?, ?, ?)",
        [
          current.item_id,
          current.owner_steam_id,
          current.idempotency_key,
          JSON.stringify({ ownerSteamId: current.owner_steam_id, state: "activation_pending" }),
          JSON.stringify({ ownerSteamId: current.owner_steam_id, state: "available" }),
          JSON.stringify({ commandUuid: current.arena_command_uuid, receipt, error: rejected }),
        ],
      );
      const storedError = { error: rejected };
      await connection.execute(
        "UPDATE portal_economy_operations SET status = 'completed', result_json = ?, completed_at = CURRENT_TIMESTAMP WHERE id = ?",
        [JSON.stringify(storedError), asInteger(current.economy_operation_id, "economy operation ID", 1)],
      );
      await connection.execute(
        "UPDATE portal_membership_activation_jobs SET status = 'rejected', reserved_item_id = NULL, arena_receipt = ?, result_json = ?, error_code = ?, last_error = ?, completed_at = CURRENT_TIMESTAMP(6), locked_by = NULL, locked_at = NULL WHERE id = ?",
        [
          JSON.stringify(receipt),
          JSON.stringify(storedError),
          rejected.code.slice(0, 64),
          rejected.message.slice(0, 500),
          asInteger(current.id, "activation job ID", 1),
        ],
      );
      current.status = "rejected";
      current.error_code = rejected.code;
      current.last_error = rejected.message;
      current.result_json = storedError;
    }
    await connection.commit();
    transaction = false;
    return current;
  } catch (error) {
    if (transaction) {
      try { await connection.rollback(); } catch { /* preserve original */ }
    }
    throw error;
  } finally {
    connection.release();
  }
}

async function finalizeAppliedJob(job: PortalActivationJobRow) {
  const pool = getPortalDatabasePool();
  if (!pool) fail("storage_unavailable", "The portal inventory database is unavailable; your item remains reserved.");
  const connection = await pool.getConnection();
  let transaction = false;
  try {
    await connection.beginTransaction();
    transaction = true;
    const [rows] = await connection.query<PortalActivationJobRow[]>(
      jobSelect() + "WHERE id = ? LIMIT 1 FOR UPDATE",
      [asInteger(job.id, "activation job ID", 1)],
    );
    const current = rows[0];
    if (!current) fail("operation_unavailable", "The activation job no longer exists.");
    validateJobContract(current);
    if (current.status === "completed") {
      const result = parseResult(current.result_json);
      await connection.commit();
      transaction = false;
      return result;
    }
    if (current.status === "rejected") {
      const stored = asRecord(current.result_json, "rejected activation result");
      const error = asRecord(stored.error, "rejected activation error");
      fail(String(error.code || "incompatible_item"), String(error.message || "The activation was rejected."));
    }
    if (current.status !== "arena_applied" && current.status !== "finalizing") {
      fail("operation_in_progress", "The Arena membership has not returned an applied receipt yet.");
    }
    const receiptRecord = asRecord(current.arena_receipt, "Arena receipt");
    const receipt: ArenaReceipt = {
      commandUuid: String(receiptRecord.commandUuid ?? ""),
      outcome: receiptRecord.outcome === "applied" ? "applied" : "rejected",
      membershipUuid: typeof receiptRecord.membershipUuid === "string" ? receiptRecord.membershipUuid : null,
      subscriptionRowVersion: receiptRecord.subscriptionRowVersion === null
        ? null
        : asInteger(receiptRecord.subscriptionRowVersion, "receipt subscription version", 1),
      resultHash: String(receiptRecord.resultHash ?? ""),
      result: receiptRecord.result as VipMembershipActivationSagaResult,
    };
    if (
      receipt.commandUuid !== current.arena_command_uuid ||
      receipt.outcome !== "applied" ||
      arenaResultHash(receipt.result) !== receipt.resultHash
    ) {
      throw new ActivationManualReviewError("The stored Arena receipt is invalid.");
    }
    const result = parseResult(receipt.result);
    await connection.execute(
      "UPDATE portal_membership_activation_jobs SET status = 'finalizing', locked_by = ?, locked_at = CURRENT_TIMESTAMP(6) WHERE id = ?",
      [`portal:${process.pid}`, asInteger(current.id, "activation job ID", 1)],
    );
    const [itemRows] = await connection.query<Array<RowDataPacket & { state: string }>>(
      "SELECT state FROM portal_inventory_items WHERE id = ? AND owner_steam_id = ? LIMIT 1 FOR UPDATE",
      [current.item_id, current.owner_steam_id],
    );
    if (itemRows[0]?.state !== "activation_pending") {
      throw new ActivationManualReviewError("An applied activation no longer owns its pending inventory reservation.");
    }
    const [consume] = await connection.execute<ResultSetHeader>(
      "UPDATE portal_inventory_items SET state = 'consumed', consumed_at = CURRENT_TIMESTAMP WHERE id = ? AND owner_steam_id = ? AND state = 'activation_pending'",
      [current.item_id, current.owner_steam_id],
    );
    if (consume.affectedRows !== 1) throw new ActivationManualReviewError("The pending VIP item could not be finalized.");
    await connection.execute(
      "INSERT INTO portal_inventory_item_events (item_id, actor_steam_id, event_type, idempotency_key, line_key, before_state, after_state, metadata) VALUES (?, ?, 'group_membership.activated', ?, 'vip-activation:consumed', ?, ?, ?)",
      [
        current.item_id,
        current.owner_steam_id,
        current.idempotency_key,
        JSON.stringify({ ownerSteamId: current.owner_steam_id, state: "activation_pending" }),
        JSON.stringify({ ownerSteamId: current.owner_steam_id, state: "consumed" }),
        JSON.stringify({ jobUuid: current.job_uuid, commandUuid: current.arena_command_uuid, receiptHash: receipt.resultHash, ...result }),
      ],
    );
    await connection.execute(
      "UPDATE portal_economy_operations SET status = 'completed', result_json = ?, completed_at = CURRENT_TIMESTAMP WHERE id = ?",
      [JSON.stringify(result), asInteger(current.economy_operation_id, "economy operation ID", 1)],
    );
    await connection.execute(
      "UPDATE portal_membership_activation_jobs SET status = 'completed', result_json = ?, completed_at = CURRENT_TIMESTAMP(6), locked_by = NULL, locked_at = NULL, last_error = NULL WHERE id = ?",
      [JSON.stringify(result), asInteger(current.id, "activation job ID", 1)],
    );
    await connection.commit();
    transaction = false;
    return result;
  } catch (error) {
    if (transaction) {
      try { await connection.rollback(); } catch { /* preserve original */ }
    }
    throw error;
  } finally {
    connection.release();
  }
}

function throwRejectedJob(job: PortalActivationJobRow): never {
  const stored = asRecord(job.result_json, "rejected activation result");
  const error = asRecord(stored.error, "rejected activation error");
  fail(String(error.code || job.error_code || "incompatible_item"), String(error.message || job.last_error || "The VIP activation was rejected."));
}

/**
 * Three durable transactions across two hosts: reserve in Portal, apply once
 * in Arena, then consume in Portal. Unknown Arena outcomes are never treated
 * as rejection and therefore never release or consume the reserved item.
 */
export async function activateVipMembershipItemWithSaga(
  rawInput: VipMembershipActivationSagaInput,
): Promise<VipMembershipActivationSagaResult> {
  const input = {
    steamId: publicSteamId(rawInput.steamId),
    itemId: publicItemId(rawInput.itemId),
    idempotencyKey: publicIdempotencyKey(rawInput.idempotencyKey),
  };
  const prepared = await prepareActivation(input);
  if (!("job_uuid" in prepared)) return prepared;
  let job = prepared;
  try {
    validateJobContract(job);
  } catch (error) {
    await markJobForManualReview(job, error);
    fail(
      "operation_unavailable",
      "This VIP activation needs staff review; your item remains safely reserved.",
    );
  }
  const claimed = await claimJob(job);
  job = claimed.job;
  if (claimed.action === "return-result") return parseResult(job.result_json);
  if (claimed.action === "return-rejection") throwRejectedJob(job);
  if (claimed.action === "finalize") return finalizeAppliedJob(job);

  let receipt: ArenaReceipt;
  try {
    receipt = await applyArenaVipCommand(job);
  } catch (error) {
    if (error instanceof ActivationManualReviewError) {
      await markJobForManualReview(job, error);
      fail("operation_unavailable", "This VIP activation needs staff review; your item remains safely reserved.");
    }
    await markJobForRetry(job, error);
    fail(
      "operation_unavailable",
      "Arena could not confirm the VIP activation yet. Your item is safely reserved; retry the same activation shortly.",
    );
  }
  let persisted: PortalActivationJobRow;
  try {
    persisted = await persistArenaReceipt(job, receipt);
  } catch (error) {
    if (error instanceof ActivationManualReviewError) {
      await markJobForManualReview(job, error);
      fail("operation_unavailable", "The Arena receipt needs staff review; your item remains safely reserved.");
    }
    await markJobForRetry(job, error);
    fail(
      "operation_unavailable",
      "Arena confirmed the command, but Portal has not finalized it yet. Retry the same activation; your item remains reserved.",
    );
  }
  if (persisted.status === "rejected") throwRejectedJob(persisted);
  try {
    return await finalizeAppliedJob(persisted);
  } catch (error) {
    if (error instanceof ActivationManualReviewError) {
      await markJobForManualReview(persisted, error);
      fail("operation_unavailable", "VIP inventory finalization needs staff review; the item remains reserved.");
    }
    throw error;
  }
}
