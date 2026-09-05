import crypto from "node:crypto";
import mysql from "mysql2/promise";

import { buildVipScopeConsolidationPlan } from "./vip-scope-consolidation-policy.mjs";

const MOVABLE_ITEM_STATES = ["available", "escrowed", "attached", "activation_pending"];
const PORTAL_LOCK_NAME = "portal.identity.catalogue.sync";
const GAME_LOCK_NAME = "arena.vip.scope.consolidation";

function parseArguments(argv) {
  const values = new Map();
  for (const argument of argv) {
    const separator = argument.indexOf("=");
    values.set(
      separator === -1 ? argument : argument.slice(0, separator),
      separator === -1 ? true : argument.slice(separator + 1),
    );
  }
  if (values.has("--help")) return { help: true };
  const fromServerId = Number(values.get("--from") ?? 0);
  const toServerId = Number(values.get("--to") ?? process.env.GAME_VIP_SERVER_ID ?? 1);
  if (fromServerId !== 0) {
    throw new Error("--from must be 0; this command only consolidates the global VIP scope.");
  }
  if (!Number.isSafeInteger(toServerId) || toServerId < 1) {
    throw new Error("--to must be a positive single-server VIP server ID.");
  }
  const apply = values.has("--apply");
  const writersStopped = values.has("--writers-stopped");
  const confirmation = values.get("--confirm");
  const expectedConfirmation = `MOVE-VIP-SCOPE-${fromServerId}-TO-${toServerId}`;
  if (apply && confirmation !== expectedConfirmation) {
    throw new Error(
      `Apply mode requires --confirm=${expectedConfirmation}.`,
    );
  }
  if (apply && !writersStopped) {
    throw new Error("Apply mode requires --writers-stopped after portal and game membership writers are stopped.");
  }
  return { help: false, fromServerId, toServerId, apply, writersStopped };
}

function usage() {
  console.log(`Usage: node scripts/migrate-vip-scope.mjs [--from=0] [--to=1] [--apply --writers-stopped --confirm=MOVE-VIP-SCOPE-0-TO-1]

Reads GAME_DATABASE_URL and PORTAL_DATABASE_URL. The default is a read-only
preflight. Apply only after creating and verifying logical snapshots of both
databases with scripts/create-logical-snapshot.mjs. Apply also requires a
verified maintenance window with portal activation workers and game membership
writers stopped; --writers-stopped is the operator's assertion of that state.`);
}

function requiredEnvironment(name) {
  const value = String(process.env[name] ?? "").trim();
  if (!value) throw new Error(`${name} is required.`);
  return value;
}

async function connectUtc(url, label) {
  const connection = await mysql.createConnection({
    uri: url,
    supportBigNumbers: true,
    bigNumberStrings: true,
    dateStrings: true,
    timezone: "Z",
    multipleStatements: false,
  });
  await connection.query("SET SESSION time_zone = '+00:00'");
  const [[clock]] = await connection.query(
    "SELECT @@session.time_zone AS session_time_zone, " +
      "TIMESTAMPDIFF(MICROSECOND, UTC_TIMESTAMP(6), CURRENT_TIMESTAMP(6)) AS utc_offset_microseconds",
  );
  if (
    String(clock.session_time_zone) !== "+00:00" ||
    Number(clock.utc_offset_microseconds) !== 0
  ) {
    await connection.end();
    throw new Error(`${label} did not establish a UTC database session.`);
  }
  return connection;
}

function integer(value, label) {
  const parsed = Number(value);
  if (!Number.isSafeInteger(parsed)) throw new Error(`${label} is not an integer.`);
  return parsed;
}

function nullableInteger(value, label) {
  return value === null || value === undefined ? null : integer(value, label);
}

function jsonObject(value, label) {
  let parsed = value;
  if (typeof value === "string") {
    try {
      parsed = JSON.parse(value);
    } catch {
      throw new Error(`${label} is not valid JSON.`);
    }
  }
  if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
    throw new Error(`${label} is not a JSON object.`);
  }
  return { ...parsed };
}

function subscriptionKey(row) {
  return `${row.steamId}\0${row.family}`;
}

function mapSubscription(row) {
  return {
    steamId: String(row.steam_id),
    family: String(row.vip_family_key),
    status: String(row.status),
    membershipUuid: row.membership_uuid === null ? null : String(row.membership_uuid).toLowerCase(),
    groupId: nullableInteger(row.group_id, "subscription group ID"),
    tier: row.external_key === null ? null : String(row.external_key),
    rankWeight: nullableInteger(row.rank_weight, "subscription rank weight"),
    startsAt: row.starts_at,
    expiresAt: row.expires_at,
    suppressedUntil: row.legacy_suppressed_until,
    suppressedPermanently: Boolean(Number(row.legacy_suppressed_permanently ?? 0)),
    rowVersion: integer(row.row_version, "subscription row version"),
    membershipStatus: row.membership_status === null ? null : String(row.membership_status),
    membershipStartsAt: row.membership_starts_at,
    membershipExpiresAt: row.membership_expires_at,
    membershipRowVersion: nullableInteger(row.membership_row_version, "membership row version"),
    sourceInventoryItemId: row.source_inventory_item_id === null
      ? null
      : String(row.source_inventory_item_id).toLowerCase(),
  };
}

async function readScope(connection, serverId, lock) {
  const [rows] = await connection.query(
    "SELECT id, scope_uuid, scope_key, scope_type, display_name, vip_server_id, enabled " +
      "FROM arena_scopes WHERE vip_server_id = ? ORDER BY id" + (lock ? " FOR UPDATE" : ""),
    [serverId],
  );
  if (rows.length !== 1) {
    throw new Error(`Expected exactly one Arena scope for VIP server ID ${serverId}; found ${rows.length}.`);
  }
  const row = rows[0];
  if (!Boolean(Number(row.enabled))) {
    throw new Error(`Arena scope for VIP server ID ${serverId} is disabled.`);
  }
  return {
    id: integer(row.id, "scope ID"),
    scopeUuid: String(row.scope_uuid).toLowerCase(),
    scopeKey: String(row.scope_key),
    scopeType: String(row.scope_type),
    displayName: String(row.display_name),
    serverId: integer(row.vip_server_id, "scope VIP server ID"),
  };
}

async function readSubscriptions(connection, scopeId, lock) {
  const [rows] = await connection.query(
    "SELECT subscription.steam_id, subscription.scope_id, subscription.vip_family_key, " +
      "subscription.group_id, subscription.membership_uuid, subscription.status, " +
      "subscription.starts_at, subscription.expires_at, subscription.legacy_suppressed_until, " +
      "subscription.legacy_suppressed_permanently, subscription.row_version, " +
      "identity_group.external_key, COALESCE(group_scope.rank_weight_override, identity_group.rank_weight) AS rank_weight, " +
      "membership.status AS membership_status, membership.row_version AS membership_row_version, " +
      "membership.starts_at AS membership_starts_at, membership.expires_at AS membership_expires_at, " +
      "membership.source_inventory_item_id " +
      "FROM arena_vip_subscriptions AS subscription " +
      "LEFT JOIN arena_groups AS identity_group ON identity_group.id = subscription.group_id " +
      "LEFT JOIN arena_group_scopes AS group_scope ON group_scope.group_id = subscription.group_id " +
      "AND group_scope.scope_id = subscription.scope_id AND group_scope.enabled = TRUE " +
      "LEFT JOIN arena_group_memberships AS membership ON membership.membership_uuid = subscription.membership_uuid " +
      "WHERE subscription.scope_id = ? ORDER BY subscription.steam_id, subscription.vip_family_key" +
      (lock ? " FOR UPDATE" : ""),
    [scopeId],
  );
  return rows.map(mapSubscription);
}

async function readGameState(connection, input) {
  const fromScope = await readScope(connection, input.fromServerId, input.lock);
  const toScope = await readScope(connection, input.toServerId, input.lock);
  const [targetGroupRows] = await connection.query(
    "SELECT identity_group.id, identity_group.group_uuid, identity_group.group_key, " +
      "identity_group.external_key, identity_group.vip_family_key, identity_group.display_name, " +
      "identity_group.rank_weight, identity_group.row_version, identity_group.legacy_portal_group_id " +
      "FROM arena_groups AS identity_group " +
      "INNER JOIN arena_group_scopes AS group_scope ON group_scope.group_id = identity_group.id " +
      "WHERE group_scope.scope_id = ? AND identity_group.group_type = 'vip' " +
      "AND identity_group.enabled = TRUE AND group_scope.enabled = TRUE " +
      "ORDER BY identity_group.id" + (input.lock ? " FOR UPDATE" : ""),
    [toScope.id],
  );
  const targetGroups = targetGroupRows.map((row) => ({
    id: integer(row.id, "Arena group ID"),
    groupUuid: String(row.group_uuid).toLowerCase(),
    groupKey: String(row.group_key),
    externalKey: String(row.external_key),
    family: String(row.vip_family_key),
    displayName: String(row.display_name),
    rankWeight: integer(row.rank_weight, "Arena group rank weight"),
    rowVersion: integer(row.row_version, "Arena group row version"),
    legacyPortalGroupId: integer(row.legacy_portal_group_id, "legacy portal group ID"),
  }));
  const [sourceSubscriptions, targetSubscriptions] = await Promise.all([
    readSubscriptions(connection, fromScope.id, input.lock),
    readSubscriptions(connection, toScope.id, input.lock),
  ]);
  const [orphanRows] = await connection.query(
    "SELECT COUNT(*) AS row_count FROM arena_group_memberships AS membership " +
      "INNER JOIN arena_groups AS identity_group ON identity_group.id = membership.group_id " +
      "WHERE membership.scope_id = ? AND identity_group.group_type = 'vip' " +
      "AND membership.status = 'active' AND NOT EXISTS (" +
      "SELECT 1 FROM arena_vip_subscriptions AS subscription " +
      "WHERE subscription.membership_uuid = membership.membership_uuid " +
      "AND subscription.scope_id = membership.scope_id AND subscription.status = 'active')",
    [fromScope.id],
  );
  const [membershipCollisionRows] = await connection.query(
    "SELECT COUNT(*) AS row_count FROM arena_group_memberships AS source_membership " +
      "INNER JOIN arena_groups AS identity_group ON identity_group.id = source_membership.group_id " +
      "INNER JOIN arena_group_memberships AS target_membership " +
      "ON target_membership.steam_id = source_membership.steam_id " +
      "AND target_membership.group_id = source_membership.group_id " +
      "AND target_membership.scope_id = ? " +
      "WHERE source_membership.scope_id = ? AND source_membership.status = 'active' " +
      "AND identity_group.group_type = 'vip'",
    [toScope.id, fromScope.id],
  );
  const [pendingCommandRows] = await connection.query(
    "SELECT COUNT(*) AS row_count FROM arena_membership_commands " +
      "WHERE target_scope_id = ? AND status IN ('received', 'processing', 'manual_review')",
    [fromScope.id],
  );
  const [sourceDefinitionRows] = await connection.query(
    "SELECT COUNT(*) AS row_count FROM arena_group_scopes AS group_scope " +
      "INNER JOIN arena_groups AS identity_group ON identity_group.id = group_scope.group_id " +
      "WHERE group_scope.scope_id = ? AND identity_group.group_type = 'vip' " +
      "AND group_scope.enabled = TRUE",
    [fromScope.id],
  );
  const [nativeWrongScopeRows] = await connection.query(
    "SELECT COUNT(*) AS row_count FROM vip_users WHERE sid <> ?",
    [toScope.serverId],
  );
  return {
    fromScope,
    toScope,
    targetGroups,
    sourceSubscriptions,
    targetSubscriptions,
    orphanActiveMemberships: integer(orphanRows[0]?.row_count ?? 0, "orphan active membership count"),
    activeMembershipTupleCollisions: integer(
      membershipCollisionRows[0]?.row_count ?? 0,
      "active membership tuple collision count",
    ),
    pendingArenaCommands: integer(pendingCommandRows[0]?.row_count ?? 0, "pending Arena command count"),
    sourceEnabledVipDefinitions: integer(
      sourceDefinitionRows[0]?.row_count ?? 0,
      "source enabled VIP definition count",
    ),
    nativeRowsOutsideTarget: integer(nativeWrongScopeRows[0]?.row_count ?? 0, "mis-scoped native VIP count"),
  };
}

async function lockPortalVipRows(connection) {
  await connection.query(
    "SELECT listing.id FROM portal_identity_group_listings AS listing " +
      "INNER JOIN portal_identity_groups AS identity_group ON identity_group.id = listing.group_id " +
      "WHERE identity_group.source_type = 'vipcore' ORDER BY listing.id FOR UPDATE",
  );
  await connection.query(
    "SELECT target.catalogue_id FROM portal_arena_group_catalogue_targets AS target " +
      "INNER JOIN portal_economy_catalogue AS catalogue ON catalogue.id = target.catalogue_id " +
      "WHERE target.arena_group_type = 'vip' ORDER BY target.catalogue_id FOR UPDATE",
  );
  await connection.query(
    "SELECT inventory_item.id FROM portal_inventory_items AS inventory_item " +
      "INNER JOIN portal_economy_catalogue AS catalogue ON catalogue.id = inventory_item.catalogue_id " +
      "WHERE inventory_item.item_type = 'vip_membership' ORDER BY inventory_item.id FOR UPDATE",
  );
  await connection.query(
    "SELECT catalogue.id FROM portal_economy_catalogue AS catalogue " +
      "WHERE catalogue.item_type = 'vip_membership' ORDER BY catalogue.id FOR UPDATE",
  );
}

async function readPortalState(connection, input) {
  const [listingRows] = await connection.query(
    "SELECT listing.id AS listing_id, listing.group_id, listing.catalogue_id, " +
      "listing.arena_scope_uuid, listing.duration_minutes, listing.enabled AS listing_enabled, " +
      "identity_group.external_key, catalogue.metadata AS catalogue_metadata, " +
      "target.target_snapshot, target.arena_scope_uuid AS target_scope_uuid, " +
      "target.arena_group_type AS target_group_type, target.enabled AS target_enabled " +
      "FROM portal_identity_group_listings AS listing " +
      "INNER JOIN portal_identity_groups AS identity_group ON identity_group.id = listing.group_id " +
      "INNER JOIN portal_economy_catalogue AS catalogue ON catalogue.id = listing.catalogue_id " +
      "LEFT JOIN portal_arena_group_catalogue_targets AS target ON target.catalogue_id = catalogue.id " +
      "WHERE identity_group.source_type = 'vipcore' ORDER BY listing.id" +
      (input.lock ? " FOR UPDATE" : ""),
  );
  const [itemRows] = await connection.query(
      "SELECT inventory_item.id AS item_id, inventory_item.catalogue_id, inventory_item.item_type, inventory_item.state, " +
      "inventory_item.attributes, catalogue.metadata AS catalogue_metadata, listing.id AS listing_id " +
      "FROM portal_inventory_items AS inventory_item " +
      "INNER JOIN portal_economy_catalogue AS catalogue ON catalogue.id = inventory_item.catalogue_id " +
      "LEFT JOIN portal_identity_group_listings AS listing ON listing.catalogue_id = inventory_item.catalogue_id " +
      "LEFT JOIN portal_identity_groups AS identity_group ON identity_group.id = listing.group_id " +
      "WHERE inventory_item.item_type = 'vip_membership' " +
      "ORDER BY inventory_item.id" +
      (input.lock ? " FOR UPDATE" : ""),
  );
  const [pendingRows] = await connection.query(
    "SELECT status, COUNT(*) AS row_count FROM portal_membership_activation_jobs " +
      "WHERE status NOT IN ('completed', 'rejected', 'manual_review') GROUP BY status" +
      (input.lock ? " FOR UPDATE" : ""),
  );
  const [[relationshipRows]] = await connection.query(
    "SELECT " +
      "(SELECT COUNT(*) FROM portal_arena_group_catalogue_targets AS target " +
      " LEFT JOIN portal_identity_group_listings AS listing ON listing.id = target.listing_id " +
      " LEFT JOIN portal_identity_groups AS identity_group ON identity_group.id = listing.group_id " +
      " WHERE target.arena_group_type = 'vip' AND (listing.id IS NULL " +
      " OR NOT (listing.catalogue_id <=> target.catalogue_id) " +
      " OR NOT (identity_group.source_type <=> 'vipcore'))) AS invalid_vip_targets, " +
      "(SELECT COUNT(*) FROM portal_economy_catalogue AS catalogue " +
      " LEFT JOIN portal_arena_group_catalogue_targets AS target ON target.catalogue_id = catalogue.id " +
      " LEFT JOIN portal_identity_group_listings AS listing ON listing.catalogue_id = catalogue.id " +
      " LEFT JOIN portal_identity_groups AS identity_group ON identity_group.id = listing.group_id " +
      " WHERE catalogue.item_type = 'vip_membership' AND (target.catalogue_id IS NULL " +
      " OR NOT (target.arena_group_type <=> 'vip') OR listing.id IS NULL " +
      " OR NOT (target.listing_id <=> listing.id) " +
      " OR NOT (identity_group.source_type <=> 'vipcore'))) AS invalid_vip_catalogues",
  );
  return {
    listings: listingRows.map((row) => ({
      listingId: integer(row.listing_id, "listing ID"),
      portalGroupId: integer(row.group_id, "listing group ID"),
      catalogueId: integer(row.catalogue_id, "catalogue ID"),
      scopeUuid: row.arena_scope_uuid === null ? null : String(row.arena_scope_uuid).toLowerCase(),
      targetScopeUuid: row.target_scope_uuid === null ? null : String(row.target_scope_uuid).toLowerCase(),
      targetGroupType: row.target_group_type === null ? null : String(row.target_group_type),
      durationMinutes: integer(row.duration_minutes, "listing duration"),
      externalKey: String(row.external_key),
      catalogueMetadata: jsonObject(row.catalogue_metadata, "catalogue metadata"),
      targetSnapshot: row.target_snapshot === null
        ? null
        : jsonObject(row.target_snapshot, "catalogue target snapshot"),
      listingEnabled: Boolean(Number(row.listing_enabled)),
      targetEnabled: Boolean(Number(row.target_enabled)),
    })),
    inventoryItems: itemRows.map((row) => {
      const attributes = jsonObject(row.attributes, "inventory item attributes");
      const catalogueMetadata = jsonObject(row.catalogue_metadata, "inventory catalogue metadata");
      const scopeUuid = typeof attributes.membershipScopeUuid === "string"
        ? attributes.membershipScopeUuid.toLowerCase()
        : null;
      return {
        itemId: String(row.item_id).toLowerCase(),
        catalogueId: integer(row.catalogue_id, "inventory item catalogue ID"),
        itemType: String(row.item_type),
        listingId: nullableInteger(row.listing_id, "inventory item listing ID"),
        state: String(row.state),
        scopeUuid,
        attributes,
        catalogueMetadata,
      };
    }),
    pendingActivationJobs: pendingRows.reduce(
      (total, row) => total + integer(row.row_count, "pending activation job count"),
      0,
    ),
    invalidVipTargets: integer(relationshipRows.invalid_vip_targets, "invalid VIP target count"),
    invalidVipCatalogues: integer(
      relationshipRows.invalid_vip_catalogues,
      "invalid VIP catalogue count",
    ),
  };
}

function buildPlan(gameState, portalState) {
  const plan = buildVipScopeConsolidationPlan({
    currentTime: new Date().toISOString(),
    fromScope: gameState.fromScope,
    toScope: gameState.toScope,
    targetGroupIds: gameState.targetGroups.map((group) => group.id),
    sourceSubscriptions: gameState.sourceSubscriptions,
    targetSubscriptions: gameState.targetSubscriptions,
    listings: portalState.listings,
    inventoryItems: portalState.inventoryItems,
    pendingActivationJobs: portalState.pendingActivationJobs,
  });
  if (gameState.orphanActiveMemberships > 0) {
    plan.blockers.push(
      `${gameState.orphanActiveMemberships} active source-scope VIP membership(s) have no active subscription.`,
    );
  }
  if (gameState.activeMembershipTupleCollisions > 0) {
    plan.blockers.push(
      `${gameState.activeMembershipTupleCollisions} active source membership tuple(s) already exist in the destination.`,
    );
  }
  if (gameState.pendingArenaCommands > 0) {
    plan.blockers.push(
      `${gameState.pendingArenaCommands} Arena membership command(s) can still write the source scope.`,
    );
  }
  if (gameState.nativeRowsOutsideTarget > 0) {
    plan.blockers.push(
      `${gameState.nativeRowsOutsideTarget} native vip_users row(s) are outside the requested destination scope.`,
    );
  }
  if (portalState.invalidVipTargets > 0) {
    plan.blockers.push(
      `${portalState.invalidVipTargets} VIP catalogue target(s) have a missing or mismatched managed listing.`,
    );
  }
  if (portalState.invalidVipCatalogues > 0) {
    plan.blockers.push(
      `${portalState.invalidVipCatalogues} VIP catalogue item(s) have a missing or mismatched target/listing relationship.`,
    );
  }
  const mappings = new Map(
    gameState.targetGroups.map((group) => [group.legacyPortalGroupId, group]),
  );
  for (const listing of portalState.listings) {
    if (plan.listingIds.includes(listing.listingId) && !mappings.has(listing.portalGroupId)) {
      plan.blockers.push(
        `Listing ${listing.listingId} has no enabled matching VIP tier in the destination scope.`,
      );
    }
  }
  return plan;
}

function reportFor(options, gameState, portalState, plan) {
  return {
    mode: options.apply ? "apply" : "dry-run",
    source: {
      serverId: gameState.fromScope.serverId,
      scopeUuid: gameState.fromScope.scopeUuid,
    },
    destination: {
      serverId: gameState.toScope.serverId,
      scopeUuid: gameState.toScope.scopeUuid,
      displayName: gameState.toScope.displayName,
    },
    plan: {
      activeSubscriptionsToMove: plan.subscriptionMoves.length,
      collisionsKeepingStrongerDestination: plan.collisionResolutions.length,
      redundantEndedSourceSubscriptions: plan.redundantSourceSubscriptions.length,
      listingsToRetarget: plan.listingIds.length,
      unconsumedItemsToRetarget: plan.inventoryItemIds.length,
      sourceVipDefinitionLinksToDisable: gameState.sourceEnabledVipDefinitions,
    },
    observed: {
      sourceSubscriptions: gameState.sourceSubscriptions.length,
      targetSubscriptions: gameState.targetSubscriptions.length,
      managedVipListings: portalState.listings.length,
      managedVipInventoryItems: portalState.inventoryItems.length,
      invalidVipTargets: portalState.invalidVipTargets,
      invalidVipCatalogues: portalState.invalidVipCatalogues,
      pendingActivationJobs: portalState.pendingActivationJobs,
      pendingArenaCommands: gameState.pendingArenaCommands,
      nativeRowsOutsideTarget: gameState.nativeRowsOutsideTarget,
    },
    blockers: plan.blockers,
  };
}

async function acquireNamedLock(connection, name) {
  const [[row]] = await connection.query("SELECT GET_LOCK(?, 15) AS acquired", [name]);
  if (Number(row?.acquired) !== 1) throw new Error(`Could not acquire database lock ${name}.`);
}

async function releaseNamedLock(connection, name) {
  await connection.query("SELECT RELEASE_LOCK(?)", [name]);
}

async function requireOne(result, label) {
  if (Number(result.affectedRows) !== 1) {
    throw new Error(`${label} changed concurrently; expected one affected row, got ${result.affectedRows}.`);
  }
}

async function writeMigrationHistory(connection, input) {
  await connection.execute(
    "INSERT INTO arena_vip_subscription_history " +
      "(transition_uuid, steam_id, scope_id, vip_family_key, action, from_group_id, to_group_id, " +
      "membership_uuid, command_uuid, source_inventory_item_id, actor_steam_id, before_expires_at, " +
      "after_expires_at, metadata) VALUES (?, ?, ?, ?, ?, ?, ?, ?, NULL, ?, NULL, ?, ?, ?)",
    [
      crypto.randomUUID().toLowerCase(),
      input.steamId,
      input.scopeId,
      input.family,
      input.action,
      input.fromGroupId,
      input.toGroupId,
      input.membershipUuid,
      input.sourceInventoryItemId,
      input.beforeExpiresAt,
      input.afterExpiresAt,
      JSON.stringify(input.metadata),
    ],
  );
}

async function detachSourceSubscription(connection, source, sourceScopeId) {
  const [result] = await connection.execute(
    "UPDATE arena_vip_subscriptions SET group_id = NULL, membership_uuid = NULL, " +
      "status = 'ended', starts_at = NULL, expires_at = NULL, last_command_uuid = NULL, " +
      "row_version = row_version + 1 WHERE steam_id = ? AND scope_id = ? " +
      "AND vip_family_key = ? AND status = 'active' AND membership_uuid = ? AND row_version = ?",
    [source.steamId, sourceScopeId, source.family, source.membershipUuid, source.rowVersion],
  );
  await requireOne(result, "Source VIP subscription");
}

async function applyGamePlan(connection, state, plan) {
  const destinationByKey = new Map(
    state.targetSubscriptions.map((subscription) => [subscriptionKey(subscription), subscription]),
  );
  for (const source of plan.subscriptionMoves) {
    await detachSourceSubscription(connection, source, state.fromScope.id);
    const [membershipResult] = await connection.execute(
      "UPDATE arena_group_memberships SET scope_id = ?, grant_reason = 'Moved from global VIP scope by migration', " +
        "row_version = row_version + 1 WHERE membership_uuid = ? AND scope_id = ? " +
        "AND group_id = ? AND steam_id = ? AND status = 'active' AND row_version = ?",
      [
        state.toScope.id,
        source.membershipUuid,
        state.fromScope.id,
        source.groupId,
        source.steamId,
        source.membershipRowVersion,
      ],
    );
    await requireOne(membershipResult, "Source VIP membership");
    const [subscriptionResult] = await connection.execute(
      "UPDATE arena_vip_subscriptions SET scope_id = ?, group_id = ?, group_type = 'vip', membership_uuid = ?, " +
        "status = 'active', starts_at = ?, expires_at = ?, legacy_suppressed_until = ?, " +
        "legacy_suppressed_permanently = ?, last_command_uuid = NULL, row_version = row_version + 1 " +
        "WHERE steam_id = ? AND scope_id = ? AND vip_family_key = ? AND status = 'ended' " +
        "AND group_id IS NULL AND membership_uuid IS NULL",
      [
        state.toScope.id,
        source.groupId,
        source.membershipUuid,
        source.startsAt,
        source.expiresAt,
        source.suppressedUntil,
        source.suppressedPermanently,
        source.steamId,
        state.fromScope.id,
        source.family,
      ],
    );
    await requireOne(subscriptionResult, "Re-scoped VIP subscription");
    await writeMigrationHistory(connection, {
      steamId: source.steamId,
      scopeId: state.toScope.id,
      family: source.family,
      action: "migration.scope_moved",
      fromGroupId: source.groupId,
      toGroupId: source.groupId,
      membershipUuid: source.membershipUuid,
      sourceInventoryItemId: source.sourceInventoryItemId,
      beforeExpiresAt: source.expiresAt,
      afterExpiresAt: source.expiresAt,
      metadata: {
        fromScopeId: state.fromScope.id,
        fromScopeUuid: state.fromScope.scopeUuid,
        toScopeId: state.toScope.id,
        toScopeUuid: state.toScope.scopeUuid,
      },
    });
  }

  for (const resolution of plan.collisionResolutions) {
    const source = state.sourceSubscriptions.find(
      (subscription) =>
        subscription.steamId === resolution.steamId &&
        subscription.family === resolution.family,
    );
    const target = destinationByKey.get(`${resolution.steamId}\0${resolution.family}`);
    if (!source || !target) throw new Error("A planned VIP collision disappeared.");
    await detachSourceSubscription(connection, source, state.fromScope.id);
    const [membershipResult] = await connection.execute(
      "UPDATE arena_group_memberships SET scope_id = ?, status = 'superseded', " +
        "revoked_at = CURRENT_TIMESTAMP(6), revoked_by_actor = 'migration:vip-scope', " +
        "revoke_reason = 'Stronger permanent server membership retained during scope migration', " +
        "row_version = row_version + 1 WHERE membership_uuid = ? AND scope_id = ? " +
        "AND status = 'active' AND row_version = ?",
      [state.toScope.id, source.membershipUuid, state.fromScope.id, source.membershipRowVersion],
    );
    await requireOne(membershipResult, "Colliding source VIP membership");
    const [deleteResult] = await connection.execute(
      "DELETE FROM arena_vip_subscriptions WHERE steam_id = ? AND scope_id = ? " +
        "AND vip_family_key = ? AND status = 'ended' AND membership_uuid IS NULL",
      [source.steamId, state.fromScope.id, source.family],
    );
    await requireOne(deleteResult, "Redundant colliding source subscription");
    await writeMigrationHistory(connection, {
      steamId: source.steamId,
      scopeId: state.toScope.id,
      family: source.family,
      action: "migration.scope_superseded",
      fromGroupId: source.groupId,
      toGroupId: target.groupId,
      membershipUuid: source.membershipUuid,
      sourceInventoryItemId: source.sourceInventoryItemId,
      beforeExpiresAt: source.expiresAt,
      afterExpiresAt: target.expiresAt,
      metadata: {
        fromScopeId: state.fromScope.id,
        fromScopeUuid: state.fromScope.scopeUuid,
        toScopeId: state.toScope.id,
        toScopeUuid: state.toScope.scopeUuid,
        retainedMembershipUuid: target.membershipUuid,
        reason: "destination-is-permanent-and-at-least-as-high-ranked",
      },
    });
  }

  for (const redundant of plan.redundantSourceSubscriptions) {
    const [result] = await connection.execute(
      "DELETE FROM arena_vip_subscriptions WHERE steam_id = ? AND scope_id = ? " +
        "AND vip_family_key = ? AND status <> 'active' AND membership_uuid IS NULL",
      [redundant.steamId, state.fromScope.id, redundant.family],
    );
    await requireOne(result, "Redundant ended source subscription");
  }

  await connection.execute(
    "UPDATE arena_group_scopes AS group_scope " +
      "INNER JOIN arena_groups AS identity_group ON identity_group.id = group_scope.group_id " +
      "SET group_scope.enabled = FALSE, group_scope.updated_by_actor = 'migration:vip-scope', " +
      "group_scope.row_version = group_scope.row_version + 1 " +
      "WHERE group_scope.scope_id = ? AND identity_group.group_type = 'vip' " +
      "AND group_scope.enabled = TRUE",
    [state.fromScope.id],
  );
}

function targetSnapshotPatchValues(listing, target, destination) {
  return [
    listing.portalGroupId,
    listing.listingId,
    target.groupUuid,
    target.groupKey,
    destination.scopeUuid,
    target.family,
    target.displayName,
    target.rankWeight,
    target.rowVersion,
    listing.durationMinutes,
  ];
}

function commerceMetadataPatchValues(listing, target, destination) {
  return [
    listing.listingId,
    listing.portalGroupId,
    target.groupKey,
    target.displayName,
    target.externalKey,
    listing.durationMinutes,
    destination.scopeUuid,
    destination.serverId,
    destination.displayName,
  ];
}

async function applyPortalPlan(connection, gameState, portalState, plan) {
  const listingIds = new Set(plan.listingIds);
  const itemIds = new Set(plan.inventoryItemIds);
  const targetByPortalGroup = new Map(
    gameState.targetGroups.map((group) => [group.legacyPortalGroupId, group]),
  );
  const listingByCatalogue = new Map(
    portalState.listings.map((listing) => [listing.catalogueId, listing]),
  );
  for (const listing of portalState.listings) {
    if (!listingIds.has(listing.listingId)) continue;
    const target = targetByPortalGroup.get(listing.portalGroupId);
    if (!target) throw new Error(`Destination group mapping disappeared for listing ${listing.listingId}.`);
    const [listingResult] = await connection.execute(
      "UPDATE portal_identity_group_listings SET arena_group_uuid = ?, arena_group_key = ?, " +
        "arena_scope_uuid = ?, arena_group_row_version = ? WHERE id = ? AND arena_scope_uuid = ?",
      [
        target.groupUuid,
        target.groupKey,
        gameState.toScope.scopeUuid,
        target.rowVersion,
        listing.listingId,
        gameState.fromScope.scopeUuid,
      ],
    );
    await requireOne(listingResult, `VIP listing ${listing.listingId}`);
    const [targetResult] = await connection.execute(
      "UPDATE portal_arena_group_catalogue_targets SET arena_group_uuid = ?, arena_group_key = ?, " +
        "arena_scope_uuid = ?, arena_group_row_version = ?, target_snapshot = JSON_SET(" +
        "COALESCE(target_snapshot, JSON_OBJECT()), " +
        "'$.schemaVersion', 1, '$.legacyPortalGroupId', ?, '$.listingId', ?, " +
        "'$.arenaGroupUuid', ?, '$.arenaGroupKey', ?, '$.arenaScopeUuid', ?, " +
        "'$.groupType', 'vip', '$.vipFamilyKey', ?, '$.displayName', ?, " +
        "'$.rankWeight', ?, '$.arenaGroupRowVersion', ?, '$.durationMinutes', ?) " +
        "WHERE catalogue_id = ? AND listing_id = ? AND arena_scope_uuid = ?",
      [
        target.groupUuid,
        target.groupKey,
        gameState.toScope.scopeUuid,
        target.rowVersion,
        ...targetSnapshotPatchValues(listing, target, gameState.toScope),
        listing.catalogueId,
        listing.listingId,
        gameState.fromScope.scopeUuid,
      ],
    );
    await requireOne(targetResult, `VIP catalogue target ${listing.catalogueId}`);
    const [catalogueResult] = await connection.execute(
      "UPDATE portal_economy_catalogue SET metadata = JSON_SET(COALESCE(metadata, JSON_OBJECT()), " +
        "'$.membershipListingManaged', JSON_EXTRACT('true', '$'), '$.membershipListingId', ?, " +
        "'$.membershipGroupId', ?, '$.membershipGroupKey', ?, '$.membershipGroupName', ?, " +
        "'$.membershipSourceType', 'vipcore', '$.membershipExternalKey', ?, " +
        "'$.membershipDurationMinutes', ?, '$.membershipScopeUuid', ?, " +
        "'$.membershipVipServerId', ?, '$.membershipServerName', ?) WHERE id = ?",
      [...commerceMetadataPatchValues(listing, target, gameState.toScope), listing.catalogueId],
    );
    await requireOne(catalogueResult, `VIP catalogue metadata ${listing.catalogueId}`);
  }

  for (const item of portalState.inventoryItems) {
    if (!itemIds.has(item.itemId)) continue;
    const listing = listingByCatalogue.get(item.catalogueId);
    const target = listing ? targetByPortalGroup.get(listing.portalGroupId) : null;
    if (!listing || !target) throw new Error(`Inventory item ${item.itemId} lost its VIP listing target.`);
    const [result] = await connection.execute(
      "UPDATE portal_inventory_items SET attributes = JSON_SET(COALESCE(attributes, JSON_OBJECT()), " +
        "'$.membershipListingManaged', JSON_EXTRACT('true', '$'), '$.membershipListingId', ?, " +
        "'$.membershipGroupId', ?, '$.membershipGroupKey', ?, '$.membershipGroupName', ?, " +
        "'$.membershipSourceType', 'vipcore', '$.membershipExternalKey', ?, " +
        "'$.membershipDurationMinutes', ?, '$.membershipScopeUuid', ?, " +
        "'$.membershipVipServerId', ?, '$.membershipServerName', ?) " +
        `WHERE id = ? AND state IN (${MOVABLE_ITEM_STATES.map(() => "?").join(", ")})`,
      [
        ...commerceMetadataPatchValues(listing, target, gameState.toScope),
        item.itemId,
        ...MOVABLE_ITEM_STATES,
      ],
    );
    await requireOne(result, `VIP inventory item ${item.itemId}`);
  }
}

async function verifyApplied(game, portal, state) {
  const [[gameVerification]] = await game.query(
    "SELECT " +
      "(SELECT COUNT(*) FROM arena_vip_subscriptions WHERE scope_id = ? AND status = 'active') AS source_active_subscriptions, " +
      "(SELECT COUNT(*) FROM arena_group_memberships AS membership " +
      " INNER JOIN arena_groups AS identity_group ON identity_group.id = membership.group_id " +
      " WHERE membership.scope_id = ? AND identity_group.group_type = 'vip' AND membership.status = 'active') AS source_active_memberships, " +
      "(SELECT COUNT(*) FROM arena_group_scopes AS group_scope " +
      " INNER JOIN arena_groups AS identity_group ON identity_group.id = group_scope.group_id " +
      " WHERE group_scope.scope_id = ? AND identity_group.group_type = 'vip' AND group_scope.enabled = TRUE) AS source_enabled_vip_definitions, " +
      "(SELECT COUNT(*) FROM vip_users WHERE sid <> ?) AS native_rows_outside_target",
    [state.fromScope.id, state.fromScope.id, state.fromScope.id, state.toScope.serverId],
  );
  const [[portalVerification]] = await portal.query(
    "SELECT " +
      "(SELECT COUNT(*) FROM portal_identity_group_listings AS listing " +
      " INNER JOIN portal_identity_groups AS identity_group ON identity_group.id = listing.group_id " +
      " WHERE identity_group.source_type = 'vipcore' AND NOT (listing.arena_scope_uuid <=> ?)) AS listings_outside_target, " +
      "(SELECT COUNT(*) FROM portal_arena_group_catalogue_targets AS target " +
      " LEFT JOIN portal_identity_group_listings AS listing ON listing.id = target.listing_id " +
      " LEFT JOIN portal_identity_groups AS identity_group ON identity_group.id = listing.group_id " +
      " WHERE target.arena_group_type = 'vip' AND (listing.id IS NULL " +
      " OR NOT (listing.catalogue_id <=> target.catalogue_id) " +
      " OR NOT (identity_group.source_type <=> 'vipcore') " +
      " OR NOT (target.arena_scope_uuid <=> ?) " +
      " OR NOT (JSON_UNQUOTE(JSON_EXTRACT(target.target_snapshot, '$.arenaScopeUuid')) <=> ?) " +
      ")) AS catalogue_targets_outside_target, " +
      "(SELECT COUNT(*) FROM portal_economy_catalogue AS catalogue " +
      " WHERE catalogue.item_type = 'vip_membership' AND (" +
      " NOT (JSON_UNQUOTE(JSON_EXTRACT(catalogue.metadata, '$.membershipScopeUuid')) <=> ?) " +
      " OR NOT (JSON_UNQUOTE(JSON_EXTRACT(catalogue.metadata, '$.membershipVipServerId')) <=> ?))) AS catalogue_metadata_outside_target, " +
      "(SELECT COUNT(*) FROM portal_inventory_items AS inventory_item " +
      ` WHERE inventory_item.state IN (${MOVABLE_ITEM_STATES.map(() => "?").join(", ")}) ` +
      " AND inventory_item.item_type = 'vip_membership' " +
      " AND (NOT (JSON_UNQUOTE(JSON_EXTRACT(inventory_item.attributes, '$.membershipScopeUuid')) <=> ?) " +
      " OR NOT (JSON_UNQUOTE(JSON_EXTRACT(inventory_item.attributes, '$.membershipVipServerId')) <=> ?))) AS unconsumed_items_outside_target",
    [
      state.toScope.scopeUuid,
      state.toScope.scopeUuid,
      state.toScope.scopeUuid,
      state.toScope.scopeUuid,
      String(state.toScope.serverId),
      ...MOVABLE_ITEM_STATES,
      state.toScope.scopeUuid,
      String(state.toScope.serverId),
    ],
  );
  const result = {
    sourceActiveSubscriptions: integer(gameVerification.source_active_subscriptions, "source active subscriptions"),
    sourceActiveMemberships: integer(gameVerification.source_active_memberships, "source active memberships"),
    sourceEnabledVipDefinitions: integer(gameVerification.source_enabled_vip_definitions, "source enabled VIP definitions"),
    nativeRowsOutsideTarget: integer(gameVerification.native_rows_outside_target, "native rows outside target"),
    listingsOutsideTarget: integer(portalVerification.listings_outside_target, "listings outside target"),
    catalogueTargetsOutsideTarget: integer(portalVerification.catalogue_targets_outside_target, "catalogue targets outside target"),
    catalogueMetadataOutsideTarget: integer(
      portalVerification.catalogue_metadata_outside_target,
      "catalogue metadata outside target",
    ),
    unconsumedItemsOutsideTarget: integer(portalVerification.unconsumed_items_outside_target, "unconsumed items outside target"),
  };
  if (Object.values(result).some((count) => count !== 0)) {
    throw new Error(`Post-migration verification failed: ${JSON.stringify(result)}`);
  }
  return result;
}

async function dryRun(game, portal, options) {
  await game.query("SET SESSION TRANSACTION ISOLATION LEVEL REPEATABLE READ");
  await portal.query("SET SESSION TRANSACTION ISOLATION LEVEL REPEATABLE READ");
  await game.query("START TRANSACTION WITH CONSISTENT SNAPSHOT, READ ONLY");
  await portal.query("START TRANSACTION WITH CONSISTENT SNAPSHOT, READ ONLY");
  try {
    const gameState = await readGameState(game, { ...options, lock: false });
    const portalState = await readPortalState(portal, { lock: false });
    const plan = buildPlan(gameState, portalState);
    return reportFor(options, gameState, portalState, plan);
  } finally {
    await Promise.allSettled([game.rollback(), portal.rollback()]);
  }
}

async function apply(game, portal, options) {
  let portalLock = false;
  let gameLock = false;
  let portalTransaction = false;
  let gameTransaction = false;
  let gameCommitted = false;
  try {
    await portal.query("SET SESSION TRANSACTION ISOLATION LEVEL SERIALIZABLE");
    await game.query("SET SESSION TRANSACTION ISOLATION LEVEL SERIALIZABLE");
    await acquireNamedLock(portal, PORTAL_LOCK_NAME);
    portalLock = true;
    await acquireNamedLock(game, GAME_LOCK_NAME);
    gameLock = true;
    await portal.beginTransaction();
    portalTransaction = true;
    await lockPortalVipRows(portal);
    await game.beginTransaction();
    gameTransaction = true;

    const gameState = await readGameState(game, { ...options, lock: true });
    const portalState = await readPortalState(portal, { lock: true });
    const plan = buildPlan(gameState, portalState);
    const report = reportFor(options, gameState, portalState, plan);
    if (plan.blockers.length) {
      throw new Error(`Migration preflight is blocked: ${plan.blockers.join(" ")}`);
    }

    await applyGamePlan(game, gameState, plan);
    await applyPortalPlan(portal, gameState, portalState, plan);
    const verification = await verifyApplied(game, portal, gameState);

    await game.commit();
    gameTransaction = false;
    gameCommitted = true;
    try {
      await portal.commit();
      portalTransaction = false;
    } catch (error) {
      throw new Error(
        `Arena migration committed but the portal transaction did not. Keep writers stopped and rerun the same command. ${error.message}`,
      );
    }
    return { ...report, applied: true, verification };
  } catch (error) {
    if (gameTransaction) await game.rollback().catch(() => {});
    if (portalTransaction) await portal.rollback().catch(() => {});
    if (gameCommitted) error.gameCommitted = true;
    throw error;
  } finally {
    if (gameLock) await releaseNamedLock(game, GAME_LOCK_NAME).catch(() => {});
    if (portalLock) await releaseNamedLock(portal, PORTAL_LOCK_NAME).catch(() => {});
  }
}

const options = parseArguments(process.argv.slice(2));
if (options.help) {
  usage();
  process.exit(0);
}
const game = await connectUtc(requiredEnvironment("GAME_DATABASE_URL"), "Arena database");
const portal = await connectUtc(requiredEnvironment("PORTAL_DATABASE_URL"), "Portal database");
try {
  const report = options.apply
    ? await apply(game, portal, options)
    : await dryRun(game, portal, options);
  console.log(JSON.stringify(report, null, 2));
  if (!options.apply) {
    console.log(
      report.blockers.length
        ? "\nDRY RUN BLOCKED: resolve every blocker before apply mode."
        : "\nDRY RUN PASSED: no data was changed. Create and verify both logical snapshots before apply mode.",
    );
    if (report.blockers.length) process.exitCode = 2;
  }
} finally {
  await Promise.allSettled([game.end(), portal.end()]);
}
