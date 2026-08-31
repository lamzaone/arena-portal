import { createHash } from "node:crypto";
import { readdir, readFile, stat } from "node:fs/promises";
import path from "node:path";

import {
  type Pool,
  type PoolConnection,
  type ResultSetHeader,
  type RowDataPacket,
} from "mysql2/promise";

import { configuredGameServerGuid } from "@/lib/admin/server-scope";
import {
  synchronizeArenaRuntimeGroupAuthority,
  synchronizePortalRuntimeGroupProjection,
} from "@/lib/data/arena-group-definition-authority";
import { getGameDatabasePool } from "@/lib/data/database-pools";

export type ExternalIdentitySource = "admins_core" | "vipcore";

export type IdentityCatalogueStatus = {
  adminsCoreDefinitions: number;
  vipCoreDefinitions: number;
  discoveredPrivileges: number;
  lastSyncedAt: string | null;
};

export type IdentityCatalogueSyncResult = IdentityCatalogueStatus & {
  importedGroups: number;
  importedPrivileges: number;
  warnings: string[];
};

type ExternalGroupInput = {
  sourceType: ExternalIdentitySource;
  sourceKind: "config" | "runtime";
  /** True only when a canonical config/database definition exists. Live
   * membership rows may discover an adapter name without making it a valid
   * runtime definition or marketplace target. */
  definitionAvailable: boolean;
  /** Runtime availability. For VIPCore this mirrors
   * vip_group_definitions.enabled and is authoritative for delivery. */
  enabled: boolean;
  externalKey: string;
  displayName: string;
  rankWeight: number;
  definition: Record<string, unknown>;
  baselinePermissions: string[];
  capabilityKeys: string[];
  sourceReference: string;
};

type PermissionSource = {
  sourceKind:
    | "admins_config"
    | "admins_database"
    | "swiftly_config"
    | "command_override"
    | "source_code"
    | "builtin";
  sourceReference: string;
};

type DiscoveredPermission = {
  key: string;
  sources: PermissionSource[];
};

type LocatedTextFile = {
  filePath: string;
  reference: string;
  text: string;
};

type CountRow = RowDataPacket & {
  admins_core_definitions: number | string | null;
  vipcore_definitions: number | string | null;
  discovered_privileges: number | string | null;
  last_synced_at: Date | string | null;
};

type LockRow = RowDataPacket & { acquired: number | string | null };
type IdRow = RowDataPacket & { id: number | string };
type SteamIdRow = RowDataPacket & { steam_id: string };
type RenameIntentRow = RowDataPacket & {
  id: number | string;
  group_id: number | string;
  source_type: ExternalIdentitySource;
  previous_external_key: string;
  next_external_key: string;
  previous_lookup_key: string;
  next_lookup_key: string;
  status: "pending" | "completed" | "cancelled";
};
type RenameAdapterRow = RowDataPacket & {
  id: number | string;
  source_type: string;
  external_key: string | null;
};
type RenameAliasRow = RowDataPacket & { group_id: number | string };
type CatalogueAliasRow = RowDataPacket & {
  group_id: number | string;
  source_type: ExternalIdentitySource;
  alias_lookup_key: string;
};
type PendingRenameReservationRow = RowDataPacket & {
  group_id: number | string;
  source_type: ExternalIdentitySource;
  previous_lookup_key: string;
  next_lookup_key: string;
};

export type PreparedIdentityGroupRename = {
  intentId: number;
  groupId: number;
  sourceType: ExternalIdentitySource;
  previousExternalKey: string;
  nextExternalKey: string;
  resumed: boolean;
};

const MAX_CONFIG_BYTES = 2 * 1024 * 1024;
const MAX_SOURCE_BYTES = 2 * 1024 * 1024;
const MAX_SOURCE_FILES = 1_200;
const MAX_PLUGIN_CONFIG_FILES = 300;
const MAX_PERMISSIONS = 2_000;

const builtinGamePermissions = [
  "admins.notify",
  "admins.chat",
  "admins.command.admins",
  "admins.command.reloadadmins",
  "admins.command.groups",
  "admins.commands.admin",
  "admins.commands.ban",
  "admins.commands.globalban",
  "admins.commands.unban",
  "admins.commands.gag",
  "admins.commands.globalgag",
  "admins.commands.mute",
  "admins.commands.globalmute",
  "admins.commands.silence",
  "admins.commands.globalsilence",
  "admins.commands.ungag",
  "admins.commands.unmute",
  "admins.commands.unsilence",
  "admins.commands.hp",
  "admins.commands.freeze",
  "admins.commands.unfreeze",
  "admins.commands.bury",
  "admins.commands.unbury",
  "admins.commands.blind",
  "admins.commands.unblind",
  "admins.commands.color",
  "admins.commands.glow",
  "admins.commands.shake",
  "admins.commands.kick",
  "admins.commands.beacon",
  "admins.commands.noclip",
  "admins.commands.setspeed",
  "admins.commands.setgravity",
  "admins.commands.slay",
  "admins.commands.slap",
  "admins.commands.rename",
  "admins.commands.burn",
  "admins.commands.rgb",
  "admins.commands.mixteam",
  "admins.commands.givemoney",
  "admins.commands.setmoney",
  "admins.commands.god",
  "admins.commands.respawn",
  "admins.commands.hrespawn",
  "admins.commands.swap",
  "admins.commands.team",
  "admins.commands.goto",
  "admins.commands.bring",
  "admins.commands.giveitem",
  "admins.commands.melee",
  "admins.commands.disarm",
  "admins.commands.clean",
  "admins.commands.vote",
  "admins.commands.votekick",
  "admins.commands.votemap",
  "admins.commands.restartround",
  "admins.commands.say",
  "admins.commands.csay",
  "admins.commands.rcon",
  "admins.menu.bans",
  "admins.menu.comms",
  "admin.changemap",
  "admin.mapsvote",
  "vipcore.manage",
  "vipcore.adduser",
  "vipcore.deleteuser",
  "tapped.tokens.admin",
  "tapped.inventory.admin",
  "tapped.inventory.grant",
  "tapped.inventory.manage-loadout",
  "k4-levelranks.admin",
  "k4-levelranks.vip",
  "k4.damageinfo.console",
  "k4.damageinfo.center",
  "k4.damageinfo.summary",
  "viptest.reset",
] as const;

let bootstrapPromise: Promise<IdentityCatalogueSyncResult> | null = null;

function unique<T>(values: T[]) {
  return [...new Set(values)];
}

function workspaceAncestors() {
  const values: string[] = [];
  let current = path.resolve(/* turbopackIgnore: true */ process.cwd());
  for (let index = 0; index < 6; index += 1) {
    values.push(current);
    const parent = path.dirname(current);
    if (parent === current) break;
    current = parent;
  }
  return unique(values);
}

function sourceReference(filePath: string) {
  const normalized = path.resolve(filePath).replaceAll("\\", "/");
  const markers = [
    "/addons/swiftlys2/",
    "/Admins-source/",
    "/VIPCore-source/",
    "/TAPPED.Inventory/",
    "/GlobalChatTags/",
  ];
  for (const marker of markers) {
    const index = normalized.toLocaleLowerCase("en-US").indexOf(
      marker.toLocaleLowerCase("en-US"),
    );
    if (index >= 0) return normalized.slice(index + 1, index + 256);
  }
  return normalized.split("/").slice(-4).join("/").slice(0, 255);
}

function configRoots() {
  return unique(
    [
      process.env.ARENA_SWIFTLY_CONFIG_ROOT,
      ...workspaceAncestors().map((root) =>
        path.join(/* turbopackIgnore: true */ root, "addons", "swiftlys2", "configs"),
      ),
    ]
      .map((value) => String(value ?? "").trim())
      .filter(Boolean)
      .map((value) => path.resolve(/* turbopackIgnore: true */ value)),
  );
}

function adminsConfigCandidates() {
  return unique(
    [
      process.env.ADMINS_GROUPS_CONFIG_PATH,
      ...configRoots().map((root) =>
        path.join(/* turbopackIgnore: true */ root, "plugins", "Admins.Core", "groups.json"),
      ),
    ]
      .map((value) => String(value ?? "").trim())
      .filter(Boolean)
      .map((value) => path.resolve(/* turbopackIgnore: true */ value)),
  );
}

function vipConfigCandidates() {
  return unique(
    [
      process.env.VIP_GROUPS_CONFIG_PATH,
      ...configRoots().flatMap((root) => [
        path.join(/* turbopackIgnore: true */ root, "plugins", "VIPCore", "vip_groups.jsonc"),
        path.join(/* turbopackIgnore: true */ root, "plugins", "VIPCore", "vip_groups.json"),
      ]),
    ]
      .map((value) => String(value ?? "").trim())
      .filter(Boolean)
      .map((value) => path.resolve(/* turbopackIgnore: true */ value)),
  );
}

function permissionSourceRoots() {
  const configured = String(process.env.IDENTITY_PERMISSION_SOURCE_PATHS ?? "")
    .split(path.delimiter)
    .map((value) => value.trim())
    .filter(Boolean);
  return unique(
    [
      ...configured,
      ...workspaceAncestors().flatMap((root) => [
        path.join(/* turbopackIgnore: true */ root, "Admins-source"),
        path.join(/* turbopackIgnore: true */ root, "VIPCore-source"),
        path.join(/* turbopackIgnore: true */ root, "TAPPED.Inventory"),
        path.join(/* turbopackIgnore: true */ root, "GlobalChatTags"),
      ]),
    ].map((value) => path.resolve(/* turbopackIgnore: true */ value)),
  );
}

function stripJsonCommentsAndTrailingCommas(source: string) {
  let withoutComments = "";
  let inString = false;
  let escaped = false;
  let lineComment = false;
  let blockComment = false;

  for (let index = 0; index < source.length; index += 1) {
    const character = source[index];
    const next = source[index + 1];
    if (lineComment) {
      if (character === "\n" || character === "\r") {
        lineComment = false;
        withoutComments += character;
      } else {
        withoutComments += " ";
      }
      continue;
    }
    if (blockComment) {
      if (character === "*" && next === "/") {
        blockComment = false;
        withoutComments += "  ";
        index += 1;
      } else {
        withoutComments += character === "\n" || character === "\r" ? character : " ";
      }
      continue;
    }
    if (inString) {
      withoutComments += character;
      if (escaped) escaped = false;
      else if (character === "\\") escaped = true;
      else if (character === '"') inString = false;
      continue;
    }
    if (character === '"') {
      inString = true;
      withoutComments += character;
      continue;
    }
    if (character === "/" && next === "/") {
      lineComment = true;
      withoutComments += "  ";
      index += 1;
      continue;
    }
    if (character === "/" && next === "*") {
      blockComment = true;
      withoutComments += "  ";
      index += 1;
      continue;
    }
    withoutComments += character;
  }

  let result = "";
  inString = false;
  escaped = false;
  for (let index = 0; index < withoutComments.length; index += 1) {
    const character = withoutComments[index];
    if (inString) {
      result += character;
      if (escaped) escaped = false;
      else if (character === "\\") escaped = true;
      else if (character === '"') inString = false;
      continue;
    }
    if (character === '"') {
      inString = true;
      result += character;
      continue;
    }
    if (character === ",") {
      let lookahead = index + 1;
      while (/\s/.test(withoutComments[lookahead] ?? "")) lookahead += 1;
      if (withoutComments[lookahead] === "}" || withoutComments[lookahead] === "]") {
        continue;
      }
    }
    result += character;
  }
  return result;
}

function parseJsonc(text: string) {
  const value: unknown = JSON.parse(stripJsonCommentsAndTrailingCommas(text));
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new Error("The configuration root must be an object.");
  }
  return value as Record<string, unknown>;
}

function asObject(value: unknown): Record<string, unknown> | null {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null;
}

function boundedInteger(value: unknown, minimum = 0, maximum = 1_000_000) {
  const parsed = Number(value);
  if (!Number.isSafeInteger(parsed)) return 0;
  return Math.max(minimum, Math.min(maximum, parsed));
}

function cleanGroupName(value: unknown) {
  const name = String(value ?? "").normalize("NFKC").trim();
  return name && name.length <= 100 && !/[\r\n\0]/.test(name) ? name : null;
}

function cleanCapabilityKey(value: unknown) {
  const key = String(value ?? "").normalize("NFKC").trim();
  return key && key.length <= 128 && !/[\r\n\0]/.test(key) ? key : null;
}

function cleanPermissionKey(value: unknown) {
  const key = String(value ?? "").trim().toLocaleLowerCase("en-US");
  if (
    key === "*" ||
    key === "founder" ||
    key === "portal.founder" ||
    !/^[a-z0-9][a-z0-9.*:_-]{0,95}$/.test(key) ||
    (key.includes("*") &&
      (!key.endsWith(".*") || key.indexOf("*") !== key.length - 1)) ||
    !/[.:]/.test(key)
  ) {
    return null;
  }
  return key;
}

async function locateTextFile(candidates: string[]): Promise<LocatedTextFile | null> {
  for (const filePath of candidates) {
    try {
      const details = await stat(/* turbopackIgnore: true */ filePath);
      if (!details.isFile() || details.size > MAX_CONFIG_BYTES) continue;
      return {
        filePath,
        reference: sourceReference(filePath),
        text: await readFile(/* turbopackIgnore: true */ filePath, "utf8"),
      };
    } catch {
      // Optional deployment input: continue through the exact candidate list.
    }
  }
  return null;
}

function parseAdminsGroups(file: LocatedTextFile) {
  const root = parseJsonc(file.text);
  if (!Array.isArray(root.groups)) return [];
  const groups: ExternalGroupInput[] = [];
  for (const raw of root.groups.slice(0, 256)) {
    const group = asObject(raw);
    const name = cleanGroupName(group?.name);
    if (!group || !name) continue;
    const permissions = unique(
      (Array.isArray(group.permissions) ? group.permissions : [])
        .map((value) => String(value ?? "").trim().toLocaleLowerCase("en-US"))
        .filter(
          (value) =>
            value === "*" || /^[a-z0-9][a-z0-9.*:_-]{0,95}$/.test(value),
        ),
    ).slice(0, 1_000);
    const immunity = boundedInteger(group.immunity);
    groups.push({
      sourceType: "admins_core",
      sourceKind: "config",
      definitionAvailable: true,
      enabled: true,
      externalKey: name,
      displayName: name,
      rankWeight: immunity,
      definition: { name, immunity, permissions },
      baselinePermissions: permissions,
      capabilityKeys: [],
      sourceReference: file.reference,
    });
  }
  return groups;
}

function parseVipGroups(file: LocatedTextFile) {
  const root = parseJsonc(file.text);
  const vipRoot = asObject(root.vip_groups) ?? root;
  const groupsObject = asObject(vipRoot.Groups) ?? asObject(root.Groups);
  if (!groupsObject) return [];
  const groups: ExternalGroupInput[] = [];
  for (const [rawName, rawDefinition] of Object.entries(groupsObject).slice(0, 256)) {
    const name = cleanGroupName(rawName);
    const definition = asObject(rawDefinition);
    if (!name || !definition) continue;
    const weight = boundedInteger(definition.Weight ?? definition.weight);
    const values =
      asObject(definition.Values) ?? asObject(definition.values) ?? {};
    const capabilityKeys = unique(
      Object.keys(values)
        .map(cleanCapabilityKey)
        .filter((value): value is string => Boolean(value)),
    ).slice(0, 1_000);
    groups.push({
      sourceType: "vipcore",
      sourceKind: "config",
      definitionAvailable: true,
      enabled: true,
      externalKey: name,
      displayName: name,
      rankWeight: weight,
      definition: { name, weight, values },
      baselinePermissions: [],
      capabilityKeys,
      sourceReference: file.reference,
    });
  }
  return groups;
}

type AdminDatabaseGroupRow = RowDataPacket & {
  name: string;
  permissions: unknown;
  servers: unknown;
  immunity: number | string;
};

type AdminDatabaseAssignmentRow = RowDataPacket & {
  groups: unknown;
  servers: unknown;
};

type VipDatabaseGroupRow = RowDataPacket & {
  name: string;
  weight: number | string;
  values_json: unknown;
  enabled: number | boolean;
};

type VipDatabaseAssignmentRow = RowDataPacket & { group_name: string };

function storedStringList(value: unknown) {
  let entries: unknown[] = [];
  if (Array.isArray(value)) {
    entries = value;
  } else if (typeof value === "string" && value.trim()) {
    try {
      const parsed: unknown = JSON.parse(value);
      entries = Array.isArray(parsed) ? parsed : value.split(",");
    } catch {
      entries = value.split(",");
    }
  }
  const result = new Map<string, string>();
  for (const entry of entries) {
    const text = String(entry ?? "").normalize("NFKC").trim();
    if (!text || text.length > 100 || /[\r\n\0]/.test(text)) continue;
    const key = text.toLocaleLowerCase("en-US");
    if (!result.has(key)) result.set(key, text);
  }
  return [...result.values()];
}

function databasePermissionList(value: unknown) {
  return storedStringList(value)
    .map((permission) => permission.toLocaleLowerCase("en-US"))
    .filter(
      (permission) =>
        permission === "*" ||
        /^[a-z0-9][a-z0-9.*:_-]{0,95}$/.test(permission),
    )
    .slice(0, 1_000);
}

function appliesToConfiguredServer(value: unknown) {
  const expected = configuredGameServerGuid().toLocaleLowerCase("en-US");
  return storedStringList(value).some(
    (server) => server.toLocaleLowerCase("en-US") === expected,
  );
}

function configuredVipServerId() {
  const configured = Number.parseInt(process.env.GAME_VIP_SERVER_ID ?? "1", 10);
  return Number.isSafeInteger(configured) && configured >= 0 ? configured : 1;
}

function runtimeGroupKey(group: Pick<ExternalGroupInput, "sourceType" | "externalKey">) {
  return `${group.sourceType}\0${group.externalKey.toLocaleLowerCase("en-US")}`;
}

export class IdentityGroupRenameError extends Error {
  constructor(public readonly code: string, message: string) {
    super(message);
    this.name = "IdentityGroupRenameError";
  }
}

function renameError(code: string, message: string): never {
  throw new IdentityGroupRenameError(code, message);
}

function vipRenameIdentity(value: unknown) {
  return String(value ?? "").replace(/[a-z]/g, (character) =>
    String.fromCharCode(character.charCodeAt(0) - 32));
}

export function identityGroupAliasLookupKey(
  sourceType: ExternalIdentitySource,
  externalKey: string,
) {
  const identity = sourceType === "vipcore"
    ? vipRenameIdentity(externalKey)
    : externalKey.normalize("NFKC").trim().toLocaleLowerCase("en-US");
  return createHash("sha256")
    .update(sourceType)
    .update("\0")
    .update(identity)
    .digest("hex");
}

function renameRequestKey(sourceType: ExternalIdentitySource, requestKey: string) {
  return createHash("sha256")
    .update(sourceType)
    .update("\0")
    .update(requestKey)
    .digest("hex");
}

function isFounderExternalKey(sourceType: ExternalIdentitySource, value: unknown) {
  return sourceType === "admins_core" &&
    String(value ?? "").normalize("NFKC").trim().toLocaleLowerCase("en-US") === "founder";
}

async function lockExternalRenameAdapters(connection: PoolConnection) {
  const [rows] = await connection.query<RenameAdapterRow[]>(
    "SELECT id, source_type, external_key FROM portal_identity_groups " +
      "WHERE source_type IN ('admins_core', 'vipcore') ORDER BY id FOR UPDATE",
  );
  return rows;
}

function preparedRename(
  row: RenameIntentRow,
  resumed: boolean,
): PreparedIdentityGroupRename {
  return {
    intentId: Number(row.id),
    groupId: Number(row.group_id),
    sourceType: row.source_type,
    previousExternalKey: row.previous_external_key,
    nextExternalKey: row.next_external_key,
    resumed,
  };
}

export async function prepareIdentityGroupRename(
  pool: Pool,
  input: {
    sourceType: ExternalIdentitySource;
    previousExternalKey: string;
    nextExternalKey: string;
    actorSteamId: string;
    requestKey: string;
  },
) {
  if (input.previousExternalKey === input.nextExternalKey) return null;
  if (
    isFounderExternalKey(input.sourceType, input.previousExternalKey) ||
    isFounderExternalKey(input.sourceType, input.nextExternalKey)
  ) {
    renameError("founder_invariant", "Founder cannot be renamed or used as a rename target.");
  }
  if (!/^7656119\d{10}$/.test(input.actorSteamId)) {
    renameError("external_group_details", "The rename actor SteamID64 is invalid.");
  }

  const previousLookupKey = identityGroupAliasLookupKey(
    input.sourceType,
    input.previousExternalKey,
  );
  const nextLookupKey = identityGroupAliasLookupKey(
    input.sourceType,
    input.nextExternalKey,
  );
  const durableRequestKey = renameRequestKey(input.sourceType, input.requestKey);
  const connection = await pool.getConnection();
  try {
    await connection.beginTransaction();
    const adapters = await lockExternalRenameAdapters(connection);
    const previous = adapters.filter((row) =>
      row.source_type === input.sourceType &&
      row.external_key !== null &&
      identityGroupAliasLookupKey(input.sourceType, row.external_key) === previousLookupKey);
    if (previous.length !== 1) {
      renameError(
        "external_group_not_found",
        "The portal adapter for that runtime group is unavailable or ambiguous. Synchronize the catalogue and retry.",
      );
    }
    const groupId = Number(previous[0].id);
    const collision = adapters.some((row) =>
      Number(row.id) !== groupId &&
      row.source_type === input.sourceType &&
      row.external_key !== null &&
      identityGroupAliasLookupKey(input.sourceType, row.external_key) === nextLookupKey);
    if (collision) {
      renameError("external_group_exists", "A portal adapter already uses the new group name.");
    }
    const [aliasRows] = await connection.query<RenameAliasRow[]>(
      "SELECT group_id FROM portal_identity_group_external_aliases " +
        "WHERE source_type = ? AND alias_lookup_key = ? LIMIT 1 FOR UPDATE",
      [input.sourceType, nextLookupKey],
    );
    if (aliasRows[0] && Number(aliasRows[0].group_id) !== groupId) {
      renameError(
        "external_group_exists",
        "The new group name is reserved by another group's rename history.",
      );
    }
    const [requestRows] = await connection.query<RenameIntentRow[]>(
      "SELECT id, group_id, source_type, previous_external_key, next_external_key, " +
        "previous_lookup_key, next_lookup_key, status " +
        "FROM portal_identity_group_rename_intents WHERE source_type = ? AND request_key = ? " +
        "LIMIT 1 FOR UPDATE",
      [input.sourceType, durableRequestKey],
    );
    const existingRequest = requestRows[0];
    if (existingRequest) {
      if (
        Number(existingRequest.group_id) === groupId &&
        existingRequest.previous_lookup_key === previousLookupKey &&
        existingRequest.next_lookup_key === nextLookupKey &&
        existingRequest.status === "pending"
      ) {
        const [otherPendingRows] = await connection.query<RenameIntentRow[]>(
          "SELECT id, group_id, source_type, previous_external_key, next_external_key, " +
            "previous_lookup_key, next_lookup_key, status " +
            "FROM portal_identity_group_rename_intents " +
            "WHERE status = 'pending' ORDER BY id FOR UPDATE",
        );
        const resumedKeys = new Set([previousLookupKey, nextLookupKey]);
        if (otherPendingRows.some((row) =>
          Number(row.id) !== Number(existingRequest.id) &&
          row.source_type === input.sourceType &&
          (resumedKeys.has(row.previous_lookup_key) ||
            resumedKeys.has(row.next_lookup_key)))) {
          renameError(
            "external_group_exists",
            "Another unfinished rename reserves this group's source or target name.",
          );
        }
        await connection.commit();
        return preparedRename(existingRequest, true);
      }
      renameError("external_group_stale", "That rename request has already been resolved.");
    }
    const [pendingRows] = await connection.query<RenameIntentRow[]>(
      "SELECT id, group_id, source_type, previous_external_key, next_external_key, " +
        "previous_lookup_key, next_lookup_key, status " +
        "FROM portal_identity_group_rename_intents WHERE status = 'pending' " +
        "ORDER BY id FOR UPDATE",
    );
    if (pendingRows.some((row) => Number(row.group_id) === groupId)) {
      renameError(
        "external_group_stale",
        "This group already has an unfinished rename. Synchronize the catalogue and retry.",
      );
    }
    const requestedKeys = new Set([previousLookupKey, nextLookupKey]);
    if (pendingRows.some((row) =>
      row.source_type === input.sourceType &&
      Number(row.group_id) !== groupId &&
      (requestedKeys.has(row.previous_lookup_key) ||
        requestedKeys.has(row.next_lookup_key)))) {
      renameError(
        "external_group_exists",
        "That group name is reserved by another unfinished rename.",
      );
    }
    const [insert] = await connection.execute<ResultSetHeader>(
      "INSERT INTO portal_identity_group_rename_intents " +
        "(group_id, source_type, previous_external_key, next_external_key, previous_lookup_key, next_lookup_key, request_key, requested_by_steam_id) " +
        "VALUES (?, ?, ?, ?, ?, ?, ?, ?)",
      [
        groupId,
        input.sourceType,
        input.previousExternalKey,
        input.nextExternalKey,
        previousLookupKey,
        nextLookupKey,
        durableRequestKey,
        input.actorSteamId,
      ],
    );
    await connection.commit();
    return {
      intentId: Number(insert.insertId),
      groupId,
      sourceType: input.sourceType,
      previousExternalKey: input.previousExternalKey,
      nextExternalKey: input.nextExternalKey,
      resumed: false,
    } satisfies PreparedIdentityGroupRename;
  } catch (error) {
    await connection.rollback();
    throw error;
  } finally {
    connection.release();
  }
}

export async function assertIdentityGroupExternalKeyAvailable(
  pool: Pool,
  input: {
    sourceType: ExternalIdentitySource;
    externalKey: string;
  },
) {
  const lookupKey = identityGroupAliasLookupKey(input.sourceType, input.externalKey);
  const connection = await pool.getConnection();
  try {
    await connection.beginTransaction();
    const adapters = await lockExternalRenameAdapters(connection);
    if (adapters.some((row) =>
      row.source_type === input.sourceType &&
      row.external_key !== null &&
      identityGroupAliasLookupKey(input.sourceType, row.external_key) === lookupKey)) {
      renameError("external_group_exists", "A portal adapter already uses that group name.");
    }
    const [aliases] = await connection.query<RenameAliasRow[]>(
      "SELECT group_id FROM portal_identity_group_external_aliases " +
        "WHERE source_type = ? AND alias_lookup_key = ? LIMIT 1 FOR UPDATE",
      [input.sourceType, lookupKey],
    );
    if (aliases.length) {
      renameError(
        "external_group_exists",
        "That group name is reserved by historical rename aliases so owned items remain unambiguous.",
      );
    }
    const [pendingRows] = await connection.query<PendingRenameReservationRow[]>(
      "SELECT group_id, source_type, previous_lookup_key, next_lookup_key " +
        "FROM portal_identity_group_rename_intents " +
        "WHERE status = 'pending' ORDER BY id FOR UPDATE",
    );
    if (pendingRows.some((row) =>
      row.source_type === input.sourceType &&
      (row.previous_lookup_key === lookupKey || row.next_lookup_key === lookupKey))) {
      renameError(
        "external_group_exists",
        "That group name is reserved by an unfinished rename.",
      );
    }
    await connection.commit();
  } catch (error) {
    await connection.rollback();
    throw error;
  } finally {
    connection.release();
  }
}

async function applyIdentityGroupRenameIntent(
  connection: PoolConnection,
  intent: RenameIntentRow,
) {
  if (intent.status === "completed") return true;
  if (intent.status !== "pending") return false;
  if (
    isFounderExternalKey(intent.source_type, intent.previous_external_key) ||
    isFounderExternalKey(intent.source_type, intent.next_external_key)
  ) {
    renameError("founder_invariant", "Founder rename intents cannot be applied.");
  }
  const [groupRows] = await connection.query<RenameAdapterRow[]>(
    "SELECT id, source_type, external_key FROM portal_identity_groups WHERE id = ? LIMIT 1",
    [Number(intent.group_id)],
  );
  const group = groupRows[0];
  if (!group || group.source_type !== intent.source_type || group.external_key === null) {
    renameError("external_group_stale", "The stable portal group for this rename no longer exists.");
  }
  const currentLookupKey = identityGroupAliasLookupKey(intent.source_type, group.external_key);
  if (
    currentLookupKey !== intent.previous_lookup_key &&
    currentLookupKey !== intent.next_lookup_key
  ) {
    renameError("external_group_stale", "The portal group changed after this rename was prepared.");
  }
  const [collisionRows] = await connection.query<RenameAdapterRow[]>(
    "SELECT id, source_type, external_key FROM portal_identity_groups " +
      "WHERE source_type = ? AND id <> ? ORDER BY id",
    [intent.source_type, Number(intent.group_id)],
  );
  if (collisionRows.some((row) =>
    row.external_key !== null &&
    identityGroupAliasLookupKey(intent.source_type, row.external_key) === intent.next_lookup_key)) {
    renameError("external_group_exists", "Another portal group now uses the rename target.");
  }
  const [aliasRows] = await connection.query<RenameAliasRow[]>(
    "SELECT group_id FROM portal_identity_group_external_aliases " +
      "WHERE source_type = ? AND alias_lookup_key = ? LIMIT 1 FOR UPDATE",
    [intent.source_type, intent.previous_lookup_key],
  );
  if (aliasRows[0] && Number(aliasRows[0].group_id) !== Number(intent.group_id)) {
    renameError("external_group_exists", "Another portal group owns the historical alias.");
  }
  const [nextAliasRows] = await connection.query<RenameAliasRow[]>(
    "SELECT group_id FROM portal_identity_group_external_aliases " +
      "WHERE source_type = ? AND alias_lookup_key = ? LIMIT 1 FOR UPDATE",
    [intent.source_type, intent.next_lookup_key],
  );
  if (
    nextAliasRows[0] &&
    Number(nextAliasRows[0].group_id) !== Number(intent.group_id)
  ) {
    renameError(
      "external_group_exists",
      "Another portal group owns the rename target as a historical alias.",
    );
  }
  const [pendingReservations] = await connection.query<
    PendingRenameReservationRow[]
  >(
    "SELECT group_id, source_type, previous_lookup_key, next_lookup_key " +
      "FROM portal_identity_group_rename_intents " +
      "WHERE status = 'pending' ORDER BY id FOR UPDATE",
  );
  const intentKeys = new Set([
    intent.previous_lookup_key,
    intent.next_lookup_key,
  ]);
  if (pendingReservations.some((row) =>
    row.source_type === intent.source_type &&
    Number(row.group_id) !== Number(intent.group_id) &&
    (intentKeys.has(row.previous_lookup_key) ||
      intentKeys.has(row.next_lookup_key)))) {
    renameError(
      "external_group_exists",
      "Another unfinished rename reserves this group's source or target name.",
    );
  }
  await connection.execute(
    "UPDATE portal_identity_external_group_definitions SET external_key = ? " +
      "WHERE group_id = ? AND source_type = ?",
    [intent.next_external_key, Number(intent.group_id), intent.source_type],
  );
  await connection.execute(
    "UPDATE portal_identity_groups SET external_key = ? WHERE id = ? AND source_type = ?",
    [intent.next_external_key, Number(intent.group_id), intent.source_type],
  );
  await connection.execute(
    "INSERT INTO portal_identity_group_external_aliases " +
      "(group_id, source_type, alias_external_key, alias_lookup_key, rename_intent_id) " +
      "VALUES (?, ?, ?, ?, ?) ON DUPLICATE KEY UPDATE group_id = VALUES(group_id)",
    [
      Number(intent.group_id),
      intent.source_type,
      intent.previous_external_key,
      intent.previous_lookup_key,
      Number(intent.id),
    ],
  );
  await connection.execute(
    "UPDATE portal_identity_group_rename_intents SET status = 'completed', " +
      "completed_at = CURRENT_TIMESTAMP, cancelled_at = NULL, failure_reason = NULL " +
      "WHERE id = ? AND status = 'pending'",
    [Number(intent.id)],
  );
  return true;
}

export async function completeIdentityGroupRename(
  pool: Pool,
  intentId: number,
) {
  const connection = await pool.getConnection();
  let catalogueLockAcquired = false;
  try {
    // Completion participates in the same serialization domain as catalogue
    // discovery. Otherwise a sync that captured the old runtime name could
    // apply after this remap and resurrect the old portal key.
    const [lockRows] = await connection.query<LockRow[]>(
      "SELECT GET_LOCK('portal.identity.catalogue.sync', 10) AS acquired",
    );
    catalogueLockAcquired = Number(lockRows[0]?.acquired ?? 0) === 1;
    if (!catalogueLockAcquired) {
      renameError(
        "catalogue_sync_busy",
        "The identity catalogue is busy; the durable rename remains pending.",
      );
    }
    await connection.beginTransaction();
    await lockExternalRenameAdapters(connection);
    const [rows] = await connection.query<RenameIntentRow[]>(
      "SELECT id, group_id, source_type, previous_external_key, next_external_key, " +
        "previous_lookup_key, next_lookup_key, status " +
        "FROM portal_identity_group_rename_intents WHERE id = ? LIMIT 1 FOR UPDATE",
      [intentId],
    );
    if (!rows[0]) renameError("external_group_stale", "The prepared rename no longer exists.");
    const completed = await applyIdentityGroupRenameIntent(connection, rows[0]);
    await connection.commit();
    return completed;
  } catch (error) {
    try {
      await connection.rollback();
    } catch {
      // The transaction may not have started yet.
    }
    throw error;
  } finally {
    if (catalogueLockAcquired) {
      try {
        await connection.query("SELECT RELEASE_LOCK('portal.identity.catalogue.sync')");
      } catch {
        // Releasing the connection also releases its named locks.
      }
    }
    connection.release();
  }
}

export async function cancelIdentityGroupRename(
  pool: Pool,
  intentId: number,
  reason: string,
) {
  const connection = await pool.getConnection();
  try {
    await connection.beginTransaction();
    await lockExternalRenameAdapters(connection);
    await connection.execute(
      "UPDATE portal_identity_group_rename_intents SET status = 'cancelled', " +
        "cancelled_at = CURRENT_TIMESTAMP, completed_at = NULL, failure_reason = ? " +
        "WHERE id = ? AND status = 'pending'",
      [reason.slice(0, 255), intentId],
    );
    await connection.commit();
  } catch (error) {
    await connection.rollback();
    throw error;
  } finally {
    connection.release();
  }
}

async function recoverPendingIdentityGroupRenames(
  connection: PoolConnection,
  groups: ExternalGroupInput[],
  authoritativeSources: ReadonlySet<ExternalIdentitySource>,
) {
  let rows: RenameIntentRow[];
  try {
    [rows] = await connection.query<RenameIntentRow[]>(
      "SELECT id, group_id, source_type, previous_external_key, next_external_key, " +
        "previous_lookup_key, next_lookup_key, status " +
        "FROM portal_identity_group_rename_intents " +
        "WHERE status = 'pending' ORDER BY id FOR UPDATE",
    );
  } catch (error) {
    const candidate = error as { code?: unknown; errno?: unknown };
    // Preserve rolling-deploy catalogue sync. Rename entry points themselves
    // fail closed until migration 024 is installed.
    if (candidate.code === "ER_NO_SUCH_TABLE" || candidate.errno === 1146) return 0;
    throw error;
  }

  const runtimeLookupKeys = new Map<ExternalIdentitySource, Set<string>>([
    ["admins_core", new Set<string>()],
    ["vipcore", new Set<string>()],
  ]);
  const runtimeDefinitionKeys = new Map<ExternalIdentitySource, Set<string>>([
    ["admins_core", new Set<string>()],
    ["vipcore", new Set<string>()],
  ]);
  for (const group of groups) {
    if (group.sourceKind !== "runtime") continue;
    const lookupKey = identityGroupAliasLookupKey(group.sourceType, group.externalKey);
    runtimeLookupKeys.get(group.sourceType)!.add(lookupKey);
    if (group.definitionAvailable) {
      runtimeDefinitionKeys.get(group.sourceType)!.add(lookupKey);
    }
  }

  let recovered = 0;
  for (const row of rows) {
    if (!authoritativeSources.has(row.source_type)) continue;
    const allKeys = runtimeLookupKeys.get(row.source_type)!;
    const definitionKeys = runtimeDefinitionKeys.get(row.source_type)!;
    // Absence is trustworthy only for a readable authoritative source. The
    // destination must be a canonical definition, not merely a stale live
    // assignment that happened to use the requested name.
    if (
      !allKeys.has(row.previous_lookup_key) &&
      definitionKeys.has(row.next_lookup_key) &&
      await applyIdentityGroupRenameIntent(connection, row)
    ) {
      recovered += 1;
    }
  }
  return recovered;
}

async function excludeAmbiguousHistoricalAliasGroups(
  connection: PoolConnection,
  groups: ExternalGroupInput[],
) {
  let aliases: CatalogueAliasRow[];
  try {
    [aliases] = await connection.query<CatalogueAliasRow[]>(
      "SELECT group_id, source_type, alias_lookup_key " +
        "FROM portal_identity_group_external_aliases " +
        "ORDER BY source_type, alias_lookup_key FOR UPDATE",
    );
  } catch (error) {
    const candidate = error as { code?: unknown; errno?: unknown };
    if (candidate.code === "ER_NO_SUCH_TABLE" || candidate.errno === 1146) {
      return { groups, rejected: [] as ExternalGroupInput[] };
    }
    throw error;
  }
  const [pendingReservations] = await connection.query<PendingRenameReservationRow[]>(
    "SELECT group_id, source_type, previous_lookup_key, next_lookup_key " +
      "FROM portal_identity_group_rename_intents " +
      "WHERE status = 'pending' ORDER BY id FOR UPDATE",
  );
  if (!aliases.length && !pendingReservations.length) {
    return { groups, rejected: [] as ExternalGroupInput[] };
  }

  const [adapters] = await connection.query<RenameAdapterRow[]>(
    "SELECT id, source_type, external_key FROM portal_identity_groups " +
      "WHERE source_type IN ('admins_core', 'vipcore') ORDER BY id",
  );
  const adapterOwners = new Map<string, Set<number>>();
  for (const adapter of adapters) {
    if (
      adapter.external_key === null ||
      (adapter.source_type !== "admins_core" && adapter.source_type !== "vipcore")
    ) continue;
    const lookupKey = identityGroupAliasLookupKey(
      adapter.source_type,
      adapter.external_key,
    );
    const key = `${adapter.source_type}\0${lookupKey}`;
    const owners = adapterOwners.get(key) ?? new Set<number>();
    owners.add(Number(adapter.id));
    adapterOwners.set(key, owners);
  }
  const reservedOwners = new Map<string, Set<number>>();
  for (const row of aliases) {
    const key = `${row.source_type}\0${row.alias_lookup_key}`;
    const owners = reservedOwners.get(key) ?? new Set<number>();
    owners.add(Number(row.group_id));
    reservedOwners.set(key, owners);
  }
  for (const row of pendingReservations) {
    for (const lookupKey of new Set([
      row.previous_lookup_key,
      row.next_lookup_key,
    ])) {
      const key = `${row.source_type}\0${lookupKey}`;
      const owners = reservedOwners.get(key) ?? new Set<number>();
      owners.add(Number(row.group_id));
      reservedOwners.set(key, owners);
    }
  }
  const rejected: ExternalGroupInput[] = [];
  const accepted = groups.filter((group) => {
    const lookupKey = identityGroupAliasLookupKey(group.sourceType, group.externalKey);
    const key = `${group.sourceType}\0${lookupKey}`;
    const owners = reservedOwners.get(key);
    if (!owners) return true;
    // Reverting a group to one of its own historical names through the saga is
    // valid because completion has already moved that same stable adapter.
    // Any absent/different direct owner means an out-of-band definition is
    // trying to reuse a historical key and must not become deliverable.
    if (owners.size === 1 && adapterOwners.get(key)?.has([...owners][0])) return true;
    rejected.push(group);
    return false;
  });
  return { groups: accepted, rejected };
}

/**
 * Admins.Core and VIPCore both bootstrap their definition tables from JSON,
 * then treat those database tables as authoritative. The portal follows the
 * same rule and also discovers names which exist only in live assignments so
 * an out-of-date JSON file can never hide a connected group.
 */
async function loadRuntimeDatabaseGroups() {
  const connectionUrl = process.env.GAME_DATABASE_URL?.trim();
  const warnings: string[] = [];
  if (!connectionUrl) {
    return {
      groups: [] as ExternalGroupInput[],
      authoritativeSources: new Set<ExternalIdentitySource>(),
      unavailableDefinitionSources: new Set<ExternalIdentitySource>(),
      warnings,
    };
  }

  const pool = getGameDatabasePool();
  if (!pool) {
    return {
      groups: [] as ExternalGroupInput[],
      authoritativeSources: new Set<ExternalIdentitySource>(),
      unavailableDefinitionSources: new Set<ExternalIdentitySource>([
        "admins_core",
        "vipcore",
      ]),
      warnings,
    };
  }
  const connection = await pool.getConnection();
  const byKey = new Map<string, ExternalGroupInput>();
  const authoritativeSources = new Set<ExternalIdentitySource>();
  const unavailableDefinitionSources = new Set<ExternalIdentitySource>();
  const add = (group: ExternalGroupInput) => {
    const key = runtimeGroupKey(group);
    const existing = byKey.get(key);
    // Complete definition-table records take precedence over membership-only
    // discovery rows, regardless of query order.
    if (
      !existing ||
      (group.definitionAvailable && !existing.definitionAvailable) ||
      (group.definitionAvailable === existing.definitionAvailable &&
        Object.keys(group.definition).length > Object.keys(existing.definition).length)
    ) {
      byKey.set(key, group);
    }
  };

  let transactionStarted = false;
  try {
    // Definition and membership discovery must describe one game-database
    // point in time. A rename commits both atomically; separate autocommit
    // reads could otherwise observe the new definition with old assignments
    // and manufacture a second portal adapter before intent recovery.
    await connection.query("SET TRANSACTION ISOLATION LEVEL REPEATABLE READ");
    await connection.beginTransaction();
    transactionStarted = true;
    try {
      const [rows] = await connection.query<AdminDatabaseGroupRow[]>(
        "SELECT Name AS name, Permissions AS permissions, Servers AS servers, Immunity AS immunity FROM `groups` ORDER BY Immunity DESC, Name ASC",
      );
      // A readable definition table is authoritative for this server even if
      // the current scope is intentionally empty.
      authoritativeSources.add("admins_core");
      const applicable = rows.filter((row) => appliesToConfiguredServer(row.servers));
      for (const row of applicable) {
        const name = cleanGroupName(row.name);
        if (!name) continue;
        const permissions = databasePermissionList(row.permissions);
        const immunity = boundedInteger(row.immunity);
        add({
          sourceType: "admins_core",
          sourceKind: "runtime",
          definitionAvailable: true,
          enabled: true,
          externalKey: name,
          displayName: name,
          rankWeight: immunity,
          definition: { name, immunity, permissions },
          baselinePermissions: permissions,
          capabilityKeys: [],
          sourceReference: "Admins.Core database · groups",
        });
      }
    } catch {
      unavailableDefinitionSources.add("admins_core");
      warnings.push("Admins.Core database definitions are unavailable; the last database-backed catalogue is retained.");
    }

    try {
      const [rows] = await connection.query<AdminDatabaseAssignmentRow[]>(
        "SELECT Groups AS `groups`, Servers AS servers FROM admins ORDER BY Id",
      );
      const assignedNames = unique(
        rows
          .filter((row) => appliesToConfiguredServer(row.servers))
          .flatMap((row) => storedStringList(row.groups)),
      );
      for (const name of assignedNames) {
        add({
          sourceType: "admins_core",
          sourceKind: "runtime",
          definitionAvailable: false,
          enabled: false,
          externalKey: name,
          displayName: name,
          rankWeight: 0,
          definition: { name, discoveredFrom: "admins.Groups" },
          baselinePermissions: [],
          capabilityKeys: [],
          sourceReference: "Admins.Core database · live assignments",
        });
      }
    } catch {
      warnings.push("Admins.Core live group assignments could not be discovered.");
    }

    const vipServerId = configuredVipServerId();
    try {
      const [rows] = await connection.query<VipDatabaseGroupRow[]>(
        "SELECT name, weight, values_json, enabled FROM vip_group_definitions WHERE server_id = ? ORDER BY weight DESC, name ASC",
        [vipServerId],
      );
      // The scope remains authoritative after every definition is removed.
      authoritativeSources.add("vipcore");
      for (const row of rows) {
        const name = cleanGroupName(row.name);
        if (!name) continue;
        let values: Record<string, unknown> = {};
        try {
          const parsed = typeof row.values_json === "string"
            ? JSON.parse(row.values_json) as unknown
            : row.values_json;
          values = asObject(parsed) ?? {};
        } catch {
          warnings.push(`VIPCore database definition ${name} has invalid Values JSON.`);
        }
        const weight = boundedInteger(row.weight);
        const enabled = row.enabled === true || Number(row.enabled) === 1;
        const capabilityKeys = unique(
          Object.keys(values)
            .map(cleanCapabilityKey)
            .filter((value): value is string => Boolean(value)),
        ).slice(0, 1_000);
        add({
          sourceType: "vipcore",
          sourceKind: "runtime",
          definitionAvailable: true,
          enabled,
          externalKey: name,
          displayName: name,
          rankWeight: weight,
          definition: {
            name,
            weight,
            enabled,
            values,
          },
          baselinePermissions: [],
          capabilityKeys,
          sourceReference: `VIPCore database · vip_group_definitions:${vipServerId}`,
        });
      }
    } catch {
      unavailableDefinitionSources.add("vipcore");
      warnings.push("VIPCore database definitions are unavailable; the last database-backed catalogue is retained.");
    }

    try {
      const sharedVipScope = vipServerId === 0;
      const [rows] = await connection.query<VipDatabaseAssignmentRow[]>(
        "SELECT DISTINCT `group` AS group_name FROM vip_users WHERE " +
          (sharedVipScope ? "" : "sid = ? AND ") +
          "(expires = 0 OR expires > UNIX_TIMESTAMP()) ORDER BY `group`",
        sharedVipScope ? [] : [vipServerId],
      );
      const assignedNames = rows
        .map((row) => cleanGroupName(row.group_name))
        .filter((name): name is string => Boolean(name));
      for (const name of assignedNames) {
        add({
          sourceType: "vipcore",
          sourceKind: "runtime",
          definitionAvailable: false,
          enabled: false,
          externalKey: name,
          displayName: name,
          rankWeight: 0,
          definition: { name, discoveredFrom: "vip_users.group" },
          baselinePermissions: [],
          capabilityKeys: [],
          sourceReference: sharedVipScope
            ? "VIPCore database · live assignments:all scopes"
            : `VIPCore database · live assignments:${vipServerId}`,
        });
      }
    } catch {
      warnings.push("VIPCore live group assignments could not be discovered.");
    }
    await connection.commit();
    transactionStarted = false;
  } finally {
    if (transactionStarted) {
      try {
        await connection.rollback();
      } catch {
        // Releasing the connection also clears an unfinished read transaction.
      }
    }
    connection.release();
  }

  return {
    groups: [...byKey.values()],
    authoritativeSources,
    unavailableDefinitionSources,
    warnings,
  };
}

function groupSlug(value: string) {
  const slug = value
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLocaleLowerCase("en-US")
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "")
    .slice(0, 44);
  return slug || createHash("sha256").update(value).digest("hex").slice(0, 12);
}

function externalGroupKey(group: ExternalGroupInput) {
  return `${group.sourceType}.${groupSlug(group.externalKey)}`;
}

function groupPresentation(group: ExternalGroupInput) {
  if (group.sourceType === "admins_core") {
    const founder = group.externalKey.toLocaleLowerCase("en-US") === "founder";
    return {
      description: "Admins.Core staff group",
      badgeLabel: group.displayName.toLocaleUpperCase("en-US").slice(0, 32),
      badgeIconKey: founder ? "crown" : "shield",
      badgeColor: founder ? "#ff718f" : "#61b7ff",
      badgeSoftColor: founder ? "#ffd1da" : "#cae8ff",
      profilePriority: founder ? 1_000 : Math.min(900, 100 + group.rankWeight),
    };
  }
  return {
    description: "VIPCore membership tier",
    badgeLabel: `VIP ${group.displayName}`.slice(0, 32),
    badgeIconKey: "crown",
    badgeColor: "#ffd34d",
    badgeSoftColor: "#fff0b0",
    profilePriority: Math.min(99, group.rankWeight),
  };
}

function contentHash(value: unknown) {
  return createHash("sha256").update(JSON.stringify(value)).digest("hex");
}

function permissionDisplayName(key: string) {
  const parts = key.split(/[.:_-]+/).filter(Boolean);
  const prefix = parts.shift() ?? "Game";
  const subject = (parts.at(-1) ?? prefix).replace(/\b\w/g, (letter) =>
    letter.toLocaleUpperCase("en-US"),
  );
  const prefixName =
    prefix === "admins"
      ? "Admins"
      : prefix === "vipcore"
        ? "VIPCore"
        : prefix === "tapped"
          ? "TAPPD"
          : prefix.replace(/\b\w/g, (letter) => letter.toLocaleUpperCase("en-US"));
  return `${prefixName} · ${subject}`.slice(0, 100);
}

function permissionIsSensitive(key: string) {
  return /(?:^|[._:-])(ban|rcon|admin|manage|grant|give|setmoney|givemoney|reload|deleteuser)(?:$|[._:-])/i.test(
    key,
  );
}

function addPermission(
  catalogue: Map<string, DiscoveredPermission>,
  rawKey: unknown,
  source: PermissionSource,
) {
  const key = cleanPermissionKey(rawKey);
  if (!key || catalogue.size >= MAX_PERMISSIONS && !catalogue.has(key)) return;
  const permission = catalogue.get(key) ?? { key, sources: [] };
  const fingerprint = `${source.sourceKind}\0${source.sourceReference}`;
  if (
    !permission.sources.some(
      (existing) =>
        `${existing.sourceKind}\0${existing.sourceReference}` === fingerprint,
    )
  ) {
    permission.sources.push(source);
  }
  catalogue.set(key, permission);
}

function collectPermissionStrings(
  value: unknown,
  callback: (value: string) => void,
  depth = 0,
) {
  if (depth > 12) return;
  if (typeof value === "string") {
    callback(value);
    return;
  }
  if (Array.isArray(value)) {
    for (const entry of value.slice(0, 2_000)) {
      collectPermissionStrings(entry, callback, depth + 1);
    }
    return;
  }
  const object = asObject(value);
  if (!object) return;
  for (const entry of Object.values(object).slice(0, 2_000)) {
    collectPermissionStrings(entry, callback, depth + 1);
  }
}

async function walkFiles(
  roots: string[],
  accept: (filePath: string) => boolean,
  maximum: number,
) {
  const files: string[] = [];
  const seen = new Set<string>();
  const ignoredDirectories = new Set([
    ".git",
    ".next",
    "node_modules",
    "bin",
    "obj",
    "build",
    "backups",
  ]);
  async function visit(directory: string) {
    if (files.length >= maximum) return;
    const normalized = path.resolve(/* turbopackIgnore: true */ directory).toLocaleLowerCase("en-US");
    if (seen.has(normalized)) return;
    seen.add(normalized);
    let entries;
    try {
      entries = await readdir(/* turbopackIgnore: true */ directory, { withFileTypes: true });
    } catch {
      return;
    }
    for (const entry of entries) {
      if (files.length >= maximum) break;
      const entryPath = path.join(/* turbopackIgnore: true */ directory, entry.name);
      if (entry.isDirectory()) {
        if (!ignoredDirectories.has(entry.name.toLocaleLowerCase("en-US"))) {
          await visit(entryPath);
        }
      } else if (entry.isFile() && accept(entryPath)) {
        files.push(entryPath);
      }
    }
  }
  for (const root of roots) await visit(root);
  return unique(files);
}

async function discoverConfigPermissions(
  catalogue: Map<string, DiscoveredPermission>,
) {
  const exactFiles = configRoots().flatMap((root) => [
    path.join(/* turbopackIgnore: true */ root, "permissions.jsonc"),
    path.join(/* turbopackIgnore: true */ root, "permissions.json"),
    path.join(/* turbopackIgnore: true */ root, "command_overrides.jsonc"),
    path.join(/* turbopackIgnore: true */ root, "command_overrides.json"),
  ]);
  const pluginRoots = configRoots().map((root) => path.join(/* turbopackIgnore: true */ root, "plugins"));
  const pluginFiles = await walkFiles(
    pluginRoots,
    (filePath) => /\.(?:json|jsonc)$/i.test(filePath),
    MAX_PLUGIN_CONFIG_FILES,
  );
  for (const filePath of unique([...exactFiles, ...pluginFiles])) {
    let details;
    try {
      details = await stat(/* turbopackIgnore: true */ filePath);
      if (!details.isFile() || details.size > MAX_CONFIG_BYTES) continue;
      const root = parseJsonc(await readFile(/* turbopackIgnore: true */ filePath, "utf8"));
      const reference = sourceReference(filePath);
      const commandPermissions =
        asObject(asObject(root.CommandOverrides)?.Permissions) ??
        asObject(asObject(root.commandOverrides)?.permissions);
      if (commandPermissions) {
        collectPermissionStrings(commandPermissions, (value) =>
          addPermission(catalogue, value, {
            sourceKind: "command_override",
            sourceReference: reference,
          }),
        );
      }
      const visit = (value: unknown, permissionContext = false, depth = 0) => {
        if (depth > 12) return;
        if (typeof value === "string") {
          if (permissionContext) {
            addPermission(catalogue, value, {
              sourceKind: "swiftly_config",
              sourceReference: reference,
            });
          }
          return;
        }
        if (Array.isArray(value)) {
          for (const entry of value.slice(0, 2_000)) {
            visit(entry, permissionContext, depth + 1);
          }
          return;
        }
        const object = asObject(value);
        if (!object) return;
        for (const [key, entry] of Object.entries(object).slice(0, 2_000)) {
          visit(
            entry,
            permissionContext || key.toLocaleLowerCase("en-US").includes("permission"),
            depth + 1,
          );
        }
      };
      visit(root);
    } catch {
      // One malformed optional plug-in config must not block other sources.
    }
  }
}

async function discoverSourcePermissions(
  catalogue: Map<string, DiscoveredPermission>,
) {
  const files = await walkFiles(
    permissionSourceRoots(),
    (filePath) => filePath.toLocaleLowerCase("en-US").endsWith(".cs"),
    MAX_SOURCE_FILES,
  );
  const patterns = [
    /\b(?:permission|adminpermission)\s*(?::|=)\s*"([^"\r\n]+)"/gi,
    /\bAdminPermission\b[^\r\n]{0,120}=\s*"([^"\r\n]+)"/gi,
  ];
  for (const filePath of files) {
    try {
      const details = await stat(/* turbopackIgnore: true */ filePath);
      if (!details.isFile() || details.size > MAX_SOURCE_BYTES) continue;
      const text = await readFile(/* turbopackIgnore: true */ filePath, "utf8");
      const reference = sourceReference(filePath);
      for (const pattern of patterns) {
        pattern.lastIndex = 0;
        for (const match of text.matchAll(pattern)) {
          addPermission(catalogue, match[1], {
            sourceKind: "source_code",
            sourceReference: reference,
          });
        }
      }
    } catch {
      // Source trees are optional deployment-time discovery inputs.
    }
  }
}

async function loadInputs(input: {
  loadAdmins: boolean;
  loadVip: boolean;
  loadPermissions: boolean;
  runtimeDatabaseConfigured: boolean;
  establishedDatabaseSources: ReadonlySet<ExternalIdentitySource>;
}) {
  const warnings: string[] = [];
  const groupsByKey = new Map<string, ExternalGroupInput>();
  const authoritativeSources = new Set<ExternalIdentitySource>();
  const unavailableDefinitionSources = new Set<ExternalIdentitySource>();
  const permissions = new Map<string, DiscoveredPermission>();
  let runtimeGroups: ExternalGroupInput[] = [];

  if (input.loadAdmins || input.loadVip) {
    try {
      const runtime = await loadRuntimeDatabaseGroups();
      runtimeGroups = runtime.groups;
      warnings.push(...runtime.warnings);
      for (const sourceType of runtime.unavailableDefinitionSources) {
        if (
          (sourceType === "admins_core" && input.loadAdmins) ||
          (sourceType === "vipcore" && input.loadVip)
        ) {
          unavailableDefinitionSources.add(sourceType);
        }
      }
      for (const sourceType of runtime.authoritativeSources) {
        if (
          (sourceType === "admins_core" && input.loadAdmins) ||
          (sourceType === "vipcore" && input.loadVip)
        ) {
          authoritativeSources.add(sourceType);
        }
      }
    } catch {
      if (input.runtimeDatabaseConfigured) {
        if (input.loadAdmins) unavailableDefinitionSources.add("admins_core");
        if (input.loadVip) unavailableDefinitionSources.add("vipcore");
      }
      warnings.push("The live Admins.Core/VIPCore group database could not be read; established database-backed definitions are retained.");
    }
  }

  // JSON is a compatibility/bootstrap fallback only. Once a plug-in's
  // definition table is readable, including an intentionally empty scope, the
  // portal never imports that source's file again.
  if (
    input.loadAdmins &&
    !authoritativeSources.has("admins_core") &&
    !input.runtimeDatabaseConfigured &&
    !input.establishedDatabaseSources.has("admins_core")
  ) {
    const file = await locateTextFile(adminsConfigCandidates());
    if (!file) {
      warnings.push("Admins.Core groups config was not found.");
    } else {
      try {
        const parsed = parseAdminsGroups(file);
        for (const group of parsed) groupsByKey.set(runtimeGroupKey(group), group);
        if (!parsed.length) warnings.push("Admins.Core config contained no extractable groups.");
      } catch {
        warnings.push("Admins.Core groups config could not be parsed.");
      }
    }
  }
  if (
    input.loadVip &&
    !authoritativeSources.has("vipcore") &&
    !input.runtimeDatabaseConfigured &&
    !input.establishedDatabaseSources.has("vipcore")
  ) {
    const file = await locateTextFile(vipConfigCandidates());
    if (!file) {
      warnings.push("VIPCore groups config was not found.");
    } else {
      try {
        const parsed = parseVipGroups(file);
        for (const group of parsed) groupsByKey.set(runtimeGroupKey(group), group);
        if (!parsed.length) warnings.push("VIPCore config contained no extractable groups.");
      } catch {
        warnings.push("VIPCore groups config could not be parsed.");
      }
    }
  }

  for (const group of runtimeGroups) {
    if (
      (group.sourceType === "admins_core" && !input.loadAdmins) ||
      (group.sourceType === "vipcore" && !input.loadVip)
    ) continue;
    const key = runtimeGroupKey(group);
    const existing = groupsByKey.get(key);
    if (
      authoritativeSources.has(group.sourceType) ||
      !existing ||
      (group.definitionAvailable && !existing.definitionAvailable)
    ) {
      groupsByKey.set(key, group);
    }
  }
  const groups = [...groupsByKey.values()];

  if (input.loadPermissions) {
    for (const group of groups.filter((entry) => entry.sourceType === "admins_core")) {
      for (const key of group.baselinePermissions) {
        addPermission(permissions, key, {
          sourceKind:
            group.sourceKind === "runtime" ? "admins_database" : "admins_config",
          sourceReference: `${group.sourceReference} · ${group.externalKey}`.slice(0, 255),
        });
      }
    }
    for (const key of builtinGamePermissions) {
      addPermission(permissions, key, {
        sourceKind: "builtin",
        sourceReference: "Arena Portal supported plug-ins",
      });
    }
    await Promise.all([
      discoverConfigPermissions(permissions),
      discoverSourcePermissions(permissions),
    ]);
  }
  return {
    groups,
    permissions: [...permissions.values()],
    authoritativeSources,
    unavailableDefinitionSources,
    warnings,
  };
}

async function readStatus(executor: Pick<Pool, "query"> | Pick<PoolConnection, "query">) {
  const [rows] = await executor.query<CountRow[]>(
    "SELECT " +
      "SUM(definitions.source_type = 'admins_core') AS admins_core_definitions, " +
      "SUM(definitions.source_type = 'vipcore') AS vipcore_definitions, " +
      "(SELECT COUNT(DISTINCT privilege_id) FROM portal_identity_privilege_sources) AS discovered_privileges, " +
      "MAX(definitions.synced_at) AS last_synced_at " +
      "FROM portal_identity_external_group_definitions AS definitions",
  );
  const row = rows[0];
  return {
    adminsCoreDefinitions: Number(row?.admins_core_definitions ?? 0),
    vipCoreDefinitions: Number(row?.vipcore_definitions ?? 0),
    discoveredPrivileges: Number(row?.discovered_privileges ?? 0),
    lastSyncedAt: row?.last_synced_at
      ? new Date(row.last_synced_at).toISOString()
      : null,
  } satisfies IdentityCatalogueStatus;
}

async function readEstablishedDatabaseSources(
  executor: Pick<Pool, "query"> | Pick<PoolConnection, "query">,
) {
  const [rows] = await executor.query<
    Array<RowDataPacket & { source_type: ExternalIdentitySource }>
  >(
    "SELECT source_type FROM portal_identity_catalogue_authority " +
      "WHERE database_authoritative = TRUE ORDER BY source_type",
  );
  return new Set(rows.map((row) => row.source_type));
}

async function markDatabaseSourceAuthoritative(
  connection: PoolConnection,
  sourceType: ExternalIdentitySource,
) {
  await connection.execute(
    "INSERT INTO portal_identity_catalogue_authority " +
      "(source_type, database_authoritative, established_at, last_confirmed_at) " +
      "VALUES (?, TRUE, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP) " +
      "ON DUPLICATE KEY UPDATE database_authoritative = TRUE, last_confirmed_at = CURRENT_TIMESTAMP",
    [sourceType],
  );
}

async function ensureAdapterGroup(
  connection: PoolConnection,
  group: ExternalGroupInput,
) {
  const [externalRows] = await connection.query<IdRow[]>(
    "SELECT id FROM portal_identity_groups WHERE source_type = ? AND external_key = ? LIMIT 1 FOR UPDATE",
    [group.sourceType, group.externalKey],
  );
  if (externalRows[0]) return Number(externalRows[0].id);

  let groupKey = externalGroupKey(group);
  const [keyRows] = await connection.query<IdRow[]>(
    "SELECT id FROM portal_identity_groups WHERE group_key = ? LIMIT 1 FOR UPDATE",
    [groupKey],
  );
  if (keyRows[0]) {
    const suffix = contentHash(`${group.sourceType}\0${group.externalKey}`).slice(0, 8);
    groupKey = `${groupKey.slice(0, 55)}_${suffix}`;
  }
  const presentation = groupPresentation(group);
  const [result] = await connection.execute<ResultSetHeader>(
    "INSERT INTO portal_identity_groups " +
      "(group_key, display_name, source_type, external_key, description, badge_label, badge_icon_key, badge_color, badge_soft_color, profile_priority, enabled, created_by_steam_id) " +
      "VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'system')",
    [
      groupKey,
      group.displayName,
      group.sourceType,
      group.externalKey,
      presentation.description,
      presentation.badgeLabel,
      presentation.badgeIconKey,
      presentation.badgeColor,
      presentation.badgeSoftColor,
      presentation.profilePriority,
      group.enabled,
    ],
  );
  return Number(result.insertId);
}

async function storeGroup(
  connection: PoolConnection,
  group: ExternalGroupInput,
) {
  const groupId = await ensureAdapterGroup(connection, group);
  if (!group.definitionAvailable) return;
  const definitionHash = contentHash({
    sourceType: group.sourceType,
    externalKey: group.externalKey,
    rankWeight: group.rankWeight,
    definition: group.definition,
    baselinePermissions: group.baselinePermissions,
    capabilityKeys: group.capabilityKeys,
    enabled: group.enabled,
  });
  // A successfully loaded runtime/config definition is the only condition that
  // may reactivate an external adapter. VIPCore mirrors its explicit enabled
  // flag; Admins.Core definitions are available when present in this scope.
  await connection.execute(
    "UPDATE portal_identity_groups SET enabled = ? WHERE id = ?",
    [group.enabled, groupId],
  );
  await connection.execute(
    "INSERT INTO portal_identity_external_group_definitions " +
      "(group_id, source_type, external_key, rank_weight, definition, baseline_permissions, capability_keys, source_kind, source_reference, content_hash, synced_at) " +
      "VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP) " +
      "ON DUPLICATE KEY UPDATE rank_weight = VALUES(rank_weight), definition = VALUES(definition), baseline_permissions = VALUES(baseline_permissions), capability_keys = VALUES(capability_keys), source_kind = VALUES(source_kind), source_reference = VALUES(source_reference), content_hash = VALUES(content_hash), synced_at = CURRENT_TIMESTAMP",
    [
      groupId,
      group.sourceType,
      group.externalKey,
      group.rankWeight,
      JSON.stringify(group.definition),
      JSON.stringify(group.baselinePermissions),
      JSON.stringify(group.capabilityKeys),
      group.sourceKind,
      group.sourceReference,
      definitionHash,
    ],
  );
}

async function removeStaleExternalDefinitions(
  connection: PoolConnection,
  sourceType: ExternalIdentitySource,
  activeExternalKeys: string[],
) {
  if (!activeExternalKeys.length) {
    await connection.execute(
      "UPDATE portal_identity_groups AS identity_group " +
        "INNER JOIN portal_identity_external_group_definitions AS definitions ON definitions.group_id = identity_group.id " +
        "SET identity_group.enabled = FALSE " +
        "WHERE definitions.source_type = ?",
      [sourceType],
    );
    await connection.execute(
      "DELETE FROM portal_identity_external_group_definitions WHERE source_type = ?",
      [sourceType],
    );
    return;
  }
  const placeholders = activeExternalKeys.map(() => "?").join(", ");
  await connection.execute(
    "UPDATE portal_identity_groups AS identity_group " +
      "INNER JOIN portal_identity_external_group_definitions AS definitions ON definitions.group_id = identity_group.id " +
      "SET identity_group.enabled = FALSE " +
      `WHERE definitions.source_type = ? AND definitions.external_key NOT IN (${placeholders})`,
    [sourceType, ...activeExternalKeys],
  );
  await connection.execute(
    "DELETE FROM portal_identity_external_group_definitions " +
      `WHERE source_type = ? AND external_key NOT IN (${placeholders})`,
    [sourceType, ...activeExternalKeys],
  );
}

async function disableUnverifiedConfigSources(
  connection: PoolConnection,
  sourceTypes: ExternalIdentitySource[],
) {
  if (!sourceTypes.length) return;
  const placeholders = sourceTypes.map(() => "?").join(", ");
  const sourceFilter = `definitions.source_type IN (${placeholders}) AND definitions.source_kind = 'config'`;
  await connection.execute(
    "UPDATE portal_identity_groups AS identity_group " +
      "INNER JOIN portal_identity_external_group_definitions AS definitions ON definitions.group_id = identity_group.id " +
      `SET identity_group.enabled = FALSE WHERE ${sourceFilter}`,
    sourceTypes,
  );
  await connection.execute(
    "UPDATE portal_identity_group_listings AS listing " +
      "INNER JOIN portal_identity_external_group_definitions AS definitions ON definitions.group_id = listing.group_id " +
      "SET listing.enabled = FALSE, listing.vip_page_enabled = FALSE, listing.market_enabled = FALSE, listing.updated_by_steam_id = 'system' " +
      `WHERE ${sourceFilter}`,
    sourceTypes,
  );
  await connection.execute(
    "UPDATE portal_economy_catalogue AS catalogue " +
      "INNER JOIN portal_identity_group_listings AS listing ON listing.catalogue_id = catalogue.id " +
      "INNER JOIN portal_identity_external_group_definitions AS definitions ON definitions.group_id = listing.group_id " +
      "SET catalogue.metadata = JSON_SET(catalogue.metadata, '$.marketEnabled', JSON_EXTRACT('false', '$'), '$.donationEnabled', JSON_EXTRACT('false', '$')) " +
      `WHERE ${sourceFilter}`,
    sourceTypes,
  );
}

async function disableUndeliverableExternalListings(connection: PoolConnection) {
  try {
    await connection.execute(
      "UPDATE portal_identity_group_listings AS listing " +
        "INNER JOIN portal_identity_groups AS identity_group ON identity_group.id = listing.group_id " +
        "LEFT JOIN portal_identity_external_group_definitions AS external_definition ON external_definition.group_id = identity_group.id AND external_definition.source_type COLLATE utf8mb4_unicode_ci = identity_group.source_type COLLATE utf8mb4_unicode_ci AND external_definition.external_key COLLATE utf8mb4_unicode_ci = identity_group.external_key COLLATE utf8mb4_unicode_ci " +
        "SET listing.enabled = FALSE, listing.vip_page_enabled = FALSE, listing.market_enabled = FALSE, listing.updated_by_steam_id = 'system' " +
        "WHERE identity_group.source_type IN ('admins_core', 'vipcore') AND (identity_group.enabled = FALSE OR external_definition.group_id IS NULL OR (identity_group.source_type = 'admins_core' AND LOWER(TRIM(COALESCE(identity_group.external_key, ''))) = 'founder'))",
    );
    await connection.execute(
      "UPDATE portal_economy_catalogue AS catalogue " +
        "INNER JOIN portal_identity_group_listings AS listing ON listing.catalogue_id = catalogue.id " +
        "INNER JOIN portal_identity_groups AS identity_group ON identity_group.id = listing.group_id " +
        "LEFT JOIN portal_identity_external_group_definitions AS external_definition ON external_definition.group_id = identity_group.id AND external_definition.source_type COLLATE utf8mb4_unicode_ci = identity_group.source_type COLLATE utf8mb4_unicode_ci AND external_definition.external_key COLLATE utf8mb4_unicode_ci = identity_group.external_key COLLATE utf8mb4_unicode_ci " +
        "SET catalogue.metadata = JSON_SET(catalogue.metadata, '$.marketEnabled', JSON_EXTRACT('false', '$'), '$.donationEnabled', JSON_EXTRACT('false', '$')) " +
        "WHERE identity_group.source_type IN ('admins_core', 'vipcore') AND (identity_group.enabled = FALSE OR external_definition.group_id IS NULL OR (identity_group.source_type = 'admins_core' AND LOWER(TRIM(COALESCE(identity_group.external_key, ''))) = 'founder'))",
    );
  } catch (error) {
    const candidate = error as { code?: unknown; errno?: unknown };
    // External catalogue sync predates migration 020. Keep the existing sync
    // usable during a rolling deploy; once listing storage exists, every stale
    // external listing is failed closed in this same transaction.
    if (candidate.code === "ER_NO_SUCH_TABLE" || candidate.errno === 1146) return;
    throw error;
  }
}

async function readUndeliverableRewardOwners(connection: PoolConnection) {
  const [rows] = await connection.query<SteamIdRow[]>(
    "SELECT DISTINCT awards.steam_id " +
      "FROM portal_identity_group_reward_awards AS awards " +
      "INNER JOIN portal_identity_group_rewards AS rewards ON rewards.id = awards.reward_id " +
      "INNER JOIN portal_identity_groups AS identity_group ON identity_group.id = rewards.group_id " +
      "LEFT JOIN portal_identity_external_group_definitions AS external_definition ON external_definition.group_id = identity_group.id " +
      "WHERE awards.entitlement_active = TRUE AND rewards.trade_policy = 'account_bound' " +
      "AND identity_group.source_type IN ('admins_core', 'vipcore') " +
      "AND (identity_group.enabled = FALSE OR external_definition.group_id IS NULL) " +
      "ORDER BY awards.steam_id",
  );
  return rows.map((row) => String(row.steam_id));
}

async function storePermission(
  connection: PoolConnection,
  permission: DiscoveredPermission,
) {
  await connection.execute(
    "INSERT IGNORE INTO portal_identity_privileges " +
      "(privilege_key, scope, display_name, description, is_sensitive, enabled, created_by_steam_id) " +
      "VALUES (?, 'game', ?, ?, ?, TRUE, 'system')",
    [
      permission.key,
      permissionDisplayName(permission.key),
      "Discovered game-server permission; assign as an additive group or player grant.",
      permissionIsSensitive(permission.key),
    ],
  );
  const [rows] = await connection.query<IdRow[]>(
    "SELECT id FROM portal_identity_privileges WHERE privilege_key = ? LIMIT 1",
    [permission.key],
  );
  if (!rows[0]) return;
  const privilegeId = Number(rows[0].id);
  for (const source of permission.sources.slice(0, 128)) {
    const sourceKey = `${source.sourceKind}:${contentHash(
      `${permission.key}\0${source.sourceReference}`,
    ).slice(0, 48)}`;
    await connection.execute(
      "INSERT INTO portal_identity_privilege_sources " +
        "(privilege_id, source_key, source_kind, source_reference, discovered_at, last_seen_at) " +
        "VALUES (?, ?, ?, ?, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP) " +
        "ON DUPLICATE KEY UPDATE source_reference = VALUES(source_reference), last_seen_at = CURRENT_TIMESTAMP",
      [privilegeId, sourceKey, source.sourceKind, source.sourceReference],
    );
  }
}

async function writeSyncAudit(
  connection: PoolConnection,
  input: {
    auditKey: string;
    actorSteamId: string | null;
    importedGroups: number;
    importedPrivileges: number;
  },
) {
  await connection.execute(
    "INSERT IGNORE INTO portal_identity_audit_events " +
      "(idempotency_key, actor_type, actor_id, action, target_type, target_id, metadata) " +
      "VALUES (?, ?, ?, 'identity.catalogue.synced', 'identity-catalogue', 'external-groups', ?)",
    [
      input.auditKey.slice(0, 160),
      input.actorSteamId ? "founder" : "system",
      input.actorSteamId ?? "identity-config-bootstrap",
      JSON.stringify({
        importedGroups: input.importedGroups,
        importedPrivileges: input.importedPrivileges,
      }),
    ],
  );
}

export async function getIdentityCatalogueStatus(pool: Pool) {
  return readStatus(pool);
}

export async function syncIdentityCatalogue(
  pool: Pool,
  options: {
    force?: boolean;
    actorSteamId?: string | null;
    auditKey?: string;
  } = {},
): Promise<IdentityCatalogueSyncResult> {
  const runtimeDatabaseConfigured = Boolean(process.env.GAME_DATABASE_URL?.trim());
  if (runtimeDatabaseConfigured) {
    // Native Admins.Core/VIPCore tables and the normalized Arena catalogue
    // share one database, so synchronize them before taking the cross-host
    // Portal projection snapshot. The operation is idempotent and updates row
    // versions only when a definition or scope actually changed.
    await synchronizeArenaRuntimeGroupAuthority({
      actorSteamId: options.actorSteamId,
    });
  }
  const initial = await readStatus(pool);
  const loadAdmins =
    Boolean(options.force) ||
    initial.adminsCoreDefinitions === 0 ||
    runtimeDatabaseConfigured;
  const loadVip =
    Boolean(options.force) ||
    initial.vipCoreDefinitions === 0 ||
    runtimeDatabaseConfigured;
  const loadPermissions =
    Boolean(options.force) || initial.discoveredPrivileges === 0;
  if (!loadAdmins && !loadVip && !loadPermissions) {
    return { ...initial, importedGroups: 0, importedPrivileges: 0, warnings: [] };
  }

  const connection = await pool.getConnection();
  let lockAcquired = false;
  let result: IdentityCatalogueSyncResult | null = null;
  let undeliverableRewardOwners: string[] = [];
  try {
    const [lockRows] = await connection.query<LockRow[]>(
      "SELECT GET_LOCK('portal.identity.catalogue.sync', 10) AS acquired",
    );
    lockAcquired = Number(lockRows[0]?.acquired ?? 0) === 1;
    if (!lockAcquired) throw new Error("Identity catalogue sync is already running.");

    // The named lock covers both source discovery and the portal write. Taking
    // a runtime snapshot before the lock would let a slow, older snapshot
    // overwrite a newer rename refresh that acquired and released the lock in
    // the meantime. Keep game/file reads outside the portal transaction so the
    // database row locks are held only while applying the serialized snapshot.
    const establishedDatabaseSources = await readEstablishedDatabaseSources(connection);
    const inputs = await loadInputs({
      loadAdmins: loadAdmins || loadPermissions,
      loadVip,
      loadPermissions,
      runtimeDatabaseConfigured,
      establishedDatabaseSources,
    });
    await connection.beginTransaction();
    const current = await readStatus(connection);
    const shouldImportAdmins =
      Boolean(options.force) ||
      current.adminsCoreDefinitions === 0 ||
      runtimeDatabaseConfigured;
    const shouldImportVip =
      Boolean(options.force) ||
      current.vipCoreDefinitions === 0 ||
      runtimeDatabaseConfigured;
    let groups = inputs.groups.filter(
      (group) =>
        group.sourceType === "admins_core"
          ? shouldImportAdmins
          : shouldImportVip,
    );
    // Paid activation and source-aware staff mutations lock VIP adapters in
    // ascending ID order. Claim the complete existing adapter set in that same
    // order before per-group updates so a weight-sorted runtime input cannot
    // invert the lock order.
    await connection.query(
      "SELECT id FROM portal_identity_groups " +
        "WHERE source_type IN ('admins_core', 'vipcore') ORDER BY id FOR UPDATE",
    );
    const unverifiedUnavailableSources = [...inputs.unavailableDefinitionSources]
      .filter((sourceType) => !establishedDatabaseSources.has(sourceType));
    await disableUnverifiedConfigSources(connection, unverifiedUnavailableSources);
    if (unverifiedUnavailableSources.length) {
      inputs.warnings.push(
        `Disabled unverified JSON-backed ${unverifiedUnavailableSources.join(" and ")} adapters until their runtime definition tables can be read.`,
      );
    }
    const recoveredRenames = await recoverPendingIdentityGroupRenames(
      connection,
      groups,
      inputs.authoritativeSources,
    );
    if (recoveredRenames) {
      inputs.warnings.push(
        `Recovered ${recoveredRenames} completed runtime group rename${recoveredRenames === 1 ? "" : "s"} from durable intent.`,
      );
    }
    const aliasSafety = await excludeAmbiguousHistoricalAliasGroups(
      connection,
      groups,
    );
    groups = aliasSafety.groups;
    for (const rejected of aliasSafety.rejected) {
      inputs.warnings.push(
        `${rejected.sourceType} group ${rejected.externalKey} was not enabled because its name is reserved by a stable group's rename history or pending rename.`,
      );
    }
    for (const group of groups) await storeGroup(connection, group);
    for (const sourceType of inputs.authoritativeSources) {
      await markDatabaseSourceAuthoritative(connection, sourceType);
      await removeStaleExternalDefinitions(
        connection,
        sourceType,
        groups
          .filter(
            (group) =>
              group.sourceType === sourceType && group.definitionAvailable,
          )
          .map((group) => group.externalKey),
      );
    }
    await disableUndeliverableExternalListings(connection);
    undeliverableRewardOwners = await readUndeliverableRewardOwners(connection);
    for (const permission of inputs.permissions) {
      await storePermission(connection, permission);
    }
    const automaticFingerprint = contentHash({
      groups: groups.map((group) => [
        group.sourceType,
        group.externalKey,
        group.rankWeight,
        group.definition,
      ]),
      permissions: inputs.permissions.map((permission) => permission.key),
    });
    await writeSyncAudit(connection, {
      auditKey:
        options.auditKey ?? `identity-catalogue:auto:${automaticFingerprint.slice(0, 48)}`,
      actorSteamId: options.actorSteamId ?? null,
      importedGroups: groups.length,
      importedPrivileges: inputs.permissions.length,
    });
    await connection.commit();
    const status = await readStatus(connection);
    result = {
      ...status,
      importedGroups: groups.length,
      importedPrivileges: inputs.permissions.length,
      warnings: inputs.warnings,
    };
  } catch (error) {
    try {
      await connection.rollback();
    } catch {
      // The transaction may not have started yet.
    }
    throw error;
  } finally {
    if (lockAcquired) {
      try {
        await connection.query("SELECT RELEASE_LOCK('portal.identity.catalogue.sync')");
      } catch {
        // Connection release also releases the named lock.
      }
    }
    connection.release();
  }

  if (!result) {
    throw new Error("Identity catalogue synchronization did not produce a result.");
  }
  if (runtimeDatabaseConfigured) {
    // Portal owns only presentation, marketplace, and inventory coordinates.
    // Link those adapters after their local transaction commits; a retry is
    // safe if either database becomes unavailable between the two commits.
    await synchronizePortalRuntimeGroupProjection(pool, {
      actorSteamId: options.actorSteamId,
    });
  }
  if (undeliverableRewardOwners.length) {
    // Catalogue state is committed and the sync connection is released before
    // potentially expensive per-player inventory reconciliation. The shared
    // reconciler safely detaches loadouts/themes and emits the normal inventory
    // events instead of leaving account-bound perks usable after a group is
    // disabled or removed.
    const { reconcileIdentityGroupRewards } = await import("@/lib/data/identity-groups");
    for (const steamId of undeliverableRewardOwners) {
      try {
        await reconcileIdentityGroupRewards({
          steamId,
          requestKey: `catalogue-retire:${steamId}:${Date.now()}`,
        });
      } catch (error) {
        console.error("An undeliverable external group reward could not be reconciled", {
          steamId,
          error,
        });
        result.warnings.push(
          `Account-bound rewards for Steam ${steamId} require manual reconciliation.`,
        );
      }
    }
  }
  return result;
}

export function ensureIdentityCatalogue(pool: Pool) {
  bootstrapPromise ??= syncIdentityCatalogue(pool).catch((error) => {
    bootstrapPromise = null;
    throw error;
  });
  return bootstrapPromise;
}
