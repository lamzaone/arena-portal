import "server-only";

import { createHash } from "node:crypto";

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
import type { IdentityGroupSource } from "@/lib/data/identity-groups";
import { selectPreferredVipTierRateListing } from "@/lib/economy/vip-membership-conversion";

export const MAX_GROUP_LISTING_DURATION_MINUTES = 525_600;
export const MAX_GROUP_LISTING_PRICE = 1_000_000_000;

export type GroupListingActor = {
  steamId: string;
  isFounder: boolean;
};

export type GroupListingGroup = {
  id: number;
  key: string;
  displayName: string;
  sourceType: IdentityGroupSource;
  externalKey: string | null;
  description: string | null;
  badgeLabel: string;
  badgeIconKey: string;
  badgeColor: string;
  badgeSoftColor: string;
  profilePriority: number;
  enabled: boolean;
};

export type IdentityGroupListingVipScope = {
  serverId: number;
  scopeUuid: string;
  label: string;
  description: string;
  hasDefinitions: boolean;
};

export type IdentityGroupListing = {
  id: number;
  groupId: number;
  catalogueId: number;
  listingName: string;
  description: string | null;
  durationMinutes: number;
  euroPriceCents: number;
  tokenPrice: number;
  vipPageEnabled: boolean;
  marketEnabled: boolean;
  enabled: boolean;
  sortOrder: number;
  createdAt: string;
  updatedAt: string;
  arenaScopeUuid: string | null;
  vipScope: IdentityGroupListingVipScope | null;
  group: GroupListingGroup;
};

export type IdentityGroupListingAdminSnapshot = {
  groups: GroupListingGroup[];
  listings: IdentityGroupListing[];
  vipScopes: IdentityGroupListingVipScope[];
};

export class IdentityGroupListingError extends Error {
  readonly code: string;

  constructor(code: string, message: string) {
    super(message);
    this.name = "IdentityGroupListingError";
    this.code = code;
  }
}

type GroupRow = RowDataPacket & {
  id: number | string;
  group_key: string;
  display_name: string;
  source_type: IdentityGroupSource;
  external_key: string | null;
  description: string | null;
  badge_label: string;
  badge_icon_key: string;
  badge_color: string;
  badge_soft_color: string;
  profile_priority: number | string;
  enabled: number | boolean;
};

type ListingRow = GroupRow & {
  listing_id: number | string;
  group_id: number | string;
  catalogue_id: number | string | null;
  listing_name: string;
  listing_description: string | null;
  duration_minutes: number | string;
  euro_price_cents: number | string;
  token_price: number | string;
  vip_page_enabled: number | boolean;
  market_enabled: number | boolean;
  listing_enabled: number | boolean;
  sort_order: number | string;
  created_at: Date | string;
  updated_at: Date | string;
  arena_group_uuid: string | null;
  arena_group_key: string | null;
  arena_scope_uuid: string | null;
  arena_group_row_version: number | string | null;
  catalogue_metadata?: unknown;
};

type ArenaVipScopeRow = RowDataPacket & {
  server_id: number | string;
  scope_uuid: string;
  display_name: string;
  definition_count: number | string;
};

type ArenaCatalogueTargetRow = RowDataPacket & {
  group_uuid: string;
  group_key: string;
  group_type: "admin" | "vip" | "custom";
  vip_family_key: string | null;
  display_name: string;
  rank_weight: number | string;
  row_version: number | string;
  scope_uuid: string;
  vip_server_id: number | string;
  scope_display_name: string;
};

type ArenaCatalogueTarget = {
  arenaGroupUuid: string;
  arenaGroupKey: string;
  arenaGroupType: "admin" | "vip" | "custom";
  vipFamilyKey: string | null;
  displayName: string;
  rankWeight: number;
  arenaGroupRowVersion: number;
  arenaScopeUuid: string;
  vipServerId: number;
  scopeDisplayName: string;
};

type OperationRow = RowDataPacket & {
  id: number | string;
  operation_name: string;
  actor_steam_id: string;
  request_hash: string;
  status: "processing" | "completed";
  result_json: unknown;
};

type ListingLockTargetRow = RowDataPacket & {
  group_id: number | string;
  catalogue_id: number | string | null;
};

const groupSelect =
  "SELECT identity_group.id, identity_group.group_key, identity_group.display_name, identity_group.source_type, identity_group.external_key, identity_group.description, " +
  "identity_group.badge_label, identity_group.badge_icon_key, identity_group.badge_color, identity_group.badge_soft_color, identity_group.profile_priority, identity_group.enabled ";

const listingSelect =
  "SELECT listings.id AS listing_id, listings.group_id, listings.catalogue_id, listings.listing_name, listings.description AS listing_description, " +
  "listings.duration_minutes, listings.euro_price_cents, listings.token_price, listings.vip_page_enabled, listings.market_enabled, listings.enabled AS listing_enabled, " +
  "listings.sort_order, listings.created_at, listings.updated_at, listings.arena_group_uuid, listings.arena_group_key, listings.arena_scope_uuid, listings.arena_group_row_version, " +
  "identity_group.id, identity_group.group_key, identity_group.display_name, identity_group.source_type, identity_group.external_key, identity_group.description, " +
  "identity_group.badge_label, identity_group.badge_icon_key, identity_group.badge_color, identity_group.badge_soft_color, identity_group.profile_priority, identity_group.enabled ";

function fail(code: string, message: string): never {
  throw new IdentityGroupListingError(code, message);
}

function integer(value: unknown, field: string, minimum = 0, maximum = Number.MAX_SAFE_INTEGER) {
  const parsed = typeof value === "number" ? value : Number(value);
  if (!Number.isSafeInteger(parsed) || parsed < minimum || parsed > maximum) {
    fail("invalid_input", `${field} is invalid.`);
  }
  return parsed;
}

function bool(value: unknown) {
  return value === true || value === 1 || value === "1";
}

function text(value: unknown, field: string, maximum: number) {
  const parsed = String(value ?? "").trim();
  if (!parsed || parsed.length > maximum) {
    fail("invalid_input", `${field} is invalid.`);
  }
  return parsed;
}

function optionalText(value: unknown, field: string, maximum: number) {
  const parsed = String(value ?? "").trim();
  if (!parsed) return null;
  if (parsed.length > maximum) fail("invalid_input", `${field} is invalid.`);
  return parsed;
}

function steamId(value: unknown) {
  const parsed = String(value ?? "").trim();
  if (!/^7656119\d{10}$/.test(parsed)) {
    fail("invalid_input", "Actor SteamID64 is invalid.");
  }
  return parsed;
}

function requestKey(value: unknown) {
  const parsed = String(value ?? "").trim();
  if (!/^[A-Za-z0-9._:-]{8,128}$/.test(parsed)) {
    fail("invalid_input", "The request key is invalid.");
  }
  return parsed;
}

function requireFounder(actor: GroupListingActor) {
  if (!actor.isFounder) {
    fail("founder_required", "Only the externally assigned Founder can manage shop listings.");
  }
  return steamId(actor.steamId);
}

function iso(value: Date | string) {
  return new Date(value).toISOString();
}

function toGroup(row: GroupRow): GroupListingGroup {
  return {
    id: integer(row.id, "Group ID", 1),
    key: row.group_key,
    displayName: row.display_name,
    sourceType: row.source_type,
    externalKey: row.external_key,
    description: row.description,
    badgeLabel: row.badge_label,
    badgeIconKey: row.badge_icon_key,
    badgeColor: row.badge_color,
    badgeSoftColor: row.badge_soft_color,
    profilePriority: integer(row.profile_priority, "Group priority", -32_768, 32_767),
    enabled: bool(row.enabled),
  };
}

function databaseUuid(value: unknown, field: string) {
  const parsed = String(value ?? "").trim().toLowerCase();
  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/.test(parsed)) {
    fail("invalid_database_value", `${field} is invalid.`);
  }
  return parsed;
}

function toListing(
  row: ListingRow,
  vipScope?: IdentityGroupListingVipScope | null,
): IdentityGroupListing {
  if (row.catalogue_id === null) {
    fail("invalid_database_value", "A group listing has no inventory catalogue item.");
  }
  return {
    id: integer(row.listing_id, "Listing ID", 1),
    groupId: integer(row.group_id, "Group ID", 1),
    catalogueId: integer(row.catalogue_id, "Catalogue ID", 1),
    listingName: row.listing_name,
    description: row.listing_description,
    durationMinutes: integer(
      row.duration_minutes,
      "Listing duration",
      0,
      MAX_GROUP_LISTING_DURATION_MINUTES,
    ),
    euroPriceCents: integer(row.euro_price_cents, "EUR price", 1, MAX_GROUP_LISTING_PRICE),
    tokenPrice: integer(row.token_price, "Token price", 1, MAX_GROUP_LISTING_PRICE),
    vipPageEnabled: bool(row.vip_page_enabled),
    marketEnabled: bool(row.market_enabled),
    enabled: bool(row.listing_enabled),
    sortOrder: integer(row.sort_order, "Sort order", -1_000_000, 1_000_000),
    createdAt: iso(row.created_at),
    updatedAt: iso(row.updated_at),
    arenaScopeUuid: row.arena_scope_uuid
      ? databaseUuid(row.arena_scope_uuid, "Arena scope UUID")
      : null,
    vipScope: vipScope ?? null,
    group: toGroup(row),
  };
}

function arenaGroupType(sourceType: IdentityGroupSource): ArenaCatalogueTarget["arenaGroupType"] {
  if (sourceType === "admins_core") return "admin";
  if (sourceType === "vipcore") return "vip";
  return "custom";
}

export async function getIdentityGroupListingVipScopes(): Promise<IdentityGroupListingVipScope[]> {
  const pool = getGameDatabasePool();
  if (!pool) return [];
  const [rows] = await pool.query<ArenaVipScopeRow[]>(
    "SELECT scope.vip_server_id AS server_id, scope.scope_uuid, scope.display_name, " +
      "COUNT(identity_group.id) AS definition_count " +
      "FROM arena_scopes AS scope " +
      "LEFT JOIN arena_group_scopes AS group_scope ON group_scope.scope_id = scope.id AND group_scope.enabled = TRUE " +
      "LEFT JOIN arena_groups AS identity_group ON identity_group.id = group_scope.group_id " +
      "AND identity_group.group_type = 'vip' AND identity_group.enabled = TRUE " +
      "WHERE scope.enabled = TRUE AND scope.vip_server_id IS NOT NULL " +
      "GROUP BY scope.id, scope.vip_server_id, scope.scope_uuid, scope.display_name " +
      "ORDER BY scope.vip_server_id",
  );
  return rows.map((row) => {
    const serverId = integer(row.server_id, "VIP server ID");
    const definitionCount = integer(row.definition_count, "VIP definition count");
    return {
      serverId,
      scopeUuid: databaseUuid(row.scope_uuid, "Arena scope UUID"),
      label: serverId === 0
        ? "Shared / all Arena servers"
        : String(row.display_name).trim() || `Arena server ${serverId}`,
      description: definitionCount > 0
        ? `${definitionCount} VIP tier definition${definitionCount === 1 ? "" : "s"}`
        : "No enabled VIP tier definitions",
      hasDefinitions: definitionCount > 0,
    };
  });
}

async function resolveArenaCatalogueTarget(
  group: Pick<GroupRow, "id" | "source_type">,
  requestedVipServerId: number,
): Promise<ArenaCatalogueTarget> {
  const pool = getGameDatabasePool();
  if (!pool) {
    fail("arena_storage_unavailable", "The Arena group database is not configured.");
  }
  const portalGroupId = integer(group.id, "Group ID", 1);
  const vipServerId = group.source_type === "vipcore" ? requestedVipServerId : 0;
  const [rows] = await pool.query<ArenaCatalogueTargetRow[]>(
    "SELECT identity_group.group_uuid, identity_group.group_key, identity_group.group_type, " +
      "identity_group.vip_family_key, identity_group.display_name, " +
      "COALESCE(group_scope.rank_weight_override, identity_group.rank_weight) AS rank_weight, " +
      "identity_group.row_version, scope.scope_uuid, scope.vip_server_id, scope.display_name AS scope_display_name " +
      "FROM arena_groups AS identity_group " +
      "INNER JOIN arena_group_scopes AS group_scope ON group_scope.group_id = identity_group.id AND group_scope.enabled = TRUE " +
      "INNER JOIN arena_scopes AS scope ON scope.id = group_scope.scope_id AND scope.enabled = TRUE " +
      "WHERE identity_group.legacy_portal_group_id = ? AND identity_group.group_type = ? " +
      "AND identity_group.enabled = TRUE AND scope.vip_server_id = ? " +
      "ORDER BY scope.id LIMIT 2",
    [portalGroupId, arenaGroupType(group.source_type), vipServerId],
  );
  const row = rows[0];
  if (!row) {
    fail(
      "vip_scope_unavailable",
      group.source_type === "vipcore"
        ? "That VIP tier is not enabled for the selected Arena server."
        : "That connected group has no enabled global Arena target.",
    );
  }
  if (rows.length > 1) {
    fail("arena_target_conflict", "That group has multiple Arena targets for the selected server.");
  }
  return {
    arenaGroupUuid: databaseUuid(row.group_uuid, "Arena group UUID"),
    arenaGroupKey: String(row.group_key),
    arenaGroupType: row.group_type,
    vipFamilyKey: row.vip_family_key,
    displayName: row.display_name,
    rankWeight: integer(row.rank_weight, "Arena rank weight", -2_147_483_648, 2_147_483_647),
    arenaGroupRowVersion: integer(row.row_version, "Arena group version", 1),
    arenaScopeUuid: databaseUuid(row.scope_uuid, "Arena scope UUID"),
    vipServerId: integer(row.vip_server_id, "VIP server ID"),
    scopeDisplayName: String(row.scope_display_name).trim() || `Arena server ${vipServerId}`,
  };
}

function nullableRecord(value: unknown): Record<string, unknown> | null {
  if (typeof value === "string") {
    try {
      const parsed = JSON.parse(value) as unknown;
      return parsed && typeof parsed === "object" && !Array.isArray(parsed)
        ? parsed as Record<string, unknown>
        : null;
    } catch {
      return null;
    }
  }
  return value && typeof value === "object" && !Array.isArray(value)
    ? value as Record<string, unknown>
    : null;
}

function requestHash(value: unknown) {
  return createHash("sha256").update(JSON.stringify(value)).digest("hex");
}

async function withListingMutation<T extends Record<string, unknown>>(input: {
  operationName: string;
  actor: GroupListingActor;
  requestKey: string;
  request: unknown;
  work: (connection: PoolConnection, actorSteamId: string, operationKey: string) => Promise<T>;
}) {
  const pool = getPortalDatabasePool();
  if (!pool) fail("storage_unavailable", "Portal listing storage is not configured.");
  const actorSteamId = requireFounder(input.actor);
  const operationKey = requestKey(input.requestKey);
  const hash = requestHash({
    operationName: input.operationName,
    actorSteamId,
    request: input.request,
  });
  const connection = await pool.getConnection();
  let transactionStarted = false;
  let catalogueLockAcquired = false;
  try {
    catalogueLockAcquired =
      await acquireIdentityCatalogueMutationLock(connection);
    if (!catalogueLockAcquired) {
      fail(
        "operation_unavailable",
        "The connected-group catalogue is busy. Retry this action shortly.",
      );
    }
    await connection.beginTransaction();
    transactionStarted = true;
    const [insert] = await connection.execute<ResultSetHeader>(
      "INSERT IGNORE INTO portal_economy_operations (operation_name, idempotency_key, actor_steam_id, request_hash) VALUES (?, ?, ?, ?)",
      [input.operationName, operationKey, actorSteamId, hash],
    );
    const [rows] = await connection.query<OperationRow[]>(
      "SELECT id, operation_name, actor_steam_id, request_hash, status, result_json FROM portal_economy_operations WHERE idempotency_key = ? FOR UPDATE",
      [operationKey],
    );
    const operation = rows[0];
    if (!operation) fail("operation_unavailable", "The listing operation could not be locked.");
    if (
      operation.operation_name !== input.operationName ||
      operation.actor_steam_id !== actorSteamId ||
      operation.request_hash !== hash
    ) {
      fail("idempotency_conflict", "This request key was already used for another action.");
    }
    if (operation.status === "completed") {
      const saved = nullableRecord(operation.result_json);
      if (!saved) fail("invalid_database_value", "The saved listing result is invalid.");
      await connection.commit();
      transactionStarted = false;
      return saved as T;
    }
    if (insert.affectedRows !== 1) {
      fail("operation_in_progress", "That listing update is already in progress.");
    }
    const result = await input.work(connection, actorSteamId, operationKey);
    await connection.execute(
      "UPDATE portal_economy_operations SET status = 'completed', result_json = ?, completed_at = CURRENT_TIMESTAMP WHERE id = ?",
      [JSON.stringify(result), integer(operation.id, "Operation ID", 1)],
    );
    await connection.commit();
    transactionStarted = false;
    return result;
  } catch (error) {
    if (transactionStarted) {
      try { await connection.rollback(); } catch { /* Preserve the original error. */ }
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

async function lockGroup(connection: PoolConnection, groupId: number) {
  const [rows] = await connection.query<GroupRow[]>(
    groupSelect + "FROM portal_identity_groups AS identity_group WHERE identity_group.id = ? LIMIT 1 FOR UPDATE",
    [groupId],
  );
  if (!rows[0]) fail("group_not_found", "That connected group no longer exists.");
  return rows[0];
}

async function resolveListingLockTarget(
  connection: PoolConnection,
  listingId: number,
) {
  const [rows] = await connection.query<ListingLockTargetRow[]>(
    "SELECT group_id, catalogue_id FROM portal_identity_group_listings WHERE id = ? LIMIT 1",
    [listingId],
  );
  const row = rows[0];
  if (!row || row.catalogue_id === null) {
    fail("listing_not_found", "That listing no longer exists.");
  }
  return {
    groupId: integer(row.group_id, "Group ID", 1),
    catalogueId: integer(row.catalogue_id, "Catalogue ID", 1),
  };
}

async function lockListingCatalogueProjection(
  connection: PoolConnection,
  catalogueId: number,
) {
  const [rows] = await connection.query<Array<RowDataPacket & { id: number | string }>>(
    "SELECT catalogue.id FROM portal_economy_catalogue AS catalogue " +
      "LEFT JOIN portal_economy_catalogue_prices AS price ON price.catalogue_id = catalogue.id AND price.is_current = TRUE " +
      "WHERE catalogue.id = ? LIMIT 1 FOR UPDATE",
    [catalogueId],
  );
  if (!rows[0]) {
    fail("listing_not_found", "That listing's catalogue projection no longer exists.");
  }
}

async function requireScopeChangeHasNoOutstandingItems(
  connection: PoolConnection,
  catalogueId: number,
) {
  const [rows] = await connection.query<Array<RowDataPacket & { item_count: number | string }>>(
    "SELECT COUNT(*) AS item_count FROM portal_inventory_items " +
      "WHERE catalogue_id = ? AND state IN ('available', 'escrowed', 'attached', 'activation_pending')",
    [catalogueId],
  );
  if (integer(rows[0]?.item_count ?? 0, "Outstanding item count") > 0) {
    fail(
      "vip_scope_has_inventory",
      "This listing has unconsumed items. Retire it and create a server-specific listing so existing packages keep their original destination.",
    );
  }
}

function isFounderGroup(group: Pick<GroupRow, "source_type" | "external_key">) {
  return group.source_type === "admins_core" &&
    group.external_key?.trim().toLocaleLowerCase("en-US") === "founder";
}

async function requireCurrentExternalDefinition(
  connection: PoolConnection,
  group: Pick<GroupRow, "id" | "source_type" | "external_key">,
) {
  if (group.source_type === "custom") return;
  const [rows] = await connection.query<Array<RowDataPacket & { group_id: number | string }>>(
    "SELECT group_id FROM portal_identity_external_group_definitions " +
      "WHERE group_id = ? AND source_type = ? AND external_key = ? LIMIT 1 FOR UPDATE",
    [group.id, group.source_type, group.external_key],
  );
  if (!rows[0]) {
    fail(
      "external_group_unavailable",
      "This external group is no longer present in the current Admins.Core or VIPCore definitions.",
    );
  }
}

function defaultArtwork(group: GroupRow) {
  if (group.source_type !== "vipcore" || !group.external_key) return null;
  const key = group.external_key.trim().toLocaleLowerCase("en-US");
  return ["standard", "silver", "gold", "diamond", "ultimate"].includes(key)
    ? `/images/economy/vip/${key}.png`
    : null;
}

function catalogueMetadata(input: {
  listingId: number;
  group: GroupRow;
  target: ArenaCatalogueTarget;
  listingName: string;
  description: string | null;
  durationMinutes: number;
  euroPriceCents: number;
  tokenPrice: number;
  vipPageEnabled: boolean;
  marketEnabled: boolean;
  enabled: boolean;
  existing?: Record<string, unknown> | null;
}) {
  const metadata: Record<string, unknown> = {
    ...(input.existing ?? {}),
    source: "ARENA Portal",
    specialKind: "vip_membership",
    customProduct: true,
    membershipListingManaged: true,
    membershipListingId: input.listingId,
    membershipGroupId: integer(input.group.id, "Group ID", 1),
    membershipGroupKey: input.target.arenaGroupKey,
    membershipGroupName: input.group.display_name,
    membershipSourceType: input.group.source_type,
    membershipExternalKey: input.group.external_key,
    membershipDurationMinutes: input.durationMinutes,
    membershipScopeUuid: input.target.arenaScopeUuid,
    membershipVipServerId: input.target.vipServerId,
    membershipServerName: input.target.scopeDisplayName,
    donationEnabled: input.enabled && input.vipPageEnabled,
    donationPriceEuroCents: input.euroPriceCents,
    marketEnabled: input.enabled && input.marketEnabled,
    marketTokenPrice: input.tokenPrice,
    description: input.description ?? `Activates ${input.group.display_name} membership.`,
  };
  // Legacy builds snapshotted a conversion face value here. Live-rate
  // conversion intentionally resolves the canonical listing schedule at use.
  delete metadata.membershipConversionValueTokens;
  const artwork = metadata.staffArtworkUrl ?? metadata.imageUrl ?? defaultArtwork(input.group);
  if (artwork) metadata.imageUrl = artwork;
  if (input.group.source_type === "vipcore" && input.group.external_key) {
    metadata.vipTier = input.group.external_key;
    metadata.vipDurationMinutes = input.durationMinutes;
  } else {
    delete metadata.vipTier;
    delete metadata.vipDurationMinutes;
  }
  return metadata;
}

function catalogueTargetSnapshot(input: {
  listingId: number;
  group: GroupRow;
  target: ArenaCatalogueTarget;
  durationMinutes: number;
}) {
  return {
    schemaVersion: 1,
    legacyPortalGroupId: integer(input.group.id, "Group ID", 1),
    listingId: input.listingId,
    arenaGroupUuid: input.target.arenaGroupUuid,
    arenaGroupKey: input.target.arenaGroupKey,
    arenaScopeUuid: input.target.arenaScopeUuid,
    groupType: input.target.arenaGroupType,
    vipFamilyKey: input.target.vipFamilyKey,
    displayName: input.target.displayName,
    rankWeight: input.target.rankWeight,
    arenaGroupRowVersion: input.target.arenaGroupRowVersion,
    durationMinutes: input.durationMinutes,
  };
}

async function writeCatalogueTarget(input: {
  connection: PoolConnection;
  listingId: number;
  catalogueId: number;
  group: GroupRow;
  target: ArenaCatalogueTarget;
  durationMinutes: number;
  enabled: boolean;
}) {
  const snapshot = catalogueTargetSnapshot(input);
  await input.connection.execute(
    "INSERT INTO portal_arena_group_catalogue_targets " +
      "(catalogue_id, listing_id, legacy_portal_group_id, arena_group_uuid, arena_group_key, arena_scope_uuid, arena_group_type, arena_group_row_version, duration_minutes, target_snapshot, enabled) " +
      "VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?) " +
      "ON DUPLICATE KEY UPDATE listing_id = VALUES(listing_id), legacy_portal_group_id = VALUES(legacy_portal_group_id), " +
      "arena_group_uuid = VALUES(arena_group_uuid), arena_group_key = VALUES(arena_group_key), arena_scope_uuid = VALUES(arena_scope_uuid), " +
      "arena_group_type = VALUES(arena_group_type), arena_group_row_version = VALUES(arena_group_row_version), " +
      "duration_minutes = VALUES(duration_minutes), target_snapshot = VALUES(target_snapshot), enabled = VALUES(enabled)",
    [
      input.catalogueId,
      input.listingId,
      integer(input.group.id, "Group ID", 1),
      input.target.arenaGroupUuid,
      input.target.arenaGroupKey,
      input.target.arenaScopeUuid,
      input.target.arenaGroupType,
      input.target.arenaGroupRowVersion,
      input.durationMinutes,
      JSON.stringify(snapshot),
      input.enabled,
    ],
  );
  const [rows] = await input.connection.query<Array<RowDataPacket & {
    listing_id: number | string | null;
    arena_group_uuid: string;
    arena_scope_uuid: string;
  }>>(
    "SELECT listing_id, arena_group_uuid, arena_scope_uuid " +
      "FROM portal_arena_group_catalogue_targets WHERE catalogue_id = ? LIMIT 1 FOR UPDATE",
    [input.catalogueId],
  );
  const saved = rows[0];
  if (
    !saved ||
    integer(saved.listing_id, "Target listing ID", 1) !== input.listingId ||
    String(saved.arena_group_uuid).toLowerCase() !== input.target.arenaGroupUuid ||
    String(saved.arena_scope_uuid).toLowerCase() !== input.target.arenaScopeUuid
  ) {
    fail("arena_target_conflict", "The catalogue is already connected to another Arena target.");
  }
}

async function writeProjection(input: {
  connection: PoolConnection;
  listingId: number;
  catalogueId: number;
  group: GroupRow;
  target: ArenaCatalogueTarget;
  listingName: string;
  description: string | null;
  durationMinutes: number;
  euroPriceCents: number;
  tokenPrice: number;
  vipPageEnabled: boolean;
  marketEnabled: boolean;
  enabled: boolean;
  existingMetadata?: Record<string, unknown> | null;
}) {
  const metadata = catalogueMetadata({
    listingId: input.listingId,
    group: input.group,
    target: input.target,
    listingName: input.listingName,
    description: input.description,
    durationMinutes: input.durationMinutes,
    euroPriceCents: input.euroPriceCents,
    tokenPrice: input.tokenPrice,
    vipPageEnabled: input.vipPageEnabled,
    marketEnabled: input.marketEnabled,
    enabled: input.enabled,
    existing: input.existingMetadata,
  });
  await input.connection.execute(
    "UPDATE portal_economy_catalogue SET item_type = 'vip_membership', rarity_rank = 8, display_name = ?, metadata = ?, enabled = TRUE WHERE id = ?",
    [input.listingName, JSON.stringify(metadata), input.catalogueId],
  );
  await input.connection.execute(
    "UPDATE portal_economy_catalogue_prices SET is_current = FALSE WHERE catalogue_id = ? AND is_current = TRUE",
    [input.catalogueId],
  );
  const projectedPrice = input.marketEnabled ? input.tokenPrice : input.euroPriceCents;
  await input.connection.execute(
    "INSERT INTO portal_economy_catalogue_prices (catalogue_id, market_price_eur_cents, price_source, source_reference, is_current) VALUES (?, ?, ?, ?, TRUE)",
    [
      input.catalogueId,
      projectedPrice,
      input.marketEnabled ? "group-listing-token" : "group-listing-eur",
      `Identity group listing ${input.listingId}`,
    ],
  );
  await writeCatalogueTarget(input);
}

function listingInput(input: {
  listingName: string;
  description?: string | null;
  durationMinutes: number;
  euroPriceCents: number;
  tokenPrice: number;
  vipPageEnabled: boolean;
  marketEnabled: boolean;
  enabled: boolean;
  sortOrder?: number;
}) {
  return {
    listingName: text(input.listingName, "Listing name", 180),
    description: optionalText(input.description, "Listing description", 255),
    durationMinutes: integer(
      input.durationMinutes,
      "Duration",
      0,
      MAX_GROUP_LISTING_DURATION_MINUTES,
    ),
    euroPriceCents: integer(input.euroPriceCents, "EUR price", 1, MAX_GROUP_LISTING_PRICE),
    tokenPrice: integer(input.tokenPrice, "Token price", 1, MAX_GROUP_LISTING_PRICE),
    vipPageEnabled: input.vipPageEnabled === true,
    marketEnabled: input.marketEnabled === true,
    enabled: input.enabled === true,
    sortOrder: integer(input.sortOrder ?? 0, "Sort order", -1_000_000, 1_000_000),
  };
}

export function identityGroupListingStorageConfigured() {
  return Boolean(process.env.PORTAL_DATABASE_URL);
}

export function isMissingIdentityGroupListingSchemaError(error: unknown) {
  const candidate = error as { code?: unknown; errno?: unknown; message?: unknown };
  return candidate?.code === "ER_NO_SUCH_TABLE" || candidate?.errno === 1146 ||
    (typeof candidate?.message === "string" && candidate.message.includes("portal_identity_group_listings"));
}

export async function getIdentityGroupListingAdminSnapshot(): Promise<IdentityGroupListingAdminSnapshot> {
  const pool = getPortalDatabasePool();
  if (!pool) return { groups: [], listings: [], vipScopes: [] };
  const [[groups], [listings], vipScopes] = await Promise.all([
    pool.query<GroupRow[]>(
      groupSelect +
        "FROM portal_identity_groups AS identity_group " +
        "LEFT JOIN portal_identity_external_group_definitions AS external_definition " +
        "ON external_definition.group_id = identity_group.id AND external_definition.source_type COLLATE utf8mb4_unicode_ci = identity_group.source_type COLLATE utf8mb4_unicode_ci AND external_definition.external_key COLLATE utf8mb4_unicode_ci = identity_group.external_key COLLATE utf8mb4_unicode_ci " +
        "WHERE (identity_group.source_type = 'custom' OR external_definition.group_id IS NOT NULL) " +
        "AND NOT (identity_group.source_type = 'admins_core' AND LOWER(TRIM(COALESCE(identity_group.external_key, ''))) = 'founder') " +
        "ORDER BY identity_group.enabled DESC, identity_group.source_type, identity_group.profile_priority DESC, identity_group.display_name, identity_group.id",
    ),
    pool.query<ListingRow[]>(
      listingSelect +
      "FROM portal_identity_group_listings AS listings INNER JOIN portal_identity_groups AS identity_group ON identity_group.id = listings.group_id " +
      "ORDER BY listings.sort_order, identity_group.profile_priority DESC, listings.listing_name, listings.id",
    ),
    getIdentityGroupListingVipScopes(),
  ]);
  const scopesByUuid = new Map(vipScopes.map((scope) => [scope.scopeUuid, scope]));
  return {
    groups: groups.map(toGroup),
    listings: listings.map((listing) => toListing(
      listing,
      listing.arena_scope_uuid
        ? scopesByUuid.get(String(listing.arena_scope_uuid).toLowerCase()) ?? null
        : null,
    )),
    vipScopes,
  };
}

export async function getVipPageIdentityGroupListings(): Promise<IdentityGroupListing[]> {
  const pool = getPortalDatabasePool();
  if (!pool) return [];
  const [[rows], vipScopes] = await Promise.all([
    pool.query<ListingRow[]>(
      listingSelect +
      "FROM portal_identity_group_listings AS listings INNER JOIN portal_identity_groups AS identity_group ON identity_group.id = listings.group_id " +
      "LEFT JOIN portal_identity_external_group_definitions AS external_definition ON external_definition.group_id = identity_group.id AND external_definition.source_type COLLATE utf8mb4_unicode_ci = identity_group.source_type COLLATE utf8mb4_unicode_ci AND external_definition.external_key COLLATE utf8mb4_unicode_ci = identity_group.external_key COLLATE utf8mb4_unicode_ci " +
      "WHERE listings.enabled = TRUE AND listings.vip_page_enabled = TRUE AND identity_group.enabled = TRUE " +
      "AND (identity_group.source_type = 'custom' OR external_definition.group_id IS NOT NULL) " +
      "AND NOT (identity_group.source_type = 'admins_core' AND LOWER(TRIM(COALESCE(identity_group.external_key, ''))) = 'founder') " +
      "ORDER BY listings.sort_order, identity_group.profile_priority DESC, listings.listing_name, listings.id",
    ),
    getIdentityGroupListingVipScopes(),
  ]);
  const scopesByUuid = new Map(vipScopes.map((scope) => [scope.scopeUuid, scope]));
  return rows.map((row) => toListing(
    row,
    row.arena_scope_uuid
      ? scopesByUuid.get(String(row.arena_scope_uuid).toLowerCase()) ?? null
      : null,
  ));
}

/**
 * Returns the same canonical live marketplace reference listing used when a
 * VIP item is activated. These values are advisory on the storefront; the
 * activation transaction locks and resolves them again before consuming.
 */
export async function getVipTierConversionRateListings(): Promise<IdentityGroupListing[]> {
  const pool = getPortalDatabasePool();
  if (!pool) return [];
  const [rows] = await pool.query<ListingRow[]>(
    listingSelect +
    "FROM portal_identity_group_listings AS listings INNER JOIN portal_identity_groups AS identity_group ON identity_group.id = listings.group_id " +
    "INNER JOIN portal_identity_external_group_definitions AS external_definition ON external_definition.group_id = identity_group.id AND external_definition.source_type COLLATE utf8mb4_unicode_ci = identity_group.source_type COLLATE utf8mb4_unicode_ci AND external_definition.external_key COLLATE utf8mb4_unicode_ci = identity_group.external_key COLLATE utf8mb4_unicode_ci " +
    "WHERE listings.catalogue_id IS NOT NULL AND listings.enabled = TRUE AND listings.duration_minutes > 0 AND identity_group.enabled = TRUE AND identity_group.source_type = 'vipcore' " +
    "ORDER BY identity_group.profile_priority DESC, identity_group.id ASC, listings.id ASC",
  );
  const byGroup = new Map<number, IdentityGroupListing[]>();
  for (const listing of rows.map((row) => toListing(row))) {
    const groupListings = byGroup.get(listing.groupId) ?? [];
    groupListings.push(listing);
    byGroup.set(listing.groupId, groupListings);
  }
  return [...byGroup.values()].flatMap((listings) => {
    const selected = selectPreferredVipTierRateListing(
      listings.map((listing) => ({
        listing,
        groupId: listing.groupId,
        listingId: listing.id,
        durationSeconds: BigInt(listing.durationMinutes) * 60n,
        priceTokens: BigInt(listing.tokenPrice),
        marketEnabled: listing.marketEnabled,
        enabled: listing.enabled,
      })),
    );
    return selected ? [selected.listing] : [];
  });
}

export async function getIdentityGroupListing(listingIdValue: number) {
  const listingId = integer(listingIdValue, "Listing ID", 1);
  const pool = getPortalDatabasePool();
  if (!pool) return null;
  const [rows] = await pool.query<ListingRow[]>(
    listingSelect +
    "FROM portal_identity_group_listings AS listings INNER JOIN portal_identity_groups AS identity_group ON identity_group.id = listings.group_id " +
    "LEFT JOIN portal_identity_external_group_definitions AS external_definition ON external_definition.group_id = identity_group.id AND external_definition.source_type COLLATE utf8mb4_unicode_ci = identity_group.source_type COLLATE utf8mb4_unicode_ci AND external_definition.external_key COLLATE utf8mb4_unicode_ci = identity_group.external_key COLLATE utf8mb4_unicode_ci " +
    "WHERE listings.id = ? AND (identity_group.source_type = 'custom' OR external_definition.group_id IS NOT NULL) " +
    "AND NOT (identity_group.source_type = 'admins_core' AND LOWER(TRIM(COALESCE(identity_group.external_key, ''))) = 'founder') LIMIT 1",
    [listingId],
  );
  return rows[0] ? toListing(rows[0]) : null;
}

export async function createIdentityGroupListing(input: {
  actor: GroupListingActor;
  requestKey: string;
  groupId: number;
  listingName: string;
  description?: string | null;
  durationMinutes: number;
  euroPriceCents: number;
  tokenPrice: number;
  vipPageEnabled: boolean;
  marketEnabled: boolean;
  enabled: boolean;
  sortOrder?: number;
  vipServerId?: number;
  confirmStaffAccess?: boolean;
}) {
  const groupId = integer(input.groupId, "Group ID", 1);
  const vipServerId = integer(input.vipServerId ?? 0, "VIP server ID");
  const values = listingInput(input);
  return withListingMutation({
    operationName: "identity_group_listing.create",
    actor: input.actor,
    requestKey: input.requestKey,
    request: { groupId, vipServerId, ...values, confirmStaffAccess: input.confirmStaffAccess === true },
    work: async (connection, actorSteamId, operationKey) => {
      const group = await lockGroup(connection, groupId);
      if (!bool(group.enabled)) fail("group_disabled", "Enable that group before publishing a listing.");
      if (isFounderGroup(group)) {
        fail(
          "founder_listing_forbidden",
          "Founder is an external trust anchor and cannot be sold or granted by a portal listing.",
        );
      }
      await requireCurrentExternalDefinition(connection, group);
      if (group.source_type === "admins_core" && input.confirmStaffAccess !== true) {
        fail("staff_confirmation_required", "Confirm that this listing grants game staff permissions.");
      }
      const target = await resolveArenaCatalogueTarget(group, vipServerId);
      const [listingResult] = await connection.execute<ResultSetHeader>(
        "INSERT INTO portal_identity_group_listings (group_id, arena_group_uuid, arena_group_key, arena_scope_uuid, arena_group_row_version, listing_name, description, duration_minutes, euro_price_cents, token_price, vip_page_enabled, market_enabled, enabled, sort_order, created_by_steam_id, updated_by_steam_id) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)",
        [
          groupId,
          target.arenaGroupUuid,
          target.arenaGroupKey,
          target.arenaScopeUuid,
          target.arenaGroupRowVersion,
          values.listingName,
          values.description,
          values.durationMinutes,
          values.euroPriceCents,
          values.tokenPrice,
          values.vipPageEnabled,
          values.marketEnabled,
          values.enabled,
          values.sortOrder,
          actorSteamId,
          actorSteamId,
        ],
      );
      const listingId = integer(listingResult.insertId, "Listing ID", 1);
      const metadata = catalogueMetadata({ listingId, group, target, ...values });
      const [catalogueResult] = await connection.execute<ResultSetHeader>(
        "INSERT INTO portal_economy_catalogue (catalogue_key, market_hash_name, item_type, definition_index, paintkit, rarity_rank, display_name, metadata, enabled) VALUES (?, NULL, 'vip_membership', NULL, NULL, 8, ?, ?, TRUE)",
        [`tappd:special:identity-group-listing:${listingId}`, values.listingName, JSON.stringify(metadata)],
      );
      const catalogueId = integer(catalogueResult.insertId, "Catalogue ID", 1);
      await connection.execute(
        "UPDATE portal_identity_group_listings SET catalogue_id = ? WHERE id = ?",
        [catalogueId, listingId],
      );
      await writeProjection({
        connection,
        listingId,
        catalogueId,
        group,
        target,
        ...values,
        existingMetadata: metadata,
      });
      await connection.execute(
        "INSERT INTO portal_economy_admin_audit (actor_steam_id, action, target_steam_id, target_type, target_id, idempotency_key, metadata) VALUES (?, 'identity_group_listing.created', NULL, 'group-listing', ?, ?, ?)",
        [actorSteamId, String(listingId), operationKey, JSON.stringify({ groupId, catalogueId, vipServerId: target.vipServerId, arenaScopeUuid: target.arenaScopeUuid, ...values })],
      );
      return { listingId, catalogueId };
    },
  });
}

export async function updateIdentityGroupListing(input: {
  actor: GroupListingActor;
  requestKey: string;
  listingId: number;
  listingName: string;
  description?: string | null;
  durationMinutes: number;
  euroPriceCents: number;
  tokenPrice: number;
  vipPageEnabled: boolean;
  marketEnabled: boolean;
  enabled: boolean;
  sortOrder?: number;
  vipServerId?: number;
  confirmStaffAccess?: boolean;
}) {
  const listingId = integer(input.listingId, "Listing ID", 1);
  const vipServerId = integer(input.vipServerId ?? 0, "VIP server ID");
  const values = listingInput(input);
  return withListingMutation({
    operationName: "identity_group_listing.update",
    actor: input.actor,
    requestKey: input.requestKey,
    request: { listingId, vipServerId, ...values, confirmStaffAccess: input.confirmStaffAccess === true },
    work: async (connection, actorSteamId, operationKey) => {
      // Resolve immutable relationship IDs without taking a row lock, then
      // follow the activation path's catalogue -> group -> definition ->
      // listing order. Re-read and validate everything under lock below.
      const lockTarget = await resolveListingLockTarget(connection, listingId);
      await lockListingCatalogueProjection(connection, lockTarget.catalogueId);
      const lockedGroup = await lockGroup(connection, lockTarget.groupId);
      if (values.enabled) {
        await requireCurrentExternalDefinition(connection, lockedGroup);
      }
      const [rows] = await connection.query<ListingRow[]>(
        listingSelect +
        ", catalogue.metadata AS catalogue_metadata FROM portal_identity_group_listings AS listings " +
        "INNER JOIN portal_identity_groups AS identity_group ON identity_group.id = listings.group_id " +
        "INNER JOIN portal_economy_catalogue AS catalogue ON catalogue.id = listings.catalogue_id " +
        "WHERE listings.id = ? LIMIT 1 FOR UPDATE",
        [listingId],
      );
      const current = rows[0];
      if (!current || current.catalogue_id === null) fail("listing_not_found", "That listing no longer exists.");
      const currentGroupId = integer(current.group_id, "Group ID", 1);
      const catalogueId = integer(current.catalogue_id, "Catalogue ID", 1);
      if (
        currentGroupId !== lockTarget.groupId ||
        catalogueId !== lockTarget.catalogueId
      ) {
        fail("listing_not_found", "That listing changed while it was being locked. Retry the update.");
      }
      if (!bool(current.enabled) && values.enabled && (values.vipPageEnabled || values.marketEnabled)) {
        fail("group_disabled", "Enable the connected group before publishing this listing.");
      }
      if (isFounderGroup(current) && values.enabled) {
        fail(
          "founder_listing_forbidden",
          "Founder is an external trust anchor. Disable this legacy listing; it cannot be published or activated.",
        );
      }
      if (current.source_type === "admins_core" && input.confirmStaffAccess !== true) {
        fail("staff_confirmation_required", "Confirm that this listing grants game staff permissions.");
      }
      const target = await resolveArenaCatalogueTarget(current, vipServerId);
      if (
        !current.arena_scope_uuid ||
        current.arena_scope_uuid.toLowerCase() !== target.arenaScopeUuid
      ) {
        await requireScopeChangeHasNoOutstandingItems(connection, catalogueId);
      }
      await connection.execute(
        "UPDATE portal_identity_group_listings SET arena_group_uuid = ?, arena_group_key = ?, arena_scope_uuid = ?, arena_group_row_version = ?, listing_name = ?, description = ?, duration_minutes = ?, euro_price_cents = ?, token_price = ?, vip_page_enabled = ?, market_enabled = ?, enabled = ?, sort_order = ?, updated_by_steam_id = ? WHERE id = ?",
        [
          target.arenaGroupUuid,
          target.arenaGroupKey,
          target.arenaScopeUuid,
          target.arenaGroupRowVersion,
          values.listingName,
          values.description,
          values.durationMinutes,
          values.euroPriceCents,
          values.tokenPrice,
          values.vipPageEnabled,
          values.marketEnabled,
          values.enabled,
          values.sortOrder,
          actorSteamId,
          listingId,
        ],
      );
      await writeProjection({
        connection,
        listingId,
        catalogueId,
        group: current,
        target,
        ...values,
        existingMetadata: nullableRecord(current.catalogue_metadata),
      });
      await connection.execute(
        "INSERT INTO portal_economy_admin_audit (actor_steam_id, action, target_steam_id, target_type, target_id, idempotency_key, metadata) VALUES (?, 'identity_group_listing.updated', NULL, 'group-listing', ?, ?, ?)",
        [actorSteamId, String(listingId), operationKey, JSON.stringify({ catalogueId, previous: toListing(current), next: { ...values, vipServerId: target.vipServerId, arenaScopeUuid: target.arenaScopeUuid } })],
      );
      return { listingId, catalogueId };
    },
  });
}
