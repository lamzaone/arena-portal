import { createHash } from "node:crypto";
import { readdir, readFile, stat } from "node:fs/promises";
import path from "node:path";

import type {
  Pool,
  PoolConnection,
  ResultSetHeader,
  RowDataPacket,
} from "mysql2/promise";

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
}) {
  const warnings: string[] = [];
  const groups: ExternalGroupInput[] = [];
  const permissions = new Map<string, DiscoveredPermission>();
  if (input.loadAdmins) {
    const file = await locateTextFile(adminsConfigCandidates());
    if (!file) {
      warnings.push("Admins.Core groups config was not found.");
    } else {
      try {
        const parsed = parseAdminsGroups(file);
        groups.push(...parsed);
        if (!parsed.length) warnings.push("Admins.Core config contained no extractable groups.");
      } catch {
        warnings.push("Admins.Core groups config could not be parsed.");
      }
    }
  }
  if (input.loadVip) {
    const file = await locateTextFile(vipConfigCandidates());
    if (!file) {
      warnings.push("VIPCore groups config was not found.");
    } else {
      try {
        const parsed = parseVipGroups(file);
        groups.push(...parsed);
        if (!parsed.length) warnings.push("VIPCore config contained no extractable groups.");
      } catch {
        warnings.push("VIPCore groups config could not be parsed.");
      }
    }
  }
  if (input.loadPermissions) {
    for (const key of builtinGamePermissions) {
      addPermission(permissions, key, {
        sourceKind: "builtin",
        sourceReference: "Arena Portal supported plug-ins",
      });
    }
    for (const group of groups.filter((entry) => entry.sourceType === "admins_core")) {
      for (const key of group.baselinePermissions) {
        addPermission(permissions, key, {
          sourceKind: "admins_config",
          sourceReference: `${group.sourceReference} · ${group.externalKey}`.slice(0, 255),
        });
      }
    }
    await Promise.all([
      discoverConfigPermissions(permissions),
      discoverSourcePermissions(permissions),
    ]);
  }
  return { groups, permissions: [...permissions.values()], warnings };
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
      "VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, TRUE, 'system')",
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
    ],
  );
  return Number(result.insertId);
}

async function storeGroup(
  connection: PoolConnection,
  group: ExternalGroupInput,
) {
  const groupId = await ensureAdapterGroup(connection, group);
  const definitionHash = contentHash({
    sourceType: group.sourceType,
    externalKey: group.externalKey,
    rankWeight: group.rankWeight,
    definition: group.definition,
    baselinePermissions: group.baselinePermissions,
    capabilityKeys: group.capabilityKeys,
  });
  await connection.execute(
    "INSERT INTO portal_identity_external_group_definitions " +
      "(group_id, source_type, external_key, rank_weight, definition, baseline_permissions, capability_keys, source_kind, source_reference, content_hash, synced_at) " +
      "VALUES (?, ?, ?, ?, ?, ?, ?, 'config', ?, ?, CURRENT_TIMESTAMP) " +
      "ON DUPLICATE KEY UPDATE rank_weight = VALUES(rank_weight), definition = VALUES(definition), baseline_permissions = VALUES(baseline_permissions), capability_keys = VALUES(capability_keys), source_kind = VALUES(source_kind), source_reference = VALUES(source_reference), content_hash = VALUES(content_hash), synced_at = CURRENT_TIMESTAMP",
    [
      groupId,
      group.sourceType,
      group.externalKey,
      group.rankWeight,
      JSON.stringify(group.definition),
      JSON.stringify(group.baselinePermissions),
      JSON.stringify(group.capabilityKeys),
      group.sourceReference,
      definitionHash,
    ],
  );
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
  const initial = await readStatus(pool);
  const loadAdmins = Boolean(options.force) || initial.adminsCoreDefinitions === 0;
  const loadVip = Boolean(options.force) || initial.vipCoreDefinitions === 0;
  const loadPermissions =
    Boolean(options.force) || initial.discoveredPrivileges === 0 || loadAdmins;
  if (!loadAdmins && !loadVip && !loadPermissions) {
    return { ...initial, importedGroups: 0, importedPrivileges: 0, warnings: [] };
  }

  const inputs = await loadInputs({
    loadAdmins: loadAdmins || loadPermissions,
    loadVip,
    loadPermissions,
  });
  const connection = await pool.getConnection();
  let lockAcquired = false;
  try {
    const [lockRows] = await connection.query<LockRow[]>(
      "SELECT GET_LOCK('portal.identity.catalogue.sync', 10) AS acquired",
    );
    lockAcquired = Number(lockRows[0]?.acquired ?? 0) === 1;
    if (!lockAcquired) throw new Error("Identity catalogue sync is already running.");
    await connection.beginTransaction();
    const current = await readStatus(connection);
    const shouldImportAdmins =
      Boolean(options.force) || current.adminsCoreDefinitions === 0;
    const shouldImportVip = Boolean(options.force) || current.vipCoreDefinitions === 0;
    const groups = inputs.groups.filter(
      (group) =>
        group.sourceType === "admins_core"
          ? shouldImportAdmins
          : shouldImportVip,
    );
    for (const group of groups) await storeGroup(connection, group);
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
    return {
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
}

export function ensureIdentityCatalogue(pool: Pool) {
  bootstrapPromise ??= syncIdentityCatalogue(pool).catch((error) => {
    bootstrapPromise = null;
    throw error;
  });
  return bootstrapPromise;
}
