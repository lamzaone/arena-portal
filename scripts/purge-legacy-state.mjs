import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import mysql from "mysql2/promise";

const confirmation = "PURGE-LEGACY-AUTHORITY-AND-HISTORY";
const args = new Map(
  process.argv.slice(2).map((argument) => {
    const separator = argument.indexOf("=");
    return separator === -1
      ? [argument, true]
      : [argument.slice(0, separator), argument.slice(separator + 1)];
  }),
);
const execute = args.get("--execute") === true;
const snapshotDir = args.get("--snapshot-dir");

if (!execute || args.get("--confirm") !== confirmation) {
  throw new Error(
    `Refusing destructive reset. Pass --execute --confirm=${confirmation} ` +
      "and --snapshot-dir=<verified logical snapshot directory>.",
  );
}
if (typeof snapshotDir !== "string" || !path.isAbsolute(snapshotDir)) {
  throw new Error("--snapshot-dir must be an absolute path.");
}
if (!process.env.GAME_DATABASE_URL || !process.env.PORTAL_DATABASE_URL) {
  throw new Error("GAME_DATABASE_URL and PORTAL_DATABASE_URL are required.");
}

function sha256File(file) {
  return new Promise((resolve, reject) => {
    const hash = crypto.createHash("sha256");
    const input = fs.createReadStream(file);
    input.on("data", (chunk) => hash.update(chunk));
    input.on("error", reject);
    input.on("end", () => resolve(hash.digest("hex")));
  });
}

async function verifySnapshot() {
  const manifestFile = path.join(snapshotDir, "manifest.json");
  const manifest = JSON.parse(fs.readFileSync(manifestFile, "utf8"));
  if (manifest.format !== "tappd-mysql-logical-snapshot-v1") {
    throw new Error("The supplied snapshot uses an unsupported format.");
  }
  const targets = manifest.targets ?? [];
  const labels = targets.map((target) => target.label).sort();
  if (JSON.stringify(labels) !== JSON.stringify(["arena", "portal"])) {
    throw new Error("The snapshot must contain exactly the Arena and Portal targets.");
  }
  const age = Date.now() - new Date(manifest.createdAt).getTime();
  if (!Number.isFinite(age) || age < 0 || age > 12 * 60 * 60 * 1_000) {
    throw new Error("The snapshot is not a fresh pre-maintenance snapshot.");
  }
  const requiredTables = {
    arena: ["admins", "arena_group_memberships", "k4_arenas_players", "lvl_base"],
    portal: [
      "portal_economy_catalogue",
      "portal_identity_group_listings",
      "portal_identity_group_memberships",
      "portal_inventory_items",
      "portal_token_ledger",
    ],
  };
  const root = path.resolve(snapshotDir);
  for (const target of targets) {
    const file = path.resolve(root, target.file);
    const relative = path.relative(root, file);
    if (relative.startsWith("..") || path.isAbsolute(relative)) {
      throw new Error(`Snapshot file escapes its directory: ${target.file}`);
    }
    if (!fs.existsSync(file)) throw new Error(`Snapshot file is missing: ${target.file}`);
    const actual = await sha256File(file);
    if (actual !== target.sha256) {
      throw new Error(`Snapshot hash mismatch: ${target.file}`);
    }
    const tableNames = new Set((target.tables ?? []).map((table) => table.name));
    for (const table of requiredTables[target.label]) {
      if (!tableNames.has(table)) throw new Error(`Snapshot is missing required table ${table}.`);
    }
  }
  return manifest;
}

function quoteIdentifier(identifier) {
  return `\`${String(identifier).replaceAll("`", "``")}\``;
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
  await connection.query("SET time_zone = '+00:00'");
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

async function count(connection, table, where = "") {
  const [[row]] = await connection.query(
    `SELECT COUNT(*) AS row_count FROM ${quoteIdentifier(table)} ${where}`,
  );
  return Number(row.row_count);
}

async function checksum(connection, table) {
  const [rows] = await connection.query(`CHECKSUM TABLE ${quoteIdentifier(table)}`);
  return String(rows[0].Checksum);
}

async function acquireLock(connection, name) {
  const [[row]] = await connection.query("SELECT GET_LOCK(?, 30) AS acquired", [name]);
  if (Number(row.acquired) !== 1) throw new Error(`Could not acquire maintenance lock ${name}.`);
}

async function releaseLock(connection, name) {
  await connection.query("SELECT RELEASE_LOCK(?)", [name]);
}

async function remove(connection, report, label, sql, values = []) {
  const [result] = await connection.execute(sql, values);
  report[label] = Number(result.affectedRows ?? 0);
}

function portableTriggerSql(createSql) {
  return createSql.replace(
    /^CREATE\s+DEFINER=`[^`]+`@`[^`]+`\s+TRIGGER\s+/i,
    "CREATE TRIGGER ",
  );
}

async function portalProtectedState(connection) {
  const tables = [
    "portal_arena_group_catalogue_targets",
    "portal_economy_catalogue",
    "portal_identity_groups",
    "portal_identity_group_listings",
    "portal_loot_entries",
    "portal_loot_tables",
  ];
  const tableState = {};
  for (const table of tables) {
    tableState[table] = { rows: await count(connection, table), checksum: await checksum(connection, table) };
  }
  const [[available]] = await connection.query(
    "SELECT COUNT(*) AS rows_count FROM portal_inventory_items WHERE state = 'available'",
  );
  const [[balances]] = await connection.query(
    "SELECT COUNT(*) AS account_count, COALESCE(SUM(balance), 0) AS balance_sum FROM portal_token_accounts",
  );
  const [[currentPrices]] = await connection.query(
    "SELECT COUNT(*) AS rows_count FROM portal_economy_catalogue_prices WHERE is_current = TRUE",
  );
  const [[customItems]] = await connection.query(
    "SELECT COUNT(*) AS rows_count FROM portal_economy_catalogue WHERE catalogue_key LIKE 'tappd:%'",
  );
  return {
    tables: tableState,
    availableInventory: Number(available.rows_count),
    tokenAccounts: Number(balances.account_count),
    tokenBalance: String(balances.balance_sum),
    currentPrices: Number(currentPrices.rows_count),
    tappdCatalogueItems: Number(customItems.rows_count),
  };
}

async function arenaProtectedState(connection) {
  const tables = [
    "bans",
    "sanctions",
    "groups",
    "vip_group_definitions",
    "k4_arenas_players",
    "k4_arenas_rounds",
    "k4_arenas_weapons",
    "lvl_base",
    "lvl_base_hits",
    "lvl_base_settings",
    "lvl_base_weapons",
    "wp_player_agents",
    "wp_player_gloves",
    "wp_player_knife",
    "wp_player_music",
    "wp_player_skins",
  ];
  const state = {};
  for (const table of tables) {
    state[table] = { rows: await count(connection, table), checksum: await checksum(connection, table) };
  }
  return state;
}

async function captureDeleteTriggers(connection) {
  const [triggers] = await connection.query(
    "SELECT TRIGGER_NAME FROM information_schema.TRIGGERS " +
      "WHERE TRIGGER_SCHEMA = DATABASE() AND EVENT_MANIPULATION = 'DELETE' " +
      "AND TRIGGER_NAME IN (?, ?, ?, ?, ?, ?) ORDER BY TRIGGER_NAME",
    [
      "portal_economy_admin_audit_prevent_delete",
      "portal_identity_audit_events_prevent_delete",
      "portal_inventory_item_events_prevent_delete",
      "portal_token_ledger_prevent_delete",
      "portal_vip_perk_admin_audit_prevent_delete",
      "portal_vip_perk_purchases_prevent_delete",
    ],
  );
  if (triggers.length !== 6) {
    throw new Error(`Expected 6 immutable DELETE triggers, found ${triggers.length}.`);
  }
  const definitions = [];
  for (const trigger of triggers) {
    const [rows] = await connection.query(
      `SHOW CREATE TRIGGER ${quoteIdentifier(trigger.TRIGGER_NAME)}`,
    );
    definitions.push({
      name: trigger.TRIGGER_NAME,
      createSql: portableTriggerSql(rows[0]["SQL Original Statement"]),
    });
  }
  return definitions;
}

async function dropDeleteTriggers(connection, definitions) {
  for (const trigger of definitions) {
    await connection.query(`DROP TRIGGER ${quoteIdentifier(trigger.name)}`);
  }
}

async function restoreDeleteTriggers(connection, definitions) {
  const failures = [];
  for (const trigger of definitions) {
    try {
      const [[row]] = await connection.query(
        "SELECT COUNT(*) AS present FROM information_schema.TRIGGERS " +
          "WHERE TRIGGER_SCHEMA = DATABASE() AND TRIGGER_NAME = ?",
        [trigger.name],
      );
      if (Number(row.present) === 0) await connection.query(trigger.createSql);
    } catch (error) {
      failures.push(new Error(`Could not restore trigger ${trigger.name}.`, { cause: error }));
    }
  }
  if (failures.length) throw new AggregateError(failures, "Immutable trigger restoration failed.");
}

async function verifyImmutableTriggers(connection) {
  const [[row]] = await connection.query(
    "SELECT COUNT(*) AS row_count FROM information_schema.TRIGGERS " +
      "WHERE TRIGGER_SCHEMA = DATABASE() AND TRIGGER_NAME IN (" +
      "'portal_economy_admin_audit_prevent_delete', 'portal_economy_admin_audit_prevent_update', " +
      "'portal_identity_audit_events_prevent_delete', 'portal_identity_audit_events_prevent_update', " +
      "'portal_inventory_item_events_prevent_delete', 'portal_inventory_item_events_prevent_update', " +
      "'portal_token_ledger_prevent_delete', 'portal_token_ledger_prevent_update', " +
      "'portal_vip_perk_admin_audit_prevent_delete', 'portal_vip_perk_admin_audit_prevent_update', " +
      "'portal_vip_perk_purchases_prevent_delete', 'portal_vip_perk_purchases_prevent_update')",
  );
  if (Number(row.row_count) !== 12) {
    throw new Error(`Expected all 12 immutable audit triggers, found ${row.row_count}.`);
  }
}

async function purgePortal(connection, report) {
  const lockName = "arena_portal_economy_public_price_refresh";
  await acquireLock(connection, lockName);
  let definitions = [];
  let deleteTriggersRestored = false;
  try {
    const [[processing]] = await connection.query(
      "SELECT COUNT(*) AS row_count FROM portal_economy_operations WHERE status = 'processing'",
    );
    const [[activationJobs]] = await connection.query(
      "SELECT COUNT(*) AS row_count FROM portal_membership_activation_jobs " +
        "WHERE status NOT IN ('completed', 'rejected')",
    );
    const [[reservedItems]] = await connection.query(
      "SELECT COUNT(*) AS row_count FROM portal_inventory_items " +
        "WHERE state IN ('escrowed', 'attached', 'activation_pending')",
    );
    const [[processingJobs]] = await connection.query(
      "SELECT COUNT(*) AS row_count FROM portal_economy_jobs WHERE status = 'processing'",
    );
    const [[pendingOutbox]] = await connection.query(
      "SELECT COUNT(*) AS row_count FROM portal_outbox WHERE status <> 'completed'",
    );
    const [[pendingTrades]] = await connection.query(
      "SELECT COUNT(*) AS row_count FROM portal_economy_trades WHERE status = 'pending'",
    );
    const [[heldEscrow]] = await connection.query(
      "SELECT COUNT(*) AS row_count FROM portal_trade_token_escrow WHERE status = 'held'",
    );
    if (
      Number(processing.row_count) ||
      Number(activationJobs.row_count) ||
      Number(reservedItems.row_count) ||
      Number(processingJobs.row_count) ||
      Number(pendingOutbox.row_count) ||
      Number(pendingTrades.row_count) ||
      Number(heldEscrow.row_count)
    ) {
      throw new Error("Portal has in-flight economy work; refusing to purge it.");
    }

    definitions = await captureDeleteTriggers(connection);
    await dropDeleteTriggers(connection, definitions);
    await connection.beginTransaction();
    try {
      await connection.query("SELECT steam_id FROM portal_token_accounts ORDER BY steam_id FOR UPDATE");
      await connection.query("SELECT id FROM portal_inventory_items ORDER BY id FOR UPDATE");
      await connection.query("SELECT id FROM portal_economy_jobs ORDER BY id FOR UPDATE");
      await connection.query("SELECT id FROM portal_outbox ORDER BY id FOR UPDATE");
      await connection.query("SELECT id FROM portal_economy_operations ORDER BY id FOR UPDATE");

      await remove(connection, report, "legacyVipConversion", "DELETE FROM portal_vip_membership_conversion_state");
      await remove(connection, report, "legacyPortalMemberships", "DELETE FROM portal_identity_group_memberships");
      await remove(connection, report, "arenaMembershipReceipts", "DELETE FROM portal_arena_membership_event_receipts");
      await remove(connection, report, "membershipActivationJobs", "DELETE FROM portal_membership_activation_jobs");
      await remove(connection, report, "vipPerkPurchases", "DELETE FROM portal_vip_perk_purchases");
      await remove(connection, report, "tradeEscrow", "DELETE FROM portal_trade_token_escrow");
      await remove(connection, report, "tradeItems", "DELETE FROM portal_trade_items");
      await remove(connection, report, "trades", "DELETE FROM portal_economy_trades");
      await remove(connection, report, "crateOpenings", "DELETE FROM portal_crate_openings");
      await remove(connection, report, "dropAwards", "DELETE FROM portal_drop_awards");
      await remove(
        connection,
        report,
        "inactiveGroupRewardAwards",
        "DELETE FROM portal_identity_group_reward_awards WHERE entitlement_active = FALSE",
      );
      await remove(connection, report, "inventoryEvents", "DELETE FROM portal_inventory_item_events");
      await remove(connection, report, "redeemRedemptions", "DELETE FROM portal_redeem_code_redemptions");
      await remove(
        connection,
        report,
        "redeemCodesDisabled",
        "UPDATE portal_redeem_codes SET enabled = FALSE, redemption_count = 0 " +
          "WHERE enabled = TRUE OR redemption_count <> 0",
      );
      await remove(connection, report, "sessions", "DELETE FROM portal_sessions");
      await remove(connection, report, "notifications", "DELETE FROM portal_economy_notifications");
      await remove(connection, report, "economyJobs", "DELETE FROM portal_economy_jobs");
      await remove(connection, report, "outbox", "DELETE FROM portal_outbox");
      await remove(connection, report, "economyOperations", "DELETE FROM portal_economy_operations");
      await remove(connection, report, "portalAudit", "DELETE FROM portal_audit_events");
      await remove(connection, report, "economyAdminAudit", "DELETE FROM portal_economy_admin_audit");
      await remove(connection, report, "identityAudit", "DELETE FROM portal_identity_audit_events");
      await remove(connection, report, "vipPerkAdminAudit", "DELETE FROM portal_vip_perk_admin_audit");
      await remove(connection, report, "tokenLedger", "DELETE FROM portal_token_ledger");
      await remove(
        connection,
        report,
        "tokenBalanceBaselines",
        "INSERT INTO portal_token_ledger " +
          "(account_steam_id, delta, balance_after, reason, reference_type, reference_id, " +
          "idempotency_key, line_key, actor_steam_id, metadata) " +
          "SELECT steam_id, balance, balance, 'balance_baseline', 'database_reset', steam_id, " +
          "CONCAT('database-reset-baseline:', steam_id), 'primary', NULL, " +
          "JSON_OBJECT('kind', 'opening-balance', 'historyPurged', TRUE) " +
          "FROM portal_token_accounts WHERE balance > 0",
      );
      await remove(
        connection,
        report,
        "historicalCataloguePrices",
        "DELETE FROM portal_economy_catalogue_prices WHERE is_current = FALSE",
      );
      await remove(
        connection,
        report,
        "expiredVariantPrices",
        "DELETE FROM portal_economy_market_variant_prices WHERE expires_at <= CURRENT_TIMESTAMP",
      );
      await remove(
        connection,
        report,
        "historicalInventoryItems",
        "DELETE item FROM portal_inventory_items AS item " +
          "WHERE item.state IN ('consumed', 'revoked') " +
          "AND NOT EXISTS (SELECT 1 FROM portal_loadout_slots AS slot WHERE slot.item_id = item.id) " +
          "AND NOT EXISTS (SELECT 1 FROM portal_player_settings AS setting WHERE setting.active_theme_item_id = item.id) " +
          "AND NOT EXISTS (SELECT 1 FROM portal_identity_group_reward_awards AS award WHERE award.item_id = item.id) " +
          "AND NOT EXISTS (SELECT 1 FROM portal_inventory_item_stickers AS sticker " +
          "WHERE sticker.weapon_item_id = item.id OR sticker.sticker_item_id = item.id)",
      );

      await connection.commit();
    } catch (error) {
      await connection.rollback();
      throw error;
    } finally {
      await restoreDeleteTriggers(connection, definitions);
      await verifyImmutableTriggers(connection);
      deleteTriggersRestored = true;
    }
  } finally {
    try {
      if (definitions.length && !deleteTriggersRestored) {
        await restoreDeleteTriggers(connection, definitions);
      }
    } finally {
      await releaseLock(connection, lockName);
    }
  }
}

async function applyArenaSchemaRepairs(connection) {
  await connection.query(
    "CREATE TABLE IF NOT EXISTS group_definition_bootstrap_state (" +
      "ServerGuid VARCHAR(36) NOT NULL PRIMARY KEY, " +
      "SeededAt DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP) ENGINE=InnoDB",
  );
  await connection.query(
    "INSERT IGNORE INTO group_definition_bootstrap_state (ServerGuid, SeededAt) " +
      "SELECT GUID, CURRENT_TIMESTAMP FROM servers",
  );
  await connection.query(
    "INSERT IGNORE INTO VersionInfo (Version, AppliedOn, Description) " +
      "VALUES (20270214103919, CURRENT_TIMESTAMP, 'Admins_AddGroupBootstrapStateTable')",
  );
  await connection.query(
    "CREATE TABLE IF NOT EXISTS vip_group_definition_bootstrap_state (" +
      "server_id BIGINT NOT NULL PRIMARY KEY, " +
      "seeded_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP) ENGINE=InnoDB",
  );
  await connection.query(
    "INSERT IGNORE INTO vip_group_definition_bootstrap_state (server_id, seeded_at) " +
      "SELECT serverId, CURRENT_TIMESTAMP FROM vip_servers",
  );
  await connection.query(
    "INSERT IGNORE INTO __vipcore_version_info (version, applied_on, description) " +
      "VALUES (5, CURRENT_TIMESTAMP, 'Migration005')",
  );
  await connection.query(
    "CREATE TABLE IF NOT EXISTS k4_arenas_version_info (" +
      "Version BIGINT NOT NULL PRIMARY KEY, AppliedOn DATETIME NULL, " +
      "Description VARCHAR(1024) NULL) ENGINE=InnoDB",
  );
  await connection.query(
    "INSERT IGNORE INTO k4_arenas_version_info (Version, AppliedOn, Description) " +
      "SELECT Version, AppliedOn, Description FROM VersionInfo " +
      "WHERE Version IN (202512010250, 202512010300)",
  );
}

async function preflightArena(connection) {
  const [founders] = await connection.query(
    "SELECT Id, Immunity FROM admins WHERE JSON_CONTAINS(Groups, JSON_QUOTE('Founder'))",
  );
  const [[founderGroup]] = await connection.query(
    "SELECT COUNT(*) AS row_count FROM groups " +
      "WHERE Name = 'Founder' AND JSON_CONTAINS(Permissions, JSON_QUOTE('*')) AND Immunity = 100",
  );
  const [[adminBindings]] = await connection.query(
    "SELECT COUNT(*) AS row_count FROM arena_scopes AS scope INNER JOIN servers AS server " +
      "ON server.GUID = scope.admin_server_guid WHERE scope.scope_type = 'server'",
  );
  const [[vipBindings]] = await connection.query(
    "SELECT COUNT(*) AS row_count FROM arena_scopes AS scope INNER JOIN vip_servers AS vip " +
      "ON vip.serverId = scope.vip_server_id WHERE scope.scope_type = 'server'",
  );
  const configuredAdminGuid = String(process.env.GAME_SERVER_GUID ?? "").trim().toLowerCase();
  const configuredVipServerId = Number(process.env.GAME_VIP_SERVER_ID);
  const canonicalScopeKey = `server.${configuredAdminGuid}`;
  const [boundScopes] = await connection.query(
    "SELECT id, scope_uuid, scope_key, admin_server_guid, vip_server_id FROM arena_scopes " +
      "WHERE admin_server_guid = ? OR vip_server_id = ? ORDER BY id",
    [configuredAdminGuid, configuredVipServerId],
  );
  const [[globalScope]] = await connection.query(
    "SELECT COUNT(*) AS row_count FROM arena_scopes " +
      "WHERE scope_uuid = '00000000-0000-0000-0000-000000000001' " +
      "AND scope_key = 'global' AND scope_type = 'global' AND vip_server_id = 0",
  );
  const [[canonicalKeyOwners]] = await connection.query(
    "SELECT COUNT(*) AS row_count FROM arena_scopes WHERE scope_key = ?",
    [canonicalScopeKey],
  );
  const [[groupScopeCollisions]] = await connection.query(
    "SELECT COUNT(*) AS row_count FROM (" +
      "SELECT group_id FROM arena_group_scopes WHERE scope_id IN (?, ?) " +
      "GROUP BY group_id HAVING COUNT(*) > 1) AS collisions",
    [boundScopes[0]?.id ?? -1, boundScopes[1]?.id ?? -1],
  );
  if (
    founders.length !== 1 ||
    Number(founders[0].Immunity) !== 100 ||
    Number(founderGroup.row_count) !== 1
  ) {
    throw new Error("The native Founder break-glass authority failed preflight.");
  }
  if (Number(adminBindings.row_count) !== 1 || Number(vipBindings.row_count) !== 1) {
    throw new Error("Arena server-scope bindings failed preflight.");
  }
  if (
    !/^[0-9a-f-]{36}$/.test(configuredAdminGuid) ||
    !Number.isSafeInteger(configuredVipServerId) ||
    configuredVipServerId <= 0 ||
    boundScopes.length !== 2 ||
    Number(globalScope.row_count) !== 1 ||
    Number(canonicalKeyOwners.row_count) !== 0 ||
    Number(groupScopeCollisions.row_count) !== 0
  ) {
    throw new Error("The expected split-to-canonical scope topology failed preflight.");
  }
}

async function purgeArena(connection, report) {
  const lockName = "tappd_arena_group_authority_reset";
  await acquireLock(connection, lockName);
  try {
    await connection.beginTransaction();
    try {
      const [founders] = await connection.query(
        "SELECT Id, Groups, Immunity FROM admins " +
          "WHERE JSON_CONTAINS(Groups, JSON_QUOTE('Founder')) FOR UPDATE",
      );
      if (founders.length !== 1 || Number(founders[0].Immunity) !== 100) {
        throw new Error("The native Founder break-glass assignment is missing or ambiguous.");
      }
      const [[founderGroup]] = await connection.query(
        "SELECT COUNT(*) AS row_count FROM groups " +
          "WHERE Name = 'Founder' AND JSON_CONTAINS(Permissions, JSON_QUOTE('*')) AND Immunity = 100",
      );
      if (Number(founderGroup.row_count) !== 1) {
        throw new Error("The native Founder group definition is missing or ambiguous.");
      }

      await remove(connection, report, "membershipCommandReceipts", "DELETE FROM arena_membership_command_receipts");
      await remove(connection, report, "membershipOutbox", "DELETE FROM arena_membership_outbox");
      await remove(connection, report, "vipSubscriptionHistory", "DELETE FROM arena_vip_subscription_history");
      await remove(connection, report, "vipSubscriptions", "DELETE FROM arena_vip_subscriptions");
      await remove(connection, report, "groupMemberships", "DELETE FROM arena_group_memberships");
      await remove(connection, report, "membershipCommands", "DELETE FROM arena_membership_commands");
      await remove(connection, report, "nativeVipMemberships", "DELETE FROM vip_users");
      await remove(
        connection,
        report,
        "nativeAdminMemberships",
        "DELETE FROM admins WHERE Id <> ?",
        [founders[0].Id],
      );
      await remove(connection, report, "vipCookies", "DELETE FROM PlayerCookies");

      const [adminScopes] = await connection.query(
        "SELECT scope.id, scope.scope_uuid, scope.scope_key, server.GUID, server.Hostname " +
          "FROM arena_scopes AS scope INNER JOIN servers AS server " +
          "ON server.GUID = scope.admin_server_guid WHERE scope.scope_type = 'server' FOR UPDATE",
      );
      const [vipScopes] = await connection.query(
        "SELECT scope.id, scope.scope_uuid, scope.scope_key, vip.serverId " +
          "FROM arena_scopes AS scope INNER JOIN vip_servers AS vip " +
          "ON vip.serverId = scope.vip_server_id WHERE scope.scope_type = 'server' FOR UPDATE",
      );
      if (adminScopes.length !== 1 || vipScopes.length !== 1) {
        throw new Error("Expected exactly one Admin and one VIP binding for the physical Arena server.");
      }
      const adminScope = adminScopes[0];
      const vipScope = vipScopes[0];
      const canonicalKey = `server.${adminScope.GUID}`;
      if (Number(adminScope.id) !== Number(vipScope.id)) {
        await connection.query(
          "INSERT INTO arena_group_scopes " +
            "(group_id, scope_id, definition_override, rank_weight_override, immunity_override, enabled, " +
            "row_version, created_by_actor, updated_by_actor, created_at, updated_at) " +
            "SELECT group_id, ?, definition_override, rank_weight_override, immunity_override, enabled, " +
            "row_version, created_by_actor, updated_by_actor, created_at, updated_at " +
            "FROM arena_group_scopes WHERE scope_id = ?",
          [adminScope.id, vipScope.id],
        );
        await remove(
          connection,
          report,
          "duplicateScopeGroupLinks",
          "DELETE FROM arena_group_scopes WHERE scope_id = ?",
          [vipScope.id],
        );
        await connection.execute(
          "UPDATE arena_scopes SET vip_server_id = NULL WHERE id = ?",
          [vipScope.id],
        );
        await connection.execute(
          "UPDATE arena_scopes SET scope_key = ?, display_name = ?, vip_server_id = ?, " +
            "row_version = row_version + 1, updated_at = CURRENT_TIMESTAMP(6) WHERE id = ?",
          [canonicalKey, adminScope.Hostname, vipScope.serverId, adminScope.id],
        );
        await remove(
          connection,
          report,
          "duplicateServerScopes",
          "DELETE FROM arena_scopes WHERE id = ?",
          [vipScope.id],
        );
      } else {
        await connection.execute(
          "UPDATE arena_scopes SET scope_key = ?, display_name = ?, " +
            "row_version = row_version + IF(scope_key <> ? OR display_name <> ?, 1, 0), " +
            "updated_at = CURRENT_TIMESTAMP(6) WHERE id = ?",
          [canonicalKey, adminScope.Hostname, canonicalKey, adminScope.Hostname, adminScope.id],
        );
        report.duplicateScopeGroupLinks = 0;
        report.duplicateServerScopes = 0;
      }

      await connection.commit();
    } catch (error) {
      await connection.rollback();
      throw error;
    }
  } finally {
    await releaseLock(connection, lockName);
  }
}

const snapshot = await verifySnapshot();
const portal = await connectUtc(process.env.PORTAL_DATABASE_URL, "Portal");
const arena = await connectUtc(process.env.GAME_DATABASE_URL, "Arena");
await preflightArena(arena);
// Run non-destructive, idempotent schema repair before Portal is changed so a
// missing DDL permission cannot leave a half-completed cross-host reset.
await applyArenaSchemaRepairs(arena);
const report = {
  format: "tappd-authority-purge-report-v1",
  startedAt: new Date().toISOString(),
  snapshotCreatedAt: snapshot.createdAt,
  before: {
    portal: await portalProtectedState(portal),
    arena: await arenaProtectedState(arena),
  },
  removed: { portal: {}, arena: {} },
};

try {
  // Portal first prevents a rolling-deployment fallback from seeing stale
  // Portal grants during the short interval before Arena is cleared.
  await purgePortal(portal, report.removed.portal);
  await purgeArena(arena, report.removed.arena);
  report.after = {
    portal: await portalProtectedState(portal),
    arena: await arenaProtectedState(arena),
  };
  report.completedAt = new Date().toISOString();
  report.protectedStateMatches = {
    portal: JSON.stringify(report.before.portal) === JSON.stringify(report.after.portal),
    arena: JSON.stringify(report.before.arena) === JSON.stringify(report.after.arena),
  };
  if (!report.protectedStateMatches.portal || !report.protectedStateMatches.arena) {
    report.warning = "At least one protected-state invariant changed during the maintenance window.";
  }
} finally {
  await portal.end();
  await arena.end();
  fs.writeFileSync(
    path.join(snapshotDir, "purge-report.json"),
    `${JSON.stringify(report, null, 2)}\n`,
    { flag: "wx" },
  );
}

console.log(JSON.stringify({
  completedAt: report.completedAt,
  removed: report.removed,
  protectedStateMatches: report.protectedStateMatches,
}, null, 2));
