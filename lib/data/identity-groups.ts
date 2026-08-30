import "server-only";

import { randomUUID } from "node:crypto";

import {
  type Pool,
  type PoolConnection,
  type ResultSetHeader,
  type RowDataPacket,
} from "mysql2/promise";

import {
  ensureIdentityCatalogue,
  getIdentityCatalogueStatus,
  syncIdentityCatalogue,
} from "@/lib/data/identity-catalogue";
import {
  identityExternalBadgeLookupKey,
  isIdentityGroupBadgeIconKey,
} from "@/lib/content/identity-group-badges";
import { getPortalDatabasePool } from "@/lib/data/database-pools";

export type IdentityGroupSource = "custom" | "admins_core" | "vipcore";
export type IdentityPrivilegeScope = "portal" | "game";
export type IdentityTradePolicy = "tradable" | "account_bound";

export type IdentityFounderActor = {
  steamId: string;
  isFounder: boolean;
};

export type IdentityChatTag = {
  id: number;
  key: string;
  text: string;
  colorToken: string;
  nameColorToken: string | null;
  messageColorToken: string | null;
  enabled: boolean;
  hidden?: boolean;
};

export type IdentityPrivilege = {
  id: number;
  key: string;
  scope: IdentityPrivilegeScope;
  displayName: string;
  description: string | null;
  sensitive: boolean;
  enabled: boolean;
  sources: IdentityPrivilegeSource[];
};

export type IdentityPrivilegeSource = {
  sourceKind: string;
  sourceReference: string | null;
};

export type IdentityExternalGroupDefinition = {
  sourceType: Exclude<IdentityGroupSource, "custom">;
  rankWeight: number;
  baselinePermissions: string[];
  capabilityKeys: string[];
  sourceKind: "config" | "runtime" | "portal";
  sourceReference: string | null;
  syncedAt: string;
};

export type IdentityGroupReward = {
  id: number;
  catalogueId: number;
  catalogueName: string;
  quantity: number;
  tradePolicy: IdentityTradePolicy;
  enabled: boolean;
};

export type IdentityGroupMembership = {
  steamId: string;
  startsAt: string;
  expiresAt: string | null;
  grantReason: string | null;
};

export type IdentityPlayerTagGrant = {
  steamId: string;
  tag: IdentityChatTag;
  startsAt: string;
  expiresAt: string | null;
  grantReason: string | null;
};

export type IdentityPlayerPrivilegeGrant = {
  steamId: string;
  privilege: IdentityPrivilege;
  startsAt: string;
  expiresAt: string | null;
  grantReason: string | null;
};

export type IdentityGroup = {
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
  externalDefinition: IdentityExternalGroupDefinition | null;
  memberCount: number;
  tags: IdentityChatTag[];
  privileges: IdentityPrivilege[];
  rewards: IdentityGroupReward[];
  memberships: IdentityGroupMembership[];
};

export type EffectiveIdentityGroup = IdentityGroup & {
  hasPortalMembership: boolean;
  membershipExpiresAt: string | null;
};

/** The public presentation-only projection used by dense player lists. */
export type IdentityGroupBadgeData = Pick<
  IdentityGroup,
  | "id"
  | "key"
  | "displayName"
  | "sourceType"
  | "externalKey"
  | "badgeLabel"
  | "badgeIconKey"
  | "badgeColor"
  | "badgeSoftColor"
  | "profilePriority"
>;

export type EffectiveIdentityGroupBadgeInput = {
  steamId: string;
  vipGroupNames?: string[];
  adminGroupNames?: string[];
};

export type EffectiveIdentity = {
  groups: EffectiveIdentityGroup[];
  tags: IdentityChatTag[];
  privileges: IdentityPrivilege[];
};

export type IdentityAdminSnapshot = {
  groups: IdentityGroup[];
  tags: IdentityChatTag[];
  privileges: IdentityPrivilege[];
  directTagGrants: IdentityPlayerTagGrant[];
  directPrivilegeGrants: IdentityPlayerPrivilegeGrant[];
  catalogueStatus: {
    adminsCoreDefinitions: number;
    vipCoreDefinitions: number;
    discoveredPrivileges: number;
    lastSyncedAt: string | null;
  };
};

export class IdentityGroupError extends Error {
  constructor(
    public readonly code: string,
    message: string,
  ) {
    super(message);
    this.name = "IdentityGroupError";
  }
}

type IdentityGroupRow = RowDataPacket & {
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
  member_count?: number | string;
  has_portal_membership?: number | boolean;
  membership_expires_at?: Date | string | null;
};

type IdentityGroupMembershipBadgeRow = IdentityGroupRow & {
  steam_id: string;
};

type IdentityTagRow = RowDataPacket & {
  id: number | string;
  tag_key: string;
  tag_text: string;
  color_token: string;
  name_color_token: string | null;
  message_color_token: string | null;
  enabled: number | boolean;
  group_id?: number | string;
  hidden?: number | boolean | null;
};

type IdentityPrivilegeRow = RowDataPacket & {
  id: number | string;
  privilege_key: string;
  scope: IdentityPrivilegeScope;
  display_name: string;
  description: string | null;
  is_sensitive: number | boolean;
  enabled: number | boolean;
  group_id?: number | string;
};

type IdentityRewardRow = RowDataPacket & {
  id: number | string;
  group_id: number | string;
  catalogue_id: number | string;
  display_name: string;
  quantity: number | string;
  trade_policy: IdentityTradePolicy;
  enabled: number | boolean;
  item_type?: string;
  definition_index?: number | string | null;
  paintkit?: number | string | null;
  rarity_rank?: number | string;
  metadata?: unknown;
  catalogue_enabled?: number | boolean;
};

type IdentityRewardAwardRow = RowDataPacket & {
  reward_id: number | string;
  group_id: number | string;
  steam_id: string;
  ordinal: number | string;
  item_id: string;
  entitlement_active: number | boolean;
  item_revoked_by_entitlement: number | boolean;
  item_state: "available" | "escrowed" | "attached" | "consumed" | "revoked";
  item_type: string;
  tradable: number | boolean;
  group_enabled: number | boolean;
  reward_enabled?: number | boolean;
  source_type?: IdentityGroupSource;
};

type IdentityRewardMutationResult = {
  awardedItemIds: string[];
  restoredItemIds: string[];
};

type IdentityMembershipRow = RowDataPacket & {
  group_id: number | string;
  steam_id: string;
  starts_at: Date | string;
  expires_at: Date | string | null;
  grant_reason: string | null;
};

type IdentityPlayerTagGrantRow = IdentityTagRow & {
  steam_id: string;
  starts_at: Date | string;
  expires_at: Date | string | null;
  grant_reason: string | null;
};

type IdentityPlayerPrivilegeGrantRow = IdentityPrivilegeRow & {
  steam_id: string;
  starts_at: Date | string;
  expires_at: Date | string | null;
  grant_reason: string | null;
};

type IdentityExternalDefinitionRow = RowDataPacket & {
  group_id: number | string;
  source_type: Exclude<IdentityGroupSource, "custom">;
  rank_weight: number | string;
  baseline_permissions: unknown;
  capability_keys: unknown;
  source_kind: string;
  source_reference: string | null;
  synced_at: Date | string;
};

type IdentityPrivilegeSourceRow = RowDataPacket & {
  privilege_id: number | string;
  source_kind: string;
  source_reference: string | null;
};

type IdentityAdminAuthorizationRow = RowDataPacket & {
  external_key: string;
  rank_weight: number | string;
  baseline_permissions: unknown;
};

function getIdentityPool() {
  return getPortalDatabasePool();
}

export function identityGroupStorageConfigured() {
  return Boolean(process.env.PORTAL_DATABASE_URL);
}

function identityError(code: string, message: string): never {
  throw new IdentityGroupError(code, message);
}

function requireFounder(actor: IdentityFounderActor) {
  if (!actor.isFounder) {
    identityError(
      "founder_required",
      "Only an externally assigned Founder can manage identity groups.",
    );
  }
  return identitySteamId(actor.steamId, "Founder SteamID64");
}

function identitySteamId(value: unknown, field = "SteamID64") {
  const steamId = String(value ?? "").trim();
  if (!/^7656119\d{10}$/.test(steamId)) {
    identityError("invalid_input", `${field} is invalid.`);
  }
  return steamId;
}

function identityId(value: unknown, field: string) {
  const parsed = Number(value);
  if (!Number.isSafeInteger(parsed) || parsed < 1) {
    identityError("invalid_input", `${field} is invalid.`);
  }
  return parsed;
}

function identityInteger(
  value: unknown,
  field: string,
  minimum: number,
  maximum: number,
) {
  const parsed = Number(value);
  if (
    !Number.isSafeInteger(parsed) ||
    parsed < minimum ||
    parsed > maximum
  ) {
    identityError(
      "invalid_input",
      `${field} must be between ${minimum} and ${maximum}.`,
    );
  }
  return parsed;
}

function identityText(
  value: unknown,
  field: string,
  maximum: number,
  minimum = 1,
) {
  const text = String(value ?? "").normalize("NFKC").trim();
  if (text.length < minimum || text.length > maximum || /[\r\n\0]/.test(text)) {
    identityError(
      "invalid_input",
      `${field} must contain ${minimum}-${maximum} characters on one line.`,
    );
  }
  return text;
}

function identityOptionalText(value: unknown, field: string, maximum: number) {
  const text = String(value ?? "").normalize("NFKC").trim();
  return text ? identityText(text, field, maximum) : null;
}

function identityDefinitionKey(
  value: unknown,
  field: string,
  maximum = 64,
  allowWildcard = false,
) {
  const key = String(value ?? "").trim().toLocaleLowerCase("en-US");
  const characters = allowWildcard ? "a-z0-9.*:_-" : "a-z0-9.:_-";
  const expression = new RegExp(`^[a-z0-9][${characters}]{0,${maximum - 1}}$`);
  if (!expression.test(key)) {
    identityError(
      "invalid_input",
      `${field} must start with a letter or number and use only lowercase letters, numbers, dots, colons, underscores, dashes${allowWildcard ? ", or wildcards" : ""}.`,
    );
  }
  if (
    allowWildcard &&
    key.includes("*") &&
    (!key.endsWith(".*") || key.indexOf("*") !== key.length - 1)
  ) {
    identityError(
      "invalid_input",
      `${field} wildcards are only supported as a final .* suffix.`,
    );
  }
  return key;
}

function identityColor(value: unknown, field: string) {
  const color = String(value ?? "").trim();
  if (!/^#[0-9a-f]{6}$/i.test(color)) {
    identityError("invalid_input", `${field} must be a six-digit hex color.`);
  }
  return color.toLowerCase();
}

const chatColorTokens = new Set([
  "[default]",
  "[white]",
  "[silver]",
  "[grey]",
  "[red]",
  "[lightred]",
  "[orange]",
  "[gold]",
  "[yellow]",
  "[lime]",
  "[green]",
  "[blue]",
  "[lightblue]",
  "[purple]",
  "[lightpurple]",
  "[teamcolor]",
]);

function identityChatColor(value: unknown, field: string, optional = false) {
  const color = String(value ?? "").trim().toLocaleLowerCase("en-US");
  if (!color && optional) return null;
  if (!chatColorTokens.has(color)) {
    identityError("invalid_input", `${field} is not a supported chat color.`);
  }
  return color;
}

function identityRequestKey(value: unknown) {
  const key = String(value ?? "").trim();
  if (!/^[A-Za-z0-9._:-]{8,120}$/.test(key)) {
    identityError("invalid_input", "The mutation request key is invalid.");
  }
  return key;
}

function identityAuditKey(value: unknown) {
  const key = String(value ?? "").trim();
  if (!/^[A-Za-z0-9._:-]{8,160}$/.test(key)) {
    identityError("invalid_input", "The audit request key is invalid.");
  }
  return key;
}

function identityExpiry(durationMinutes: unknown) {
  const duration = identityInteger(
    durationMinutes ?? 0,
    "Duration",
    0,
    525_600,
  );
  return duration === 0 ? null : new Date(Date.now() + duration * 60_000);
}

function toIso(value: Date | string | null | undefined) {
  if (!value) return null;
  return new Date(value).toISOString();
}

function asBoolean(value: unknown) {
  return value === true || value === 1 || value === "1";
}

function asRecord(value: unknown): Record<string, unknown> {
  if (value && typeof value === "object" && !Buffer.isBuffer(value)) {
    return value as Record<string, unknown>;
  }
  try {
    const parsed = JSON.parse(Buffer.isBuffer(value) ? value.toString() : String(value ?? "{}"));
    return parsed && typeof parsed === "object" && !Array.isArray(parsed)
      ? (parsed as Record<string, unknown>)
      : {};
  } catch {
    return {};
  }
}

function asStringArray(value: unknown) {
  let parsed = value;
  if (Buffer.isBuffer(parsed)) parsed = parsed.toString("utf8");
  if (typeof parsed === "string") {
    try {
      parsed = JSON.parse(parsed);
    } catch {
      return [];
    }
  }
  if (!Array.isArray(parsed)) return [];
  return uniqueStrings(
    parsed
      .map((entry) => String(entry ?? "").normalize("NFKC").trim())
      .filter((entry) => entry.length > 0 && entry.length <= 128),
  ).slice(0, 1_000);
}

function uniqueStrings(values: string[]) {
  return [...new Set(values)];
}

function recordNumber(record: Record<string, unknown>, keys: string[]) {
  for (const key of keys) {
    const value = Number(record[key]);
    if (Number.isFinite(value)) return value;
  }
  return null;
}

function recordBoolean(record: Record<string, unknown>, keys: string[]) {
  for (const key of keys) {
    const value = record[key];
    if (typeof value === "boolean") return value;
    if (value === 1 || value === "1" || value === "true") return true;
  }
  return false;
}

function toTag(row: IdentityTagRow): IdentityChatTag {
  return {
    id: Number(row.id),
    key: String(row.tag_key),
    text: String(row.tag_text),
    colorToken: String(row.color_token),
    nameColorToken: row.name_color_token ? String(row.name_color_token) : null,
    messageColorToken: row.message_color_token
      ? String(row.message_color_token)
      : null,
    enabled: asBoolean(row.enabled),
    ...(row.hidden !== undefined ? { hidden: asBoolean(row.hidden) } : {}),
  };
}

function toPrivilege(
  row: IdentityPrivilegeRow,
  sources: IdentityPrivilegeSource[] = [],
): IdentityPrivilege {
  return {
    id: Number(row.id),
    key: String(row.privilege_key),
    scope: row.scope,
    displayName: String(row.display_name),
    description: row.description ? String(row.description) : null,
    sensitive: asBoolean(row.is_sensitive),
    enabled: asBoolean(row.enabled),
    sources,
  };
}

function emptyGroup(row: IdentityGroupRow): IdentityGroup {
  return {
    id: Number(row.id),
    key: String(row.group_key),
    displayName: String(row.display_name),
    sourceType: row.source_type,
    externalKey: row.external_key ? String(row.external_key) : null,
    description: row.description ? String(row.description) : null,
    badgeLabel: String(row.badge_label),
    badgeIconKey: String(row.badge_icon_key),
    badgeColor: String(row.badge_color),
    badgeSoftColor: String(row.badge_soft_color),
    profilePriority: Number(row.profile_priority),
    enabled: asBoolean(row.enabled),
    externalDefinition: null,
    memberCount: Number(row.member_count ?? 0),
    tags: [],
    privileges: [],
    rewards: [],
    memberships: [],
  };
}

async function withIdentityTransaction<T>(
  work: (connection: PoolConnection) => Promise<T>,
) {
  const pool = getIdentityPool();
  if (!pool) {
    identityError(
      "storage_unavailable",
      "The portal identity database is not configured.",
    );
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

async function writeIdentityAudit(
  connection: PoolConnection,
  input: {
    requestKey: string;
    actorSteamId: string | null;
    action: string;
    targetType: string;
    targetId: string;
    metadata?: Record<string, unknown>;
  },
) {
  const actorType = input.actorSteamId ? "founder" : "system";
  const actorId = input.actorSteamId ?? "identity-reconciler";
  const [result] = await connection.execute<ResultSetHeader>(
    "INSERT IGNORE INTO portal_identity_audit_events (idempotency_key, actor_type, actor_id, action, target_type, target_id, metadata) VALUES (?, ?, ?, ?, ?, ?, ?)",
    [
      identityAuditKey(input.requestKey),
      actorType,
      actorId,
      identityText(input.action, "Audit action", 80),
      identityText(input.targetType, "Audit target type", 48),
      identityText(input.targetId, "Audit target ID", 96),
      input.metadata ? JSON.stringify(input.metadata) : null,
    ],
  );
  if (result.affectedRows !== 1) {
    identityError(
      "request_replayed",
      "That identity action was already submitted. Refresh before trying again.",
    );
  }
}

async function lockGroup(connection: PoolConnection, groupId: number) {
  const [rows] = await connection.query<IdentityGroupRow[]>(
    "SELECT id, group_key, display_name, source_type, external_key, description, badge_label, badge_icon_key, badge_color, badge_soft_color, profile_priority, enabled FROM portal_identity_groups WHERE id = ? LIMIT 1 FOR UPDATE",
    [groupId],
  );
  if (!rows[0]) identityError("group_not_found", "That identity group does not exist.");
  return rows[0];
}

async function requireEnabledDefinition(
  connection: PoolConnection,
  table: "portal_identity_chat_tags" | "portal_identity_privileges",
  id: number,
  label: string,
) {
  const [rows] = await connection.query<Array<RowDataPacket & { id: number }>>(
    `SELECT id FROM ${table} WHERE id = ? AND enabled = TRUE LIMIT 1 FOR UPDATE`,
    [id],
  );
  if (!rows[0]) identityError("definition_not_found", `That ${label} is unavailable.`);
}

async function disableIdentityGroupListings(
  connection: PoolConnection,
  input: { groupId: number; actorSteamId: string },
) {
  try {
    const [result] = await connection.execute<ResultSetHeader>(
      "UPDATE portal_identity_group_listings AS listings " +
        "INNER JOIN portal_economy_catalogue AS catalogue ON catalogue.id = listings.catalogue_id " +
        "SET listings.enabled = FALSE, listings.updated_by_steam_id = ?, " +
        "catalogue.metadata = JSON_SET(catalogue.metadata, '$.marketEnabled', JSON_EXTRACT('false', '$'), '$.donationEnabled', JSON_EXTRACT('false', '$')) " +
        "WHERE listings.group_id = ? AND listings.enabled = TRUE",
      [input.actorSteamId, input.groupId],
    );
    return result.affectedRows;
  } catch (error) {
    const candidate = error as { code?: unknown; errno?: unknown };
    // Identity groups predate migration 020. Disabling a group must remain
    // usable during the narrow deployment window before listing storage is
    // installed; any other database error still aborts the transaction.
    if (candidate.code === "ER_NO_SUCH_TABLE" || candidate.errno === 1146) {
      return 0;
    }
    throw error;
  }
}

const identityGroupSelect =
  "SELECT g.id, g.group_key, g.display_name, g.source_type, g.external_key, g.description, g.badge_label, g.badge_icon_key, g.badge_color, g.badge_soft_color, g.profile_priority, g.enabled";

export async function getIdentityAdminSnapshot(): Promise<IdentityAdminSnapshot> {
  const pool = getIdentityPool();
  if (!pool) {
    return {
      groups: [],
      tags: [],
      privileges: [],
      directTagGrants: [],
      directPrivilegeGrants: [],
      catalogueStatus: {
        adminsCoreDefinitions: 0,
        vipCoreDefinitions: 0,
        discoveredPrivileges: 0,
        lastSyncedAt: null,
      },
    };
  }

  // Initial bootstrap is deliberately fail-soft here: the management page can
  // still display existing portal records if an optional config file is
  // malformed or temporarily unavailable. Explicit Founder syncs fail closed.
  try {
    await ensureIdentityCatalogue(pool);
  } catch (error) {
    console.warn(
      "Identity catalogue bootstrap could not complete:",
      error instanceof Error ? error.message : "unknown error",
    );
  }

  const [groupRows, tagRows, privilegeRows, groupTagRows, groupPrivilegeRows, rewardRows, membershipRows, directTagRows, directPrivilegeRows, externalDefinitionRows, privilegeSourceRows, catalogueStatus] =
    await Promise.all([
      pool.query<IdentityGroupRow[]>(
        identityGroupSelect +
          ", (SELECT COUNT(*) FROM portal_identity_group_memberships AS m WHERE m.group_id = g.id AND m.revoked_at IS NULL AND m.starts_at <= CURRENT_TIMESTAMP AND (m.expires_at IS NULL OR m.expires_at > CURRENT_TIMESTAMP)) AS member_count " +
          "FROM portal_identity_groups AS g ORDER BY g.profile_priority DESC, g.display_name, g.id",
      ),
      pool.query<IdentityTagRow[]>(
        "SELECT id, tag_key, tag_text, color_token, name_color_token, message_color_token, enabled FROM portal_identity_chat_tags ORDER BY enabled DESC, tag_text, id",
      ),
      pool.query<IdentityPrivilegeRow[]>(
        "SELECT id, privilege_key, scope, display_name, description, is_sensitive, enabled FROM portal_identity_privileges ORDER BY enabled DESC, scope, display_name, id",
      ),
      pool.query<IdentityTagRow[]>(
        "SELECT links.group_id, tags.id, tags.tag_key, tags.tag_text, tags.color_token, tags.name_color_token, tags.message_color_token, tags.enabled FROM portal_identity_group_chat_tags AS links INNER JOIN portal_identity_chat_tags AS tags ON tags.id = links.tag_id ORDER BY links.group_id, links.sort_order, tags.id",
      ),
      pool.query<IdentityPrivilegeRow[]>(
        "SELECT links.group_id, privileges.id, privileges.privilege_key, privileges.scope, privileges.display_name, privileges.description, privileges.is_sensitive, privileges.enabled FROM portal_identity_group_privileges AS links INNER JOIN portal_identity_privileges AS privileges ON privileges.id = links.privilege_id ORDER BY links.group_id, privileges.scope, privileges.display_name, privileges.id",
      ),
      pool.query<IdentityRewardRow[]>(
        "SELECT rewards.id, rewards.group_id, rewards.catalogue_id, catalogue.display_name, rewards.quantity, rewards.trade_policy, rewards.enabled FROM portal_identity_group_rewards AS rewards INNER JOIN portal_economy_catalogue AS catalogue ON catalogue.id = rewards.catalogue_id ORDER BY rewards.group_id, rewards.enabled DESC, catalogue.display_name, rewards.id",
      ),
      pool.query<IdentityMembershipRow[]>(
        "SELECT group_id, steam_id, starts_at, expires_at, grant_reason FROM portal_identity_group_memberships WHERE revoked_at IS NULL AND starts_at <= CURRENT_TIMESTAMP AND (expires_at IS NULL OR expires_at > CURRENT_TIMESTAMP) ORDER BY group_id, starts_at DESC, steam_id",
      ),
      pool.query<IdentityPlayerTagGrantRow[]>(
        "SELECT assigned.steam_id, assigned.starts_at, assigned.expires_at, assigned.grant_reason, tags.id, tags.tag_key, tags.tag_text, tags.color_token, tags.name_color_token, tags.message_color_token, tags.enabled FROM portal_identity_player_chat_tags AS assigned INNER JOIN portal_identity_chat_tags AS tags ON tags.id = assigned.tag_id WHERE assigned.revoked_at IS NULL AND assigned.starts_at <= CURRENT_TIMESTAMP AND (assigned.expires_at IS NULL OR assigned.expires_at > CURRENT_TIMESTAMP) ORDER BY assigned.starts_at DESC, assigned.steam_id, tags.id",
      ),
      pool.query<IdentityPlayerPrivilegeGrantRow[]>(
        "SELECT assigned.steam_id, assigned.starts_at, assigned.expires_at, assigned.grant_reason, privileges.id, privileges.privilege_key, privileges.scope, privileges.display_name, privileges.description, privileges.is_sensitive, privileges.enabled FROM portal_identity_player_privileges AS assigned INNER JOIN portal_identity_privileges AS privileges ON privileges.id = assigned.privilege_id WHERE assigned.revoked_at IS NULL AND assigned.starts_at <= CURRENT_TIMESTAMP AND (assigned.expires_at IS NULL OR assigned.expires_at > CURRENT_TIMESTAMP) ORDER BY assigned.starts_at DESC, assigned.steam_id, privileges.id",
      ),
      pool.query<IdentityExternalDefinitionRow[]>(
        "SELECT group_id, source_type, rank_weight, baseline_permissions, capability_keys, source_kind, source_reference, synced_at FROM portal_identity_external_group_definitions ORDER BY source_type, rank_weight DESC, external_key",
      ),
      pool.query<IdentityPrivilegeSourceRow[]>(
        "SELECT privilege_id, source_kind, source_reference FROM portal_identity_privilege_sources ORDER BY privilege_id, source_kind, source_reference",
      ),
      getIdentityCatalogueStatus(pool),
    ]);

  const groups = groupRows[0].map(emptyGroup);
  const groupsById = new Map(groups.map((group) => [group.id, group]));
  const sourcesByPrivilegeId = new Map<number, IdentityPrivilegeSource[]>();
  for (const row of privilegeSourceRows[0]) {
    const privilegeId = Number(row.privilege_id);
    const sources = sourcesByPrivilegeId.get(privilegeId) ?? [];
    sources.push({
      sourceKind: String(row.source_kind),
      sourceReference: row.source_reference ? String(row.source_reference) : null,
    });
    sourcesByPrivilegeId.set(privilegeId, sources);
  }
  for (const row of externalDefinitionRows[0]) {
    const sourceKind =
      row.source_kind === "runtime" || row.source_kind === "portal"
        ? row.source_kind
        : "config";
    const group = groupsById.get(Number(row.group_id));
    if (!group) continue;
    group.externalDefinition = {
      sourceType: row.source_type,
      rankWeight: Number(row.rank_weight),
      baselinePermissions: asStringArray(row.baseline_permissions),
      capabilityKeys: asStringArray(row.capability_keys),
      sourceKind,
      sourceReference: row.source_reference ? String(row.source_reference) : null,
      syncedAt: toIso(row.synced_at) ?? new Date(0).toISOString(),
    };
  }
  for (const row of groupTagRows[0]) {
    groupsById.get(Number(row.group_id))?.tags.push(toTag(row));
  }
  for (const row of groupPrivilegeRows[0]) {
    groupsById
      .get(Number(row.group_id))
      ?.privileges.push(
        toPrivilege(row, sourcesByPrivilegeId.get(Number(row.id)) ?? []),
      );
  }
  for (const row of rewardRows[0]) {
    groupsById.get(Number(row.group_id))?.rewards.push({
      id: Number(row.id),
      catalogueId: Number(row.catalogue_id),
      catalogueName: String(row.display_name),
      quantity: Number(row.quantity),
      tradePolicy: row.trade_policy,
      enabled: asBoolean(row.enabled),
    });
  }
  for (const row of membershipRows[0]) {
    groupsById.get(Number(row.group_id))?.memberships.push({
      steamId: String(row.steam_id),
      startsAt: toIso(row.starts_at) ?? new Date(0).toISOString(),
      expiresAt: toIso(row.expires_at),
      grantReason: row.grant_reason ? String(row.grant_reason) : null,
    });
  }

  return {
    groups,
    tags: tagRows[0].map(toTag),
    privileges: privilegeRows[0].map((row) =>
      toPrivilege(row, sourcesByPrivilegeId.get(Number(row.id)) ?? []),
    ),
    directTagGrants: directTagRows[0].map((row) => ({
      steamId: String(row.steam_id),
      tag: toTag(row),
      startsAt: toIso(row.starts_at) ?? new Date(0).toISOString(),
      expiresAt: toIso(row.expires_at),
      grantReason: row.grant_reason ? String(row.grant_reason) : null,
    })),
    directPrivilegeGrants: directPrivilegeRows[0].map((row) => ({
      steamId: String(row.steam_id),
      privilege: toPrivilege(
        row,
        sourcesByPrivilegeId.get(Number(row.id)) ?? [],
      ),
      startsAt: toIso(row.starts_at) ?? new Date(0).toISOString(),
      expiresAt: toIso(row.expires_at),
      grantReason: row.grant_reason ? String(row.grant_reason) : null,
    })),
    catalogueStatus,
  };
}

export async function syncExternalIdentityCatalogue(input: {
  actor: IdentityFounderActor;
  requestKey: string;
}) {
  const actorSteamId = requireFounder(input.actor);
  const requestKey = identityRequestKey(input.requestKey);
  const pool = getIdentityPool();
  if (!pool) {
    identityError(
      "storage_unavailable",
      "The portal identity database is not configured.",
    );
  }
  try {
    return await syncIdentityCatalogue(pool, {
      force: true,
      actorSteamId,
      auditKey: `${requestKey}:catalogue-sync`,
    });
  } catch (error) {
    if (error instanceof IdentityGroupError) throw error;
    identityError(
      "catalogue_sync_failed",
      "The external group catalogue could not be imported from the available configs.",
    );
  }
}

export async function getIdentityAdminAuthorizationDefinitions(): Promise<
  Array<{ name: string; immunity: number; permissions: string[] }>
> {
  const pool = getIdentityPool();
  if (!pool) return [];
  try {
    await ensureIdentityCatalogue(pool);
    const [rows] = await pool.query<IdentityAdminAuthorizationRow[]>(
      "SELECT external_key, rank_weight, baseline_permissions " +
        "FROM portal_identity_external_group_definitions " +
        "WHERE source_type = 'admins_core' ORDER BY rank_weight, external_key",
    );
    return rows.map((row) => ({
      name: String(row.external_key),
      immunity: Number(row.rank_weight),
      permissions: asStringArray(row.baseline_permissions),
    }));
  } catch {
    return [];
  }
}

export async function getIdentityVipGroupDefinitions(): Promise<
  Array<{ name: string; weight: number }>
> {
  const pool = getIdentityPool();
  if (!pool) return [];
  try {
    await ensureIdentityCatalogue(pool);
    const [rows] = await pool.query<IdentityAdminAuthorizationRow[]>(
      "SELECT external_key, rank_weight, baseline_permissions " +
        "FROM portal_identity_external_group_definitions " +
        "WHERE source_type = 'vipcore' ORDER BY rank_weight DESC, external_key",
    );
    return rows.map((row) => ({
      name: String(row.external_key),
      weight: Number(row.rank_weight),
    }));
  } catch {
    return [];
  }
}

function normalizeExternalNames(values: string[] | undefined) {
  return [
    ...new Set(
      (values ?? [])
        .map((value) => String(value).normalize("NFKC").trim())
        .filter((value) => value.length > 0 && value.length <= 100),
    ),
  ];
}

function toIdentityGroupBadgeData(
  row: IdentityGroupRow,
): IdentityGroupBadgeData {
  const group = emptyGroup(row);
  return {
    id: group.id,
    key: group.key,
    displayName: group.displayName,
    sourceType: group.sourceType,
    externalKey: group.externalKey,
    badgeLabel: group.badgeLabel,
    badgeIconKey: group.badgeIconKey,
    badgeColor: group.badgeColor,
    badgeSoftColor: group.badgeSoftColor,
    profilePriority: group.profilePriority,
  };
}

/**
 * Loads only badge presentation for player collections. External definitions
 * are read once and active custom memberships are read once, avoiding the
 * tags/privileges/rewards work performed by the full single-player resolver.
 * Public callers remain available while the portal database is unavailable.
 */
export async function getEffectiveIdentityGroupBadgesForPlayers(
  inputs: EffectiveIdentityGroupBadgeInput[],
): Promise<Map<string, IdentityGroupBadgeData[]>> {
  const groupsBySteamId = new Map<string, IdentityGroupBadgeData[]>();
  for (const input of inputs) {
    groupsBySteamId.set(String(input.steamId).trim(), []);
  }

  try {
    const pool = getIdentityPool();
    if (!pool || !inputs.length) return groupsBySteamId;

    const consolidated = new Map<
      string,
      { vipGroupNames: Set<string>; adminGroupNames: Set<string> }
    >();
    for (const input of inputs) {
      const steamId = identitySteamId(input.steamId);
      const entry = consolidated.get(steamId) ?? {
        vipGroupNames: new Set<string>(),
        adminGroupNames: new Set<string>(),
      };
      for (const name of normalizeExternalNames(input.vipGroupNames)) {
        entry.vipGroupNames.add(name);
      }
      for (const name of normalizeExternalNames(input.adminGroupNames)) {
        entry.adminGroupNames.add(name);
      }
      consolidated.set(steamId, entry);
      if (!groupsBySteamId.has(steamId)) groupsBySteamId.set(steamId, []);
    }

    const steamIds = [...consolidated.keys()];
    if (!steamIds.length) return groupsBySteamId;
    const steamPlaceholders = steamIds.map(() => "?").join(", ");
    const [[externalRows], [membershipRows]] = await Promise.all([
      pool.query<IdentityGroupRow[]>(
        identityGroupSelect +
          " FROM portal_identity_groups AS g WHERE g.enabled = TRUE AND g.source_type IN ('admins_core', 'vipcore') ORDER BY g.profile_priority DESC, g.display_name, g.id",
      ),
      pool.query<IdentityGroupMembershipBadgeRow[]>(
        identityGroupSelect +
          ", membership.steam_id FROM portal_identity_groups AS g " +
          "INNER JOIN portal_identity_group_memberships AS membership ON membership.group_id = g.id " +
          "WHERE g.enabled = TRUE AND membership.steam_id IN (" +
          steamPlaceholders +
          ") AND membership.revoked_at IS NULL AND membership.starts_at <= CURRENT_TIMESTAMP " +
          "AND (membership.expires_at IS NULL OR membership.expires_at > CURRENT_TIMESTAMP) " +
          "ORDER BY g.profile_priority DESC, g.display_name, g.id",
        steamIds,
      ),
    ]);

    const addGroup = (steamId: string, row: IdentityGroupRow) => {
      const groups = groupsBySteamId.get(steamId);
      if (!groups || groups.some((group) => group.id === Number(row.id))) return;
      groups.push(toIdentityGroupBadgeData(row));
    };

    // Portal-purchased memberships use this same timed entitlement table for
    // custom, VIPCore, and Admins.Core groups. External plug-in membership
    // names remain additive below and are still the only source of Founder
    // authorization.
    for (const row of membershipRows) addGroup(String(row.steam_id), row);

    const externalByKey = new Map<string, IdentityGroupRow>();
    for (const row of externalRows) {
      if (!row.external_key || row.source_type === "custom") continue;
      const key = identityExternalBadgeLookupKey(
        row.source_type,
        row.external_key,
      );
      if (!externalByKey.has(key)) externalByKey.set(key, row);
    }
    for (const [steamId, membership] of consolidated) {
      for (const name of membership.vipGroupNames) {
        const row = externalByKey.get(
          identityExternalBadgeLookupKey("vipcore", name),
        );
        if (row) addGroup(steamId, row);
      }
      for (const name of membership.adminGroupNames) {
        const row = externalByKey.get(
          identityExternalBadgeLookupKey("admins_core", name),
        );
        if (row) addGroup(steamId, row);
      }
    }

    for (const groups of groupsBySteamId.values()) {
      groups.sort(
        (left, right) =>
          right.profilePriority - left.profilePriority ||
          left.displayName.localeCompare(right.displayName) ||
          left.id - right.id,
      );
    }
    return groupsBySteamId;
  } catch {
    for (const steamId of groupsBySteamId.keys()) groupsBySteamId.set(steamId, []);
    return groupsBySteamId;
  }
}

/** Lightweight staff-configured badge catalogue for non-player group lists. */
export async function getIdentityGroupBadgeCatalogue(): Promise<
  IdentityGroupBadgeData[]
> {
  try {
    const pool = getIdentityPool();
    if (!pool) return [];
    const [rows] = await pool.query<IdentityGroupRow[]>(
      identityGroupSelect +
        " FROM portal_identity_groups AS g WHERE g.enabled = TRUE ORDER BY g.profile_priority DESC, g.display_name, g.id",
    );
    return rows.map(toIdentityGroupBadgeData);
  } catch {
    return [];
  }
}

async function getEffectiveGroupRows(
  executor: Pick<Pool, "query"> | Pick<PoolConnection, "query">,
  input: {
    steamId: string;
    vipGroupNames?: string[];
    adminGroupNames?: string[];
    lock?: boolean;
  },
) {
  const steamId = identitySteamId(input.steamId);
  const vipNames = normalizeExternalNames(input.vipGroupNames);
  const adminNames = normalizeExternalNames(input.adminGroupNames);
  const externalClauses: string[] = [];
  const externalValues: unknown[] = [];
  if (vipNames.length) {
    externalClauses.push(
      "(g.source_type = 'vipcore' AND g.external_key IN (" +
        vipNames.map(() => "?").join(", ") +
        "))",
    );
    externalValues.push(...vipNames);
  }
  if (adminNames.length) {
    externalClauses.push(
      "(g.source_type = 'admins_core' AND g.external_key IN (" +
        adminNames.map(() => "?").join(", ") +
        "))",
    );
    externalValues.push(...adminNames);
  }
  const externalSql = externalClauses.length
    ? " OR " + externalClauses.join(" OR ")
    : "";
  const [rows] = await executor.query<IdentityGroupRow[]>(
    identityGroupSelect +
      ", membership.group_id IS NOT NULL AS has_portal_membership, membership.expires_at AS membership_expires_at " +
      "FROM portal_identity_groups AS g " +
      "LEFT JOIN portal_identity_group_memberships AS membership ON membership.group_id = g.id AND membership.steam_id = ? " +
      "AND membership.revoked_at IS NULL AND membership.starts_at <= CURRENT_TIMESTAMP AND (membership.expires_at IS NULL OR membership.expires_at > CURRENT_TIMESTAMP) " +
      "WHERE g.enabled = TRUE AND (membership.group_id IS NOT NULL" +
      externalSql +
      ") ORDER BY g.profile_priority DESC, g.display_name, g.id" +
      (input.lock ? " FOR UPDATE" : ""),
    [steamId, ...externalValues],
  );
  return rows;
}

async function getEffectiveIdentityUnsafe(input: {
  steamId: string;
  vipGroupNames?: string[];
  adminGroupNames?: string[];
}): Promise<EffectiveIdentity> {
  const pool = getIdentityPool();
  if (!pool) return { groups: [], tags: [], privileges: [] };
  const steamId = identitySteamId(input.steamId);
  const groupRows = await getEffectiveGroupRows(pool, { ...input, steamId });
  const groups = groupRows.map((row) => ({
    ...emptyGroup(row),
    hasPortalMembership: asBoolean(row.has_portal_membership),
    membershipExpiresAt: toIso(row.membership_expires_at),
  }));
  const groupIds = groups.map((group) => group.id);
  const groupPlaceholders = groupIds.map(() => "?").join(", ");

  const [groupTagRows, playerTagRows, groupPrivilegeRows, playerPrivilegeRows] =
    await Promise.all([
      groupIds.length
        ? pool.query<IdentityTagRow[]>(
            "SELECT links.group_id, tags.id, tags.tag_key, tags.tag_text, tags.color_token, tags.name_color_token, tags.message_color_token, tags.enabled, preferences.hidden " +
              "FROM portal_identity_group_chat_tags AS links INNER JOIN portal_identity_groups AS identity_group ON identity_group.id = links.group_id INNER JOIN portal_identity_chat_tags AS tags ON tags.id = links.tag_id AND tags.enabled = TRUE " +
              "LEFT JOIN portal_identity_player_tag_preferences AS preferences ON preferences.steam_id = ? AND preferences.tag_id = tags.id " +
              "WHERE links.group_id IN (" +
              groupPlaceholders +
              ") ORDER BY identity_group.profile_priority DESC, links.sort_order, tags.id",
            [steamId, ...groupIds],
          )
        : Promise.resolve([[], []] as unknown as [IdentityTagRow[], unknown]),
      pool.query<IdentityTagRow[]>(
        "SELECT tags.id, tags.tag_key, tags.tag_text, tags.color_token, tags.name_color_token, tags.message_color_token, tags.enabled, preferences.hidden " +
          "FROM portal_identity_player_chat_tags AS assigned INNER JOIN portal_identity_chat_tags AS tags ON tags.id = assigned.tag_id AND tags.enabled = TRUE " +
          "LEFT JOIN portal_identity_player_tag_preferences AS preferences ON preferences.steam_id = assigned.steam_id AND preferences.tag_id = tags.id " +
          "WHERE assigned.steam_id = ? AND assigned.revoked_at IS NULL AND assigned.starts_at <= CURRENT_TIMESTAMP AND (assigned.expires_at IS NULL OR assigned.expires_at > CURRENT_TIMESTAMP) ORDER BY assigned.created_at, tags.id",
        [steamId],
      ),
      groupIds.length
        ? pool.query<IdentityPrivilegeRow[]>(
            "SELECT links.group_id, privileges.id, privileges.privilege_key, privileges.scope, privileges.display_name, privileges.description, privileges.is_sensitive, privileges.enabled " +
              "FROM portal_identity_group_privileges AS links INNER JOIN portal_identity_privileges AS privileges ON privileges.id = links.privilege_id AND privileges.enabled = TRUE " +
              "WHERE links.group_id IN (" +
              groupPlaceholders +
              ") ORDER BY privileges.scope, privileges.display_name, privileges.id",
            groupIds,
          )
        : Promise.resolve([[], []] as unknown as [IdentityPrivilegeRow[], unknown]),
      pool.query<IdentityPrivilegeRow[]>(
        "SELECT privileges.id, privileges.privilege_key, privileges.scope, privileges.display_name, privileges.description, privileges.is_sensitive, privileges.enabled " +
          "FROM portal_identity_player_privileges AS assigned INNER JOIN portal_identity_privileges AS privileges ON privileges.id = assigned.privilege_id AND privileges.enabled = TRUE " +
          "WHERE assigned.steam_id = ? AND assigned.revoked_at IS NULL AND assigned.starts_at <= CURRENT_TIMESTAMP AND (assigned.expires_at IS NULL OR assigned.expires_at > CURRENT_TIMESTAMP) ORDER BY privileges.scope, privileges.display_name, privileges.id",
        [steamId],
      ),
    ]);

  const groupsById = new Map(groups.map((group) => [group.id, group]));
  const tags = new Map<number, IdentityChatTag>();
  for (const row of [...groupTagRows[0], ...playerTagRows[0]]) {
    const tag = toTag(row);
    tags.set(tag.id, tag);
    if (row.group_id !== undefined) groupsById.get(Number(row.group_id))?.tags.push(tag);
  }
  const privileges = new Map<number, IdentityPrivilege>();
  for (const row of [...groupPrivilegeRows[0], ...playerPrivilegeRows[0]]) {
    const privilege = toPrivilege(row);
    privileges.set(privilege.id, privilege);
    if (row.group_id !== undefined) {
      groupsById.get(Number(row.group_id))?.privileges.push(privilege);
    }
  }
  return {
    groups,
    tags: [...tags.values()],
    privileges: [...privileges.values()],
  };
}

/** Public/profile reads are deliberately fail-soft during migration rollout or
 * a transient portal-DB outage. Administrative mutations below remain
 * transactional and fail closed. */
export async function getEffectiveIdentity(input: {
  steamId: string;
  vipGroupNames?: string[];
  adminGroupNames?: string[];
}): Promise<EffectiveIdentity> {
  try {
    return await getEffectiveIdentityUnsafe(input);
  } catch {
    return { groups: [], tags: [], privileges: [] };
  }
}

export async function createIdentityGroup(input: {
  actor: IdentityFounderActor;
  requestKey: string;
  key: string;
  displayName: string;
  description?: string | null;
  badgeLabel: string;
  badgeIconKey?: string;
  badgeColor: string;
  badgeSoftColor: string;
  profilePriority?: number;
}) {
  const actorSteamId = requireFounder(input.actor);
  const requestKey = identityRequestKey(input.requestKey);
  const key = identityDefinitionKey(input.key, "Group key");
  const displayName = identityText(input.displayName, "Group name", 100);
  const description = identityOptionalText(input.description, "Group description", 255);
  const badgeLabel = identityText(input.badgeLabel, "Badge label", 32);
  const badgeIconKey = identityDefinitionKey(
    input.badgeIconKey ?? "shield",
    "Badge icon",
    32,
  );
  if (!isIdentityGroupBadgeIconKey(badgeIconKey)) {
    identityError("invalid_input", "Select a supported badge icon.");
  }
  const badgeColor = identityColor(input.badgeColor, "Badge color");
  const badgeSoftColor = identityColor(
    input.badgeSoftColor,
    "Badge background color",
  );
  const profilePriority = identityInteger(
    input.profilePriority ?? 0,
    "Profile priority",
    -32_768,
    32_767,
  );

  return withIdentityTransaction(async (connection) => {
    const [result] = await connection.execute<ResultSetHeader>(
      "INSERT INTO portal_identity_groups (group_key, display_name, source_type, external_key, description, badge_label, badge_icon_key, badge_color, badge_soft_color, profile_priority, enabled, created_by_steam_id) VALUES (?, ?, 'custom', NULL, ?, ?, ?, ?, ?, ?, TRUE, ?)",
      [
        key,
        displayName,
        description,
        badgeLabel,
        badgeIconKey,
        badgeColor,
        badgeSoftColor,
        profilePriority,
        actorSteamId,
      ],
    );
    const groupId = Number(result.insertId);
    await writeIdentityAudit(connection, {
      requestKey: `${requestKey}:group-create`,
      actorSteamId,
      action: "identity.group.created",
      targetType: "identity-group",
      targetId: String(groupId),
      metadata: { key, displayName },
    });
    return { groupId };
  });
}

export async function updateIdentityGroup(input: {
  actor: IdentityFounderActor;
  requestKey: string;
  groupId: number;
  displayName: string;
  description?: string | null;
  badgeLabel: string;
  badgeIconKey?: string;
  badgeColor: string;
  badgeSoftColor: string;
  profilePriority?: number;
  enabled: boolean;
}) {
  const actorSteamId = requireFounder(input.actor);
  const requestKey = identityRequestKey(input.requestKey);
  const groupId = identityId(input.groupId, "Group ID");
  const displayName = identityText(input.displayName, "Group name", 100);
  const description = identityOptionalText(input.description, "Group description", 255);
  const badgeLabel = identityText(input.badgeLabel, "Badge label", 32);
  const badgeIconKey = identityDefinitionKey(
    input.badgeIconKey ?? "shield",
    "Badge icon",
    32,
  );
  if (!isIdentityGroupBadgeIconKey(badgeIconKey)) {
    identityError("invalid_input", "Select a supported badge icon.");
  }
  const badgeColor = identityColor(input.badgeColor, "Badge color");
  const badgeSoftColor = identityColor(
    input.badgeSoftColor,
    "Badge background color",
  );
  const profilePriority = identityInteger(
    input.profilePriority ?? 0,
    "Profile priority",
    -32_768,
    32_767,
  );

  return withIdentityTransaction(async (connection) => {
    const previous = await lockGroup(connection, groupId);
    await connection.execute(
      "UPDATE portal_identity_groups SET display_name = ?, description = ?, badge_label = ?, badge_icon_key = ?, badge_color = ?, badge_soft_color = ?, profile_priority = ?, enabled = ? WHERE id = ?",
      [
        displayName,
        description,
        badgeLabel,
        badgeIconKey,
        badgeColor,
        badgeSoftColor,
        profilePriority,
        input.enabled,
        groupId,
      ],
    );
    const disabling = asBoolean(previous.enabled) && !input.enabled;
    const revokedItemIds = disabling
      ? await revokeAccountBoundRewardsForGroup(connection, {
          groupId,
          actorSteamId,
          reason: "group-disabled",
        })
      : [];
    const disabledListings = !input.enabled
      ? await disableIdentityGroupListings(connection, {
          groupId,
          actorSteamId,
        })
      : 0;
    await writeIdentityAudit(connection, {
      requestKey: `${requestKey}:group-update`,
      actorSteamId,
      action: "identity.group.updated",
      targetType: "identity-group",
      targetId: String(groupId),
      metadata: {
        previous: {
          displayName: previous.display_name,
          enabled: asBoolean(previous.enabled),
        },
        next: { displayName, enabled: input.enabled },
        revokedItemIds,
        disabledListings,
      },
    });
    return { groupId, revokedItemIds };
  });
}

export async function archiveIdentityGroup(input: {
  actor: IdentityFounderActor;
  requestKey: string;
  groupId: number;
}) {
  const actorSteamId = requireFounder(input.actor);
  const requestKey = identityRequestKey(input.requestKey);
  const groupId = identityId(input.groupId, "Group ID");
  return withIdentityTransaction(async (connection) => {
    const group = await lockGroup(connection, groupId);
    if (group.source_type !== "custom") {
      identityError(
        "external_group",
        "External Admins.Core and VIPCore adapters cannot be archived.",
      );
    }
    await connection.execute(
      "UPDATE portal_identity_groups SET enabled = FALSE WHERE id = ?",
      [groupId],
    );
    await connection.execute(
      "UPDATE portal_identity_group_memberships SET revoked_at = COALESCE(revoked_at, CURRENT_TIMESTAMP), revoked_by_steam_id = COALESCE(revoked_by_steam_id, ?) WHERE group_id = ? AND revoked_at IS NULL",
      [actorSteamId, groupId],
    );
    const revokedItemIds = await revokeAccountBoundRewardsForGroup(connection, {
      groupId,
      actorSteamId,
      reason: "group-archived",
    });
    const disabledListings = await disableIdentityGroupListings(connection, {
      groupId,
      actorSteamId,
    });
    await writeIdentityAudit(connection, {
      requestKey: `${requestKey}:group-archive`,
      actorSteamId,
      action: "identity.group.archived",
      targetType: "identity-group",
      targetId: String(groupId),
      metadata: { key: group.group_key, revokedItemIds, disabledListings },
    });
    return { groupId, revokedItemIds };
  });
}

export async function assignIdentityGroup(input: {
  actor: IdentityFounderActor;
  requestKey: string;
  groupId: number;
  steamId: string;
  durationMinutes?: number;
  reason?: string | null;
}) {
  const actorSteamId = requireFounder(input.actor);
  const requestKey = identityRequestKey(input.requestKey);
  const groupId = identityId(input.groupId, "Group ID");
  const steamId = identitySteamId(input.steamId, "Player SteamID64");
  const expiresAt = identityExpiry(input.durationMinutes ?? 0);
  const reason = identityOptionalText(input.reason, "Grant reason", 180);
  return withIdentityTransaction(async (connection) => {
    const group = await lockGroup(connection, groupId);
    if (group.source_type !== "custom" || !asBoolean(group.enabled)) {
      identityError(
        "custom_group_required",
        "Only an enabled custom group can receive portal-managed members.",
      );
    }
    await connection.execute(
      "INSERT INTO portal_identity_group_memberships (group_id, steam_id, starts_at, expires_at, granted_by_steam_id, grant_reason, revoked_at, revoked_by_steam_id) VALUES (?, ?, CURRENT_TIMESTAMP, ?, ?, ?, NULL, NULL) " +
        "ON DUPLICATE KEY UPDATE starts_at = CURRENT_TIMESTAMP, expires_at = VALUES(expires_at), granted_by_steam_id = VALUES(granted_by_steam_id), grant_reason = VALUES(grant_reason), revoked_at = NULL, revoked_by_steam_id = NULL",
      [groupId, steamId, expiresAt, actorSteamId, reason],
    );
    const rewardResult = await applyIdentityGroupMembershipRewards(connection, {
      groupId,
      steamId,
      actorSteamId,
      reason: "group-membership-assigned",
    });
    await writeIdentityAudit(connection, {
      requestKey: `${requestKey}:membership-assign`,
      actorSteamId,
      action: "identity.membership.assigned",
      targetType: "steam-player",
      targetId: steamId,
      metadata: {
        groupId,
        expiresAt: expiresAt?.toISOString() ?? null,
        reason,
        awardedItemIds: rewardResult.awardedItemIds,
        restoredItemIds: rewardResult.restoredItemIds,
        reactivatedItemIds: rewardResult.reactivatedItemIds,
      },
    });
    return {
      groupId,
      steamId,
      awardedItemIds: rewardResult.awardedItemIds,
      restoredItemIds: rewardResult.restoredItemIds,
    };
  });
}

export async function removeIdentityGroupMembership(input: {
  actor: IdentityFounderActor;
  requestKey: string;
  groupId: number;
  steamId: string;
}) {
  const actorSteamId = requireFounder(input.actor);
  const requestKey = identityRequestKey(input.requestKey);
  const groupId = identityId(input.groupId, "Group ID");
  const steamId = identitySteamId(input.steamId, "Player SteamID64");
  return withIdentityTransaction(async (connection) => {
    const group = await lockGroup(connection, groupId);
    if (group.source_type !== "custom") {
      identityError(
        "custom_group_required",
        "External memberships must be managed by Admins.Core or VIPCore.",
      );
    }
    const [result] = await connection.execute<ResultSetHeader>(
      "UPDATE portal_identity_group_memberships SET revoked_at = CURRENT_TIMESTAMP, revoked_by_steam_id = ? WHERE group_id = ? AND steam_id = ? AND revoked_at IS NULL",
      [actorSteamId, groupId, steamId],
    );
    const revokedItemIds =
      result.affectedRows > 0
        ? await revokeAccountBoundRewardsForGroup(connection, {
            groupId,
            steamId,
            actorSteamId,
            reason: "group-membership-revoked",
          })
        : [];
    await writeIdentityAudit(connection, {
      requestKey: `${requestKey}:membership-remove`,
      actorSteamId,
      action: "identity.membership.revoked",
      targetType: "steam-player",
      targetId: steamId,
      metadata: {
        groupId,
        changed: result.affectedRows > 0,
        revokedItemIds,
      },
    });
    return {
      groupId,
      steamId,
      changed: result.affectedRows > 0,
      revokedItemIds,
    };
  });
}

export async function createIdentityChatTag(input: {
  actor: IdentityFounderActor;
  requestKey: string;
  key: string;
  text: string;
  colorToken: string;
  nameColorToken?: string | null;
  messageColorToken?: string | null;
}) {
  const actorSteamId = requireFounder(input.actor);
  const requestKey = identityRequestKey(input.requestKey);
  const key = identityDefinitionKey(input.key, "Tag key");
  const text = identityText(input.text, "Tag text", 64);
  const colorToken = identityChatColor(input.colorToken, "Tag color")!;
  const nameColorToken = identityChatColor(
    input.nameColorToken,
    "Name color",
    true,
  );
  const messageColorToken = identityChatColor(
    input.messageColorToken,
    "Message color",
    true,
  );
  return withIdentityTransaction(async (connection) => {
    const [result] = await connection.execute<ResultSetHeader>(
      "INSERT INTO portal_identity_chat_tags (tag_key, tag_text, color_token, name_color_token, message_color_token, enabled, created_by_steam_id) VALUES (?, ?, ?, ?, ?, TRUE, ?)",
      [key, text, colorToken, nameColorToken, messageColorToken, actorSteamId],
    );
    const tagId = Number(result.insertId);
    await writeIdentityAudit(connection, {
      requestKey: `${requestKey}:tag-create`,
      actorSteamId,
      action: "identity.tag.created",
      targetType: "chat-tag",
      targetId: String(tagId),
      metadata: { key, text },
    });
    return { tagId };
  });
}

export async function updateIdentityChatTag(input: {
  actor: IdentityFounderActor;
  requestKey: string;
  tagId: number;
  text: string;
  colorToken: string;
  nameColorToken?: string | null;
  messageColorToken?: string | null;
  enabled: boolean;
}) {
  const actorSteamId = requireFounder(input.actor);
  const requestKey = identityRequestKey(input.requestKey);
  const tagId = identityId(input.tagId, "Tag ID");
  const text = identityText(input.text, "Tag text", 64);
  const colorToken = identityChatColor(input.colorToken, "Tag color")!;
  const nameColorToken = identityChatColor(
    input.nameColorToken,
    "Name color",
    true,
  );
  const messageColorToken = identityChatColor(
    input.messageColorToken,
    "Message color",
    true,
  );
  return withIdentityTransaction(async (connection) => {
    const [result] = await connection.execute<ResultSetHeader>(
      "UPDATE portal_identity_chat_tags SET tag_text = ?, color_token = ?, name_color_token = ?, message_color_token = ?, enabled = ? WHERE id = ?",
      [
        text,
        colorToken,
        nameColorToken,
        messageColorToken,
        input.enabled,
        tagId,
      ],
    );
    if (!result.affectedRows) identityError("tag_not_found", "That chat tag does not exist.");
    await writeIdentityAudit(connection, {
      requestKey: `${requestKey}:tag-update`,
      actorSteamId,
      action: "identity.tag.updated",
      targetType: "chat-tag",
      targetId: String(tagId),
      metadata: { text, enabled: input.enabled },
    });
    return { tagId };
  });
}

export async function attachIdentityGroupTag(input: {
  actor: IdentityFounderActor;
  requestKey: string;
  groupId: number;
  tagId: number;
  sortOrder?: number;
}) {
  const actorSteamId = requireFounder(input.actor);
  const requestKey = identityRequestKey(input.requestKey);
  const groupId = identityId(input.groupId, "Group ID");
  const tagId = identityId(input.tagId, "Tag ID");
  const sortOrder = identityInteger(input.sortOrder ?? 0, "Tag order", 0, 65_535);
  return withIdentityTransaction(async (connection) => {
    await lockGroup(connection, groupId);
    await requireEnabledDefinition(connection, "portal_identity_chat_tags", tagId, "chat tag");
    await connection.execute(
      "INSERT INTO portal_identity_group_chat_tags (group_id, tag_id, sort_order, assigned_by_steam_id) VALUES (?, ?, ?, ?) ON DUPLICATE KEY UPDATE sort_order = VALUES(sort_order), assigned_by_steam_id = VALUES(assigned_by_steam_id)",
      [groupId, tagId, sortOrder, actorSteamId],
    );
    await writeIdentityAudit(connection, {
      requestKey: `${requestKey}:group-tag-attach`,
      actorSteamId,
      action: "identity.group.tag-attached",
      targetType: "identity-group",
      targetId: String(groupId),
      metadata: { tagId, sortOrder },
    });
    return { groupId, tagId };
  });
}

export async function detachIdentityGroupTag(input: {
  actor: IdentityFounderActor;
  requestKey: string;
  groupId: number;
  tagId: number;
}) {
  const actorSteamId = requireFounder(input.actor);
  const requestKey = identityRequestKey(input.requestKey);
  const groupId = identityId(input.groupId, "Group ID");
  const tagId = identityId(input.tagId, "Tag ID");
  return withIdentityTransaction(async (connection) => {
    await lockGroup(connection, groupId);
    await connection.execute(
      "DELETE FROM portal_identity_group_chat_tags WHERE group_id = ? AND tag_id = ?",
      [groupId, tagId],
    );
    await writeIdentityAudit(connection, {
      requestKey: `${requestKey}:group-tag-detach`,
      actorSteamId,
      action: "identity.group.tag-detached",
      targetType: "identity-group",
      targetId: String(groupId),
      metadata: { tagId },
    });
    return { groupId, tagId };
  });
}

export async function grantIdentityPlayerTag(input: {
  actor: IdentityFounderActor;
  requestKey: string;
  steamId: string;
  tagId: number;
  durationMinutes?: number;
  reason?: string | null;
}) {
  const actorSteamId = requireFounder(input.actor);
  const requestKey = identityRequestKey(input.requestKey);
  const steamId = identitySteamId(input.steamId, "Player SteamID64");
  const tagId = identityId(input.tagId, "Tag ID");
  const expiresAt = identityExpiry(input.durationMinutes ?? 0);
  const reason = identityOptionalText(input.reason, "Grant reason", 180);
  return withIdentityTransaction(async (connection) => {
    await requireEnabledDefinition(connection, "portal_identity_chat_tags", tagId, "chat tag");
    await connection.execute(
      "INSERT INTO portal_identity_player_chat_tags (steam_id, tag_id, starts_at, expires_at, assigned_by_steam_id, grant_reason, revoked_at, revoked_by_steam_id) VALUES (?, ?, CURRENT_TIMESTAMP, ?, ?, ?, NULL, NULL) " +
        "ON DUPLICATE KEY UPDATE starts_at = CURRENT_TIMESTAMP, expires_at = VALUES(expires_at), assigned_by_steam_id = VALUES(assigned_by_steam_id), grant_reason = VALUES(grant_reason), revoked_at = NULL, revoked_by_steam_id = NULL",
      [steamId, tagId, expiresAt, actorSteamId, reason],
    );
    await writeIdentityAudit(connection, {
      requestKey: `${requestKey}:player-tag-grant`,
      actorSteamId,
      action: "identity.player.tag-granted",
      targetType: "steam-player",
      targetId: steamId,
      metadata: { tagId, expiresAt: expiresAt?.toISOString() ?? null, reason },
    });
    return { steamId, tagId };
  });
}

export async function revokeIdentityPlayerTag(input: {
  actor: IdentityFounderActor;
  requestKey: string;
  steamId: string;
  tagId: number;
}) {
  const actorSteamId = requireFounder(input.actor);
  const requestKey = identityRequestKey(input.requestKey);
  const steamId = identitySteamId(input.steamId, "Player SteamID64");
  const tagId = identityId(input.tagId, "Tag ID");
  return withIdentityTransaction(async (connection) => {
    await connection.execute(
      "UPDATE portal_identity_player_chat_tags SET revoked_at = CURRENT_TIMESTAMP, revoked_by_steam_id = ? WHERE steam_id = ? AND tag_id = ? AND revoked_at IS NULL",
      [actorSteamId, steamId, tagId],
    );
    await writeIdentityAudit(connection, {
      requestKey: `${requestKey}:player-tag-revoke`,
      actorSteamId,
      action: "identity.player.tag-revoked",
      targetType: "steam-player",
      targetId: steamId,
      metadata: { tagId },
    });
    return { steamId, tagId };
  });
}

export async function createIdentityPrivilege(input: {
  actor: IdentityFounderActor;
  requestKey: string;
  key: string;
  scope: IdentityPrivilegeScope;
  displayName: string;
  description?: string | null;
  sensitive?: boolean;
}) {
  const actorSteamId = requireFounder(input.actor);
  const requestKey = identityRequestKey(input.requestKey);
  const key = identityDefinitionKey(input.key, "Privilege key", 96, true);
  if (input.scope !== "portal" && input.scope !== "game") {
    identityError("invalid_input", "Privilege scope is invalid.");
  }
  // Founder is an external root identity, not an assignable portal privilege.
  if (key === "founder" || key === "portal.founder" || key === "*") {
    identityError(
      "reserved_privilege",
      "Founder and unrestricted wildcard authority cannot be created here.",
    );
  }
  const displayName = identityText(input.displayName, "Privilege name", 100);
  const description = identityOptionalText(
    input.description,
    "Privilege description",
    255,
  );
  return withIdentityTransaction(async (connection) => {
    const [result] = await connection.execute<ResultSetHeader>(
      "INSERT INTO portal_identity_privileges (privilege_key, scope, display_name, description, is_sensitive, enabled, created_by_steam_id) VALUES (?, ?, ?, ?, ?, TRUE, ?)",
      [
        key,
        input.scope,
        displayName,
        description,
        Boolean(input.sensitive),
        actorSteamId,
      ],
    );
    const privilegeId = Number(result.insertId);
    await writeIdentityAudit(connection, {
      requestKey: `${requestKey}:privilege-create`,
      actorSteamId,
      action: "identity.privilege.created",
      targetType: "identity-privilege",
      targetId: String(privilegeId),
      metadata: { key, scope: input.scope, sensitive: Boolean(input.sensitive) },
    });
    return { privilegeId };
  });
}

export async function updateIdentityPrivilege(input: {
  actor: IdentityFounderActor;
  requestKey: string;
  privilegeId: number;
  displayName: string;
  description?: string | null;
  sensitive: boolean;
  enabled: boolean;
}) {
  const actorSteamId = requireFounder(input.actor);
  const requestKey = identityRequestKey(input.requestKey);
  const privilegeId = identityId(input.privilegeId, "Privilege ID");
  const displayName = identityText(input.displayName, "Privilege name", 100);
  const description = identityOptionalText(
    input.description,
    "Privilege description",
    255,
  );
  return withIdentityTransaction(async (connection) => {
    const [result] = await connection.execute<ResultSetHeader>(
      "UPDATE portal_identity_privileges SET display_name = ?, description = ?, is_sensitive = ?, enabled = ? WHERE id = ?",
      [displayName, description, input.sensitive, input.enabled, privilegeId],
    );
    if (!result.affectedRows) {
      identityError("privilege_not_found", "That privilege does not exist.");
    }
    await writeIdentityAudit(connection, {
      requestKey: `${requestKey}:privilege-update`,
      actorSteamId,
      action: "identity.privilege.updated",
      targetType: "identity-privilege",
      targetId: String(privilegeId),
      metadata: { displayName, sensitive: input.sensitive, enabled: input.enabled },
    });
    return { privilegeId };
  });
}

export async function attachIdentityGroupPrivilege(input: {
  actor: IdentityFounderActor;
  requestKey: string;
  groupId: number;
  privilegeId: number;
}) {
  const actorSteamId = requireFounder(input.actor);
  const requestKey = identityRequestKey(input.requestKey);
  const groupId = identityId(input.groupId, "Group ID");
  const privilegeId = identityId(input.privilegeId, "Privilege ID");
  return withIdentityTransaction(async (connection) => {
    await lockGroup(connection, groupId);
    await requireEnabledDefinition(
      connection,
      "portal_identity_privileges",
      privilegeId,
      "privilege",
    );
    await connection.execute(
      "INSERT IGNORE INTO portal_identity_group_privileges (group_id, privilege_id, granted_by_steam_id) VALUES (?, ?, ?)",
      [groupId, privilegeId, actorSteamId],
    );
    await writeIdentityAudit(connection, {
      requestKey: `${requestKey}:group-privilege-attach`,
      actorSteamId,
      action: "identity.group.privilege-attached",
      targetType: "identity-group",
      targetId: String(groupId),
      metadata: { privilegeId },
    });
    return { groupId, privilegeId };
  });
}

export async function detachIdentityGroupPrivilege(input: {
  actor: IdentityFounderActor;
  requestKey: string;
  groupId: number;
  privilegeId: number;
}) {
  const actorSteamId = requireFounder(input.actor);
  const requestKey = identityRequestKey(input.requestKey);
  const groupId = identityId(input.groupId, "Group ID");
  const privilegeId = identityId(input.privilegeId, "Privilege ID");
  return withIdentityTransaction(async (connection) => {
    await lockGroup(connection, groupId);
    await connection.execute(
      "DELETE FROM portal_identity_group_privileges WHERE group_id = ? AND privilege_id = ?",
      [groupId, privilegeId],
    );
    await writeIdentityAudit(connection, {
      requestKey: `${requestKey}:group-privilege-detach`,
      actorSteamId,
      action: "identity.group.privilege-detached",
      targetType: "identity-group",
      targetId: String(groupId),
      metadata: { privilegeId },
    });
    return { groupId, privilegeId };
  });
}

export async function grantIdentityPlayerPrivilege(input: {
  actor: IdentityFounderActor;
  requestKey: string;
  steamId: string;
  privilegeId: number;
  durationMinutes?: number;
  reason?: string | null;
}) {
  const actorSteamId = requireFounder(input.actor);
  const requestKey = identityRequestKey(input.requestKey);
  const steamId = identitySteamId(input.steamId, "Player SteamID64");
  const privilegeId = identityId(input.privilegeId, "Privilege ID");
  const expiresAt = identityExpiry(input.durationMinutes ?? 0);
  const reason = identityOptionalText(input.reason, "Grant reason", 180);
  return withIdentityTransaction(async (connection) => {
    await requireEnabledDefinition(
      connection,
      "portal_identity_privileges",
      privilegeId,
      "privilege",
    );
    await connection.execute(
      "INSERT INTO portal_identity_player_privileges (steam_id, privilege_id, starts_at, expires_at, granted_by_steam_id, grant_reason, revoked_at, revoked_by_steam_id) VALUES (?, ?, CURRENT_TIMESTAMP, ?, ?, ?, NULL, NULL) " +
        "ON DUPLICATE KEY UPDATE starts_at = CURRENT_TIMESTAMP, expires_at = VALUES(expires_at), granted_by_steam_id = VALUES(granted_by_steam_id), grant_reason = VALUES(grant_reason), revoked_at = NULL, revoked_by_steam_id = NULL",
      [steamId, privilegeId, expiresAt, actorSteamId, reason],
    );
    await writeIdentityAudit(connection, {
      requestKey: `${requestKey}:player-privilege-grant`,
      actorSteamId,
      action: "identity.player.privilege-granted",
      targetType: "steam-player",
      targetId: steamId,
      metadata: {
        privilegeId,
        expiresAt: expiresAt?.toISOString() ?? null,
        reason,
      },
    });
    return { steamId, privilegeId };
  });
}

export async function revokeIdentityPlayerPrivilege(input: {
  actor: IdentityFounderActor;
  requestKey: string;
  steamId: string;
  privilegeId: number;
}) {
  const actorSteamId = requireFounder(input.actor);
  const requestKey = identityRequestKey(input.requestKey);
  const steamId = identitySteamId(input.steamId, "Player SteamID64");
  const privilegeId = identityId(input.privilegeId, "Privilege ID");
  return withIdentityTransaction(async (connection) => {
    await connection.execute(
      "UPDATE portal_identity_player_privileges SET revoked_at = CURRENT_TIMESTAMP, revoked_by_steam_id = ? WHERE steam_id = ? AND privilege_id = ? AND revoked_at IS NULL",
      [actorSteamId, steamId, privilegeId],
    );
    await writeIdentityAudit(connection, {
      requestKey: `${requestKey}:player-privilege-revoke`,
      actorSteamId,
      action: "identity.player.privilege-revoked",
      targetType: "steam-player",
      targetId: steamId,
      metadata: { privilegeId },
    });
    return { steamId, privilegeId };
  });
}

function rewardTradePolicy(value: unknown): IdentityTradePolicy {
  if (value !== "tradable" && value !== "account_bound") {
    identityError("invalid_input", "Reward trade policy is invalid.");
  }
  return value;
}

async function writeIdentityRewardItemEvent(
  connection: PoolConnection,
  input: {
    itemId: string;
    actorSteamId: string | null;
    eventType:
      | "identity.group_reward.revoked"
      | "identity.group_reward.restored"
      | "identity.group_reward.attachment-released";
    beforeState: Record<string, unknown>;
    afterState: Record<string, unknown>;
    metadata: Record<string, unknown>;
  },
) {
  await connection.execute(
    "INSERT INTO portal_inventory_item_events (item_id, actor_steam_id, event_type, idempotency_key, line_key, before_state, after_state, metadata) VALUES (?, ?, ?, ?, 'entitlement', ?, ?, ?)",
    [
      input.itemId,
      input.actorSteamId,
      input.eventType,
      `identity-entitlement:${randomUUID()}`,
      JSON.stringify(input.beforeState),
      JSON.stringify(input.afterState),
      JSON.stringify(input.metadata),
    ],
  );
}

async function enqueueIdentityRewardRefresh(
  connection: PoolConnection,
  input: {
    steamId: string;
    reason: string;
    itemIds: string[];
  },
) {
  if (!input.itemIds.length) return;
  await connection.execute(
    "INSERT INTO portal_economy_jobs (job_type, target_steam_id, payload, idempotency_key) VALUES ('economy.loadout.refresh', ?, ?, ?) ON DUPLICATE KEY UPDATE id = id",
    [
      input.steamId,
      JSON.stringify({
        steamId: input.steamId,
        reason: input.reason,
        itemIds: uniqueStrings(input.itemIds),
      }),
      `identity-entitlement:${randomUUID()}`,
    ],
  );
}

async function loadAccountBoundRewardAwards(
  connection: PoolConnection,
  input: {
    steamId?: string;
    groupId?: number;
    rewardId?: number;
    activeOnly?: boolean;
  },
) {
  const where = [
    "rewards.trade_policy = 'account_bound'",
    "items.tradable = FALSE",
    "items.owner_steam_id = awards.steam_id",
  ];
  if (input.activeOnly !== false) {
    where.unshift("awards.entitlement_active = TRUE");
  }
  const values: unknown[] = [];
  if (input.steamId) {
    where.push("awards.steam_id = ?");
    values.push(input.steamId);
  }
  if (input.groupId) {
    where.push("rewards.group_id = ?");
    values.push(input.groupId);
  }
  if (input.rewardId) {
    where.push("rewards.id = ?");
    values.push(input.rewardId);
  }
  const [rows] = await connection.query<
    Array<IdentityRewardAwardRow & { source_type: IdentityGroupSource }>
  >(
    "SELECT awards.reward_id, rewards.group_id, awards.steam_id, awards.ordinal, awards.item_id, awards.entitlement_active, awards.item_revoked_by_entitlement, " +
      "items.state AS item_state, items.item_type, items.tradable, identity_group.enabled AS group_enabled, rewards.enabled AS reward_enabled, identity_group.source_type " +
      "FROM portal_identity_group_reward_awards AS awards " +
      "INNER JOIN portal_identity_group_rewards AS rewards ON rewards.id = awards.reward_id " +
      "INNER JOIN portal_identity_groups AS identity_group ON identity_group.id = rewards.group_id " +
      "INNER JOIN portal_inventory_items AS items ON items.id = awards.item_id " +
      `WHERE ${where.join(" AND ")} ORDER BY awards.steam_id, awards.reward_id, awards.ordinal FOR UPDATE`,
    values,
  );
  return rows;
}

async function revokeIdentityRewardAwards(
  connection: PoolConnection,
  input: {
    steamId: string;
    rows: IdentityRewardAwardRow[];
    actorSteamId: string | null;
    reason: string;
  },
) {
  const revokedItemIds: string[] = [];
  const refreshItemIds: string[] = [];
  // Revoke awarded stickers before awarded weapons. If both belong to the
  // removed group, this avoids releasing the sticker to `available` while a
  // later row still expects its locked `attached` state.
  const orderedRows = [...input.rows].sort(
    (left, right) =>
      Number(right.item_state === "attached") -
      Number(left.item_state === "attached"),
  );
  for (const row of orderedRows) {
    if (row.item_state === "escrowed") {
      identityError(
        "reward_item_escrowed",
        "An account-bound group reward is unexpectedly escrowed. Cancel the trade or repair the item before removing the group.",
      );
    }

    const itemId = String(row.item_id);
    const shouldRevokeItem =
      row.item_state !== "revoked" && row.item_state !== "consumed";
    if (shouldRevokeItem) {
      const [weaponRows] = await connection.query<
        Array<RowDataPacket & { weapon_item_id: string }>
      >(
        "SELECT weapon_item_id FROM portal_inventory_item_stickers WHERE sticker_item_id = ? FOR UPDATE",
        [itemId],
      );
      if (weaponRows.length) {
        await connection.execute(
          "DELETE FROM portal_inventory_item_stickers WHERE sticker_item_id = ?",
          [itemId],
        );
        refreshItemIds.push(
          ...weaponRows.map((weapon) => String(weapon.weapon_item_id)),
        );
      }

      const [stickerRows] = await connection.query<
        Array<RowDataPacket & { sticker_item_id: string; state: string }>
      >(
        "SELECT relations.sticker_item_id, stickers.state FROM portal_inventory_item_stickers AS relations INNER JOIN portal_inventory_items AS stickers ON stickers.id = relations.sticker_item_id WHERE relations.weapon_item_id = ? FOR UPDATE",
        [itemId],
      );
      if (stickerRows.length) {
        await connection.execute(
          "DELETE FROM portal_inventory_item_stickers WHERE weapon_item_id = ?",
          [itemId],
        );
        for (const sticker of stickerRows) {
          if (sticker.state !== "attached") continue;
          const stickerItemId = String(sticker.sticker_item_id);
          await connection.execute(
            "UPDATE portal_inventory_items SET state = 'available' WHERE id = ? AND state = 'attached'",
            [stickerItemId],
          );
          await writeIdentityRewardItemEvent(connection, {
            itemId: stickerItemId,
            actorSteamId: input.actorSteamId,
            eventType: "identity.group_reward.attachment-released",
            beforeState: { ownerSteamId: input.steamId, state: "attached" },
            afterState: { ownerSteamId: input.steamId, state: "available" },
            metadata: {
              removedWeaponItemId: itemId,
              groupId: Number(row.group_id),
              rewardId: Number(row.reward_id),
              reason: input.reason,
            },
          });
          refreshItemIds.push(stickerItemId);
        }
      }

      await connection.execute(
        "UPDATE portal_loadout_slots SET item_id = NULL WHERE owner_steam_id = ? AND item_id = ?",
        [input.steamId, itemId],
      );
      if (row.item_type === "profile_theme") {
        await connection.execute(
          "UPDATE portal_player_settings SET active_theme_id = NULL, active_theme_item_id = NULL WHERE steam_id = ? AND active_theme_item_id = ?",
          [input.steamId, itemId],
        );
      }
      const [itemResult] = await connection.execute<ResultSetHeader>(
        "UPDATE portal_inventory_items SET state = 'revoked' WHERE id = ? AND owner_steam_id = ? AND tradable = FALSE AND state = ?",
        [itemId, input.steamId, row.item_state],
      );
      if (itemResult.affectedRows !== 1) {
        identityError(
          "reward_item_changed",
          "A group reward changed while its entitlement was being removed. Try again.",
        );
      }
      await writeIdentityRewardItemEvent(connection, {
        itemId,
        actorSteamId: input.actorSteamId,
        eventType: "identity.group_reward.revoked",
        beforeState: {
          ownerSteamId: input.steamId,
          state: row.item_state,
          tradable: false,
        },
        afterState: {
          ownerSteamId: input.steamId,
          state: "revoked",
          tradable: false,
        },
        metadata: {
          groupId: Number(row.group_id),
          rewardId: Number(row.reward_id),
          ordinal: Number(row.ordinal),
          reason: input.reason,
        },
      });
      revokedItemIds.push(itemId);
      refreshItemIds.push(itemId);
    }

    await connection.execute(
      "UPDATE portal_identity_group_reward_awards SET entitlement_active = FALSE, entitlement_revoked_at = CURRENT_TIMESTAMP, entitlement_revoked_by_steam_id = ?, item_revoked_by_entitlement = ? WHERE reward_id = ? AND steam_id = ? AND ordinal = ? AND entitlement_active = TRUE",
      [
        input.actorSteamId,
        shouldRevokeItem,
        Number(row.reward_id),
        input.steamId,
        Number(row.ordinal),
      ],
    );
  }

  await enqueueIdentityRewardRefresh(connection, {
    steamId: input.steamId,
    reason: input.reason,
    itemIds: refreshItemIds,
  });
  return revokedItemIds;
}

async function revokeAccountBoundRewardsForGroup(
  connection: PoolConnection,
  input: {
    groupId: number;
    steamId?: string;
    actorSteamId: string | null;
    reason: string;
  },
) {
  const rows = await loadAccountBoundRewardAwards(connection, {
    groupId: input.groupId,
    steamId: input.steamId,
  });
  const rowsBySteamId = new Map<string, IdentityRewardAwardRow[]>();
  for (const row of rows) {
    const rowSteamId = String(row.steam_id ?? input.steamId ?? "");
    if (!rowSteamId) continue;
    const playerRows = rowsBySteamId.get(rowSteamId) ?? [];
    playerRows.push(row);
    rowsBySteamId.set(rowSteamId, playerRows);
  }
  const revokedItemIds: string[] = [];
  for (const [steamId, playerRows] of rowsBySteamId) {
    revokedItemIds.push(
      ...(await revokeIdentityRewardAwards(connection, {
        steamId,
        rows: playerRows,
        actorSteamId: input.actorSteamId,
        reason: input.reason,
      })),
    );
  }
  return revokedItemIds;
}

async function revokeAccountBoundRewardsForReward(
  connection: PoolConnection,
  input: {
    rewardId: number;
    actorSteamId: string | null;
    reason: string;
  },
) {
  const rows = await loadAccountBoundRewardAwards(connection, {
    rewardId: input.rewardId,
  });
  const rowsBySteamId = new Map<string, IdentityRewardAwardRow[]>();
  for (const row of rows) {
    const steamId = String(row.steam_id);
    const playerRows = rowsBySteamId.get(steamId) ?? [];
    playerRows.push(row);
    rowsBySteamId.set(steamId, playerRows);
  }
  const revokedItemIds: string[] = [];
  for (const [steamId, playerRows] of rowsBySteamId) {
    revokedItemIds.push(
      ...(await revokeIdentityRewardAwards(connection, {
        steamId,
        rows: playerRows,
        actorSteamId: input.actorSteamId,
        reason: input.reason,
      })),
    );
  }
  return revokedItemIds;
}

async function reactivateIdentityRewardAwards(
  connection: PoolConnection,
  input: {
    steamId: string;
    rows: IdentityRewardAwardRow[];
    actorSteamId: string | null;
    reason: string;
  },
) {
  const restoredItemIds: string[] = [];
  const reactivatedItemIds: string[] = [];
  for (const row of input.rows) {
    if (asBoolean(row.entitlement_active)) continue;
    const itemId = String(row.item_id);
    const restoreItem =
      asBoolean(row.item_revoked_by_entitlement) &&
      row.item_state === "revoked" &&
      !asBoolean(row.tradable);
    if (restoreItem) {
      const [itemResult] = await connection.execute<ResultSetHeader>(
        "UPDATE portal_inventory_items SET state = 'available' WHERE id = ? AND owner_steam_id = ? AND state = 'revoked' AND tradable = FALSE",
        [itemId, input.steamId],
      );
      if (itemResult.affectedRows !== 1) {
        identityError(
          "reward_item_changed",
          "A group reward changed while its entitlement was being restored. Try again.",
        );
      }
      await writeIdentityRewardItemEvent(connection, {
        itemId,
        actorSteamId: input.actorSteamId,
        eventType: "identity.group_reward.restored",
        beforeState: {
          ownerSteamId: input.steamId,
          state: "revoked",
          tradable: false,
        },
        afterState: {
          ownerSteamId: input.steamId,
          state: "available",
          tradable: false,
        },
        metadata: {
          groupId: Number(row.group_id),
          rewardId: Number(row.reward_id),
          ordinal: Number(row.ordinal),
          reason: input.reason,
        },
      });
      restoredItemIds.push(itemId);
    }
    await connection.execute(
      "UPDATE portal_identity_group_reward_awards SET entitlement_active = TRUE, entitlement_revoked_at = NULL, entitlement_revoked_by_steam_id = NULL, item_revoked_by_entitlement = FALSE WHERE reward_id = ? AND steam_id = ? AND ordinal = ? AND entitlement_active = FALSE",
      [Number(row.reward_id), input.steamId, Number(row.ordinal)],
    );
    reactivatedItemIds.push(itemId);
  }
  await enqueueIdentityRewardRefresh(connection, {
    steamId: input.steamId,
    reason: input.reason,
    itemIds: restoredItemIds,
  });
  return { restoredItemIds, reactivatedItemIds };
}

async function reactivateAccountBoundRewardsForGroup(
  connection: PoolConnection,
  input: {
    groupId: number;
    steamId: string;
    actorSteamId: string | null;
    reason: string;
  },
) {
  const rows = await loadAccountBoundRewardAwards(connection, {
    groupId: input.groupId,
    steamId: input.steamId,
    activeOnly: false,
  });
  return reactivateIdentityRewardAwards(connection, {
    steamId: input.steamId,
    rows: rows.filter(
      (row) =>
        asBoolean(row.reward_enabled) && !asBoolean(row.entitlement_active),
    ),
    actorSteamId: input.actorSteamId,
    reason: input.reason,
  });
}

async function reconcileAccountBoundRewardEntitlements(
  connection: PoolConnection,
  input: {
    steamId: string;
    effectiveGroupIds: Set<number>;
    authoritativeSources: Set<IdentityGroupSource>;
    actorSteamId: string | null;
  },
) {
  const rows = await loadAccountBoundRewardAwards(connection, {
    steamId: input.steamId,
    activeOnly: false,
  });
  const inactiveRows: IdentityRewardAwardRow[] = [];
  const activeAgainRows: IdentityRewardAwardRow[] = [];
  for (const row of rows) {
    const sourceType = row.source_type;
    const groupEnabled = asBoolean(row.group_enabled);
    const rewardEnabled = asBoolean(row.reward_enabled);
    const sourceIsAuthoritative = input.authoritativeSources.has(sourceType);
    if (
      !groupEnabled ||
      !rewardEnabled ||
      (sourceIsAuthoritative &&
        !input.effectiveGroupIds.has(Number(row.group_id)))
    ) {
      if (asBoolean(row.entitlement_active)) inactiveRows.push(row);
    } else if (
      rewardEnabled &&
      sourceIsAuthoritative &&
      input.effectiveGroupIds.has(Number(row.group_id)) &&
      !asBoolean(row.entitlement_active)
    ) {
      activeAgainRows.push(row);
    }
  }
  const revokedItemIds = await revokeIdentityRewardAwards(connection, {
    steamId: input.steamId,
    rows: inactiveRows,
    actorSteamId: input.actorSteamId,
    reason: "group-membership-inactive",
  });
  const reactivated = await reactivateIdentityRewardAwards(connection, {
    steamId: input.steamId,
    rows: activeAgainRows,
    actorSteamId: input.actorSteamId,
    reason: "group-membership-effective-again",
  });
  return {
    revokedItemIds,
    deactivatedItemIds: inactiveRows.map((row) => String(row.item_id)),
    restoredItemIds: reactivated.restoredItemIds,
    reactivatedItemIds: reactivated.reactivatedItemIds,
  };
}

async function awardRewardsForGroup(
  connection: PoolConnection,
  input: {
    groupId: number;
    steamId: string;
    actorSteamId: string | null;
  },
) {
  const [rewardRows] = await connection.query<IdentityRewardRow[]>(
    "SELECT rewards.id, rewards.group_id, rewards.catalogue_id, rewards.quantity, rewards.trade_policy, rewards.enabled, catalogue.display_name, catalogue.item_type, catalogue.definition_index, catalogue.paintkit, catalogue.rarity_rank, catalogue.metadata, catalogue.enabled AS catalogue_enabled " +
      "FROM portal_identity_group_rewards AS rewards INNER JOIN portal_economy_catalogue AS catalogue ON catalogue.id = rewards.catalogue_id " +
      "WHERE rewards.group_id = ? AND rewards.enabled = TRUE AND catalogue.enabled = TRUE ORDER BY rewards.id FOR UPDATE",
    [input.groupId],
  );
  const result: IdentityRewardMutationResult = {
    awardedItemIds: [],
    restoredItemIds: [],
  };
  for (const reward of rewardRows) {
    const rewardId = Number(reward.id);
    const quantity = Number(reward.quantity);
    const [awardRows] = await connection.query<IdentityRewardAwardRow[]>(
      "SELECT awards.reward_id, rewards.group_id, awards.steam_id, awards.ordinal, awards.item_id, awards.entitlement_active, awards.item_revoked_by_entitlement, items.state AS item_state, items.item_type, items.tradable, TRUE AS group_enabled " +
        "FROM portal_identity_group_reward_awards AS awards INNER JOIN portal_identity_group_rewards AS rewards ON rewards.id = awards.reward_id INNER JOIN portal_inventory_items AS items ON items.id = awards.item_id AND items.owner_steam_id = awards.steam_id " +
        "WHERE awards.reward_id = ? AND awards.steam_id = ? ORDER BY awards.ordinal FOR UPDATE",
      [rewardId, input.steamId],
    );
    const awardsByOrdinal = new Map(
      awardRows.map((row) => [Number(row.ordinal), row] as const),
    );
    const metadata = asRecord(reward.metadata);
    const defaultSeed = recordNumber(metadata, ["seed", "defaultSeed"]);
    const defaultFloat = recordNumber(metadata, ["floatValue", "defaultFloat"]);
    const minimumFloat = recordNumber(metadata, ["minFloat", "floatMin", "wearMin"]);
    const maximumFloat = recordNumber(metadata, ["maxFloat", "floatMax", "wearMax"]);
    const floatValue =
      defaultFloat === null
        ? null
        : Number(
            Math.min(
              maximumFloat ?? 1,
              Math.max(minimumFloat ?? 0, defaultFloat),
            ).toFixed(6),
          );
    const seed =
      defaultSeed === null
        ? null
        : Math.max(0, Math.min(1_000, Math.trunc(defaultSeed)));
    const stattrak = recordBoolean(metadata, ["stattrak"]);
    const stattrakCount = Math.max(
      0,
      Math.trunc(recordNumber(metadata, ["stattrakCount"]) ?? 0),
    );
    const tradePolicy = rewardTradePolicy(reward.trade_policy);
    for (let ordinal = 1; ordinal <= quantity; ordinal += 1) {
      const existingAward = awardsByOrdinal.get(ordinal);
      if (existingAward) {
        if (!asBoolean(existingAward.entitlement_active)) {
          const restoreItem =
            tradePolicy === "account_bound" &&
            asBoolean(existingAward.item_revoked_by_entitlement) &&
            existingAward.item_state === "revoked" &&
            !asBoolean(existingAward.tradable);
          if (restoreItem) {
            await connection.execute(
              "UPDATE portal_inventory_items SET state = 'available' WHERE id = ? AND owner_steam_id = ? AND state = 'revoked' AND tradable = FALSE",
              [existingAward.item_id, input.steamId],
            );
            await writeIdentityRewardItemEvent(connection, {
              itemId: String(existingAward.item_id),
              actorSteamId: input.actorSteamId,
              eventType: "identity.group_reward.restored",
              beforeState: {
                ownerSteamId: input.steamId,
                state: "revoked",
                tradable: false,
              },
              afterState: {
                ownerSteamId: input.steamId,
                state: "available",
                tradable: false,
              },
              metadata: {
                groupId: input.groupId,
                rewardId,
                ordinal,
              },
            });
            result.restoredItemIds.push(String(existingAward.item_id));
          }
          await connection.execute(
            "UPDATE portal_identity_group_reward_awards SET entitlement_active = TRUE, entitlement_revoked_at = NULL, entitlement_revoked_by_steam_id = NULL, item_revoked_by_entitlement = FALSE WHERE reward_id = ? AND steam_id = ? AND ordinal = ? AND entitlement_active = FALSE",
            [rewardId, input.steamId, ordinal],
          );
        }
        continue;
      }
      const itemId = randomUUID().toLowerCase();
      const awardKey = `identity-reward:${rewardId}:${input.steamId}:${ordinal}`;
      const source = {
        type: "identity_group_reward",
        groupId: input.groupId,
        rewardId,
        ordinal,
        tradePolicy,
      };
      await connection.execute(
        "INSERT INTO portal_inventory_items (id, owner_steam_id, catalogue_id, item_type, definition_index, paintkit, seed, float_value, stattrak, stattrak_count, nametag, rarity_rank, state, tradable, attributes, source) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, NULL, ?, 'available', ?, ?, ?)",
        [
          itemId,
          input.steamId,
          Number(reward.catalogue_id),
          String(reward.item_type),
          reward.definition_index === null || reward.definition_index === undefined
            ? null
            : Number(reward.definition_index),
          reward.paintkit === null || reward.paintkit === undefined
            ? null
            : Number(reward.paintkit),
          seed,
          floatValue,
          stattrak,
          stattrakCount,
          Number(reward.rarity_rank ?? 0),
          tradePolicy === "tradable",
          JSON.stringify(metadata),
          JSON.stringify(source),
        ],
      );
      await connection.execute(
        "INSERT INTO portal_inventory_item_events (item_id, actor_steam_id, event_type, idempotency_key, line_key, before_state, after_state, metadata) VALUES (?, ?, 'identity.group_reward.awarded', ?, 'award', NULL, ?, ?)",
        [
          itemId,
          input.actorSteamId,
          awardKey,
          JSON.stringify({
            ownerSteamId: input.steamId,
            state: "available",
            tradable: tradePolicy === "tradable",
          }),
          JSON.stringify({
            groupId: input.groupId,
            rewardId,
            catalogueId: Number(reward.catalogue_id),
            ordinal,
          }),
        ],
      );
      await connection.execute(
        "INSERT INTO portal_identity_group_reward_awards (reward_id, steam_id, ordinal, item_id, awarded_by_steam_id) VALUES (?, ?, ?, ?, ?)",
        [rewardId, input.steamId, ordinal, itemId, input.actorSteamId],
      );
      result.awardedItemIds.push(itemId);
    }
  }
  await enqueueIdentityRewardRefresh(connection, {
    steamId: input.steamId,
    reason: "group-reward-restored",
    itemIds: result.restoredItemIds,
  });
  return result;
}

/**
 * Applies the inventory side effects of an effective group-membership grant
 * inside the caller's existing portal transaction. Both Founder assignments
 * and player-activated shop items use this path, so configured rewards remain
 * idempotent by (reward, player, ordinal) and account-bound items are restored
 * only while their reward definition is still active.
 */
export async function applyIdentityGroupMembershipRewards(
  connection: PoolConnection,
  input: {
    groupId: number;
    steamId: string;
    actorSteamId: string | null;
    reason: string;
  },
) {
  const groupId = identityId(input.groupId, "Group ID");
  const steamId = identitySteamId(input.steamId, "Player SteamID64");
  const actorSteamId = input.actorSteamId === null
    ? null
    : identitySteamId(input.actorSteamId, "Reward actor SteamID64");
  const reason = identityText(input.reason, "Reward activation reason", 180);
  const awarded = await awardRewardsForGroup(connection, {
    groupId,
    steamId,
    actorSteamId,
  });
  const reactivated = await reactivateAccountBoundRewardsForGroup(connection, {
    groupId,
    steamId,
    actorSteamId,
    reason,
  });
  return {
    awardedItemIds: awarded.awardedItemIds,
    restoredItemIds: uniqueStrings([
      ...awarded.restoredItemIds,
      ...reactivated.restoredItemIds,
    ]),
    reactivatedItemIds: reactivated.reactivatedItemIds,
  };
}

export async function addIdentityGroupReward(input: {
  actor: IdentityFounderActor;
  requestKey: string;
  groupId: number;
  catalogueId: number;
  quantity?: number;
  tradePolicy: IdentityTradePolicy;
  trustedExternalMemberSteamIds?: string[];
}) {
  const actorSteamId = requireFounder(input.actor);
  const requestKey = identityRequestKey(input.requestKey);
  const groupId = identityId(input.groupId, "Group ID");
  const catalogueId = identityId(input.catalogueId, "Catalogue item ID");
  const quantity = identityInteger(input.quantity ?? 1, "Reward quantity", 1, 25);
  const tradePolicy = rewardTradePolicy(input.tradePolicy);
  if ((input.trustedExternalMemberSteamIds?.length ?? 0) > 10_000) {
    identityError("invalid_input", "The external reward backfill is too large.");
  }
  const trustedExternalMemberSteamIds = [
    ...new Set(
      (input.trustedExternalMemberSteamIds ?? []).map((steamId) =>
        identitySteamId(steamId, "External member SteamID64"),
      ),
    ),
  ];
  return withIdentityTransaction(async (connection) => {
    const group = await lockGroup(connection, groupId);
    if (!asBoolean(group.enabled)) {
      identityError("group_disabled", "Enable the group before adding rewards.");
    }
    const [catalogueRows] = await connection.query<
      Array<RowDataPacket & { id: number | string }>
    >(
      "SELECT id FROM portal_economy_catalogue WHERE id = ? AND enabled = TRUE LIMIT 1 FOR UPDATE",
      [catalogueId],
    );
    if (!catalogueRows[0]) {
      identityError(
        "catalogue_not_found",
        "That catalogue reward does not exist or is disabled.",
      );
    }
    const [existingRows] = await connection.query<
      Array<RowDataPacket & { id: number | string }>
    >(
      "SELECT id FROM portal_identity_group_rewards WHERE group_id = ? AND catalogue_id = ? AND enabled = TRUE LIMIT 1 FOR UPDATE",
      [groupId, catalogueId],
    );
    if (existingRows[0]) {
      identityError(
        "reward_exists",
        "That catalogue item is already an active reward for this group.",
      );
    }
    const [result] = await connection.execute<ResultSetHeader>(
      "INSERT INTO portal_identity_group_rewards (group_id, catalogue_id, quantity, trade_policy, enabled, created_by_steam_id) VALUES (?, ?, ?, ?, TRUE, ?)",
      [groupId, catalogueId, quantity, tradePolicy, actorSteamId],
    );
    const rewardId = Number(result.insertId);
    const [memberRows] = await connection.query<
      Array<RowDataPacket & { steam_id: string }>
    >(
      "SELECT steam_id FROM portal_identity_group_memberships WHERE group_id = ? AND revoked_at IS NULL AND starts_at <= CURRENT_TIMESTAMP AND (expires_at IS NULL OR expires_at > CURRENT_TIMESTAMP) ORDER BY steam_id FOR UPDATE",
      [groupId],
    );
    const memberSteamIds = new Set([
      ...memberRows.map((member) => String(member.steam_id)),
      ...trustedExternalMemberSteamIds,
    ]);
    const awardedItemIds: string[] = [];
    const restoredItemIds: string[] = [];
    for (const steamId of memberSteamIds) {
      const rewardResult = await awardRewardsForGroup(connection, {
        groupId,
        steamId,
        actorSteamId,
      });
      awardedItemIds.push(...rewardResult.awardedItemIds);
      restoredItemIds.push(...rewardResult.restoredItemIds);
    }
    await writeIdentityAudit(connection, {
      requestKey: `${requestKey}:reward-add`,
      actorSteamId,
      action: "identity.group.reward-added",
      targetType: "identity-group",
      targetId: String(groupId),
      metadata: {
        rewardId,
        catalogueId,
        quantity,
        tradePolicy,
        externalMemberCount: trustedExternalMemberSteamIds.length,
        awardedItemCount: awardedItemIds.length,
        restoredItemCount: restoredItemIds.length,
      },
    });
    return { rewardId, awardedItemIds, restoredItemIds };
  });
}

export async function retireIdentityGroupReward(input: {
  actor: IdentityFounderActor;
  requestKey: string;
  rewardId: number;
}) {
  const actorSteamId = requireFounder(input.actor);
  const requestKey = identityRequestKey(input.requestKey);
  const rewardId = identityId(input.rewardId, "Reward ID");
  return withIdentityTransaction(async (connection) => {
    const [rows] = await connection.query<IdentityRewardRow[]>(
      "SELECT id, group_id, catalogue_id, '' AS display_name, quantity, trade_policy, enabled FROM portal_identity_group_rewards WHERE id = ? LIMIT 1 FOR UPDATE",
      [rewardId],
    );
    const reward = rows[0];
    if (!reward) identityError("reward_not_found", "That group reward does not exist.");
    await connection.execute(
      "UPDATE portal_identity_group_rewards SET enabled = FALSE, retired_at = COALESCE(retired_at, CURRENT_TIMESTAMP), retired_by_steam_id = COALESCE(retired_by_steam_id, ?) WHERE id = ?",
      [actorSteamId, rewardId],
    );
    const revokedItemIds =
      reward.trade_policy === "account_bound"
        ? await revokeAccountBoundRewardsForReward(connection, {
            rewardId,
            actorSteamId,
            reason: "group-reward-retired",
          })
        : [];
    await writeIdentityAudit(connection, {
      requestKey: `${requestKey}:reward-retire`,
      actorSteamId,
      action: "identity.group.reward-retired",
      targetType: "identity-group-reward",
      targetId: String(rewardId),
      metadata: {
        groupId: Number(reward.group_id),
        catalogueId: Number(reward.catalogue_id),
        tradePolicy: reward.trade_policy,
        revokedItemIds,
      },
    });
    return { rewardId, revokedItemIds };
  });
}

/**
 * Reconciles rewards after a trusted caller has read external Admins.Core and
 * VIPCore memberships. The caller must never populate those names from client
 * input. Reward award rows and inventory events make repeated calls idempotent.
 */
export async function reconcileIdentityGroupRewards(input: {
  steamId: string;
  vipGroupNames?: string[];
  adminGroupNames?: string[];
  requestKey?: string;
}) {
  const steamId = identitySteamId(input.steamId);
  const requestKey = identityRequestKey(
    input.requestKey ?? `reconcile:${steamId}:${randomUUID()}`,
  );
  return withIdentityTransaction(async (connection) => {
    const groupRows = await getEffectiveGroupRows(connection, {
      ...input,
      steamId,
      lock: true,
    });
    const awardedItemIds: string[] = [];
    const restoredItemIds: string[] = [];
    for (const group of groupRows) {
      const rewardResult = await awardRewardsForGroup(connection, {
        groupId: Number(group.id),
        steamId,
        actorSteamId: null,
      });
      awardedItemIds.push(...rewardResult.awardedItemIds);
      restoredItemIds.push(...rewardResult.restoredItemIds);
    }
    const effectiveGroupIds = new Set(
      groupRows.map((group) => Number(group.id)),
    );
    const authoritativeSources = new Set<IdentityGroupSource>(["custom"]);
    if (input.adminGroupNames !== undefined)
      authoritativeSources.add("admins_core");
    if (input.vipGroupNames !== undefined) authoritativeSources.add("vipcore");
    const entitlementResult = await reconcileAccountBoundRewardEntitlements(
      connection,
      {
        steamId,
        effectiveGroupIds,
        authoritativeSources,
        actorSteamId: null,
      },
    );
    restoredItemIds.push(...entitlementResult.restoredItemIds);
    const uniqueRestoredItemIds = uniqueStrings(restoredItemIds);
    const revokedItemIds = entitlementResult.revokedItemIds;
    if (
      awardedItemIds.length ||
      uniqueRestoredItemIds.length ||
      revokedItemIds.length ||
      entitlementResult.deactivatedItemIds.length ||
      entitlementResult.reactivatedItemIds.length
    ) {
      await writeIdentityAudit(connection, {
        requestKey: `${requestKey}:reward-reconcile`,
        actorSteamId: null,
        action: "identity.rewards.reconciled",
        targetType: "steam-player",
        targetId: steamId,
        metadata: {
          groupIds: groupRows.map((group) => Number(group.id)),
          awardedItemIds,
          restoredItemIds: uniqueRestoredItemIds,
          reactivatedItemIds: entitlementResult.reactivatedItemIds,
          deactivatedItemIds: entitlementResult.deactivatedItemIds,
          revokedItemIds,
        },
      });
    }
    return {
      steamId,
      awardedItemIds,
      restoredItemIds: uniqueRestoredItemIds,
      revokedItemIds,
      deactivatedItemIds: entitlementResult.deactivatedItemIds,
      reactivatedItemIds: entitlementResult.reactivatedItemIds,
    };
  });
}
