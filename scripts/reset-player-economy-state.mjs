import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import mysql from "mysql2/promise";

const confirmation = "RESET-PLAYER-INVENTORIES-AND-TOKENS";
const args = new Map(
  process.argv.slice(2).map((argument) => {
    const separator = argument.indexOf("=");
    return separator === -1
      ? [argument, true]
      : [argument.slice(0, separator), argument.slice(separator + 1)];
  }),
);
const snapshotDir = args.get("--snapshot-dir");

if (args.get("--execute") !== true || args.get("--confirm") !== confirmation) {
  throw new Error(
    `Refusing destructive economy reset. Pass --execute --confirm=${confirmation} ` +
      "and --snapshot-dir=<fresh verified Portal snapshot directory>.",
  );
}
if (typeof snapshotDir !== "string" || !path.isAbsolute(snapshotDir)) {
  throw new Error("--snapshot-dir must be an absolute path.");
}
if (!process.env.PORTAL_DATABASE_URL) {
  throw new Error("PORTAL_DATABASE_URL is required.");
}

const requiredSnapshotTables = [
  "portal_economy_catalogue",
  "portal_identity_group_listings",
  "portal_identity_group_reward_awards",
  "portal_inventory_item_events",
  "portal_inventory_items",
  "portal_loadout_slots",
  "portal_player_settings",
  "portal_player_theme_ownership",
  "portal_token_accounts",
  "portal_token_ledger",
];

const resetCountTables = [
  "portal_crate_openings",
  "portal_drop_awards",
  "portal_economy_jobs",
  "portal_economy_notifications",
  "portal_economy_operations",
  "portal_identity_group_reward_awards",
  "portal_inventory_item_events",
  "portal_inventory_item_stickers",
  "portal_inventory_items",
  "portal_loadout_slots",
  "portal_membership_activation_jobs",
  "portal_outbox",
  "portal_player_theme_ownership",
  "portal_token_accounts",
  "portal_token_ledger",
  "portal_trade_items",
  "portal_trade_token_escrow",
  "portal_economy_trades",
];

const protectedTables = [
  "portal_arena_group_catalogue_targets",
  "portal_economy_catalogue",
  "portal_economy_catalogue_prices",
  "portal_economy_market_variant_prices",
  "portal_identity_groups",
  "portal_identity_group_listings",
  "portal_identity_group_rewards",
  "portal_loot_entries",
  "portal_loot_tables",
  "portal_profile_themes",
  "portal_redeem_code_items",
  "portal_redeem_codes",
];

function quoteIdentifier(identifier) {
  return `\`${String(identifier).replaceAll("`", "``")}\``;
}

async function sha256File(file) {
  const hash = crypto.createHash("sha256");
  const input = fs.createReadStream(file);
  input.on("data", (chunk) => hash.update(chunk));
  await new Promise((resolve, reject) => {
    input.on("end", resolve);
    input.on("error", reject);
  });
  return hash.digest("hex");
}

async function verifySnapshot() {
  const root = path.resolve(snapshotDir);
  const manifestFile = path.join(root, "manifest.json");
  const manifest = JSON.parse(fs.readFileSync(manifestFile, "utf8"));
  if (manifest.format !== "tappd-mysql-logical-snapshot-v1") {
    throw new Error("The supplied snapshot uses an unsupported format.");
  }
  const age = Date.now() - new Date(manifest.createdAt).getTime();
  if (!Number.isFinite(age) || age < 0 || age > 2 * 60 * 60 * 1_000) {
    throw new Error("The Portal snapshot is not a fresh pre-reset snapshot.");
  }
  const target = (manifest.targets ?? []).find(
    (candidate) => candidate.label === "portal",
  );
  if (!target) throw new Error("The snapshot has no Portal target.");
  const file = path.resolve(root, target.file);
  const relative = path.relative(root, file);
  if (relative.startsWith("..") || path.isAbsolute(relative)) {
    throw new Error("The Portal snapshot file escapes its manifest directory.");
  }
  if (!fs.existsSync(file) || (await sha256File(file)) !== target.sha256) {
    throw new Error("The Portal snapshot is missing or its SHA-256 does not match.");
  }
  const tableNames = new Set((target.tables ?? []).map((table) => table.name));
  for (const table of requiredSnapshotTables) {
    if (!tableNames.has(table)) {
      throw new Error(`The snapshot is missing required table ${table}.`);
    }
  }
  return { manifest, target };
}

async function connectUtc(url) {
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
    "SELECT DATABASE() AS schema_name, @@session.time_zone AS session_time_zone, " +
      "TIMESTAMPDIFF(MICROSECOND, UTC_TIMESTAMP(6), CURRENT_TIMESTAMP(6)) AS utc_offset_microseconds",
  );
  if (
    String(clock.session_time_zone) !== "+00:00" ||
    Number(clock.utc_offset_microseconds) !== 0
  ) {
    await connection.end();
    throw new Error("The Portal reset connection did not establish a UTC session.");
  }
  return { connection, schema: String(clock.schema_name) };
}

async function count(connection, table, where = "") {
  const [[row]] = await connection.query(
    `SELECT COUNT(*) AS row_count FROM ${quoteIdentifier(table)} ${where}`,
  );
  return Number(row.row_count);
}

async function checksum(connection, table) {
  const [rows] = await connection.query(
    `CHECKSUM TABLE ${quoteIdentifier(table)}`,
  );
  return String(rows[0].Checksum);
}

async function tableState(connection, tables) {
  const state = {};
  for (const table of tables) {
    state[table] = {
      rows: await count(connection, table),
      checksum: await checksum(connection, table),
    };
  }
  return state;
}

async function acquireLock(connection, name) {
  const [[row]] = await connection.query("SELECT GET_LOCK(?, 30) AS acquired", [
    name,
  ]);
  if (Number(row.acquired) !== 1) {
    throw new Error(`Could not acquire maintenance lock ${name}.`);
  }
}

async function releaseLock(connection, name) {
  await connection.query("SELECT RELEASE_LOCK(?)", [name]);
}

function portableTriggerSql(createSql) {
  return String(createSql).replace(
    /^CREATE\s+DEFINER=`[^`]+`@`[^`]+`\s+TRIGGER\s+/i,
    "CREATE TRIGGER ",
  );
}

async function captureDeleteTriggers(connection) {
  const names = [
    "portal_inventory_item_events_prevent_delete",
    "portal_token_ledger_prevent_delete",
  ];
  const definitions = [];
  for (const name of names) {
    const [[present]] = await connection.query(
      "SELECT COUNT(*) AS row_count FROM information_schema.TRIGGERS " +
        "WHERE TRIGGER_SCHEMA=DATABASE() AND TRIGGER_NAME=? " +
        "AND EVENT_MANIPULATION='DELETE'",
      [name],
    );
    if (Number(present.row_count) !== 1) {
      throw new Error(`Required immutable trigger ${name} is missing.`);
    }
    const [rows] = await connection.query(
      `SHOW CREATE TRIGGER ${quoteIdentifier(name)}`,
    );
    definitions.push({
      name,
      createSql: portableTriggerSql(
        rows[0]["SQL Original Statement"] ?? rows[0]["Create Trigger"],
      ),
    });
  }
  return definitions;
}

async function restoreTriggers(connection, definitions) {
  const failures = [];
  for (const trigger of definitions) {
    try {
      const [[row]] = await connection.query(
        "SELECT COUNT(*) AS row_count FROM information_schema.TRIGGERS " +
          "WHERE TRIGGER_SCHEMA=DATABASE() AND TRIGGER_NAME=?",
        [trigger.name],
      );
      if (Number(row.row_count) === 0) {
        await connection.query(trigger.createSql);
      }
    } catch (error) {
      failures.push(
        new Error(`Could not restore trigger ${trigger.name}.`, { cause: error }),
      );
    }
  }
  if (failures.length) {
    throw new AggregateError(failures, "Immutable trigger restoration failed.");
  }
}

async function verifyAllImmutableTriggers(connection) {
  const [[row]] = await connection.query(
    "SELECT COUNT(*) AS row_count FROM information_schema.TRIGGERS " +
      "WHERE TRIGGER_SCHEMA=DATABASE() AND TRIGGER_NAME IN (" +
      "'portal_economy_admin_audit_prevent_delete','portal_economy_admin_audit_prevent_update'," +
      "'portal_identity_audit_events_prevent_delete','portal_identity_audit_events_prevent_update'," +
      "'portal_inventory_item_events_prevent_delete','portal_inventory_item_events_prevent_update'," +
      "'portal_token_ledger_prevent_delete','portal_token_ledger_prevent_update'," +
      "'portal_vip_perk_admin_audit_prevent_delete','portal_vip_perk_admin_audit_prevent_update'," +
      "'portal_vip_perk_purchases_prevent_delete','portal_vip_perk_purchases_prevent_update')",
  );
  if (Number(row.row_count) !== 12) {
    throw new Error(`Expected all 12 immutable triggers, found ${row.row_count}.`);
  }
}

async function remove(connection, report, label, sql, values = []) {
  const [result] = await connection.execute(sql, values);
  report[label] = Number(result.affectedRows ?? 0);
}

async function assertNoInFlightEconomy(connection) {
  const checks = [
    ["processing operations", "SELECT COUNT(*) AS row_count FROM portal_economy_operations WHERE status='processing'"],
    ["unfinished activation jobs", "SELECT COUNT(*) AS row_count FROM portal_membership_activation_jobs WHERE status NOT IN ('completed','rejected')"],
    ["processing jobs", "SELECT COUNT(*) AS row_count FROM portal_economy_jobs WHERE status='processing'"],
    ["pending outbox rows", "SELECT COUNT(*) AS row_count FROM portal_outbox WHERE status<>'completed'"],
    ["pending trades", "SELECT COUNT(*) AS row_count FROM portal_economy_trades WHERE status='pending'"],
    ["held token escrow", "SELECT COUNT(*) AS row_count FROM portal_trade_token_escrow WHERE status='held'"],
  ];
  const active = [];
  for (const [label, sql] of checks) {
    const [[row]] = await connection.query(sql);
    if (Number(row.row_count)) active.push(`${label}: ${row.row_count}`);
  }
  if (active.length) {
    throw new Error(`Portal has in-flight economy work (${active.join(", ")}).`);
  }
}

const snapshot = await verifySnapshot();
const { connection, schema } = await connectUtc(process.env.PORTAL_DATABASE_URL);
if (snapshot.target.schema && String(snapshot.target.schema) !== schema) {
  await connection.end();
  throw new Error("The snapshot schema does not match the configured Portal database.");
}

const snapshotRows = new Map(
  (snapshot.target.tables ?? []).map((table) => [table.name, Number(table.rows)]),
);
for (const table of resetCountTables) {
  if (snapshotRows.has(table)) {
    const liveRows = await count(connection, table);
    if (liveRows !== snapshotRows.get(table)) {
      await connection.end();
      throw new Error(
        `Portal changed after the snapshot (${table}: snapshot ${snapshotRows.get(table)}, live ${liveRows}).`,
      );
    }
  }
}

const report = {
  format: "tappd-player-economy-reset-report-v1",
  startedAt: new Date().toISOString(),
  snapshotCreatedAt: snapshot.manifest.createdAt,
  schema,
  before: {
    protected: await tableState(connection, protectedTables),
    resetRows: Object.fromEntries(
      await Promise.all(
        resetCountTables.map(async (table) => [table, await count(connection, table)]),
      ),
    ),
    activeThemeSelections: await count(
      connection,
      "portal_player_settings",
      "WHERE active_theme_id IS NOT NULL OR active_theme_item_id IS NOT NULL",
    ),
  },
  removed: {},
};

const lockName = "arena_portal_economy_public_price_refresh";
let triggerDefinitions = [];
let triggersRestored = false;
try {
  await acquireLock(connection, lockName);
  await assertNoInFlightEconomy(connection);
  triggerDefinitions = await captureDeleteTriggers(connection);
  for (const trigger of triggerDefinitions) {
    await connection.query(`DROP TRIGGER ${quoteIdentifier(trigger.name)}`);
  }

  await connection.query("SET TRANSACTION ISOLATION LEVEL SERIALIZABLE");
  await connection.beginTransaction();
  try {
    for (const table of resetCountTables) {
      const orderColumn = table === "portal_token_accounts" ? "steam_id" : null;
      if (orderColumn) {
        await connection.query(
          `SELECT ${quoteIdentifier(orderColumn)} FROM ${quoteIdentifier(table)} ` +
            `ORDER BY ${quoteIdentifier(orderColumn)} FOR UPDATE`,
        );
      } else {
        await connection.query(`SELECT * FROM ${quoteIdentifier(table)} FOR UPDATE`);
      }
    }
    await connection.query(
      "SELECT steam_id FROM portal_player_settings ORDER BY steam_id FOR UPDATE",
    );

    await remove(connection, report.removed, "membershipActivationJobs", "DELETE FROM portal_membership_activation_jobs");
    await remove(connection, report.removed, "tradeItems", "DELETE FROM portal_trade_items");
    await remove(connection, report.removed, "tradeTokenEscrow", "DELETE FROM portal_trade_token_escrow");
    await remove(connection, report.removed, "trades", "DELETE FROM portal_economy_trades");
    await remove(connection, report.removed, "crateOpenings", "DELETE FROM portal_crate_openings");
    await remove(connection, report.removed, "dropAwards", "DELETE FROM portal_drop_awards");
    await remove(connection, report.removed, "groupRewardAwards", "DELETE FROM portal_identity_group_reward_awards");
    await remove(connection, report.removed, "inventoryEvents", "DELETE FROM portal_inventory_item_events");
    await remove(connection, report.removed, "stickerAttachments", "DELETE FROM portal_inventory_item_stickers");
    await remove(connection, report.removed, "loadoutSlots", "DELETE FROM portal_loadout_slots");
    await remove(
      connection,
      report.removed,
      "activeThemeSelections",
      "UPDATE portal_player_settings SET active_theme_id=NULL, active_theme_item_id=NULL " +
        "WHERE active_theme_id IS NOT NULL OR active_theme_item_id IS NOT NULL",
    );
    await remove(connection, report.removed, "themeOwnership", "DELETE FROM portal_player_theme_ownership");
    await remove(connection, report.removed, "inventoryItems", "DELETE FROM portal_inventory_items");
    await remove(connection, report.removed, "tokenLedger", "DELETE FROM portal_token_ledger");
    await remove(
      connection,
      report.removed,
      "tokenAccountsReset",
      "UPDATE portal_token_accounts SET balance=0, lifetime_earned=0, lifetime_spent=0 " +
        "WHERE balance<>0 OR lifetime_earned<>0 OR lifetime_spent<>0",
    );
    await remove(connection, report.removed, "economyJobs", "DELETE FROM portal_economy_jobs");
    await remove(connection, report.removed, "economyNotifications", "DELETE FROM portal_economy_notifications");
    await remove(connection, report.removed, "economyOperations", "DELETE FROM portal_economy_operations");
    await remove(connection, report.removed, "outbox", "DELETE FROM portal_outbox");

    await connection.commit();
  } catch (error) {
    await connection.rollback();
    throw error;
  } finally {
    await restoreTriggers(connection, triggerDefinitions);
    await verifyAllImmutableTriggers(connection);
    triggersRestored = true;
  }

  report.after = {
    protected: await tableState(connection, protectedTables),
    resetRows: Object.fromEntries(
      await Promise.all(
        resetCountTables.map(async (table) => [table, await count(connection, table)]),
      ),
    ),
    activeThemeSelections: await count(
      connection,
      "portal_player_settings",
      "WHERE active_theme_id IS NOT NULL OR active_theme_item_id IS NOT NULL",
    ),
  };
  const [[tokens]] = await connection.query(
    "SELECT COUNT(*) AS accounts, COALESCE(SUM(balance),0) AS balance, " +
      "COALESCE(SUM(lifetime_earned),0) AS earned, COALESCE(SUM(lifetime_spent),0) AS spent " +
      "FROM portal_token_accounts",
  );
  report.after.tokenState = {
    accounts: Number(tokens.accounts),
    balance: String(tokens.balance),
    lifetimeEarned: String(tokens.earned),
    lifetimeSpent: String(tokens.spent),
  };
  report.protectedStateMatches =
    JSON.stringify(report.before.protected) ===
    JSON.stringify(report.after.protected);
  const nonEmpty = Object.entries(report.after.resetRows).filter(
    ([table, rows]) => table !== "portal_token_accounts" && Number(rows) !== 0,
  );
  if (
    !report.protectedStateMatches ||
    nonEmpty.length ||
    report.after.activeThemeSelections !== 0 ||
    report.after.tokenState.balance !== "0" ||
    report.after.tokenState.lifetimeEarned !== "0" ||
    report.after.tokenState.lifetimeSpent !== "0"
  ) {
    throw new Error("The player economy reset committed but postcondition verification failed.");
  }
  report.completedAt = new Date().toISOString();
} finally {
  try {
    if (triggerDefinitions.length && !triggersRestored) {
      await restoreTriggers(connection, triggerDefinitions);
    }
  } finally {
    try {
      await releaseLock(connection, lockName);
    } finally {
      await connection.end();
      fs.writeFileSync(
        path.join(snapshotDir, "economy-reset-report.json"),
        `${JSON.stringify(report, null, 2)}\n`,
        { flag: "wx" },
      );
    }
  }
}

console.log(JSON.stringify({
  completedAt: report.completedAt,
  removed: report.removed,
  after: report.after,
  protectedStateMatches: report.protectedStateMatches,
}, null, 2));
