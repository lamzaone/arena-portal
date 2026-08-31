#!/usr/bin/env node

import { createHash } from "node:crypto";
import process from "node:process";
import mysql from "mysql2/promise";

import { configuredArenaServerScopeLink } from "../lib/data/arena-scope-resolution.mjs";

const MIGRATION_ACTOR = "migration:arena-group-authority-v1";
const UUID_NAMESPACE = "4d0af56f-9bc8-5e2c-9aa1-efbe5f8a62b4";
const GLOBAL_SCOPE_UUID = "00000000-0000-0000-0000-000000000001";
const STEAM_ID64_BASE = 76561197960265728n;
const STEAM_ACCOUNT_ID_MAX = 4294967295n;
const STEAM_ID64_MAX = STEAM_ID64_BASE + STEAM_ACCOUNT_ID_MAX;
const UNKNOWN_START = "1970-01-01 00:00:00.000000";
const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const STEAM_ID_PATTERN = /^7656119[0-9]{10}$/;

const REQUIRED_GAME_TABLES = new Map([
  ["arena_scopes", ["scope_uuid", "scope_type", "admin_server_guid", "vip_server_id"]],
  ["arena_groups", ["group_uuid", "group_key", "group_type", "vip_family_key"]],
  ["arena_group_scopes", ["group_id", "scope_id", "rank_weight_override"]],
  ["arena_group_memberships", ["membership_uuid", "provenance_type", "source_inventory_item_id"]],
  ["arena_vip_subscriptions", [
    "steam_id",
    "scope_id",
    "vip_family_key",
    "group_type",
    "legacy_suppressed_until",
    "legacy_suppressed_permanently",
  ]],
  ["arena_vip_subscription_history", ["transition_uuid", "metadata"]],
  ["arena_membership_commands", [
    "command_uuid",
    "issuer_request_key",
    "source_inventory_item_id",
    "reserved_inventory_item_id",
    "rate_snapshot_expires_at",
    "status",
  ]],
  ["arena_membership_command_receipts", ["command_uuid", "result_hash", "result"]],
  ["arena_membership_outbox", ["event_uuid", "deduplication_key", "payload", "status"]],
]);

const REQUIRED_PORTAL_TABLES = new Map([
  ["portal_identity_group_listings", [
    "arena_group_uuid",
    "arena_group_key",
    "arena_scope_uuid",
    "arena_group_row_version",
  ]],
  ["portal_identity_group_rewards", [
    "arena_group_uuid",
    "arena_group_key",
    "arena_scope_uuid",
  ]],
  ["portal_arena_group_catalogue_targets", [
    "arena_group_uuid",
    "arena_scope_uuid",
    "target_snapshot",
  ]],
  ["portal_membership_activation_jobs", [
    "job_uuid",
    "arena_command_uuid",
    "item_id",
    "reserved_item_id",
    "arena_group_uuid",
    "arena_scope_uuid",
    "rate_snapshot_expires_at",
    "status",
  ]],
  ["portal_arena_membership_event_receipts", [
    "arena_event_uuid",
    "payload_hash",
    "status",
  ]],
]);

const REQUIRED_GAME_SOURCE_TABLES = new Map([
  ["admins", ["Id", "SteamId64", "Permissions", "Groups", "Immunity", "Servers"]],
  ["groups", ["Id", "Name", "Permissions", "Servers", "Immunity"]],
  ["servers", ["Id", "Hostname", "GUID"]],
  ["vip_users", ["account_id", "sid", "group", "expires"]],
  ["vip_servers", ["serverId"]],
  ["vip_group_definitions", ["server_id", "name", "weight", "values_json", "enabled"]],
]);

const REQUIRED_PORTAL_SOURCE_TABLES = new Map([
  ["portal_identity_groups", [
    "id",
    "group_key",
    "source_type",
    "external_key",
    "display_name",
    "description",
    "badge_label",
    "badge_icon_key",
    "badge_color",
    "badge_soft_color",
    "profile_priority",
    "enabled",
  ]],
  ["portal_identity_group_listings", [
    "id",
    "group_id",
    "catalogue_id",
    "duration_minutes",
    "euro_price_cents",
    "token_price",
    "enabled",
    "vip_page_enabled",
    "market_enabled",
  ]],
  ["portal_identity_group_rewards", ["id", "group_id", "catalogue_id"]],
  ["portal_identity_external_group_definitions", [
    "group_id",
    "rank_weight",
    "definition",
    "baseline_permissions",
    "capability_keys",
    "source_kind",
  ]],
  ["portal_identity_privileges", ["id", "privilege_key", "scope", "enabled"]],
  ["portal_identity_group_privileges", ["group_id", "privilege_id"]],
  ["portal_identity_chat_tags", [
    "id",
    "tag_key",
    "tag_text",
    "color_token",
    "name_color_token",
    "message_color_token",
    "enabled",
  ]],
  ["portal_identity_group_chat_tags", ["group_id", "tag_id", "sort_order"]],
  ["portal_vip_perks", ["id", "perk_key", "enabled"]],
  ["portal_vip_perk_group_grants", [
    "id",
    "group_id",
    "perk_id",
    "configuration_override",
    "starts_at",
    "expires_at",
    "revoked_at",
  ]],
]);

function usage() {
  console.log(`Usage: node scripts/migrate-arena-group-authority.mjs [--apply]

Reads GAME_DATABASE_URL and PORTAL_DATABASE_URL.

Without --apply the command performs a read-only preflight and prints the
deterministic import plan. --apply writes additive/upserted authority rows and
portal bridge projections only when every required migration is present and
no blocking conflict remains. Stop membership writers before applying.`);
}

function parseArguments(argv) {
  let apply = false;
  for (const argument of argv) {
    if (argument === "--apply") apply = true;
    else if (argument === "--dry-run") apply = false;
    else if (argument === "--help" || argument === "-h") {
      usage();
      process.exit(0);
    } else {
      throw new Error(`Unknown argument: ${argument}`);
    }
  }
  return { apply };
}

function issueCollector() {
  const blockers = [];
  const warnings = [];
  const resolutions = [];
  return {
    blockers,
    warnings,
    resolutions,
    block(code, message, details = undefined) {
      blockers.push({ code, message, details });
    },
    warn(code, message, details = undefined) {
      warnings.push({ code, message, details });
    },
    resolve(code, message, details = undefined) {
      resolutions.push({ code, message, details });
    },
  };
}

function uuidBytes(uuid) {
  const normalized = String(uuid).toLowerCase().replaceAll("-", "");
  if (!/^[0-9a-f]{32}$/.test(normalized)) throw new Error(`Invalid UUID namespace: ${uuid}`);
  return Buffer.from(normalized, "hex");
}

function formatUuid(bytes) {
  const hex = Buffer.from(bytes).toString("hex");
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
}

function deterministicUuid(name) {
  const digest = createHash("sha1")
    .update(uuidBytes(UUID_NAMESPACE))
    .update(Buffer.from(String(name), "utf8"))
    .digest()
    .subarray(0, 16);
  digest[6] = (digest[6] & 0x0f) | 0x50;
  digest[8] = (digest[8] & 0x3f) | 0x80;
  return formatUuid(digest).toLowerCase();
}

function shortHash(value, length = 10) {
  return createHash("sha256").update(String(value)).digest("hex").slice(0, length);
}

function normalizedName(value) {
  return String(value ?? "").trim().toLocaleLowerCase("en-US");
}

function normalizedGuid(value) {
  const guid = String(value ?? "").trim().toLowerCase();
  return UUID_PATTERN.test(guid) ? guid : null;
}

function safeKeySegment(value) {
  const segment = normalizedName(value)
    .normalize("NFKD")
    .replace(/[^a-z0-9._:-]+/g, ".")
    .replace(/^[^a-z0-9]+/, "")
    .replace(/\.+/g, ".")
    .replace(/[.:-]+$/, "");
  return segment || "unnamed";
}

function boundedKey(prefix, value, identity, maxLength = 64) {
  const raw = `${prefix}.${safeKeySegment(value)}`;
  if (raw.length <= maxLength) return raw;
  const suffix = `.${shortHash(identity)}`;
  return `${raw.slice(0, maxLength - suffix.length).replace(/[.:-]+$/, "")}${suffix}`;
}

function asBoolean(value) {
  return value === true || value === 1 || value === "1" || value === "true";
}

function asIntegerString(value, label, issues) {
  const text = String(value ?? "").trim();
  if (!/^-?[0-9]+$/.test(text)) {
    issues.block("invalid-integer", `${label} is not an integer.`, { value: text });
    return null;
  }
  return text;
}

function steamId64FromLegacy(value, label, issues) {
  const integer = asIntegerString(value, label, issues);
  if (integer === null) return null;
  let parsed;
  try {
    parsed = BigInt(integer);
  } catch {
    issues.block("invalid-steam-id", `${label} cannot be parsed exactly as BigInt.`, { value: integer });
    return null;
  }
  if (parsed > 0n && parsed <= STEAM_ACCOUNT_ID_MAX) parsed += STEAM_ID64_BASE;
  if (parsed < STEAM_ID64_BASE || parsed > STEAM_ID64_MAX) {
    issues.block("invalid-steam-id", `${label} is neither an AccountID nor a SteamID64.`, { value: integer });
    return null;
  }
  const steamId = parsed.toString();
  if (!STEAM_ID_PATTERN.test(steamId)) {
    issues.block("invalid-steam-id", `${label} does not normalize to a valid SteamID64.`, { value: integer });
    return null;
  }
  return steamId;
}

function requireSteamId64(value, label, issues) {
  const text = String(value ?? "").trim();
  if (!STEAM_ID_PATTERN.test(text)) {
    issues.block("invalid-steam-id", `${label} is not a valid SteamID64.`, { value: text });
    return null;
  }
  return text;
}

function parseJson(value, fallback, label, issues) {
  if (value === null || value === undefined || value === "") return fallback;
  if (typeof value === "object") return value;
  try {
    return JSON.parse(String(value));
  } catch (error) {
    issues.block("invalid-json", `${label} contains invalid JSON.`, { error: error.message });
    return fallback;
  }
}

function parseStringArray(value, label, issues) {
  const parsed = parseJson(value, [], label, issues);
  if (!Array.isArray(parsed) || parsed.some((entry) => typeof entry !== "string")) {
    issues.block("invalid-json-shape", `${label} must be a JSON array of strings.`);
    return [];
  }
  return [...new Set(parsed.map((entry) => entry.trim()).filter(Boolean))];
}

function dateMilliseconds(value) {
  if (value === null || value === undefined || value === "") return null;
  if (value instanceof Date) return value.getTime();
  const text = String(value).trim();
  const normalized = /[zZ]|[+-][0-9]{2}:[0-9]{2}$/.test(text)
    ? text
    : `${text.replace(" ", "T")}Z`;
  const milliseconds = Date.parse(normalized);
  return Number.isFinite(milliseconds) ? milliseconds : null;
}

function mysqlDate(value, label, issues) {
  if (value === null || value === undefined || value === "") return null;
  const milliseconds = dateMilliseconds(value);
  if (milliseconds === null) {
    issues.block("invalid-date", `${label} is not a valid date.`, { value: String(value) });
    return null;
  }
  return new Date(milliseconds).toISOString().replace("T", " ").replace("Z", "000");
}

function mysqlDateFromUnixSeconds(value, label, issues) {
  const integer = asIntegerString(value, label, issues);
  if (integer === null) return null;
  const seconds = BigInt(integer);
  if (seconds === 0n) return null;
  if (seconds < 0n || seconds > 253402300799n) {
    issues.block("invalid-expiry", `${label} is outside the supported DATETIME range.`, { value: integer });
    return null;
  }
  const milliseconds = seconds * 1000n;
  if (milliseconds > BigInt(Number.MAX_SAFE_INTEGER)) {
    issues.block("invalid-expiry", `${label} exceeds JavaScript's exact Date range.`, { value: integer });
    return null;
  }
  return new Date(Number(milliseconds)).toISOString().replace("T", " ").replace("Z", "000");
}

function earlierDate(left, right) {
  if (left === null) return right;
  if (right === null) return left;
  return dateMilliseconds(left) <= dateMilliseconds(right) ? left : right;
}

function laterFiniteDate(left, right) {
  if (left === null) return right;
  if (right === null) return left;
  return dateMilliseconds(left) >= dateMilliseconds(right) ? left : right;
}

function laterExpiry(left, right) {
  if (left === null || right === null) return null;
  return laterFiniteDate(left, right);
}

function truncate(value, maxLength) {
  const text = String(value ?? "").trim();
  return text.length <= maxLength ? text : text.slice(0, maxLength);
}

function inventoryItemFromReason(reason) {
  const text = String(reason ?? "");
  if (!/^Activated inventory (?:VIP |membership )?item /i.test(text)) return null;
  const match = text.match(/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/i);
  return match ? match[0].toLowerCase() : null;
}

async function connectDatabase(url, label) {
  if (!url?.trim()) throw new Error(`${label} is required.`);
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
    throw new Error(
      `${label} did not establish a UTC database session; refusing to translate TIMESTAMP values into UTC DATETIME columns.`,
    );
  }
  return connection;
}

async function inspectSchema(connection) {
  const [rows] = await connection.query(
    "SELECT TABLE_NAME, COLUMN_NAME FROM information_schema.COLUMNS " +
      "WHERE TABLE_SCHEMA = DATABASE() ORDER BY TABLE_NAME, ORDINAL_POSITION",
  );
  const tables = new Map();
  for (const row of rows) {
    const table = String(row.TABLE_NAME);
    if (!tables.has(table)) tables.set(table, new Set());
    tables.get(table).add(String(row.COLUMN_NAME));
  }
  return tables;
}

function requireSchema(schema, required, databaseLabel, issues) {
  let ready = true;
  for (const [table, columns] of required) {
    const actual = schema.get(table);
    if (!actual) {
      ready = false;
      issues.block("migration-missing", `${databaseLabel} table ${table} is missing.`);
      continue;
    }
    for (const column of columns) {
      if (!actual.has(column)) {
        ready = false;
        issues.block("migration-incomplete", `${databaseLabel} column ${table}.${column} is missing.`);
      }
    }
  }
  return ready;
}

async function optionalQuery(connection, schema, table, sql, parameters = []) {
  if (!schema.has(table)) return [];
  const [rows] = await connection.query(sql, parameters);
  return rows;
}

function hasColumns(schema, table, columns) {
  const actual = schema.get(table);
  return Boolean(actual && columns.every((column) => actual.has(column)));
}

function nullableColumn(schema, table, column) {
  return schema.get(table)?.has(column) ? column : `NULL AS ${column}`;
}

async function loadSources(game, portal, gameSchema, portalSchema) {
  const gameSources = {
    admins: await optionalQuery(game, gameSchema, "admins", "SELECT Id, SteamId64, Permissions, `Groups`, Immunity, Servers FROM admins ORDER BY Id"),
    adminGroups: await optionalQuery(game, gameSchema, "groups", "SELECT Id, Name, Permissions, Servers, Immunity FROM `groups` ORDER BY Id"),
    adminServers: await optionalQuery(game, gameSchema, "servers", "SELECT Id, Hostname, GUID FROM servers ORDER BY Id"),
    vipUsers: await optionalQuery(game, gameSchema, "vip_users", "SELECT account_id, sid, `group`, expires FROM vip_users ORDER BY sid, account_id, `group`"),
    vipServers: await optionalQuery(game, gameSchema, "vip_servers", "SELECT serverId FROM vip_servers ORDER BY serverId"),
    vipDefinitions: await optionalQuery(game, gameSchema, "vip_group_definitions", "SELECT server_id, name, weight, values_json, enabled FROM vip_group_definitions ORDER BY server_id, weight DESC, name"),
  };

  const externalDefinitionsReady = hasColumns(
    portalSchema,
    "portal_identity_external_group_definitions",
    ["group_id", "rank_weight", "definition", "baseline_permissions", "capability_keys", "source_kind"],
  );
  const groupProjection = externalDefinitionsReady
    ? "external_definition.rank_weight, external_definition.definition, " +
      "external_definition.baseline_permissions, external_definition.capability_keys, external_definition.source_kind"
    : "NULL AS rank_weight, NULL AS definition, NULL AS baseline_permissions, " +
      "NULL AS capability_keys, NULL AS source_kind";
  const groupJoin = externalDefinitionsReady
    ? " LEFT JOIN portal_identity_external_group_definitions external_definition " +
      "ON external_definition.group_id = identity_group.id"
    : "";
  const listingBridgeProjection = [
    nullableColumn(portalSchema, "portal_identity_group_listings", "arena_group_uuid"),
    nullableColumn(portalSchema, "portal_identity_group_listings", "arena_group_key"),
    nullableColumn(portalSchema, "portal_identity_group_listings", "arena_scope_uuid"),
    nullableColumn(portalSchema, "portal_identity_group_listings", "arena_group_row_version"),
  ].join(", ");
  const rewardBridgeProjection = [
    nullableColumn(portalSchema, "portal_identity_group_rewards", "arena_group_uuid"),
    nullableColumn(portalSchema, "portal_identity_group_rewards", "arena_group_key"),
    nullableColumn(portalSchema, "portal_identity_group_rewards", "arena_scope_uuid"),
  ].join(", ");

  const portalSources = {
    groups: await optionalQuery(portal, portalSchema, "portal_identity_groups",
      `SELECT identity_group.*, ${groupProjection} FROM portal_identity_groups identity_group${groupJoin} ORDER BY identity_group.id`),
    // These two Portal tables are rollback snapshots, never live authority.
    // If present, an explicit offline migration may import them; a fresh
    // Portal schema is deliberately valid without either legacy source.
    memberships: await optionalQuery(portal, portalSchema, "portal_identity_group_memberships",
      "SELECT group_id, steam_id, starts_at, expires_at, granted_by_steam_id, grant_reason, " +
        "revoked_at, revoked_by_steam_id " +
        "FROM portal_identity_group_memberships ORDER BY group_id, steam_id"),
    conversionStates: await optionalQuery(portal, portalSchema, "portal_vip_membership_conversion_state",
      "SELECT steam_id, group_id, entitlement_expires_at, native_suppressed_until, " +
        "native_suppressed_permanently FROM portal_vip_membership_conversion_state ORDER BY steam_id"),
    listings: await optionalQuery(portal, portalSchema, "portal_identity_group_listings",
      "SELECT id, group_id, catalogue_id, duration_minutes, euro_price_cents, token_price, " +
        `enabled, vip_page_enabled, market_enabled, ${listingBridgeProjection} ` +
        "FROM portal_identity_group_listings ORDER BY id"),
    rewards: await optionalQuery(portal, portalSchema, "portal_identity_group_rewards",
      "SELECT id, group_id, catalogue_id, " +
        `${rewardBridgeProjection} FROM portal_identity_group_rewards ORDER BY id`),
    catalogueTargets: hasColumns(portalSchema, "portal_arena_group_catalogue_targets", [
      "catalogue_id",
      "listing_id",
      "legacy_portal_group_id",
      "arena_group_uuid",
      "arena_group_key",
      "arena_scope_uuid",
      "arena_group_type",
      "arena_group_row_version",
      "duration_minutes",
      "enabled",
    ]) ? await optionalQuery(portal, portalSchema, "portal_arena_group_catalogue_targets",
      "SELECT catalogue_id, listing_id, legacy_portal_group_id, arena_group_uuid, arena_group_key, " +
        "arena_scope_uuid, arena_group_type, arena_group_row_version, duration_minutes, enabled " +
        "FROM portal_arena_group_catalogue_targets ORDER BY catalogue_id") : [],
    groupPrivileges: hasColumns(portalSchema, "portal_identity_group_privileges", ["group_id", "privilege_id"])
      && hasColumns(portalSchema, "portal_identity_privileges", ["id", "privilege_key", "scope", "enabled"])
      ? await optionalQuery(portal, portalSchema, "portal_identity_group_privileges",
      "SELECT assigned.group_id, privilege.privilege_key, privilege.scope, privilege.enabled " +
        "FROM portal_identity_group_privileges assigned " +
        "INNER JOIN portal_identity_privileges privilege ON privilege.id = assigned.privilege_id " +
        "ORDER BY assigned.group_id, privilege.privilege_key")
      : [],
    groupChatTags: hasColumns(portalSchema, "portal_identity_group_chat_tags", ["group_id", "tag_id", "sort_order"])
      && hasColumns(portalSchema, "portal_identity_chat_tags", ["id", "tag_key", "tag_text", "color_token", "enabled"])
      ? await optionalQuery(portal, portalSchema, "portal_identity_group_chat_tags",
      "SELECT assigned.group_id, assigned.sort_order, tag.tag_key, tag.tag_text, tag.color_token, " +
        "tag.name_color_token, tag.message_color_token, tag.enabled " +
        "FROM portal_identity_group_chat_tags assigned " +
        "INNER JOIN portal_identity_chat_tags tag ON tag.id = assigned.tag_id " +
        "ORDER BY assigned.group_id, assigned.sort_order, tag.id")
      : [],
    groupPerks: hasColumns(portalSchema, "portal_vip_perk_group_grants", ["id", "group_id", "perk_id"])
      && hasColumns(portalSchema, "portal_vip_perks", ["id", "perk_key", "enabled"])
      ? await optionalQuery(portal, portalSchema, "portal_vip_perk_group_grants",
      "SELECT assigned_perk.group_id, perk.perk_key, perk.enabled AS perk_enabled, assigned_perk.configuration_override, " +
        "assigned_perk.starts_at, assigned_perk.expires_at, assigned_perk.revoked_at " +
        "FROM portal_vip_perk_group_grants assigned_perk " +
        "INNER JOIN portal_vip_perks perk ON perk.id = assigned_perk.perk_id " +
        "ORDER BY assigned_perk.group_id, perk.perk_key, assigned_perk.id")
      : [],
  };
  return { game: gameSources, portal: portalSources };
}

async function loadTargets(game, gameSchema) {
  return {
    scopes: await optionalQuery(game, gameSchema, "arena_scopes", "SELECT * FROM arena_scopes ORDER BY id"),
    groups: await optionalQuery(game, gameSchema, "arena_groups", "SELECT * FROM arena_groups ORDER BY id"),
    groupScopes: await optionalQuery(game, gameSchema, "arena_group_scopes", "SELECT * FROM arena_group_scopes ORDER BY group_id, scope_id"),
    memberships: await optionalQuery(game, gameSchema, "arena_group_memberships", "SELECT * FROM arena_group_memberships ORDER BY membership_uuid"),
    subscriptions: await optionalQuery(game, gameSchema, "arena_vip_subscriptions", "SELECT * FROM arena_vip_subscriptions ORDER BY steam_id, scope_id, vip_family_key"),
    history: await optionalQuery(game, gameSchema, "arena_vip_subscription_history", "SELECT * FROM arena_vip_subscription_history ORDER BY transition_uuid"),
  };
}

function buildScopePlan(sources, targets, issues) {
  const planned = new Map();
  const byAdminGuid = new Map();
  const byVipServerId = new Map();
  const targetByUuid = new Map(targets.scopes.map((row) => [String(row.scope_uuid).toLowerCase(), row]));
  const targetByAdminGuid = new Map(
    targets.scopes
      .filter((row) => row.admin_server_guid)
      .map((row) => [String(row.admin_server_guid).toLowerCase(), row]),
  );
  const targetByVipServerId = new Map(
    targets.scopes
      .filter((row) => row.vip_server_id !== null)
      .map((row) => [String(row.vip_server_id), row]),
  );
  const configuredPhysicalServer = configuredArenaServerScopeLink(
    process.env.GAME_SERVER_GUID,
    process.env.GAME_VIP_SERVER_ID ?? "1",
  );
  const configuredSplitVipIds = new Set();

  function addScope(input) {
    const uuid = input.scopeUuid.toLowerCase();
    const existingPlan = planned.get(uuid);
    if (existingPlan) {
      if (input.adminServerGuid && existingPlan.adminServerGuid && input.adminServerGuid !== existingPlan.adminServerGuid) {
        issues.block("scope-collision", "A deterministic scope UUID resolved to two Admins.Core GUIDs.", { uuid });
      }
      if (input.vipServerId !== null && existingPlan.vipServerId !== null && input.vipServerId !== existingPlan.vipServerId) {
        issues.block("scope-collision", "A deterministic scope UUID resolved to two VIPCore server IDs.", { uuid });
      }
      existingPlan.adminServerGuid ??= input.adminServerGuid;
      existingPlan.vipServerId ??= input.vipServerId;
      existingPlan.sources.push(...input.sources);
      if (existingPlan.adminServerGuid) byAdminGuid.set(existingPlan.adminServerGuid, existingPlan);
      if (existingPlan.vipServerId !== null) byVipServerId.set(existingPlan.vipServerId, existingPlan);
      return existingPlan;
    }
    const scope = { ...input, sources: [...input.sources] };
    planned.set(uuid, scope);
    if (scope.adminServerGuid) byAdminGuid.set(scope.adminServerGuid, scope);
    if (scope.vipServerId !== null) byVipServerId.set(scope.vipServerId, scope);
    return scope;
  }

  addScope({
    scopeUuid: GLOBAL_SCOPE_UUID,
    scopeKey: "global",
    scopeType: "global",
    displayName: "All ARENA servers",
    adminServerGuid: null,
    vipServerId: "0",
    enabled: true,
    sources: ["arena:global", "vip-server:0"],
  });

  const adminServerNames = new Map();
  const observedAdminGuids = new Set();
  for (const row of sources.game.adminServers) {
    const raw = String(row.GUID ?? "").trim();
    const guid = normalizedGuid(raw);
    if (!guid) {
      if (raw) issues.block("invalid-admin-server-guid", "An Admins.Core servers row has an invalid GUID.", { serverId: String(row.Id) });
      continue;
    }
    observedAdminGuids.add(guid);
    adminServerNames.set(guid, truncate(row.Hostname || `Admins.Core server ${row.Id}`, 100));
  }
  for (const row of sources.game.adminGroups) {
    for (const raw of parseStringArray(row.Servers, `groups.${row.Id}.Servers`, issues)) {
      const guid = normalizedGuid(raw);
      if (!guid) issues.block("invalid-admin-server-guid", "An Admins.Core group references an invalid server GUID.", { group: String(row.Name), value: raw });
      else observedAdminGuids.add(guid);
    }
  }
  for (const row of sources.game.admins) {
    for (const raw of parseStringArray(row.Servers, `admins.${row.Id}.Servers`, issues)) {
      const guid = normalizedGuid(raw);
      if (!guid) issues.block("invalid-admin-server-guid", "An Admins.Core admin references an invalid server GUID.", { adminId: String(row.Id), value: raw });
      else observedAdminGuids.add(guid);
    }
  }

  const observedVipIds = new Set(["0"]);
  for (const row of sources.game.vipServers) {
    const id = asIntegerString(row.serverId, "vip_servers.serverId", issues);
    if (id === null || BigInt(id) < 0n) continue;
    observedVipIds.add(id);
  }
  for (const row of sources.game.vipDefinitions) {
    const id = asIntegerString(row.server_id, "vip_group_definitions.server_id", issues);
    if (id !== null && BigInt(id) >= 0n) observedVipIds.add(id);
  }
  for (const row of sources.game.vipUsers) {
    const id = asIntegerString(row.sid, "vip_users.sid", issues);
    if (id !== null && BigInt(id) >= 0n) observedVipIds.add(id);
  }

  for (const guid of [...observedAdminGuids].sort()) {
    const linkedVipServerId = configuredPhysicalServer?.adminServerGuid === guid &&
        observedVipIds.has(String(configuredPhysicalServer.vipServerId))
      ? String(configuredPhysicalServer.vipServerId)
      : null;
    const targetByGuid = targetByAdminGuid.get(guid);
    const targetByLinkedVip = linkedVipServerId === null
      ? null
      : targetByVipServerId.get(linkedVipServerId);
    if (
      targetByGuid && targetByLinkedVip &&
      String(targetByGuid.scope_uuid).toLowerCase() !==
        String(targetByLinkedVip.scope_uuid).toLowerCase()
    ) {
      issues.block(
        "scope-split",
        "The configured physical server already has separate Admins.Core and VIPCore Arena scopes.",
        { vipServerId: linkedVipServerId, adminServerGuid: guid },
      );
      configuredSplitVipIds.add(linkedVipServerId);
    }
    // The Admins.Core scope is canonical for an existing split because its
    // UUID is already used by server-scoped staff access and runtime config.
    const target = targetByGuid ?? targetByLinkedVip;
    const scopeUuid = target
      ? String(target.scope_uuid).toLowerCase()
      : deterministicUuid(`scope:server:admin-guid:${guid}`);
    addScope({
      scopeUuid,
      scopeKey: linkedVipServerId !== null
        ? boundedKey("server", guid, guid, 96)
        : target
          ? String(target.scope_key)
          : boundedKey("server", guid, guid, 96),
      scopeType: "server",
      displayName: adminServerNames.get(guid) || `Admins.Core server ${guid.slice(0, 8)}`,
      adminServerGuid: guid,
      vipServerId: linkedVipServerId,
      enabled: true,
      sources: [
        `admin-guid:${guid}`,
        ...(linkedVipServerId === null ? [] : [`vip-server:${linkedVipServerId}`]),
      ],
    });
  }

  for (const id of [...observedVipIds].sort((left, right) => {
    const leftValue = BigInt(left);
    const rightValue = BigInt(right);
    return leftValue < rightValue ? -1 : leftValue > rightValue ? 1 : 0;
  })) {
    if (id === "0") continue;
    const adminGuid = configuredPhysicalServer &&
        String(configuredPhysicalServer.vipServerId) === id &&
        observedAdminGuids.has(configuredPhysicalServer.adminServerGuid)
      ? configuredPhysicalServer.adminServerGuid
      : null;
    const matchedByGuid = adminGuid ? byAdminGuid.get(adminGuid) : null;
    const targetById = targetByVipServerId.get(id);
    if (
      matchedByGuid && targetById &&
      String(targetById.scope_uuid).toLowerCase() !== matchedByGuid.scopeUuid &&
      !configuredSplitVipIds.has(id)
    ) {
      issues.block("scope-split", "The configured physical server already has separate Admins.Core and VIPCore Arena scopes.", { vipServerId: id, adminServerGuid: adminGuid });
      configuredSplitVipIds.add(id);
    }
    const target = matchedByGuid
      ? (adminGuid ? targetByAdminGuid.get(adminGuid) : null) ?? targetById
      : targetById ?? (adminGuid ? targetByAdminGuid.get(adminGuid) : null);
    const scopeUuid = target
      ? String(target.scope_uuid).toLowerCase()
      : matchedByGuid?.scopeUuid ?? deterministicUuid(`scope:server:vip-id:${id}`);
    const scope = matchedByGuid ?? addScope({
      scopeUuid,
      scopeKey: target
        ? String(target.scope_key)
        : boundedKey("server", `vip-${id}`, id, 96),
      scopeType: "server",
      displayName: adminGuid
        ? adminServerNames.get(adminGuid) || `Admins.Core server ${adminGuid.slice(0, 8)}`
        : `VIPCore server ${id}`,
      adminServerGuid: adminGuid,
      vipServerId: id,
      enabled: true,
      sources: [`vip-server:${id}`],
    });
    if (scope.vipServerId !== null && scope.vipServerId !== id) {
      issues.block("scope-vip-collision", "One arena scope cannot map to two VIPCore server IDs.", { scopeUuid: scope.scopeUuid, first: scope.vipServerId, second: id });
    } else {
      scope.vipServerId = id;
      scope.sources.push(`vip-server:${id}`);
      byVipServerId.set(id, scope);
    }
  }

  for (const scope of planned.values()) {
    const existing = targetByUuid.get(scope.scopeUuid);
    if (!existing) continue;
    if (String(existing.scope_type) !== scope.scopeType) {
      issues.block("target-scope-drift", "An existing arena scope has a different type than the deterministic plan.", { scopeUuid: scope.scopeUuid });
    }
    const existingGuid = existing.admin_server_guid ? String(existing.admin_server_guid).toLowerCase() : null;
    const existingVip = existing.vip_server_id === null ? null : String(existing.vip_server_id);
    if (existingGuid && scope.adminServerGuid && existingGuid !== scope.adminServerGuid) {
      issues.block("target-scope-drift", "An existing arena scope has a different Admins.Core GUID.", { scopeUuid: scope.scopeUuid });
    }
    if (existingVip !== null && scope.vipServerId !== null && existingVip !== scope.vipServerId) {
      issues.block("target-scope-drift", "An existing arena scope has a different VIPCore server ID.", { scopeUuid: scope.scopeUuid });
    }
  }

  return { scopes: [...planned.values()].sort((left, right) => left.scopeKey.localeCompare(right.scopeKey)), byAdminGuid, byVipServerId };
}

function addDistinct(values, additions) {
  const result = new Set(values);
  for (const value of additions) result.add(value);
  return [...result].sort();
}

function groupRows(rows, keySelector) {
  const grouped = new Map();
  for (const row of rows) {
    const key = keySelector(row);
    if (!grouped.has(key)) grouped.set(key, []);
    grouped.get(key).push(row);
  }
  return grouped;
}

function buildGroupPlan(sources, targets, scopePlan, issues) {
  const groups = new Map();
  const byPortalId = new Map();
  const byExternal = new Map();
  const usedGroupKeys = new Map();
  const targetByUuid = new Map(targets.groups.map((row) => [String(row.group_uuid).toLowerCase(), row]));
  const targetByPortalId = new Map(
    targets.groups
      .filter((row) => row.legacy_portal_group_id !== null)
      .map((row) => [String(row.legacy_portal_group_id), row]),
  );
  const targetByExternal = new Map(
    targets.groups
      .filter((row) => row.external_key)
      .map((row) => [`${row.group_type}:${normalizedName(row.external_key)}`, row]),
  );

  const privilegesByGroup = groupRows(sources.portal.groupPrivileges, (row) => String(row.group_id));
  const tagsByGroup = groupRows(sources.portal.groupChatTags, (row) => String(row.group_id));
  const perksByGroup = groupRows(sources.portal.groupPerks, (row) => String(row.group_id));

  function reserveGroupKey(candidate, identity) {
    let key = candidate;
    const owner = usedGroupKeys.get(key.toLowerCase());
    if (owner && owner !== identity) {
      const suffix = `.${shortHash(identity)}`;
      key = `${candidate.slice(0, 64 - suffix.length).replace(/[.:-]+$/, "")}${suffix}`;
    }
    usedGroupKeys.set(key.toLowerCase(), identity);
    return key;
  }

  function addOrMerge(input) {
    const externalIdentity = input.groupType === "custom"
      ? `portal:${input.legacyPortalGroupId}`
      : `${input.groupType}:${normalizedName(input.externalKey)}`;
    let group = groups.get(externalIdentity);
    if (!group) {
      const existing = input.legacyPortalGroupId !== null
        ? targetByPortalId.get(String(input.legacyPortalGroupId))
        : targetByExternal.get(`${input.groupType}:${normalizedName(input.externalKey)}`);
      const uuidIdentity = input.legacyPortalGroupId !== null
        ? `portal:${input.legacyPortalGroupId}`
        : externalIdentity;
      const deterministic = deterministicUuid(`group:${uuidIdentity}`);
      if (existing && String(existing.group_uuid).toLowerCase() !== deterministic) {
        issues.block("target-group-uuid-drift", "An existing arena group does not use the deterministic import UUID.", { identity: externalIdentity, existingUuid: String(existing.group_uuid), expectedUuid: deterministic });
      }
      const groupUuid = existing ? String(existing.group_uuid).toLowerCase() : deterministic;
      const candidateKey = input.groupKey || boundedKey(input.groupType, input.externalKey || input.displayName, externalIdentity);
      group = {
        groupUuid,
        legacyPortalGroupId: input.legacyPortalGroupId,
        groupKey: reserveGroupKey(candidateKey, externalIdentity),
        groupType: input.groupType,
        externalKey: input.groupType === "custom" ? null : String(input.externalKey).trim(),
        vipFamilyKey: input.groupType === "vip" ? "vipcore" : null,
        displayName: truncate(input.displayName, 100),
        description: input.description ? truncate(input.description, 255) : null,
        badgeLabel: truncate(input.badgeLabel || input.displayName, 32) || "GROUP",
        badgeIconKey: truncate(input.badgeIconKey || "shield", 32),
        badgeColor: input.badgeColor || "#f0b35a",
        badgeSoftColor: input.badgeSoftColor || "#ffe4b8",
        profilePriority: Number(input.profilePriority || 0),
        rankWeight: Number(input.rankWeight || 0),
        immunity: Number(input.immunity || 0),
        definition: input.definition ?? {},
        baselinePermissions: [...(input.baselinePermissions ?? [])],
        capabilityKeys: [...(input.capabilityKeys ?? [])],
        enabled: input.enabled !== false,
        sources: [...input.sources],
        scopes: new Map(),
      };
      groups.set(externalIdentity, group);
      if (group.groupType !== "custom") {
        byExternal.set(`${group.groupType}:${normalizedName(group.externalKey)}`, group);
      }
      if (group.legacyPortalGroupId !== null) byPortalId.set(String(group.legacyPortalGroupId), group);
    } else {
      if (input.legacyPortalGroupId !== null) {
        if (group.legacyPortalGroupId !== null && String(group.legacyPortalGroupId) !== String(input.legacyPortalGroupId)) {
          issues.block("ambiguous-group", "Two portal groups map to the same runtime group.", { identity: externalIdentity });
        } else {
          group.legacyPortalGroupId = String(input.legacyPortalGroupId);
          byPortalId.set(String(input.legacyPortalGroupId), group);
        }
      }
      group.sources.push(...input.sources);
      group.baselinePermissions = addDistinct(group.baselinePermissions, input.baselinePermissions ?? []);
      group.capabilityKeys = addDistinct(group.capabilityKeys, input.capabilityKeys ?? []);
      group.rankWeight = Math.max(group.rankWeight, Number(input.rankWeight || 0));
      group.immunity = Math.max(group.immunity, Number(input.immunity || 0));
      group.enabled ||= input.enabled !== false;
    }
    return group;
  }

  for (const row of sources.portal.groups) {
    const portalId = String(row.id);
    const sourceType = String(row.source_type);
    const groupType = sourceType === "admins_core" ? "admin" : sourceType === "vipcore" ? "vip" : "custom";
    const externalKey = groupType === "custom" ? null : String(row.external_key ?? "").trim();
    if (groupType !== "custom" && !externalKey) {
      issues.block("unresolved-group", "A portal external group has no external key.", { portalGroupId: portalId });
      continue;
    }
    const privileges = privilegesByGroup.get(portalId) ?? [];
    const tags = tagsByGroup.get(portalId) ?? [];
    const perks = perksByGroup.get(portalId) ?? [];
    const externalDefinition = parseJson(row.definition, {}, `portal external definition ${portalId}`, issues);
    const baseline = parseStringArray(row.baseline_permissions, `portal baseline permissions ${portalId}`, issues);
    const capabilities = parseStringArray(row.capability_keys, `portal capability keys ${portalId}`, issues);
    const portalDefinition = {
      ...((externalDefinition && typeof externalDefinition === "object" && !Array.isArray(externalDefinition)) ? externalDefinition : {}),
      migrationSource: {
        portalGroupId: portalId,
        externalSourceKind: row.source_kind ? String(row.source_kind) : null,
        privileges: privileges.map((entry) => ({ key: String(entry.privilege_key), scope: String(entry.scope), enabled: asBoolean(entry.enabled) })),
        chatTags: tags.map((entry) => ({
          key: String(entry.tag_key),
          text: String(entry.tag_text),
          color: String(entry.color_token),
          nameColor: entry.name_color_token ? String(entry.name_color_token) : null,
          messageColor: entry.message_color_token ? String(entry.message_color_token) : null,
          enabled: asBoolean(entry.enabled),
        })),
        standalonePerks: perks.map((entry) => ({
          key: String(entry.perk_key),
          enabled: asBoolean(entry.perk_enabled),
          configurationOverride: parseJson(entry.configuration_override, null, `portal perk override ${portalId}`, issues),
          startsAt: entry.starts_at,
          expiresAt: entry.expires_at,
          revokedAt: entry.revoked_at,
        })),
      },
    };
    const group = addOrMerge({
      legacyPortalGroupId: portalId,
      groupKey: String(row.group_key),
      groupType,
      externalKey,
      displayName: String(row.display_name),
      description: row.description,
      badgeLabel: row.badge_label,
      badgeIconKey: row.badge_icon_key,
      badgeColor: row.badge_color,
      badgeSoftColor: row.badge_soft_color,
      profilePriority: row.profile_priority,
      rankWeight: row.rank_weight ?? row.profile_priority,
      immunity: 0,
      definition: portalDefinition,
      baselinePermissions: baseline,
      capabilityKeys: addDistinct(
        capabilities,
        privileges.filter((entry) => asBoolean(entry.enabled)).map((entry) => String(entry.privilege_key)),
      ),
      enabled: asBoolean(row.enabled),
      sources: [`portal-group:${portalId}`],
    });
    const global = scopePlan.byVipServerId.get("0");
    group.scopes.set(global.scopeUuid, {
      scope: global,
      definitionOverride: null,
      rankWeightOverride: null,
      immunityOverride: null,
      enabled: true,
      sources: [`portal-group:${portalId}`],
    });
  }

  for (const row of sources.game.adminGroups) {
    const name = String(row.Name ?? "").trim();
    if (!name) {
      issues.block("unresolved-group", "An Admins.Core group has an empty name.", { groupId: String(row.Id) });
      continue;
    }
    const permissions = parseStringArray(row.Permissions, `groups.${row.Id}.Permissions`, issues);
    const servers = parseStringArray(row.Servers, `groups.${row.Id}.Servers`, issues);
    const group = addOrMerge({
      legacyPortalGroupId: null,
      groupKey: null,
      groupType: "admin",
      externalKey: name,
      displayName: name,
      description: "Imported Admins.Core runtime group",
      badgeLabel: name.toUpperCase(),
      rankWeight: Number(row.Immunity || 0),
      immunity: Number(row.Immunity || 0),
      definition: { source: "admins_core", name, permissions, servers, immunity: Number(row.Immunity || 0) },
      baselinePermissions: permissions,
      capabilityKeys: permissions,
      enabled: true,
      sources: [`admins-group:${row.Id}`],
    });
    group.definition = {
      source: "admins_core",
      nativeRowId: Number(row.Id),
      name,
      permissions,
      servers,
      immunity: Number(row.Immunity || 0),
    };
    group.baselinePermissions = permissions;
    group.immunity = Number(row.Immunity || 0);
    for (const rawGuid of servers) {
      const guid = normalizedGuid(rawGuid);
      if (!guid) continue;
      const scope = scopePlan.byAdminGuid.get(guid);
      if (!scope) {
        issues.block("unresolved-scope", "An Admins.Core group server GUID has no arena scope.", { group: name, serverGuid: guid });
        continue;
      }
      group.scopes.set(scope.scopeUuid, {
        scope,
        definitionOverride: group.definition,
        rankWeightOverride: null,
        immunityOverride: Number(row.Immunity || 0),
        enabled: true,
        sources: [`admins-group:${row.Id}`],
      });
    }
  }

  for (const row of sources.game.vipDefinitions) {
    const serverId = String(row.server_id);
    const name = String(row.name ?? "").trim();
    if (!name) {
      issues.block("unresolved-group", "A VIPCore definition has an empty name.", { serverId });
      continue;
    }
    const scope = scopePlan.byVipServerId.get(serverId);
    if (!scope) {
      issues.block("unresolved-scope", "A VIPCore definition server ID has no arena scope.", { serverId, group: name });
      continue;
    }
    const definition = parseJson(row.values_json, {}, `vip_group_definitions(${serverId}, ${name})`, issues);
    const group = addOrMerge({
      legacyPortalGroupId: null,
      groupKey: null,
      groupType: "vip",
      externalKey: name,
      displayName: name,
      description: "Imported VIPCore runtime group",
      badgeLabel: name.toUpperCase(),
      rankWeight: Number(row.weight || 0),
      immunity: 0,
      definition,
      baselinePermissions: [],
      capabilityKeys: Object.keys(definition ?? {}),
      enabled: asBoolean(row.enabled),
      sources: [`vip-definition:${serverId}:${name}`],
    });
    group.rankWeight = Math.max(group.rankWeight, Number(row.weight || 0));
    group.scopes.set(scope.scopeUuid, {
      scope,
      definitionOverride: {
        source: "vipcore",
        nativeServerId: Number(serverId),
        name,
        weight: Number(row.weight || 0),
        enabled: asBoolean(row.enabled),
        valuesValid: true,
        values: definition,
      },
      rankWeightOverride: Number(row.weight || 0),
      immunityOverride: null,
      enabled: asBoolean(row.enabled),
      sources: [`vip-definition:${serverId}:${name}`],
    });
  }

  for (const group of groups.values()) {
    const existing = targetByUuid.get(group.groupUuid);
    if (!existing) continue;
    if (String(existing.group_type) !== group.groupType || normalizedName(existing.external_key) !== normalizedName(group.externalKey)) {
      issues.block("target-group-drift", "An existing deterministic arena group maps to another identity.", { groupUuid: group.groupUuid });
    }
    if (group.vipFamilyKey !== (existing.vip_family_key === null ? null : String(existing.vip_family_key))) {
      issues.block("target-group-family-drift", "An existing arena VIP group has a different family key.", { groupUuid: group.groupUuid });
    }
  }

  return {
    groups: [...groups.values()].sort((left, right) => left.groupKey.localeCompare(right.groupKey)),
    byPortalId,
    byExternal,
  };
}

function membershipIsActive(membership, nowMs) {
  if (membership.status !== "active") return false;
  const starts = dateMilliseconds(membership.startsAt);
  const expires = dateMilliseconds(membership.expiresAt);
  return starts !== null && starts <= nowMs && (membership.expiresAt === null || expires > nowMs);
}

function membershipIsScheduled(membership, nowMs) {
  return membership.status === "active" && dateMilliseconds(membership.startsAt) > nowMs;
}

function buildMembershipPlan(sources, targets, scopePlan, groupPlan, issues) {
  const nowMs = Date.now();
  const memberships = new Map();
  const sourceInventoryOwners = new Map();
  const globalScope = scopePlan.byVipServerId.get("0");

  function addMembership(candidate) {
    const startsMilliseconds = dateMilliseconds(candidate.startsAt);
    const expiresMilliseconds = dateMilliseconds(candidate.expiresAt);
    if (startsMilliseconds === null) {
      issues.block("membership-start-missing", "A source membership has no valid start date.", candidate.evidence);
      return null;
    }
    if (candidate.expiresAt !== null && (expiresMilliseconds === null || expiresMilliseconds <= startsMilliseconds)) {
      issues.block("membership-date-range", "A source membership expires at or before it starts.", candidate.evidence);
      return null;
    }
    const key = `${candidate.group.groupUuid}|${candidate.scope.scopeUuid}|${candidate.steamId}`;
    const membershipUuid = deterministicUuid(`membership:${key}`);
    if (candidate.sourceInventoryItemId) {
      const prior = sourceInventoryOwners.get(candidate.sourceInventoryItemId);
      if (prior && prior !== key) {
        issues.block("inventory-reference-conflict", "One inventory item is referenced by multiple canonical memberships.", { itemId: candidate.sourceInventoryItemId, first: prior, second: key });
      } else {
        sourceInventoryOwners.set(candidate.sourceInventoryItemId, key);
      }
    }
    let membership = memberships.get(key);
    if (!membership) {
      membership = {
        key,
        membershipUuid,
        group: candidate.group,
        scope: candidate.scope,
        steamId: candidate.steamId,
        startsAt: candidate.startsAt,
        expiresAt: candidate.expiresAt,
        status: candidate.status,
        provenanceType: candidate.provenanceType,
        provenanceReference: candidate.provenanceReference,
        sourceInventoryItemId: candidate.sourceInventoryItemId,
        grantedByActor: candidate.grantedByActor,
        grantReason: candidate.grantReason,
        revokedAt: candidate.revokedAt,
        revokedByActor: candidate.revokedByActor,
        revokeReason: candidate.revokeReason,
        evidence: [candidate.evidence],
      };
      memberships.set(key, membership);
      return membership;
    }

    membership.evidence.push(candidate.evidence);
    membership.startsAt = earlierDate(membership.startsAt, candidate.startsAt);
    if (membership.status === "revoked" && candidate.status === "active") {
      membership.status = "active";
      membership.revokedAt = null;
      membership.revokedByActor = null;
      membership.revokeReason = null;
      membership.expiresAt = candidate.expiresAt;
      membership.provenanceType = candidate.provenanceType;
      membership.provenanceReference = candidate.provenanceReference;
      membership.grantedByActor = candidate.grantedByActor;
      membership.grantReason = candidate.grantReason;
    } else if (membership.status === "active" && candidate.status === "active") {
      membership.expiresAt = laterExpiry(membership.expiresAt, candidate.expiresAt);
    } else if (membership.status === "revoked" && candidate.status === "revoked") {
      membership.expiresAt = laterExpiry(membership.expiresAt, candidate.expiresAt);
      membership.revokedAt = laterFiniteDate(membership.revokedAt, candidate.revokedAt);
    }
    if (candidate.sourceInventoryItemId) {
      if (membership.sourceInventoryItemId && membership.sourceInventoryItemId !== candidate.sourceInventoryItemId) {
        issues.block("membership-source-conflict", "Merged source rows carry different inventory item references.", { membershipUuid });
      } else {
        membership.sourceInventoryItemId = candidate.sourceInventoryItemId;
        membership.provenanceType = "inventory";
      }
    }
    membership.provenanceReference = truncate(
      [...new Set(membership.evidence.map((entry) => entry.reference))].join(";"),
      191,
    );
    return membership;
  }

  for (const row of sources.game.admins) {
    const steamId = steamId64FromLegacy(row.SteamId64, `admins.${row.Id}.SteamId64`, issues);
    if (!steamId) continue;
    const groupNames = parseStringArray(row.Groups, `admins.${row.Id}.Groups`, issues);
    const serverGuids = parseStringArray(row.Servers, `admins.${row.Id}.Servers`, issues);
    const directPermissions = parseStringArray(row.Permissions, `admins.${row.Id}.Permissions`, issues);
    if (directPermissions.length) {
      issues.warn("native-admin-direct-permissions", "Player-specific Admins.Core permissions remain native because the canonical schema models group permissions.", { adminId: String(row.Id), steamId, permissionCount: directPermissions.length });
    }
    for (const groupName of groupNames) {
      const group = groupPlan.byExternal.get(`admin:${normalizedName(groupName)}`);
      if (!group) {
        issues.block("unresolved-admin-group", "A native admin references a group that has no canonical definition.", { adminId: String(row.Id), group: groupName });
        continue;
      }
      for (const rawGuid of serverGuids) {
        const guid = normalizedGuid(rawGuid);
        if (!guid) continue;
        const scope = scopePlan.byAdminGuid.get(guid);
        if (!scope) continue;
        if (!group.scopes.has(scope.scopeUuid)) {
          issues.block("admin-group-scope-mismatch", "A native admin assignment targets a server where the group is not enabled.", { adminId: String(row.Id), group: groupName, serverGuid: guid });
          continue;
        }
        const groupScope = group.scopes.get(scope.scopeUuid);
        if (Number(row.Immunity || 0) > Number(groupScope.immunityOverride ?? group.immunity)) {
          issues.warn("native-admin-immunity-override", "A native admin has player-specific immunity above the assigned group; it remains native during cutover.", { adminId: String(row.Id), steamId, group: groupName, immunity: Number(row.Immunity || 0) });
        }
        addMembership({
          group,
          scope,
          steamId,
          startsAt: UNKNOWN_START,
          expiresAt: null,
          status: "active",
          provenanceType: "legacy_admins",
          provenanceReference: `admins:${row.Id}:${groupName}:${guid}`,
          sourceInventoryItemId: null,
          grantedByActor: MIGRATION_ACTOR,
          grantReason: "Imported native Admins.Core assignment",
          revokedAt: null,
          revokedByActor: null,
          revokeReason: null,
          evidence: { kind: "native-admin", reference: `admins:${row.Id}`, expiresAt: null },
        });
      }
    }
  }

  for (const row of sources.game.vipUsers) {
    const steamId = steamId64FromLegacy(row.account_id, `vip_users(${row.account_id},${row.sid},${row.group}).account_id`, issues);
    if (!steamId) continue;
    const serverId = asIntegerString(row.sid, "vip_users.sid", issues);
    if (serverId === null) continue;
    const scope = scopePlan.byVipServerId.get(serverId);
    const group = groupPlan.byExternal.get(`vip:${normalizedName(row.group)}`);
    if (!scope) {
      issues.block("unresolved-vip-scope", "A vip_users row has no canonical arena scope.", { serverId, group: String(row.group) });
      continue;
    }
    if (!group) {
      issues.block("unresolved-vip-group", "A vip_users row has no canonical VIP group definition.", { serverId, group: String(row.group) });
      continue;
    }
    if (!group.scopes.has(scope.scopeUuid)) {
      issues.block("unresolved-vip-group-scope", "A vip_users row references a tier with no definition in that exact scope.", { serverId, group: String(row.group), steamId });
      continue;
    }
    const expiryText = asIntegerString(row.expires, "vip_users.expires", issues);
    if (expiryText === null) continue;
    const expiresAt = expiryText === "0" ? null : mysqlDateFromUnixSeconds(expiryText, "vip_users.expires", issues);
    addMembership({
      group,
      scope,
      steamId,
      startsAt: UNKNOWN_START,
      expiresAt,
      status: "active",
      provenanceType: "legacy_vip_users",
      provenanceReference: `vip_users:${row.account_id}:${serverId}:${row.group}`,
      sourceInventoryItemId: null,
      grantedByActor: MIGRATION_ACTOR,
      grantReason: "Imported native VIPCore assignment",
      revokedAt: null,
      revokedByActor: null,
      revokeReason: null,
      evidence: {
        kind: "native-vip",
        reference: `vip_users:${row.account_id}:${serverId}:${row.group}`,
        expiresAt,
        sourceAccountId: String(row.account_id),
      },
    });
  }

  for (const row of sources.portal.memberships) {
    const portalGroupId = String(row.group_id);
    const group = groupPlan.byPortalId.get(portalGroupId);
    const steamId = requireSteamId64(row.steam_id, `portal membership ${portalGroupId}.steam_id`, issues);
    if (!group) {
      issues.block("unresolved-portal-group", "A portal membership references a group that has no canonical mapping.", { portalGroupId });
      continue;
    }
    if (!steamId) continue;
    const startsAt = mysqlDate(row.starts_at, `portal membership ${portalGroupId}/${steamId}.starts_at`, issues);
    const expiresAt = mysqlDate(row.expires_at, `portal membership ${portalGroupId}/${steamId}.expires_at`, issues);
    if (!startsAt) continue;
    const revokedAt = mysqlDate(row.revoked_at, `portal membership ${portalGroupId}/${steamId}.revoked_at`, issues);
    const sourceInventoryItemId = inventoryItemFromReason(row.grant_reason);
    addMembership({
      group,
      scope: globalScope,
      steamId,
      startsAt,
      expiresAt,
      status: revokedAt ? "revoked" : "active",
      provenanceType: sourceInventoryItemId ? "inventory" : "legacy_portal",
      provenanceReference: sourceInventoryItemId ? `portal-inventory:${sourceInventoryItemId}` : `portal-membership:${portalGroupId}:${steamId}`,
      sourceInventoryItemId,
      grantedByActor: truncate(`portal:${row.granted_by_steam_id || "system"}`, 64),
      grantReason: row.grant_reason ? truncate(row.grant_reason, 180) : "Imported portal membership",
      revokedAt,
      revokedByActor: revokedAt ? truncate(`portal:${row.revoked_by_steam_id || "system"}`, 64) : null,
      revokeReason: revokedAt ? "Imported portal revocation" : null,
      evidence: { kind: "portal", reference: `portal-membership:${portalGroupId}:${steamId}`, expiresAt, sourceInventoryItemId },
    });
  }

  const conversionBySteamId = new Map();
  for (const row of sources.portal.conversionStates) {
    const steamId = requireSteamId64(row.steam_id, "portal conversion state SteamID64", issues);
    if (!steamId) continue;
    conversionBySteamId.set(steamId, {
      steamId,
      group: groupPlan.byPortalId.get(String(row.group_id)) ?? null,
      entitlementExpiresAt: mysqlDate(row.entitlement_expires_at, `conversion state ${steamId}.entitlement_expires_at`, issues),
      legacySuppressedUntil: mysqlDate(row.native_suppressed_until, `conversion state ${steamId}.native_suppressed_until`, issues),
      legacySuppressedPermanently: asBoolean(row.native_suppressed_permanently),
      portalGroupId: String(row.group_id),
    });
  }

  const subscriptions = [];
  const histories = [];
  const sourceEffectiveVipKeys = new Set();
  let sourceEffectiveVipCandidates = 0;
  const vipMemberships = [...memberships.values()].filter((membership) => membership.group.groupType === "vip");
  const vipByPlayerScopeFamily = groupRows(vipMemberships, (membership) =>
    `${membership.steamId}|${membership.scope.scopeUuid}|${membership.group.vipFamilyKey}`);
  const subscriptionKeys = new Set(vipByPlayerScopeFamily.keys());
  for (const state of conversionBySteamId.values()) {
    subscriptionKeys.add(`${state.steamId}|${globalScope.scopeUuid}|vipcore`);
  }

  for (const subscriptionKey of [...subscriptionKeys].sort()) {
    const [steamId, scopeUuid, vipFamilyKey] = subscriptionKey.split("|");
    const scope = scopePlan.scopes.find((entry) => entry.scopeUuid === scopeUuid);
    const candidates = vipByPlayerScopeFamily.get(subscriptionKey) ?? [];
    const active = candidates.filter((membership) => membershipIsActive(membership, nowMs));
    if (active.length) sourceEffectiveVipKeys.add(subscriptionKey);
    sourceEffectiveVipCandidates += active.length;
    const allScheduled = candidates.filter((membership) => membershipIsScheduled(membership, nowMs));
    if (active.length && allScheduled.length) {
      issues.block("scheduled-vip-succession", "A VIP family/scope has both a current tier and a future tier; the one-row subscription cannot preserve that scheduled succession automatically.", {
        steamId,
        scope: scope.scopeKey,
        currentGroups: active.map((entry) => entry.group.externalKey),
        scheduledGroups: allScheduled.map((entry) => entry.group.externalKey),
      });
    }
    const scheduled = active.length ? [] : allScheduled;
    const selectable = active.length ? active : scheduled;
    const conversion = scopeUuid === globalScope.scopeUuid ? conversionBySteamId.get(steamId) : null;
    let winner = null;
    if (conversion && (conversion.entitlementExpiresAt === null || dateMilliseconds(conversion.entitlementExpiresAt) > nowMs)) {
      if (!conversion.group) {
        issues.block("unresolved-conversion-group", "An active portal VIP conversion state references an unresolved group.", { steamId, portalGroupId: conversion.portalGroupId });
      } else {
        winner = selectable.find((membership) => membership.group.groupUuid === conversion.group.groupUuid) ?? null;
        if (!winner) {
          issues.block("conversion-membership-mismatch", "An active portal VIP conversion state has no matching active membership.", { steamId, portalGroupId: conversion.portalGroupId });
        }
      }
    }
    if (!winner && selectable.length) {
      const ranked = [...selectable].sort((left, right) => {
        const leftScope = left.group.scopes.get(left.scope.scopeUuid);
        const rightScope = right.group.scopes.get(right.scope.scopeUuid);
        const weightDifference = Number(rightScope?.rankWeightOverride ?? right.group.rankWeight) - Number(leftScope?.rankWeightOverride ?? left.group.rankWeight);
        if (weightDifference) return weightDifference;
        if ((left.expiresAt === null) !== (right.expiresAt === null)) return left.expiresAt === null ? -1 : 1;
        const expiryDifference = (dateMilliseconds(right.expiresAt) ?? 0) - (dateMilliseconds(left.expiresAt) ?? 0);
        if (expiryDifference) return expiryDifference;
        return left.group.groupKey.localeCompare(right.group.groupKey);
      });
      winner = ranked[0];
    }
    if (winner?.expiresAt !== null && selectable.some((membership) => membership !== winner && membership.expiresAt === null)) {
      issues.block("permanent-vip-fallback-conflict", "The selected higher-priority finite VIP would erase a permanent lower-tier fallback; resolve or explicitly convert the permanent entitlement before cutover.", {
        steamId,
        scope: scope.scopeKey,
        selectedGroup: winner.group.externalKey,
        permanentGroups: selectable
          .filter((membership) => membership !== winner && membership.expiresAt === null)
          .map((membership) => membership.group.externalKey),
      });
    }

    let legacySuppressedPermanently = false;
    let legacySuppressedUntil = null;
    for (const membership of candidates) {
      for (const evidence of membership.evidence.filter((entry) => entry.kind === "native-vip")) {
        if (evidence.expiresAt === null) legacySuppressedPermanently = true;
        else if (dateMilliseconds(evidence.expiresAt) > nowMs) legacySuppressedUntil = laterFiniteDate(legacySuppressedUntil, evidence.expiresAt);
      }
    }
    if (conversion) {
      legacySuppressedPermanently ||= conversion.legacySuppressedPermanently;
      legacySuppressedUntil = laterFiniteDate(legacySuppressedUntil, conversion.legacySuppressedUntil);
    }
    if (winner) {
      if (winner.expiresAt === null) legacySuppressedPermanently = true;
      else legacySuppressedUntil = laterFiniteDate(legacySuppressedUntil, winner.expiresAt);
    }
    if (legacySuppressedPermanently) legacySuppressedUntil = null;

    if (selectable.length > 1) {
      issues.resolve(active.length > 1 ? "vip-overlap-resolved" : "vip-scheduled-overlap-resolved", "Multiple VIP tiers in the same family/scope were reduced to one deterministic subscription; losing memberships are retained as superseded.", {
        steamId,
        scope: scope.scopeKey,
        winner: winner?.group.externalKey,
        losers: active.filter((entry) => entry !== winner).map((entry) => entry.group.externalKey),
      });
    }
    for (const loser of selectable.filter((membership) => membership !== winner)) {
      loser.status = "superseded";
      histories.push({
        transitionUuid: deterministicUuid(`vip-history:superseded:${loser.membershipUuid}:${winner?.membershipUuid ?? "none"}`),
        steamId,
        scope,
        vipFamilyKey,
        action: "migration.superseded",
        fromGroup: loser.group,
        toGroup: winner?.group ?? null,
        membership: loser,
        sourceInventoryItemId: loser.sourceInventoryItemId,
        beforeExpiresAt: loser.expiresAt,
        afterExpiresAt: winner?.expiresAt ?? null,
        metadata: { schemaVersion: 1, reason: "non-stacking-import", winnerMembershipUuid: winner?.membershipUuid ?? null, evidence: loser.evidence },
      });
    }

    subscriptions.push({
      steamId,
      scope,
      vipFamilyKey,
      group: winner?.group ?? null,
      membership: winner,
      status: winner ? "active" : "ended",
      startsAt: winner?.startsAt ?? null,
      expiresAt: winner?.expiresAt ?? null,
      legacySuppressedUntil,
      legacySuppressedPermanently,
    });
    if (winner) {
      histories.push({
        transitionUuid: deterministicUuid(`vip-history:selected:${winner.membershipUuid}`),
        steamId,
        scope,
        vipFamilyKey,
        action: "migration.selected",
        fromGroup: null,
        toGroup: winner.group,
        membership: winner,
        sourceInventoryItemId: winner.sourceInventoryItemId,
        beforeExpiresAt: null,
        afterExpiresAt: winner.expiresAt,
        metadata: { schemaVersion: 1, reason: conversion ? "portal-conversion-state-or-rank" : "effective-rank", evidence: winner.evidence },
      });
    }
  }

  const canonicalEffectiveVipKeys = new Set(subscriptions
    .filter((subscription) => subscription.status === "active"
      && dateMilliseconds(subscription.startsAt) <= nowMs
      && (subscription.expiresAt === null || dateMilliseconds(subscription.expiresAt) > nowMs))
    .map((subscription) => `${subscription.steamId}|${subscription.scope.scopeUuid}|${subscription.vipFamilyKey}`));
  const missingEffectiveVipKeys = [...sourceEffectiveVipKeys].filter((key) => !canonicalEffectiveVipKeys.has(key));
  if (missingEffectiveVipKeys.length) {
    issues.block("effective-vip-entitlement-loss", "The canonical plan would lose one or more currently effective legacy VIP family/scope entitlements.", {
      count: missingEffectiveVipKeys.length,
      keys: missingEffectiveVipKeys.slice(0, 20),
    });
  }

  const evidenceCounts = { nativeAdminAssignments: 0, nativeVipRows: 0, portalMemberships: 0 };
  for (const membership of memberships.values()) {
    for (const evidence of membership.evidence) {
      if (evidence.kind === "native-admin") evidenceCounts.nativeAdminAssignments += 1;
      else if (evidence.kind === "native-vip") evidenceCounts.nativeVipRows += 1;
      else if (evidence.kind === "portal") evidenceCounts.portalMemberships += 1;
    }
  }

  return {
    memberships: [...memberships.values()].sort((left, right) => left.membershipUuid.localeCompare(right.membershipUuid)),
    subscriptions,
    histories,
    comparison: {
      evidenceCounts,
      sourceEffectiveVipCandidates,
      sourceEffectiveVipFamilyScopes: sourceEffectiveVipKeys.size,
      canonicalEffectiveVipFamilyScopes: canonicalEffectiveVipKeys.size,
      supersededEffectiveVipCandidates: Math.max(0, sourceEffectiveVipCandidates - sourceEffectiveVipKeys.size),
      missingEffectiveVipFamilyScopes: missingEffectiveVipKeys.length,
    },
  };
}

function buildPortalBridgePlan(sources, groupPlan, scopePlan, issues) {
  const globalScope = scopePlan.byVipServerId.get("0");
  const scopesByUuid = new Map(scopePlan.scopes.map((scope) => [scope.scopeUuid, scope]));
  const listings = [];
  const rewards = [];
  const catalogueTargets = [];
  const existingTargetsByCatalogue = new Map(
    sources.portal.catalogueTargets.map((row) => [String(row.catalogue_id), row]),
  );
  const existingTargetsByListing = new Map(
    sources.portal.catalogueTargets
      .filter((row) => row.listing_id !== null)
      .map((row) => [String(row.listing_id), row]),
  );

  for (const row of sources.portal.listings) {
    const group = groupPlan.byPortalId.get(String(row.group_id));
    if (!group) {
      issues.block("unresolved-listing-group", "A portal listing has no canonical arena group.", { listingId: String(row.id), portalGroupId: String(row.group_id) });
      continue;
    }
    const requestedScopeUuid = row.arena_scope_uuid === null || row.arena_scope_uuid === undefined
      ? globalScope.scopeUuid
      : normalizedName(row.arena_scope_uuid);
    const scope = scopesByUuid.get(requestedScopeUuid);
    if (!scope) {
      issues.block("unresolved-listing-scope", "A portal listing targets an unknown Arena scope.", { listingId: String(row.id), arenaScopeUuid: requestedScopeUuid });
      continue;
    }
    if (!group.scopes.has(scope.scopeUuid)) {
      issues.block("listing-scope-not-enabled", "A portal listing targets a scope where its Arena group is not enabled.", { listingId: String(row.id), groupUuid: group.groupUuid, arenaScopeUuid: scope.scopeUuid });
      continue;
    }
    const mapping = { row, group, scope };
    listings.push(mapping);
    for (const [column, expected] of [
      ["arena_group_uuid", group.groupUuid],
      ["arena_group_key", group.groupKey],
      ["arena_scope_uuid", scope.scopeUuid],
    ]) {
      const actual = row[column] === null || row[column] === undefined ? null : String(row[column]);
      if (actual !== null && normalizedName(actual) !== normalizedName(expected)) {
        issues.block("listing-bridge-conflict", `Listing ${row.id} already has a conflicting ${column}.`, { actual, expected });
      }
    }
    if (row.catalogue_id === null) continue;
    const catalogueId = String(row.catalogue_id);
    const existingByCatalogue = existingTargetsByCatalogue.get(catalogueId);
    const existingByListing = existingTargetsByListing.get(String(row.id));
    if (existingByListing && String(existingByListing.catalogue_id) !== catalogueId) {
      issues.block("catalogue-target-conflict", "A listing is already attached to another catalogue target.", { listingId: String(row.id), catalogueId, existingCatalogueId: String(existingByListing.catalogue_id) });
      continue;
    }
    if (existingByCatalogue) {
      if (String(existingByCatalogue.listing_id) !== String(row.id) || String(existingByCatalogue.arena_group_uuid).toLowerCase() !== group.groupUuid || String(existingByCatalogue.arena_scope_uuid).toLowerCase() !== scope.scopeUuid) {
        issues.block("catalogue-target-conflict", "A catalogue row already targets another listing or arena identity.", { catalogueId, listingId: String(row.id) });
        continue;
      }
    }
    catalogueTargets.push({
      row,
      group,
      scope,
      catalogueId,
      targetSnapshot: {
        schemaVersion: 1,
        migration: "arena-group-authority-v1",
        legacyPortalGroupId: String(row.group_id),
        listingId: String(row.id),
        arenaGroupUuid: group.groupUuid,
        arenaGroupKey: group.groupKey,
        arenaScopeUuid: scope.scopeUuid,
        groupType: group.groupType,
        vipFamilyKey: group.vipFamilyKey,
        displayName: group.displayName,
        rankWeight: group.rankWeight,
        arenaGroupRowVersion: 1,
        durationMinutes: Number(row.duration_minutes),
        euroPriceCents: String(row.euro_price_cents),
        tokenPrice: String(row.token_price),
      },
    });
  }

  for (const row of sources.portal.rewards) {
    const group = groupPlan.byPortalId.get(String(row.group_id));
    if (!group) {
      issues.block("unresolved-reward-group", "A portal group reward has no canonical arena group.", { rewardId: String(row.id), portalGroupId: String(row.group_id) });
      continue;
    }
    rewards.push({ row, group, scope: globalScope });
    for (const [column, expected] of [
      ["arena_group_uuid", group.groupUuid],
      ["arena_group_key", group.groupKey],
      ["arena_scope_uuid", globalScope.scopeUuid],
    ]) {
      const actual = row[column] === null || row[column] === undefined ? null : String(row[column]);
      if (actual !== null && normalizedName(actual) !== normalizedName(expected)) {
        issues.block("reward-bridge-conflict", `Reward ${row.id} already has a conflicting ${column}.`, { actual, expected });
      }
    }
  }
  return { listings, rewards, catalogueTargets };
}

function validateExistingTargets(targets, scopePlan, groupPlan, membershipPlan, issues) {
  const plannedScopeByUuid = new Map(scopePlan.scopes.map((scope) => [scope.scopeUuid, scope]));
  const plannedGroupByUuid = new Map(groupPlan.groups.map((group) => [group.groupUuid, group]));
  const targetScopeById = new Map(targets.scopes.map((row) => [String(row.id), row]));
  const targetGroupById = new Map(targets.groups.map((row) => [String(row.id), row]));
  const targetMembershipByUuid = new Map(targets.memberships.map((row) => [String(row.membership_uuid).toLowerCase(), row]));
  const targetMembershipByTuple = new Map(targets.memberships.map((row) => [
    `${row.group_id}|${row.scope_id}|${row.steam_id}`,
    row,
  ]));
  const targetGroupIdByUuid = new Map(targets.groups.map((row) => [String(row.group_uuid).toLowerCase(), String(row.id)]));
  const targetScopeIdByUuid = new Map(targets.scopes.map((row) => [String(row.scope_uuid).toLowerCase(), String(row.id)]));
  const targetScopeByKey = new Map(targets.scopes.map((row) => [normalizedName(row.scope_key), row]));
  const targetGroupByKey = new Map(targets.groups.map((row) => [normalizedName(row.group_key), row]));

  for (const row of targets.scopes) {
    const rawUuid = String(row.scope_uuid);
    const uuid = rawUuid.toLowerCase();
    if (!UUID_PATTERN.test(uuid)) issues.block("invalid-target-uuid", "An existing arena scope UUID is invalid.", { scopeId: String(row.id) });
    if (rawUuid !== uuid) issues.block("non-lowercase-target-uuid", "An existing arena scope UUID is not lowercase.", { scopeId: String(row.id), scopeUuid: rawUuid });
    const planned = plannedScopeByUuid.get(uuid);
    if (!planned) issues.warn("extra-target-scope", "An arena scope is outside this legacy import plan and will be preserved.", { scopeUuid: uuid, scopeKey: String(row.scope_key) });
  }
  for (const row of targets.groups) {
    const rawUuid = String(row.group_uuid);
    const uuid = rawUuid.toLowerCase();
    if (!UUID_PATTERN.test(uuid)) issues.block("invalid-target-uuid", "An existing arena group UUID is invalid.", { groupId: String(row.id) });
    if (rawUuid !== uuid) issues.block("non-lowercase-target-uuid", "An existing arena group UUID is not lowercase.", { groupId: String(row.id), groupUuid: rawUuid });
    const planned = plannedGroupByUuid.get(uuid);
    if (!planned) issues.warn("extra-target-group", "An arena group is outside this legacy import plan and will be preserved.", { groupUuid: uuid, groupKey: String(row.group_key) });
  }

  for (const planned of scopePlan.scopes) {
    const keyOwner = targetScopeByKey.get(normalizedName(planned.scopeKey));
    if (keyOwner && String(keyOwner.scope_uuid).toLowerCase() !== planned.scopeUuid) {
      issues.block("target-scope-key-collision", "A planned scope key belongs to another existing scope UUID.", {
        scopeKey: planned.scopeKey,
        expectedUuid: planned.scopeUuid,
        existingUuid: String(keyOwner.scope_uuid),
      });
    }
  }
  for (const planned of groupPlan.groups) {
    const keyOwner = targetGroupByKey.get(normalizedName(planned.groupKey));
    if (keyOwner && String(keyOwner.group_uuid).toLowerCase() !== planned.groupUuid) {
      issues.block("target-group-key-collision", "A planned group key belongs to another existing group UUID.", {
        groupKey: planned.groupKey,
        expectedUuid: planned.groupUuid,
        existingUuid: String(keyOwner.group_uuid),
      });
    }
  }

  for (const planned of membershipPlan.memberships) {
    const existingByUuid = targetMembershipByUuid.get(planned.membershipUuid);
    const groupId = targetGroupIdByUuid.get(planned.group.groupUuid);
    const scopeId = targetScopeIdByUuid.get(planned.scope.scopeUuid);
    const existingByTuple = groupId && scopeId
      ? targetMembershipByTuple.get(`${groupId}|${scopeId}|${planned.steamId}`)
      : null;
    if (existingByTuple && String(existingByTuple.membership_uuid).toLowerCase() !== planned.membershipUuid) {
      issues.block("target-membership-collision", "An existing membership tuple has a non-deterministic UUID.", { expectedUuid: planned.membershipUuid, existingUuid: String(existingByTuple.membership_uuid) });
    }
    if (!existingByUuid) continue;
    const existingGroup = targetGroupById.get(String(existingByUuid.group_id));
    const existingScope = targetScopeById.get(String(existingByUuid.scope_id));
    if (String(existingGroup?.group_uuid).toLowerCase() !== planned.group.groupUuid || String(existingScope?.scope_uuid).toLowerCase() !== planned.scope.scopeUuid || String(existingByUuid.steam_id) !== planned.steamId) {
      issues.block("target-membership-drift", "An existing deterministic membership UUID points to another tuple.", { membershipUuid: planned.membershipUuid });
      continue;
    }
    if (String(existingByUuid.status) !== planned.status) {
      issues.block("target-membership-status-drift", "An existing imported membership status differs from the current deterministic plan.", { membershipUuid: planned.membershipUuid, existing: String(existingByUuid.status), expected: planned.status });
    }
    if (
      dateMilliseconds(existingByUuid.starts_at) !== dateMilliseconds(planned.startsAt)
      || dateMilliseconds(existingByUuid.expires_at) !== dateMilliseconds(planned.expiresAt)
      || String(existingByUuid.provenance_type) !== planned.provenanceType
      || (existingByUuid.provenance_reference === null ? null : String(existingByUuid.provenance_reference)) !== planned.provenanceReference
      || dateMilliseconds(existingByUuid.revoked_at) !== dateMilliseconds(planned.revokedAt)
    ) {
      issues.block("target-membership-state-drift", "An existing imported membership has different dates or provenance from the current deterministic plan.", { membershipUuid: planned.membershipUuid });
    }
    const existingItem = existingByUuid.source_inventory_item_id ? String(existingByUuid.source_inventory_item_id).toLowerCase() : null;
    if (existingItem !== planned.sourceInventoryItemId) {
      issues.block("target-membership-source-drift", "An existing imported membership has a different inventory source reference.", { membershipUuid: planned.membershipUuid, existingItem, expectedItem: planned.sourceInventoryItemId });
    }
  }

  const plannedSubscriptionKeys = new Set(membershipPlan.subscriptions.map((row) => `${row.steamId}|${row.scope.scopeUuid}|${row.vipFamilyKey}`));
  const plannedSubscriptionsByKey = new Map(membershipPlan.subscriptions.map((row) => [
    `${row.steamId}|${row.scope.scopeUuid}|${row.vipFamilyKey}`,
    row,
  ]));
  for (const row of targets.subscriptions) {
    const scope = targetScopeById.get(String(row.scope_id));
    const key = `${row.steam_id}|${String(scope?.scope_uuid).toLowerCase()}|${row.vip_family_key}`;
    if (!plannedSubscriptionKeys.has(key)) {
      issues.warn("extra-target-subscription", "An arena VIP subscription is outside this legacy import plan and will be preserved.", { steamId: String(row.steam_id), scopeUuid: String(scope?.scope_uuid), family: String(row.vip_family_key) });
      continue;
    }
    const planned = plannedSubscriptionsByKey.get(key);
    const group = row.group_id === null ? null : targetGroupById.get(String(row.group_id));
    const existingGroupUuid = group ? String(group.group_uuid).toLowerCase() : null;
    const existingMembershipUuid = row.membership_uuid ? String(row.membership_uuid).toLowerCase() : null;
    const sameDate = (left, right) => dateMilliseconds(left) === dateMilliseconds(right);
    if (
      existingGroupUuid !== (planned.group?.groupUuid ?? null)
      || existingMembershipUuid !== (planned.membership?.membershipUuid ?? null)
      || String(row.status) !== planned.status
      || !sameDate(row.starts_at, planned.startsAt)
      || !sameDate(row.expires_at, planned.expiresAt)
      || !sameDate(row.legacy_suppressed_until, planned.legacySuppressedUntil)
      || asBoolean(row.legacy_suppressed_permanently) !== planned.legacySuppressedPermanently
    ) {
      issues.block("target-subscription-drift", "An existing imported VIP subscription differs from the current deterministic plan.", {
        steamId: planned.steamId,
        scopeUuid: planned.scope.scopeUuid,
        family: planned.vipFamilyKey,
      });
    }
  }
}

function buildPlan(sources, targets, issues) {
  const scopePlan = buildScopePlan(sources, targets, issues);
  const groupPlan = buildGroupPlan(sources, targets, scopePlan, issues);
  const membershipPlan = buildMembershipPlan(sources, targets, scopePlan, groupPlan, issues);
  const portalPlan = buildPortalBridgePlan(sources, groupPlan, scopePlan, issues);
  validateExistingTargets(targets, scopePlan, groupPlan, membershipPlan, issues);
  return { ...scopePlan, ...groupPlan, ...membershipPlan, portal: portalPlan };
}

function targetIndexes(targets) {
  const scopesByUuid = new Map(targets.scopes.map((row) => [String(row.scope_uuid).toLowerCase(), row]));
  const groupsByUuid = new Map(targets.groups.map((row) => [String(row.group_uuid).toLowerCase(), row]));
  const scopesById = new Map(targets.scopes.map((row) => [String(row.id), row]));
  const groupsById = new Map(targets.groups.map((row) => [String(row.id), row]));
  return { scopesByUuid, groupsByUuid, scopesById, groupsById };
}

function countBy(rows, selector) {
  const result = {};
  for (const row of rows) {
    const key = selector(row);
    result[key] = (result[key] ?? 0) + 1;
  }
  return result;
}

function planReport(sources, targets, plan, issues, mode, targetAfter = null) {
  const indexes = targetIndexes(targets);
  const existingMembershipUuids = new Set(targets.memberships.map((row) => String(row.membership_uuid).toLowerCase()));
  const existingHistoryUuids = new Set(targets.history.map((row) => String(row.transition_uuid).toLowerCase()));
  const existingSubscriptions = new Set(targets.subscriptions.map((row) => {
    const scope = indexes.scopesById.get(String(row.scope_id));
    return `${row.steam_id}|${String(scope?.scope_uuid).toLowerCase()}|${row.vip_family_key}`;
  }));
  const existingGroupScopes = new Set(targets.groupScopes.map((row) => {
    const group = indexes.groupsById.get(String(row.group_id));
    const scope = indexes.scopesById.get(String(row.scope_id));
    return `${String(group?.group_uuid).toLowerCase()}|${String(scope?.scope_uuid).toLowerCase()}`;
  }));
  const plannedGroupScopes = plan.groups.flatMap((group) =>
    [...group.scopes.values()].map((groupScope) => `${group.groupUuid}|${groupScope.scope.scopeUuid}`));
  const sourceActiveNativeVip = sources.game.vipUsers.filter((row) => {
    const expiry = String(row.expires);
    return expiry === "0" || (dateMilliseconds(mysqlDateFromUnixSeconds(expiry, "report vip_users.expires", issueCollector())) ?? 0) > Date.now();
  }).length;
  const summary = {
    mode,
    source: {
      adminGroups: sources.game.adminGroups.length,
      nativeAdmins: sources.game.admins.length,
      adminServers: sources.game.adminServers.length,
      vipDefinitions: sources.game.vipDefinitions.length,
      nativeVipRows: sources.game.vipUsers.length,
      activeNativeVipRows: sourceActiveNativeVip,
      vipServers: sources.game.vipServers.length,
      portalGroups: sources.portal.groups.length,
      portalMemberships: sources.portal.memberships.length,
      portalConversionStates: sources.portal.conversionStates.length,
      portalListings: sources.portal.listings.length,
      portalRewards: sources.portal.rewards.length,
    },
    targetBefore: {
      scopes: targets.scopes.length,
      groups: targets.groups.length,
      groupScopes: targets.groupScopes.length,
      memberships: targets.memberships.length,
      vipSubscriptions: targets.subscriptions.length,
      vipHistory: targets.history.length,
    },
    deterministicPlan: {
      scopes: plan.scopes.length,
      groups: plan.groups.length,
      groupsByType: countBy(plan.groups, (row) => row.groupType),
      groupScopes: plannedGroupScopes.length,
      memberships: plan.memberships.length,
      membershipsByStatus: countBy(plan.memberships, (row) => row.status),
      inventoryBackedMemberships: plan.memberships.filter((row) => row.sourceInventoryItemId !== null).length,
      vipSubscriptions: plan.subscriptions.length,
      activeVipSubscriptions: plan.subscriptions.filter((row) => row.status === "active").length,
      endedVipTombstones: plan.subscriptions.filter((row) => row.status === "ended").length,
      vipHistory: plan.histories.length,
      listingBridges: plan.portal.listings.length,
      rewardBridges: plan.portal.rewards.length,
      catalogueTargets: plan.portal.catalogueTargets.length,
    },
    sourceToCanonicalComparison: plan.comparison,
    additiveRows: {
      scopes: plan.scopes.filter((row) => !indexes.scopesByUuid.has(row.scopeUuid)).length,
      groups: plan.groups.filter((row) => !indexes.groupsByUuid.has(row.groupUuid)).length,
      groupScopes: plannedGroupScopes.filter((key) => !existingGroupScopes.has(key)).length,
      memberships: plan.memberships.filter((row) => !existingMembershipUuids.has(row.membershipUuid)).length,
      vipSubscriptions: plan.subscriptions.filter((row) => !existingSubscriptions.has(`${row.steamId}|${row.scope.scopeUuid}|${row.vipFamilyKey}`)).length,
      vipHistory: plan.histories.filter((row) => !existingHistoryUuids.has(row.transitionUuid)).length,
    },
    diagnostics: {
      blockers: issues.blockers.length,
      warnings: issues.warnings.length,
      deterministicResolutions: issues.resolutions.length,
      unresolved: issues.blockers.filter((entry) => entry.code.startsWith("unresolved-")).length,
      conflicts: issues.blockers.filter((entry) => entry.code.includes("conflict") || entry.code.includes("collision") || entry.code.includes("drift")).length,
    },
  };
  if (targetAfter) {
    summary.targetAfter = {
      scopes: targetAfter.scopes.length,
      groups: targetAfter.groups.length,
      groupScopes: targetAfter.groupScopes.length,
      memberships: targetAfter.memberships.length,
      vipSubscriptions: targetAfter.subscriptions.length,
      vipHistory: targetAfter.history.length,
    };
  }
  return summary;
}

function printDiagnostics(issues) {
  const print = (label, entries, limit) => {
    if (!entries.length) return;
    console.log(`\n${label} (${entries.length})`);
    for (const entry of entries.slice(0, limit)) {
      console.log(`- [${entry.code}] ${entry.message}${entry.details ? ` ${JSON.stringify(entry.details)}` : ""}`);
    }
    if (entries.length > limit) console.log(`- ... ${entries.length - limit} more ${label.toLowerCase()}`);
  };
  print("BLOCKERS", issues.blockers, Number.POSITIVE_INFINITY);
  print("WARNINGS", issues.warnings, 100);
  print("DETERMINISTIC RESOLUTIONS", issues.resolutions, 100);
}

function assertPlanPresent(targets, plan, issues) {
  const indexes = targetIndexes(targets);
  const groupScopes = new Set(targets.groupScopes.map((row) => `${row.group_id}|${row.scope_id}`));
  const memberships = new Set(targets.memberships.map((row) => String(row.membership_uuid).toLowerCase()));
  const histories = new Map(targets.history.map((row) => [String(row.transition_uuid).toLowerCase(), row]));
  const subscriptions = new Map(targets.subscriptions.map((row) => [
    `${row.steam_id}|${row.scope_id}|${row.vip_family_key}`,
    row,
  ]));
  for (const scope of plan.scopes) {
    if (!indexes.scopesByUuid.has(scope.scopeUuid)) {
      issues.block("verification-scope-missing", "A planned arena scope is missing after the write.", { scopeUuid: scope.scopeUuid });
    }
  }
  for (const group of plan.groups) {
    const targetGroup = indexes.groupsByUuid.get(group.groupUuid);
    if (!targetGroup) {
      issues.block("verification-group-missing", "A planned arena group is missing after the write.", { groupUuid: group.groupUuid });
      continue;
    }
    for (const groupScope of group.scopes.values()) {
      const targetScope = indexes.scopesByUuid.get(groupScope.scope.scopeUuid);
      if (!targetScope || !groupScopes.has(`${targetGroup.id}|${targetScope.id}`)) {
        issues.block("verification-group-scope-missing", "A planned arena group scope is missing after the write.", { groupUuid: group.groupUuid, scopeUuid: groupScope.scope.scopeUuid });
      }
    }
  }
  for (const membership of plan.memberships) {
    if (!memberships.has(membership.membershipUuid)) {
      issues.block("verification-membership-missing", "A planned arena membership is missing after the write.", { membershipUuid: membership.membershipUuid });
    }
  }
  for (const subscription of plan.subscriptions) {
    const targetScope = indexes.scopesByUuid.get(subscription.scope.scopeUuid);
    const key = `${subscription.steamId}|${targetScope?.id}|${subscription.vipFamilyKey}`;
    if (!targetScope || !subscriptions.has(key)) {
      issues.block("verification-subscription-missing", "A planned arena VIP subscription is missing after the write.", { steamId: subscription.steamId, scopeUuid: subscription.scope.scopeUuid, family: subscription.vipFamilyKey });
    }
  }
  for (const history of plan.histories) {
    const targetHistory = histories.get(history.transitionUuid);
    if (!targetHistory) {
      issues.block("verification-history-missing", "A planned VIP migration history row is missing after the write.", { transitionUuid: history.transitionUuid });
      continue;
    }
    const targetScope = indexes.scopesById.get(String(targetHistory.scope_id));
    const fromGroup = targetHistory.from_group_id === null ? null : indexes.groupsById.get(String(targetHistory.from_group_id));
    const toGroup = targetHistory.to_group_id === null ? null : indexes.groupsById.get(String(targetHistory.to_group_id));
    if (
      String(targetHistory.steam_id) !== history.steamId
      || String(targetScope?.scope_uuid).toLowerCase() !== history.scope.scopeUuid
      || String(targetHistory.vip_family_key) !== history.vipFamilyKey
      || String(targetHistory.action) !== history.action
      || (fromGroup ? String(fromGroup.group_uuid).toLowerCase() : null) !== (history.fromGroup?.groupUuid ?? null)
      || (toGroup ? String(toGroup.group_uuid).toLowerCase() : null) !== (history.toGroup?.groupUuid ?? null)
      || (targetHistory.membership_uuid ? String(targetHistory.membership_uuid).toLowerCase() : null) !== (history.membership?.membershipUuid ?? null)
    ) {
      issues.block("verification-history-drift", "A deterministic VIP migration history UUID points to different immutable evidence.", { transitionUuid: history.transitionUuid });
    }
  }
}

async function acquireMigrationLock(connection) {
  const [rows] = await connection.query(
    "SELECT GET_LOCK('arena_group_authority_migration_v1', 0) AS acquired",
  );
  if (!asBoolean(rows[0]?.acquired)) {
    throw new Error("Another arena group authority migration is already running.");
  }
}

async function releaseMigrationLock(connection) {
  try {
    await connection.query("SELECT RELEASE_LOCK('arena_group_authority_migration_v1')");
  } catch {
    // The server releases advisory locks with the connection; preserve the
    // original migration result if an explicit release cannot be confirmed.
  }
}

async function loadArenaIdentityRows(connection) {
  const schema = await inspectSchema(connection);
  return loadTargets(connection, schema);
}

async function applyArenaPlan(game, plan) {
  await acquireMigrationLock(game);
  let transactionStarted = false;
  try {
    await game.query("SET TRANSACTION ISOLATION LEVEL SERIALIZABLE");
    await game.beginTransaction();
    transactionStarted = true;

    for (const scope of plan.scopes) {
      await game.execute(
        `INSERT INTO arena_scopes
          (scope_uuid, scope_key, scope_type, display_name, admin_server_guid,
           vip_server_id, enabled, row_version)
         VALUES (?, ?, ?, ?, ?, ?, ?, 1)
         ON DUPLICATE KEY UPDATE
           row_version = row_version + IF(
             NOT (scope_key <=> VALUES(scope_key)) OR
             NOT (display_name <=> VALUES(display_name)) OR
             NOT (admin_server_guid <=> COALESCE(admin_server_guid, VALUES(admin_server_guid))) OR
             NOT (vip_server_id <=> COALESCE(vip_server_id, VALUES(vip_server_id))) OR
             NOT (enabled <=> VALUES(enabled)),
             1,
             0
           ),
           scope_key = VALUES(scope_key),
           display_name = VALUES(display_name),
           admin_server_guid = COALESCE(admin_server_guid, VALUES(admin_server_guid)),
           vip_server_id = COALESCE(vip_server_id, VALUES(vip_server_id)),
           enabled = VALUES(enabled)`,
        [
          scope.scopeUuid,
          scope.scopeKey,
          scope.scopeType,
          scope.displayName,
          scope.adminServerGuid,
          scope.vipServerId,
          scope.enabled,
        ],
      );
    }

    let targets = await loadArenaIdentityRows(game);
    let indexes = targetIndexes(targets);
    for (const scope of plan.scopes) {
      if (!indexes.scopesByUuid.has(scope.scopeUuid)) {
        throw new Error(`Arena scope ${scope.scopeUuid} could not be resolved after insertion.`);
      }
    }

    for (const group of plan.groups) {
      await game.execute(
        `INSERT INTO arena_groups
          (group_uuid, legacy_portal_group_id, group_key, group_type, external_key,
           vip_family_key, display_name, description, badge_label, badge_icon_key,
           badge_color, badge_soft_color, profile_priority, rank_weight, immunity,
           definition, baseline_permissions, capability_keys, enabled, row_version,
           created_by_actor, updated_by_actor)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 1, ?, ?)
         ON DUPLICATE KEY UPDATE
           legacy_portal_group_id = COALESCE(legacy_portal_group_id, VALUES(legacy_portal_group_id))`,
        [
          group.groupUuid,
          group.legacyPortalGroupId,
          group.groupKey,
          group.groupType,
          group.externalKey,
          group.vipFamilyKey,
          group.displayName,
          group.description,
          group.badgeLabel,
          group.badgeIconKey,
          group.badgeColor,
          group.badgeSoftColor,
          group.profilePriority,
          group.rankWeight,
          group.immunity,
          JSON.stringify(group.definition ?? {}),
          JSON.stringify(group.baselinePermissions),
          JSON.stringify(group.capabilityKeys),
          group.enabled,
          MIGRATION_ACTOR,
          MIGRATION_ACTOR,
        ],
      );
    }

    targets = await loadArenaIdentityRows(game);
    indexes = targetIndexes(targets);
    for (const group of plan.groups) {
      const targetGroup = indexes.groupsByUuid.get(group.groupUuid);
      if (!targetGroup) throw new Error(`Arena group ${group.groupUuid} could not be resolved after insertion.`);
      for (const groupScope of group.scopes.values()) {
        const targetScope = indexes.scopesByUuid.get(groupScope.scope.scopeUuid);
        if (!targetScope) throw new Error(`Arena scope ${groupScope.scope.scopeUuid} disappeared during group-scope insertion.`);
        await game.execute(
          `INSERT INTO arena_group_scopes
            (group_id, scope_id, definition_override, rank_weight_override,
             immunity_override, enabled, row_version, created_by_actor, updated_by_actor)
           VALUES (?, ?, ?, ?, ?, ?, 1, ?, ?)
           ON DUPLICATE KEY UPDATE group_id = group_id`,
          [
            targetGroup.id,
            targetScope.id,
            groupScope.definitionOverride === null ? null : JSON.stringify(groupScope.definitionOverride),
            groupScope.rankWeightOverride,
            groupScope.immunityOverride,
            groupScope.enabled,
            MIGRATION_ACTOR,
            MIGRATION_ACTOR,
          ],
        );
      }
    }

    for (const membership of plan.memberships) {
      const targetGroup = indexes.groupsByUuid.get(membership.group.groupUuid);
      const targetScope = indexes.scopesByUuid.get(membership.scope.scopeUuid);
      if (!targetGroup || !targetScope) throw new Error(`Cannot resolve the target of membership ${membership.membershipUuid}.`);
      await game.execute(
        `INSERT INTO arena_group_memberships
          (membership_uuid, group_id, scope_id, steam_id, starts_at, expires_at,
           status, provenance_type, provenance_reference, source_inventory_item_id,
           origin_command_uuid, granted_by_actor, grant_reason, revoked_at,
           revoked_by_actor, revoke_reason, row_version)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, NULL, ?, ?, ?, ?, ?, 1)
         ON DUPLICATE KEY UPDATE membership_uuid = membership_uuid`,
        [
          membership.membershipUuid,
          targetGroup.id,
          targetScope.id,
          membership.steamId,
          membership.startsAt,
          membership.expiresAt,
          membership.status,
          membership.provenanceType,
          membership.provenanceReference,
          membership.sourceInventoryItemId,
          membership.grantedByActor,
          membership.grantReason,
          membership.revokedAt,
          membership.revokedByActor,
          membership.revokeReason,
        ],
      );
    }

    for (const subscription of plan.subscriptions) {
      const targetScope = indexes.scopesByUuid.get(subscription.scope.scopeUuid);
      const targetGroup = subscription.group ? indexes.groupsByUuid.get(subscription.group.groupUuid) : null;
      if (!targetScope || (subscription.group && !targetGroup)) throw new Error(`Cannot resolve VIP subscription target for ${subscription.steamId}.`);
      await game.execute(
        `INSERT INTO arena_vip_subscriptions
          (steam_id, scope_id, vip_family_key, group_id, group_type,
           membership_uuid, status, starts_at, expires_at,
           legacy_suppressed_until, legacy_suppressed_permanently,
           last_command_uuid, row_version)
         VALUES (?, ?, ?, ?, 'vip', ?, ?, ?, ?, ?, ?, NULL, 1)
         ON DUPLICATE KEY UPDATE steam_id = steam_id`,
        [
          subscription.steamId,
          targetScope.id,
          subscription.vipFamilyKey,
          targetGroup?.id ?? null,
          subscription.membership?.membershipUuid ?? null,
          subscription.status,
          subscription.startsAt,
          subscription.expiresAt,
          subscription.legacySuppressedUntil,
          subscription.legacySuppressedPermanently,
        ],
      );
    }

    for (const history of plan.histories) {
      const targetScope = indexes.scopesByUuid.get(history.scope.scopeUuid);
      const fromGroup = history.fromGroup ? indexes.groupsByUuid.get(history.fromGroup.groupUuid) : null;
      const toGroup = history.toGroup ? indexes.groupsByUuid.get(history.toGroup.groupUuid) : null;
      if (!targetScope || (history.fromGroup && !fromGroup) || (history.toGroup && !toGroup)) {
        throw new Error(`Cannot resolve VIP history target ${history.transitionUuid}.`);
      }
      await game.execute(
        `INSERT IGNORE INTO arena_vip_subscription_history
          (transition_uuid, steam_id, scope_id, vip_family_key, action,
           from_group_id, to_group_id, membership_uuid, command_uuid,
           source_inventory_item_id, actor_steam_id, before_expires_at,
           after_expires_at, item_duration_seconds, converted_duration_seconds,
           conversion_source_seconds, time_deducted_seconds, rate_snapshot_hash,
           metadata)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, NULL, ?, NULL, ?, ?, NULL, NULL, NULL, NULL, NULL, ?)`,
        [
          history.transitionUuid,
          history.steamId,
          targetScope.id,
          history.vipFamilyKey,
          history.action,
          fromGroup?.id ?? null,
          toGroup?.id ?? null,
          history.membership?.membershipUuid ?? null,
          history.sourceInventoryItemId,
          history.beforeExpiresAt,
          history.afterExpiresAt,
          JSON.stringify(history.metadata),
        ],
      );
    }

    targets = await loadArenaIdentityRows(game);
    const verificationIssues = issueCollector();
    assertPlanPresent(targets, plan, verificationIssues);
    validateExistingTargets(
      targets,
      { scopes: plan.scopes },
      { groups: plan.groups },
      { memberships: plan.memberships, subscriptions: plan.subscriptions },
      verificationIssues,
    );
    if (verificationIssues.blockers.length) {
      throw new Error(`Arena transaction verification failed: ${verificationIssues.blockers.map((entry) => entry.code).join(", ")}`);
    }

    await game.commit();
    transactionStarted = false;
    return targets;
  } catch (error) {
    if (transactionStarted) await game.rollback();
    throw error;
  } finally {
    await releaseMigrationLock(game);
  }
}

function assertBridgeRow(row, mapping, label) {
  if (!row) throw new Error(`${label} disappeared while its arena bridge was being written.`);
  const actual = [row.arena_group_uuid, row.arena_group_key, row.arena_scope_uuid].map((value) => value === null ? null : normalizedName(value));
  const expected = [mapping.group.groupUuid, mapping.group.groupKey, mapping.scope.scopeUuid].map(normalizedName);
  if (actual.some((value, index) => value !== expected[index])) {
    throw new Error(`${label} has a conflicting arena target.`);
  }
}

async function applyPortalPlan(portal, plan, arenaTargets) {
  const indexes = targetIndexes(arenaTargets);
  await portal.query("SET TRANSACTION ISOLATION LEVEL SERIALIZABLE");
  await portal.beginTransaction();
  let transactionStarted = true;
  try {
    for (const mapping of plan.portal.listings) {
      const targetGroup = indexes.groupsByUuid.get(mapping.group.groupUuid);
      if (!targetGroup) throw new Error(`Cannot resolve arena row version for listing ${mapping.row.id}.`);
      await portal.execute(
        `UPDATE portal_identity_group_listings
         SET arena_group_uuid = ?, arena_group_key = ?, arena_scope_uuid = ?,
             arena_group_row_version = ?
         WHERE id = ? AND group_id = ?
           AND (arena_group_uuid IS NULL OR arena_group_uuid = ?)
           AND (arena_group_key IS NULL OR arena_group_key = ?)
           AND (arena_scope_uuid IS NULL OR arena_scope_uuid = ?)`,
        [
          mapping.group.groupUuid,
          mapping.group.groupKey,
          mapping.scope.scopeUuid,
          targetGroup.row_version,
          mapping.row.id,
          mapping.row.group_id,
          mapping.group.groupUuid,
          mapping.group.groupKey,
          mapping.scope.scopeUuid,
        ],
      );
      const [rows] = await portal.execute(
        "SELECT arena_group_uuid, arena_group_key, arena_scope_uuid FROM portal_identity_group_listings WHERE id = ? FOR UPDATE",
        [mapping.row.id],
      );
      assertBridgeRow(rows[0], mapping, `Listing ${mapping.row.id}`);
    }

    for (const mapping of plan.portal.rewards) {
      await portal.execute(
        `UPDATE portal_identity_group_rewards
         SET arena_group_uuid = ?, arena_group_key = ?, arena_scope_uuid = ?
         WHERE id = ? AND group_id = ?
           AND (arena_group_uuid IS NULL OR arena_group_uuid = ?)
           AND (arena_group_key IS NULL OR arena_group_key = ?)
           AND (arena_scope_uuid IS NULL OR arena_scope_uuid = ?)`,
        [
          mapping.group.groupUuid,
          mapping.group.groupKey,
          mapping.scope.scopeUuid,
          mapping.row.id,
          mapping.row.group_id,
          mapping.group.groupUuid,
          mapping.group.groupKey,
          mapping.scope.scopeUuid,
        ],
      );
      const [rows] = await portal.execute(
        "SELECT arena_group_uuid, arena_group_key, arena_scope_uuid FROM portal_identity_group_rewards WHERE id = ? FOR UPDATE",
        [mapping.row.id],
      );
      assertBridgeRow(rows[0], mapping, `Reward ${mapping.row.id}`);
    }

    for (const mapping of plan.portal.catalogueTargets) {
      const targetGroup = indexes.groupsByUuid.get(mapping.group.groupUuid);
      if (!targetGroup) throw new Error(`Cannot resolve arena row version for catalogue ${mapping.catalogueId}.`);
      const [existingRows] = await portal.execute(
        `SELECT catalogue_id, listing_id, arena_group_uuid, arena_scope_uuid
         FROM portal_arena_group_catalogue_targets
         WHERE catalogue_id = ? FOR UPDATE`,
        [mapping.catalogueId],
      );
      const existing = existingRows[0];
      if (existing && (
        String(existing.listing_id) !== String(mapping.row.id)
        || normalizedName(existing.arena_group_uuid) !== mapping.group.groupUuid
        || normalizedName(existing.arena_scope_uuid) !== mapping.scope.scopeUuid
      )) {
        throw new Error(`Catalogue ${mapping.catalogueId} acquired a conflicting arena target during migration.`);
      }
      if (existing) {
        await portal.execute(
          `UPDATE portal_arena_group_catalogue_targets
           SET legacy_portal_group_id = ?, arena_group_key = ?, arena_group_type = ?,
               arena_group_row_version = ?, duration_minutes = ?, target_snapshot = ?, enabled = ?
           WHERE catalogue_id = ?`,
          [
            mapping.row.group_id,
            mapping.group.groupKey,
            mapping.group.groupType,
            targetGroup.row_version,
            mapping.row.duration_minutes,
            JSON.stringify({
              ...mapping.targetSnapshot,
              arenaGroupRowVersion: Number(targetGroup.row_version),
            }),
            asBoolean(mapping.row.enabled),
            mapping.catalogueId,
          ],
        );
      } else {
        await portal.execute(
          `INSERT INTO portal_arena_group_catalogue_targets
            (catalogue_id, listing_id, legacy_portal_group_id, arena_group_uuid,
             arena_group_key, arena_scope_uuid, arena_group_type,
             arena_group_row_version, duration_minutes, target_snapshot, enabled)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
          [
            mapping.catalogueId,
            mapping.row.id,
            mapping.row.group_id,
            mapping.group.groupUuid,
            mapping.group.groupKey,
            mapping.scope.scopeUuid,
            mapping.group.groupType,
            targetGroup.row_version,
            mapping.row.duration_minutes,
            JSON.stringify({
              ...mapping.targetSnapshot,
              arenaGroupRowVersion: Number(targetGroup.row_version),
            }),
            asBoolean(mapping.row.enabled),
          ],
        );
      }
    }

    await portal.commit();
    transactionStarted = false;
  } catch (error) {
    if (transactionStarted) await portal.rollback();
    throw error;
  }
}

function verifyPortalPlan(sources, plan, issues) {
  const listings = new Map(sources.portal.listings.map((row) => [String(row.id), row]));
  const rewards = new Map(sources.portal.rewards.map((row) => [String(row.id), row]));
  const targets = new Map(sources.portal.catalogueTargets.map((row) => [String(row.catalogue_id), row]));
  for (const mapping of plan.portal.listings) {
    const row = listings.get(String(mapping.row.id));
    try {
      assertBridgeRow(row, mapping, `Listing ${mapping.row.id}`);
    } catch (error) {
      issues.block("verification-listing-bridge", error.message);
    }
  }
  for (const mapping of plan.portal.rewards) {
    const row = rewards.get(String(mapping.row.id));
    try {
      assertBridgeRow(row, mapping, `Reward ${mapping.row.id}`);
    } catch (error) {
      issues.block("verification-reward-bridge", error.message);
    }
  }
  for (const mapping of plan.portal.catalogueTargets) {
    const row = targets.get(mapping.catalogueId);
    if (!row || String(row.listing_id) !== String(mapping.row.id)
      || normalizedName(row.arena_group_uuid) !== mapping.group.groupUuid
      || normalizedName(row.arena_scope_uuid) !== mapping.scope.scopeUuid) {
      issues.block("verification-catalogue-target", "A planned portal catalogue target is missing or mismatched after the write.", { catalogueId: mapping.catalogueId });
    }
  }
}

async function main() {
  const { apply } = parseArguments(process.argv.slice(2));
  const issues = issueCollector();
  let game;
  let portal;
  try {
    game = await connectDatabase(process.env.GAME_DATABASE_URL, "GAME_DATABASE_URL");
    portal = await connectDatabase(process.env.PORTAL_DATABASE_URL, "PORTAL_DATABASE_URL");

    const [gameSchema, portalSchema] = await Promise.all([
      inspectSchema(game),
      inspectSchema(portal),
    ]);
    const gameSourceReady = requireSchema(gameSchema, REQUIRED_GAME_SOURCE_TABLES, "game source", issues);
    const portalSourceReady = requireSchema(portalSchema, REQUIRED_PORTAL_SOURCE_TABLES, "portal source", issues);
    const arenaMigrationReady = requireSchema(gameSchema, REQUIRED_GAME_TABLES, "arena migration 001", issues);
    const portalMigrationReady = requireSchema(portalSchema, REQUIRED_PORTAL_TABLES, "portal migration 025", issues);

    if (!gameSourceReady || !portalSourceReady) {
      console.log(JSON.stringify({
        mode: apply ? "apply-preflight" : "dry-run",
        sourceSchemaReady: false,
        arenaMigrationReady,
        portalMigrationReady,
        blockers: issues.blockers.length,
      }, null, 2));
      printDiagnostics(issues);
      process.exitCode = 2;
      return;
    }

    const [sources, targets] = await Promise.all([
      loadSources(game, portal, gameSchema, portalSchema),
      loadTargets(game, gameSchema),
    ]);
    const plan = buildPlan(sources, targets, issues);
    console.log(JSON.stringify(planReport(
      sources,
      targets,
      plan,
      issues,
      apply ? "apply-preflight" : "dry-run",
    ), null, 2));
    printDiagnostics(issues);

    if (!apply) {
      console.log(issues.blockers.length
        ? "\nDRY RUN BLOCKED: resolve every blocker, deploy arena 001 and portal 025, then rerun preflight."
        : "\nDRY RUN PASSED: no data was changed. Stop membership writers and back up both databases before using --apply.");
      process.exitCode = issues.blockers.length ? 2 : 0;
      return;
    }

    if (!arenaMigrationReady || !portalMigrationReady || issues.blockers.length) {
      console.error("\nAPPLY REFUSED: required migrations or conflict-free preflight are missing. No data was changed.");
      process.exitCode = 2;
      return;
    }

    console.log("\nApplying additive arena authority rows. The arena transaction commits before the portal projection transaction.");
    const arenaTargets = await applyArenaPlan(game, plan);
    try {
      await applyPortalPlan(portal, plan, arenaTargets);
    } catch (error) {
      throw new Error(
        `Arena rows committed, but the portal bridge transaction failed. Keep writers stopped and rerun the same --apply command; deterministic arena rows will not be duplicated. ${error.message}`,
        { cause: error },
      );
    }

    const [gameSchemaAfter, portalSchemaAfter] = await Promise.all([
      inspectSchema(game),
      inspectSchema(portal),
    ]);
    const [sourcesAfter, targetsAfter] = await Promise.all([
      loadSources(game, portal, gameSchemaAfter, portalSchemaAfter),
      loadTargets(game, gameSchemaAfter),
    ]);
    const verificationIssues = issueCollector();
    const verificationPlan = buildPlan(sourcesAfter, targetsAfter, verificationIssues);
    assertPlanPresent(targetsAfter, verificationPlan, verificationIssues);
    verifyPortalPlan(sourcesAfter, verificationPlan, verificationIssues);
    console.log("\n" + JSON.stringify(planReport(
      sourcesAfter,
      targets,
      verificationPlan,
      verificationIssues,
      "applied-and-verified",
      targetsAfter,
    ), null, 2));
    printDiagnostics(verificationIssues);
    if (verificationIssues.blockers.length) {
      console.error("\nAPPLY COMPLETED WITH VERIFICATION BLOCKERS: keep legacy readers available and investigate before cutover.");
      process.exitCode = 3;
      return;
    }
    console.log("\nAPPLY VERIFIED: deterministic authority rows and portal bridge targets are present. No legacy rows were deleted.");
  } catch (error) {
    console.error(`Migration failed: ${error.message}`);
    process.exitCode = 1;
  } finally {
    if (portal) await portal.end();
    if (game) await game.end();
  }
}

await main();
