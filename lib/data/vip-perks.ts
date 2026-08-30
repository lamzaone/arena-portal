import "server-only";

import { createHash } from "node:crypto";

import {
  type Pool,
  type PoolConnection,
  type ResultSetHeader,
  type RowDataPacket,
} from "mysql2/promise";

import { getPortalDatabasePool } from "@/lib/data/database-pools";

export type VipPerkActor = {
  steamId: string;
  isFounder: boolean;
};

export type VipPerkDefinition = {
  id: number;
  key: string;
  displayName: string;
  description: string | null;
  category: string;
  configuration: unknown;
  enabled: boolean;
};

export type VipPerkShopOffer = {
  id: number;
  perkId: number;
  perkKey: string;
  perkName: string;
  perkDescription: string | null;
  perkCategory: string;
  tokenPrice: number;
  durationMinutes: number;
  enabled: boolean;
  runtimeVerified: boolean;
};

export type VipPerkGroupOption = {
  id: number;
  key: string;
  displayName: string;
  enabled: boolean;
};

export type VipPerkGrant = {
  id: number;
  perkId: number;
  perkKey: string;
  perkName: string;
  steamId: string | null;
  groupId: number | null;
  groupName: string | null;
  sourceType: "staff" | "shop" | "group";
  startsAt: string;
  expiresAt: string | null;
  reason: string | null;
};

export type EffectiveVipPerk = {
  steamId: string;
  perk: VipPerkDefinition;
  expiresAt: string | null;
  sources: string[];
};

export type EffectiveVipPerkPage = {
  entries: EffectiveVipPerk[];
  total: number;
  page: number;
  pageSize: number;
};

export type VipPerkAdminSnapshot = {
  perks: VipPerkDefinition[];
  offers: VipPerkShopOffer[];
  customGroups: VipPerkGroupOption[];
  playerGrants: VipPerkGrant[];
  groupGrants: VipPerkGrant[];
  grantTotal: number;
  grantPage: number;
  grantPageSize: number;
};

export class VipPerkError extends Error {
  constructor(
    public readonly code: string,
    message: string,
  ) {
    super(message);
    this.name = "VipPerkError";
  }
}

type PerkRow = RowDataPacket & {
  id: number | string;
  perk_key: string;
  display_name: string;
  description: string | null;
  category: string;
  configuration: unknown;
  enabled: number | boolean;
};

type OfferRow = RowDataPacket & {
  id: number | string;
  perk_id: number | string;
  perk_key: string;
  perk_name: string;
  perk_description: string | null;
  perk_category: string;
  token_price: number | string;
  duration_minutes: number | string;
  enabled: number | boolean;
  runtime_verified: number | boolean;
};

type GroupRow = RowDataPacket & {
  id: number | string;
  group_key: string;
  display_name: string;
  enabled: number | boolean;
};

type GrantRow = RowDataPacket & {
  id: number | string;
  perk_id: number | string;
  perk_key: string;
  perk_name: string;
  steam_id: string | null;
  group_id: number | string | null;
  group_name: string | null;
  source_type: "staff" | "shop" | "group";
  starts_at: Date | string;
  expires_at: Date | string | null;
  grant_reason: string | null;
};

type EffectiveRow = PerkRow & {
  steam_id: string;
  effective_expires_at: Date | string | null;
  source_labels: string | null;
  source_label?: string | null;
};

type OperationRow = RowDataPacket & {
  operation_name: string;
  actor_steam_id: string;
  request_hash: string;
  status: "processing" | "completed";
  result_json: unknown;
};

type AdminAuditRow = RowDataPacket & {
  actor_steam_id: string;
  action: string;
  target_type: string;
  target_id: string;
  request_hash: string | null;
};

const runtimeHeartbeatMinutes = 2;

function getPool() {
  return getPortalDatabasePool();
}

function runtimeServerId() {
  const parsed = Number.parseInt(process.env.GAME_VIP_SERVER_ID ?? "1", 10);
  return Number.isSafeInteger(parsed) && parsed >= 0 && parsed <= 2_147_483_647 ? parsed : 1;
}

export function vipPerkStorageConfigured() {
  return Boolean(process.env.PORTAL_DATABASE_URL);
}

function fail(code: string, message: string): never {
  throw new VipPerkError(code, message);
}

function integer(value: unknown, field: string, minimum = 1, maximum = Number.MAX_SAFE_INTEGER) {
  const parsed = Number(value);
  if (!Number.isSafeInteger(parsed) || parsed < minimum || parsed > maximum) {
    fail("invalid_input", `${field} is invalid.`);
  }
  return parsed;
}

function steamId(value: unknown, field = "SteamID64") {
  const parsed = String(value ?? "").trim();
  if (!/^7656119\d{10}$/.test(parsed)) fail("invalid_input", `${field} is invalid.`);
  return parsed;
}

function text(value: unknown, field: string, maximum: number, required = true) {
  const parsed = String(value ?? "").normalize("NFKC").trim();
  if ((required && !parsed) || parsed.length > maximum || /[\r\n\0]/.test(parsed)) fail("invalid_input", `${field} is invalid.`);
  return parsed;
}

function key(value: unknown) {
  const parsed = text(value, "Perk key", 96).toLocaleLowerCase("en-US");
  if (!/^[a-z0-9][a-z0-9._:-]{0,95}$/.test(parsed)) {
    fail("invalid_input", "Perk key may use lowercase letters, numbers, dots, colons, underscores, and dashes.");
  }
  return parsed;
}

function category(value: unknown) {
  const parsed = text(value || "gameplay", "Category", 48).toLocaleLowerCase("en-US");
  if (!/^[a-z0-9][a-z0-9_-]{0,47}$/.test(parsed)) fail("invalid_input", "Perk category is invalid.");
  return parsed;
}

function bool(value: unknown) {
  return value === true || value === 1 || ["1", "true", "on", "yes"].includes(String(value ?? "").toLocaleLowerCase("en-US"));
}

function iso(value: Date | string | null) {
  if (value === null) return null;
  const date = value instanceof Date ? value : new Date(value);
  return Number.isNaN(date.valueOf()) ? null : date.toISOString();
}

function jsonValue(value: unknown, field = "Configuration") {
  let parsed = value;
  if (typeof value === "string") {
    const source = value.trim();
    if (!source || source.length > 8_000) fail("invalid_input", `${field} is invalid.`);
    try {
      parsed = JSON.parse(source);
    } catch {
      fail("invalid_input", `${field} must be valid JSON.`);
    }
  }
  if (parsed === null || parsed === undefined || typeof parsed === "function" || typeof parsed === "symbol") {
    fail("invalid_input", `${field} is invalid.`);
  }
  const serialized = JSON.stringify(parsed);
  if (!serialized || serialized.length > 8_000) fail("invalid_input", `${field} is too large.`);
  return serialized;
}

function optionalJsonValue(value: unknown) {
  const source = typeof value === "string" ? value.trim() : value;
  if (source === "" || source === null || source === undefined) return null;
  return jsonValue(source, "Configuration override");
}

function configuration(value: unknown) {
  if (typeof value === "string") {
    try {
      return JSON.parse(value) as unknown;
    } catch {
      return value;
    }
  }
  return value;
}

function toPerk(row: PerkRow): VipPerkDefinition {
  return {
    id: integer(row.id, "Perk ID"),
    key: row.perk_key,
    displayName: row.display_name,
    description: row.description,
    category: row.category,
    configuration: configuration(row.configuration),
    enabled: bool(row.enabled),
  };
}

function toOffer(row: OfferRow): VipPerkShopOffer {
  return {
    id: integer(row.id, "Offer ID"),
    perkId: integer(row.perk_id, "Perk ID"),
    perkKey: row.perk_key,
    perkName: row.perk_name,
    perkDescription: row.perk_description,
    perkCategory: row.perk_category,
    tokenPrice: integer(row.token_price, "Token price"),
    durationMinutes: integer(row.duration_minutes, "Duration"),
    enabled: bool(row.enabled),
    runtimeVerified: bool(row.runtime_verified),
  };
}

function toGrant(row: GrantRow): VipPerkGrant {
  return {
    id: integer(row.id, "Grant ID"),
    perkId: integer(row.perk_id, "Perk ID"),
    perkKey: row.perk_key,
    perkName: row.perk_name,
    steamId: row.steam_id,
    groupId: row.group_id === null ? null : integer(row.group_id, "Group ID"),
    groupName: row.group_name,
    sourceType: row.source_type,
    startsAt: iso(row.starts_at) ?? new Date(0).toISOString(),
    expiresAt: iso(row.expires_at),
    reason: row.grant_reason,
  };
}

async function readPerks(connection: Pool | PoolConnection) {
  const [rows] = await connection.query<PerkRow[]>(
    "SELECT id, perk_key, display_name, description, category, configuration, enabled FROM portal_vip_perks ORDER BY enabled DESC, category ASC, display_name ASC, id ASC",
  );
  return rows.map(toPerk);
}

const offerSelect =
  "SELECT offers.id, offers.perk_id, perks.perk_key, perks.display_name AS perk_name, perks.description AS perk_description, perks.category AS perk_category, offers.token_price, offers.duration_minutes, offers.enabled, " +
  `(runtime_features.last_seen_at IS NOT NULL AND runtime_features.last_seen_at >= CURRENT_TIMESTAMP(6) - INTERVAL ${runtimeHeartbeatMinutes} MINUTE) AS runtime_verified ` +
  "FROM portal_vip_perk_shop_offers offers INNER JOIN portal_vip_perks perks ON perks.id = offers.perk_id " +
  "LEFT JOIN portal_vip_perk_runtime_features runtime_features ON runtime_features.server_id = ? AND runtime_features.feature_key = perks.perk_key ";

export async function getVipPerkStorefront(steamIdValue?: string | null) {
  const database = getPool();
  if (!database) return { offers: [] as VipPerkShopOffer[], owned: [] as EffectiveVipPerk[], balance: 0 };
  const parsedSteamId = steamIdValue ? steamId(steamIdValue) : null;
  const [offerResult, owned, balanceResult] = await Promise.all([
    database.query<OfferRow[]>(
      offerSelect +
      `WHERE offers.enabled = TRUE AND offers.retired_at IS NULL AND perks.enabled = TRUE AND runtime_features.last_seen_at >= CURRENT_TIMESTAMP(6) - INTERVAL ${runtimeHeartbeatMinutes} MINUTE ` +
      "ORDER BY perks.category ASC, perks.display_name ASC, offers.duration_minutes ASC, offers.id ASC",
      [runtimeServerId()],
    ),
    parsedSteamId ? getEffectiveVipPerksForPlayer(parsedSteamId) : Promise.resolve([] as EffectiveVipPerk[]),
    parsedSteamId
      ? database.query<(RowDataPacket & { balance: number | string })[]>(
          "SELECT balance FROM portal_token_accounts WHERE steam_id = ? LIMIT 1",
          [parsedSteamId],
        )
      : Promise.resolve([[]] as unknown as [(RowDataPacket & { balance: number | string })[]]),
  ]);
  const offerRows = offerResult[0];
  const balanceRows = balanceResult[0];
  return {
    offers: offerRows.map(toOffer),
    owned,
    balance: balanceRows[0]
      ? integer(balanceRows[0].balance, "Token balance", 0)
      : 0,
  };
}

const effectiveSourcesSql = `
  SELECT
    CONVERT(grants.steam_id USING utf8mb4) COLLATE utf8mb4_unicode_ci AS steam_id,
    perks.id,
    perks.perk_key,
    perks.display_name,
    perks.description,
    perks.category,
    COALESCE(grants.configuration_override, perks.configuration) AS configuration,
    perks.enabled,
    grants.expires_at AS effective_expires_at,
    CONVERT(CASE grants.source_type WHEN 'shop' THEN 'Token shop' ELSE 'Direct staff grant' END USING utf8mb4) COLLATE utf8mb4_unicode_ci AS source_label,
    CASE grants.source_type WHEN 'staff' THEN 3000000 ELSE 2000000 END AS source_priority,
    grants.id AS grant_id
  FROM portal_vip_perk_player_grants grants
  INNER JOIN portal_vip_perks perks ON perks.id = grants.perk_id AND perks.enabled = TRUE
  WHERE grants.revoked_at IS NULL
    AND grants.starts_at <= CURRENT_TIMESTAMP
    AND (grants.expires_at IS NULL OR grants.expires_at > CURRENT_TIMESTAMP)
  UNION ALL
  SELECT
    CONVERT(memberships.steam_id USING utf8mb4) COLLATE utf8mb4_unicode_ci AS steam_id,
    perks.id,
    perks.perk_key,
    perks.display_name,
    perks.description,
    perks.category,
    COALESCE(grants.configuration_override, perks.configuration) AS configuration,
    perks.enabled,
    CASE
      WHEN grants.expires_at IS NULL THEN memberships.expires_at
      WHEN memberships.expires_at IS NULL THEN grants.expires_at
      ELSE LEAST(grants.expires_at, memberships.expires_at)
    END AS effective_expires_at,
    CONVERT(CONCAT('Group: ', groups.display_name) USING utf8mb4) COLLATE utf8mb4_unicode_ci AS source_label,
    1000000 + groups.profile_priority AS source_priority,
    grants.id AS grant_id
  FROM portal_vip_perk_group_grants grants
  INNER JOIN portal_vip_perks perks ON perks.id = grants.perk_id AND perks.enabled = TRUE
  INNER JOIN portal_identity_groups groups ON groups.id = grants.group_id AND groups.enabled = TRUE AND groups.source_type = 'custom'
  INNER JOIN portal_identity_group_memberships memberships ON memberships.group_id = groups.id
    AND memberships.revoked_at IS NULL
    AND memberships.starts_at <= CURRENT_TIMESTAMP
    AND (memberships.expires_at IS NULL OR memberships.expires_at > CURRENT_TIMESTAMP)
  WHERE grants.revoked_at IS NULL
    AND grants.starts_at <= CURRENT_TIMESTAMP
    AND (grants.expires_at IS NULL OR grants.expires_at > CURRENT_TIMESTAMP)
`;

export async function getEffectiveVipPerksForPlayer(steamIdValue: string): Promise<EffectiveVipPerk[]> {
  const database = getPool();
  if (!database) return [];
  const parsedSteamId = steamId(steamIdValue);
  const [rows] = await database.query<EffectiveRow[]>(
    `SELECT sources.* FROM (${effectiveSourcesSql}) sources WHERE sources.steam_id = ? ORDER BY sources.perk_key ASC, sources.source_priority DESC, sources.grant_id DESC`,
    [parsedSteamId],
  );
  const grouped = new Map<string, EffectiveVipPerk & { permanent: boolean }>();
  for (const row of rows) {
    const existing = grouped.get(row.perk_key);
    const expiry = iso(row.effective_expires_at);
    if (!existing) {
      grouped.set(row.perk_key, {
        steamId: parsedSteamId,
        perk: toPerk(row),
        expiresAt: expiry,
        sources: row.source_label ? [row.source_label] : [],
        permanent: expiry === null,
      });
      continue;
    }
    if (row.source_label && !existing.sources.includes(row.source_label)) existing.sources.push(row.source_label);
    if (expiry === null) {
      existing.permanent = true;
      existing.expiresAt = null;
    } else if (!existing.permanent && (!existing.expiresAt || expiry > existing.expiresAt)) {
      existing.expiresAt = expiry;
    }
  }
  return [...grouped.values()].map(({ permanent: _permanent, ...entry }) => entry);
}

export async function getEffectiveVipPerkPage(pageValue = 1, pageSizeValue = 25): Promise<EffectiveVipPerkPage> {
  const database = getPool();
  const page = integer(pageValue, "Page", 1, 100000);
  const pageSize = integer(pageSizeValue, "Page size", 1, 100);
  if (!database) return { entries: [], total: 0, page, pageSize };
  const groupedSql = `
    SELECT
      sources.steam_id,
      sources.id,
      sources.perk_key,
      sources.display_name,
      sources.description,
      sources.category,
      JSON_OBJECT() AS configuration,
      TRUE AS enabled,
      CASE WHEN SUM(sources.effective_expires_at IS NULL) > 0 THEN NULL ELSE MAX(sources.effective_expires_at) END AS effective_expires_at,
      GROUP_CONCAT(DISTINCT sources.source_label ORDER BY sources.source_label SEPARATOR '||') AS source_labels
    FROM (${effectiveSourcesSql}) sources
    GROUP BY sources.steam_id, sources.id, sources.perk_key, sources.display_name, sources.description, sources.category
  `;
  const [countRows] = await database.query<(RowDataPacket & { total: number | string })[]>(
    `SELECT COUNT(*) AS total FROM (${groupedSql}) effective`,
  );
  const total = countRows[0] ? integer(countRows[0].total, "Perk roster total", 0) : 0;
  const resolvedPage = Math.min(page, Math.max(1, Math.ceil(total / pageSize)));
  const [rows] = await database.query<EffectiveRow[]>(
    `${groupedSql} ORDER BY display_name ASC, steam_id ASC, id ASC LIMIT ? OFFSET ?`,
    [pageSize, (resolvedPage - 1) * pageSize],
  );
  return {
    entries: rows.map((row) => ({
      steamId: row.steam_id,
      perk: toPerk(row),
      expiresAt: iso(row.effective_expires_at),
      sources: (row.source_labels ?? "").split("||").filter(Boolean),
    })),
    total,
    page: resolvedPage,
    pageSize,
  };
}

export async function getVipPerkAdminSnapshot(input: {
  includeGrants?: boolean;
  grantPage?: number;
  grantPageSize?: number;
} = {}): Promise<VipPerkAdminSnapshot> {
  const database = getPool();
  const requestedPage = integer(input.grantPage ?? 1, "Grant page", 1, 100000);
  const grantPageSize = integer(input.grantPageSize ?? 50, "Grant page size", 1, 100);
  if (!database) return { perks: [], offers: [], customGroups: [], playerGrants: [], groupGrants: [], grantTotal: 0, grantPage: requestedPage, grantPageSize };
  const [perks, offerResult, groupResult] = await Promise.all([
    readPerks(database),
    database.query<OfferRow[]>(
      offerSelect + "ORDER BY offers.enabled DESC, perks.display_name ASC, offers.duration_minutes ASC, offers.id ASC",
      [runtimeServerId()],
    ),
    database.query<GroupRow[]>("SELECT id, group_key, display_name, enabled FROM portal_identity_groups WHERE source_type = 'custom' ORDER BY enabled DESC, display_name ASC, id ASC"),
  ]);
  let grantRows: GrantRow[] = [];
  let grantTotal = 0;
  let grantPage = requestedPage;
  if (input.includeGrants) {
    const [countRows] = await database.query<(RowDataPacket & { total: number | string })[]>(
      "SELECT (" +
      "(SELECT COUNT(*) FROM portal_vip_perk_player_grants WHERE revoked_at IS NULL AND starts_at <= CURRENT_TIMESTAMP AND (expires_at IS NULL OR expires_at > CURRENT_TIMESTAMP)) + " +
      "(SELECT COUNT(*) FROM portal_vip_perk_group_grants WHERE revoked_at IS NULL AND starts_at <= CURRENT_TIMESTAMP AND (expires_at IS NULL OR expires_at > CURRENT_TIMESTAMP))" +
      ") AS total",
    );
    grantTotal = countRows[0] ? integer(countRows[0].total, "Active grant total", 0) : 0;
    grantPage = Math.min(requestedPage, Math.max(1, Math.ceil(grantTotal / grantPageSize)));
    const [rows] = await database.query<GrantRow[]>(
      "SELECT active_grants.* FROM (" +
      "SELECT grants.id, grants.perk_id, perks.perk_key, perks.display_name AS perk_name, grants.steam_id, NULL AS group_id, NULL AS group_name, CONVERT(grants.source_type USING utf8mb4) COLLATE utf8mb4_unicode_ci AS source_type, grants.starts_at, grants.expires_at, grants.grant_reason, grants.created_at " +
      "FROM portal_vip_perk_player_grants grants INNER JOIN portal_vip_perks perks ON perks.id = grants.perk_id " +
      "WHERE grants.revoked_at IS NULL AND grants.starts_at <= CURRENT_TIMESTAMP AND (grants.expires_at IS NULL OR grants.expires_at > CURRENT_TIMESTAMP) " +
      "UNION ALL " +
      "SELECT grants.id, grants.perk_id, perks.perk_key, perks.display_name AS perk_name, NULL AS steam_id, grants.group_id, groups.display_name AS group_name, CONVERT('group' USING utf8mb4) COLLATE utf8mb4_unicode_ci AS source_type, grants.starts_at, grants.expires_at, grants.grant_reason, grants.created_at " +
      "FROM portal_vip_perk_group_grants grants INNER JOIN portal_vip_perks perks ON perks.id = grants.perk_id INNER JOIN portal_identity_groups groups ON groups.id = grants.group_id " +
      "WHERE grants.revoked_at IS NULL AND grants.starts_at <= CURRENT_TIMESTAMP AND (grants.expires_at IS NULL OR grants.expires_at > CURRENT_TIMESTAMP)" +
      ") active_grants ORDER BY active_grants.created_at DESC, active_grants.id DESC LIMIT ? OFFSET ?",
      [grantPageSize, (grantPage - 1) * grantPageSize],
    );
    grantRows = rows;
  }
  return {
    perks,
    offers: offerResult[0].map(toOffer),
    customGroups: groupResult[0].map((row) => ({ id: integer(row.id, "Group ID"), key: row.group_key, displayName: row.display_name, enabled: bool(row.enabled) })),
    playerGrants: grantRows.filter((row) => row.source_type !== "group").map(toGrant),
    groupGrants: grantRows.filter((row) => row.source_type === "group").map(toGrant),
    grantTotal,
    grantPage,
    grantPageSize,
  };
}

function founder(actor: VipPerkActor) {
  if (!actor.isFounder) fail("founder_required", "Only an externally assigned Founder can manage VIP perks.");
  return steamId(actor.steamId, "Founder SteamID64");
}

function requestKey(value: unknown) {
  const parsed = String(value ?? "").trim();
  if (!/^[A-Za-z0-9:_-]{16,160}$/.test(parsed)) fail("invalid_input", "The request key is invalid.");
  return parsed;
}

function duration(value: unknown) {
  return integer(value, "Duration", 0, 525600);
}

function expiresAtFromDuration(durationMinutes: number) {
  return durationMinutes === 0 ? null : new Date(Date.now() + durationMinutes * 60_000);
}

async function adminMutation<T>(input: {
  actor: VipPerkActor;
  requestKey: string;
  action: string;
  targetType: string;
  targetId: string;
  metadata?: unknown;
  requestPayload?: unknown;
  mutate: (connection: PoolConnection, actorSteamId: string) => Promise<T>;
}) {
  const database = getPool();
  if (!database) fail("storage_unavailable", "VIP perk storage is not configured.");
  const actorSteamId = founder(input.actor);
  const mutationKey = requestKey(input.requestKey);
  const requestHash = createHash("sha256").update(JSON.stringify({
    actorSteamId,
    action: input.action,
    targetType: input.targetType,
    targetId: input.targetId,
    payload: input.requestPayload ?? input.metadata ?? {},
  })).digest("hex");
  const connection = await database.getConnection();
  try {
    await connection.beginTransaction();
    const [audit] = await connection.execute<ResultSetHeader>(
      "INSERT IGNORE INTO portal_vip_perk_admin_audit (idempotency_key, actor_steam_id, action, target_type, target_id, request_hash, metadata) VALUES (?, ?, ?, ?, ?, ?, ?)",
      [mutationKey, actorSteamId, input.action, input.targetType, input.targetId, requestHash, JSON.stringify(input.metadata ?? {})],
    );
    if (audit.affectedRows === 0) {
      const [audits] = await connection.query<AdminAuditRow[]>(
        "SELECT actor_steam_id, action, target_type, target_id, request_hash FROM portal_vip_perk_admin_audit WHERE idempotency_key = ? LIMIT 1 FOR UPDATE",
        [mutationKey],
      );
      const existing = audits[0];
      if (
        !existing ||
        existing.actor_steam_id !== actorSteamId ||
        existing.action !== input.action ||
        existing.target_type !== input.targetType ||
        existing.target_id !== input.targetId ||
        existing.request_hash !== requestHash
      ) {
        fail("idempotency_conflict", "This request key was already used for a different VIP perk action.");
      }
      await connection.rollback();
      return { replayed: true } as T;
    }
    const result = await input.mutate(connection, actorSteamId);
    await connection.commit();
    return result;
  } catch (error) {
    await connection.rollback();
    throw error;
  } finally {
    connection.release();
  }
}

export async function createVipPerk(input: {
  actor: VipPerkActor;
  requestKey: string;
  key: string;
  displayName: string;
  description?: string;
  category?: string;
  configuration: unknown;
}) {
  const perkKey = key(input.key);
  const displayName = text(input.displayName, "Display name", 100);
  const description = text(input.description, "Description", 255, false) || null;
  const perkCategory = category(input.category);
  const config = jsonValue(input.configuration);
  return adminMutation({
    ...input,
    action: "vip.perk.create",
    targetType: "vip_perk",
    targetId: perkKey,
    metadata: { perkKey },
    requestPayload: { perkKey, displayName, description, perkCategory, config },
    mutate: async (connection, actorSteamId) => {
      try {
        const [result] = await connection.execute<ResultSetHeader>(
          "INSERT INTO portal_vip_perks (perk_key, display_name, description, category, configuration, created_by_steam_id) VALUES (?, ?, ?, ?, JSON_EXTRACT(?, '$'), ?)",
          [perkKey, displayName, description, perkCategory, config, actorSteamId],
        );
        return { perkId: Number(result.insertId) };
      } catch (error) {
        if ((error as { code?: string }).code === "ER_DUP_ENTRY") fail("perk_exists", "A perk already uses that key.");
        throw error;
      }
    },
  });
}

export async function updateVipPerk(input: {
  actor: VipPerkActor;
  requestKey: string;
  perkId: number;
  displayName: string;
  description?: string;
  category?: string;
  configuration: unknown;
  enabled: boolean;
}) {
  const perkId = integer(input.perkId, "Perk ID");
  const displayName = text(input.displayName, "Display name", 100);
  const description = text(input.description, "Description", 255, false) || null;
  const perkCategory = category(input.category);
  const config = jsonValue(input.configuration);
  return adminMutation({
    ...input,
    action: "vip.perk.update",
    targetType: "vip_perk",
    targetId: String(perkId),
    metadata: { enabled: bool(input.enabled) },
    requestPayload: { perkId, displayName, description, perkCategory, config, enabled: bool(input.enabled) },
    mutate: async (connection) => {
      const [existing] = await connection.query<(RowDataPacket & { id: number | string })[]>(
        "SELECT id FROM portal_vip_perks WHERE id = ? FOR UPDATE",
        [perkId],
      );
      if (!existing[0]) fail("perk_not_found", "The VIP perk was not found.");
      await connection.execute<ResultSetHeader>(
        "UPDATE portal_vip_perks SET display_name = ?, description = ?, category = ?, configuration = JSON_EXTRACT(?, '$'), enabled = ? WHERE id = ?",
        [displayName, description, perkCategory, config, bool(input.enabled), perkId],
      );
      return { perkId };
    },
  });
}

export async function grantVipPerkToPlayer(input: {
  actor: VipPerkActor;
  requestKey: string;
  perkId: number;
  steamId: string;
  durationMinutes: number;
  reason?: string;
  configurationOverride?: unknown;
}) {
  const perkId = integer(input.perkId, "Perk ID");
  const targetSteamId = steamId(input.steamId);
  const durationMinutes = duration(input.durationMinutes);
  const reason = text(input.reason, "Reason", 180, false) || null;
  const override = optionalJsonValue(input.configurationOverride);
  return adminMutation({
    ...input,
    action: "vip.perk.player_grant",
    targetType: "player",
    targetId: targetSteamId,
    metadata: { perkId, durationMinutes },
    requestPayload: { perkId, targetSteamId, durationMinutes, reason, override },
    mutate: async (connection, actorSteamId) => {
      const [perks] = await connection.query<PerkRow[]>("SELECT id FROM portal_vip_perks WHERE id = ? AND enabled = TRUE FOR UPDATE", [perkId]);
      if (!perks[0]) fail("perk_not_found", "Choose an enabled VIP perk.");
      const [result] = await connection.execute<ResultSetHeader>(
        "INSERT INTO portal_vip_perk_player_grants (perk_id, steam_id, source_type, configuration_override, starts_at, expires_at, granted_by_steam_id, grant_reason) VALUES (?, ?, 'staff', JSON_EXTRACT(?, '$'), CURRENT_TIMESTAMP, ?, ?, ?)",
        [perkId, targetSteamId, override, expiresAtFromDuration(durationMinutes), actorSteamId, reason],
      );
      return { grantId: Number(result.insertId) };
    },
  });
}

export async function grantVipPerkToGroup(input: {
  actor: VipPerkActor;
  requestKey: string;
  perkId: number;
  groupId: number;
  durationMinutes: number;
  reason?: string;
  configurationOverride?: unknown;
}) {
  const perkId = integer(input.perkId, "Perk ID");
  const groupId = integer(input.groupId, "Group ID");
  const durationMinutes = duration(input.durationMinutes);
  const reason = text(input.reason, "Reason", 180, false) || null;
  const override = optionalJsonValue(input.configurationOverride);
  return adminMutation({
    ...input,
    action: "vip.perk.group_grant",
    targetType: "identity_group",
    targetId: String(groupId),
    metadata: { perkId, durationMinutes },
    requestPayload: { perkId, groupId, durationMinutes, reason, override },
    mutate: async (connection, actorSteamId) => {
      const [perks] = await connection.query<PerkRow[]>("SELECT id FROM portal_vip_perks WHERE id = ? AND enabled = TRUE FOR UPDATE", [perkId]);
      if (!perks[0]) fail("perk_not_found", "Choose an enabled VIP perk.");
      const [groups] = await connection.query<GroupRow[]>("SELECT id FROM portal_identity_groups WHERE id = ? AND source_type = 'custom' AND enabled = TRUE FOR UPDATE", [groupId]);
      if (!groups[0]) fail("group_not_found", "VIP perks can only be attached to an enabled custom group.");
      const [result] = await connection.execute<ResultSetHeader>(
        "INSERT INTO portal_vip_perk_group_grants (perk_id, group_id, configuration_override, starts_at, expires_at, granted_by_steam_id, grant_reason) VALUES (?, ?, JSON_EXTRACT(?, '$'), CURRENT_TIMESTAMP, ?, ?, ?)",
        [perkId, groupId, override, expiresAtFromDuration(durationMinutes), actorSteamId, reason],
      );
      return { grantId: Number(result.insertId) };
    },
  });
}

export async function revokeVipPerkGrant(input: {
  actor: VipPerkActor;
  requestKey: string;
  grantType: "player" | "group";
  grantId: number;
}) {
  const grantId = integer(input.grantId, "Grant ID");
  const table = input.grantType === "group" ? "portal_vip_perk_group_grants" : "portal_vip_perk_player_grants";
  return adminMutation({
    ...input,
    action: `vip.perk.${input.grantType}_revoke`,
    targetType: `${input.grantType}_perk_grant`,
    targetId: String(grantId),
    requestPayload: { grantType: input.grantType, grantId },
    mutate: async (connection, actorSteamId) => {
      if (input.grantType === "player") {
        const [grants] = await connection.query<(RowDataPacket & { source_type: "staff" | "shop" })[]>(
          "SELECT source_type FROM portal_vip_perk_player_grants WHERE id = ? AND revoked_at IS NULL FOR UPDATE",
          [grantId],
        );
        if (!grants[0]) fail("grant_not_found", "The active VIP perk grant was not found.");
        if (grants[0].source_type === "shop") {
          fail("shop_grant_immutable", "Token-purchased VIP perk grants cannot be revoked without an explicit refund workflow.");
        }
      }
      const [result] = await connection.execute<ResultSetHeader>(
        `UPDATE ${table} SET revoked_at = CURRENT_TIMESTAMP, revoked_by_steam_id = ? WHERE id = ? AND revoked_at IS NULL`,
        [actorSteamId, grantId],
      );
      if (!result.affectedRows) fail("grant_not_found", "The active VIP perk grant was not found.");
      return { grantId };
    },
  });
}

export async function saveVipPerkOffer(input: {
  actor: VipPerkActor;
  requestKey: string;
  perkId: number;
  tokenPrice: number;
  durationMinutes: number;
}) {
  const perkId = integer(input.perkId, "Perk ID");
  const tokenPrice = integer(input.tokenPrice, "Token price", 1, 1_000_000_000);
  const durationMinutes = integer(input.durationMinutes, "Duration", 1, 525600);
  return adminMutation({
    ...input,
    action: "vip.perk.offer_save",
    targetType: "vip_perk",
    targetId: String(perkId),
    metadata: { tokenPrice, durationMinutes },
    requestPayload: { perkId, tokenPrice, durationMinutes },
    mutate: async (connection, actorSteamId) => {
      const [perks] = await connection.query<(RowDataPacket & { id: number | string; perk_key: string })[]>(
        "SELECT id, perk_key FROM portal_vip_perks WHERE id = ? AND enabled = TRUE FOR UPDATE",
        [perkId],
      );
      if (!perks[0]) fail("perk_not_found", "Choose an enabled VIP perk.");
      const [runtimeFeatures] = await connection.query<(RowDataPacket & { feature_key: string })[]>(
        `SELECT feature_key FROM portal_vip_perk_runtime_features WHERE server_id = ? AND feature_key = ? AND last_seen_at >= CURRENT_TIMESTAMP(6) - INTERVAL ${runtimeHeartbeatMinutes} MINUTE LIMIT 1`,
        [runtimeServerId(), perks[0].perk_key],
      );
      if (!runtimeFeatures[0]) {
        fail("perk_not_runtime_verified", "VIPCore has not recently reported this feature on the configured game server.");
      }
      await connection.execute(
        "INSERT INTO portal_vip_perk_shop_offers (perk_id, token_price, duration_minutes, enabled, created_by_steam_id) VALUES (?, ?, ?, TRUE, ?) " +
        "ON DUPLICATE KEY UPDATE token_price = VALUES(token_price), enabled = TRUE, retired_at = NULL, retired_by_steam_id = NULL, updated_at = CURRENT_TIMESTAMP",
        [perkId, tokenPrice, durationMinutes, actorSteamId],
      );
      const [offers] = await connection.query<(RowDataPacket & { id: number | string })[]>("SELECT id FROM portal_vip_perk_shop_offers WHERE perk_id = ? AND duration_minutes = ? LIMIT 1", [perkId, durationMinutes]);
      return { offerId: integer(offers[0]?.id, "Offer ID") };
    },
  });
}

export async function retireVipPerkOffer(input: {
  actor: VipPerkActor;
  requestKey: string;
  offerId: number;
}) {
  const offerId = integer(input.offerId, "Offer ID");
  return adminMutation({
    ...input,
    action: "vip.perk.offer_retire",
    targetType: "vip_perk_offer",
    targetId: String(offerId),
    requestPayload: { offerId },
    mutate: async (connection, actorSteamId) => {
      const [result] = await connection.execute<ResultSetHeader>(
        "UPDATE portal_vip_perk_shop_offers SET enabled = FALSE, retired_at = CURRENT_TIMESTAMP, retired_by_steam_id = ? WHERE id = ? AND enabled = TRUE",
        [actorSteamId, offerId],
      );
      if (!result.affectedRows) fail("offer_not_found", "The active VIP perk offer was not found.");
      return { offerId };
    },
  });
}

export type VipPerkPurchaseResult = {
  offerId: number;
  perkId: number;
  perkName: string;
  tokenPrice: number;
  balance: number;
  expiresAt: string;
};

function parsedOperationResult(value: unknown): VipPerkPurchaseResult | null {
  let candidate = value;
  if (typeof value === "string") {
    try { candidate = JSON.parse(value) as unknown; } catch { return null; }
  }
  if (!candidate || typeof candidate !== "object") return null;
  const result = candidate as Partial<VipPerkPurchaseResult>;
  if (!Number.isSafeInteger(result.offerId) || !Number.isSafeInteger(result.perkId) || typeof result.perkName !== "string" || !Number.isSafeInteger(result.tokenPrice) || !Number.isSafeInteger(result.balance) || typeof result.expiresAt !== "string") return null;
  return result as VipPerkPurchaseResult;
}

export async function purchaseVipPerkOffer(input: {
  steamId: string;
  offerId: number;
  idempotencyKey: string;
}): Promise<VipPerkPurchaseResult> {
  const database = getPool();
  if (!database) fail("storage_unavailable", "The VIP perk shop is not configured.");
  const buyerSteamId = steamId(input.steamId);
  const offerId = integer(input.offerId, "Offer ID");
  const operationKey = String(input.idempotencyKey ?? "").trim();
  if (!/^[A-Za-z0-9_-]{16,128}$/.test(operationKey)) fail("invalid_idempotency_key", "Provide a valid idempotency key.");
  const requestHash = createHash("sha256").update(JSON.stringify({ buyerSteamId, offerId })).digest("hex");
  const connection = await database.getConnection();
  try {
    await connection.beginTransaction();
    const [reservation] = await connection.execute<ResultSetHeader>(
      "INSERT IGNORE INTO portal_economy_operations (operation_name, idempotency_key, actor_steam_id, request_hash) VALUES ('vip_perk.purchase', ?, ?, ?)",
      [operationKey, buyerSteamId, requestHash],
    );
    const [operations] = await connection.query<OperationRow[]>(
      "SELECT operation_name, actor_steam_id, request_hash, status, result_json FROM portal_economy_operations WHERE idempotency_key = ? FOR UPDATE",
      [operationKey],
    );
    const operation = operations[0];
    if (!operation) fail("operation_unavailable", "The VIP perk purchase could not reserve an operation.");
    if (operation.operation_name !== "vip_perk.purchase" || operation.actor_steam_id !== buyerSteamId || operation.request_hash !== requestHash) {
      fail("idempotency_conflict", "This request key was already used for another economy operation.");
    }
    if (reservation.affectedRows === 0) {
      if (operation.status !== "completed") fail("operation_in_progress", "This VIP perk purchase is already being processed.");
      const replay = parsedOperationResult(operation.result_json);
      if (!replay) fail("operation_unavailable", "The completed VIP perk purchase result is unavailable.");
      await connection.commit();
      return replay;
    }

    const [offers] = await connection.query<OfferRow[]>(
      offerSelect + "WHERE offers.id = ? AND offers.enabled = TRUE AND offers.retired_at IS NULL AND perks.enabled = TRUE FOR UPDATE",
      [runtimeServerId(), offerId],
    );
    const offer = offers[0];
    if (!offer) fail("requested_item_unavailable", "That VIP perk offer is no longer available.");
    const parsedOffer = toOffer(offer);
    if (!parsedOffer.runtimeVerified) {
      fail("requested_item_unavailable", "This VIP perk is temporarily unavailable because VIPCore has not recently reported its runtime feature.");
    }

    await connection.execute(
      "INSERT IGNORE INTO portal_token_accounts (steam_id, balance, lifetime_earned, lifetime_spent) VALUES (?, 0, 0, 0)",
      [buyerSteamId],
    );
    const [walletRows] = await connection.query<(RowDataPacket & { balance: number | string })[]>(
      "SELECT balance FROM portal_token_accounts WHERE steam_id = ? FOR UPDATE",
      [buyerSteamId],
    );
    const balance = walletRows[0] ? integer(walletRows[0].balance, "Token balance", 0) : 0;
    if (balance < parsedOffer.tokenPrice) fail("insufficient_tokens", `You need ${parsedOffer.tokenPrice.toLocaleString()} Tokens for this perk.`);

    const [directGrantRows] = await connection.query<(RowDataPacket & { expires_at: Date | string | null })[]>(
      "SELECT expires_at FROM portal_vip_perk_player_grants WHERE steam_id = ? AND perk_id = ? AND revoked_at IS NULL AND starts_at <= CURRENT_TIMESTAMP AND (expires_at IS NULL OR expires_at > CURRENT_TIMESTAMP) ORDER BY expires_at DESC, id DESC FOR UPDATE",
      [buyerSteamId, parsedOffer.perkId],
    );
    const [groupGrantRows] = await connection.query<(RowDataPacket & { grant_expires_at: Date | string | null; membership_expires_at: Date | string | null })[]>(
      "SELECT grants.expires_at AS grant_expires_at, memberships.expires_at AS membership_expires_at " +
      "FROM portal_vip_perk_group_grants grants " +
      "INNER JOIN portal_identity_groups groups ON groups.id = grants.group_id AND groups.enabled = TRUE AND groups.source_type = 'custom' " +
      "INNER JOIN portal_identity_group_memberships memberships ON memberships.group_id = groups.id AND memberships.steam_id = ? " +
      "WHERE grants.perk_id = ? AND grants.revoked_at IS NULL AND grants.starts_at <= CURRENT_TIMESTAMP AND (grants.expires_at IS NULL OR grants.expires_at > CURRENT_TIMESTAMP) " +
      "AND memberships.revoked_at IS NULL AND memberships.starts_at <= CURRENT_TIMESTAMP AND (memberships.expires_at IS NULL OR memberships.expires_at > CURRENT_TIMESTAMP) FOR UPDATE",
      [buyerSteamId, parsedOffer.perkId],
    );
    const effectiveExpirations: Array<Date | string | null> = directGrantRows.map((row) => row.expires_at);
    for (const row of groupGrantRows) {
      if (row.grant_expires_at === null && row.membership_expires_at === null) effectiveExpirations.push(null);
      else if (row.grant_expires_at === null) effectiveExpirations.push(row.membership_expires_at);
      else if (row.membership_expires_at === null) effectiveExpirations.push(row.grant_expires_at);
      else effectiveExpirations.push(new Date(Math.min(new Date(row.grant_expires_at).valueOf(), new Date(row.membership_expires_at).valueOf())));
    }
    if (effectiveExpirations.some((value) => value === null)) fail("invalid_input", "You already own this perk permanently.");
    const latestExpiry = effectiveExpirations.map(iso).filter((value): value is string => Boolean(value)).sort().at(-1);
    const startsAt = new Date();
    const baseline = latestExpiry && new Date(latestExpiry).valueOf() > startsAt.valueOf() ? new Date(latestExpiry) : startsAt;
    const expiresAt = new Date(baseline.valueOf() + parsedOffer.durationMinutes * 60_000);
    const nextBalance = balance - parsedOffer.tokenPrice;

    await connection.execute(
      "UPDATE portal_token_accounts SET balance = ?, lifetime_spent = lifetime_spent + ? WHERE steam_id = ?",
      [nextBalance, parsedOffer.tokenPrice, buyerSteamId],
    );
    await connection.execute(
      "INSERT INTO portal_token_ledger (account_steam_id, delta, balance_after, reason, reference_type, reference_id, idempotency_key, line_key, actor_steam_id, metadata) VALUES (?, ?, ?, 'vip_perk_purchase', 'vip_perk_offer', ?, ?, 'primary', ?, ?)",
      [buyerSteamId, -parsedOffer.tokenPrice, nextBalance, String(offerId), operationKey, buyerSteamId, JSON.stringify({ perkId: parsedOffer.perkId, durationMinutes: parsedOffer.durationMinutes })],
    );
    const [grantResult] = await connection.execute<ResultSetHeader>(
      "INSERT INTO portal_vip_perk_player_grants (perk_id, steam_id, source_type, offer_id, starts_at, expires_at, granted_by_steam_id, grant_reason) VALUES (?, ?, 'shop', ?, ?, ?, ?, 'Purchased with Tokens')",
      [parsedOffer.perkId, buyerSteamId, offerId, startsAt, expiresAt, buyerSteamId],
    );
    const grantId = Number(grantResult.insertId);
    await connection.execute(
      "INSERT INTO portal_vip_perk_purchases (offer_id, perk_id, player_grant_id, steam_id, token_price, duration_minutes, balance_after, entitlement_expires_at, idempotency_key) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)",
      [offerId, parsedOffer.perkId, grantId, buyerSteamId, parsedOffer.tokenPrice, parsedOffer.durationMinutes, nextBalance, expiresAt, operationKey],
    );
    const result: VipPerkPurchaseResult = {
      offerId,
      perkId: parsedOffer.perkId,
      perkName: parsedOffer.perkName,
      tokenPrice: parsedOffer.tokenPrice,
      balance: nextBalance,
      expiresAt: expiresAt.toISOString(),
    };
    await connection.execute(
      "UPDATE portal_economy_operations SET status = 'completed', result_json = ?, completed_at = CURRENT_TIMESTAMP WHERE idempotency_key = ?",
      [JSON.stringify(result), operationKey],
    );
    await connection.commit();
    return result;
  } catch (error) {
    await connection.rollback();
    throw error;
  } finally {
    connection.release();
  }
}
