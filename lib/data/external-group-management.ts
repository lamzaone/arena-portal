import "server-only";

import {
  type PoolConnection,
  type ResultSetHeader,
  type RowDataPacket,
} from "mysql2/promise";

import { configuredGameServerGuid } from "@/lib/admin/server-scope";
import {
  ArenaGroupDefinitionAuthorityError,
  synchronizeAdminsCoreGroupAuthorityInTransaction,
  synchronizeVipCoreGroupAuthorityInTransaction,
} from "@/lib/data/arena-group-definition-authority";
import { getGameDatabasePool, getPortalDatabasePool } from "@/lib/data/database-pools";
import {
  assertIdentityGroupExternalKeyAvailable,
  cancelIdentityGroupRename,
  completeIdentityGroupRename,
  IdentityGroupRenameError,
  prepareIdentityGroupRename,
  syncIdentityCatalogue,
  type PreparedIdentityGroupRename,
} from "@/lib/data/identity-catalogue";

export type RuntimeAdminsCoreGroup = {
  sourceType: "admins_core";
  rowId: number;
  name: string;
  permissions: string[];
  serverGuids: string[];
  immunity: number;
};

export type RuntimeVipCoreGroup = {
  sourceType: "vipcore";
  serverId: number;
  name: string;
  weight: number;
  values: Record<string, unknown>;
  enabled: boolean;
};

export type RuntimeExternalGroup = RuntimeAdminsCoreGroup | RuntimeVipCoreGroup;

export class ExternalGroupManagementError extends Error {
  constructor(
    public readonly code: string,
    message: string,
  ) {
    super(message);
    this.name = "ExternalGroupManagementError";
  }
}

type AdminGroupRow = RowDataPacket & {
  Id: number | string;
  Name: string;
  Permissions: unknown;
  Servers: unknown;
  Immunity: number | string;
};

type AdminAssignmentRow = RowDataPacket & {
  Id: number | string;
  Groups: unknown;
  Permissions: unknown;
  Servers: unknown;
};

type VipGroupRow = RowDataPacket & {
  server_id: number | string;
  name: string;
  weight: number | string;
  values_json: unknown;
  enabled: number | boolean;
};

type VipMembershipRow = RowDataPacket & {
  account_id: string;
  name: string;
  lastvisit: number | string;
  sid: number | string;
  group_name: string;
  expires: number | string;
};

function fail(code: string, message: string): never {
  throw new ExternalGroupManagementError(code, message);
}

function rethrowAuthorityError(error: unknown): never {
  if (error instanceof ArenaGroupDefinitionAuthorityError) {
    fail(
      error.code === "authority_storage"
        ? "game_group_authority_storage"
        : "game_group_authority_conflict",
      error.message,
    );
  }
  throw error;
}

async function synchronizeAdminsAuthority(
  connection: PoolConnection,
  input: {
    actorSteamId: string;
    previousName?: string;
    name?: string;
    rowId?: number;
  },
) {
  try {
    await synchronizeAdminsCoreGroupAuthorityInTransaction(connection, {
      actorSteamId: input.actorSteamId,
      renameHint: input.previousName && input.name && input.previousName !== input.name
        ? {
            sourceType: "admins_core",
            previousExternalKey: input.previousName,
            nextExternalKey: input.name,
            adminRowId: input.rowId,
          }
        : undefined,
    });
  } catch (error) {
    rethrowAuthorityError(error);
  }
}

async function synchronizeVipAuthority(
  connection: PoolConnection,
  input: {
    actorSteamId: string;
    previousName?: string;
    name?: string;
    serverId: number;
  },
) {
  try {
    await synchronizeVipCoreGroupAuthorityInTransaction(connection, {
      actorSteamId: input.actorSteamId,
      renameHint: input.previousName && input.name && input.previousName !== input.name
        ? {
            sourceType: "vipcore",
            previousExternalKey: input.previousName,
            nextExternalKey: input.name,
            vipServerId: input.serverId,
          }
        : undefined,
    });
  } catch (error) {
    rethrowAuthorityError(error);
  }
}

function gamePool() {
  const pool = getGameDatabasePool();
  if (!pool) fail("game_storage", "The game database is not configured.");
  return pool;
}

function vipServerId() {
  const value = Number.parseInt(process.env.GAME_VIP_SERVER_ID ?? "1", 10);
  return Number.isSafeInteger(value) && value >= 0 ? value : 1;
}

function normalizedName(value: unknown, maximum: number, label = "Group name") {
  const name = String(value ?? "").normalize("NFKC").trim();
  if (!name || name.length > maximum || /[\u0000-\u001f\u007f]/.test(name)) {
    fail("external_group_details", `${label} is invalid.`);
  }
  return name;
}

function normalizedInteger(
  value: unknown,
  label: string,
  minimum = 0,
  maximum = 1_000_000,
) {
  const parsed = Number(value);
  if (!Number.isSafeInteger(parsed) || parsed < minimum || parsed > maximum) {
    fail("external_group_details", `${label} is invalid.`);
  }
  return parsed;
}

function storedStringList(value: unknown, maximumEntries = 1_000) {
  let raw: unknown[] = [];
  if (Array.isArray(value)) {
    raw = value;
  } else if (typeof value === "string" && value.trim()) {
    try {
      const parsed: unknown = JSON.parse(value);
      raw = Array.isArray(parsed) ? parsed : value.split(/[\r\n,]+/);
    } catch {
      raw = value.split(/[\r\n,]+/);
    }
  }
  const unique = new Map<string, string>();
  for (const entry of raw) {
    const text = String(entry ?? "").normalize("NFKC").trim();
    if (!text || text.length > 255 || /[\u0000-\u001f\u007f]/.test(text)) continue;
    const identity = text.toLocaleLowerCase("en-US");
    if (!unique.has(identity)) unique.set(identity, text);
    if (unique.size >= maximumEntries) break;
  }
  return [...unique.values()];
}

function permissionList(value: unknown) {
  const permissions = storedStringList(value).map((permission) =>
    permission.toLocaleLowerCase("en-US"),
  );
  if (
    permissions.some(
      (permission) =>
        permission !== "*" &&
        !/^[a-z0-9][a-z0-9.*:_-]{0,95}$/.test(permission),
    )
  ) {
    fail("external_group_details", "One or more Admins.Core permissions are invalid.");
  }
  return permissions;
}

function serverList(value: unknown) {
  const servers = storedStringList(value, 256);
  if (!servers.length) {
    fail("external_group_details", "Assign the Admins.Core group to at least one server GUID.");
  }
  return servers;
}

function parsedValues(value: unknown) {
  let parsed: unknown = value;
  if (typeof value === "string") {
    if (value.length > 262_144) {
      fail("external_group_details", "VIP feature configuration is too large.");
    }
    try {
      parsed = JSON.parse(value);
    } catch {
      fail("external_group_details", "VIP feature configuration must be valid JSON.");
    }
  }
  if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
    fail("external_group_details", "VIP feature configuration must be a JSON object.");
  }
  const record = parsed as Record<string, unknown>;
  for (const key of Object.keys(record)) {
    if (!key.trim() || key.length > 128 || /[\u0000-\u001f\u007f]/.test(key)) {
      fail("external_group_details", "A VIP feature key is invalid.");
    }
  }
  return record;
}

function booleanValue(value: unknown) {
  return value === true || value === 1 || value === "1" || value === "true" || value === "on";
}

function sameName(left: string, right: string) {
  return left.localeCompare(right, "en", { sensitivity: "base" }) === 0;
}

function isFounderName(value: unknown) {
  return String(value ?? "")
    .normalize("NFKC")
    .trim()
    .toLocaleLowerCase("en-US") === "founder";
}

function appliesToServer(servers: string[], expected = configuredGameServerGuid()) {
  return servers.some((server) => sameName(server, expected));
}

function toAdminGroup(row: AdminGroupRow): RuntimeAdminsCoreGroup {
  return {
    sourceType: "admins_core",
    rowId: Number(row.Id),
    name: String(row.Name),
    permissions: permissionList(row.Permissions),
    serverGuids: storedStringList(row.Servers, 256),
    immunity: Number(row.Immunity ?? 0),
  };
}

function toVipGroup(row: VipGroupRow): RuntimeVipCoreGroup {
  let values: Record<string, unknown> = {};
  try {
    values = parsedValues(row.values_json);
  } catch {
    // Keep malformed legacy rows visible. Saving the editor requires valid JSON
    // and repairs the value through the normal validation path.
  }
  return {
    sourceType: "vipcore",
    serverId: Number(row.server_id),
    name: String(row.name),
    weight: Number(row.weight ?? 0),
    values,
    enabled: booleanValue(row.enabled),
  };
}

export async function getRuntimeExternalGroups(): Promise<RuntimeExternalGroup[]> {
  const pool = getGameDatabasePool();
  if (!pool) return [];
  const serverGuid = configuredGameServerGuid();
  const serverId = vipServerId();
  const [adminResult, vipResult] = await Promise.all([
    pool.query<AdminGroupRow[]>(
      "SELECT Id, Name, Permissions, Servers, Immunity FROM `groups` ORDER BY Immunity DESC, Name, Id",
    ),
    pool.query<VipGroupRow[]>(
      "SELECT server_id, name, weight, values_json, enabled FROM vip_group_definitions WHERE server_id = ? ORDER BY weight DESC, name",
      [serverId],
    ),
  ]);
  const admins = adminResult[0]
    .map(toAdminGroup)
    .filter((group) => appliesToServer(group.serverGuids, serverGuid));
  return [...admins, ...vipResult[0].map(toVipGroup)];
}

async function withGameTransaction<T>(work: (connection: PoolConnection) => Promise<T>) {
  const connection = await gamePool().getConnection();
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

function portalPoolForRename() {
  const pool = getPortalDatabasePool();
  if (!pool) {
    fail(
      "portal_storage",
      "Runtime group renames require the portal database and migration 024.",
    );
  }
  return pool;
}

function rethrowRenameError(error: unknown): never {
  if (error instanceof IdentityGroupRenameError) {
    fail(error.code, error.message);
  }
  const candidate = error as { code?: unknown; errno?: unknown };
  if (candidate.code === "ER_NO_SUCH_TABLE" || candidate.errno === 1146) {
    fail(
      "portal_storage",
      "Runtime group renames require portal database migration 024.",
    );
  }
  throw error;
}

async function prepareRuntimeRename(input: {
  sourceType: "admins_core" | "vipcore";
  previousName: string;
  name: string;
  actorSteamId: string;
  requestKey: string;
}) {
  if (input.previousName === input.name) return null;
  try {
    return await prepareIdentityGroupRename(portalPoolForRename(), {
      sourceType: input.sourceType,
      previousExternalKey: input.previousName,
      nextExternalKey: input.name,
      actorSteamId: input.actorSteamId,
      requestKey: input.requestKey,
    });
  } catch (error) {
    rethrowRenameError(error);
  }
}

async function assertRuntimeCreateNameAvailable(
  sourceType: "admins_core" | "vipcore",
  name: string,
) {
  try {
    await assertIdentityGroupExternalKeyAvailable(portalPoolForRename(), {
      sourceType,
      externalKey: name,
    });
  } catch (error) {
    rethrowRenameError(error);
  }
}

async function cancelPreparedRename(
  intent: PreparedIdentityGroupRename | null,
  gameError: unknown,
) {
  if (!intent) return;
  const reason = gameError instanceof Error
    ? `Game transaction failed: ${gameError.message}`
    : "Game transaction failed.";
  try {
    await cancelIdentityGroupRename(portalPoolForRename(), intent.intentId, reason);
  } catch (error) {
    // Preserve the authoritative game failure. A pending intent is harmless
    // while runtime still exposes the old key, and a retry using the same
    // request key can resume it.
    console.error("A failed runtime group rename intent could not be cancelled", error);
  }
}

type RuntimeRenameOutcome = "old" | "new" | "ambiguous";

async function inspectAdminRenameOutcome(input: {
  rowId: number;
  previousName: string;
  name: string;
  permissions: string[];
  serverGuids: string[];
  immunity: number;
}): Promise<RuntimeRenameOutcome> {
  return withGameTransaction(async (connection) => {
    const [rows] = await connection.query<AdminGroupRow[]>(
      "SELECT Id, Name, Permissions, Servers, Immunity FROM `groups` WHERE Id = ? LIMIT 1 FOR UPDATE",
      [input.rowId],
    );
    const storedName = rows[0] ? String(rows[0].Name) : null;
    if (storedName === input.name && rows[0]) {
      const stored = toAdminGroup(rows[0]);
      if (
        stored.immunity === input.immunity &&
        JSON.stringify(stored.permissions) === JSON.stringify(input.permissions) &&
        JSON.stringify(stored.serverGuids) === JSON.stringify(input.serverGuids)
      ) return "new";
      return "ambiguous";
    }
    if (storedName === input.previousName) return "old";
    return "ambiguous";
  });
}

async function inspectVipRenameOutcome(input: {
  serverId: number;
  previousName: string;
  name: string;
  weight: number;
  values: Record<string, unknown>;
  enabled: boolean;
}): Promise<RuntimeRenameOutcome> {
  return withGameTransaction(async (connection) => {
    const [rows] = await connection.query<VipGroupRow[]>(
      "SELECT server_id, name, weight, values_json, enabled FROM vip_group_definitions " +
        "WHERE server_id = ? AND (LOWER(TRIM(name)) = LOWER(TRIM(?)) OR LOWER(TRIM(name)) = LOWER(TRIM(?))) " +
        "ORDER BY name FOR UPDATE",
      [input.serverId, input.previousName, input.name],
    );
    if (rows.some((row) => String(row.name) === input.previousName)) return "old";
    const nextRows = rows.filter((row) => String(row.name) === input.name);
    if (nextRows.length !== 1) return "ambiguous";
    const next = toVipGroup(nextRows[0]);
    return next.serverId === input.serverId &&
        next.weight === input.weight &&
        next.enabled === input.enabled &&
        JSON.stringify(next.values) === JSON.stringify(input.values)
      ? "new"
      : "ambiguous";
  });
}

async function recoverFailedRenameOutcome(
  intent: PreparedIdentityGroupRename | null,
  error: unknown,
  inspect: () => Promise<RuntimeRenameOutcome>,
) {
  if (!intent) throw error;
  let outcome: RuntimeRenameOutcome;
  try {
    outcome = await inspect();
  } catch (inspectionError) {
    // A failed/ambiguous COMMIT cannot be classified safely when the
    // authoritative game state is unreadable. Keep the durable intent pending
    // for the next catalogue sync instead of destroying its recovery record.
    console.error("A failed runtime rename could not be classified", inspectionError);
    throw error;
  }
  if (outcome === "new") return;
  if (outcome === "old") await cancelPreparedRename(intent, error);
  // Anything other than authoritative old or authoritative new evidence stays
  // pending. A later sync can complete it only after observing old absent and
  // new present in the runtime definition scope.
  throw error;
}

async function completeRenameAndRefreshPortal(
  input: { actorSteamId: string; requestKey: string },
  intent: PreparedIdentityGroupRename | null,
) {
  let renameCompleted = intent === null;
  if (intent) {
    try {
      renameCompleted = await completeIdentityGroupRename(
        portalPoolForRename(),
        intent.intentId,
      );
    } catch (error) {
      // Do not discard the intent after the game commit. The forced sync below
      // observes old-absent/new-present runtime evidence and retries the same
      // idempotent remap. If that also fails, a future sync will recover it.
      console.error("Runtime group renamed; durable portal remap remains pending", error);
    }
  }
  const refreshed = await refreshPortalCatalogue(input);
  if (intent && refreshed && !renameCompleted) {
    try {
      // The sync may already have recovered the intent from runtime evidence;
      // this is then an idempotent status check. If the first completion merely
      // lost the catalogue lock race, it gets one final serialized attempt.
      renameCompleted = await completeIdentityGroupRename(
        portalPoolForRename(),
        intent.intentId,
      );
    } catch (error) {
      console.error("Runtime group rename remains queued after catalogue refresh", error);
    }
  }
  return refreshed && renameCompleted;
}

async function refreshPortalCatalogue(input: {
  actorSteamId: string;
  requestKey: string;
}) {
  const pool = getPortalDatabasePool();
  if (!pool) return false;
  try {
    await syncIdentityCatalogue(pool, {
      force: true,
      actorSteamId: input.actorSteamId,
      auditKey: `${input.requestKey}:runtime-definition-sync`,
    });
    return true;
  } catch (error) {
    console.error("Runtime group saved, but the portal catalogue refresh failed", error);
    return false;
  }
}

async function renameAdminAssignments(
  connection: PoolConnection,
  previousName: string,
  nextName: string,
) {
  if (sameName(previousName, nextName) && previousName === nextName) return;
  const [rows] = await connection.query<AdminAssignmentRow[]>(
    "SELECT Id, Groups, Permissions, Servers FROM admins ORDER BY Id FOR UPDATE",
  );
  for (const row of rows) {
    const groups = storedStringList(row.Groups);
    if (!groups.some((group) => sameName(group, previousName))) continue;
    const renamed = new Map<string, string>();
    for (const group of groups) {
      const value = sameName(group, previousName) ? nextName : group;
      renamed.set(value.toLocaleLowerCase("en-US"), value);
    }
    await connection.execute("UPDATE admins SET Groups = ? WHERE Id = ?", [
      JSON.stringify([...renamed.values()]),
      Number(row.Id),
    ]);
  }
}

export async function createRuntimeAdminsCoreGroup(input: {
  actorSteamId: string;
  requestKey: string;
  name: string;
  permissions: unknown;
  serverGuids: unknown;
  immunity: unknown;
}) {
  const name = normalizedName(input.name, 100);
  if (isFounderName(name)) {
    fail(
      "founder_invariant",
      "Founder is the protected root group and cannot be created through the portal.",
    );
  }
  const permissions = permissionList(input.permissions);
  const serverGuids = serverList(input.serverGuids);
  const immunity = normalizedInteger(input.immunity, "Immunity");
  await assertRuntimeCreateNameAvailable("admins_core", name);
  await withGameTransaction(async (connection) => {
    const [duplicates] = await connection.query<AdminGroupRow[]>(
      "SELECT Id, Name, Permissions, Servers, Immunity FROM `groups` ORDER BY Name, Id FOR UPDATE",
    );
    if (duplicates.some((row) => sameName(String(row.Name), name))) {
      fail("external_group_exists", "An Admins.Core group already uses that name.");
    }
    await connection.execute(
      "INSERT INTO `groups` (Name, Permissions, Servers, Immunity) VALUES (?, ?, ?, ?)",
      [name, JSON.stringify(permissions), JSON.stringify(serverGuids), immunity],
    );
    await synchronizeAdminsAuthority(connection, {
      actorSteamId: input.actorSteamId,
    });
  });
  const catalogueSynced = await refreshPortalCatalogue(input);
  return { name, catalogueSynced };
}

export async function updateRuntimeAdminsCoreGroup(input: {
  actorSteamId: string;
  requestKey: string;
  rowId: unknown;
  previousName: string;
  name: string;
  permissions: unknown;
  serverGuids: unknown;
  immunity: unknown;
}) {
  const rowId = normalizedInteger(input.rowId, "Admins.Core row ID", 1, Number.MAX_SAFE_INTEGER);
  const previousName = normalizedName(input.previousName, 100, "Existing group name");
  const name = normalizedName(input.name, 100);
  const permissions = permissionList(input.permissions);
  const serverGuids = serverList(input.serverGuids);
  const immunity = normalizedInteger(input.immunity, "Immunity");
  const renameIntent = await prepareRuntimeRename({
    sourceType: "admins_core",
    previousName,
    name,
    actorSteamId: input.actorSteamId,
    requestKey: input.requestKey,
  });
  try {
    await withGameTransaction(async (connection) => {
      const [rows] = await connection.query<AdminGroupRow[]>(
        "SELECT Id, Name, Permissions, Servers, Immunity FROM `groups` ORDER BY Name, Id FOR UPDATE",
      );
      // Staff membership mutations use this same complete, ordered lock set
      // before recomputing immunity. Never lock target then destination: two
      // concurrent renames could otherwise invert those row locks.
      const existing = rows.find((row) => Number(row.Id) === rowId);
      if (!existing || !sameName(String(existing.Name), previousName)) {
        fail("external_group_not_found", "That Admins.Core group changed. Refresh before saving.");
      }
      const existingFounder = isFounderName(existing.Name);
      const nextFounder = isFounderName(name);
      if (existingFounder !== nextFounder) {
        fail(
          "founder_invariant",
          "A group cannot be promoted to Founder or renamed away from Founder.",
        );
      }
      if (
        existingFounder &&
        (name !== String(existing.Name) ||
          !permissions.includes("*") ||
          !appliesToServer(serverGuids))
      ) {
        fail(
          "founder_invariant",
          "Founder cannot be renamed, lose wildcard access, or be removed from this server.",
        );
      }
      const duplicates = rows.filter(
        (row) => Number(row.Id) !== rowId && sameName(String(row.Name), name),
      );
      if (duplicates.length) fail("external_group_exists", "An Admins.Core group already uses that name.");
      await connection.execute(
        "UPDATE `groups` SET Name = ?, Permissions = ?, Servers = ?, Immunity = ? WHERE Id = ?",
        [name, JSON.stringify(permissions), JSON.stringify(serverGuids), immunity, rowId],
      );
      await renameAdminAssignments(connection, String(existing.Name), name);
      await synchronizeAdminsAuthority(connection, {
        actorSteamId: input.actorSteamId,
        previousName: String(existing.Name),
        name,
        rowId,
      });
    });
  } catch (error) {
    await recoverFailedRenameOutcome(renameIntent, error, () =>
      inspectAdminRenameOutcome({
        rowId,
        previousName,
        name,
        permissions,
        serverGuids,
        immunity,
      }));
  }
  const catalogueSynced = await completeRenameAndRefreshPortal(input, renameIntent);
  return { name, catalogueSynced };
}

async function renameVipMembershipRows(
  connection: PoolConnection,
  serverId: number,
  previousName: string,
  nextName: string,
) {
  if (sameName(previousName, nextName) && previousName === nextName) return;
  const sharedScope = serverId === 0;
  // Group rename is rare, so lock the complete delivery scope in one pass.
  // Per-player VIP upserts lock every row for one account in primary-key order
  // (sid, group). The account prefix below produces that same order globally
  // and prevents an upsert from taking destination before this operation takes
  // old-tier (or vice versa).
  const [scopeRows] = await connection.query<VipMembershipRow[]>(
    "SELECT CAST(account_id AS CHAR) AS account_id, name, lastvisit, sid, `group` AS group_name, expires " +
      "FROM vip_users " +
      (sharedScope ? "" : "WHERE sid = ? ") +
      "ORDER BY account_id, sid, `group`, expires DESC FOR UPDATE",
    sharedScope ? [] : [serverId],
  );
  const rows = scopeRows.filter((row) => sameName(row.group_name, previousName));
  for (const row of rows) {
    const rowServerId = Number(row.sid);
    if (!Number.isSafeInteger(rowServerId) || rowServerId < 0) {
      fail("external_group_details", "A stored VIP membership server scope is invalid.");
    }
    const target = scopeRows.find(
      (candidate) =>
        candidate.account_id === row.account_id &&
        Number(candidate.sid) === rowServerId &&
        sameName(candidate.group_name, nextName) &&
        !sameName(candidate.group_name, previousName),
    );
    if (target) {
      const oldExpiry = Number(row.expires ?? 0);
      const targetExpiry = Number(target.expires ?? 0);
      const mergedExpiry = oldExpiry === 0 || targetExpiry === 0
        ? 0
        : Math.max(oldExpiry, targetExpiry);
      await connection.execute(
        "UPDATE vip_users SET name = ?, lastvisit = ?, expires = ? WHERE account_id = ? AND sid = ? AND `group` = ?",
        [
          row.name || target.name,
          Math.max(Number(row.lastvisit ?? 0), Number(target.lastvisit ?? 0)),
          mergedExpiry,
          row.account_id,
          rowServerId,
          target.group_name,
        ],
      );
      target.name = row.name || target.name;
      target.lastvisit = Math.max(
        Number(row.lastvisit ?? 0),
        Number(target.lastvisit ?? 0),
      );
      target.expires = mergedExpiry;
      await connection.execute(
        "DELETE FROM vip_users WHERE account_id = ? AND sid = ? AND `group` = ?",
        [row.account_id, rowServerId, row.group_name],
      );
    } else {
      await connection.execute(
        "UPDATE vip_users SET `group` = ? WHERE account_id = ? AND sid = ? AND `group` = ?",
        [nextName, row.account_id, rowServerId, row.group_name],
      );
      row.group_name = nextName;
    }
  }
}

export async function createRuntimeVipCoreGroup(input: {
  actorSteamId: string;
  requestKey: string;
  name: string;
  weight: unknown;
  values: unknown;
  enabled: unknown;
}) {
  const serverId = vipServerId();
  const name = normalizedName(input.name, 64);
  const weight = normalizedInteger(input.weight, "VIP weight");
  const values = parsedValues(input.values);
  const enabled = booleanValue(input.enabled);
  await assertRuntimeCreateNameAvailable("vipcore", name);
  await withGameTransaction(async (connection) => {
    const [duplicates] = await connection.query<VipGroupRow[]>(
      "SELECT server_id, name, weight, values_json, enabled FROM vip_group_definitions " +
        "ORDER BY server_id, name FOR UPDATE",
    );
    if (duplicates.some(
      (row) => Number(row.server_id) === serverId && sameName(String(row.name), name),
    )) {
      fail("external_group_exists", "A VIPCore group already uses that name in this scope.");
    }
    await connection.execute(
      "INSERT INTO vip_group_definitions (server_id, name, weight, values_json, enabled, created_at, updated_at) VALUES (?, ?, ?, ?, ?, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)",
      [serverId, name, weight, JSON.stringify(values), enabled],
    );
    await synchronizeVipAuthority(connection, {
      actorSteamId: input.actorSteamId,
      serverId,
    });
  });
  const catalogueSynced = await refreshPortalCatalogue(input);
  return { name, catalogueSynced };
}

export async function updateRuntimeVipCoreGroup(input: {
  actorSteamId: string;
  requestKey: string;
  previousName: string;
  name: string;
  weight: unknown;
  values: unknown;
  enabled: unknown;
}) {
  const serverId = vipServerId();
  const previousName = normalizedName(input.previousName, 64, "Existing group name");
  const name = normalizedName(input.name, 64);
  const weight = normalizedInteger(input.weight, "VIP weight");
  const values = parsedValues(input.values);
  const enabled = booleanValue(input.enabled);
  const renameIntent = await prepareRuntimeRename({
    sourceType: "vipcore",
    previousName,
    name,
    actorSteamId: input.actorSteamId,
    requestKey: input.requestKey,
  });
  try {
    await withGameTransaction(async (connection) => {
      const [rows] = await connection.query<VipGroupRow[]>(
        "SELECT server_id, name, weight, values_json, enabled FROM vip_group_definitions " +
          "ORDER BY server_id, name FOR UPDATE",
      );
      // Lock the whole delivery scope in one stable order. This matches the
      // source-aware VIP mutation path and prevents target/destination lock
      // inversion across concurrent renames.
      const scopedRows = rows.filter((row) => Number(row.server_id) === serverId);
      const previousRows = scopedRows.filter((row) => sameName(String(row.name), previousName));
      if (previousRows.length !== 1) {
        fail("external_group_not_found", "That VIPCore group changed. Refresh before saving.");
      }
      const storedName = String(previousRows[0].name);
      const duplicates = scopedRows.filter((row) => sameName(String(row.name), name));
      if (duplicates.some((row) => !sameName(String(row.name), storedName))) {
        fail("external_group_exists", "A VIPCore group already uses that name in this scope.");
      }
      const renaming = storedName !== name;
      if (
        renaming &&
        rows.some(
          (row) =>
            !sameName(String(row.name), storedName) && sameName(String(row.name), name),
        )
      ) {
        fail(
          "external_group_exists",
          "That VIPCore name already identifies another tier in a different scope. Edit that tier instead of merging two live identities.",
        );
      }
      if (renaming) {
        // A VIP name is the stable cross-scope tier identity in Arena. Rename
        // every native definition and assignment carrying that identity in one
        // transaction so a per-server edit cannot split one authority group
        // into two groups with stranded memberships.
        await renameVipMembershipRows(connection, 0, storedName, name);
        await connection.execute(
          "UPDATE vip_group_definitions SET name = ?, updated_at = CURRENT_TIMESTAMP " +
            "WHERE LOWER(TRIM(name)) = LOWER(TRIM(?))",
          [name, storedName],
        );
      }
      await connection.execute(
        "UPDATE vip_group_definitions SET weight = ?, values_json = ?, enabled = ?, updated_at = CURRENT_TIMESTAMP " +
          "WHERE server_id = ? AND name = ?",
        [weight, JSON.stringify(values), enabled, serverId, name],
      );
      await synchronizeVipAuthority(connection, {
        actorSteamId: input.actorSteamId,
        previousName: storedName,
        name,
        serverId,
      });
    });
  } catch (error) {
    await recoverFailedRenameOutcome(renameIntent, error, () =>
      inspectVipRenameOutcome({
        serverId,
        previousName,
        name,
        weight,
        values,
        enabled,
      }));
  }
  const catalogueSynced = await completeRenameAndRefreshPortal(input, renameIntent);
  return { name, catalogueSynced };
}

export async function deleteRuntimeVipCoreGroup(input: {
  actorSteamId: string;
  requestKey: string;
  previousName: string;
}) {
  const serverId = vipServerId();
  const previousName = normalizedName(
    input.previousName,
    64,
    "Existing group name",
  );
  const removedName = await withGameTransaction(async (connection) => {
    const [definitions] = await connection.query<VipGroupRow[]>(
      "SELECT server_id, name, weight, values_json, enabled FROM vip_group_definitions " +
        "ORDER BY server_id, name FOR UPDATE",
    );
    const matches = definitions.filter((row) =>
      Number(row.server_id) === serverId && sameName(String(row.name), previousName));
    if (matches.length !== 1) {
      fail(
        "external_group_not_found",
        "That VIPCore group changed or was already removed. Refresh the page.",
      );
    }
    const storedName = String(matches[0].name);
    const [nativeMemberships] = await connection.query<Array<RowDataPacket & {
      account_id: string;
    }>>(
      "SELECT account_id FROM vip_users WHERE sid = ? " +
        "AND LOWER(TRIM(`group`)) = LOWER(TRIM(?)) " +
        "AND (expires = 0 OR expires > UNIX_TIMESTAMP()) " +
        "ORDER BY account_id LIMIT 1 FOR UPDATE",
      [serverId, storedName],
    );
    const [arenaMemberships] = await connection.query<Array<RowDataPacket & {
      membership_uuid: string;
    }>>(
      "SELECT membership.membership_uuid FROM arena_group_memberships AS membership " +
        "INNER JOIN arena_groups AS identity_group ON identity_group.id = membership.group_id " +
        "INNER JOIN arena_scopes AS scope ON scope.id = membership.scope_id " +
        "WHERE identity_group.group_type = 'vip' " +
        "AND LOWER(TRIM(identity_group.external_key)) = LOWER(TRIM(?)) " +
        "AND scope.vip_server_id = ? " +
        "AND membership.status IN ('active', 'conflict') " +
        "ORDER BY membership.membership_uuid LIMIT 1 FOR UPDATE",
      [storedName, serverId],
    );
    if (nativeMemberships.length || arenaMemberships.length) {
      fail(
        "external_group_in_use",
        "Remove every active membership from this VIPCore group before deleting its definition.",
      );
    }
    const [result] = await connection.execute<ResultSetHeader>(
      "DELETE FROM vip_group_definitions WHERE server_id = ? AND name = ?",
      [serverId, storedName],
    );
    if (result.affectedRows !== 1) {
      fail(
        "external_group_not_found",
        "That VIPCore group changed before it could be removed. Refresh the page.",
      );
    }
    await synchronizeVipAuthority(connection, {
      actorSteamId: input.actorSteamId,
      serverId,
    });
    return storedName;
  });
  const catalogueSynced = await refreshPortalCatalogue(input);
  return { name: removedName, catalogueSynced };
}
