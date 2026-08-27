import "server-only";

import { createHash, randomInt, randomUUID } from "node:crypto";

import mysql, {
  type Pool,
  type PoolConnection,
  type ResultSetHeader,
  type RowDataPacket,
} from "mysql2/promise";

import { normalizeVipGroup } from "@/lib/content/group-presentation";
import {
  adjustedMarketplaceEuroCents,
  deriveMarketplacePriceIdentity,
  getMarketplacePriceQuotes,
  marketplaceFloatDiscountBps,
} from "@/lib/economy/market-pricing";

type StatRow = RowDataPacket & {
  name: string;
  value: number;
  rank: number;
  kills: number;
  deaths: number;
  headshots: number;
  noscopes: number;
  playtime: number;
  game_wins: number;
  game_losses: number;
  games_played: number;
};

type HitStatsRow = RowDataPacket & {
  DmgHealth: number;
  DmgArmor: number;
  Head: number;
  Chest: number;
  Belly: number;
  LeftArm: number;
  RightArm: number;
  LeftLeg: number;
  RightLeg: number;
  Neak: number;
};

type LeaderboardRow = RowDataPacket & {
  steam: string;
  name: string;
  rank: number;
  value: number;
  kills: number;
  deaths: number;
  mvps: number;
};

type CountRow = RowDataPacket & { total: number };

type AdminAuthorizationRow = RowDataPacket & {
  SteamId64: string;
  Username: string;
  Permissions: string;
  Groups: string;
  Immunity: number;
  Servers: string;
};

type StaffBanRow = RowDataPacket & {
  Id: number;
  SteamId64: string;
  PlayerName: string;
  ExpiresAt: number;
  Length: number;
  Reason: string;
  AdminSteamId64: string;
  AdminName: string;
  Server: string;
  GlobalBan: number | boolean;
  CreatedAt: number;
};

type StaffSanctionRow = RowDataPacket & {
  Id: number;
  SteamId64: string;
  PlayerName: string;
  SanctionKind: number;
  ExpiresAt: number;
  Length: number;
  Reason: string;
  AdminSteamId64: string;
  AdminName: string;
  Server: string;
  GlobalSanction: number | boolean;
  CreatedAt: number;
};

type BanRow = RowDataPacket & {
  Id: number;
  Reason: string;
  AdminSteamId64: string | null;
  AdminName: string;
  Server: string;
  ExpiresAt: number;
  Length: number;
  CreatedAt: number;
};

type SanctionRow = RowDataPacket & {
  Id: number;
  SanctionKind: number;
  Reason: string;
  AdminSteamId64: string | null;
  AdminName: string;
  ExpiresAt: number;
  Length: number;
  CreatedAt: number;
};

type TicketRow = RowDataPacket & {
  id: number;
  category: string;
  subject: string;
  body: string;
  status: string;
  created_at: Date;
  updated_at: Date;
};

type AppealRow = RowDataPacket & {
  id: number;
  ban_id: number | null;
  body: string;
  status: string;
  created_at: Date;
  updated_at: Date;
};

type AppealEligibilityRow = RowDataPacket & {
  decision_at: Date;
};

type PortalSessionRow = RowDataPacket & {
  steam_id: string;
  expires_at: number;
};

type AdminListRow = RowDataPacket & {
  Id: number;
  SteamId64: string;
  Username: string;
  Permissions: string;
  Groups: string;
  Immunity: number;
  Servers: string;
};

type VipUserRow = RowDataPacket & {
  account_id: string;
  name: string;
  lastvisit: number;
  sid: number;
  group: string;
  expires: number;
};

type CaseMessageRow = RowDataPacket & {
  id: number;
  author_type: string;
  author_id: string;
  body: string;
  created_at: Date;
};

type CaseAttachmentRow = RowDataPacket & {
  id: number;
  case_type: "appeal" | "ticket";
  case_id: number;
  message_id: number | null;
  file_name: string;
  content_type: string;
  created_at: Date;
};

type CaseAttachmentBlobRow = CaseAttachmentRow & { file_data: Buffer };

type StaffAppealRow = RowDataPacket & {
  id: number;
  steam_id: string;
  ban_id: number | null;
  body: string;
  status: string;
  created_at: Date;
  updated_at: Date;
  closed_by: string | null;
  closed_at: Date | null;
};

type StaffTicketRow = RowDataPacket & {
  id: number;
  steam_id: string;
  category: string;
  subject: string;
  body: string;
  status: string;
  created_at: Date;
  updated_at: Date;
  closed_by: string | null;
  closed_at: Date | null;
};

type PortalLoadoutCatalogueRow = RowDataPacket & {
  payload: unknown;
  synced_at: Date;
};

type LoadoutSkinRow = RowDataPacket & {
  weapon_team: number;
  weapon_defindex: number;
  weapon_paint_id: number;
  weapon_wear: number;
  weapon_seed: number;
};

type LoadoutKnifeRow = RowDataPacket & {
  weapon_team: number;
  knife: string;
};

type LoadoutGloveRow = RowDataPacket & {
  weapon_team: number;
  weapon_defindex: number;
};

type LoadoutAgentRow = RowDataPacket & {
  weapon_team: number;
  agent_index: number;
};

type LoadoutMusicRow = RowDataPacket & {
  music_id: number;
};

export type PortalBridgeEvent =
  | "moderation.ban"
  | "moderation.unban"
  | "loadout.weapon.set"
  | "loadout.weapon.reset"
  | "loadout.knife.set"
  | "loadout.knife.reset"
  | "loadout.glove.set"
  | "loadout.glove.reset"
  | "loadout.agent.set"
  | "loadout.agent.reset"
  | "loadout.music-kit.set"
  | "loadout.music-kit.reset";

export type LoadoutTeam = "T" | "CT";
export type LoadoutCategory = "weapon" | "knife" | "glove";

export type LoadoutPaintkit = {
  key: string;
  displayName: string;
  paintkit: number;
  rarity: string;
  color: string;
};

export type LoadoutItem = {
  key: string;
  displayName: string;
  definitionIndex: number;
  category: LoadoutCategory;
  paintkits: LoadoutPaintkit[];
};

export type LoadoutAgent = {
  key: string;
  displayName: string;
  agentIndex: number;
  team: LoadoutTeam;
  rarity: string;
  color: string;
};

export type LoadoutMusicKit = {
  key: string;
  displayName: string;
  musicKitIndex: number;
  rarity: string;
  color: string;
};

export type LoadoutKeychain = {
  key: string;
  displayName: string;
  keychain: number;
  rarity: string;
  color: string;
};

export type LoadoutSticker = {
  key: string;
  displayName: string;
  sticker: number;
  collection: string;
  rarity: string;
  color: string;
};

export type LoadoutCatalogue = {
  syncedAt: string;
  items: LoadoutItem[];
  agents: LoadoutAgent[];
  musicKits: LoadoutMusicKit[];
  keychains: LoadoutKeychain[];
  stickers: LoadoutSticker[];
};

export type SavedLoadoutSkin = {
  team: LoadoutTeam;
  definitionIndex: number;
  paintkit: number;
  seed: number;
  wear: number;
};

export type PlayerLoadout = {
  sourceConnected: boolean;
  weapons: SavedLoadoutSkin[];
  knives: Array<SavedLoadoutSkin & { key: string | null }>;
  gloves: SavedLoadoutSkin[];
  agents: Array<{ team: LoadoutTeam; agentIndex: number }>;
  musicKitIndex: number | null;
};

export type ModerationRecord = {
  id: number;
  reason: string;
  adminSteamId: string | null;
  adminName: string;
  expiresAt: number;
  length: number;
  createdAt: number;
};

export type GroupMembership = {
  name: string;
  expiresAt: number | null;
};

export type HitboxStats = {
  totalHits: number;
  healthDamage: number;
  armorDamage: number;
  head: number;
  chest: number;
  stomach: number;
  leftArm: number;
  rightArm: number;
  leftLeg: number;
  rightLeg: number;
  neck: number;
};

export type PlayerDashboard = {
  sourceConnected: boolean;
  hasGameRecord: boolean;
  displayName: string | null;
  points: number;
  rank: number;
  leaderboardPosition: number | null;
  leaderboardTotal: number;
  playtimeSeconds: number;
  kills: number;
  deaths: number;
  headshots: number;
  noscopes: number;
  hitStats: HitboxStats;
  gamesPlayed: number;
  gameWins: number;
  gameLosses: number;
  vipGroups: GroupMembership[];
  adminGroups: GroupMembership[];
  bans: ModerationRecord[];
  sanctions: Array<ModerationRecord & { kind: "Gag" | "Mute" }>;
  kickHistoryAvailable: boolean;
  skinSummary: {
    skins: number;
    knives: number;
    gloves: number;
    agents: number;
    musicKits: number;
  };
};

export type AdminAuthorization = {
  steamId: string;
  username: string;
  permissions: string[];
  groups: string[];
  immunity: number;
  serverGuids: string[];
};

export type PublicPlayerProfile = {
  steamId: string;
  displayName: string;
  points: number;
  leaderboardPosition: number;
  leaderboardTotal: number;
  playtimeSeconds: number;
  kills: number;
  deaths: number;
  headshots: number;
  noscopes: number;
  hitStats: HitboxStats;
  vipGroups: GroupMembership[];
  adminGroups: GroupMembership[];
  isBanned: boolean;
};

export type PortalTicket = {
  id: number;
  category: string;
  subject: string;
  body: string;
  status: string;
  createdAt: string;
  updatedAt: string;
  messages: CaseMessage[];
};

export type BanAppeal = {
  id: number;
  banId: number | null;
  ban: AppealBan | null;
  body: string;
  status: string;
  createdAt: string;
  updatedAt: string;
  messages: CaseMessage[];
};

export type AppealBan = {
  id: number;
  reason: string;
  adminSteamId: string | null;
  adminName: string;
  expiresAt: number;
  createdAt: number;
};

export type CaseAttachment = {
  id: number;
  fileName: string;
  contentType: string;
  createdAt: string;
};

export type CaseMessage = {
  id: number;
  authorType: "player" | "staff";
  authorId: string;
  body: string;
  createdAt: string;
  attachments: CaseAttachment[];
};

export type StaffAdmin = {
  id: number;
  steamId: string;
  username: string;
  groups: string[];
  permissions: string[];
  immunity: number;
  serverGuids: string[];
};

export type StaffVip = {
  steamId: string;
  accountId: string;
  name: string;
  group: string;
  expiresAt: number;
  serverId: number;
};

export type VipRosterEntry = StaffVip & {
  adminGroups: GroupMembership[];
};

export type VipRosterPage = {
  vips: VipRosterEntry[];
  total: number;
  page: number;
  pageSize: number;
};

export type StaffAppeal = BanAppeal & {
  steamId: string;
  closedBy: string | null;
  closedAt: string | null;
};

export type StaffTicket = PortalTicket & {
  steamId: string;
  closedBy: string | null;
  closedAt: string | null;
};

export type LeaderboardPlayer = {
  steamId: string;
  name: string;
  rank: number;
  points: number;
  kills: number;
  deaths: number;
  mvps: number;
  vipGroups: GroupMembership[];
  adminGroups: GroupMembership[];
};

export type LeaderboardPage = {
  players: LeaderboardPlayer[];
  total: number;
  page: number;
  pageSize: number;
};

export type StaffBan = {
  id: number;
  steamId: string;
  playerName: string;
  expiresAt: number;
  length: number;
  reason: string;
  adminSteamId: string;
  adminName: string;
  server: string;
  global: boolean;
  createdAt: number;
};

export type StaffSanction = {
  id: number;
  steamId: string;
  playerName: string;
  kind: "Gag" | "Mute";
  expiresAt: number;
  length: number;
  reason: string;
  adminSteamId: string | null;
  adminName: string;
  server: string;
  global: boolean;
  createdAt: number;
};

export type StaffModerationPage = {
  bans: StaffBan[];
  banTotal: number;
  sanctions: StaffSanction[];
  sanctionTotal: number;
  page: number;
  pageSize: number;
};

let gamePool: Pool | undefined;
let portalPool: Pool | undefined;
let mvpColumnPromise: Promise<string | null> | undefined;
let noscopeColumnPromise: Promise<string | null> | undefined;

function createPool(connectionUrl: string) {
  return mysql.createPool({
    uri: connectionUrl,
    connectionLimit: 5,
    enableKeepAlive: true,
    namedPlaceholders: false,
    // SteamID64 values exceed JavaScript's safe integer range. mysql2 must
    // return BIGINT columns as strings so IDs are never rounded to a nearby
    // account when rendered or sent to the server bridge.
    supportBigNumbers: true,
    bigNumberStrings: true,
  });
}

function getGamePool() {
  const connectionUrl = process.env.GAME_DATABASE_URL;
  if (!connectionUrl) return null;
  gamePool ??= createPool(connectionUrl);
  return gamePool;
}

function getPortalPool() {
  const connectionUrl = process.env.PORTAL_DATABASE_URL;
  if (!connectionUrl) return null;
  portalPool ??= createPool(connectionUrl);
  return portalPool;
}

function getAdminPool() {
  // Admins.Core, Admins.Bans and Admins.Comms all use the Swiftly game
  // database for this deployment. Keep portal reads and staff writes aligned.
  return getGamePool();
}

function toAccountId(steamId: string) {
  return (BigInt(steamId) - BigInt("76561197960265728")).toString();
}

function toGroups(value: unknown) {
  if (typeof value !== "string" || !value.trim()) return [];
  let groups: string[];
  try {
    const parsed = JSON.parse(value) as unknown;
    if (Array.isArray(parsed))
      groups = parsed.filter(
        (group): group is string => typeof group === "string",
      );
    else groups = [];
  } catch {
    // Legacy Swiftly group fields can be comma-separated strings.
    groups = value.split(",");
  }
  const unique = new Map<string, string>();
  for (const group of groups.map((group) => group.trim()).filter(Boolean)) {
    const groupKey = group.toLowerCase();
    if (!unique.has(groupKey)) unique.set(groupKey, group);
  }
  return [...unique.values()];
}

function toAdminMemberships(value: unknown): GroupMembership[] {
  return toGroups(value).map((name) => ({ name, expiresAt: null }));
}

function toVipMemberships(
  rows: Array<Pick<VipUserRow, "group" | "expires">>,
): GroupMembership[] {
  const memberships = new Map<string, GroupMembership>();
  for (const row of rows) {
    const name = normalizeVipGroup(String(row.group ?? ""));
    if (!name) continue;
    const expiresAt = Number(row.expires ?? 0);
    const groupKey = name.toLowerCase();
    const existing = memberships.get(groupKey);
    if (
      !existing ||
      (existing.expiresAt !== 0 &&
        (expiresAt === 0 || expiresAt > (existing.expiresAt ?? 0)))
    ) {
      memberships.set(groupKey, { name, expiresAt: expiresAt || 0 });
    }
  }
  return [...memberships.values()].sort((left, right) =>
    left.name.localeCompare(right.name),
  );
}

async function safeGameQuery<T extends RowDataPacket>(
  sql: string,
  values: unknown[],
) {
  const pool = getGamePool();
  if (!pool) return [] as T[];
  try {
    const [rows] = await pool.query<T[]>(sql, values);
    return rows;
  } catch {
    // Optional plugins may not have created every table yet. A failed optional
    // read should not make the player's whole dashboard unavailable.
    return [] as T[];
  }
}

async function safeAdminQuery<T extends RowDataPacket>(
  sql: string,
  values: unknown[],
) {
  return safeGameQuery<T>(sql, values);
}

function normalizeUnixTime(value: unknown) {
  const timestamp = Number(value ?? 0);
  return timestamp > 10_000_000_000 ? Math.floor(timestamp / 1_000) : timestamp;
}

function isSteamId(value: string) {
  return /^7656119\d{10}$/.test(value);
}

function toAppealBan(row: BanRow): AppealBan {
  const adminSteamId = String(row.AdminSteamId64 ?? "");
  return {
    id: Number(row.Id),
    reason: row.Reason,
    adminSteamId: isSteamId(adminSteamId) ? adminSteamId : null,
    adminName: row.AdminName || "Console",
    expiresAt: normalizeUnixTime(row.ExpiresAt),
    createdAt: normalizeUnixTime(row.CreatedAt),
  };
}

async function getAppealBans(banIds: Array<number | null>) {
  const ids = [
    ...new Set(
      banIds.filter(
        (id): id is number =>
          typeof id === "number" && Number.isSafeInteger(id) && id > 0,
      ),
    ),
  ];
  if (!ids.length) return new Map<number, AppealBan>();
  const rows = await safeAdminQuery<BanRow>(
    `SELECT Id, Reason, AdminSteamId64, AdminName, ExpiresAt, Length, CreatedAt FROM bans WHERE Id IN (${ids.map(() => "?").join(", ")})`,
    ids,
  );
  return new Map(
    rows.map((row) => {
      const ban = toAppealBan(row);
      return [ban.id, ban] as const;
    }),
  );
}

function emptyHitboxStats(): HitboxStats {
  return {
    totalHits: 0,
    healthDamage: 0,
    armorDamage: 0,
    head: 0,
    chest: 0,
    stomach: 0,
    leftArm: 0,
    rightArm: 0,
    leftLeg: 0,
    rightLeg: 0,
    neck: 0,
  };
}

function toHitboxStats(row: HitStatsRow | undefined): HitboxStats {
  if (!row) return emptyHitboxStats();
  const head = Number(row.Head ?? 0);
  const chest = Number(row.Chest ?? 0);
  const stomach = Number(row.Belly ?? 0);
  const leftArm = Number(row.LeftArm ?? 0);
  const rightArm = Number(row.RightArm ?? 0);
  const leftLeg = Number(row.LeftLeg ?? 0);
  const rightLeg = Number(row.RightLeg ?? 0);
  const neck = Number(row.Neak ?? 0);
  return {
    totalHits:
      head + chest + stomach + leftArm + rightArm + leftLeg + rightLeg + neck,
    healthDamage: Number(row.DmgHealth ?? 0),
    armorDamage: Number(row.DmgArmor ?? 0),
    head,
    chest,
    stomach,
    leftArm,
    rightArm,
    leftLeg,
    rightLeg,
    neck,
  };
}

async function getMvpColumn(pool: Pool) {
  mvpColumnPromise ??= (async () => {
    for (const candidate of ["mvps", "mvp"]) {
      try {
        await pool.query(`SELECT \`${candidate}\` FROM lvl_base LIMIT 1`);
        return candidate;
      } catch {
        // Some LevelRanks versions do not store MVPs. Try the other schema.
      }
    }
    return null;
  })();
  return mvpColumnPromise;
}

async function getNoscopeColumn(pool: Pool) {
  noscopeColumnPromise ??= (async () => {
    for (const candidate of ["noscopes", "noscope", "no_scopes"]) {
      try {
        await pool.query(`SELECT \`${candidate}\` FROM lvl_base LIMIT 1`);
        return candidate;
      } catch {
        // LevelRanks schemas have used more than one noscope column name.
      }
    }
    return null;
  })();
  return noscopeColumnPromise;
}

export function portalStorageConfigured() {
  return Boolean(process.env.PORTAL_DATABASE_URL);
}

export function gameStorageConfigured() {
  return Boolean(process.env.GAME_DATABASE_URL);
}

function asRecord(value: unknown): Record<string, unknown> | null {
  return typeof value === "object" && value !== null && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null;
}

function asInteger(value: unknown) {
  const number = typeof value === "number" ? value : Number(value);
  return Number.isSafeInteger(number) ? number : null;
}

function asText(value: unknown, fallback = "") {
  return typeof value === "string" && value.trim() ? value.trim() : fallback;
}

function asLoadoutTeam(value: unknown): LoadoutTeam | null {
  return value === "T" || value === "CT" ? value : null;
}

function parseLoadoutCatalogue(
  payload: unknown,
  syncedAt: Date,
): LoadoutCatalogue | null {
  let value = payload;
  if (Buffer.isBuffer(value)) value = value.toString("utf8");
  if (typeof value === "string") {
    try {
      value = JSON.parse(value) as unknown;
    } catch {
      return null;
    }
  }

  const snapshot = asRecord(value);
  if (
    !snapshot ||
    !Array.isArray(snapshot.items) ||
    !Array.isArray(snapshot.agents) ||
    !Array.isArray(snapshot.musicKits)
  )
    return null;

  const items: LoadoutItem[] = snapshot.items.flatMap((entry) => {
    const item = asRecord(entry);
    const category = item?.category;
    const definitionIndex = asInteger(item?.definitionIndex);
    const key = asText(item?.key);
    if (
      !item ||
      !key ||
      definitionIndex === null ||
      !["weapon", "knife", "glove"].includes(String(category))
    )
      return [];

    const paintkits: LoadoutPaintkit[] = Array.isArray(item.paintkits)
      ? item.paintkits.flatMap((paintkitEntry) => {
          const paintkit = asRecord(paintkitEntry);
          const paintkitIndex = asInteger(paintkit?.paintkit);
          const paintkitKey = asText(paintkit?.key);
          if (
            !paintkit ||
            !paintkitKey ||
            paintkitIndex === null ||
            paintkitIndex < 0
          )
            return [];
          return [
            {
              key: paintkitKey,
              displayName: asText(paintkit.displayName, paintkitKey),
              paintkit: paintkitIndex,
              rarity: asText(paintkit.rarity, "Standard"),
              color: asText(paintkit.color, "#ff7185"),
            },
          ];
        })
      : [];

    return [
      {
        key,
        displayName: asText(item.displayName, key),
        definitionIndex,
        category: category as LoadoutCategory,
        paintkits,
      },
    ];
  });

  const agents: LoadoutAgent[] = snapshot.agents.flatMap((entry) => {
    const agent = asRecord(entry);
    const agentIndex = asInteger(agent?.agentIndex);
    const team = asLoadoutTeam(agent?.team);
    const key = asText(agent?.key);
    if (!agent || !key || agentIndex === null || !team) return [];
    return [
      {
        key,
        displayName: asText(agent.displayName, key),
        agentIndex,
        team,
        rarity: asText(agent.rarity, "Standard"),
        color: asText(agent.color, "#ff7185"),
      },
    ];
  });

  const musicKits: LoadoutMusicKit[] = snapshot.musicKits.flatMap((entry) => {
    const musicKit = asRecord(entry);
    const musicKitIndex = asInteger(musicKit?.musicKitIndex);
    const key = asText(musicKit?.key);
    if (!musicKit || !key || musicKitIndex === null) return [];
    return [
      {
        key,
        displayName: asText(musicKit.displayName, key),
        musicKitIndex,
        rarity: asText(musicKit.rarity, "Standard"),
        color: asText(musicKit.color, "#ff7185"),
      },
    ];
  });

  const keychains: LoadoutKeychain[] = (
    Array.isArray(snapshot.keychains) ? snapshot.keychains : []
  ).flatMap((entry) => {
    const keychain = asRecord(entry);
    const keychainIndex = asInteger(keychain?.keychain);
    const key = asText(keychain?.key);
    if (!keychain || !key || keychainIndex === null || keychainIndex < 1)
      return [];
    return [
      {
        key,
        displayName: asText(keychain.displayName, key),
        keychain: keychainIndex,
        rarity: asText(keychain.rarity, "Standard"),
        color: asText(keychain.color, "#ff7185"),
      },
    ];
  });

  const stickers: LoadoutSticker[] = (
    Array.isArray(snapshot.stickers) ? snapshot.stickers : []
  ).flatMap((entry) => {
    const sticker = asRecord(entry);
    const stickerIndex = asInteger(sticker?.sticker);
    const key = asText(sticker?.key);
    if (!sticker || !key || stickerIndex === null || stickerIndex < 1)
      return [];
    return [
      {
        key,
        displayName: asText(sticker.displayName, key),
        sticker: stickerIndex,
        collection: asText(sticker.collection, "WeaponSkins"),
        rarity: asText(sticker.rarity, "Standard"),
        color: asText(sticker.color, "#ff7185"),
      },
    ];
  });

  return items.length
    ? {
        syncedAt: dateToIso(syncedAt),
        items: items.sort(
          (left, right) =>
            left.category.localeCompare(right.category) ||
            left.displayName.localeCompare(right.displayName),
        ),
        agents: agents.sort((left, right) =>
          left.displayName.localeCompare(right.displayName),
        ),
        musicKits: musicKits.sort((left, right) =>
          left.displayName.localeCompare(right.displayName),
        ),
        keychains: keychains.sort((left, right) =>
          left.displayName.localeCompare(right.displayName),
        ),
        stickers: stickers.sort(
          (left, right) =>
            left.collection.localeCompare(right.collection) ||
            left.displayName.localeCompare(right.displayName),
        ),
      }
    : null;
}

export async function getLoadoutCatalogue(): Promise<LoadoutCatalogue | null> {
  const pool = getPortalPool();
  if (!pool) return null;

  try {
    const [rows] = await pool.query<PortalLoadoutCatalogueRow[]>(
      "SELECT payload, synced_at FROM portal_loadout_catalogue WHERE id = 1 LIMIT 1",
    );
    const row = rows[0];
    return row ? parseLoadoutCatalogue(row.payload, row.synced_at) : null;
  } catch {
    return null;
  }
}

function teamFromStorage(value: unknown): LoadoutTeam {
  return Number(value) === 3 ? "CT" : "T";
}

function isWeaponDefinitionIndex(definitionIndex: number) {
  return (
    definitionIndex > 0 &&
    definitionIndex < 100 &&
    definitionIndex !== 42 &&
    definitionIndex !== 59
  );
}

export async function getPlayerLoadout(
  steamId: string,
  catalogue?: LoadoutCatalogue | null,
): Promise<PlayerLoadout> {
  const pool = getGamePool();
  const empty: PlayerLoadout = {
    sourceConnected: Boolean(pool),
    weapons: [],
    knives: [],
    gloves: [],
    agents: [],
    musicKitIndex: null,
  };
  if (!pool) return empty;

  const resolvedCatalogue = catalogue ?? (await getLoadoutCatalogue());
  const [skinRows, knifeRows, gloveRows, agentRows, musicRows] =
    await Promise.all([
      safeGameQuery<LoadoutSkinRow>(
        "SELECT weapon_team, weapon_defindex, weapon_paint_id, weapon_wear, weapon_seed FROM wp_player_skins WHERE steamid = ?",
        [steamId],
      ),
      safeGameQuery<LoadoutKnifeRow>(
        "SELECT weapon_team, knife FROM wp_player_knife WHERE steamid = ?",
        [steamId],
      ),
      safeGameQuery<LoadoutGloveRow>(
        "SELECT weapon_team, weapon_defindex FROM wp_player_gloves WHERE steamid = ?",
        [steamId],
      ),
      safeGameQuery<LoadoutAgentRow>(
        "SELECT weapon_team, agent_index FROM wp_player_agents WHERE steamid = ?",
        [steamId],
      ),
      safeGameQuery<LoadoutMusicRow>(
        "SELECT music_id FROM wp_player_music WHERE steamid = ?",
        [steamId],
      ),
    ]);

  const skins = skinRows.map((row) => ({
    team: teamFromStorage(row.weapon_team),
    definitionIndex: Number(row.weapon_defindex),
    paintkit: Number(row.weapon_paint_id),
    seed: Number(row.weapon_seed ?? 0),
    wear: Number(row.weapon_wear ?? 0),
  }));
  const skinByItem = new Map(
    skins.map((skin) => [`${skin.team}:${skin.definitionIndex}`, skin]),
  );

  const knives = knifeRows.map((row) => {
    const team = teamFromStorage(row.weapon_team);
    const key = String(row.knife || "").trim();
    const item = resolvedCatalogue?.items.find(
      (candidate) =>
        candidate.category === "knife" &&
        candidate.key.toLowerCase() === key.toLowerCase(),
    );
    const saved = item
      ? skinByItem.get(`${team}:${item.definitionIndex}`)
      : undefined;
    const savedKey = item?.key ?? (key || null);
    return saved
      ? { ...saved, key: savedKey }
      : {
          team,
          definitionIndex: item?.definitionIndex ?? 0,
          paintkit: 0,
          seed: 0,
          wear: 0,
          key: savedKey,
        };
  });

  const gloves = gloveRows.map((row) => {
    const team = teamFromStorage(row.weapon_team);
    const definitionIndex = Number(row.weapon_defindex);
    const saved = skinByItem.get(`${team}:${definitionIndex}`);
    return saved ?? { team, definitionIndex, paintkit: 0, seed: 0, wear: 0 };
  });

  return {
    ...empty,
    weapons: skins.filter((skin) =>
      isWeaponDefinitionIndex(skin.definitionIndex),
    ),
    knives,
    gloves,
    agents: agentRows.map((row) => ({
      team: teamFromStorage(row.weapon_team),
      agentIndex: Number(row.agent_index),
    })),
    musicKitIndex: musicRows[0] ? Number(musicRows[0].music_id) : null,
  };
}

export async function getAdminAuthorization(
  steamId: string,
): Promise<AdminAuthorization | null> {
  const rows = await safeAdminQuery<AdminAuthorizationRow>(
    "SELECT SteamId64, Username, Permissions, Groups, Immunity, Servers FROM admins WHERE SteamId64 = ? LIMIT 1",
    [steamId],
  );
  const admin = rows[0];
  if (!admin) return null;

  return {
    steamId: String(admin.SteamId64),
    username: admin.Username || `Steam ${steamId}`,
    permissions: toGroups(admin.Permissions),
    groups: toGroups(admin.Groups),
    immunity: Number(admin.Immunity ?? 0),
    serverGuids: toGroups(admin.Servers),
  };
}

async function getLeaderboardPosition(steamId: string) {
  const rows = await safeGameQuery<CountRow>(
    `SELECT COUNT(*) + 1 AS total
     FROM lvl_base AS candidate
     INNER JOIN lvl_base AS subject ON subject.steam = ?
     WHERE candidate.steam <> subject.steam
       AND (
         candidate.value > subject.value
         OR (candidate.value = subject.value AND candidate.kills > subject.kills)
         OR (candidate.value = subject.value AND candidate.kills = subject.kills AND candidate.deaths < subject.deaths)
         OR (candidate.value = subject.value AND candidate.kills = subject.kills AND candidate.deaths = subject.deaths AND candidate.steam < subject.steam)
       )`,
    [steamId],
  );
  return Number(rows[0]?.total ?? 1);
}

async function getLeaderboardTotal() {
  const rows = await safeGameQuery<CountRow>(
    "SELECT COUNT(*) AS total FROM lvl_base",
    [],
  );
  return Number(rows[0]?.total ?? 0);
}

export async function getPlayerDashboard(
  steamId: string,
): Promise<PlayerDashboard> {
  const pool = getGamePool();
  const empty: PlayerDashboard = {
    sourceConnected: Boolean(pool),
    hasGameRecord: false,
    displayName: null,
    points: 0,
    rank: 0,
    leaderboardPosition: null,
    leaderboardTotal: 0,
    playtimeSeconds: 0,
    kills: 0,
    deaths: 0,
    headshots: 0,
    noscopes: 0,
    hitStats: emptyHitboxStats(),
    gamesPlayed: 0,
    gameWins: 0,
    gameLosses: 0,
    vipGroups: [],
    adminGroups: [],
    bans: [],
    sanctions: [],
    kickHistoryAvailable: false,
    skinSummary: { skins: 0, knives: 0, gloves: 0, agents: 0, musicKits: 0 },
  };
  if (!pool) return empty;

  const noscopeColumn = await getNoscopeColumn(pool);
  const noscopeSelection = noscopeColumn
    ? `\`${noscopeColumn}\` AS noscopes`
    : "0 AS noscopes";
  const [
    stats,
    vipRows,
    adminRows,
    banRows,
    sanctionRows,
    skinRows,
    knifeRows,
    gloveRows,
    agentRows,
    musicRows,
    hitRows,
  ] = await Promise.all([
    safeGameQuery<StatRow>(
      `SELECT name, value, rank, kills, deaths, headshots, ${noscopeSelection}, playtime, game_wins, game_losses, games_played FROM lvl_base WHERE steam = ? LIMIT 1`,
      [steamId],
    ),
    safeGameQuery<VipUserRow>(
      "SELECT account_id, name, lastvisit, sid, `group`, expires FROM vip_users WHERE account_id = ? AND sid = ? AND (expires = 0 OR expires > UNIX_TIMESTAMP()) ORDER BY `group`",
      [toAccountId(steamId), getVipServerId()],
    ),
    safeAdminQuery<RowDataPacket & { Groups: string }>(
      "SELECT Groups FROM admins WHERE SteamId64 = ? LIMIT 1",
      [steamId],
    ),
    safeAdminQuery<BanRow>(
      "SELECT Id, Reason, AdminSteamId64, AdminName, Server, ExpiresAt, Length, CreatedAt FROM bans WHERE SteamId64 = ? ORDER BY CreatedAt DESC LIMIT 25",
      [steamId],
    ),
    safeAdminQuery<SanctionRow>(
      "SELECT Id, SanctionKind, Reason, AdminSteamId64, AdminName, ExpiresAt, Length, CreatedAt FROM sanctions WHERE SteamId64 = ? ORDER BY CreatedAt DESC LIMIT 25",
      [steamId],
    ),
    safeGameQuery<RowDataPacket & { total: number }>(
      "SELECT COUNT(*) AS total FROM wp_player_skins WHERE steamid = ? AND weapon_defindex > 0 AND weapon_defindex < 100 AND weapon_defindex NOT IN (42, 59)",
      [steamId],
    ),
    safeGameQuery<RowDataPacket & { total: number }>(
      "SELECT COUNT(*) AS total FROM wp_player_knife WHERE steamid = ?",
      [steamId],
    ),
    safeGameQuery<RowDataPacket & { total: number }>(
      "SELECT COUNT(*) AS total FROM wp_player_gloves WHERE steamid = ?",
      [steamId],
    ),
    safeGameQuery<RowDataPacket & { total: number }>(
      "SELECT COUNT(*) AS total FROM wp_player_agents WHERE steamid = ?",
      [steamId],
    ),
    safeGameQuery<RowDataPacket & { total: number }>(
      "SELECT COUNT(DISTINCT music_id) AS total FROM wp_player_music WHERE steamid = ?",
      [steamId],
    ),
    safeGameQuery<HitStatsRow>(
      "SELECT DmgHealth, DmgArmor, Head, Chest, Belly, LeftArm, RightArm, LeftLeg, RightLeg, Neak FROM lvl_base_hits WHERE SteamID = ? LIMIT 1",
      [steamId],
    ),
  ]);

  const player = stats[0];
  const [leaderboardPosition, leaderboardTotal] = player
    ? await Promise.all([
        getLeaderboardPosition(steamId),
        getLeaderboardTotal(),
      ])
    : [null, 0];

  return {
    ...empty,
    hasGameRecord: Boolean(player),
    displayName: player?.name ?? null,
    points: Number(player?.value ?? 0),
    rank: Number(player?.rank ?? 0),
    leaderboardPosition,
    leaderboardTotal,
    playtimeSeconds: Number(player?.playtime ?? 0),
    kills: Number(player?.kills ?? 0),
    deaths: Number(player?.deaths ?? 0),
    headshots: Number(player?.headshots ?? 0),
    noscopes: Number(player?.noscopes ?? 0),
    hitStats: toHitboxStats(hitRows[0]),
    gamesPlayed: Number(player?.games_played ?? 0),
    gameWins: Number(player?.game_wins ?? 0),
    gameLosses: Number(player?.game_losses ?? 0),
    vipGroups: toVipMemberships(vipRows),
    adminGroups: toAdminMemberships(adminRows[0]?.Groups),
    bans: banRows.map((row) => ({
      id: Number(row.Id),
      reason: row.Reason,
      adminSteamId: isSteamId(String(row.AdminSteamId64))
        ? String(row.AdminSteamId64)
        : null,
      adminName: row.AdminName,
      expiresAt: normalizeUnixTime(row.ExpiresAt),
      length: Number(row.Length),
      createdAt: normalizeUnixTime(row.CreatedAt),
    })),
    sanctions: sanctionRows.map((row) => ({
      id: Number(row.Id),
      reason: row.Reason,
      adminSteamId: isSteamId(String(row.AdminSteamId64))
        ? String(row.AdminSteamId64)
        : null,
      adminName: row.AdminName,
      expiresAt: normalizeUnixTime(row.ExpiresAt),
      length: Number(row.Length),
      createdAt: normalizeUnixTime(row.CreatedAt),
      kind: row.SanctionKind === 1 ? "Gag" : "Mute",
    })),
    skinSummary: {
      skins: Number(skinRows[0]?.total ?? 0),
      knives: Number(knifeRows[0]?.total ?? 0),
      gloves: Number(gloveRows[0]?.total ?? 0),
      agents: Number(agentRows[0]?.total ?? 0),
      musicKits: Number(musicRows[0]?.total ?? 0),
    },
  };
}

export async function getPublicPlayerProfile(
  steamId: string,
): Promise<PublicPlayerProfile | null> {
  const pool = getGamePool();
  if (!pool) return null;

  const noscopeColumn = await getNoscopeColumn(pool);
  const noscopeSelection = noscopeColumn
    ? `\`${noscopeColumn}\` AS noscopes`
    : "0 AS noscopes";
  const [rows, vipRows, adminRows, banRows, hitRows] = await Promise.all([
    safeGameQuery<StatRow>(
      `SELECT name, value, rank, kills, deaths, headshots, ${noscopeSelection}, playtime, game_wins, game_losses, games_played FROM lvl_base WHERE steam = ? LIMIT 1`,
      [steamId],
    ),
    safeGameQuery<VipUserRow>(
      "SELECT account_id, name, lastvisit, sid, `group`, expires FROM vip_users WHERE account_id = ? AND sid = ? AND (expires = 0 OR expires > UNIX_TIMESTAMP()) ORDER BY `group`",
      [toAccountId(steamId), getVipServerId()],
    ),
    safeAdminQuery<RowDataPacket & { Groups: string }>(
      "SELECT Groups FROM admins WHERE SteamId64 = ? LIMIT 1",
      [steamId],
    ),
    safeAdminQuery<RowDataPacket & { ExpiresAt: number }>(
      "SELECT ExpiresAt FROM bans WHERE SteamId64 = ? ORDER BY CreatedAt DESC LIMIT 25",
      [steamId],
    ),
    safeGameQuery<HitStatsRow>(
      "SELECT DmgHealth, DmgArmor, Head, Chest, Belly, LeftArm, RightArm, LeftLeg, RightLeg, Neak FROM lvl_base_hits WHERE SteamID = ? LIMIT 1",
      [steamId],
    ),
  ]);
  const player = rows[0];
  if (!player) return null;
  const isBanned = banRows.some((ban) => {
    const expiresAt = normalizeUnixTime(ban.ExpiresAt);
    return expiresAt === 0 || expiresAt > Math.floor(Date.now() / 1_000);
  });

  const [leaderboardPosition, leaderboardTotal] = await Promise.all([
    getLeaderboardPosition(steamId),
    getLeaderboardTotal(),
  ]);

  return {
    steamId,
    displayName: player.name || "Unknown player",
    points: Number(player.value ?? 0),
    leaderboardPosition,
    leaderboardTotal,
    playtimeSeconds: Number(player.playtime ?? 0),
    kills: Number(player.kills ?? 0),
    deaths: Number(player.deaths ?? 0),
    headshots: Number(player.headshots ?? 0),
    noscopes: Number(player.noscopes ?? 0),
    hitStats: toHitboxStats(hitRows[0]),
    vipGroups: toVipMemberships(vipRows),
    adminGroups: toAdminMemberships(adminRows[0]?.Groups),
    isBanned,
  };
}

async function getGroupMembershipsForPlayers(steamIds: string[]) {
  const uniqueSteamIds = [
    ...new Set(steamIds.filter((steamId) => /^7656119\d{10}$/.test(steamId))),
  ];
  const result = new Map<
    string,
    { vipGroups: GroupMembership[]; adminGroups: GroupMembership[] }
  >();
  if (!uniqueSteamIds.length) return result;

  const accountIds = uniqueSteamIds.map(toAccountId);
  const accountPlaceholders = accountIds.map(() => "?").join(", ");
  const steamPlaceholders = uniqueSteamIds.map(() => "?").join(", ");
  const [vipRows, adminRows] = await Promise.all([
    safeGameQuery<VipUserRow>(
      `SELECT account_id, name, lastvisit, sid, \`group\`, expires FROM vip_users WHERE sid = ? AND (expires = 0 OR expires > UNIX_TIMESTAMP()) AND account_id IN (${accountPlaceholders})`,
      [getVipServerId(), ...accountIds],
    ),
    safeAdminQuery<AdminListRow>(
      `SELECT Id, SteamId64, Username, Permissions, Groups, Immunity, Servers FROM admins WHERE SteamId64 IN (${steamPlaceholders})`,
      uniqueSteamIds,
    ),
  ]);

  for (const steamId of uniqueSteamIds)
    result.set(steamId, { vipGroups: [], adminGroups: [] });
  for (const steamId of uniqueSteamIds) {
    const accountId = toAccountId(steamId);
    result.set(steamId, {
      vipGroups: toVipMemberships(
        vipRows.filter((row) => String(row.account_id) === accountId),
      ),
      adminGroups: toAdminMemberships(
        adminRows.find((row) => String(row.SteamId64) === steamId)?.Groups,
      ),
    });
  }
  return result;
}

function leaderboardFilter(query: string) {
  const search = query.trim().slice(0, 64);
  if (!search) return { sql: "", values: [] as unknown[] };
  const pattern = `%${search}%`;
  return {
    sql: "WHERE name LIKE ? OR CAST(steam AS CHAR) LIKE ?",
    values: [pattern, pattern],
  };
}

export async function getLeaderboard(
  pageInput: number,
  pageSize = 25,
  query = "",
): Promise<LeaderboardPage> {
  const pool = getGamePool();
  const page = Math.max(
    1,
    Number.isFinite(pageInput) ? Math.floor(pageInput) : 1,
  );
  if (!pool) return { players: [], total: 0, page, pageSize };

  const mvpColumn = await getMvpColumn(pool);
  const mvpSelection = mvpColumn ? `\`${mvpColumn}\` AS mvps` : "0 AS mvps";
  const offset = (page - 1) * pageSize;
  const filter = leaderboardFilter(query);
  const [totalRows, rows] = await Promise.all([
    safeGameQuery<CountRow>(
      `SELECT COUNT(*) AS total FROM lvl_base ${filter.sql}`,
      filter.values,
    ),
    safeGameQuery<LeaderboardRow>(
      `SELECT steam, name, rank, value, kills, deaths, ${mvpSelection} FROM lvl_base ${filter.sql} ORDER BY value DESC, kills DESC, deaths ASC, steam ASC LIMIT ? OFFSET ?`,
      [...filter.values, pageSize, offset],
    ),
  ]);
  const groupMemberships = await getGroupMembershipsForPlayers(
    rows.map((row) => String(row.steam)),
  );

  return {
    players: rows.map((row) => ({
      steamId: String(row.steam),
      name: row.name || "Unknown player",
      rank: Number(row.rank),
      points: Number(row.value),
      kills: Number(row.kills),
      deaths: Number(row.deaths),
      mvps: Number(row.mvps),
      vipGroups: groupMemberships.get(String(row.steam))?.vipGroups ?? [],
      adminGroups: groupMemberships.get(String(row.steam))?.adminGroups ?? [],
    })),
    total: Number(totalRows[0]?.total ?? 0),
    page,
    pageSize,
  };
}

function moderationFilter(query: string) {
  const search = query.trim().slice(0, 64);
  if (!search) return { sql: "", values: [] as unknown[] };
  const pattern = `%${search}%`;
  return {
    sql: "WHERE PlayerName LIKE ? OR CAST(SteamId64 AS CHAR) LIKE ?",
    values: [pattern, pattern],
  };
}

export async function getStaffModeration(
  pageInput: number,
  query = "",
  pageSize = 25,
): Promise<StaffModerationPage> {
  const page = Math.max(
    1,
    Number.isFinite(pageInput) ? Math.floor(pageInput) : 1,
  );
  const offset = (page - 1) * pageSize;
  const filter = moderationFilter(query);
  const [banCount, bans, sanctionCount, sanctions] = await Promise.all([
    safeGameQuery<CountRow>(
      `SELECT COUNT(*) AS total FROM bans ${filter.sql}`,
      filter.values,
    ),
    safeGameQuery<StaffBanRow>(
      `SELECT Id, SteamId64, PlayerName, ExpiresAt, Length, Reason, AdminSteamId64, AdminName, Server, GlobalBan, CreatedAt FROM bans ${filter.sql} ORDER BY CreatedAt DESC LIMIT ? OFFSET ?`,
      [...filter.values, pageSize, offset],
    ),
    safeGameQuery<CountRow>(
      `SELECT COUNT(*) AS total FROM sanctions ${filter.sql}`,
      filter.values,
    ),
    safeGameQuery<StaffSanctionRow>(
      `SELECT Id, SteamId64, PlayerName, SanctionKind, ExpiresAt, Length, Reason, AdminSteamId64, AdminName, Server, GlobalSanction, CreatedAt FROM sanctions ${filter.sql} ORDER BY CreatedAt DESC LIMIT ? OFFSET ?`,
      [...filter.values, pageSize, offset],
    ),
  ]);

  return {
    bans: bans.map((row) => ({
      id: Number(row.Id),
      steamId: String(row.SteamId64),
      playerName: row.PlayerName || "Unknown player",
      expiresAt: normalizeUnixTime(row.ExpiresAt),
      length: Number(row.Length),
      reason: row.Reason,
      adminSteamId: String(row.AdminSteamId64),
      adminName: row.AdminName || "Console",
      server: row.Server,
      global: Boolean(row.GlobalBan),
      createdAt: normalizeUnixTime(row.CreatedAt),
    })),
    banTotal: Number(banCount[0]?.total ?? 0),
    sanctions: sanctions.map((row) => ({
      id: Number(row.Id),
      steamId: String(row.SteamId64),
      playerName: row.PlayerName || "Unknown player",
      kind: row.SanctionKind === 1 ? "Gag" : "Mute",
      expiresAt: normalizeUnixTime(row.ExpiresAt),
      length: Number(row.Length),
      reason: row.Reason,
      adminSteamId: isSteamId(String(row.AdminSteamId64))
        ? String(row.AdminSteamId64)
        : null,
      adminName: row.AdminName || "Console",
      server: row.Server,
      global: Boolean(row.GlobalSanction),
      createdAt: normalizeUnixTime(row.CreatedAt),
    })),
    sanctionTotal: Number(sanctionCount[0]?.total ?? 0),
    page,
    pageSize,
  };
}

export async function getStaffAdmins(): Promise<StaffAdmin[]> {
  const rows = await safeAdminQuery<AdminListRow>(
    "SELECT Id, SteamId64, Username, Permissions, Groups, Immunity, Servers FROM admins ORDER BY Immunity DESC, Username ASC",
    [],
  );

  return rows.map((row) => ({
    id: Number(row.Id),
    steamId: String(row.SteamId64),
    username: row.Username || `Steam ${row.SteamId64}`,
    groups: toGroups(row.Groups),
    permissions: toGroups(row.Permissions),
    immunity: Number(row.Immunity ?? 0),
    serverGuids: toGroups(row.Servers),
  }));
}

const steamIdBase = BigInt("76561197960265728");

function vipAccountToSteamId(accountId: string) {
  const value = BigInt(accountId);
  return (value >= steamIdBase ? value : value + steamIdBase).toString();
}

function getVipServerId() {
  const configured = Number.parseInt(process.env.GAME_VIP_SERVER_ID ?? "1", 10);
  return Number.isSafeInteger(configured) && configured >= 0 ? configured : 1;
}

export async function getStaffVips(): Promise<StaffVip[]> {
  const rows = await safeGameQuery<VipUserRow>(
    "SELECT account_id, MAX(name) AS name, MAX(lastvisit) AS lastvisit, sid, `group`, CASE WHEN SUM(expires = 0) > 0 THEN 0 ELSE MAX(expires) END AS expires FROM vip_users WHERE sid = ? GROUP BY account_id, sid, `group` ORDER BY `group` ASC, name ASC",
    [getVipServerId()],
  );
  return rows.map((row) => ({
    steamId: vipAccountToSteamId(String(row.account_id)),
    accountId: String(row.account_id),
    name: row.name || "Unknown player",
    group: row.group,
    expiresAt: Number(row.expires ?? 0),
    serverId: Number(row.sid ?? 0),
  }));
}

export async function getVipRoster(
  pageInput: number,
  pageSize = 25,
): Promise<VipRosterPage> {
  const pool = getGamePool();
  const page = clampStaffPage(pageInput);
  if (!pool) return { vips: [], total: 0, page, pageSize };

  const now = Math.floor(Date.now() / 1_000);
  const offset = (page - 1) * pageSize;
  try {
    const [[countRows], [rows]] = await Promise.all([
      pool.query<CountRow[]>(
        "SELECT COUNT(*) AS total FROM (SELECT account_id, `group` FROM vip_users WHERE sid = ? AND (`group` IS NOT NULL) AND (expires = 0 OR expires > ?) GROUP BY account_id, `group`) AS unique_vips",
        [getVipServerId(), now],
      ),
      pool.query<VipUserRow[]>(
        "SELECT account_id, MAX(name) AS name, MAX(lastvisit) AS lastvisit, sid, `group`, CASE WHEN SUM(expires = 0) > 0 THEN 0 ELSE MAX(expires) END AS expires FROM vip_users WHERE sid = ? AND (`group` IS NOT NULL) AND (expires = 0 OR expires > ?) GROUP BY account_id, sid, `group` ORDER BY FIELD(`group`, 'ULTIMATE', 'DIAMOND', 'GOLD', 'SILVER', 'STANDARD'), name ASC LIMIT ? OFFSET ?",
        [getVipServerId(), now, pageSize, offset],
      ),
    ]);
    const vips = rows.map((row) => ({
      steamId: vipAccountToSteamId(String(row.account_id)),
      accountId: String(row.account_id),
      name: row.name || "Unknown player",
      group: row.group,
      expiresAt: Number(row.expires ?? 0),
      serverId: Number(row.sid ?? 0),
    }));
    const memberships = await getGroupMembershipsForPlayers(
      vips.map((vip) => vip.steamId),
    );
    return {
      vips: vips.map((vip) => ({
        ...vip,
        adminGroups: memberships.get(vip.steamId)?.adminGroups ?? [],
      })),
      total: Number(countRows[0]?.total ?? 0),
      page,
      pageSize,
    };
  } catch {
    return { vips: [], total: 0, page, pageSize };
  }
}

function clampStaffPage(value: number) {
  return Math.max(1, Number.isFinite(value) ? Math.floor(value) : 1);
}

async function getCaseAttachments(
  pool: Pool,
  caseType: "appeal" | "ticket",
  caseId: number,
) {
  try {
    const [rows] = await pool.query<CaseAttachmentRow[]>(
      "SELECT id, case_type, case_id, message_id, file_name, content_type, created_at FROM portal_case_attachments WHERE case_type = ? AND case_id = ? ORDER BY id ASC",
      [caseType, caseId],
    );
    return rows;
  } catch {
    return [] as CaseAttachmentRow[];
  }
}

async function getCaseMessages(
  pool: Pool,
  caseType: "appeal" | "ticket",
  caseId: number,
): Promise<CaseMessage[]> {
  const table =
    caseType === "appeal" ? "portal_appeal_messages" : "portal_ticket_messages";
  const foreignKey = caseType === "appeal" ? "appeal_id" : "ticket_id";
  try {
    const [[rows], attachments] = await Promise.all([
      pool.query<CaseMessageRow[]>(
        `SELECT id, author_type, author_id, body, created_at FROM ${table} WHERE ${foreignKey} = ? ORDER BY id ASC`,
        [caseId],
      ),
      getCaseAttachments(pool, caseType, caseId),
    ]);
    return rows.map((row) => ({
      id: Number(row.id),
      authorType: row.author_type === "staff" ? "staff" : "player",
      authorId: String(row.author_id),
      body: row.body,
      createdAt: dateToIso(row.created_at),
      attachments: attachments
        .filter(
          (attachment) => Number(attachment.message_id) === Number(row.id),
        )
        .map((attachment) => ({
          id: Number(attachment.id),
          fileName: attachment.file_name,
          contentType: attachment.content_type,
          createdAt: dateToIso(attachment.created_at),
        })),
    }));
  } catch {
    return [];
  }
}

export async function getStaffAppeals(pageInput: number, pageSize = 25) {
  const pool = getPortalPool();
  const page = clampStaffPage(pageInput);
  if (!pool) return { appeals: [] as StaffAppeal[], total: 0, page, pageSize };
  try {
    const offset = (page - 1) * pageSize;
    const [[countRows], [rows]] = await Promise.all([
      pool.query<CountRow[]>(
        "SELECT COUNT(*) AS total FROM portal_ban_appeals",
      ),
      pool.query<StaffAppealRow[]>(
        "SELECT id, steam_id, ban_id, body, status, created_at, updated_at, closed_by, closed_at FROM portal_ban_appeals ORDER BY updated_at DESC LIMIT ? OFFSET ?",
        [pageSize, offset],
      ),
    ]);
    const appealBans = await getAppealBans(
      rows.map((row) => (row.ban_id == null ? null : Number(row.ban_id))),
    );
    const appeals = await Promise.all(
      rows.map(async (row) => ({
        id: Number(row.id),
        steamId: String(row.steam_id),
        banId: row.ban_id == null ? null : Number(row.ban_id),
        body: row.body,
        ban:
          row.ban_id == null
            ? null
            : (appealBans.get(Number(row.ban_id)) ?? null),
        status: row.status,
        createdAt: dateToIso(row.created_at),
        updatedAt: dateToIso(row.updated_at),
        closedBy: row.closed_by ? String(row.closed_by) : null,
        closedAt: row.closed_at ? dateToIso(row.closed_at) : null,
        messages: await getCaseMessages(pool, "appeal", Number(row.id)),
      })),
    );
    return { appeals, total: Number(countRows[0]?.total ?? 0), page, pageSize };
  } catch {
    return { appeals: [] as StaffAppeal[], total: 0, page, pageSize };
  }
}

export async function getStaffTickets(pageInput: number, pageSize = 25) {
  const pool = getPortalPool();
  const page = clampStaffPage(pageInput);
  if (!pool) return { tickets: [] as StaffTicket[], total: 0, page, pageSize };
  try {
    const offset = (page - 1) * pageSize;
    const [[countRows], [rows]] = await Promise.all([
      pool.query<CountRow[]>("SELECT COUNT(*) AS total FROM portal_tickets"),
      pool.query<StaffTicketRow[]>(
        "SELECT id, steam_id, category, subject, body, status, created_at, updated_at, closed_by, closed_at FROM portal_tickets ORDER BY updated_at DESC LIMIT ? OFFSET ?",
        [pageSize, offset],
      ),
    ]);
    const tickets = await Promise.all(
      rows.map(async (row) => ({
        id: Number(row.id),
        steamId: String(row.steam_id),
        category: row.category,
        subject: row.subject,
        body: row.body,
        status: row.status,
        createdAt: dateToIso(row.created_at),
        updatedAt: dateToIso(row.updated_at),
        closedBy: row.closed_by ? String(row.closed_by) : null,
        closedAt: row.closed_at ? dateToIso(row.closed_at) : null,
        messages: await getCaseMessages(pool, "ticket", Number(row.id)),
      })),
    );
    return { tickets, total: Number(countRows[0]?.total ?? 0), page, pageSize };
  } catch {
    return { tickets: [] as StaffTicket[], total: 0, page, pageSize };
  }
}

export async function enqueueStaffBan(input: {
  steamId: string;
  playerName: string;
  durationMinutes: number;
  reason: string;
  actorSteamId: string;
  actorName: string;
  serverGuid: string;
}) {
  return enqueuePortalBridgeEvent("moderation.ban", input.steamId, input);
}

export async function enqueueStaffUnban(input: {
  steamId: string;
  actorSteamId: string;
  actorName: string;
}) {
  return enqueuePortalBridgeEvent("moderation.unban", input.steamId, input);
}

export async function enqueuePortalBridgeEvent(
  eventType: PortalBridgeEvent,
  targetSteamId: string | null,
  payload: object,
) {
  const pool = getPortalPool();
  if (!pool) throw new Error("Portal bridge storage is not configured.");

  const [result] = await pool.execute<ResultSetHeader>(
    "INSERT INTO portal_outbox (event_type, target_steam_id, payload) VALUES (?, ?, ?)",
    [eventType, targetSteamId, JSON.stringify(payload)],
  );
  return Number(result.insertId);
}

function dateToIso(value: Date) {
  return value instanceof Date
    ? value.toISOString()
    : new Date(value).toISOString();
}

export async function ensurePortalAccount(steamId: string) {
  const pool = getPortalPool();
  if (!pool) return;
  await pool.execute(
    "INSERT INTO portal_steam_accounts (steam_id) VALUES (?) ON DUPLICATE KEY UPDATE updated_at = CURRENT_TIMESTAMP",
    [steamId],
  );
}

export async function createPortalSession(input: {
  tokenHash: string;
  steamId: string;
  expiresAt: number;
}) {
  const pool = getPortalPool();
  if (!pool) throw new Error("Portal session storage is not configured.");

  await pool.execute(
    "INSERT INTO portal_steam_accounts (steam_id) VALUES (?) ON DUPLICATE KEY UPDATE updated_at = CURRENT_TIMESTAMP",
    [input.steamId],
  );
  await pool.execute("DELETE FROM portal_sessions WHERE expires_at <= ?", [
    Date.now(),
  ]);
  await pool.execute(
    "INSERT INTO portal_sessions (token_hash, steam_id, expires_at) VALUES (?, ?, ?)",
    [input.tokenHash, input.steamId, input.expiresAt],
  );
}

export async function getPortalSession(tokenHash: string) {
  const pool = getPortalPool();
  if (!pool) return null;

  try {
    const [rows] = await pool.query<PortalSessionRow[]>(
      "SELECT steam_id, expires_at FROM portal_sessions WHERE token_hash = ? AND expires_at > ? LIMIT 1",
      [tokenHash, Date.now()],
    );
    const session = rows[0];
    if (!session || !/^7656119\d{10}$/.test(session.steam_id)) return null;

    await pool.execute(
      "UPDATE portal_sessions SET last_seen_at = CURRENT_TIMESTAMP WHERE token_hash = ?",
      [tokenHash],
    );
    return { steamId: session.steam_id, expiresAt: Number(session.expires_at) };
  } catch {
    return null;
  }
}

export async function revokePortalSession(tokenHash: string) {
  const pool = getPortalPool();
  if (!pool) return;
  try {
    await pool.execute("DELETE FROM portal_sessions WHERE token_hash = ?", [
      tokenHash,
    ]);
  } catch {
    // Clearing the browser cookie still ends the session locally if storage is unavailable.
  }
}

export async function getTickets(steamId: string): Promise<PortalTicket[]> {
  const pool = getPortalPool();
  if (!pool) return [];
  try {
    const [rows] = await pool.query<TicketRow[]>(
      "SELECT id, category, subject, body, status, created_at, updated_at FROM portal_tickets WHERE steam_id = ? ORDER BY updated_at DESC",
      [steamId],
    );
    return Promise.all(
      rows.map(async (row) => ({
        id: Number(row.id),
        category: row.category,
        subject: row.subject,
        body: row.body,
        status: row.status,
        createdAt: dateToIso(row.created_at),
        updatedAt: dateToIso(row.updated_at),
        messages: await getCaseMessages(pool, "ticket", Number(row.id)),
      })),
    );
  } catch {
    return [];
  }
}

export async function getAppeals(steamId: string): Promise<BanAppeal[]> {
  const pool = getPortalPool();
  if (!pool) return [];
  try {
    const [rows] = await pool.query<AppealRow[]>(
      "SELECT id, ban_id, body, status, created_at, updated_at FROM portal_ban_appeals WHERE steam_id = ? ORDER BY updated_at DESC",
      [steamId],
    );
    const appealBans = await getAppealBans(
      rows.map((row) => (row.ban_id == null ? null : Number(row.ban_id))),
    );
    return Promise.all(
      rows.map(async (row) => ({
        id: row.id,
        banId: row.ban_id,
        body: row.body,
        status: row.status,
        ban:
          row.ban_id == null
            ? null
            : (appealBans.get(Number(row.ban_id)) ?? null),
        createdAt: dateToIso(row.created_at),
        updatedAt: dateToIso(row.updated_at),
        messages: await getCaseMessages(pool, "appeal", Number(row.id)),
      })),
    );
  } catch {
    return [];
  }
}

export async function getAppealEligibility(
  steamId: string,
  banId: number | null,
) {
  const pool = getPortalPool();
  if (!pool) return { eligible: true, eligibleAt: null as string | null };
  try {
    const [rows] = await pool.query<AppealEligibilityRow[]>(
      "SELECT COALESCE(closed_at, updated_at) AS decision_at FROM portal_ban_appeals WHERE steam_id = ? AND ban_id <=> ? AND status = 'closed-banned' ORDER BY COALESCE(closed_at, updated_at) DESC LIMIT 1",
      [steamId, banId],
    );
    const decisionAt = rows[0]?.decision_at;
    if (!decisionAt)
      return { eligible: true, eligibleAt: null as string | null };
    const eligibleAt =
      new Date(decisionAt).getTime() + 7 * 24 * 60 * 60 * 1_000;
    return {
      eligible: Date.now() >= eligibleAt,
      eligibleAt: new Date(eligibleAt).toISOString(),
    };
  } catch {
    // A portal schema that has not been migrated must not accidentally lock a player out.
    return { eligible: true, eligibleAt: null as string | null };
  }
}

async function writeAudit(
  pool: Pool,
  actorId: string,
  action: string,
  targetType: string,
  targetId: string,
) {
  await pool.execute(
    "INSERT INTO portal_audit_events (actor_type, actor_id, action, target_type, target_id) VALUES ('player', ?, ?, ?, ?)",
    [actorId, action, targetType, targetId],
  );
}

export async function writeStaffModerationAudit(
  actorSteamId: string,
  action: string,
  targetSteamId: string,
) {
  const pool = getPortalPool();
  if (!pool) return;
  try {
    await writeAudit(pool, actorSteamId, action, "steam-player", targetSteamId);
  } catch {
    // A portal-audit failure must not undo a moderation action already sent to Swiftly's database.
  }
}

export async function writeStaffActionAudit(
  actorSteamId: string,
  action: string,
  targetType: string,
  targetId: string,
) {
  const pool = getPortalPool();
  if (!pool) return;
  try {
    await writeAudit(pool, actorSteamId, action, targetType, targetId);
  } catch {
    // Staff actions are applied to the game database independently of the portal audit trail.
  }
}

export type CaseScreenshot = {
  fileName: string;
  contentType: string;
  data: Buffer;
};

export async function createTicket(input: {
  steamId: string;
  category: string;
  subject: string;
  body: string;
  screenshots?: CaseScreenshot[];
}) {
  const pool = getPortalPool();
  if (!pool) throw new Error("Portal storage is not configured.");

  const screenshots = input.screenshots ?? [];
  const connection = await pool.getConnection();
  let ticketId = 0;
  try {
    await connection.beginTransaction();
    const [result] = await connection.execute<ResultSetHeader>(
      "INSERT INTO portal_tickets (steam_id, category, subject, body) VALUES (?, ?, ?, ?)",
      [input.steamId, input.category, input.subject, input.body],
    );
    ticketId = Number(result.insertId);
    if (screenshots.length) {
      const [messageResult] = await connection.execute<ResultSetHeader>(
        "INSERT INTO portal_ticket_messages (ticket_id, author_type, author_id, body) VALUES (?, 'player', ?, 'Screenshots attached to the original ticket.')",
        [ticketId, input.steamId],
      );
      for (const screenshot of screenshots) {
        await connection.execute(
          "INSERT INTO portal_case_attachments (case_type, case_id, message_id, file_name, content_type, file_data) VALUES ('ticket', ?, ?, ?, ?, ?)",
          [
            ticketId,
            Number(messageResult.insertId),
            screenshot.fileName,
            screenshot.contentType,
            screenshot.data,
          ],
        );
      }
    }
    await connection.commit();
  } catch (error) {
    await connection.rollback();
    throw error;
  } finally {
    connection.release();
  }
  await writeAudit(
    pool,
    input.steamId,
    "ticket.created",
    "ticket",
    String(ticketId),
  );
  return ticketId;
}

export async function createAppeal(input: {
  steamId: string;
  banId: number | null;
  body: string;
  screenshots?: CaseScreenshot[];
}) {
  const pool = getPortalPool();
  if (!pool) throw new Error("Portal storage is not configured.");

  const screenshots = input.screenshots ?? [];
  const connection = await pool.getConnection();
  let appealId = 0;
  try {
    await connection.beginTransaction();
    const [result] = await connection.execute<ResultSetHeader>(
      "INSERT INTO portal_ban_appeals (steam_id, ban_id, body) VALUES (?, ?, ?)",
      [input.steamId, input.banId, input.body],
    );
    appealId = Number(result.insertId);
    if (screenshots.length) {
      const [messageResult] = await connection.execute<ResultSetHeader>(
        "INSERT INTO portal_appeal_messages (appeal_id, author_type, author_id, body) VALUES (?, 'player', ?, 'Screenshots attached to the original appeal.')",
        [appealId, input.steamId],
      );
      for (const screenshot of screenshots) {
        await connection.execute(
          "INSERT INTO portal_case_attachments (case_type, case_id, message_id, file_name, content_type, file_data) VALUES ('appeal', ?, ?, ?, ?, ?)",
          [
            appealId,
            Number(messageResult.insertId),
            screenshot.fileName,
            screenshot.contentType,
            screenshot.data,
          ],
        );
      }
    }
    await connection.commit();
  } catch (error) {
    await connection.rollback();
    throw error;
  } finally {
    connection.release();
  }
  await writeAudit(
    pool,
    input.steamId,
    "appeal.created",
    "appeal",
    String(appealId),
  );
  return appealId;
}

export async function getPlayerCaseTarget(
  caseType: "appeal" | "ticket",
  caseId: number,
  steamId: string,
) {
  const pool = getPortalPool();
  if (!pool) return null;
  const table = caseType === "appeal" ? "portal_ban_appeals" : "portal_tickets";
  try {
    const [rows] = await pool.query<
      Array<RowDataPacket & { id: number; status: string }>
    >(`SELECT id, status FROM ${table} WHERE id = ? AND steam_id = ? LIMIT 1`, [
      caseId,
      steamId,
    ]);
    const row = rows[0];
    return row ? { id: Number(row.id), status: row.status } : null;
  } catch {
    return null;
  }
}

export async function addPlayerCaseReply(input: {
  caseType: "appeal" | "ticket";
  caseId: number;
  steamId: string;
  body: string;
  screenshots?: CaseScreenshot[];
}) {
  const pool = getPortalPool();
  if (!pool) throw new Error("Portal storage is not configured.");

  const messageTable =
    input.caseType === "appeal"
      ? "portal_appeal_messages"
      : "portal_ticket_messages";
  const parentTable =
    input.caseType === "appeal" ? "portal_ban_appeals" : "portal_tickets";
  const foreignKey = input.caseType === "appeal" ? "appeal_id" : "ticket_id";
  const screenshots = input.screenshots ?? [];
  const body = input.body.trim() || "Screenshots attached.";
  const connection = await pool.getConnection();
  try {
    await connection.beginTransaction();
    const [messageResult] = await connection.execute<ResultSetHeader>(
      `INSERT INTO ${messageTable} (${foreignKey}, author_type, author_id, body) VALUES (?, 'player', ?, ?)`,
      [input.caseId, input.steamId, body],
    );
    for (const screenshot of screenshots) {
      await connection.execute(
        "INSERT INTO portal_case_attachments (case_type, case_id, message_id, file_name, content_type, file_data) VALUES (?, ?, ?, ?, ?, ?)",
        [
          input.caseType,
          input.caseId,
          Number(messageResult.insertId),
          screenshot.fileName,
          screenshot.contentType,
          screenshot.data,
        ],
      );
    }
    await connection.execute(
      `UPDATE ${parentTable} SET updated_at = CURRENT_TIMESTAMP WHERE id = ?`,
      [input.caseId],
    );
    await connection.commit();
  } catch (error) {
    await connection.rollback();
    throw error;
  } finally {
    connection.release();
  }
  await writeAudit(
    pool,
    input.steamId,
    `${input.caseType}.replied`,
    input.caseType,
    String(input.caseId),
  );
}

export async function getStaffAppealTarget(appealId: number) {
  const pool = getPortalPool();
  if (!pool) return null;
  const [rows] = await pool.query<StaffAppealRow[]>(
    "SELECT id, steam_id, ban_id, body, status, created_at, updated_at, closed_by, closed_at FROM portal_ban_appeals WHERE id = ? LIMIT 1",
    [appealId],
  );
  const row = rows[0];
  return row
    ? { id: Number(row.id), steamId: String(row.steam_id), status: row.status }
    : null;
}

export async function getStaffTicketTarget(ticketId: number) {
  const pool = getPortalPool();
  if (!pool) return null;
  const [rows] = await pool.query<StaffTicketRow[]>(
    "SELECT id, steam_id, category, subject, body, status, created_at, updated_at, closed_by, closed_at FROM portal_tickets WHERE id = ? LIMIT 1",
    [ticketId],
  );
  const row = rows[0];
  return row
    ? { id: Number(row.id), steamId: String(row.steam_id), status: row.status }
    : null;
}

type StaffCaseReplyInput = {
  caseType: "appeal" | "ticket";
  caseId: number;
  actorSteamId: string;
  body: string;
  status?: string;
  screenshot?: { fileName: string; contentType: string; data: Buffer };
};

export async function addStaffCaseReply(input: StaffCaseReplyInput) {
  const pool = getPortalPool();
  if (!pool) throw new Error("Portal storage is not configured.");

  const messageTable =
    input.caseType === "appeal"
      ? "portal_appeal_messages"
      : "portal_ticket_messages";
  const parentTable =
    input.caseType === "appeal" ? "portal_ban_appeals" : "portal_tickets";
  const foreignKey = input.caseType === "appeal" ? "appeal_id" : "ticket_id";
  const body =
    input.body.trim() ||
    (input.screenshot ? "Screenshot attached." : "Case status updated.");

  const connection = await pool.getConnection();
  try {
    await connection.beginTransaction();
    const [messageResult] = await connection.execute<ResultSetHeader>(
      `INSERT INTO ${messageTable} (${foreignKey}, author_type, author_id, body) VALUES (?, 'staff', ?, ?)`,
      [input.caseId, input.actorSteamId, body],
    );
    const messageId = Number(messageResult.insertId);
    if (input.screenshot) {
      await connection.execute(
        "INSERT INTO portal_case_attachments (case_type, case_id, message_id, file_name, content_type, file_data) VALUES (?, ?, ?, ?, ?, ?)",
        [
          input.caseType,
          input.caseId,
          messageId,
          input.screenshot.fileName,
          input.screenshot.contentType,
          input.screenshot.data,
        ],
      );
    }
    if (input.status) {
      await connection.execute(
        `UPDATE ${parentTable} SET status = ?, closed_by = ?, closed_at = CURRENT_TIMESTAMP WHERE id = ?`,
        [input.status, input.actorSteamId, input.caseId],
      );
    } else {
      await connection.execute(
        `UPDATE ${parentTable} SET updated_at = CURRENT_TIMESTAMP WHERE id = ?`,
        [input.caseId],
      );
    }
    await connection.commit();
  } catch (error) {
    await connection.rollback();
    throw error;
  } finally {
    connection.release();
  }

  try {
    await writeAudit(
      pool,
      input.actorSteamId,
      `staff.${input.caseType}.${input.status ?? "replied"}`,
      input.caseType,
      String(input.caseId),
    );
  } catch {
    // The staff reply has already been committed and must remain visible.
  }
}

export async function getCaseAttachment(attachmentId: number) {
  const pool = getPortalPool();
  if (!pool) return null;
  try {
    const [rows] = await pool.query<
      (CaseAttachmentBlobRow & { steam_id: string })[]
    >(
      `SELECT attachment.id, attachment.case_type, attachment.case_id, attachment.message_id, attachment.file_name, attachment.content_type, attachment.file_data, attachment.created_at, appeal.steam_id
       FROM portal_case_attachments AS attachment INNER JOIN portal_ban_appeals AS appeal ON attachment.case_type = 'appeal' AND attachment.case_id = appeal.id
       WHERE attachment.id = ?
       UNION ALL
       SELECT attachment.id, attachment.case_type, attachment.case_id, attachment.message_id, attachment.file_name, attachment.content_type, attachment.file_data, attachment.created_at, ticket.steam_id
       FROM portal_case_attachments AS attachment INNER JOIN portal_tickets AS ticket ON attachment.case_type = 'ticket' AND attachment.case_id = ticket.id
       WHERE attachment.id = ?`,
      [attachmentId, attachmentId],
    );
    const row = rows[0];
    if (!row) return null;
    return {
      id: Number(row.id),
      caseType: row.case_type,
      caseId: Number(row.case_id),
      ownerSteamId: String(row.steam_id),
      fileName: row.file_name,
      contentType: row.content_type,
      data: row.file_data,
    };
  } catch {
    return null;
  }
}

export async function upsertStaffAdmin(input: {
  steamId: string;
  username: string;
  groups: string[];
  immunity: number;
  serverGuids: string[];
}) {
  const pool = getAdminPool();
  if (!pool) throw new Error("Game database is not configured.");
  await pool.execute(
    `INSERT INTO admins (SteamId64, Username, Permissions, Groups, Immunity, Servers)
     VALUES (?, ?, ?, ?, ?, ?)
     ON DUPLICATE KEY UPDATE Username = VALUES(Username), Groups = VALUES(Groups), Immunity = VALUES(Immunity), Servers = VALUES(Servers)`,
    [
      input.steamId,
      input.username,
      JSON.stringify([]),
      JSON.stringify(input.groups),
      input.immunity,
      JSON.stringify(input.serverGuids),
    ],
  );
}

export async function upsertStaffVip(input: {
  steamId: string;
  name: string;
  group: string;
  durationMinutes: number;
  previousGroup?: string;
}) {
  const pool = getGamePool();
  if (!pool) throw new Error("Game database is not configured.");
  const accountId = toAccountId(input.steamId);
  const serverId = getVipServerId();
  const expires =
    input.durationMinutes === 0
      ? 0
      : Math.floor(Date.now() / 1_000) + input.durationMinutes * 60;
  const connection = await pool.getConnection();
  try {
    await connection.beginTransaction();
    if (input.previousGroup && input.previousGroup !== input.group) {
      await connection.execute(
        "DELETE FROM vip_users WHERE account_id = ? AND sid = ? AND `group` = ?",
        [accountId, serverId, input.previousGroup],
      );
    }
    await connection.execute(
      `INSERT INTO vip_users (account_id, name, lastvisit, sid, \`group\`, expires)
       VALUES (?, ?, ?, ?, ?, ?)
       ON DUPLICATE KEY UPDATE name = VALUES(name), lastvisit = VALUES(lastvisit), expires = VALUES(expires)`,
      [
        accountId,
        input.name,
        Math.floor(Date.now() / 1_000),
        serverId,
        input.group,
        expires,
      ],
    );
    await connection.commit();
  } catch (error) {
    await connection.rollback();
    throw error;
  } finally {
    connection.release();
  }
}

export async function removeStaffVip(input: {
  steamId: string;
  group: string;
}) {
  const pool = getGamePool();
  if (!pool) throw new Error("Game database is not configured.");
  await pool.execute(
    "DELETE FROM vip_users WHERE account_id = ? AND sid = ? AND `group` = ?",
    [toAccountId(input.steamId), getVipServerId(), input.group],
  );
}

// ---------------------------------------------------------------------------
// Token economy repository
//
// The economy is intentionally kept separate from the legacy WeaponSkins
// loadout above. TAPPED.Inventory shares the SQL contract from db/006 and
// consumes only the visual/chat queue created below.
// ---------------------------------------------------------------------------

export type EconomyItemType =
  | "skin"
  | "knife"
  | "glove"
  | "crate"
  | "capsule"
  | "nametag"
  | "sticker"
  | "agent"
  | "music_kit"
  | "keychain"
  | "patch"
  | "graffiti";

export type EconomyItemState =
  "available" | "escrowed" | "attached" | "consumed" | "revoked";
export type EconomyLoadoutSlotType =
  "weapon" | "knife" | "glove" | "agent" | "music_kit";
export type EconomyTradeStatus =
  "pending" | "accepted" | "rejected" | "cancelled" | "expired";
export type EconomyTradeItemState =
  "requested" | "escrowed" | "transferred" | "returned" | "unavailable";
export type EconomyDropSource = "hourly" | "map_end" | "manual";

export const ECONOMY_NAMETAG_PRICE_TOKENS = 200;
// Catalogue rarity ranks are ordered from common upward; rank 4 is Pink.
export const ECONOMY_PINK_RARITY_RANK = 4;

export class EconomyRepositoryError extends Error {
  readonly code: string;

  constructor(code: string, message: string) {
    super(message);
    this.name = "EconomyRepositoryError";
    this.code = code;
  }
}

export type TokenWallet = {
  steamId: string;
  balance: number;
  lifetimeEarned: number;
  lifetimeSpent: number;
  createdAt: string | null;
  updatedAt: string | null;
};

export type TokenLedgerEntry = {
  id: number;
  steamId: string;
  delta: number;
  balanceAfter: number;
  reason: string;
  referenceType: string;
  referenceId: string;
  idempotencyKey: string;
  lineKey: string;
  actorSteamId: string | null;
  metadata: Record<string, unknown> | null;
  createdAt: string;
};

export type TokenLedgerFilter = {
  page?: number;
  pageSize?: number;
  reason?: string;
};

export type TokenLedgerPage = {
  entries: TokenLedgerEntry[];
  total: number;
  page: number;
  pageSize: number;
};

export type EconomyCataloguePrice = {
  id: number;
  euroCents: number;
  tokenPrice: number;
  source: string;
  sourceReference: string | null;
  observedAt: string;
};

export type EconomyCatalogueItem = {
  id: number;
  catalogueKey: string | null;
  marketHashName: string | null;
  itemType: EconomyItemType;
  definitionIndex: number | null;
  paintkit: number | null;
  rarityRank: number;
  rarityName: string;
  displayName: string;
  // Normalized presentation fields are intentionally provided alongside the
  // raw metadata. They keep marketplace clients from having to duplicate
  // catalogue conventions or trust arbitrary metadata shapes.
  imageUrl: string | null;
  minFloat: number | null;
  maxFloat: number | null;
  metadata: Record<string, unknown>;
  enabled: boolean;
  price: EconomyCataloguePrice | null;
  // The marketplace may overlay a fresh public price quote over the
  // immutable stored snapshot. Purchase mutations still re-resolve and record
  // that quote server-side, so these display fields are never browser input.
  displayPriceTokens: number | null;
  displayPriceEuroCents: number | null;
  displayPriceSource: string | null;
  // A public price for a skin-like item is quoted for a concrete float. These
  // are presentation fields only; a purchase re-resolves the quote server-side
  // and never trusts a browser-provided amount.
  displayPriceFloatValue: number | null;
  displayPriceWear: string | null;
  displayPriceFloatDiscountBps: number | null;
  directPurchasePriceTokens: number | null;
  createdAt: string;
  updatedAt: string;
};

export type EconomyCatalogueFilter = {
  query?: string;
  itemTypes?: EconomyItemType[];
  rarityRanks?: number[];
  // A requested float range. Catalogue entries without an explicit range are
  // treated as the normal [0, 1] range for skin-like items.
  minFloat?: number;
  maxFloat?: number;
  includeDisabled?: boolean;
  page?: number;
  pageSize?: number;
};

export type EconomyCataloguePage = {
  items: EconomyCatalogueItem[];
  total: number;
  page: number;
  pageSize: number;
};

export type EconomyCrate = EconomyCatalogueItem & {
  cratePriceTokens: number | null;
  lootTableId: number | null;
  lootTableCode: string | null;
};

export type EconomyCratePage = {
  crates: EconomyCrate[];
  total: number;
  page: number;
  pageSize: number;
};

export type EconomyCrateDropPreview = {
  lootEntryId: number;
  catalogue: EconomyCatalogueItem;
  weight: number;
  minFloat: number | null;
  maxFloat: number | null;
  stattrakChanceBps: number;
};

export type EconomyCrateDropPreviewResult = {
  containerCatalogueId: number;
  totalWeight: number;
  drops: EconomyCrateDropPreview[];
};

export type EconomyInventorySticker = {
  slot: number;
  stickerItemId: string;
  stickerCatalogueId: number | null;
  definitionIndex: number | null;
  paintkit: number | null;
  displayName: string | null;
  rarityRank: number | null;
  attributes: Record<string, unknown>;
  appliedAt: string;
};

export type EconomyInventoryCatalogue = {
  id: number;
  catalogueKey: string | null;
  marketHashName: string | null;
  displayName: string;
  metadata: Record<string, unknown>;
  enabled: boolean;
  price: EconomyCataloguePrice | null;
} | null;

export type EconomyInventoryItem = {
  id: string;
  ownerSteamId: string;
  catalogueId: number | null;
  itemType: EconomyItemType;
  displayName: string;
  definitionIndex: number | null;
  paintkit: number | null;
  seed: number | null;
  floatValue: number | null;
  stattrak: boolean;
  stattrakCount: number;
  nametag: string | null;
  rarityRank: number;
  state: EconomyItemState;
  attributes: Record<string, unknown>;
  source: Record<string, unknown>;
  acquiredAt: string;
  consumedAt: string | null;
  updatedAt: string;
  catalogue: EconomyInventoryCatalogue;
  // Inventory pages overlay the fresh public quote here when one is available.
  // The persisted catalogue price remains nested under `catalogue.price` for
  // audit, while these fields let all player-facing cards show one consistent
  // current Market price for this exact item's float.
  marketPriceTokens: number | null;
  marketPriceEuroCents: number | null;
  marketPriceSource: string | null;
  marketPriceFloatValue: number | null;
  marketPriceWear: string | null;
  marketPriceFloatDiscountBps: number | null;
  stickers: EconomyInventorySticker[];
  equippedSlotKeys: string[];
};

export type EconomyInventoryFilter = {
  query?: string;
  itemTypes?: EconomyItemType[];
  rarityRanks?: number[];
  states?: EconomyItemState[];
  includeAttached?: boolean;
  page?: number;
  pageSize?: number;
};

export type EconomyInventoryPage = {
  items: EconomyInventoryItem[];
  total: number;
  page: number;
  pageSize: number;
};

export type EconomyLoadoutSlotInput =
  | { slotType: "weapon"; team: LoadoutTeam; definitionIndex: number }
  | { slotType: "knife"; team: LoadoutTeam }
  | { slotType: "glove"; team: LoadoutTeam }
  | { slotType: "agent"; team: LoadoutTeam }
  | { slotType: "music_kit" };

export type EconomyLoadoutItem = {
  id: string;
  itemType: EconomyItemType;
  displayName: string;
  definitionIndex: number | null;
  paintkit: number | null;
  floatValue: number | null;
  nametag: string | null;
  stattrak: boolean;
  rarityRank: number;
  attributes: Record<string, unknown>;
};

export type EconomyLoadoutSlot = {
  ownerSteamId: string;
  slotKey: string;
  slotType: EconomyLoadoutSlotType;
  team: LoadoutTeam | null;
  definitionIndex: number | null;
  itemId: string | null;
  item: EconomyLoadoutItem | null;
  updatedAt: string;
};

export type EconomyNotification = {
  id: number;
  steamId: string;
  notificationType: string;
  payload: Record<string, unknown>;
  readAt: string | null;
  createdAt: string;
};

export type EconomyNotificationFilter = {
  unreadOnly?: boolean;
  page?: number;
  pageSize?: number;
};

export type EconomyNotificationPage = {
  notifications: EconomyNotification[];
  total: number;
  page: number;
  pageSize: number;
};

export type EconomyTradeItem = {
  itemId: string;
  ownerSteamId: string;
  state: EconomyTradeItemState;
  // Deliberately limited before it leaves the repository: trade viewers do
  // not need staff-grant provenance, private attributes, or full ownership
  // history for the other side's items.
  item: EconomyTradeItemPreview | null;
};

export type EconomyTradeItemPreview = {
  catalogueId: number | null;
  itemType: EconomyItemType;
  displayName: string;
  rarityRank: number;
  floatValue: number | null;
  stattrak: boolean;
  stattrakCount: number;
  nametag: string | null;
  imageUrl: string | null;
};

export type EconomyTrade = {
  id: string;
  creatorSteamId: string;
  counterpartySteamId: string;
  direction: "incoming" | "outgoing";
  status: EconomyTradeStatus;
  offered: { steamId: string; tokens: number; items: EconomyTradeItem[] };
  requested: { steamId: string; tokens: number; items: EconomyTradeItem[] };
  expiresAt: string | null;
  respondedAt: string | null;
  createdAt: string;
  updatedAt: string;
};

export type EconomyTradeFilter = {
  status?: EconomyTradeStatus | EconomyTradeStatus[];
  page?: number;
  pageSize?: number;
};

export type EconomyTradePage = {
  trades: EconomyTrade[];
  total: number;
  page: number;
  pageSize: number;
};

export type PurchaseEconomyItemInput = {
  steamId: string;
  catalogueId: number;
  // Direct container purchases may create a small batch in one atomic
  // operation. Other marketplace items always remain a single purchase.
  quantity?: number;
  floatValue?: number;
  // This is created by a server route after resolving the selected exterior
  // against the public price feed. The browser never submits it.
  resolvedMarketQuote?: ResolvedMarketplacePurchaseQuote;
  idempotencyKey: string;
};

export type ResolvedMarketplacePurchaseQuote = {
  baseEuroCents: number;
  euroCents: number;
  source: string;
  sourceReference: string | null;
  marketHashName: string | null;
  marketVersion: string | null;
  floatValue: number;
  wear: string;
  floatDiscountBps: number;
  pricingRule: "float-linear-v1";
};

export type PurchaseEconomyItemResult = {
  itemId: string;
  itemIds: string[];
  catalogueId: number;
  quantity: number;
  // Unit price is retained for existing marketplace callers.
  priceTokens: number;
  totalPriceTokens: number;
  floatValue: number | null;
  wallet: TokenWallet;
};

export type SellEconomyItemInput = {
  steamId: string;
  itemId: string;
  // Resolved only by the authenticated sell route using the same public-price
  // adapter as the portal Market. It is never browser input.
  marketQuote?: ResolvedEconomyMarketSalePrice;
  idempotencyKey: string;
};

export type ResolvedEconomyMarketSalePrice = {
  tokenPrice: number;
  euroCents: number;
  source: string;
  sourceReference: string | null;
  floatValue: number | null;
  floatDiscountBps: number | null;
};

export type SellEconomyItemResult = {
  itemId: string;
  marketPriceTokens: number;
  payoutTokens: number;
  wallet: TokenWallet;
};

export type OpenEconomyCrateInput = {
  steamId: string;
  crateItemId: string;
  idempotencyKey: string;
};

export type OpenEconomyCrateResult = {
  openingId: number;
  crateItemId: string;
  rewardItemId: string;
  rewardCatalogueId: number;
  // The exact entry is returned with the reward. Catalogue IDs are not unique
  // inside a staff-managed table, so the client must not guess the winning row
  // from the catalogue item alone when rendering the opening reel.
  rewardLootEntryId: number;
  rewardRarityRank: number;
  reward: {
    id: string;
    catalogueId: number | null;
    itemType: EconomyItemType;
    displayName: string;
    definitionIndex: number | null;
    paintkit: number | null;
    seed: number | null;
    floatValue: number | null;
    stattrak: boolean;
    stattrakCount: number;
    nametag: string | null;
    rarityRank: number;
    attributes: Record<string, unknown>;
  };
  globalAnnouncementQueued: boolean;
};

export type EquipEconomyItemInput = {
  steamId: string;
  itemId: string;
  slots: EconomyLoadoutSlotInput[];
  idempotencyKey: string;
};

export type EquipEconomyItemResult = {
  itemId: string;
  slot: EconomyLoadoutSlot;
};

export type EquipEconomyItemSlotsResult = {
  itemId: string;
  slots: EconomyLoadoutSlot[];
};

export type ClearEconomyLoadoutSlotInput = {
  steamId: string;
  slots: EconomyLoadoutSlotInput[];
  idempotencyKey: string;
};

export type ClearEconomyLoadoutSlotResult = {
  slot: EconomyLoadoutSlot;
};

export type ClearEconomyLoadoutSlotsResult = {
  slots: EconomyLoadoutSlot[];
};

export type SetEconomyItemNametagInput = {
  steamId: string;
  itemId: string;
  nametagItemId?: string;
  nametag: string;
  idempotencyKey: string;
};

export type SetEconomyItemNametagResult = {
  itemId: string;
  nametag: string;
  priceTokens: number;
  wallet: TokenWallet;
};

export type AttachEconomyStickerInput = {
  steamId: string;
  weaponItemId: string;
  stickerItemId: string;
  slot: number;
  idempotencyKey: string;
};

export type AttachEconomyStickerResult = {
  weaponItemId: string;
  stickerItemId: string;
  slot: number;
};

export type AttachEconomyCharmInput = {
  steamId: string;
  weaponItemId: string;
  charmItemId: string;
  idempotencyKey: string;
};

export type AttachEconomyCharmResult = {
  weaponItemId: string;
  charmItemId: string;
  charmDefinitionIndex: number;
};

export type CreateEconomyTradeInput = {
  steamId: string;
  counterpartySteamId: string;
  offeredItemIds?: string[];
  requestedItemIds?: string[];
  offeredTokens?: number;
  requestedTokens?: number;
  expiresAt?: string;
  idempotencyKey: string;
};

export type CreateEconomyTradeResult = {
  tradeId: string;
  status: "pending";
  expiresAt: string;
};

export type RespondEconomyTradeInput = {
  steamId: string;
  tradeId: string;
  decision: "accept" | "reject";
  idempotencyKey: string;
};

export type RespondEconomyTradeResult = {
  tradeId: string;
  status: Exclude<EconomyTradeStatus, "pending">;
  reason?: "requested_item_unavailable";
};

export type CancelEconomyTradeInput = {
  steamId: string;
  tradeId: string;
  idempotencyKey: string;
};

export type CancelEconomyTradeResult = {
  tradeId: string;
  status: "cancelled" | "expired";
};

export type AwardEconomyDropInput = {
  steamId: string;
  source: EconomyDropSource;
  lootTableId?: number;
  lootTableCode?: string;
  idempotencyKey: string;
  metadata?: Record<string, unknown>;
};

export type AwardEconomyDropResult = {
  awardId: number;
  itemId: string;
  catalogueId: number;
  rarityRank: number;
};

export type RecordEconomyPriceInput = {
  actorSteamId: string;
  catalogueId: number;
  eurCents: number;
  source: string;
  sourceReference?: string;
  idempotencyKey: string;
};

export type RecordEconomyPriceResult = {
  catalogueId: number;
  price: EconomyCataloguePrice;
};

/** A market-addressable catalogue row used by the background price worker. */
export type EconomyPublicPriceRefreshCandidate = {
  catalogueId: number;
  marketHashName: string;
  metadata: Record<string, unknown>;
  currentPrice: EconomyCataloguePrice | null;
};

/** A trusted EUR-cent quote resolved by the server-side public price adapter. */
export type EconomyPublicPriceRefreshUpdate = {
  catalogueId: number;
  eurCents: number;
  source: string;
  sourceReference: string;
};

export type EconomyPriceRefreshLockResult<T> = {
  available: boolean;
  acquired: boolean;
  value: T | null;
};

export type SetEconomyCatalogueMarketHashInput = {
  actorSteamId: string;
  catalogueId: number;
  marketHashName: string;
  idempotencyKey: string;
};

export type SetEconomyCatalogueMarketHashResult = {
  catalogueId: number;
  marketHashName: string;
};

export type StaffAdjustTokensInput = {
  actorSteamId: string;
  targetSteamId: string;
  action: "award" | "take" | "set";
  amount: number;
  reason: string;
  idempotencyKey: string;
};

export type StaffAdjustTokensResult = {
  targetSteamId: string;
  delta: number;
  wallet: TokenWallet;
};

export type StaffEconomyItemCustomization = {
  seed?: number | null;
  floatValue?: number | null;
  stattrak?: boolean;
  stattrakCount?: number;
  nametag?: string | null;
  attributes?: Record<string, unknown>;
};

export type StaffCustomEconomyItem = {
  itemType: EconomyItemType;
  displayName: string;
  definitionIndex?: number | null;
  paintkit?: number | null;
  rarityRank?: number;
  metadata?: Record<string, unknown>;
};

export type StaffStickerGrant = {
  catalogueId?: number;
  customItem?: StaffCustomEconomyItem | null;
  slot: number;
  customization?: StaffEconomyItemCustomization;
};

export type StaffGrantEconomyItemInput = {
  actorSteamId: string;
  targetSteamId: string;
  catalogueId?: number;
  customItem?: StaffCustomEconomyItem | null;
  customization?: StaffEconomyItemCustomization;
  stickers?: StaffStickerGrant[];
  reason: string;
  idempotencyKey: string;
};

export type StaffGrantEconomyItemResult = {
  itemId: string;
  stickerItemIds: string[];
};

export type StaffUpdateEconomyItemResult = {
  itemId: string;
};

export type StaffUpdateEconomyItemInput = {
  actorSteamId: string;
  targetSteamId: string;
  itemId: string;
  customization: StaffEconomyItemCustomization;
  reason: string;
  idempotencyKey: string;
};

export type StaffSetEconomyItemStateInput = {
  actorSteamId: string;
  targetSteamId: string;
  itemId: string;
  state: "available" | "revoked";
  reason: string;
  idempotencyKey: string;
};

export type StaffSetEconomyItemStateResult = {
  itemId: string;
  state: "available" | "revoked";
};

export type StaffTransferEconomyItemInput = {
  actorSteamId: string;
  fromSteamId: string;
  toSteamId: string;
  itemId: string;
  reason: string;
  idempotencyKey: string;
};

export type StaffTransferEconomyItemResult = {
  itemId: string;
  fromSteamId: string;
  toSteamId: string;
};

export type StaffAttachStickerToEconomyItemInput = {
  actorSteamId: string;
  targetSteamId: string;
  weaponItemId: string;
  stickerItemId?: string;
  stickerCatalogueId?: number;
  slot: number;
  reason: string;
  idempotencyKey: string;
};

export type StaffDetachEconomyStickerInput = {
  actorSteamId: string;
  targetSteamId: string;
  weaponItemId: string;
  slot: number;
  reason: string;
  idempotencyKey: string;
};

export type StaffDetachEconomyStickerResult = {
  weaponItemId: string;
  stickerItemId: string;
  slot: number;
};

export type StaffEquipEconomyItemInput = {
  actorSteamId: string;
  targetSteamId: string;
  itemId: string;
  slot: EconomyLoadoutSlotInput;
  reason: string;
  idempotencyKey: string;
};

export type StaffClearEconomyLoadoutSlotInput = {
  actorSteamId: string;
  targetSteamId: string;
  slot: EconomyLoadoutSlotInput;
  reason: string;
  idempotencyKey: string;
};

export type StaffEconomyAccount = {
  steamId: string;
  wallet: TokenWallet;
  inventory: EconomyInventoryPage;
  loadout: EconomyLoadoutSlot[];
  pendingIncomingTrades: number;
  pendingOutgoingTrades: number;
};

export type StaffEconomyAccountSummary = {
  steamId: string;
  wallet: TokenWallet;
  inventoryCount: number;
  pendingTradeCount: number;
};

export type StaffEconomyAccountFilter = {
  query?: string;
  page?: number;
  pageSize?: number;
};

export type StaffEconomyAccountPage = {
  accounts: StaffEconomyAccountSummary[];
  total: number;
  page: number;
  pageSize: number;
};

type EconomyAccountRow = RowDataPacket & {
  steam_id: string;
  balance: number | string;
  lifetime_earned: number | string;
  lifetime_spent: number | string;
  created_at: Date | string;
  updated_at: Date | string;
};

type EconomyLedgerRow = RowDataPacket & {
  id: number | string;
  account_steam_id: string;
  delta: number | string;
  balance_after: number | string;
  reason: string;
  reference_type: string;
  reference_id: string;
  idempotency_key: string;
  line_key: string;
  actor_steam_id: string | null;
  metadata: unknown;
  created_at: Date | string;
};

type EconomyCatalogueRow = RowDataPacket & {
  id: number | string;
  catalogue_key: string | null;
  market_hash_name: string | null;
  item_type: string;
  definition_index: number | string | null;
  paintkit: number | string | null;
  rarity_rank: number | string;
  display_name: string;
  metadata: unknown;
  enabled: number | boolean;
  created_at: Date | string;
  updated_at: Date | string;
  price_id?: number | string | null;
  market_price_eur_cents?: number | string | null;
  token_price?: number | string | null;
  price_source?: string | null;
  source_reference?: string | null;
  observed_at?: Date | string | null;
  loot_table_id?: number | string | null;
  loot_table_code?: string | null;
};

type EconomyInventoryRow = RowDataPacket & {
  id: string;
  owner_steam_id: string;
  catalogue_id: number | string | null;
  item_type: string;
  definition_index: number | string | null;
  paintkit: number | string | null;
  seed: number | string | null;
  float_value: number | string | null;
  stattrak: number | boolean;
  stattrak_count: number | string;
  nametag: string | null;
  rarity_rank: number | string;
  state: string;
  attributes: unknown;
  source: unknown;
  acquired_at: Date | string;
  consumed_at: Date | string | null;
  updated_at: Date | string;
  catalogue_key: string | null;
  market_hash_name: string | null;
  display_name: string | null;
  catalogue_metadata: unknown;
  catalogue_enabled: number | boolean | null;
  catalogue_rarity_rank: number | string | null;
  price_id: number | string | null;
  market_price_eur_cents: number | string | null;
  token_price: number | string | null;
  price_source: string | null;
  source_reference: string | null;
  observed_at: Date | string | null;
};

type EconomyInventoryStickerRow = RowDataPacket & {
  weapon_item_id: string;
  sticker_slot: number | string;
  sticker_item_id: string;
  sticker_catalogue_id: number | string | null;
  sticker_definition_index: number | string | null;
  sticker_paintkit: number | string | null;
  sticker_rarity_rank: number | string;
  display_name: string | null;
  rarity_rank: number | string | null;
  attributes: unknown;
  applied_at: Date | string;
};

type EconomyLoadoutSlotRow = RowDataPacket & {
  owner_steam_id: string;
  slot_key: string;
  slot_type: string;
  team: string | null;
  definition_index: number | string | null;
  item_id: string | null;
  updated_at: Date | string;
  item_type: string | null;
  display_name: string | null;
  item_definition_index: number | string | null;
  item_paintkit: number | string | null;
  float_value: number | string | null;
  nametag: string | null;
  stattrak: number | boolean | null;
  rarity_rank: number | string | null;
  catalogue_rarity_rank: number | string | null;
  attributes: unknown;
};

type EconomyOperationRow = RowDataPacket & {
  id: number | string;
  operation_name: string;
  idempotency_key: string;
  actor_steam_id: string;
  request_hash: string;
  status: "processing" | "completed";
  result_json: unknown;
};

type EconomyLootTableRow = RowDataPacket & {
  id: number | string;
  code: string;
  table_type: "container" | "drop";
  container_catalogue_id: number | string | null;
  display_name: string;
  enabled: number | boolean;
  metadata: unknown;
};

type EconomyLootEntryRow = RowDataPacket & {
  id: number | string;
  loot_table_id: number | string;
  catalogue_id: number | string;
  weight: number | string;
  min_float: number | string | null;
  max_float: number | string | null;
  seed_min: number | string | null;
  seed_max: number | string | null;
  stattrak_chance_bps: number | string;
  attributes: unknown;
  enabled: number | boolean;
};

type EconomyCrateLootPreviewRow = EconomyCatalogueRow & {
  loot_entry_id: number | string;
  weight: number | string;
  min_float: number | string | null;
  max_float: number | string | null;
  stattrak_chance_bps: number | string;
  attributes: unknown;
};

type EconomyTradeRow = RowDataPacket & {
  id: string;
  creator_steam_id: string;
  counterparty_steam_id: string;
  status: string;
  offered_tokens: number | string;
  requested_tokens: number | string;
  expires_at: Date | string | null;
  responded_at: Date | string | null;
  created_at: Date | string;
  updated_at: Date | string;
};

type EconomyTradeItemRow = RowDataPacket & {
  trade_id: string;
  side: string;
  item_id: string;
  owner_steam_id: string;
  state: string;
};

function economyError(code: string, message: string): never {
  throw new EconomyRepositoryError(code, message);
}

function economyStorageRequired() {
  const pool = getPortalPool();
  if (!pool)
    economyError(
      "storage_unavailable",
      "Portal token economy storage is not configured.",
    );
  return pool;
}

function economyDateToIso(value: Date | string | null | undefined) {
  if (!value) return null;
  const date = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(date.getTime()))
    economyError(
      "invalid_database_value",
      "The token economy contains an invalid timestamp.",
    );
  return date.toISOString();
}

function economyNumber(
  value: number | string | null | undefined,
  field: string,
  minimum = 0,
): number {
  if (value === null || value === undefined)
    economyError(
      "invalid_database_value",
      "The token economy is missing " + field + ".",
    );
  const parsed = typeof value === "number" ? value : Number(value);
  if (!Number.isSafeInteger(parsed) || parsed < minimum)
    economyError(
      "invalid_database_value",
      "The token economy contains an invalid " + field + ".",
    );
  return parsed;
}

function economyDecimal(
  value: number | string | null | undefined,
  field: string,
): number | null {
  if (value === null || value === undefined) return null;
  const parsed = typeof value === "number" ? value : Number(value);
  if (!Number.isFinite(parsed))
    economyError(
      "invalid_database_value",
      "The token economy contains an invalid " + field + ".",
    );
  return parsed;
}

function economyBoolean(value: number | boolean | null | undefined) {
  return value === true || value === 1;
}

function economyRecord(value: unknown): Record<string, unknown> {
  if (Buffer.isBuffer(value)) value = value.toString("utf8");
  if (typeof value === "string") {
    try {
      value = JSON.parse(value) as unknown;
    } catch {
      economyError(
        "invalid_database_value",
        "The token economy contains invalid JSON.",
      );
    }
  }
  return asRecord(value) ?? {};
}

function economyNullableRecord(value: unknown): Record<string, unknown> | null {
  if (value === null || value === undefined) return null;
  return economyRecord(value);
}

function economyItemType(value: string): EconomyItemType {
  const known: EconomyItemType[] = [
    "skin",
    "knife",
    "glove",
    "crate",
    "capsule",
    "nametag",
    "sticker",
    "agent",
    "music_kit",
    "keychain",
    "patch",
    "graffiti",
  ];
  if (!known.includes(value as EconomyItemType))
    economyError(
      "invalid_database_value",
      "The token economy contains an unknown item type.",
    );
  return value as EconomyItemType;
}

function economyItemState(value: string): EconomyItemState {
  const known: EconomyItemState[] = [
    "available",
    "escrowed",
    "attached",
    "consumed",
    "revoked",
  ];
  if (!known.includes(value as EconomyItemState))
    economyError(
      "invalid_database_value",
      "The token economy contains an unknown item state.",
    );
  return value as EconomyItemState;
}

function economyTradeStatus(value: string): EconomyTradeStatus {
  const known: EconomyTradeStatus[] = [
    "pending",
    "accepted",
    "rejected",
    "cancelled",
    "expired",
  ];
  if (!known.includes(value as EconomyTradeStatus))
    economyError(
      "invalid_database_value",
      "The token economy contains an unknown trade status.",
    );
  return value as EconomyTradeStatus;
}

function economyTradeItemState(value: string): EconomyTradeItemState {
  const known: EconomyTradeItemState[] = [
    "requested",
    "escrowed",
    "transferred",
    "returned",
    "unavailable",
  ];
  if (!known.includes(value as EconomyTradeItemState))
    economyError(
      "invalid_database_value",
      "The token economy contains an unknown trade item state.",
    );
  return value as EconomyTradeItemState;
}

function economyOptionalInteger(
  value: number | string | null | undefined,
  field: string,
  minimum = 0,
) {
  return value === null || value === undefined
    ? null
    : economyNumber(value, field, minimum);
}

function economyPage(
  value: number | undefined,
  pageSize: number | undefined,
  maximum = 100,
) {
  const page =
    typeof value === "number" && Number.isSafeInteger(value) && value > 0
      ? value
      : 1;
  const size =
    typeof pageSize === "number" &&
    Number.isSafeInteger(pageSize) &&
    pageSize > 0
      ? Math.min(pageSize, maximum)
      : 30;
  return { page, pageSize: size, offset: (page - 1) * size };
}

function economyText(
  value: string,
  field: string,
  maximum: number,
  allowEmpty = false,
) {
  const trimmed = value.trim();
  if ((!allowEmpty && !trimmed) || trimmed.length > maximum)
    economyError("invalid_input", field + " is invalid.");
  return trimmed;
}

function economySteamId(value: string, field = "Steam ID") {
  if (!isSteamId(value)) economyError("invalid_input", field + " is invalid.");
  return value;
}

function economyIdempotencyKey(value: string) {
  const key = value.trim();
  if (!/^[A-Za-z0-9][A-Za-z0-9._:/-]{0,127}$/.test(key)) {
    economyError("invalid_idempotency_key", "Provide a valid idempotency key.");
  }
  return key;
}

function economyItemId(value: string, field = "Item ID") {
  if (
    !/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(
      value,
    )
  ) {
    economyError("invalid_input", field + " is invalid.");
  }
  return value.toLowerCase();
}

function economyUuid(value: string, field: string) {
  return economyItemId(value, field);
}

function economyAmount(value: number | undefined, field: string) {
  const amount = value ?? 0;
  if (!Number.isSafeInteger(amount) || amount < 0)
    economyError(
      "invalid_input",
      field + " must be a non-negative whole-token amount.",
    );
  return amount;
}

function economySlot(input: EconomyLoadoutSlotInput): {
  slotKey: string;
  slotType: EconomyLoadoutSlotType;
  team: LoadoutTeam | null;
  definitionIndex: number | null;
} {
  if (input.slotType === "weapon") {
    if (
      (input.team !== "T" && input.team !== "CT") ||
      !Number.isSafeInteger(input.definitionIndex) ||
      input.definitionIndex < 1 ||
      input.definitionIndex > 65_535
    ) {
      economyError("invalid_input", "The weapon loadout slot is invalid.");
    }
    return {
      slotKey: "weapon:" + input.team + ":" + input.definitionIndex,
      slotType: "weapon",
      team: input.team,
      definitionIndex: input.definitionIndex,
    };
  }
  if (
    input.slotType === "knife" ||
    input.slotType === "glove" ||
    input.slotType === "agent"
  ) {
    if (input.team !== "T" && input.team !== "CT")
      economyError("invalid_input", "The loadout team is invalid.");
    return {
      slotKey: input.slotType + ":" + input.team,
      slotType: input.slotType,
      team: input.team,
      definitionIndex: null,
    };
  }
  return {
    slotKey: "music_kit",
    slotType: "music_kit",
    team: null,
    definitionIndex: null,
  };
}

function economySlots(inputs: EconomyLoadoutSlotInput[]) {
  if (!Array.isArray(inputs) || inputs.length < 1 || inputs.length > 2) {
    economyError("invalid_input", "Choose one or both loadout teams.");
  }
  const slotsByKey = new Map<
    string,
    ReturnType<typeof economySlot>
  >();
  for (const input of inputs) {
    const slot = economySlot(input);
    slotsByKey.set(slot.slotKey, slot);
  }
  const slots = [...slotsByKey.values()].sort((left, right) =>
    left.slotKey.localeCompare(right.slotKey),
  );
  if (!slots.length) economyError("invalid_input", "Choose a loadout slot.");
  return slots;
}

function economyStableJson(value: unknown): string {
  if (value === null) return "null";
  if (typeof value === "string") return JSON.stringify(value);
  if (typeof value === "number" || typeof value === "boolean")
    return JSON.stringify(value);
  if (Array.isArray(value))
    return "[" + value.map(economyStableJson).join(",") + "]";
  if (typeof value === "object") {
    const source = value as Record<string, unknown>;
    return (
      "{" +
      Object.keys(source)
        .sort()
        .map(
          (key) => JSON.stringify(key) + ":" + economyStableJson(source[key]),
        )
        .join(",") +
      "}"
    );
  }
  return JSON.stringify(String(value));
}

function economyRequestHash(value: unknown) {
  return createHash("sha256").update(economyStableJson(value)).digest("hex");
}

function economyJobKey(idempotencyKey: string, purpose: string) {
  return (
    "job:" +
    createHash("sha256")
      .update(idempotencyKey + "|" + purpose)
      .digest("hex")
      .slice(0, 56)
  );
}

function toTokenWallet(row: EconomyAccountRow): TokenWallet {
  return {
    steamId: String(row.steam_id),
    balance: economyNumber(row.balance, "wallet balance"),
    lifetimeEarned: economyNumber(
      row.lifetime_earned,
      "wallet lifetime earned",
    ),
    lifetimeSpent: economyNumber(row.lifetime_spent, "wallet lifetime spent"),
    createdAt: economyDateToIso(row.created_at),
    updatedAt: economyDateToIso(row.updated_at),
  };
}

function toTokenLedgerEntry(row: EconomyLedgerRow): TokenLedgerEntry {
  const delta = economyNumber(
    row.delta,
    "ledger delta",
    Number.MIN_SAFE_INTEGER,
  );
  return {
    id: economyNumber(row.id, "ledger ID"),
    steamId: String(row.account_steam_id),
    delta,
    balanceAfter: economyNumber(row.balance_after, "ledger balance"),
    reason: String(row.reason),
    referenceType: String(row.reference_type),
    referenceId: String(row.reference_id),
    idempotencyKey: String(row.idempotency_key),
    lineKey: String(row.line_key),
    actorSteamId: row.actor_steam_id ? String(row.actor_steam_id) : null,
    metadata: economyNullableRecord(row.metadata),
    createdAt: economyDateToIso(row.created_at) ?? new Date(0).toISOString(),
  };
}

type EconomyPriceFields = {
  price_id?: number | string | null;
  market_price_eur_cents?: number | string | null;
  token_price?: number | string | null;
  price_source?: string | null;
  source_reference?: string | null;
  observed_at?: Date | string | null;
};

function toEconomyCataloguePrice(
  row: EconomyPriceFields,
): EconomyCataloguePrice | null {
  if (row.price_id === null || row.price_id === undefined) return null;
  return {
    id: economyNumber(row.price_id, "catalogue price ID"),
    euroCents: economyNumber(row.market_price_eur_cents, "catalogue EUR cents"),
    tokenPrice: economyNumber(row.token_price, "catalogue token price"),
    source: String(row.price_source ?? ""),
    sourceReference: row.source_reference ? String(row.source_reference) : null,
    observedAt: economyDateToIso(row.observed_at) ?? new Date(0).toISOString(),
  };
}

function economyDirectPurchasePrice(
  itemType: EconomyItemType,
  price: EconomyCataloguePrice | null,
) {
  if (!price) return null;
  // A persisted EUR-cent snapshot is the source of truth: one cent equals one
  // Token. Containers are sold at the required half-price direct purchase rate.
  return itemType === "crate" || itemType === "capsule"
    ? Math.ceil(price.tokenPrice / 2)
    : price.tokenPrice;
}

function economyDirectPurchasePriceFromEuroCents(
  itemType: EconomyItemType,
  euroCents: number,
) {
  // Keep the display and purchase calculation tied to the same exchange rule:
  // one EUR cent equals one Token, with containers at half price.
  return itemType === "crate" || itemType === "capsule"
    ? Math.ceil(euroCents / 2)
    : euroCents;
}

function economyPriceIsLegacySteam(price: EconomyCataloguePrice | null) {
  return Boolean(price?.source.toLocaleLowerCase("en-US").startsWith("steam"));
}

function economyRarityName(rarityRank: number) {
  // These are the Valve economy rarity ranks used by the imported catalogue.
  // Keep rank zero useful for staff-created/general items that do not have an
  // assigned Counter-Strike rarity yet.
  const names: Record<number, string> = {
    0: "Standard",
    1: "Consumer Grade",
    2: "Industrial Grade",
    3: "Mil-Spec Grade",
    4: "Restricted",
    5: "Classified",
    6: "Covert",
    7: "Extraordinary",
  };
  return names[rarityRank] ?? `Rarity ${rarityRank}`;
}

function economyLootEntryRarityRank(
  attributes: Record<string, unknown>,
  fallback: number,
) {
  // Legacy catalogue imports sometimes assigned a knife/glove its finish
  // rarity (or an old cache rank) rather than the case's Extraordinary tier.
  // A loot entry is the authoritative source while showing or awarding a
  // container result, so use its explicit odds tier when it has one.
  if (economyMetadataBoolean(attributes, "rareSpecial")) return 7;
  switch (economyMetadataInteger(attributes, "rarityChanceBps")) {
    case 7_992:
      return 3;
    case 1_598:
      return 4;
    case 320:
      return 5;
    case 64:
      return 6;
    case 26:
      return 7;
    default:
      return fallback;
  }
}

function economyMetadataImageUrl(metadata: Record<string, unknown>) {
  for (const key of ["imageUrl", "image", "iconUrl", "steamImageUrl"]) {
    const value = economyMetadataString(metadata, key);
    if (!value || value.length > 2_048) continue;
    try {
      const url = new URL(value);
      if (url.protocol === "https:") return url.toString();
    } catch {
      // Ignore malformed staff/import metadata instead of passing it through
      // to a client image element.
    }
  }
  return null;
}

function economyCatalogueFloatRange(
  itemType: EconomyItemType,
  metadata: Record<string, unknown>,
) {
  if (!economyIsSkinLike(itemType)) return null;
  const minimum =
    economyMetadataDecimal(metadata, "minFloat") ??
    economyMetadataDecimal(metadata, "floatMin") ??
    economyMetadataDecimal(metadata, "wearMin") ??
    0;
  const maximum =
    economyMetadataDecimal(metadata, "maxFloat") ??
    economyMetadataDecimal(metadata, "floatMax") ??
    economyMetadataDecimal(metadata, "wearMax") ??
    1;
  if (
    !Number.isFinite(minimum) ||
    !Number.isFinite(maximum) ||
    minimum < 0 ||
    maximum > 1 ||
    minimum > maximum
  ) {
    economyError(
      "invalid_database_value",
      "The catalogue item has an invalid float range.",
    );
  }
  return {
    min: Number(minimum.toFixed(6)),
    max: Number(maximum.toFixed(6)),
  };
}

function toEconomyCatalogueItem(
  row: EconomyCatalogueRow,
): EconomyCatalogueItem {
  const itemType = economyItemType(String(row.item_type));
  const price = toEconomyCataloguePrice(row);
  const metadata = economyRecord(row.metadata);
  const floatRange = economyCatalogueFloatRange(itemType, metadata);
  const directPurchasePriceTokens = economyDirectPurchasePrice(itemType, price);
  return {
    id: economyNumber(row.id, "catalogue ID"),
    catalogueKey: row.catalogue_key ? String(row.catalogue_key) : null,
    marketHashName: row.market_hash_name ? String(row.market_hash_name) : null,
    itemType,
    definitionIndex: economyOptionalInteger(
      row.definition_index,
      "catalogue definition index",
    ),
    paintkit: economyOptionalInteger(row.paintkit, "catalogue paintkit"),
    rarityRank: economyNumber(row.rarity_rank, "catalogue rarity"),
    rarityName: economyRarityName(
      economyNumber(row.rarity_rank, "catalogue rarity"),
    ),
    displayName: String(row.display_name),
    imageUrl: economyMetadataImageUrl(metadata),
    minFloat: floatRange?.min ?? null,
    maxFloat: floatRange?.max ?? null,
    metadata,
    enabled: economyBoolean(row.enabled),
    price,
    displayPriceTokens: directPurchasePriceTokens,
    displayPriceEuroCents: price?.euroCents ?? null,
    displayPriceSource: price?.source ?? null,
    displayPriceFloatValue: null,
    displayPriceWear: null,
    displayPriceFloatDiscountBps: null,
    directPurchasePriceTokens,
    createdAt: economyDateToIso(row.created_at) ?? new Date(0).toISOString(),
    updatedAt: economyDateToIso(row.updated_at) ?? new Date(0).toISOString(),
  };
}

function economyCustomDisplayName(
  attributes: Record<string, unknown>,
  fallback: string,
) {
  const candidate = attributes.displayName ?? attributes.customDisplayName;
  return typeof candidate === "string" && candidate.trim()
    ? candidate.trim()
    : fallback;
}

function toEconomyInventoryItem(
  row: EconomyInventoryRow,
): EconomyInventoryItem {
  const itemType = economyItemType(String(row.item_type));
  const attributes = economyRecord(row.attributes);
  const catalogueId = economyOptionalInteger(
    row.catalogue_id,
    "inventory catalogue ID",
  );
  const price =
    catalogueId === null
      ? null
      : toEconomyCataloguePrice({
          price_id: row.price_id,
          market_price_eur_cents: row.market_price_eur_cents,
          token_price: row.token_price,
          price_source: row.price_source,
          source_reference: row.source_reference,
          observed_at: row.observed_at,
        });
  const displayName = row.display_name
    ? String(row.display_name)
    : economyCustomDisplayName(attributes, itemType);
  const storedRarityRank = economyNumber(row.rarity_rank, "inventory rarity");
  const catalogueRarityRank =
    row.catalogue_rarity_rank === null
      ? storedRarityRank
      : economyNumber(row.catalogue_rarity_rank, "catalogue rarity");
  const rarityRank = economyLootEntryRarityRank(
    attributes,
    catalogueRarityRank,
  );
  return {
    id: economyItemId(String(row.id)),
    ownerSteamId: String(row.owner_steam_id),
    catalogueId,
    itemType,
    displayName,
    definitionIndex: economyOptionalInteger(
      row.definition_index,
      "inventory definition index",
    ),
    paintkit: economyOptionalInteger(row.paintkit, "inventory paintkit"),
    seed: economyOptionalInteger(row.seed, "inventory seed"),
    floatValue: economyDecimal(row.float_value, "inventory float"),
    stattrak: economyBoolean(row.stattrak),
    stattrakCount: economyNumber(
      row.stattrak_count,
      "inventory StatTrak count",
    ),
    nametag: row.nametag ? String(row.nametag) : null,
    rarityRank,
    state: economyItemState(String(row.state)),
    attributes,
    source: economyRecord(row.source),
    acquiredAt: economyDateToIso(row.acquired_at) ?? new Date(0).toISOString(),
    consumedAt: economyDateToIso(row.consumed_at),
    updatedAt: economyDateToIso(row.updated_at) ?? new Date(0).toISOString(),
    catalogue:
      catalogueId === null
        ? null
        : {
            id: catalogueId,
            catalogueKey: row.catalogue_key ? String(row.catalogue_key) : null,
            marketHashName: row.market_hash_name
              ? String(row.market_hash_name)
              : null,
            displayName,
            metadata: economyRecord(row.catalogue_metadata),
            enabled: economyBoolean(row.catalogue_enabled),
            price,
          },
    marketPriceTokens: price?.tokenPrice ?? null,
    marketPriceEuroCents: price?.euroCents ?? null,
    marketPriceSource: price?.source ?? null,
    marketPriceFloatValue: null,
    marketPriceWear: null,
    marketPriceFloatDiscountBps: null,
    stickers: [],
    equippedSlotKeys: [],
  };
}

function economyMetadataBoolean(
  metadata: Record<string, unknown>,
  key: string,
) {
  return metadata[key] === true;
}

function economyMetadataInteger(
  metadata: Record<string, unknown>,
  key: string,
) {
  const value = metadata[key];
  return typeof value === "number" && Number.isSafeInteger(value)
    ? value
    : null;
}

function economyMetadataDecimal(
  metadata: Record<string, unknown>,
  key: string,
) {
  const value = metadata[key];
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

function economyMetadataString(metadata: Record<string, unknown>, key: string) {
  const value = metadata[key];
  return typeof value === "string" ? value : null;
}

function economyIsSkinLike(itemType: EconomyItemType) {
  return itemType === "skin" || itemType === "knife" || itemType === "glove";
}

function economyItemSupportsNametag(item: EconomyInventoryItem) {
  return (
    economyIsSkinLike(item.itemType) &&
    economyMetadataBoolean(
      item.catalogue?.metadata ?? item.attributes,
      "supportsNametag",
    )
  );
}

function economyStickerSlots(item: EconomyInventoryItem) {
  const metadata = item.catalogue?.metadata ?? item.attributes;
  const slots = economyMetadataInteger(metadata, "stickerSlots");
  return slots === null ? 0 : Math.max(0, Math.min(slots, 6));
}

function economyItemSupportsCharm(item: EconomyInventoryItem) {
  return item.itemType === "skin";
}

function economyCharmAttributes(charm: EconomyInventoryItem) {
  if (charm.definitionIndex === null || charm.definitionIndex < 1)
    economyError("incompatible_item", "That charm has no valid game definition.");
  const keychain: Record<string, number> = { id: charm.definitionIndex };
  const aliases: Array<[string, string]> = [
    ["offsetX", "offsetX"],
    ["offsetY", "offsetY"],
    ["offsetZ", "offsetZ"],
    ["x", "offsetX"],
    ["y", "offsetY"],
    ["z", "offsetZ"],
  ];
  for (const [source, target] of aliases) {
    if (keychain[target] !== undefined) continue;
    const value = economyMetadataDecimal(charm.attributes, source);
    if (value !== null) keychain[target] = value;
  }
  const seed = charm.seed ?? economyMetadataInteger(charm.attributes, "seed");
  if (seed !== null && seed >= 0) keychain.seed = seed;
  return keychain;
}

function economyLoadoutCategory(item: EconomyInventoryItem) {
  const metadata = item.catalogue?.metadata ?? item.attributes;
  const explicit = economyMetadataString(metadata, "loadoutCategory");
  if (
    explicit === "weapon" ||
    explicit === "knife" ||
    explicit === "glove" ||
    explicit === "agent" ||
    explicit === "music_kit"
  )
    return explicit;
  if (item.itemType === "knife") return "knife";
  if (item.itemType === "glove") return "glove";
  if (item.itemType === "agent") return "agent";
  if (item.itemType === "music_kit") return "music_kit";
  return item.itemType === "skin" ? "weapon" : null;
}

function economySupportsTeam(item: EconomyInventoryItem, team: LoadoutTeam) {
  const teams = (item.catalogue?.metadata ?? item.attributes).teams;
  if (!Array.isArray(teams)) return true;
  return teams.includes(team);
}

function economyEnsureLoadoutCompatibility(
  item: EconomyInventoryItem,
  slot: ReturnType<typeof economySlot>,
) {
  const category = economyLoadoutCategory(item);
  if (category !== slot.slotType)
    economyError(
      "incompatible_item",
      "That item cannot be equipped in this loadout slot.",
    );
  if (
    slot.slotType === "weapon" &&
    item.definitionIndex !== slot.definitionIndex
  ) {
    economyError(
      "incompatible_item",
      "That skin does not belong to the selected weapon.",
    );
  }
  if (slot.team && !economySupportsTeam(item, slot.team))
    economyError(
      "incompatible_item",
      "That item is unavailable for the selected team.",
    );
}

function economyNormalizeItemIds(values: string[] | undefined, field: string) {
  const source = values ?? [];
  if (!Array.isArray(source) || source.length > 50)
    economyError("invalid_input", field + " is invalid.");
  const ids = [...new Set(source.map((value) => economyItemId(value, field)))];
  return ids.sort();
}

function economyNullableText(
  value: string | null | undefined,
  field: string,
  maximum: number,
) {
  if (value === null || value === undefined) return null;
  const trimmed = value.trim();
  if (!trimmed || trimmed.length > maximum)
    economyError("invalid_input", field + " is invalid.");
  return trimmed;
}

function economyFloat(value: number | null | undefined, field: string) {
  if (value === null || value === undefined) return null;
  if (!Number.isFinite(value) || value < 0 || value > 1)
    economyError("invalid_input", field + " must be between 0 and 1.");
  return Number(value.toFixed(6));
}

function economySeed(value: number | null | undefined, field: string) {
  if (value === null || value === undefined) return null;
  if (!Number.isSafeInteger(value) || value < 0 || value > 1000)
    economyError("invalid_input", field + " is invalid.");
  return value;
}

type EconomyMutationContext = {
  connection: PoolConnection;
  operationName: string;
  idempotencyKey: string;
  actorSteamId: string;
};

async function runEconomyMutation<T extends Record<string, unknown>>(input: {
  operationName: string;
  actorSteamId: string;
  idempotencyKey: string;
  request: unknown;
  work: (context: EconomyMutationContext) => Promise<T>;
}): Promise<T> {
  const pool = economyStorageRequired();
  const actorSteamId = economySteamId(input.actorSteamId, "Actor Steam ID");
  const idempotencyKey = economyIdempotencyKey(input.idempotencyKey);
  const requestHash = economyRequestHash({
    operationName: input.operationName,
    actorSteamId,
    request: input.request,
  });
  const connection = await pool.getConnection();
  let transactionStarted = false;

  try {
    await connection.beginTransaction();
    transactionStarted = true;
    const [insert] = await connection.execute<ResultSetHeader>(
      "INSERT IGNORE INTO portal_economy_operations (operation_name, idempotency_key, actor_steam_id, request_hash) VALUES (?, ?, ?, ?)",
      [input.operationName, idempotencyKey, actorSteamId, requestHash],
    );
    const [operationRows] = await connection.query<EconomyOperationRow[]>(
      "SELECT id, operation_name, idempotency_key, actor_steam_id, request_hash, status, result_json FROM portal_economy_operations WHERE idempotency_key = ? FOR UPDATE",
      [idempotencyKey],
    );
    const operation = operationRows[0];
    if (!operation)
      economyError(
        "operation_unavailable",
        "The token economy could not lock this operation.",
      );
    if (
      operation.operation_name !== input.operationName ||
      operation.actor_steam_id !== actorSteamId ||
      operation.request_hash !== requestHash
    ) {
      economyError(
        "idempotency_conflict",
        "This idempotency key was already used for a different request.",
      );
    }
    if (operation.status === "completed") {
      const result = economyNullableRecord(operation.result_json);
      if (!result)
        economyError(
          "invalid_database_value",
          "The token economy operation has no saved result.",
        );
      await connection.commit();
      transactionStarted = false;
      return result as T;
    }
    if (insert.affectedRows !== 1) {
      economyError(
        "operation_in_progress",
        "That economy operation is already in progress.",
      );
    }

    const result = await input.work({
      connection,
      operationName: input.operationName,
      idempotencyKey,
      actorSteamId,
    });
    await connection.execute(
      "UPDATE portal_economy_operations SET status = 'completed', result_json = ?, completed_at = CURRENT_TIMESTAMP WHERE id = ?",
      [JSON.stringify(result), economyNumber(operation.id, "operation ID")],
    );
    await connection.commit();
    transactionStarted = false;
    return result;
  } catch (error) {
    if (transactionStarted) {
      try {
        await connection.rollback();
      } catch {
        // Preserve the original database/application error.
      }
    }
    throw error;
  } finally {
    connection.release();
  }
}

async function ensureEconomySteamAccount(
  connection: PoolConnection,
  steamId: string,
) {
  await connection.execute(
    "INSERT INTO portal_steam_accounts (steam_id) VALUES (?) ON DUPLICATE KEY UPDATE updated_at = CURRENT_TIMESTAMP",
    [steamId],
  );
  await connection.execute(
    "INSERT INTO portal_token_accounts (steam_id) VALUES (?) ON DUPLICATE KEY UPDATE steam_id = VALUES(steam_id)",
    [steamId],
  );
}

async function lockTokenAccounts(
  connection: PoolConnection,
  steamIds: string[],
) {
  const ids = [
    ...new Set(steamIds.map((steamId) => economySteamId(steamId))),
  ].sort();
  for (const steamId of ids)
    await ensureEconomySteamAccount(connection, steamId);
  const placeholders = ids.map(() => "?").join(", ");
  const [rows] = await connection.query<EconomyAccountRow[]>(
    "SELECT steam_id, balance, lifetime_earned, lifetime_spent, created_at, updated_at FROM portal_token_accounts WHERE steam_id IN (" +
      placeholders +
      ") ORDER BY steam_id FOR UPDATE",
    ids,
  );
  if (rows.length !== ids.length)
    economyError(
      "wallet_unavailable",
      "The token economy could not lock every wallet.",
    );
  return new Map(rows.map((row) => [String(row.steam_id), toTokenWallet(row)]));
}

async function applyTokenDelta(input: {
  connection: PoolConnection;
  wallets: Map<string, TokenWallet>;
  steamId: string;
  delta: number;
  reason: string;
  referenceType: string;
  referenceId: string;
  idempotencyKey: string;
  lineKey: string;
  actorSteamId: string | null;
  metadata?: Record<string, unknown>;
}) {
  if (!Number.isSafeInteger(input.delta) || input.delta === 0)
    economyError(
      "invalid_input",
      "A token change must be a non-zero whole number.",
    );
  const wallet = input.wallets.get(input.steamId);
  if (!wallet)
    economyError(
      "wallet_unavailable",
      "The token economy wallet is not locked.",
    );
  const nextBalance = wallet.balance + input.delta;
  if (!Number.isSafeInteger(nextBalance) || nextBalance < 0)
    economyError(
      "insufficient_tokens",
      "This account does not have enough Tokens.",
    );
  const nextEarned =
    wallet.lifetimeEarned + (input.delta > 0 ? input.delta : 0);
  const nextSpent = wallet.lifetimeSpent + (input.delta < 0 ? -input.delta : 0);
  if (!Number.isSafeInteger(nextEarned) || !Number.isSafeInteger(nextSpent))
    economyError("token_limit", "The token balance limit was reached.");

  await input.connection.execute(
    "UPDATE portal_token_accounts SET balance = ?, lifetime_earned = ?, lifetime_spent = ? WHERE steam_id = ?",
    [nextBalance, nextEarned, nextSpent, input.steamId],
  );
  await input.connection.execute(
    "INSERT INTO portal_token_ledger (account_steam_id, delta, balance_after, reason, reference_type, reference_id, idempotency_key, line_key, actor_steam_id, metadata) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)",
    [
      input.steamId,
      input.delta,
      nextBalance,
      economyText(input.reason, "Ledger reason", 64),
      economyText(input.referenceType, "Ledger reference type", 48),
      economyText(input.referenceId, "Ledger reference ID", 96),
      input.idempotencyKey,
      economyText(input.lineKey, "Ledger line key", 64),
      input.actorSteamId,
      input.metadata ? JSON.stringify(input.metadata) : null,
    ],
  );

  const updated: TokenWallet = {
    ...wallet,
    balance: nextBalance,
    lifetimeEarned: nextEarned,
    lifetimeSpent: nextSpent,
    updatedAt: new Date().toISOString(),
  };
  input.wallets.set(input.steamId, updated);
  return updated;
}

async function writeInventoryEvent(input: {
  connection: PoolConnection;
  itemId: string;
  actorSteamId: string | null;
  eventType: string;
  idempotencyKey: string;
  lineKey: string;
  beforeState?: Record<string, unknown> | null;
  afterState?: Record<string, unknown> | null;
  metadata?: Record<string, unknown> | null;
}) {
  await input.connection.execute(
    "INSERT INTO portal_inventory_item_events (item_id, actor_steam_id, event_type, idempotency_key, line_key, before_state, after_state, metadata) VALUES (?, ?, ?, ?, ?, ?, ?, ?)",
    [
      input.itemId,
      input.actorSteamId,
      economyText(input.eventType, "Item event type", 64),
      input.idempotencyKey,
      economyText(input.lineKey, "Item event line key", 64),
      input.beforeState ? JSON.stringify(input.beforeState) : null,
      input.afterState ? JSON.stringify(input.afterState) : null,
      input.metadata ? JSON.stringify(input.metadata) : null,
    ],
  );
}

async function writeEconomyAdminAudit(input: {
  connection: PoolConnection;
  actorSteamId: string;
  action: string;
  targetSteamId?: string | null;
  targetType: string;
  targetId: string;
  idempotencyKey: string;
  metadata?: Record<string, unknown>;
}) {
  await input.connection.execute(
    "INSERT INTO portal_economy_admin_audit (actor_steam_id, action, target_steam_id, target_type, target_id, idempotency_key, metadata) VALUES (?, ?, ?, ?, ?, ?, ?)",
    [
      input.actorSteamId,
      economyText(input.action, "Admin audit action", 80),
      input.targetSteamId ?? null,
      economyText(input.targetType, "Admin audit target type", 48),
      economyText(input.targetId, "Admin audit target ID", 96),
      input.idempotencyKey,
      input.metadata ? JSON.stringify(input.metadata) : null,
    ],
  );
}

async function enqueueEconomyJob(input: {
  connection: PoolConnection;
  jobType: string;
  targetSteamId?: string | null;
  payload: Record<string, unknown>;
  idempotencyKey: string;
}) {
  await input.connection.execute(
    "INSERT INTO portal_economy_jobs (job_type, target_steam_id, payload, idempotency_key) VALUES (?, ?, ?, ?) ON DUPLICATE KEY UPDATE id = id",
    [
      economyText(input.jobType, "Economy job type", 80),
      input.targetSteamId ?? null,
      JSON.stringify(input.payload),
      input.idempotencyKey,
    ],
  );
}

async function createEconomyNotification(input: {
  connection: PoolConnection;
  steamId: string;
  notificationType: string;
  payload: Record<string, unknown>;
}) {
  await input.connection.execute(
    "INSERT INTO portal_economy_notifications (steam_id, notification_type, payload) VALUES (?, ?, ?)",
    [
      input.steamId,
      economyText(input.notificationType, "Notification type", 64),
      JSON.stringify(input.payload),
    ],
  );
}

const economyCatalogueSelect =
  "SELECT c.id, c.catalogue_key, c.market_hash_name, c.item_type, c.definition_index, c.paintkit, c.rarity_rank, c.display_name, c.metadata, c.enabled, c.created_at, c.updated_at, " +
  "p.id AS price_id, p.market_price_eur_cents, p.token_price, p.price_source, p.source_reference, p.observed_at " +
  "FROM portal_economy_catalogue AS c " +
  "LEFT JOIN portal_economy_catalogue_prices AS p ON p.catalogue_id = c.id AND p.is_current = TRUE ";

const economyCrateSelect =
  "SELECT c.id, c.catalogue_key, c.market_hash_name, c.item_type, c.definition_index, c.paintkit, c.rarity_rank, c.display_name, c.metadata, c.enabled, c.created_at, c.updated_at, " +
  "p.id AS price_id, p.market_price_eur_cents, p.token_price, p.price_source, p.source_reference, p.observed_at, " +
  "l.id AS loot_table_id, l.code AS loot_table_code " +
  "FROM portal_economy_catalogue AS c " +
  "LEFT JOIN portal_economy_catalogue_prices AS p ON p.catalogue_id = c.id AND p.is_current = TRUE " +
  "INNER JOIN portal_loot_tables AS l ON l.container_catalogue_id = c.id AND l.table_type = 'container' AND l.enabled = TRUE ";

const economyInventorySelect =
  "SELECT i.id, i.owner_steam_id, i.catalogue_id, i.item_type, i.definition_index, i.paintkit, i.seed, i.float_value, i.stattrak, i.stattrak_count, i.nametag, i.rarity_rank, i.state, i.attributes, i.source, i.acquired_at, i.consumed_at, i.updated_at, " +
  "c.catalogue_key, c.market_hash_name, c.display_name, c.rarity_rank AS catalogue_rarity_rank, c.metadata AS catalogue_metadata, c.enabled AS catalogue_enabled, " +
  "p.id AS price_id, p.market_price_eur_cents, p.token_price, p.price_source, p.source_reference, p.observed_at " +
  "FROM portal_inventory_items AS i " +
  "LEFT JOIN portal_economy_catalogue AS c ON c.id = i.catalogue_id " +
  "LEFT JOIN portal_economy_catalogue_prices AS p ON p.catalogue_id = c.id AND p.is_current = TRUE ";

function economyFilterItemTypes(values: EconomyItemType[] | undefined) {
  if (!values) return [];
  const unique = [
    ...new Set(values.map((value) => economyItemType(String(value)))),
  ];
  if (unique.length > 12)
    economyError("invalid_input", "Too many item types were requested.");
  return unique;
}

function economyFilterRarityRanks(values: number[] | undefined) {
  if (!values) return [];
  const unique = [...new Set(values)];
  if (
    unique.length > 16 ||
    unique.some(
      (value) => !Number.isSafeInteger(value) || value < 0 || value > 255,
    )
  ) {
    economyError("invalid_input", "The rarity filter is invalid.");
  }
  return unique;
}

function economyFilterFloatRange(filter: Pick<EconomyCatalogueFilter, "minFloat" | "maxFloat">) {
  const min =
    filter.minFloat === undefined
      ? null
      : economyFloat(filter.minFloat, "Minimum float filter");
  const max =
    filter.maxFloat === undefined
      ? null
      : economyFloat(filter.maxFloat, "Maximum float filter");
  if (min !== null && max !== null && min > max) {
    economyError(
      "invalid_input",
      "The minimum float filter cannot exceed the maximum float filter.",
    );
  }
  return { min, max };
}

function economyCatalogueSearchTerms(query: string, field: string) {
  const normalized = economyText(query, field, 120)
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase();
  const terms = normalized
    .split(/[^\p{L}\p{N}]+/u)
    .filter(Boolean);
  return [...new Set(terms)].slice(0, 8);
}

function economyCatalogueSearchFilter(query: string, field: string) {
  const terms = economyCatalogueSearchTerms(query, field);
  // Punctuation alone should not turn into an unfiltered catalogue request.
  if (!terms.length) return { sql: "FALSE", values: [] as unknown[] };
  // This deliberately searches every term independently. It makes ordinary
  // player input such as "AK-47 Redline", "music kit", or a catalogue key
  // match despite the punctuation/spacing used by Steam and legacy imports.
  const fields = [
    "LOWER(c.display_name)",
    "LOWER(COALESCE(c.market_hash_name, ''))",
    "LOWER(COALESCE(c.catalogue_key, ''))",
    "LOWER(c.item_type)",
    // The database enum intentionally keeps legacy weapon finishes as
    // `skin`. Add the player-facing aliases so searches for "weapons" and
    // "skins" match the same catalogue entries as "skin".
    "CASE WHEN c.item_type = 'skin' THEN 'weapon weapons skin skins' ELSE '' END",
    "LOWER(COALESCE(JSON_UNQUOTE(JSON_EXTRACT(c.metadata, '$.marketBaseName')), ''))",
    "LOWER(COALESCE(JSON_UNQUOTE(JSON_EXTRACT(c.metadata, '$.weaponName')), ''))",
    "LOWER(COALESCE(JSON_UNQUOTE(JSON_EXTRACT(c.metadata, '$.paintkitName')), ''))",
  ];
  const termSql = "(" + fields.map((value) => value + " LIKE ?").join(" OR ") + ")";
  return {
    sql: terms.map(() => termSql).join(" AND "),
    values: terms.flatMap((term) => fields.map(() => "%" + term + "%")),
  };
}

const economyCatalogueFloatMinimumSql =
  "COALESCE(CAST(JSON_UNQUOTE(JSON_EXTRACT(c.metadata, '$.minFloat')) AS DECIMAL(8, 6)), CAST(JSON_UNQUOTE(JSON_EXTRACT(c.metadata, '$.floatMin')) AS DECIMAL(8, 6)), CAST(JSON_UNQUOTE(JSON_EXTRACT(c.metadata, '$.wearMin')) AS DECIMAL(8, 6)), 0)";

const economyCatalogueFloatMaximumSql =
  "COALESCE(CAST(JSON_UNQUOTE(JSON_EXTRACT(c.metadata, '$.maxFloat')) AS DECIMAL(8, 6)), CAST(JSON_UNQUOTE(JSON_EXTRACT(c.metadata, '$.floatMax')) AS DECIMAL(8, 6)), CAST(JSON_UNQUOTE(JSON_EXTRACT(c.metadata, '$.wearMax')) AS DECIMAL(8, 6)), 1)";

function economyFilterStates(values: EconomyItemState[] | undefined) {
  if (!values) return [];
  return [...new Set(values.map((value) => economyItemState(String(value))))];
}

function economyCount(rows: Array<RowDataPacket & { total: number | string }>) {
  return economyNumber(rows[0]?.total ?? 0, "result total");
}

async function hydrateEconomyInventory(
  pool: Pool,
  rows: EconomyInventoryRow[],
) {
  const items = rows.map(toEconomyInventoryItem);
  if (!items.length) return items;
  const ids = items.map((item) => item.id);
  const placeholders = ids.map(() => "?").join(", ");
  const [stickerRows] = await pool.query<EconomyInventoryStickerRow[]>(
    "SELECT a.weapon_item_id, a.sticker_slot, a.sticker_item_id, a.sticker_catalogue_id, a.sticker_definition_index, a.sticker_paintkit, a.sticker_rarity_rank, c.display_name, c.rarity_rank, a.attributes, a.applied_at " +
      "FROM portal_inventory_item_stickers AS a LEFT JOIN portal_economy_catalogue AS c ON c.id = a.sticker_catalogue_id " +
      "WHERE a.weapon_item_id IN (" +
      placeholders +
      ") ORDER BY a.weapon_item_id, a.sticker_slot",
    ids,
  );
  const [slotRows] = await pool.query<
    Array<RowDataPacket & { item_id: string; slot_key: string }>
  >(
    "SELECT item_id, slot_key FROM portal_loadout_slots WHERE item_id IN (" +
      placeholders +
      ") ORDER BY item_id, slot_key",
    ids,
  );
  const stickersByItem = new Map<string, EconomyInventorySticker[]>();
  for (const row of stickerRows) {
    const sticker: EconomyInventorySticker = {
      slot: economyNumber(row.sticker_slot, "sticker slot"),
      stickerItemId: economyItemId(String(row.sticker_item_id)),
      stickerCatalogueId: economyOptionalInteger(
        row.sticker_catalogue_id,
        "sticker catalogue ID",
      ),
      definitionIndex: economyOptionalInteger(
        row.sticker_definition_index,
        "sticker definition index",
      ),
      paintkit: economyOptionalInteger(
        row.sticker_paintkit,
        "sticker paintkit",
      ),
      displayName: row.display_name ? String(row.display_name) : null,
      rarityRank:
        row.rarity_rank === null
          ? economyNumber(row.sticker_rarity_rank, "sticker rarity")
          : economyOptionalInteger(row.rarity_rank, "sticker rarity"),
      attributes: economyRecord(row.attributes),
      appliedAt: economyDateToIso(row.applied_at) ?? new Date(0).toISOString(),
    };
    const group = stickersByItem.get(String(row.weapon_item_id)) ?? [];
    group.push(sticker);
    stickersByItem.set(String(row.weapon_item_id), group);
  }
  const slotsByItem = new Map<string, string[]>();
  for (const row of slotRows) {
    const group = slotsByItem.get(String(row.item_id)) ?? [];
    group.push(String(row.slot_key));
    slotsByItem.set(String(row.item_id), group);
  }
  for (const item of items) {
    item.stickers = stickersByItem.get(item.id) ?? [];
    item.equippedSlotKeys = slotsByItem.get(item.id) ?? [];
  }
  return items;
}

async function findEconomyInventoryItem(pool: Pool, itemId: string) {
  const [rows] = await pool.query<EconomyInventoryRow[]>(
    economyInventorySelect + "WHERE i.id = ? LIMIT 1",
    [itemId],
  );
  const items = await hydrateEconomyInventory(pool, rows);
  return items[0] ?? null;
}

/**
 * Returns a single item only when it is owned by the requesting player. This
 * is used by server-side mutation routes to resolve a fresh public Market
 * quote; it never exposes another player's inventory to the browser.
 */
export async function getPlayerEconomyInventoryItem(
  steamId: string,
  itemId: string,
) {
  const ownerSteamId = economySteamId(steamId);
  const normalizedItemId = economyItemId(itemId);
  const pool = getPortalPool();
  if (!pool) return null;
  const item = await findEconomyInventoryItem(pool, normalizedItemId);
  return item?.ownerSteamId === ownerSteamId ? item : null;
}

export function economyStorageConfigured() {
  return Boolean(getPortalPool());
}

export async function getTokenWallet(steamId: string): Promise<TokenWallet> {
  economySteamId(steamId);
  const pool = getPortalPool();
  const empty: TokenWallet = {
    steamId,
    balance: 0,
    lifetimeEarned: 0,
    lifetimeSpent: 0,
    createdAt: null,
    updatedAt: null,
  };
  if (!pool) return empty;
  const [rows] = await pool.query<EconomyAccountRow[]>(
    "SELECT steam_id, balance, lifetime_earned, lifetime_spent, created_at, updated_at FROM portal_token_accounts WHERE steam_id = ? LIMIT 1",
    [steamId],
  );
  return rows[0] ? toTokenWallet(rows[0]) : empty;
}

export async function getTokenLedger(
  steamId: string,
  filter: TokenLedgerFilter = {},
): Promise<TokenLedgerPage> {
  economySteamId(steamId);
  const pool = getPortalPool();
  const paging = economyPage(filter.page, filter.pageSize);
  if (!pool)
    return {
      entries: [],
      total: 0,
      page: paging.page,
      pageSize: paging.pageSize,
    };
  const where: string[] = ["account_steam_id = ?"];
  const values: unknown[] = [steamId];
  if (filter.reason) {
    where.push("reason = ?");
    values.push(economyText(filter.reason, "Ledger reason filter", 64));
  }
  const clause = " WHERE " + where.join(" AND ");
  const [countRows] = await pool.query<
    Array<RowDataPacket & { total: number | string }>
  >("SELECT COUNT(*) AS total FROM portal_token_ledger" + clause, values);
  const [rows] = await pool.query<EconomyLedgerRow[]>(
    "SELECT id, account_steam_id, delta, balance_after, reason, reference_type, reference_id, idempotency_key, line_key, actor_steam_id, metadata, created_at FROM portal_token_ledger" +
      clause +
      " ORDER BY id DESC LIMIT ? OFFSET ?",
    [...values, paging.pageSize, paging.offset],
  );
  return {
    entries: rows.map(toTokenLedgerEntry),
    total: economyCount(countRows),
    page: paging.page,
    pageSize: paging.pageSize,
  };
}

export async function getEconomyCatalogue(
  filter: EconomyCatalogueFilter = {},
): Promise<EconomyCataloguePage> {
  const pool = getPortalPool();
  const paging = economyPage(filter.page, filter.pageSize);
  if (!pool)
    return {
      items: [],
      total: 0,
      page: paging.page,
      pageSize: paging.pageSize,
    };
  const itemTypes = economyFilterItemTypes(filter.itemTypes);
  const rarityRanks = economyFilterRarityRanks(filter.rarityRanks);
  const floatRange = economyFilterFloatRange(filter);
  const where: string[] = [];
  const values: unknown[] = [];
  if (!filter.includeDisabled) where.push("c.enabled = TRUE");
  if (itemTypes.length) {
    where.push("c.item_type IN (" + itemTypes.map(() => "?").join(", ") + ")");
    values.push(...itemTypes);
  }
  if (rarityRanks.length) {
    where.push(
      "c.rarity_rank IN (" + rarityRanks.map(() => "?").join(", ") + ")",
    );
    values.push(...rarityRanks);
  }
  if (filter.query?.trim()) {
    const search = economyCatalogueSearchFilter(
      filter.query,
      "Catalogue search",
    );
    where.push(search.sql);
    values.push(...search.values);
  }
  if (floatRange.min !== null || floatRange.max !== null) {
    // A requested float is meaningful only for skins, knives, and gloves.
    // Entries with no explicit metadata range retain CS2's standard 0-1
    // range, so filtering does not hide valid legacy catalogue items.
    where.push("c.item_type IN ('skin', 'knife', 'glove')");
    where.push(
      economyCatalogueFloatMinimumSql + " <= ? AND " + economyCatalogueFloatMaximumSql + " >= ?",
    );
    values.push(floatRange.max ?? 1, floatRange.min ?? 0);
  }
  const clause = where.length ? " WHERE " + where.join(" AND ") : "";
  const [countRows] = await pool.query<
    Array<RowDataPacket & { total: number | string }>
  >(
    "SELECT COUNT(*) AS total FROM portal_economy_catalogue AS c" + clause,
    values,
  );
  const [rows] = await pool.query<EconomyCatalogueRow[]>(
    economyCatalogueSelect +
      clause +
      " ORDER BY c.rarity_rank DESC, c.display_name ASC, c.id ASC LIMIT ? OFFSET ?",
    [...values, paging.pageSize, paging.offset],
  );
  return {
    items: rows.map(toEconomyCatalogueItem),
    total: economyCount(countRows),
    page: paging.page,
    pageSize: paging.pageSize,
  };
}

/**
 * Marketplace browsing has a deliberately lower cap than staff/catalogue
 * tooling. Keep the limit in the data layer so an API client cannot request a
 * huge market page even if a presentation layer regresses.
 */
export async function getMarketplaceCatalogue(
  filter: EconomyCatalogueFilter = {},
): Promise<EconomyCataloguePage> {
  const catalogue = await getEconomyCatalogue({
    ...filter,
    pageSize:
      filter.pageSize === undefined
        ? 50
        : Math.min(Math.max(1, filter.pageSize), 50),
  });
  // One cached public price snapshot prices every matching card on this
  // marketplace page. Legacy weapon finishes intentionally do not have a
  // fixed hash: their public identity includes the selected exterior, which
  // the price resolver derives from `marketBaseName` and its display float.
  // We deliberately do not write buyer-specific float quotes into the one
  // shared catalogue-price row during browsing.
  const publicPrices = await getMarketplacePriceQuotes(
    catalogue.items.map((item) => ({
      itemType: item.itemType,
      displayName: item.displayName,
      marketHashName: item.marketHashName,
      metadata: item.metadata,
      minFloat: item.minFloat,
      maxFloat: item.maxFloat,
      fallbackPrice:
        item.price && !economyPriceIsLegacySteam(item.price)
          ? {
              eurCents: item.price.euroCents,
              source: item.price.source,
              sourceReference: item.price.sourceReference,
            }
          : null,
    })),
  );
  return {
    ...catalogue,
    items: catalogue.items.map((item, index) => {
      const price = publicPrices[index];
      if (price) {
        return {
          ...item,
          displayPriceTokens: economyDirectPurchasePriceFromEuroCents(
            item.itemType,
            price.eurCents,
          ),
          displayPriceEuroCents: price.eurCents,
          displayPriceSource: price.source,
          displayPriceFloatValue: price.floatValue,
          displayPriceWear: price.wear,
          displayPriceFloatDiscountBps: price.floatDiscountBps,
        };
      }
      // Historical Steam snapshots are preserved for audit, but are not
      // surfaced as a current public-market quote after this provider switch.
      if (economyPriceIsLegacySteam(item.price)) {
        return {
          ...item,
          displayPriceTokens: null,
          displayPriceEuroCents: null,
          displayPriceSource: null,
          displayPriceFloatValue: null,
          displayPriceWear: null,
          displayPriceFloatDiscountBps: null,
        };
      }
      return item;
    }),
  };
}

export async function getEconomyCatalogueItem(
  catalogueId: number,
  includeDisabled = false,
): Promise<EconomyCatalogueItem | null> {
  if (!Number.isSafeInteger(catalogueId) || catalogueId < 1)
    economyError("invalid_input", "The catalogue item is invalid.");
  const pool = getPortalPool();
  if (!pool) return null;
  const [rows] = await pool.query<EconomyCatalogueRow[]>(
    economyCatalogueSelect +
      "WHERE c.id = ? " +
      (includeDisabled ? "" : "AND c.enabled = TRUE ") +
      "LIMIT 1",
    [catalogueId],
  );
  return rows[0] ? toEconomyCatalogueItem(rows[0]) : null;
}

/**
 * Returns every enabled catalogue item that has an exact public market name.
 * This deliberately excludes custom/unmapped entries: a last-known or custom
 * price must never be replaced by a quote for a guessed identity.
 */
export async function getEconomyPublicPriceRefreshCandidates(): Promise<
  EconomyPublicPriceRefreshCandidate[]
> {
  const pool = getPortalPool();
  if (!pool) return [];
  const [rows] = await pool.query<EconomyCatalogueRow[]>(
    economyCatalogueSelect +
      "WHERE c.enabled = TRUE AND c.market_hash_name IS NOT NULL " +
      "AND TRIM(c.market_hash_name) <> '' ORDER BY c.id ASC",
  );
  return rows.map((row) => ({
    catalogueId: economyNumber(row.id, "catalogue ID", 1),
    marketHashName: economyText(
      String(row.market_hash_name ?? ""),
      "Public market-hash name",
      255,
    ),
    metadata: economyRecord(row.metadata),
    currentPrice: toEconomyCataloguePrice(row),
  }));
}

/**
 * Serializes an automatic price sweep across all portal instances. The lock is
 * intentionally held while the public snapshot is read and updates are saved,
 * so an in-process scheduler and an external cron endpoint cannot duplicate a
 * refresh or create competing current-price rows.
 */
export async function withEconomyPublicPriceRefreshLock<T>(
  work: () => Promise<T>,
): Promise<EconomyPriceRefreshLockResult<T>> {
  const pool = getPortalPool();
  if (!pool) return { available: false, acquired: false, value: null };

  const connection = await pool.getConnection();
  let acquired = false;
  try {
    const [rows] = await connection.query<
      Array<RowDataPacket & { locked: number | string | null }>
    >("SELECT GET_LOCK('arena_portal_economy_public_price_refresh', 0) AS locked");
    acquired = Number(rows[0]?.locked ?? 0) === 1;
    if (!acquired) return { available: true, acquired: false, value: null };
    return { available: true, acquired: true, value: await work() };
  } finally {
    if (acquired) {
      try {
        await connection.query(
          "SELECT RELEASE_LOCK('arena_portal_economy_public_price_refresh')",
        );
      } catch {
        // The connection is about to be released. MySQL also releases named
        // locks on disconnect, so a release failure cannot leave a permanent
        // lock behind.
      }
    }
    connection.release();
  }
}

/**
 * Records only changed public prices. Price history is retained by closing the
 * prior current snapshot before inserting the new immutable observation.
 */
export async function recordAutomaticEconomyPublicPrices(
  input: readonly EconomyPublicPriceRefreshUpdate[],
): Promise<number> {
  if (!input.length) return 0;
  const pool = getPortalPool();
  if (!pool) return 0;

  const updatesByCatalogueId = new Map<number, EconomyPublicPriceRefreshUpdate>();
  for (const value of input) {
    const catalogueId = economyNumber(value.catalogueId, "catalogue ID", 1);
    updatesByCatalogueId.set(catalogueId, {
      catalogueId,
      eurCents: economyAmount(value.eurCents, "Public EUR-cent price"),
      source: economyText(value.source, "Public price source", 32),
      sourceReference: economyText(
        value.sourceReference,
        "Public price reference",
        255,
      ),
    });
  }
  const updates = [...updatesByCatalogueId.values()];
  const connection = await pool.getConnection();
  const batchSize = 250;
  try {
    for (let offset = 0; offset < updates.length; offset += batchSize) {
      const batch = updates.slice(offset, offset + batchSize);
      await connection.beginTransaction();
      try {
        const cataloguePlaceholders = batch.map(() => "?").join(", ");
        await connection.execute(
          "UPDATE portal_economy_catalogue_prices SET is_current = FALSE " +
            "WHERE is_current = TRUE AND catalogue_id IN (" +
            cataloguePlaceholders +
            ")",
          batch.map((update) => update.catalogueId),
        );
        const valuePlaceholders = batch.map(() => "(?, ?, ?, ?, TRUE)").join(", ");
        await connection.execute(
          "INSERT INTO portal_economy_catalogue_prices " +
            "(catalogue_id, market_price_eur_cents, price_source, source_reference, is_current) VALUES " +
            valuePlaceholders,
          batch.flatMap((update) => [
            update.catalogueId,
            update.eurCents,
            update.source,
            update.sourceReference,
          ]),
        );
        await connection.commit();
      } catch (error) {
        await connection.rollback();
        throw error;
      }
    }
    return updates.length;
  } finally {
    connection.release();
  }
}

export async function getEconomyCrates(
  filter: Omit<EconomyCatalogueFilter, "itemTypes"> = {},
): Promise<EconomyCratePage> {
  const pool = getPortalPool();
  const paging = economyPage(filter.page, filter.pageSize);
  if (!pool)
    return {
      crates: [],
      total: 0,
      page: paging.page,
      pageSize: paging.pageSize,
    };
  const where: string[] = ["c.item_type IN ('crate', 'capsule')"];
  const values: unknown[] = [];
  if (!filter.includeDisabled) where.push("c.enabled = TRUE");
  const rarityRanks = economyFilterRarityRanks(filter.rarityRanks);
  if (rarityRanks.length) {
    where.push(
      "c.rarity_rank IN (" + rarityRanks.map(() => "?").join(", ") + ")",
    );
    values.push(...rarityRanks);
  }
  if (filter.query?.trim()) {
    const search = economyCatalogueSearchFilter(filter.query, "Crate search");
    where.push(search.sql);
    values.push(...search.values);
  }
  const clause = " WHERE " + where.join(" AND ");
  const [countRows] = await pool.query<
    Array<RowDataPacket & { total: number | string }>
  >(
    "SELECT COUNT(*) AS total FROM portal_economy_catalogue AS c INNER JOIN portal_loot_tables AS l ON l.container_catalogue_id = c.id AND l.table_type = 'container' AND l.enabled = TRUE" +
      clause,
    values,
  );
  const [rows] = await pool.query<EconomyCatalogueRow[]>(
    economyCrateSelect +
      clause +
      " ORDER BY c.rarity_rank DESC, c.display_name ASC, c.id ASC LIMIT ? OFFSET ?",
    [...values, paging.pageSize, paging.offset],
  );
  const crates = rows.map((row) => {
    const item = toEconomyCatalogueItem(row);
    return {
      ...item,
      cratePriceTokens: item.directPurchasePriceTokens,
      lootTableId: economyOptionalInteger(row.loot_table_id, "loot table ID"),
      lootTableCode: row.loot_table_code ? String(row.loot_table_code) : null,
    };
  });
  return {
    crates,
    total: economyCount(countRows),
    page: paging.page,
    pageSize: paging.pageSize,
  };
}

/**
 * Returns the enabled possibilities for one container. We expose weights and
 * their shared total, never the server's random roll, so the crate UI can
 * present transparent odds without affecting the actual reward selection.
 */
export async function getEconomyCrateDropPreview(
  containerCatalogueId: number,
): Promise<EconomyCrateDropPreviewResult | null> {
  const catalogueId = economyNumber(
    containerCatalogueId,
    "Container catalogue ID",
    1,
  );
  const pool = getPortalPool();
  if (!pool) return null;

  const [rows] = await pool.query<EconomyCrateLootPreviewRow[]>(
    "SELECT c.id, c.catalogue_key, c.market_hash_name, c.item_type, c.definition_index, c.paintkit, c.rarity_rank, c.display_name, c.metadata, c.enabled, c.created_at, c.updated_at, " +
      "p.id AS price_id, p.market_price_eur_cents, p.token_price, p.price_source, p.source_reference, p.observed_at, " +
      "e.id AS loot_entry_id, e.weight, e.min_float, e.max_float, e.stattrak_chance_bps, e.attributes " +
      "FROM portal_loot_tables AS l " +
      "INNER JOIN portal_loot_entries AS e ON e.loot_table_id = l.id AND e.enabled = TRUE " +
      "INNER JOIN portal_economy_catalogue AS c ON c.id = e.catalogue_id " +
      "LEFT JOIN portal_economy_catalogue_prices AS p ON p.catalogue_id = c.id AND p.is_current = TRUE " +
      "WHERE l.container_catalogue_id = ? AND l.table_type = 'container' AND l.enabled = TRUE " +
      "ORDER BY c.rarity_rank DESC, c.display_name ASC, e.id ASC",
    [catalogueId],
  );
  if (!rows.length) return null;

  const weights = rows.map((row) => economyNumber(row.weight, "loot weight", 1));
  const totalWeight = weights.reduce((total, weight) => {
    const next = total + weight;
    if (!Number.isSafeInteger(next))
      economyError("loot_table_invalid", "The loot table weight is too large.");
    return next;
  }, 0);
  if (totalWeight < 1) return null;

  return {
    containerCatalogueId: catalogueId,
    totalWeight,
    drops: rows.map((row, index) => {
      const catalogue = toEconomyCatalogueItem(row);
      const attributes = economyRecord(row.attributes);
      const minFloat = economyDecimal(row.min_float, "loot minimum float");
      const maxFloat = economyDecimal(row.max_float, "loot maximum float");
      const rarityRank = economyLootEntryRarityRank(
        attributes,
        catalogue.rarityRank,
      );
      // Exact container-entry metadata wins over cache-era catalogue metadata.
      // It includes official art and float limits for real case outcomes, and
      // lets two staff entries for the same catalogue item render separately.
      return {
        lootEntryId: economyNumber(row.loot_entry_id, "loot entry ID", 1),
        catalogue: {
          ...catalogue,
          rarityRank,
          rarityName: economyRarityName(rarityRank),
          imageUrl: economyMetadataImageUrl(attributes) ?? catalogue.imageUrl,
          minFloat: minFloat ?? catalogue.minFloat,
          maxFloat: maxFloat ?? catalogue.maxFloat,
          metadata: { ...catalogue.metadata, ...attributes },
        },
        weight: weights[index],
        minFloat,
        maxFloat,
        stattrakChanceBps: economyNumber(
          row.stattrak_chance_bps,
          "loot StatTrak chance",
        ),
      };
    }),
  };
}

export async function getPlayerEconomyInventory(
  steamId: string,
  filter: EconomyInventoryFilter = {},
): Promise<EconomyInventoryPage> {
  economySteamId(steamId);
  const pool = getPortalPool();
  const paging = economyPage(filter.page, filter.pageSize);
  if (!pool)
    return {
      items: [],
      total: 0,
      page: paging.page,
      pageSize: paging.pageSize,
    };
  const itemTypes = economyFilterItemTypes(filter.itemTypes);
  const rarityRanks = economyFilterRarityRanks(filter.rarityRanks);
  const states = economyFilterStates(filter.states);
  const where: string[] = ["i.owner_steam_id = ?"];
  const values: unknown[] = [steamId];
  if (states.length) {
    where.push("i.state IN (" + states.map(() => "?").join(", ") + ")");
    values.push(...states);
  } else if (filter.includeAttached) {
    // Escrowed instances are currently reserved by a pending trade. They are
    // intentionally absent from player Inventory and Crates until the trade
    // is accepted, rejected, cancelled, or expires. Staff views pass an
    // explicit state filter and still retain their audit visibility.
    where.push("i.state IN ('available', 'attached')");
  } else {
    where.push("i.state = 'available'");
  }
  if (itemTypes.length) {
    where.push("i.item_type IN (" + itemTypes.map(() => "?").join(", ") + ")");
    values.push(...itemTypes);
  }
  if (rarityRanks.length) {
    where.push(
      "COALESCE(c.rarity_rank, i.rarity_rank) IN (" + rarityRanks.map(() => "?").join(", ") + ")",
    );
    values.push(...rarityRanks);
  }
  if (filter.query?.trim()) {
    const query =
      "%" + economyText(filter.query, "Inventory search", 120) + "%";
    where.push(
      "(c.display_name LIKE ? OR c.market_hash_name LIKE ? OR i.nametag LIKE ? OR JSON_UNQUOTE(JSON_EXTRACT(i.attributes, '$.displayName')) LIKE ?)",
    );
    values.push(query, query, query, query);
  }
  const clause = " WHERE " + where.join(" AND ");
  const [countRows] = await pool.query<
    Array<RowDataPacket & { total: number | string }>
  >(
    "SELECT COUNT(*) AS total FROM portal_inventory_items AS i LEFT JOIN portal_economy_catalogue AS c ON c.id = i.catalogue_id" +
      clause,
    values,
  );
  const [rows] = await pool.query<EconomyInventoryRow[]>(
    economyInventorySelect +
      clause +
      " ORDER BY i.acquired_at DESC, i.id DESC LIMIT ? OFFSET ?",
    [...values, paging.pageSize, paging.offset],
  );
  return {
    items: await hydrateEconomyInventory(pool, rows),
    total: economyCount(countRows),
    page: paging.page,
    pageSize: paging.pageSize,
  };
}

export async function getPlayerEconomyLoadout(
  steamId: string,
): Promise<EconomyLoadoutSlot[]> {
  economySteamId(steamId);
  const pool = getPortalPool();
  if (!pool) return [];
  const [rows] = await pool.query<EconomyLoadoutSlotRow[]>(
    "SELECT l.owner_steam_id, l.slot_key, l.slot_type, l.team, l.definition_index, l.item_id, l.updated_at, " +
      "i.item_type, c.display_name, i.definition_index AS item_definition_index, i.paintkit AS item_paintkit, i.float_value, i.nametag, i.stattrak, i.rarity_rank, c.rarity_rank AS catalogue_rarity_rank, i.attributes " +
      "FROM portal_loadout_slots AS l " +
      "LEFT JOIN portal_inventory_items AS i ON i.id = l.item_id " +
      "LEFT JOIN portal_economy_catalogue AS c ON c.id = i.catalogue_id " +
      "WHERE l.owner_steam_id = ? ORDER BY l.slot_type, l.team, l.definition_index, l.slot_key",
    [steamId],
  );
  return rows.map((row) => {
    const slotType = String(row.slot_type) as EconomyLoadoutSlotType;
    if (
      !["weapon", "knife", "glove", "agent", "music_kit"].includes(slotType)
    ) {
      economyError(
        "invalid_database_value",
        "The token economy contains an unknown loadout slot.",
      );
    }
    const itemId = row.item_id ? economyItemId(String(row.item_id)) : null;
    const itemAttributes =
      itemId && row.item_type ? economyRecord(row.attributes) : null;
    const item =
      itemId && row.item_type
        ? ({
            id: itemId,
            itemType: economyItemType(String(row.item_type)),
            displayName: row.display_name
              ? String(row.display_name)
              : economyCustomDisplayName(
                  itemAttributes ?? {},
                  economyItemType(String(row.item_type)),
                ),
            definitionIndex: economyOptionalInteger(
              row.item_definition_index,
              "loadout item definition index",
            ),
            paintkit: economyOptionalInteger(
              row.item_paintkit,
              "loadout item paintkit",
            ),
            floatValue: economyDecimal(row.float_value, "loadout item float"),
            nametag: row.nametag ? String(row.nametag) : null,
            stattrak: economyBoolean(row.stattrak),
            rarityRank: economyLootEntryRarityRank(
              itemAttributes ?? {},
              row.catalogue_rarity_rank === null
                ? economyNumber(row.rarity_rank, "loadout item rarity")
                : economyNumber(
                    row.catalogue_rarity_rank,
                    "loadout catalogue rarity",
                  ),
            ),
            attributes: itemAttributes ?? {},
          } satisfies EconomyLoadoutItem)
        : null;
    const team = row.team === "T" || row.team === "CT" ? row.team : null;
    return {
      ownerSteamId: String(row.owner_steam_id),
      slotKey: String(row.slot_key),
      slotType,
      team,
      definitionIndex: economyOptionalInteger(
        row.definition_index,
        "loadout definition index",
      ),
      itemId,
      item,
      updatedAt: economyDateToIso(row.updated_at) ?? new Date(0).toISOString(),
    };
  });
}

export async function getEconomyNotifications(
  steamId: string,
  filter: EconomyNotificationFilter = {},
): Promise<EconomyNotificationPage> {
  economySteamId(steamId);
  const pool = getPortalPool();
  const paging = economyPage(filter.page, filter.pageSize);
  if (!pool)
    return {
      notifications: [],
      total: 0,
      page: paging.page,
      pageSize: paging.pageSize,
    };
  const where = ["steam_id = ?"];
  const values: unknown[] = [steamId];
  if (filter.unreadOnly) where.push("read_at IS NULL");
  const clause = " WHERE " + where.join(" AND ");
  const [countRows] = await pool.query<
    Array<RowDataPacket & { total: number | string }>
  >(
    "SELECT COUNT(*) AS total FROM portal_economy_notifications" + clause,
    values,
  );
  const [rows] = await pool.query<
    Array<
      RowDataPacket & {
        id: number | string;
        steam_id: string;
        notification_type: string;
        payload: unknown;
        read_at: Date | string | null;
        created_at: Date | string;
      }
    >
  >(
    "SELECT id, steam_id, notification_type, payload, read_at, created_at FROM portal_economy_notifications" +
      clause +
      " ORDER BY id DESC LIMIT ? OFFSET ?",
    [...values, paging.pageSize, paging.offset],
  );
  return {
    notifications: rows.map((row) => ({
      id: economyNumber(row.id, "notification ID"),
      steamId: String(row.steam_id),
      notificationType: String(row.notification_type),
      payload: economyRecord(row.payload),
      readAt: economyDateToIso(row.read_at),
      createdAt: economyDateToIso(row.created_at) ?? new Date(0).toISOString(),
    })),
    total: economyCount(countRows),
    page: paging.page,
    pageSize: paging.pageSize,
  };
}

async function lockEconomyCatalogue(
  connection: PoolConnection,
  catalogueId: number,
  allowDisabled = false,
) {
  if (!Number.isSafeInteger(catalogueId) || catalogueId < 1)
    economyError("invalid_input", "The catalogue item is invalid.");
  const [rows] = await connection.query<EconomyCatalogueRow[]>(
    economyCatalogueSelect + "WHERE c.id = ? FOR UPDATE",
    [catalogueId],
  );
  const row = rows[0];
  if (!row)
    economyError("catalogue_not_found", "That catalogue item does not exist.");
  const item = toEconomyCatalogueItem(row);
  if (!allowDisabled && !item.enabled)
    economyError(
      "catalogue_unavailable",
      "That item is not currently available.",
    );
  return item;
}

async function lockEconomyInventoryItems(
  connection: PoolConnection,
  itemIds: string[],
  requireAll = true,
) {
  if (!itemIds.length) return new Map<string, EconomyInventoryItem>();
  const ids = [
    ...new Set(itemIds.map((itemId) => economyItemId(itemId))),
  ].sort();
  const placeholders = ids.map(() => "?").join(", ");
  const [rows] = await connection.query<EconomyInventoryRow[]>(
    economyInventorySelect +
      "WHERE i.id IN (" +
      placeholders +
      ") ORDER BY i.id FOR UPDATE",
    ids,
  );
  if (requireAll && rows.length !== ids.length)
    economyError(
      "item_not_found",
      "One or more inventory items no longer exist.",
    );
  return new Map(
    rows.map((row) => {
      const item = toEconomyInventoryItem(row);
      return [item.id, item] as const;
    }),
  );
}

async function lockEconomyInventoryItem(
  connection: PoolConnection,
  itemId: string,
) {
  const items = await lockEconomyInventoryItems(connection, [itemId]);
  const item = items.get(itemId.toLowerCase());
  if (!item)
    economyError("item_not_found", "That inventory item does not exist.");
  return item;
}

async function lockEconomyLootTable(
  connection: PoolConnection,
  input: {
    lootTableId?: number;
    lootTableCode?: string;
    containerCatalogueId?: number;
  },
) {
  let sql =
    "SELECT id, code, table_type, container_catalogue_id, display_name, enabled, metadata FROM portal_loot_tables WHERE enabled = TRUE AND ";
  let values: unknown[];
  if (input.containerCatalogueId !== undefined) {
    sql += "table_type = 'container' AND container_catalogue_id = ?";
    values = [input.containerCatalogueId];
  } else if (input.lootTableId !== undefined) {
    if (!Number.isSafeInteger(input.lootTableId) || input.lootTableId < 1)
      economyError("invalid_input", "The loot table is invalid.");
    sql += "id = ?";
    values = [input.lootTableId];
  } else if (input.lootTableCode !== undefined) {
    sql += "code = ?";
    values = [economyText(input.lootTableCode, "Loot table code", 64)];
  } else {
    economyError("invalid_input", "Choose a loot table.");
  }
  const [rows] = await connection.query<EconomyLootTableRow[]>(
    sql + " FOR UPDATE",
    values,
  );
  const table = rows[0];
  if (!table)
    economyError("loot_table_unavailable", "That loot table is unavailable.");
  return {
    id: economyNumber(table.id, "loot table ID"),
    code: String(table.code),
    tableType: table.table_type,
    containerCatalogueId: economyOptionalInteger(
      table.container_catalogue_id,
      "container catalogue ID",
    ),
    displayName: String(table.display_name),
    metadata: economyRecord(table.metadata),
  };
}

async function lockEconomyLootEntries(
  connection: PoolConnection,
  lootTableId: number,
) {
  const [rows] = await connection.query<EconomyLootEntryRow[]>(
    "SELECT id, loot_table_id, catalogue_id, weight, min_float, max_float, seed_min, seed_max, stattrak_chance_bps, attributes, enabled FROM portal_loot_entries WHERE loot_table_id = ? AND enabled = TRUE ORDER BY id FOR UPDATE",
    [lootTableId],
  );
  if (!rows.length)
    economyError("loot_table_empty", "That loot table has no enabled rewards.");
  return rows.map((row) => ({
    id: economyNumber(row.id, "loot entry ID"),
    lootTableId: economyNumber(row.loot_table_id, "loot table ID"),
    catalogueId: economyNumber(row.catalogue_id, "loot catalogue ID"),
    weight: economyNumber(row.weight, "loot weight", 1),
    minFloat: economyDecimal(row.min_float, "minimum float"),
    maxFloat: economyDecimal(row.max_float, "maximum float"),
    seedMin: economyOptionalInteger(row.seed_min, "minimum seed"),
    seedMax: economyOptionalInteger(row.seed_max, "maximum seed"),
    stattrakChanceBps: economyNumber(
      row.stattrak_chance_bps,
      "StatTrak chance",
    ),
    attributes: economyRecord(row.attributes),
  }));
}

function rollEconomyLoot<T extends { weight: number }>(entries: T[]) {
  const totalWeight = entries.reduce((total, entry) => {
    const next = total + entry.weight;
    if (!Number.isSafeInteger(next) || next > 281_474_976_710_655)
      economyError("loot_table_invalid", "The loot table weight is too large.");
    return next;
  }, 0);
  if (totalWeight < 1)
    economyError(
      "loot_table_empty",
      "That loot table has no positive reward weights.",
    );
  const rollValue = randomInt(totalWeight);
  let cursor = 0;
  for (const entry of entries) {
    cursor += entry.weight;
    if (rollValue < cursor) return { entry, rollValue, totalWeight };
  }
  economyError("loot_table_invalid", "The loot table could not be rolled.");
}

function rollEconomyInteger(minimum: number | null, maximum: number | null) {
  if (minimum === null || maximum === null) return null;
  if (
    !Number.isSafeInteger(minimum) ||
    !Number.isSafeInteger(maximum) ||
    minimum > maximum ||
    maximum - minimum > 281_474_976_710_654
  ) {
    economyError(
      "loot_table_invalid",
      "The loot table integer range is invalid.",
    );
  }
  return minimum + randomInt(maximum - minimum + 1);
}

function rollEconomyFloat(minimum: number | null, maximum: number | null) {
  if (minimum === null || maximum === null) return null;
  if (minimum < 0 || maximum > 1 || minimum > maximum)
    economyError(
      "loot_table_invalid",
      "The loot table float range is invalid.",
    );
  const fraction = randomInt(1_000_001) / 1_000_000;
  return Number((minimum + (maximum - minimum) * fraction).toFixed(6));
}

type EconomyItemCreation = {
  ownerSteamId: string;
  catalogue: EconomyCatalogueItem | null;
  // Container-entry rarity is intentionally separate from a reused catalogue
  // row: knives and gloves are Extraordinary within a case regardless of any
  // older finish-level rarity stored on that catalogue item.
  rarityRank?: number;
  customItem?: StaffCustomEconomyItem;
  customization?: StaffEconomyItemCustomization;
  source: Record<string, unknown>;
  actorSteamId: string | null;
  idempotencyKey: string;
  lineKey: string;
  eventType: string;
};

type CreatedEconomyItem = {
  id: string;
  catalogueId: number | null;
  itemType: EconomyItemType;
  definitionIndex: number | null;
  paintkit: number | null;
  seed: number | null;
  floatValue: number | null;
  stattrak: boolean;
  stattrakCount: number;
  nametag: string | null;
  rarityRank: number;
  displayName: string;
  attributes: Record<string, unknown>;
};

function economyCustomItem(input: StaffCustomEconomyItem | undefined) {
  if (!input)
    economyError(
      "invalid_input",
      "Choose a catalogue item or provide a custom item.",
    );
  const itemType = economyItemType(input.itemType);
  if (itemType === "crate" || itemType === "capsule") {
    economyError(
      "incompatible_item",
      "Custom containers must be catalogue-backed so they always have an active loot table.",
    );
  }
  const displayName = economyText(
    input.displayName,
    "Custom item display name",
    180,
  );
  const definitionIndex =
    input.definitionIndex === null || input.definitionIndex === undefined
      ? null
      : economyNumber(input.definitionIndex, "Custom definition index");
  const paintkit =
    input.paintkit === null || input.paintkit === undefined
      ? null
      : economyNumber(input.paintkit, "Custom paintkit");
  const rarityRank =
    input.rarityRank === undefined
      ? 0
      : economyNumber(input.rarityRank, "Custom rarity rank");
  return {
    itemType,
    displayName,
    definitionIndex,
    paintkit,
    rarityRank,
    metadata: input.metadata ?? {},
  };
}

async function createEconomyInventoryItem(
  connection: PoolConnection,
  input: EconomyItemCreation,
): Promise<CreatedEconomyItem> {
  const ownerSteamId = economySteamId(input.ownerSteamId);
  const catalogue = input.catalogue;
  const custom = catalogue ? null : economyCustomItem(input.customItem);
  const itemType = catalogue?.itemType ?? custom?.itemType ?? "skin";
  const definitionIndex =
    catalogue?.definitionIndex ?? custom?.definitionIndex ?? null;
  const paintkit = catalogue?.paintkit ?? custom?.paintkit ?? null;
  const rarityRank =
    input.rarityRank === undefined
      ? catalogue?.rarityRank ?? custom?.rarityRank ?? 0
      : economyNumber(input.rarityRank, "Item rarity rank");
  const displayName = catalogue?.displayName ?? custom?.displayName ?? itemType;
  const baseMetadata = catalogue?.metadata ?? custom?.metadata ?? {};
  const requested = input.customization ?? {};
  const defaultSeed =
    economyMetadataInteger(baseMetadata, "seed") ??
    economyMetadataInteger(baseMetadata, "defaultSeed");
  const defaultFloat =
    economyMetadataDecimal(baseMetadata, "floatValue") ??
    economyMetadataDecimal(baseMetadata, "defaultFloat");
  const defaultStattrakCount =
    economyMetadataInteger(baseMetadata, "stattrakCount") ?? 0;
  const seed =
    requested.seed === undefined
      ? economySeed(defaultSeed, "Item seed")
      : economySeed(requested.seed, "Item seed");
  const floatValue =
    requested.floatValue === undefined
      ? economyFloat(defaultFloat, "Item float")
      : economyFloat(requested.floatValue, "Item float");
  const stattrakCount =
    requested.stattrakCount === undefined
      ? economyAmount(defaultStattrakCount, "StatTrak count")
      : economyAmount(requested.stattrakCount, "StatTrak count");
  const stattrak =
    requested.stattrak ??
    (economyMetadataBoolean(baseMetadata, "stattrak") || stattrakCount > 0);
  const nametag = economyNullableText(requested.nametag, "Name tag", 128);
  const attributes = { ...baseMetadata, ...(requested.attributes ?? {}) };
  if (!catalogue) attributes.displayName = displayName;
  const id = randomUUID().toLowerCase();

  await connection.execute(
    "INSERT INTO portal_inventory_items (id, owner_steam_id, catalogue_id, item_type, definition_index, paintkit, seed, float_value, stattrak, stattrak_count, nametag, rarity_rank, state, attributes, source) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'available', ?, ?)",
    [
      id,
      ownerSteamId,
      catalogue?.id ?? null,
      itemType,
      definitionIndex,
      paintkit,
      seed,
      floatValue,
      stattrak,
      stattrakCount,
      nametag,
      rarityRank,
      JSON.stringify(attributes),
      JSON.stringify(input.source),
    ],
  );
  await writeInventoryEvent({
    connection,
    itemId: id,
    actorSteamId: input.actorSteamId,
    eventType: input.eventType,
    idempotencyKey: input.idempotencyKey,
    lineKey: input.lineKey,
    afterState: {
      ownerSteamId,
      state: "available",
      nametag,
      stattrak,
      stattrakCount,
      seed,
      floatValue,
    },
    metadata: { catalogueId: catalogue?.id ?? null, itemType, displayName },
  });
  return {
    id,
    catalogueId: catalogue?.id ?? null,
    itemType,
    definitionIndex,
    paintkit,
    seed,
    floatValue,
    stattrak,
    stattrakCount,
    nametag,
    rarityRank,
    displayName,
    attributes,
  };
}

function economyInventorySnapshot(item: EconomyInventoryItem) {
  return {
    ownerSteamId: item.ownerSteamId,
    state: item.state,
    seed: item.seed,
    floatValue: item.floatValue,
    stattrak: item.stattrak,
    stattrakCount: item.stattrakCount,
    nametag: item.nametag,
    attributes: item.attributes,
  };
}

async function clearEconomyLoadoutSlots(
  connection: PoolConnection,
  ownerSteamId: string,
  itemIds: string[],
) {
  if (!itemIds.length) return;
  const placeholders = itemIds.map(() => "?").join(", ");
  await connection.execute(
    "UPDATE portal_loadout_slots SET item_id = NULL WHERE owner_steam_id = ? AND item_id IN (" +
      placeholders +
      ")",
    [ownerSteamId, ...itemIds],
  );
}

async function moveAttachedStickersWithWeapon(
  connection: PoolConnection,
  weaponItemIds: string[],
  newOwnerSteamId: string,
) {
  if (!weaponItemIds.length) return;
  const placeholders = weaponItemIds.map(() => "?").join(", ");
  await connection.execute(
    "UPDATE portal_inventory_items AS sticker INNER JOIN portal_inventory_item_stickers AS attachment ON attachment.sticker_item_id = sticker.id SET sticker.owner_steam_id = ? WHERE attachment.weapon_item_id IN (" +
      placeholders +
      ")",
    [newOwnerSteamId, ...weaponItemIds],
  );
}

async function getEconomyPlayerDisplayName(steamId: string) {
  const rows = await safeGameQuery<RowDataPacket & { name: string }>(
    "SELECT name FROM lvl_base WHERE steam = ? LIMIT 1",
    [steamId],
  );
  return rows[0]?.name?.trim() || steamId;
}

export async function setEconomyCatalogueMarketHash(
  input: SetEconomyCatalogueMarketHashInput,
): Promise<SetEconomyCatalogueMarketHashResult> {
  const catalogueId = economyNumber(input.catalogueId, "Catalogue item ID", 1);
  const marketHashName = economyText(
    input.marketHashName,
    "Exact public market-hash name",
    255,
  );
  return runEconomyMutation({
    operationName: "catalogue.market_hash.set",
    actorSteamId: input.actorSteamId,
    idempotencyKey: input.idempotencyKey,
    request: { catalogueId, marketHashName },
    work: async (context) => {
      const catalogue = await lockEconomyCatalogue(
        context.connection,
        catalogueId,
        true,
      );
      await context.connection.execute(
        "UPDATE portal_economy_catalogue SET market_hash_name = ? WHERE id = ?",
        [marketHashName, catalogueId],
      );
      // A snapshot belongs to a specific market variant. Never reuse a
      // previous variant's price after staff corrects this identity.
      await context.connection.execute(
        "UPDATE portal_economy_catalogue_prices SET is_current = FALSE WHERE catalogue_id = ? AND is_current = TRUE",
        [catalogueId],
      );
      await writeEconomyAdminAudit({
        connection: context.connection,
        actorSteamId: context.actorSteamId,
        action: "catalogue.market_hash.set",
        targetType: "catalogue-item",
        targetId: String(catalogueId),
        idempotencyKey: context.idempotencyKey,
        metadata: {
          previousMarketHashName: catalogue.marketHashName,
          marketHashName,
        },
      });
      return { catalogueId, marketHashName };
    },
  });
}

export async function recordEconomyPrice(
  input: RecordEconomyPriceInput,
): Promise<RecordEconomyPriceResult> {
  const catalogueId = economyNumber(input.catalogueId, "Catalogue item ID", 1);
  const eurCents = economyAmount(input.eurCents, "EUR-cent price");
  const source = economyText(input.source, "Price source", 32);
  const sourceReference = input.sourceReference
    ? economyText(input.sourceReference, "Price source reference", 255)
    : null;
  return runEconomyMutation({
    operationName: "catalogue.price.record",
    actorSteamId: input.actorSteamId,
    idempotencyKey: input.idempotencyKey,
    request: { catalogueId, eurCents, source, sourceReference },
    work: async (context) => {
      await lockEconomyCatalogue(context.connection, catalogueId, true);
      await context.connection.execute(
        "UPDATE portal_economy_catalogue_prices SET is_current = FALSE WHERE catalogue_id = ? AND is_current = TRUE",
        [catalogueId],
      );
      const [result] = await context.connection.execute<ResultSetHeader>(
        "INSERT INTO portal_economy_catalogue_prices (catalogue_id, market_price_eur_cents, price_source, source_reference, is_current) VALUES (?, ?, ?, ?, TRUE)",
        [catalogueId, eurCents, source, sourceReference],
      );
      const [priceRows] = await context.connection.query<EconomyCatalogueRow[]>(
        "SELECT id AS price_id, market_price_eur_cents, token_price, price_source, source_reference, observed_at FROM portal_economy_catalogue_prices WHERE id = ? FOR UPDATE",
        [Number(result.insertId)],
      );
      const price = toEconomyCataloguePrice(priceRows[0] ?? {});
      if (!price)
        economyError(
          "price_unavailable",
          "The new catalogue price was not saved.",
        );
      await writeEconomyAdminAudit({
        connection: context.connection,
        actorSteamId: context.actorSteamId,
        action: "catalogue.price.recorded",
        targetType: "catalogue-item",
        targetId: String(catalogueId),
        idempotencyKey: context.idempotencyKey,
        metadata: { eurCents, source, sourceReference },
      });
      return { catalogueId, price };
    },
  });
}

const marketplacePurchasePriceSources = new Set([
  "skinport-30d-median",
  "skinport-7d-median",
  "skinport-90d-median",
  "skinport-listing-median",
  "skinport-listing-mean",
  "skinport-listing-suggested",
  "staff-last-known",
]);

const marketplaceWearLabels = new Set([
  "Factory New",
  "Minimal Wear",
  "Field-Tested",
  "Well-Worn",
  "Battle-Scarred",
]);

function economyMarketplaceQuoteAmount(value: number, field: string) {
  if (!Number.isSafeInteger(value) || value < 1 || value > 1_000_000_000) {
    economyError("invalid_input", `${field} is invalid.`);
  }
  return value;
}

function economyMarketplaceQuoteText(
  value: string | null,
  field: string,
  maximum: number,
) {
  if (value === null) return null;
  return economyNullableText(value, field, maximum);
}

function economyMarketplaceQuoteKey(value: string | null) {
  return (value ?? "")
    .normalize("NFKC")
    .replace(/\s+/g, " ")
    .trim()
    .toLocaleLowerCase("en-US");
}

function economyResolvedMarketplacePurchaseQuote(
  quote: ResolvedMarketplacePurchaseQuote,
): ResolvedMarketplacePurchaseQuote {
  const baseEuroCents = economyMarketplaceQuoteAmount(
    quote.baseEuroCents,
    "Base public price",
  );
  const euroCents = economyMarketplaceQuoteAmount(
    quote.euroCents,
    "Float-adjusted public price",
  );
  const source = economyText(quote.source, "Public price source", 32);
  if (!marketplacePurchasePriceSources.has(source)) {
    economyError("invalid_input", "The public price source is invalid.");
  }
  const sourceReference = economyMarketplaceQuoteText(
    quote.sourceReference,
    "Public price reference",
    255,
  );
  if (source.startsWith("skinport-")) {
    if (!sourceReference) {
      economyError("invalid_input", "The public price reference is missing.");
    }
    try {
      const url = new URL(sourceReference);
      const hostname = url.hostname.toLocaleLowerCase("en-US");
      if (
        url.protocol !== "https:" ||
        (hostname !== "skinport.com" && !hostname.endsWith(".skinport.com"))
      ) {
        economyError("invalid_input", "The public price reference is invalid.");
      }
    } catch {
      economyError("invalid_input", "The public price reference is invalid.");
    }
  }
  const marketHashName = economyMarketplaceQuoteText(
    quote.marketHashName,
    "Quoted market item",
    255,
  );
  const marketVersion = economyMarketplaceQuoteText(
    quote.marketVersion,
    "Quoted market version",
    120,
  );
  const floatValue = economyFloat(quote.floatValue, "Quoted float");
  if (floatValue === null)
    economyError("invalid_input", "The quoted float is invalid.");
  const wear = economyText(quote.wear, "Quoted exterior", 32);
  if (!marketplaceWearLabels.has(wear)) {
    economyError("invalid_input", "The quoted exterior is invalid.");
  }
  if (
    !Number.isSafeInteger(quote.floatDiscountBps) ||
    quote.floatDiscountBps < 0 ||
    quote.floatDiscountBps > 1_500
  ) {
    economyError("invalid_input", "The float price adjustment is invalid.");
  }
  if (quote.pricingRule !== "float-linear-v1") {
    economyError("invalid_input", "The float price rule is invalid.");
  }
  return {
    baseEuroCents,
    euroCents,
    source,
    sourceReference,
    marketHashName,
    marketVersion,
    floatValue,
    wear,
    floatDiscountBps: quote.floatDiscountBps,
    pricingRule: quote.pricingRule,
  };
}

function economyResolvedMarketSalePrice(
  quote: ResolvedEconomyMarketSalePrice,
): ResolvedEconomyMarketSalePrice {
  const tokenPrice = economyMarketplaceQuoteAmount(
    quote.tokenPrice,
    "Quoted market Token price",
  );
  const euroCents = economyMarketplaceQuoteAmount(
    quote.euroCents,
    "Quoted market EUR-cent price",
  );
  // The portal deliberately maps one EUR cent to one Token. Keeping both
  // values in the trusted route payload makes the ledger audit clear while
  // stopping a stale or malformed server integration from drifting them apart.
  if (tokenPrice !== euroCents) {
    economyError("invalid_input", "The quoted market price is inconsistent.");
  }
  const source = economyText(quote.source, "Public price source", 32);
  if (!marketplacePurchasePriceSources.has(source)) {
    economyError("invalid_input", "The public price source is invalid.");
  }
  const sourceReference = economyMarketplaceQuoteText(
    quote.sourceReference,
    "Public price reference",
    255,
  );
  const floatValue = economyFloat(quote.floatValue, "Quoted float");
  if (
    quote.floatDiscountBps !== null &&
    (!Number.isSafeInteger(quote.floatDiscountBps) ||
      quote.floatDiscountBps < 0 ||
      quote.floatDiscountBps > 1_500)
  ) {
    economyError("invalid_input", "The float price adjustment is invalid.");
  }
  return {
    tokenPrice,
    euroCents,
    source,
    sourceReference,
    floatValue,
    floatDiscountBps: quote.floatDiscountBps,
  };
}

function economyValidateResolvedMarketplaceQuote(input: {
  catalogue: EconomyCatalogueItem;
  requestedFloat: number;
  quote: ResolvedMarketplacePurchaseQuote;
}) {
  const identity = deriveMarketplacePriceIdentity({
    itemType: input.catalogue.itemType,
    displayName: input.catalogue.displayName,
    marketHashName: input.catalogue.marketHashName,
    metadata: input.catalogue.metadata,
    minFloat: input.catalogue.minFloat,
    maxFloat: input.catalogue.maxFloat,
    floatValue: input.requestedFloat,
  });
  if (
    !identity.floatRange ||
    identity.floatValue === null ||
    identity.wear === null ||
    identity.floatValue !== input.requestedFloat ||
    input.quote.floatValue !== input.requestedFloat ||
    input.quote.wear !== identity.wear
  ) {
    economyError("invalid_input", "The quoted float does not match this item.");
  }
  const expectedDiscount = marketplaceFloatDiscountBps(
    identity.floatRange,
    identity.floatValue,
  );
  if (input.quote.floatDiscountBps !== expectedDiscount) {
    economyError("invalid_input", "The float price adjustment is stale.");
  }
  if (
    input.quote.euroCents !==
    adjustedMarketplaceEuroCents(
      input.quote.baseEuroCents,
      input.quote.floatDiscountBps,
    )
  ) {
    economyError("invalid_input", "The float-adjusted price is invalid.");
  }
  const quoteName = economyMarketplaceQuoteKey(input.quote.marketHashName);
  const quoteVersion = economyMarketplaceQuoteKey(input.quote.marketVersion);
  const matchingCandidate = identity.candidates.some(
    (candidate) =>
      economyMarketplaceQuoteKey(candidate.marketHashName) === quoteName &&
      economyMarketplaceQuoteKey(candidate.marketVersion) === quoteVersion,
  );
  if (!matchingCandidate) {
    economyError("invalid_input", "The quoted market item does not match this item.");
  }
}

export async function purchaseEconomyItem(
  input: PurchaseEconomyItemInput,
): Promise<PurchaseEconomyItemResult> {
  const steamId = economySteamId(input.steamId);
  const catalogueId = economyNumber(input.catalogueId, "Catalogue item ID", 1);
  const quantity = input.quantity ?? 1;
  if (!Number.isSafeInteger(quantity) || quantity < 1 || quantity > 50)
    economyError("invalid_input", "Choose a quantity between 1 and 50.");
  const requestedFloat =
    input.floatValue === undefined
      ? undefined
      : economyFloat(input.floatValue, "Requested float");
  if (requestedFloat === null)
    economyError("invalid_input", "Requested float must be between 0 and 1.");
  const resolvedMarketQuote =
    input.resolvedMarketQuote === undefined
      ? undefined
      : economyResolvedMarketplacePurchaseQuote(input.resolvedMarketQuote);
  return runEconomyMutation({
    operationName: "marketplace.purchase",
    actorSteamId: steamId,
    idempotencyKey: input.idempotencyKey,
    request: { catalogueId, quantity, floatValue: requestedFloat },
    work: async (context) => {
      const catalogue = await lockEconomyCatalogue(
        context.connection,
        catalogueId,
      );
      const skinLike = economyIsSkinLike(catalogue.itemType);
      if (
        quantity > 1 &&
        catalogue.itemType !== "crate" &&
        catalogue.itemType !== "capsule"
      ) {
        economyError(
          "incompatible_item",
          "Only crates and capsules can be purchased in a batch.",
        );
      }
      if (requestedFloat !== undefined) {
        const floatRange = economyCatalogueFloatRange(
          catalogue.itemType,
          catalogue.metadata,
        );
        if (!floatRange) {
          economyError(
            "incompatible_item",
            "Only skins, knives, and gloves can be purchased with a float.",
          );
        }
        if (
          requestedFloat < floatRange.min ||
          requestedFloat > floatRange.max
        ) {
          economyError(
            "invalid_input",
            `Choose a float between ${floatRange.min.toFixed(6)} and ${floatRange.max.toFixed(6)} for this item.`,
          );
        }
      }
      if (skinLike && requestedFloat === undefined) {
        economyError(
          "invalid_input",
          "Choose a float before buying a skin, knife, or gloves.",
        );
      }
      if (resolvedMarketQuote && (!skinLike || requestedFloat === undefined)) {
        economyError(
          "incompatible_item",
          "Only a skin, knife, or gloves can use a float-specific price.",
        );
      }
      if (skinLike && !resolvedMarketQuote) {
        economyError(
          "price_unavailable",
          "No current float-specific public price is available for this item.",
        );
      }
      if (resolvedMarketQuote && requestedFloat !== undefined) {
        economyValidateResolvedMarketplaceQuote({
          catalogue,
          requestedFloat,
          quote: resolvedMarketQuote,
        });
      }
      const priceTokens = resolvedMarketQuote
        ? economyDirectPurchasePriceFromEuroCents(
            catalogue.itemType,
            resolvedMarketQuote.euroCents,
          )
        : economyDirectPurchasePrice(catalogue.itemType, catalogue.price);
      if (priceTokens === null)
        economyError(
          "price_unavailable",
          "That item has no current market or last-known price.",
        );
      const totalPriceTokens = priceTokens * quantity;
      if (!Number.isSafeInteger(totalPriceTokens))
        economyError("invalid_input", "The total purchase price is too large.");
      if (catalogue.itemType === "crate" || catalogue.itemType === "capsule") {
        const table = await lockEconomyLootTable(context.connection, {
          containerCatalogueId: catalogue.id,
        });
        await lockEconomyLootEntries(context.connection, table.id);
      }
      const wallets = await lockTokenAccounts(context.connection, [steamId]);
      if (totalPriceTokens > 0) {
        await applyTokenDelta({
          connection: context.connection,
          wallets,
          steamId,
          delta: -totalPriceTokens,
          reason: "marketplace.purchase",
          referenceType: "catalogue-item",
          referenceId: String(catalogue.id),
          idempotencyKey: context.idempotencyKey,
          lineKey: "purchase:debit",
          actorSteamId: steamId,
          metadata: {
            priceEurCents:
              resolvedMarketQuote?.euroCents ?? catalogue.price?.euroCents ?? null,
            basePriceEurCents: resolvedMarketQuote?.baseEuroCents ?? null,
            priceSource:
              resolvedMarketQuote?.source ?? catalogue.price?.source ?? null,
            priceSourceReference:
              resolvedMarketQuote?.sourceReference ??
              catalogue.price?.sourceReference ??
              null,
            quoteMarketHashName: resolvedMarketQuote?.marketHashName ?? null,
            quoteMarketVersion: resolvedMarketQuote?.marketVersion ?? null,
            quoteWear: resolvedMarketQuote?.wear ?? null,
            floatDiscountBps: resolvedMarketQuote?.floatDiscountBps ?? null,
            floatPricingRule: resolvedMarketQuote?.pricingRule ?? null,
            itemType: catalogue.itemType,
            quantity,
            unitPriceTokens: priceTokens,
            totalPriceTokens,
          },
        });
      }
      const items = [];
      for (let index = 0; index < quantity; index += 1) {
        const item = await createEconomyInventoryItem(context.connection, {
          ownerSteamId: steamId,
          catalogue,
          customization:
            requestedFloat === undefined
              ? undefined
              : { floatValue: requestedFloat },
          source: {
            type: "marketplace_purchase",
            catalogueId: catalogue.id,
            priceTokens,
            totalPriceTokens,
            quantity,
            itemPosition: index + 1,
            priceEurCents:
              resolvedMarketQuote?.euroCents ?? catalogue.price?.euroCents ?? null,
            basePriceEurCents: resolvedMarketQuote?.baseEuroCents ?? null,
            priceSource:
              resolvedMarketQuote?.source ?? catalogue.price?.source ?? null,
            priceSourceReference:
              resolvedMarketQuote?.sourceReference ??
                catalogue.price?.sourceReference ??
                null,
            quoteMarketHashName: resolvedMarketQuote?.marketHashName ?? null,
            quoteMarketVersion: resolvedMarketQuote?.marketVersion ?? null,
            quoteWear: resolvedMarketQuote?.wear ?? null,
            floatDiscountBps: resolvedMarketQuote?.floatDiscountBps ?? null,
            floatPricingRule: resolvedMarketQuote?.pricingRule ?? null,
            requestedFloat: requestedFloat ?? null,
          },
          actorSteamId: steamId,
          idempotencyKey: context.idempotencyKey,
          lineKey: `purchase:item:${index + 1}`,
          eventType: "marketplace.purchased",
        });
        items.push(item);
      }
      const wallet = wallets.get(steamId);
      if (!wallet)
        economyError(
          "wallet_unavailable",
          "The purchase wallet was not locked.",
        );
      return {
        itemId: items[0].id,
        itemIds: items.map((item) => item.id),
        catalogueId: catalogue.id,
        quantity,
        priceTokens,
        totalPriceTokens,
        floatValue: items[0].floatValue,
        wallet,
      };
    },
  });
}

/**
 * Buys an owned inventory instance back for 10% of the price resolved by the
 * same public adapter as the portal Market. The saved market snapshot remains
 * the fallback when the public database has no current quote.
 */
export async function sellEconomyItem(
  input: SellEconomyItemInput,
): Promise<SellEconomyItemResult> {
  const steamId = economySteamId(input.steamId);
  const itemId = economyItemId(input.itemId);
  const marketQuote =
    input.marketQuote === undefined
      ? undefined
      : economyResolvedMarketSalePrice(input.marketQuote);
  return runEconomyMutation({
    operationName: "marketplace.sale",
    actorSteamId: steamId,
    idempotencyKey: input.idempotencyKey,
    request: { itemId, marketQuote },
    work: async (context) => {
      // Wallet-before-item locking is shared with paid item customisation and
      // keeps concurrent trade/loadout changes from creating inconsistent
      // balances or stale ownership decisions.
      const wallets = await lockTokenAccounts(context.connection, [steamId]);
      const item = await lockEconomyInventoryItem(context.connection, itemId);
      if (item.ownerSteamId !== steamId || item.state !== "available") {
        economyError(
          "ownership_required",
          "That item is not available to sell from your inventory.",
        );
      }
      if (!item.catalogue) {
        economyError(
          "price_unavailable",
          "This item has no current market or last-known price.",
        );
      }
      const [attachedStickerRows] = await context.connection.query<
        Array<RowDataPacket & { sticker_item_id: string }>
      >(
        "SELECT sticker_item_id FROM portal_inventory_item_stickers WHERE weapon_item_id = ? FOR UPDATE",
        [itemId],
      );
      if (attachedStickerRows.length) {
        economyError(
          "item_customized",
          "Remove the attached stickers before selling this item.",
        );
      }

      const fallbackPrice = item.catalogue.price;
      if (
        !marketQuote &&
        (!fallbackPrice || economyPriceIsLegacySteam(fallbackPrice))
      ) {
        economyError(
          "price_unavailable",
          "This item has no current market or last-known price.",
        );
      }
      const marketPriceTokens =
        marketQuote?.tokenPrice ?? fallbackPrice?.tokenPrice;
      if (!marketPriceTokens) {
        economyError(
          "price_unavailable",
          "This item has no current market or last-known price.",
        );
      }
      // Low-value market items still have a meaningful, predictable return:
      // anything below 50 Tokens sells for the 5-Token minimum.
      const payoutTokens = Math.max(5, Math.floor(marketPriceTokens / 10));

      await applyTokenDelta({
        connection: context.connection,
        wallets,
        steamId,
        delta: payoutTokens,
        reason: "marketplace.sale",
        referenceType: "inventory-item",
        referenceId: itemId,
        idempotencyKey: context.idempotencyKey,
        lineKey: "sale:credit",
        actorSteamId: steamId,
        metadata: {
          marketPriceTokens,
          marketPriceEurCents:
            marketQuote?.euroCents ?? fallbackPrice?.euroCents,
          payoutTokens,
          sellRateBps: 1_000,
          priceSource: marketQuote?.source ?? fallbackPrice?.source,
          priceSourceReference:
            marketQuote?.sourceReference ?? fallbackPrice?.sourceReference,
          floatValue: marketQuote?.floatValue ?? item.floatValue,
          floatDiscountBps: marketQuote?.floatDiscountBps ?? null,
        },
      });
      await context.connection.execute(
        "UPDATE portal_inventory_items SET state = 'consumed', consumed_at = CURRENT_TIMESTAMP WHERE id = ? AND owner_steam_id = ? AND state = 'available'",
        [itemId, steamId],
      );
      await clearEconomyLoadoutSlots(context.connection, steamId, [itemId]);
      await writeInventoryEvent({
        connection: context.connection,
        itemId,
        actorSteamId: steamId,
        eventType: "marketplace.sold",
        idempotencyKey: context.idempotencyKey,
        lineKey: "sale:item",
        beforeState: economyInventorySnapshot(item),
        afterState: { ...economyInventorySnapshot(item), state: "consumed" },
        metadata: {
          marketPriceTokens,
          payoutTokens,
          sellRateBps: 1_000,
          priceSource: marketQuote?.source ?? fallbackPrice?.source,
          priceSourceReference:
            marketQuote?.sourceReference ?? fallbackPrice?.sourceReference,
          floatValue: marketQuote?.floatValue ?? item.floatValue,
          floatDiscountBps: marketQuote?.floatDiscountBps ?? null,
        },
      });
      await enqueueEconomyLoadoutRefresh(
        context.connection,
        steamId,
        context.idempotencyKey,
        "sold",
        [itemId],
      );
      const wallet = wallets.get(steamId);
      if (!wallet)
        economyError(
          "wallet_unavailable",
          "The sale wallet was not locked.",
        );
      return { itemId, marketPriceTokens, payoutTokens, wallet };
    },
  });
}

export async function openEconomyCrate(
  input: OpenEconomyCrateInput,
): Promise<OpenEconomyCrateResult> {
  const steamId = economySteamId(input.steamId);
  const crateItemId = economyItemId(input.crateItemId, "Crate item ID");
  const playerName = await getEconomyPlayerDisplayName(steamId);
  return runEconomyMutation({
    operationName: "crate.open",
    actorSteamId: steamId,
    idempotencyKey: input.idempotencyKey,
    request: { crateItemId },
    work: async (context) => {
      const crate = await lockEconomyInventoryItem(
        context.connection,
        crateItemId,
      );
      if (crate.ownerSteamId !== steamId || crate.state !== "available")
        economyError(
          "ownership_required",
          "That crate is not available in your inventory.",
        );
      if (
        (crate.itemType !== "crate" && crate.itemType !== "capsule") ||
        crate.catalogueId === null
      ) {
        economyError("not_a_crate", "That item cannot be opened as a crate.");
      }
      const lootTable = await lockEconomyLootTable(context.connection, {
        containerCatalogueId: crate.catalogueId,
      });
      const lootEntries = await lockEconomyLootEntries(
        context.connection,
        lootTable.id,
      );
      const roll = rollEconomyLoot(lootEntries);
      const rewardCatalogue = await lockEconomyCatalogue(
        context.connection,
        roll.entry.catalogueId,
        true,
      );
      const stattrak =
        economyIsSkinLike(rewardCatalogue.itemType) &&
        randomInt(10_000) < roll.entry.stattrakChanceBps;
      const reward = await createEconomyInventoryItem(context.connection, {
        ownerSteamId: steamId,
        catalogue: rewardCatalogue,
        rarityRank: economyLootEntryRarityRank(
          roll.entry.attributes,
          rewardCatalogue.rarityRank,
        ),
        customization: {
          seed: rollEconomyInteger(roll.entry.seedMin, roll.entry.seedMax),
          floatValue: rollEconomyFloat(
            roll.entry.minFloat,
            roll.entry.maxFloat,
          ),
          stattrak,
          attributes: roll.entry.attributes,
        },
        source: {
          type: "crate_opening",
          crateItemId,
          lootTableId: lootTable.id,
          lootEntryId: roll.entry.id,
          rollValue: roll.rollValue,
          totalWeight: roll.totalWeight,
        },
        actorSteamId: steamId,
        idempotencyKey: context.idempotencyKey,
        lineKey: "crate:reward",
        eventType: "crate.rewarded",
      });
      await context.connection.execute(
        "UPDATE portal_inventory_items SET state = 'consumed', consumed_at = CURRENT_TIMESTAMP WHERE id = ? AND state = 'available'",
        [crateItemId],
      );
      await writeInventoryEvent({
        connection: context.connection,
        itemId: crateItemId,
        actorSteamId: steamId,
        eventType: "crate.opened",
        idempotencyKey: context.idempotencyKey,
        lineKey: "crate:consumed",
        beforeState: economyInventorySnapshot(crate),
        afterState: { ...economyInventorySnapshot(crate), state: "consumed" },
        metadata: {
          lootTableId: lootTable.id,
          lootEntryId: roll.entry.id,
          rewardItemId: reward.id,
        },
      });
      const [openingResult] = await context.connection.execute<ResultSetHeader>(
        "INSERT INTO portal_crate_openings (steam_id, crate_item_id, loot_table_id, loot_entry_id, reward_item_id, roll_value, total_weight, idempotency_key, metadata) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)",
        [
          steamId,
          crateItemId,
          lootTable.id,
          roll.entry.id,
          reward.id,
          roll.rollValue,
          roll.totalWeight,
          context.idempotencyKey,
          JSON.stringify({ containerCode: lootTable.code, playerName }),
        ],
      );
      const openingId = Number(openingResult.insertId);
      const globalAnnouncementQueued =
        reward.rarityRank >= ECONOMY_PINK_RARITY_RANK;
      await createEconomyNotification({
        connection: context.connection,
        steamId,
        notificationType: "crate.opened",
        payload: {
          openingId,
          crateItemId,
          rewardItemId: reward.id,
          displayName: reward.displayName,
          rarityRank: reward.rarityRank,
        },
      });
      if (globalAnnouncementQueued) {
        // The job is inserted in the same transaction and becomes visible to
        // TAPPED.Inventory only after this opening commits.
        await enqueueEconomyJob({
          connection: context.connection,
          jobType: "economy.unbox.announce",
          targetSteamId: steamId,
          idempotencyKey: economyJobKey(
            context.idempotencyKey,
            "unbox-announce",
          ),
          payload: {
            steamId,
            playerName,
            itemId: reward.id,
            itemName: reward.displayName,
            rarityRank: reward.rarityRank,
            openingId,
          },
        });
      }
      return {
        openingId,
        crateItemId,
        rewardItemId: reward.id,
        rewardCatalogueId: rewardCatalogue.id,
        rewardLootEntryId: roll.entry.id,
        rewardRarityRank: reward.rarityRank,
        reward: {
          id: reward.id,
          catalogueId: reward.catalogueId,
          itemType: reward.itemType,
          displayName: reward.displayName,
          definitionIndex: reward.definitionIndex,
          paintkit: reward.paintkit,
          seed: reward.seed,
          floatValue: reward.floatValue,
          stattrak: reward.stattrak,
          stattrakCount: reward.stattrakCount,
          nametag: reward.nametag,
          rarityRank: reward.rarityRank,
          attributes: reward.attributes,
        },
        globalAnnouncementQueued,
      };
    },
  });
}

export async function awardEconomyDrop(
  input: AwardEconomyDropInput,
): Promise<AwardEconomyDropResult> {
  const steamId = economySteamId(input.steamId);
  if (
    (input.lootTableId === undefined) ===
    (input.lootTableCode === undefined)
  ) {
    economyError("invalid_input", "Provide exactly one loot table ID or code.");
  }
  if (!["hourly", "map_end", "manual"].includes(input.source))
    economyError("invalid_input", "The drop source is invalid.");
  const metadata = economyRecord(input.metadata);
  return runEconomyMutation({
    operationName: "drop.award",
    actorSteamId: steamId,
    idempotencyKey: input.idempotencyKey,
    request: {
      source: input.source,
      lootTableId: input.lootTableId,
      lootTableCode: input.lootTableCode,
      metadata,
    },
    work: async (context) => {
      // Drops can be a player's first economy interaction. Locking/creating the
      // wallet keeps token-account discovery and inventory ownership in sync.
      await lockTokenAccounts(context.connection, [steamId]);
      const lootTable = await lockEconomyLootTable(context.connection, {
        lootTableId: input.lootTableId,
        lootTableCode: input.lootTableCode,
      });
      if (lootTable.tableType !== "drop")
        economyError(
          "invalid_input",
          "Only a drop loot table can award a random drop.",
        );
      const lootEntries = await lockEconomyLootEntries(
        context.connection,
        lootTable.id,
      );
      const roll = rollEconomyLoot(lootEntries);
      const catalogue = await lockEconomyCatalogue(
        context.connection,
        roll.entry.catalogueId,
        true,
      );
      const stattrak =
        economyIsSkinLike(catalogue.itemType) &&
        randomInt(10_000) < roll.entry.stattrakChanceBps;
      const item = await createEconomyInventoryItem(context.connection, {
        ownerSteamId: steamId,
        catalogue,
        customization: {
          seed: rollEconomyInteger(roll.entry.seedMin, roll.entry.seedMax),
          floatValue: rollEconomyFloat(
            roll.entry.minFloat,
            roll.entry.maxFloat,
          ),
          stattrak,
          attributes: roll.entry.attributes,
        },
        source: {
          type: "random_drop",
          dropSource: input.source,
          lootTableId: lootTable.id,
          lootEntryId: roll.entry.id,
          rollValue: roll.rollValue,
          totalWeight: roll.totalWeight,
          ...metadata,
        },
        actorSteamId: steamId,
        idempotencyKey: context.idempotencyKey,
        lineKey: "drop:item",
        eventType: "drop.awarded",
      });
      const [awardResult] = await context.connection.execute<ResultSetHeader>(
        "INSERT INTO portal_drop_awards (steam_id, drop_source, loot_table_id, loot_entry_id, item_id, roll_value, total_weight, idempotency_key, metadata) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)",
        [
          steamId,
          input.source,
          lootTable.id,
          roll.entry.id,
          item.id,
          roll.rollValue,
          roll.totalWeight,
          context.idempotencyKey,
          JSON.stringify(metadata),
        ],
      );
      const awardId = Number(awardResult.insertId);
      await createEconomyNotification({
        connection: context.connection,
        steamId,
        notificationType: "drop.awarded",
        payload: {
          awardId,
          itemId: item.id,
          displayName: item.displayName,
          rarityRank: item.rarityRank,
          source: input.source,
        },
      });
      await enqueueEconomyJob({
        connection: context.connection,
        jobType: "economy.drop.awarded",
        targetSteamId: steamId,
        idempotencyKey: economyJobKey(context.idempotencyKey, "drop-award"),
        payload: {
          steamId,
          awardId,
          itemId: item.id,
          itemName: item.displayName,
          rarityRank: item.rarityRank,
          source: input.source,
        },
      });
      return {
        awardId,
        itemId: item.id,
        catalogueId: catalogue.id,
        rarityRank: item.rarityRank,
      };
    },
  });
}

function economyLoadoutResult(
  slot: ReturnType<typeof economySlot>,
  ownerSteamId: string,
  item: EconomyInventoryItem | null,
): EconomyLoadoutSlot {
  const loadoutItem = item
    ? {
        id: item.id,
        itemType: item.itemType,
        displayName: item.displayName,
        definitionIndex: item.definitionIndex,
        paintkit: item.paintkit,
        floatValue: item.floatValue,
        nametag: item.nametag,
        stattrak: item.stattrak,
        rarityRank: item.rarityRank,
        attributes: item.attributes,
      }
    : null;
  return {
    ownerSteamId,
    slotKey: slot.slotKey,
    slotType: slot.slotType,
    team: slot.team,
    definitionIndex: slot.definitionIndex,
    itemId: item?.id ?? null,
    item: loadoutItem,
    updatedAt: new Date().toISOString(),
  };
}

async function setEconomyLoadoutSlot(input: {
  connection: PoolConnection;
  ownerSteamId: string;
  slot: ReturnType<typeof economySlot>;
  item: EconomyInventoryItem | null;
}) {
  await input.connection.query(
    "SELECT item_id FROM portal_loadout_slots WHERE owner_steam_id = ? AND slot_key = ? FOR UPDATE",
    [input.ownerSteamId, input.slot.slotKey],
  );
  await input.connection.execute(
    "INSERT INTO portal_loadout_slots (owner_steam_id, slot_key, slot_type, team, definition_index, item_id) VALUES (?, ?, ?, ?, ?, ?) " +
      "ON DUPLICATE KEY UPDATE slot_type = VALUES(slot_type), team = VALUES(team), definition_index = VALUES(definition_index), item_id = VALUES(item_id)",
    [
      input.ownerSteamId,
      input.slot.slotKey,
      input.slot.slotType,
      input.slot.team,
      input.slot.definitionIndex,
      input.item?.id ?? null,
    ],
  );
  return economyLoadoutResult(input.slot, input.ownerSteamId, input.item);
}

async function enqueueEconomyLoadoutRefresh(
  connection: PoolConnection,
  steamId: string,
  idempotencyKey: string,
  reason: string,
  itemIds: string[] = [],
) {
  await enqueueEconomyJob({
    connection,
    jobType: "economy.loadout.refresh",
    targetSteamId: steamId,
    idempotencyKey: economyJobKey(idempotencyKey, "loadout-refresh:" + steamId),
    payload: { steamId, reason, itemIds },
  });
}

export async function equipEconomyItem(
  input: EquipEconomyItemInput,
): Promise<EquipEconomyItemSlotsResult> {
  const steamId = economySteamId(input.steamId);
  const itemId = economyItemId(input.itemId);
  const slots = economySlots(input.slots);
  return runEconomyMutation({
    operationName: "loadout.equip",
    actorSteamId: steamId,
    idempotencyKey: input.idempotencyKey,
    request: { itemId, slots },
    work: async (context) => {
      const item = await lockEconomyInventoryItem(context.connection, itemId);
      if (item.ownerSteamId !== steamId || item.state !== "available")
        economyError(
          "ownership_required",
          "That item is not available in your inventory.",
        );
      for (const slot of slots) economyEnsureLoadoutCompatibility(item, slot);
      const savedSlots: EconomyLoadoutSlot[] = [];
      for (const slot of slots) {
        savedSlots.push(
          await setEconomyLoadoutSlot({
            connection: context.connection,
            ownerSteamId: steamId,
            slot,
            item,
          }),
        );
        await writeInventoryEvent({
          connection: context.connection,
          itemId,
          actorSteamId: steamId,
          eventType: "loadout.equipped",
          idempotencyKey: context.idempotencyKey,
          lineKey: "loadout:" + slot.slotKey,
          metadata: { slotKey: slot.slotKey },
        });
      }
      await enqueueEconomyLoadoutRefresh(
        context.connection,
        steamId,
        context.idempotencyKey,
        "equipped",
        [itemId],
      );
      return { itemId, slots: savedSlots };
    },
  });
}

export async function clearEconomyLoadoutSlot(
  input: ClearEconomyLoadoutSlotInput,
): Promise<ClearEconomyLoadoutSlotsResult> {
  const steamId = economySteamId(input.steamId);
  const slots = economySlots(input.slots);
  return runEconomyMutation({
    operationName: "loadout.clear",
    actorSteamId: steamId,
    idempotencyKey: input.idempotencyKey,
    request: { slots },
    work: async (context) => {
      const clearedItemIds: string[] = [];
      const savedSlots: EconomyLoadoutSlot[] = [];
      for (const slot of slots) {
        const [slotRows] = await context.connection.query<
          Array<RowDataPacket & { item_id: string | null }>
        >(
          "SELECT item_id FROM portal_loadout_slots WHERE owner_steam_id = ? AND slot_key = ? FOR UPDATE",
          [steamId, slot.slotKey],
        );
        const previousItemId = slotRows[0]?.item_id
          ? economyItemId(String(slotRows[0].item_id))
          : null;
        if (previousItemId) {
          const item = await lockEconomyInventoryItem(
            context.connection,
            previousItemId,
          );
          if (item.ownerSteamId !== steamId)
            economyError(
              "ownership_required",
              "The equipped item no longer belongs to this player.",
            );
          clearedItemIds.push(previousItemId);
          await writeInventoryEvent({
            connection: context.connection,
            itemId: previousItemId,
            actorSteamId: steamId,
            eventType: "loadout.cleared",
            idempotencyKey: context.idempotencyKey,
            lineKey: "clear:" + slot.slotKey,
            metadata: { slotKey: slot.slotKey },
          });
        }
        savedSlots.push(
          await setEconomyLoadoutSlot({
            connection: context.connection,
            ownerSteamId: steamId,
            slot,
            item: null,
          }),
        );
      }
      await enqueueEconomyLoadoutRefresh(
        context.connection,
        steamId,
        context.idempotencyKey,
        "cleared",
        [...new Set(clearedItemIds)],
      );
      return { slots: savedSlots };
    },
  });
}

export async function setEconomyItemNametag(
  input: SetEconomyItemNametagInput,
): Promise<SetEconomyItemNametagResult> {
  const steamId = economySteamId(input.steamId);
  const itemId = economyItemId(input.itemId);
  const nametagItemId =
    input.nametagItemId === undefined
      ? null
      : economyItemId(input.nametagItemId, "Name-tag item ID");
  const nametag = economyText(input.nametag, "Name tag", 128);
  return runEconomyMutation({
    operationName: "item.nametag.set",
    actorSteamId: steamId,
    idempotencyKey: input.idempotencyKey,
    request: { itemId, nametagItemId, nametag },
    work: async (context) => {
      // Wallet-before-item locking matches trades and other paid item actions.
      const wallets = await lockTokenAccounts(context.connection, [steamId]);
      const lockedItems = await lockEconomyInventoryItems(
        context.connection,
        nametagItemId ? [itemId, nametagItemId] : [itemId],
      );
      const item = lockedItems.get(itemId);
      if (!item)
        economyError("item_not_found", "That inventory item does not exist.");
      if (item.ownerSteamId !== steamId || item.state !== "available")
        economyError(
          "ownership_required",
          "That item is not available in your inventory.",
        );
      if (!economyItemSupportsNametag(item))
        economyError(
          "unsupported_customization",
          "That item does not support a name tag.",
        );
      if (nametagItemId) {
        const nametagItem = lockedItems.get(nametagItemId);
        if (
          !nametagItem ||
          nametagItem.ownerSteamId !== steamId ||
          nametagItem.state !== "available"
        ) {
          economyError(
            "ownership_required",
            "That name-tag item is not available in your inventory.",
          );
        }
        if (nametagItem.itemType !== "nametag")
          economyError(
            "incompatible_item",
            "That inventory item is not a name tag.",
          );
        await context.connection.execute(
          "UPDATE portal_inventory_items SET state = 'consumed', consumed_at = CURRENT_TIMESTAMP WHERE id = ? AND state = 'available'",
          [nametagItemId],
        );
        await writeInventoryEvent({
          connection: context.connection,
          itemId: nametagItemId,
          actorSteamId: steamId,
          eventType: "nametag.consumed",
          idempotencyKey: context.idempotencyKey,
          lineKey: "nametag:consumed",
          beforeState: economyInventorySnapshot(nametagItem),
          afterState: {
            ...economyInventorySnapshot(nametagItem),
            state: "consumed",
          },
          metadata: { weaponItemId: itemId, nametag },
        });
      } else {
        await applyTokenDelta({
          connection: context.connection,
          wallets,
          steamId,
          delta: -ECONOMY_NAMETAG_PRICE_TOKENS,
          reason: "item.nametag",
          referenceType: "inventory-item",
          referenceId: itemId,
          idempotencyKey: context.idempotencyKey,
          lineKey: "nametag:debit",
          actorSteamId: steamId,
          metadata: { nametag },
        });
      }
      await context.connection.execute(
        "UPDATE portal_inventory_items SET nametag = ? WHERE id = ?",
        [nametag, itemId],
      );
      await writeInventoryEvent({
        connection: context.connection,
        itemId,
        actorSteamId: steamId,
        eventType: "item.nametag.set",
        idempotencyKey: context.idempotencyKey,
        lineKey: "nametag:item",
        beforeState: economyInventorySnapshot(item),
        afterState: { ...economyInventorySnapshot(item), nametag },
      });
      await enqueueEconomyLoadoutRefresh(
        context.connection,
        steamId,
        context.idempotencyKey,
        "nametag",
        nametagItemId ? [itemId, nametagItemId] : [itemId],
      );
      const wallet = wallets.get(steamId);
      if (!wallet)
        economyError(
          "wallet_unavailable",
          "The name-tag wallet was not locked.",
        );
      return {
        itemId,
        nametag,
        priceTokens: nametagItemId ? 0 : ECONOMY_NAMETAG_PRICE_TOKENS,
        wallet,
      };
    },
  });
}

export async function attachEconomyCharm(
  input: AttachEconomyCharmInput,
): Promise<AttachEconomyCharmResult> {
  const steamId = economySteamId(input.steamId);
  const weaponItemId = economyItemId(input.weaponItemId, "Weapon item ID");
  const charmItemId = economyItemId(input.charmItemId, "Charm item ID");
  return runEconomyMutation({
    operationName: "item.charm.attach",
    actorSteamId: steamId,
    idempotencyKey: input.idempotencyKey,
    request: { weaponItemId, charmItemId },
    work: async (context) => {
      const items = await lockEconomyInventoryItems(context.connection, [
        weaponItemId,
        charmItemId,
      ]);
      const weapon = items.get(weaponItemId);
      const charm = items.get(charmItemId);
      if (!weapon || !charm)
        economyError(
          "item_not_found",
          "The weapon or charm no longer exists.",
        );
      if (weapon.ownerSteamId !== steamId || weapon.state !== "available")
        economyError(
          "ownership_required",
          "That weapon is not available in your inventory.",
        );
      if (
        charm.ownerSteamId !== steamId ||
        charm.state !== "available" ||
        charm.itemType !== "keychain"
      ) {
        economyError(
          "ownership_required",
          "That charm is not available in your inventory.",
        );
      }
      if (!economyItemSupportsCharm(weapon))
        economyError(
          "unsupported_customization",
          "That item does not support charms.",
        );
      const keychain = economyCharmAttributes(charm);
      const nextAttributes = { ...weapon.attributes, keychain };
      await context.connection.execute(
        "UPDATE portal_inventory_items SET attributes = ? WHERE id = ? AND state = 'available'",
        [JSON.stringify(nextAttributes), weaponItemId],
      );
      await context.connection.execute(
        "UPDATE portal_inventory_items SET state = 'consumed', consumed_at = CURRENT_TIMESTAMP WHERE id = ? AND state = 'available'",
        [charmItemId],
      );
      await writeInventoryEvent({
        connection: context.connection,
        itemId: weaponItemId,
        actorSteamId: steamId,
        eventType: "item.charm.attached",
        idempotencyKey: context.idempotencyKey,
        lineKey: "charm:weapon",
        beforeState: economyInventorySnapshot(weapon),
        afterState: { ...economyInventorySnapshot(weapon), attributes: nextAttributes },
        metadata: { charmItemId, keychain },
      });
      await writeInventoryEvent({
        connection: context.connection,
        itemId: charmItemId,
        actorSteamId: steamId,
        eventType: "charm.consumed",
        idempotencyKey: context.idempotencyKey,
        lineKey: "charm:item",
        beforeState: economyInventorySnapshot(charm),
        afterState: { ...economyInventorySnapshot(charm), state: "consumed" },
        metadata: { weaponItemId, keychain },
      });
      await enqueueEconomyLoadoutRefresh(
        context.connection,
        steamId,
        context.idempotencyKey,
        "charm-attached",
        [weaponItemId, charmItemId],
      );
      return {
        weaponItemId,
        charmItemId,
        charmDefinitionIndex: keychain.id,
      };
    },
  });
}

export async function attachEconomySticker(
  input: AttachEconomyStickerInput,
): Promise<AttachEconomyStickerResult> {
  const steamId = economySteamId(input.steamId);
  const weaponItemId = economyItemId(input.weaponItemId, "Weapon item ID");
  const stickerItemId = economyItemId(input.stickerItemId, "Sticker item ID");
  if (!Number.isSafeInteger(input.slot) || input.slot < 0 || input.slot > 5)
    economyError("invalid_input", "The sticker slot is invalid.");
  return runEconomyMutation({
    operationName: "item.sticker.attach",
    actorSteamId: steamId,
    idempotencyKey: input.idempotencyKey,
    request: { weaponItemId, stickerItemId, slot: input.slot },
    work: async (context) => {
      const items = await lockEconomyInventoryItems(context.connection, [
        weaponItemId,
        stickerItemId,
      ]);
      const weapon = items.get(weaponItemId);
      const sticker = items.get(stickerItemId);
      if (!weapon || !sticker)
        economyError(
          "item_not_found",
          "The weapon or sticker no longer exists.",
        );
      if (weapon.ownerSteamId !== steamId || weapon.state !== "available")
        economyError(
          "ownership_required",
          "That weapon is not available in your inventory.",
        );
      if (
        sticker.ownerSteamId !== steamId ||
        sticker.state !== "available" ||
        sticker.itemType !== "sticker"
      ) {
        economyError(
          "ownership_required",
          "That sticker is not available in your inventory.",
        );
      }
      if (economyStickerSlots(weapon) <= input.slot)
        economyError(
          "unsupported_customization",
          "That weapon does not support this sticker slot.",
        );
      const [existingRows] = await context.connection.query<
        Array<
          RowDataPacket & {
            weapon_item_id: string;
            sticker_slot: number;
            sticker_item_id: string;
          }
        >
      >(
        "SELECT weapon_item_id, sticker_slot, sticker_item_id FROM portal_inventory_item_stickers WHERE (weapon_item_id = ? AND sticker_slot = ?) OR sticker_item_id = ? FOR UPDATE",
        [weaponItemId, input.slot, stickerItemId],
      );
      if (existingRows.length)
        economyError(
          "sticker_slot_occupied",
          "The sticker is already attached or this weapon slot is occupied.",
        );
      await context.connection.execute(
        "INSERT INTO portal_inventory_item_stickers (weapon_item_id, sticker_slot, sticker_item_id, sticker_catalogue_id, sticker_definition_index, sticker_paintkit, sticker_rarity_rank, applied_by_steam_id, attributes) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)",
        [
          weaponItemId,
          input.slot,
          stickerItemId,
          sticker.catalogueId,
          sticker.definitionIndex,
          sticker.paintkit,
          sticker.rarityRank,
          steamId,
          JSON.stringify(sticker.attributes),
        ],
      );
      await context.connection.execute(
        "UPDATE portal_inventory_items SET state = 'attached' WHERE id = ? AND state = 'available'",
        [stickerItemId],
      );
      await writeInventoryEvent({
        connection: context.connection,
        itemId: weaponItemId,
        actorSteamId: steamId,
        eventType: "item.sticker.attached",
        idempotencyKey: context.idempotencyKey,
        lineKey: "sticker:weapon",
        metadata: { stickerItemId, slot: input.slot },
      });
      await writeInventoryEvent({
        connection: context.connection,
        itemId: stickerItemId,
        actorSteamId: steamId,
        eventType: "sticker.attached",
        idempotencyKey: context.idempotencyKey,
        lineKey: "sticker:item",
        beforeState: economyInventorySnapshot(sticker),
        afterState: { ...economyInventorySnapshot(sticker), state: "attached" },
        metadata: { weaponItemId, slot: input.slot },
      });
      await enqueueEconomyLoadoutRefresh(
        context.connection,
        steamId,
        context.idempotencyKey,
        "sticker-attached",
        [weaponItemId, stickerItemId],
      );
      return { weaponItemId, stickerItemId, slot: input.slot };
    },
  });
}

function economyTradeExpiry(value: string | undefined) {
  if (!value) return null;
  const date = new Date(value);
  const now = Date.now();
  if (
    Number.isNaN(date.getTime()) ||
    date.getTime() <= now + 60_000 ||
    date.getTime() > now + 30 * 24 * 60 * 60 * 1_000
  ) {
    economyError(
      "invalid_input",
      "The trade expiry must be between one minute and thirty days from now.",
    );
  }
  return date;
}

function toEconomyTradeItemPreview(
  item: EconomyInventoryItem | undefined,
): EconomyTradeItemPreview | null {
  if (!item) return null;
  return {
    catalogueId: item.catalogueId,
    itemType: item.itemType,
    displayName: item.displayName,
    rarityRank: item.rarityRank,
    floatValue: item.floatValue,
    stattrak: item.stattrak,
    stattrakCount: item.stattrakCount,
    nametag: item.nametag,
    // Instance attributes preserve the exact crate-entry artwork. Prefer that
    // official image over any cache-era catalogue thumbnail in trades too.
    imageUrl:
      economyMetadataImageUrl(item.attributes) ??
      economyMetadataImageUrl(item.catalogue?.metadata ?? {}),
  };
}

function toEconomyTrade(rows: {
  trade: EconomyTradeRow;
  steamId: string;
  tradeItems: EconomyTradeItemRow[];
  inventory: Map<string, EconomyInventoryItem>;
}): EconomyTrade {
  const trade = rows.trade;
  const offeredItems = rows.tradeItems
    .filter((item) => item.side === "offered")
    .map((item) => ({
      itemId: economyItemId(String(item.item_id)),
      ownerSteamId: String(item.owner_steam_id),
      state: economyTradeItemState(String(item.state)),
      item: toEconomyTradeItemPreview(rows.inventory.get(String(item.item_id))),
    }));
  const requestedItems = rows.tradeItems
    .filter((item) => item.side === "requested")
    .map((item) => ({
      itemId: economyItemId(String(item.item_id)),
      ownerSteamId: String(item.owner_steam_id),
      state: economyTradeItemState(String(item.state)),
      item: toEconomyTradeItemPreview(rows.inventory.get(String(item.item_id))),
    }));
  return {
    id: economyUuid(String(trade.id), "Trade ID"),
    creatorSteamId: String(trade.creator_steam_id),
    counterpartySteamId: String(trade.counterparty_steam_id),
    direction:
      trade.creator_steam_id === rows.steamId ? "outgoing" : "incoming",
    status: economyTradeStatus(String(trade.status)),
    offered: {
      steamId: String(trade.creator_steam_id),
      tokens: economyNumber(trade.offered_tokens, "offered Tokens"),
      items: offeredItems,
    },
    requested: {
      steamId: String(trade.counterparty_steam_id),
      tokens: economyNumber(trade.requested_tokens, "requested Tokens"),
      items: requestedItems,
    },
    expiresAt: economyDateToIso(trade.expires_at),
    respondedAt: economyDateToIso(trade.responded_at),
    createdAt: economyDateToIso(trade.created_at) ?? new Date(0).toISOString(),
    updatedAt: economyDateToIso(trade.updated_at) ?? new Date(0).toISOString(),
  };
}

async function hydrateEconomyTrades(
  pool: Pool,
  steamId: string,
  trades: EconomyTradeRow[],
) {
  if (!trades.length) return [];
  const tradeIds = trades.map((trade) => trade.id);
  const placeholders = tradeIds.map(() => "?").join(", ");
  const [tradeItems] = await pool.query<EconomyTradeItemRow[]>(
    "SELECT trade_id, side, item_id, owner_steam_id, state FROM portal_trade_items WHERE trade_id IN (" +
      placeholders +
      ") ORDER BY trade_id, side, item_id",
    tradeIds,
  );
  const itemIds = [
    ...new Set(tradeItems.map((item) => economyItemId(String(item.item_id)))),
  ];
  let inventory = new Map<string, EconomyInventoryItem>();
  if (itemIds.length) {
    const itemPlaceholders = itemIds.map(() => "?").join(", ");
    const [inventoryRows] = await pool.query<EconomyInventoryRow[]>(
      economyInventorySelect + "WHERE i.id IN (" + itemPlaceholders + ")",
      itemIds,
    );
    const inventoryItems = await hydrateEconomyInventory(pool, inventoryRows);
    inventory = new Map(inventoryItems.map((item) => [item.id, item]));
  }
  const itemsByTrade = new Map<string, EconomyTradeItemRow[]>();
  for (const item of tradeItems) {
    const group = itemsByTrade.get(String(item.trade_id)) ?? [];
    group.push(item);
    itemsByTrade.set(String(item.trade_id), group);
  }
  return trades.map((trade) =>
    toEconomyTrade({
      trade,
      steamId,
      tradeItems: itemsByTrade.get(String(trade.id)) ?? [],
      inventory,
    }),
  );
}

export async function getPlayerEconomyTrades(
  steamId: string,
  filter: EconomyTradeFilter = {},
): Promise<EconomyTradePage> {
  economySteamId(steamId);
  const pool = getPortalPool();
  const paging = economyPage(filter.page, filter.pageSize, 50);
  if (!pool)
    return {
      trades: [],
      total: 0,
      page: paging.page,
      pageSize: paging.pageSize,
    };
  const statuses = Array.isArray(filter.status)
    ? filter.status
    : filter.status
      ? [filter.status]
      : [];
  const normalizedStatuses = [
    ...new Set(statuses.map((status) => economyTradeStatus(String(status)))),
  ];
  const where = ["(creator_steam_id = ? OR counterparty_steam_id = ?)"];
  const values: unknown[] = [steamId, steamId];
  if (normalizedStatuses.length) {
    where.push(
      "status IN (" + normalizedStatuses.map(() => "?").join(", ") + ")",
    );
    values.push(...normalizedStatuses);
  }
  const clause = " WHERE " + where.join(" AND ");
  const [countRows] = await pool.query<
    Array<RowDataPacket & { total: number | string }>
  >("SELECT COUNT(*) AS total FROM portal_economy_trades" + clause, values);
  const [tradeRows] = await pool.query<EconomyTradeRow[]>(
    "SELECT id, creator_steam_id, counterparty_steam_id, status, offered_tokens, requested_tokens, expires_at, responded_at, created_at, updated_at FROM portal_economy_trades" +
      clause +
      " ORDER BY updated_at DESC, id DESC LIMIT ? OFFSET ?",
    [...values, paging.pageSize, paging.offset],
  );
  return {
    trades: await hydrateEconomyTrades(pool, steamId, tradeRows),
    total: economyCount(countRows),
    page: paging.page,
    pageSize: paging.pageSize,
  };
}

export async function getEconomyTrade(
  tradeId: string,
  steamId: string,
): Promise<EconomyTrade | null> {
  const id = economyUuid(tradeId, "Trade ID");
  economySteamId(steamId);
  const pool = getPortalPool();
  if (!pool) return null;
  const [tradeRows] = await pool.query<EconomyTradeRow[]>(
    "SELECT id, creator_steam_id, counterparty_steam_id, status, offered_tokens, requested_tokens, expires_at, responded_at, created_at, updated_at FROM portal_economy_trades WHERE id = ? AND (creator_steam_id = ? OR counterparty_steam_id = ?) LIMIT 1",
    [id, steamId, steamId],
  );
  const trades = await hydrateEconomyTrades(pool, steamId, tradeRows);
  return trades[0] ?? null;
}

async function lockEconomyTrade(connection: PoolConnection, tradeId: string) {
  const [rows] = await connection.query<EconomyTradeRow[]>(
    "SELECT id, creator_steam_id, counterparty_steam_id, status, offered_tokens, requested_tokens, expires_at, responded_at, created_at, updated_at FROM portal_economy_trades WHERE id = ? FOR UPDATE",
    [tradeId],
  );
  const trade = rows[0];
  if (!trade) economyError("trade_not_found", "That trade does not exist.");
  return trade;
}

async function lockEconomyTradeItems(
  connection: PoolConnection,
  tradeId: string,
) {
  const [rows] = await connection.query<EconomyTradeItemRow[]>(
    "SELECT trade_id, side, item_id, owner_steam_id, state FROM portal_trade_items WHERE trade_id = ? ORDER BY item_id FOR UPDATE",
    [tradeId],
  );
  return rows;
}

async function returnEconomyTradeEscrow(input: {
  connection: PoolConnection;
  trade: EconomyTradeRow;
  tradeItems: EconomyTradeItemRow[];
  idempotencyKey: string;
  actorSteamId: string;
  status: "rejected" | "cancelled" | "expired";
  reason: string;
  inventory?: Map<string, EconomyInventoryItem>;
}) {
  const tradeId = economyUuid(String(input.trade.id), "Trade ID");
  const offered = input.tradeItems.filter((item) => item.side === "offered");
  const offeredIds = offered.map((item) => economyItemId(String(item.item_id)));
  const offeredTokens = economyNumber(
    input.trade.offered_tokens,
    "offered Tokens",
  );
  if (offeredTokens > 0) {
    const wallets = await lockTokenAccounts(input.connection, [
      String(input.trade.creator_steam_id),
    ]);
    await applyTokenDelta({
      connection: input.connection,
      wallets,
      steamId: String(input.trade.creator_steam_id),
      delta: offeredTokens,
      reason: "trade.escrow.return",
      referenceType: "trade",
      referenceId: tradeId,
      idempotencyKey: input.idempotencyKey,
      lineKey: "trade:return-tokens",
      actorSteamId: input.actorSteamId,
      metadata: { status: input.status, reason: input.reason },
    });
    await input.connection.execute(
      "UPDATE portal_trade_token_escrow SET status = 'returned', released_at = CURRENT_TIMESTAMP WHERE trade_id = ? AND party_steam_id = ? AND side = 'offered' AND status = 'held'",
      [tradeId, String(input.trade.creator_steam_id)],
    );
  }
  const inventory =
    input.inventory ??
    (await lockEconomyInventoryItems(input.connection, offeredIds));
  if (offeredIds.length) {
    for (const itemId of offeredIds) {
      const item = inventory.get(itemId);
      if (
        !item ||
        item.ownerSteamId !== input.trade.creator_steam_id ||
        item.state !== "escrowed"
      ) {
        economyError(
          "trade_escrow_invalid",
          "The offered item escrow is no longer valid.",
        );
      }
    }
    const placeholders = offeredIds.map(() => "?").join(", ");
    await input.connection.execute(
      "UPDATE portal_inventory_items SET state = 'available' WHERE owner_steam_id = ? AND state = 'escrowed' AND id IN (" +
        placeholders +
        ")",
      [String(input.trade.creator_steam_id), ...offeredIds],
    );
    for (const itemId of offeredIds) {
      const item = inventory.get(itemId);
      if (!item) continue;
      await writeInventoryEvent({
        connection: input.connection,
        itemId,
        actorSteamId: input.actorSteamId,
        eventType: "trade.escrow.returned",
        idempotencyKey: input.idempotencyKey,
        lineKey: "return:" + itemId,
        beforeState: economyInventorySnapshot(item),
        afterState: { ...economyInventorySnapshot(item), state: "available" },
        metadata: { tradeId, status: input.status, reason: input.reason },
      });
    }
  }
  await input.connection.execute(
    "UPDATE portal_trade_items SET state = CASE WHEN side = 'offered' THEN 'returned' ELSE 'unavailable' END WHERE trade_id = ?",
    [tradeId],
  );
  await input.connection.execute(
    "UPDATE portal_economy_trades SET status = ?, responded_at = CURRENT_TIMESTAMP WHERE id = ?",
    [input.status, tradeId],
  );
  await createEconomyNotification({
    connection: input.connection,
    steamId: String(input.trade.creator_steam_id),
    notificationType: "trade." + input.status,
    payload: { tradeId, reason: input.reason },
  });
  await createEconomyNotification({
    connection: input.connection,
    steamId: String(input.trade.counterparty_steam_id),
    notificationType: "trade." + input.status,
    payload: { tradeId, reason: input.reason },
  });
  await enqueueEconomyLoadoutRefresh(
    input.connection,
    String(input.trade.creator_steam_id),
    input.idempotencyKey,
    "trade-" + input.status,
    offeredIds,
  );
}

export async function createEconomyTrade(
  input: CreateEconomyTradeInput,
): Promise<CreateEconomyTradeResult> {
  const steamId = economySteamId(input.steamId);
  const counterpartySteamId = economySteamId(
    input.counterpartySteamId,
    "Counterparty Steam ID",
  );
  if (steamId === counterpartySteamId)
    economyError("invalid_input", "You cannot trade with yourself.");
  const offeredItemIds = economyNormalizeItemIds(
    input.offeredItemIds,
    "Offered item ID",
  );
  const requestedItemIds = economyNormalizeItemIds(
    input.requestedItemIds,
    "Requested item ID",
  );
  const offeredTokens = economyAmount(input.offeredTokens, "Offered Tokens");
  const requestedTokens = economyAmount(
    input.requestedTokens,
    "Requested Tokens",
  );
  if (
    !offeredItemIds.length &&
    !requestedItemIds.length &&
    offeredTokens === 0 &&
    requestedTokens === 0
  ) {
    economyError(
      "invalid_input",
      "A trade must offer or request at least one item or Token.",
    );
  }
  const suppliedExpiry = economyTradeExpiry(input.expiresAt);
  return runEconomyMutation({
    operationName: "trade.create",
    actorSteamId: steamId,
    idempotencyKey: input.idempotencyKey,
    request: {
      counterpartySteamId,
      offeredItemIds,
      requestedItemIds,
      offeredTokens,
      requestedTokens,
      expiresAt: suppliedExpiry?.toISOString() ?? null,
    },
    work: async (context) => {
      const expiresAt =
        suppliedExpiry ?? new Date(Date.now() + 7 * 24 * 60 * 60 * 1_000);
      const tradeId = randomUUID().toLowerCase();
      const wallets = await lockTokenAccounts(context.connection, [steamId]);
      const allItemIds = [
        ...new Set([...offeredItemIds, ...requestedItemIds]),
      ].sort();
      const items = await lockEconomyInventoryItems(
        context.connection,
        allItemIds,
      );
      for (const itemId of offeredItemIds) {
        const item = items.get(itemId);
        if (
          !item ||
          item.ownerSteamId !== steamId ||
          item.state !== "available"
        ) {
          economyError(
            "ownership_required",
            "Every offered item must be available in your inventory.",
          );
        }
      }
      for (const itemId of requestedItemIds) {
        const item = items.get(itemId);
        if (
          !item ||
          item.ownerSteamId !== counterpartySteamId ||
          item.state !== "available"
        ) {
          economyError(
            "requested_item_unavailable",
            "A requested item is no longer available from that player.",
          );
        }
      }
      await context.connection.execute(
        "INSERT INTO portal_economy_trades (id, creator_steam_id, counterparty_steam_id, offered_tokens, requested_tokens, expires_at) VALUES (?, ?, ?, ?, ?, ?)",
        [
          tradeId,
          steamId,
          counterpartySteamId,
          offeredTokens,
          requestedTokens,
          expiresAt,
        ],
      );
      if (offeredTokens > 0) {
        await applyTokenDelta({
          connection: context.connection,
          wallets,
          steamId,
          delta: -offeredTokens,
          reason: "trade.escrow.hold",
          referenceType: "trade",
          referenceId: tradeId,
          idempotencyKey: context.idempotencyKey,
          lineKey: "trade:offer-hold",
          actorSteamId: steamId,
          metadata: { counterpartySteamId },
        });
        await context.connection.execute(
          "INSERT INTO portal_trade_token_escrow (trade_id, party_steam_id, amount, side, status) VALUES (?, ?, ?, 'offered', 'held')",
          [tradeId, steamId, offeredTokens],
        );
      }
      for (const itemId of offeredItemIds) {
        await context.connection.execute(
          "UPDATE portal_inventory_items SET state = 'escrowed' WHERE id = ? AND state = 'available'",
          [itemId],
        );
        await context.connection.execute(
          "INSERT INTO portal_trade_items (trade_id, side, item_id, owner_steam_id, state) VALUES (?, 'offered', ?, ?, 'escrowed')",
          [tradeId, itemId, steamId],
        );
        const item = items.get(itemId);
        if (item) {
          await writeInventoryEvent({
            connection: context.connection,
            itemId,
            actorSteamId: steamId,
            eventType: "trade.escrowed",
            idempotencyKey: context.idempotencyKey,
            lineKey: "offer:" + itemId,
            beforeState: economyInventorySnapshot(item),
            afterState: {
              ...economyInventorySnapshot(item),
              state: "escrowed",
            },
            metadata: { tradeId },
          });
        }
      }
      for (const itemId of requestedItemIds) {
        await context.connection.execute(
          "INSERT INTO portal_trade_items (trade_id, side, item_id, owner_steam_id, state) VALUES (?, 'requested', ?, ?, 'requested')",
          [tradeId, itemId, counterpartySteamId],
        );
      }
      await clearEconomyLoadoutSlots(
        context.connection,
        steamId,
        offeredItemIds,
      );
      await createEconomyNotification({
        connection: context.connection,
        steamId: counterpartySteamId,
        notificationType: "trade.received",
        payload: {
          tradeId,
          fromSteamId: steamId,
          expiresAt: expiresAt.toISOString(),
        },
      });
      await enqueueEconomyLoadoutRefresh(
        context.connection,
        steamId,
        context.idempotencyKey,
        "trade-escrowed",
        offeredItemIds,
      );
      return {
        tradeId,
        status: "pending" as const,
        expiresAt: expiresAt.toISOString(),
      };
    },
  });
}

function economyTradeHasExpired(trade: EconomyTradeRow) {
  const expiresAt = economyDateToIso(trade.expires_at);
  return expiresAt !== null && new Date(expiresAt).getTime() <= Date.now();
}

export async function respondEconomyTrade(
  input: RespondEconomyTradeInput,
): Promise<RespondEconomyTradeResult> {
  const steamId = economySteamId(input.steamId);
  const tradeId = economyUuid(input.tradeId, "Trade ID");
  if (input.decision !== "accept" && input.decision !== "reject")
    economyError("invalid_input", "The trade decision is invalid.");
  return runEconomyMutation({
    operationName: "trade.respond",
    actorSteamId: steamId,
    idempotencyKey: input.idempotencyKey,
    request: { tradeId, decision: input.decision },
    work: async (context) => {
      const trade = await lockEconomyTrade(context.connection, tradeId);
      if (trade.counterparty_steam_id !== steamId)
        economyError(
          "trade_forbidden",
          "Only the recipient can respond to this trade.",
        );
      if (economyTradeStatus(String(trade.status)) !== "pending")
        economyError("trade_closed", "This trade is no longer pending.");
      const tradeItems = await lockEconomyTradeItems(
        context.connection,
        tradeId,
      );
      if (economyTradeHasExpired(trade)) {
        await returnEconomyTradeEscrow({
          connection: context.connection,
          trade,
          tradeItems,
          idempotencyKey: context.idempotencyKey,
          actorSteamId: steamId,
          status: "expired",
          reason: "expired",
        });
        return { tradeId, status: "expired" as const };
      }
      if (input.decision === "reject") {
        await returnEconomyTradeEscrow({
          connection: context.connection,
          trade,
          tradeItems,
          idempotencyKey: context.idempotencyKey,
          actorSteamId: steamId,
          status: "rejected",
          reason: "rejected_by_recipient",
        });
        return { tradeId, status: "rejected" as const };
      }

      const creatorSteamId = String(trade.creator_steam_id);
      const counterpartySteamId = String(trade.counterparty_steam_id);
      const wallets = await lockTokenAccounts(context.connection, [
        creatorSteamId,
        counterpartySteamId,
      ]);
      const itemIds = tradeItems.map((item) =>
        economyItemId(String(item.item_id)),
      );
      const inventory = await lockEconomyInventoryItems(
        context.connection,
        itemIds,
      );
      const offered = tradeItems.filter((item) => item.side === "offered");
      const requested = tradeItems.filter((item) => item.side === "requested");
      const requestedUnavailable = requested.some((row) => {
        const item = inventory.get(String(row.item_id));
        return (
          !item ||
          item.ownerSteamId !== counterpartySteamId ||
          item.state !== "available"
        );
      });
      const offeredInvalid = offered.some((row) => {
        const item = inventory.get(String(row.item_id));
        return (
          !item ||
          item.ownerSteamId !== creatorSteamId ||
          item.state !== "escrowed"
        );
      });
      if (requestedUnavailable || offeredInvalid) {
        await returnEconomyTradeEscrow({
          connection: context.connection,
          trade,
          tradeItems,
          inventory,
          idempotencyKey: context.idempotencyKey,
          actorSteamId: steamId,
          status: "cancelled",
          reason: "requested_item_unavailable",
        });
        return {
          tradeId,
          status: "cancelled" as const,
          reason: "requested_item_unavailable" as const,
        };
      }

      const offeredTokens = economyNumber(
        trade.offered_tokens,
        "offered Tokens",
      );
      const requestedTokens = economyNumber(
        trade.requested_tokens,
        "requested Tokens",
      );
      if (requestedTokens > 0) {
        await applyTokenDelta({
          connection: context.connection,
          wallets,
          steamId: counterpartySteamId,
          delta: -requestedTokens,
          reason: "trade.settlement.debit",
          referenceType: "trade",
          referenceId: tradeId,
          idempotencyKey: context.idempotencyKey,
          lineKey: "trade:request-debit",
          actorSteamId: steamId,
          metadata: { creatorSteamId },
        });
        await context.connection.execute(
          "INSERT INTO portal_trade_token_escrow (trade_id, party_steam_id, amount, side, status) VALUES (?, ?, ?, 'requested', 'held')",
          [tradeId, counterpartySteamId, requestedTokens],
        );
      }
      if (offeredTokens > 0) {
        await applyTokenDelta({
          connection: context.connection,
          wallets,
          steamId: counterpartySteamId,
          delta: offeredTokens,
          reason: "trade.settlement.credit",
          referenceType: "trade",
          referenceId: tradeId,
          idempotencyKey: context.idempotencyKey,
          lineKey: "trade:offer-credit",
          actorSteamId: steamId,
          metadata: { creatorSteamId },
        });
      }
      if (requestedTokens > 0) {
        await applyTokenDelta({
          connection: context.connection,
          wallets,
          steamId: creatorSteamId,
          delta: requestedTokens,
          reason: "trade.settlement.credit",
          referenceType: "trade",
          referenceId: tradeId,
          idempotencyKey: context.idempotencyKey,
          lineKey: "trade:request-credit",
          actorSteamId: steamId,
          metadata: { counterpartySteamId },
        });
        await context.connection.execute(
          "UPDATE portal_trade_token_escrow SET status = 'released', released_at = CURRENT_TIMESTAMP WHERE trade_id = ? AND party_steam_id = ? AND side = 'requested' AND status = 'held'",
          [tradeId, counterpartySteamId],
        );
      }
      if (offeredTokens > 0) {
        await context.connection.execute(
          "UPDATE portal_trade_token_escrow SET status = 'released', released_at = CURRENT_TIMESTAMP WHERE trade_id = ? AND party_steam_id = ? AND side = 'offered' AND status = 'held'",
          [tradeId, creatorSteamId],
        );
      }

      const offeredIds = offered.map((row) =>
        economyItemId(String(row.item_id)),
      );
      const requestedIds = requested.map((row) =>
        economyItemId(String(row.item_id)),
      );
      for (const itemId of offeredIds) {
        const item = inventory.get(itemId);
        if (!item) continue;
        await context.connection.execute(
          "UPDATE portal_inventory_items SET owner_steam_id = ?, state = 'available' WHERE id = ? AND owner_steam_id = ? AND state = 'escrowed'",
          [counterpartySteamId, itemId, creatorSteamId],
        );
        await moveAttachedStickersWithWeapon(
          context.connection,
          [itemId],
          counterpartySteamId,
        );
        await writeInventoryEvent({
          connection: context.connection,
          itemId,
          actorSteamId: steamId,
          eventType: "trade.transferred",
          idempotencyKey: context.idempotencyKey,
          lineKey: "transfer:offer:" + itemId,
          beforeState: economyInventorySnapshot(item),
          afterState: {
            ...economyInventorySnapshot(item),
            ownerSteamId: counterpartySteamId,
            state: "available",
          },
          metadata: {
            tradeId,
            fromSteamId: creatorSteamId,
            toSteamId: counterpartySteamId,
          },
        });
      }
      for (const itemId of requestedIds) {
        const item = inventory.get(itemId);
        if (!item) continue;
        await context.connection.execute(
          "UPDATE portal_inventory_items SET owner_steam_id = ?, state = 'available' WHERE id = ? AND owner_steam_id = ? AND state = 'available'",
          [creatorSteamId, itemId, counterpartySteamId],
        );
        await moveAttachedStickersWithWeapon(
          context.connection,
          [itemId],
          creatorSteamId,
        );
        await writeInventoryEvent({
          connection: context.connection,
          itemId,
          actorSteamId: steamId,
          eventType: "trade.transferred",
          idempotencyKey: context.idempotencyKey,
          lineKey: "transfer:request:" + itemId,
          beforeState: economyInventorySnapshot(item),
          afterState: {
            ...economyInventorySnapshot(item),
            ownerSteamId: creatorSteamId,
            state: "available",
          },
          metadata: {
            tradeId,
            fromSteamId: counterpartySteamId,
            toSteamId: creatorSteamId,
          },
        });
      }
      await clearEconomyLoadoutSlots(
        context.connection,
        counterpartySteamId,
        requestedIds,
      );
      await context.connection.execute(
        "UPDATE portal_trade_items SET state = 'transferred' WHERE trade_id = ?",
        [tradeId],
      );
      await context.connection.execute(
        "UPDATE portal_economy_trades SET status = 'accepted', responded_at = CURRENT_TIMESTAMP WHERE id = ?",
        [tradeId],
      );
      await createEconomyNotification({
        connection: context.connection,
        steamId: creatorSteamId,
        notificationType: "trade.accepted",
        payload: { tradeId, counterpartySteamId },
      });
      await createEconomyNotification({
        connection: context.connection,
        steamId: counterpartySteamId,
        notificationType: "trade.accepted",
        payload: { tradeId, creatorSteamId },
      });
      await enqueueEconomyLoadoutRefresh(
        context.connection,
        creatorSteamId,
        context.idempotencyKey,
        "trade-accepted",
        requestedIds,
      );
      await enqueueEconomyLoadoutRefresh(
        context.connection,
        counterpartySteamId,
        context.idempotencyKey,
        "trade-accepted",
        offeredIds,
      );
      return { tradeId, status: "accepted" as const };
    },
  });
}

export async function cancelEconomyTrade(
  input: CancelEconomyTradeInput,
): Promise<CancelEconomyTradeResult> {
  const steamId = economySteamId(input.steamId);
  const tradeId = economyUuid(input.tradeId, "Trade ID");
  return runEconomyMutation({
    operationName: "trade.cancel",
    actorSteamId: steamId,
    idempotencyKey: input.idempotencyKey,
    request: { tradeId },
    work: async (context) => {
      const trade = await lockEconomyTrade(context.connection, tradeId);
      if (trade.creator_steam_id !== steamId)
        economyError(
          "trade_forbidden",
          "Only the trade creator can cancel this offer.",
        );
      if (economyTradeStatus(String(trade.status)) !== "pending")
        economyError("trade_closed", "This trade is no longer pending.");
      const tradeItems = await lockEconomyTradeItems(
        context.connection,
        tradeId,
      );
      const status = economyTradeHasExpired(trade)
        ? ("expired" as const)
        : ("cancelled" as const);
      await returnEconomyTradeEscrow({
        connection: context.connection,
        trade,
        tradeItems,
        idempotencyKey: context.idempotencyKey,
        actorSteamId: steamId,
        status,
        reason: status === "expired" ? "expired" : "cancelled_by_creator",
      });
      return { tradeId, status };
    },
  });
}

async function attachEconomyStickerRecord(input: {
  connection: PoolConnection;
  weapon: EconomyInventoryItem;
  sticker: EconomyInventoryItem;
  slot: number;
  actorSteamId: string;
  idempotencyKey: string;
  linePrefix: string;
  eventType: string;
}) {
  if (economyStickerSlots(input.weapon) <= input.slot)
    economyError(
      "unsupported_customization",
      "That weapon does not support this sticker slot.",
    );
  if (
    input.sticker.itemType !== "sticker" ||
    input.sticker.state !== "available"
  ) {
    economyError(
      "ownership_required",
      "The sticker is not available for attachment.",
    );
  }
  const [existingRows] = await input.connection.query<
    Array<RowDataPacket & { sticker_item_id: string }>
  >(
    "SELECT sticker_item_id FROM portal_inventory_item_stickers WHERE (weapon_item_id = ? AND sticker_slot = ?) OR sticker_item_id = ? FOR UPDATE",
    [input.weapon.id, input.slot, input.sticker.id],
  );
  if (existingRows.length)
    economyError(
      "sticker_slot_occupied",
      "The sticker is already attached or that sticker slot is occupied.",
    );
  await input.connection.execute(
    "INSERT INTO portal_inventory_item_stickers (weapon_item_id, sticker_slot, sticker_item_id, sticker_catalogue_id, sticker_definition_index, sticker_paintkit, sticker_rarity_rank, applied_by_steam_id, attributes) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)",
    [
      input.weapon.id,
      input.slot,
      input.sticker.id,
      input.sticker.catalogueId,
      input.sticker.definitionIndex,
      input.sticker.paintkit,
      input.sticker.rarityRank,
      input.actorSteamId,
      JSON.stringify(input.sticker.attributes),
    ],
  );
  await input.connection.execute(
    "UPDATE portal_inventory_items SET state = 'attached' WHERE id = ? AND state = 'available'",
    [input.sticker.id],
  );
  await writeInventoryEvent({
    connection: input.connection,
    itemId: input.weapon.id,
    actorSteamId: input.actorSteamId,
    eventType: input.eventType,
    idempotencyKey: input.idempotencyKey,
    lineKey: input.linePrefix + ":weapon:" + input.slot,
    metadata: { stickerItemId: input.sticker.id, slot: input.slot },
  });
  await writeInventoryEvent({
    connection: input.connection,
    itemId: input.sticker.id,
    actorSteamId: input.actorSteamId,
    eventType: "sticker.attached",
    idempotencyKey: input.idempotencyKey,
    lineKey: input.linePrefix + ":sticker:" + input.slot,
    beforeState: economyInventorySnapshot(input.sticker),
    afterState: {
      ...economyInventorySnapshot(input.sticker),
      state: "attached",
    },
    metadata: { weaponItemId: input.weapon.id, slot: input.slot },
  });
}

export async function staffAdjustTokens(
  input: StaffAdjustTokensInput,
): Promise<StaffAdjustTokensResult> {
  const actorSteamId = economySteamId(input.actorSteamId, "Staff Steam ID");
  const targetSteamId = economySteamId(input.targetSteamId, "Target Steam ID");
  if (!["award", "take", "set"].includes(input.action))
    economyError("invalid_input", "The token action is invalid.");
  const amount = economyAmount(input.amount, "Token amount");
  const reason = economyText(input.reason, "Staff reason", 300);
  return runEconomyMutation({
    operationName: "staff.tokens." + input.action,
    actorSteamId,
    idempotencyKey: input.idempotencyKey,
    request: { targetSteamId, action: input.action, amount, reason },
    work: async (context) => {
      const wallets = await lockTokenAccounts(context.connection, [
        targetSteamId,
      ]);
      const current = wallets.get(targetSteamId);
      if (!current)
        economyError("wallet_unavailable", "The target wallet was not locked.");
      const delta =
        input.action === "award"
          ? amount
          : input.action === "take"
            ? -amount
            : amount - current.balance;
      if (delta !== 0) {
        await applyTokenDelta({
          connection: context.connection,
          wallets,
          steamId: targetSteamId,
          delta,
          reason: "staff.tokens." + input.action,
          referenceType: "staff-action",
          referenceId: context.idempotencyKey,
          idempotencyKey: context.idempotencyKey,
          lineKey: "staff:tokens",
          actorSteamId,
          metadata: { reason, requestedAmount: amount },
        });
      }
      const wallet = wallets.get(targetSteamId);
      if (!wallet)
        economyError(
          "wallet_unavailable",
          "The target wallet was not updated.",
        );
      await writeEconomyAdminAudit({
        connection: context.connection,
        actorSteamId,
        action: "tokens." + input.action,
        targetSteamId,
        targetType: "token-account",
        targetId: targetSteamId,
        idempotencyKey: context.idempotencyKey,
        metadata: { amount, delta, reason },
      });
      return { targetSteamId, delta, wallet };
    },
  });
}

export async function staffGrantEconomyItem(
  input: StaffGrantEconomyItemInput,
): Promise<StaffGrantEconomyItemResult> {
  const actorSteamId = economySteamId(input.actorSteamId, "Staff Steam ID");
  const targetSteamId = economySteamId(input.targetSteamId, "Target Steam ID");
  const reason = economyText(input.reason, "Staff reason", 300);
  const customItem = input.customItem ?? undefined;
  if ((input.catalogueId === undefined) === (customItem === undefined)) {
    economyError(
      "invalid_input",
      "Provide exactly one catalogue item or custom item.",
    );
  }
  const stickerSlots = input.stickers ?? [];
  if (!Array.isArray(stickerSlots) || stickerSlots.length > 6)
    economyError("invalid_input", "The sticker configuration is invalid.");
  return runEconomyMutation({
    operationName: "staff.item.grant",
    actorSteamId,
    idempotencyKey: input.idempotencyKey,
    request: {
      targetSteamId,
      catalogueId: input.catalogueId ?? null,
      customItem: customItem ?? null,
      customization: input.customization ?? {},
      stickers: stickerSlots,
      reason,
    },
    work: async (context) => {
      await lockTokenAccounts(context.connection, [targetSteamId]);
      const catalogue =
        input.catalogueId === undefined
          ? null
          : await lockEconomyCatalogue(
              context.connection,
              input.catalogueId,
              true,
            );
      if (
        catalogue &&
        (catalogue.itemType === "crate" || catalogue.itemType === "capsule")
      ) {
        const table = await lockEconomyLootTable(context.connection, {
          containerCatalogueId: catalogue.id,
        });
        await lockEconomyLootEntries(context.connection, table.id);
      }
      const created = await createEconomyInventoryItem(context.connection, {
        ownerSteamId: targetSteamId,
        catalogue,
        customItem,
        customization: input.customization,
        source: { type: "staff_grant", actorSteamId, reason },
        actorSteamId,
        idempotencyKey: context.idempotencyKey,
        lineKey: "staff:grant:item",
        eventType: "staff.item.granted",
      });
      const weapon = await lockEconomyInventoryItem(
        context.connection,
        created.id,
      );
      const usedSlots = new Set<number>();
      const stickerItemIds: string[] = [];
      for (let index = 0; index < stickerSlots.length; index += 1) {
        const stickerGrant = stickerSlots[index];
        if (
          !Number.isSafeInteger(stickerGrant.slot) ||
          stickerGrant.slot < 0 ||
          stickerGrant.slot > 5 ||
          usedSlots.has(stickerGrant.slot)
        ) {
          economyError("invalid_input", "The staff sticker slot is invalid.");
        }
        usedSlots.add(stickerGrant.slot);
        const customSticker = stickerGrant.customItem ?? undefined;
        if (
          (stickerGrant.catalogueId === undefined) ===
          (customSticker === undefined)
        ) {
          economyError(
            "invalid_input",
            "Each staff sticker must use a catalogue or custom item.",
          );
        }
        const stickerCatalogue =
          stickerGrant.catalogueId === undefined
            ? null
            : await lockEconomyCatalogue(
                context.connection,
                stickerGrant.catalogueId,
                true,
              );
        const stickerCreated = await createEconomyInventoryItem(
          context.connection,
          {
            ownerSteamId: targetSteamId,
            catalogue: stickerCatalogue,
            customItem: customSticker,
            customization: stickerGrant.customization,
            source: {
              type: "staff_grant_sticker",
              actorSteamId,
              reason,
              parentItemId: created.id,
            },
            actorSteamId,
            idempotencyKey: context.idempotencyKey,
            lineKey: "staff:grant:sticker:" + index,
            eventType: "staff.sticker.granted",
          },
        );
        const sticker = await lockEconomyInventoryItem(
          context.connection,
          stickerCreated.id,
        );
        await attachEconomyStickerRecord({
          connection: context.connection,
          weapon,
          sticker,
          slot: stickerGrant.slot,
          actorSteamId,
          idempotencyKey: context.idempotencyKey,
          linePrefix: "grant:" + index,
          eventType: "staff.sticker.attached",
        });
        stickerItemIds.push(sticker.id);
      }
      await writeEconomyAdminAudit({
        connection: context.connection,
        actorSteamId,
        action: "item.granted",
        targetSteamId,
        targetType: "inventory-item",
        targetId: created.id,
        idempotencyKey: context.idempotencyKey,
        metadata: {
          catalogueId: created.catalogueId,
          itemType: created.itemType,
          stickerItemIds,
          reason,
        },
      });
      await createEconomyNotification({
        connection: context.connection,
        steamId: targetSteamId,
        notificationType: "staff.item.granted",
        payload: {
          itemId: created.id,
          displayName: created.displayName,
          stickerItemIds,
          reason,
        },
      });
      if (stickerItemIds.length) {
        await enqueueEconomyLoadoutRefresh(
          context.connection,
          targetSteamId,
          context.idempotencyKey,
          "staff-stickers-granted",
          [created.id, ...stickerItemIds],
        );
      }
      return { itemId: created.id, stickerItemIds };
    },
  });
}

export async function staffUpdateEconomyItem(
  input: StaffUpdateEconomyItemInput,
): Promise<StaffUpdateEconomyItemResult> {
  const actorSteamId = economySteamId(input.actorSteamId, "Staff Steam ID");
  const targetSteamId = economySteamId(input.targetSteamId, "Target Steam ID");
  const itemId = economyItemId(input.itemId);
  const reason = economyText(input.reason, "Staff reason", 300);
  const customization = input.customization ?? {};
  const hasChange = Object.values(customization).some(
    (value) => value !== undefined,
  );
  if (!hasChange)
    economyError("invalid_input", "Provide at least one item customization.");
  return runEconomyMutation({
    operationName: "staff.item.update",
    actorSteamId,
    idempotencyKey: input.idempotencyKey,
    request: { targetSteamId, itemId, customization, reason },
    work: async (context) => {
      const item = await lockEconomyInventoryItem(context.connection, itemId);
      if (item.ownerSteamId !== targetSteamId)
        economyError(
          "ownership_required",
          "That item does not belong to the selected player.",
        );
      if (item.state === "consumed")
        economyError("item_consumed", "Consumed items cannot be customized.");
      if (
        customization.stattrak !== undefined &&
        typeof customization.stattrak !== "boolean"
      )
        economyError("invalid_input", "StatTrak must be enabled or disabled.");
      const nextSeed = Object.prototype.hasOwnProperty.call(
        customization,
        "seed",
      )
        ? economySeed(customization.seed, "Item seed")
        : item.seed;
      const nextFloat = Object.prototype.hasOwnProperty.call(
        customization,
        "floatValue",
      )
        ? economyFloat(customization.floatValue, "Item float")
        : item.floatValue;
      const nextCount =
        customization.stattrakCount === undefined
          ? item.stattrakCount
          : economyAmount(customization.stattrakCount, "StatTrak count");
      const nextStattrak =
        customization.stattrak === undefined
          ? item.stattrak
          : customization.stattrak;
      const nextNametag = Object.prototype.hasOwnProperty.call(
        customization,
        "nametag",
      )
        ? economyNullableText(customization.nametag, "Name tag", 128)
        : item.nametag;
      if (
        customization.attributes !== undefined &&
        !asRecord(customization.attributes)
      )
        economyError("invalid_input", "Item attributes must be an object.");
      const nextAttributes =
        customization.attributes === undefined
          ? item.attributes
          : { ...item.attributes, ...customization.attributes };
      await context.connection.execute(
        "UPDATE portal_inventory_items SET seed = ?, float_value = ?, stattrak = ?, stattrak_count = ?, nametag = ?, attributes = ? WHERE id = ?",
        [
          nextSeed,
          nextFloat,
          nextStattrak,
          nextCount,
          nextNametag,
          JSON.stringify(nextAttributes),
          itemId,
        ],
      );
      await writeInventoryEvent({
        connection: context.connection,
        itemId,
        actorSteamId,
        eventType: "staff.item.updated",
        idempotencyKey: context.idempotencyKey,
        lineKey: "staff:update",
        beforeState: economyInventorySnapshot(item),
        afterState: {
          ...economyInventorySnapshot(item),
          seed: nextSeed,
          floatValue: nextFloat,
          stattrak: nextStattrak,
          stattrakCount: nextCount,
          nametag: nextNametag,
          attributes: nextAttributes,
        },
        metadata: { reason },
      });
      await writeEconomyAdminAudit({
        connection: context.connection,
        actorSteamId,
        action: "item.updated",
        targetSteamId,
        targetType: "inventory-item",
        targetId: itemId,
        idempotencyKey: context.idempotencyKey,
        metadata: { reason, customization },
      });
      await enqueueEconomyLoadoutRefresh(
        context.connection,
        targetSteamId,
        context.idempotencyKey,
        "staff-item-updated",
        [itemId],
      );
      return { itemId };
    },
  });
}

export async function staffSetEconomyItemState(
  input: StaffSetEconomyItemStateInput,
): Promise<StaffSetEconomyItemStateResult> {
  const actorSteamId = economySteamId(input.actorSteamId, "Staff Steam ID");
  const targetSteamId = economySteamId(input.targetSteamId, "Target Steam ID");
  const itemId = economyItemId(input.itemId);
  const reason = economyText(input.reason, "Staff reason", 300);
  if (input.state !== "available" && input.state !== "revoked")
    economyError("invalid_input", "The staff item state is invalid.");
  return runEconomyMutation({
    operationName: "staff.item.state",
    actorSteamId,
    idempotencyKey: input.idempotencyKey,
    request: { targetSteamId, itemId, state: input.state, reason },
    work: async (context) => {
      const item = await lockEconomyInventoryItem(context.connection, itemId);
      if (item.ownerSteamId !== targetSteamId)
        economyError(
          "ownership_required",
          "That item does not belong to the selected player.",
        );
      if (item.state === "escrowed")
        economyError(
          "item_escrowed",
          "Cancel the pending trade before changing this item's state.",
        );
      if (item.state === "attached")
        economyError(
          "item_attached",
          "Detach the sticker before changing its state.",
        );
      if (item.state === "consumed")
        economyError(
          "item_consumed",
          "Consumed items cannot be restored or revoked.",
        );
      await context.connection.execute(
        "UPDATE portal_inventory_items SET state = ? WHERE id = ?",
        [input.state, itemId],
      );
      if (input.state === "revoked")
        await clearEconomyLoadoutSlots(context.connection, targetSteamId, [
          itemId,
        ]);
      await writeInventoryEvent({
        connection: context.connection,
        itemId,
        actorSteamId,
        eventType: "staff.item.state",
        idempotencyKey: context.idempotencyKey,
        lineKey: "staff:state",
        beforeState: economyInventorySnapshot(item),
        afterState: { ...economyInventorySnapshot(item), state: input.state },
        metadata: { reason },
      });
      await writeEconomyAdminAudit({
        connection: context.connection,
        actorSteamId,
        action: "item.state." + input.state,
        targetSteamId,
        targetType: "inventory-item",
        targetId: itemId,
        idempotencyKey: context.idempotencyKey,
        metadata: { reason },
      });
      await enqueueEconomyLoadoutRefresh(
        context.connection,
        targetSteamId,
        context.idempotencyKey,
        "staff-item-state",
        [itemId],
      );
      return { itemId, state: input.state };
    },
  });
}

export async function staffTransferEconomyItem(
  input: StaffTransferEconomyItemInput,
): Promise<StaffTransferEconomyItemResult> {
  const actorSteamId = economySteamId(input.actorSteamId, "Staff Steam ID");
  const fromSteamId = economySteamId(input.fromSteamId, "Source Steam ID");
  const toSteamId = economySteamId(input.toSteamId, "Destination Steam ID");
  const itemId = economyItemId(input.itemId);
  const reason = economyText(input.reason, "Staff reason", 300);
  if (fromSteamId === toSteamId)
    economyError(
      "invalid_input",
      "The source and destination players must differ.",
    );
  return runEconomyMutation({
    operationName: "staff.item.transfer",
    actorSteamId,
    idempotencyKey: input.idempotencyKey,
    request: { fromSteamId, toSteamId, itemId, reason },
    work: async (context) => {
      await lockTokenAccounts(context.connection, [fromSteamId, toSteamId]);
      const item = await lockEconomyInventoryItem(context.connection, itemId);
      if (item.ownerSteamId !== fromSteamId || item.state !== "available") {
        economyError(
          "ownership_required",
          "Only an available item belonging to the source player can be transferred.",
        );
      }
      await context.connection.execute(
        "UPDATE portal_inventory_items SET owner_steam_id = ? WHERE id = ?",
        [toSteamId, itemId],
      );
      await moveAttachedStickersWithWeapon(
        context.connection,
        [itemId],
        toSteamId,
      );
      await clearEconomyLoadoutSlots(context.connection, fromSteamId, [itemId]);
      await writeInventoryEvent({
        connection: context.connection,
        itemId,
        actorSteamId,
        eventType: "staff.item.transferred",
        idempotencyKey: context.idempotencyKey,
        lineKey: "staff:transfer",
        beforeState: economyInventorySnapshot(item),
        afterState: {
          ...economyInventorySnapshot(item),
          ownerSteamId: toSteamId,
        },
        metadata: { fromSteamId, toSteamId, reason },
      });
      await writeEconomyAdminAudit({
        connection: context.connection,
        actorSteamId,
        action: "item.transferred",
        targetSteamId: toSteamId,
        targetType: "inventory-item",
        targetId: itemId,
        idempotencyKey: context.idempotencyKey,
        metadata: { fromSteamId, toSteamId, reason },
      });
      await createEconomyNotification({
        connection: context.connection,
        steamId: toSteamId,
        notificationType: "staff.item.transferred",
        payload: { itemId, fromSteamId, reason },
      });
      await enqueueEconomyLoadoutRefresh(
        context.connection,
        fromSteamId,
        context.idempotencyKey,
        "staff-transfer",
        [itemId],
      );
      await enqueueEconomyLoadoutRefresh(
        context.connection,
        toSteamId,
        context.idempotencyKey,
        "staff-transfer",
        [itemId],
      );
      return { itemId, fromSteamId, toSteamId };
    },
  });
}

export async function staffAttachStickerToEconomyItem(
  input: StaffAttachStickerToEconomyItemInput,
): Promise<AttachEconomyStickerResult> {
  const actorSteamId = economySteamId(input.actorSteamId, "Staff Steam ID");
  const targetSteamId = economySteamId(input.targetSteamId, "Target Steam ID");
  const weaponItemId = economyItemId(input.weaponItemId, "Weapon item ID");
  const reason = economyText(input.reason, "Staff reason", 300);
  if (!Number.isSafeInteger(input.slot) || input.slot < 0 || input.slot > 5)
    economyError("invalid_input", "The sticker slot is invalid.");
  if (
    (input.stickerItemId === undefined) ===
    (input.stickerCatalogueId === undefined)
  ) {
    economyError(
      "invalid_input",
      "Provide exactly one existing sticker item or sticker catalogue item.",
    );
  }
  const suppliedStickerItemId =
    input.stickerItemId === undefined
      ? null
      : economyItemId(input.stickerItemId, "Sticker item ID");
  const suppliedStickerCatalogueId =
    input.stickerCatalogueId === undefined
      ? null
      : economyNumber(input.stickerCatalogueId, "Sticker catalogue item ID", 1);
  return runEconomyMutation({
    operationName: "staff.item.sticker.attach",
    actorSteamId,
    idempotencyKey: input.idempotencyKey,
    request: {
      targetSteamId,
      weaponItemId,
      stickerItemId: suppliedStickerItemId,
      stickerCatalogueId: suppliedStickerCatalogueId,
      slot: input.slot,
      reason,
    },
    work: async (context) => {
      const weapon = await lockEconomyInventoryItem(
        context.connection,
        weaponItemId,
      );
      if (
        weapon.ownerSteamId !== targetSteamId ||
        weapon.state !== "available"
      ) {
        economyError(
          "ownership_required",
          "That weapon is not available in the selected player's inventory.",
        );
      }
      let sticker: EconomyInventoryItem;
      if (suppliedStickerItemId) {
        sticker = await lockEconomyInventoryItem(
          context.connection,
          suppliedStickerItemId,
        );
        if (
          sticker.ownerSteamId !== targetSteamId ||
          sticker.state !== "available"
        ) {
          economyError(
            "ownership_required",
            "That sticker is not available in the selected player's inventory.",
          );
        }
      } else {
        const catalogue = await lockEconomyCatalogue(
          context.connection,
          suppliedStickerCatalogueId ?? 0,
          true,
        );
        if (catalogue.itemType !== "sticker")
          economyError(
            "invalid_input",
            "The chosen catalogue item is not a sticker.",
          );
        const created = await createEconomyInventoryItem(context.connection, {
          ownerSteamId: targetSteamId,
          catalogue,
          source: {
            type: "staff_sticker_attachment",
            actorSteamId,
            reason,
            weaponItemId,
          },
          actorSteamId,
          idempotencyKey: context.idempotencyKey,
          lineKey: "staff:attach:grant",
          eventType: "staff.sticker.granted",
        });
        sticker = await lockEconomyInventoryItem(
          context.connection,
          created.id,
        );
      }
      await attachEconomyStickerRecord({
        connection: context.connection,
        weapon,
        sticker,
        slot: input.slot,
        actorSteamId,
        idempotencyKey: context.idempotencyKey,
        linePrefix: "staff:attach",
        eventType: "staff.sticker.attached",
      });
      await writeEconomyAdminAudit({
        connection: context.connection,
        actorSteamId,
        action: "item.sticker.attached",
        targetSteamId,
        targetType: "inventory-item",
        targetId: weaponItemId,
        idempotencyKey: context.idempotencyKey,
        metadata: { stickerItemId: sticker.id, slot: input.slot, reason },
      });
      await enqueueEconomyLoadoutRefresh(
        context.connection,
        targetSteamId,
        context.idempotencyKey,
        "staff-sticker-attached",
        [weaponItemId, sticker.id],
      );
      return { weaponItemId, stickerItemId: sticker.id, slot: input.slot };
    },
  });
}

export async function staffDetachEconomySticker(
  input: StaffDetachEconomyStickerInput,
): Promise<StaffDetachEconomyStickerResult> {
  const actorSteamId = economySteamId(input.actorSteamId, "Staff Steam ID");
  const targetSteamId = economySteamId(input.targetSteamId, "Target Steam ID");
  const weaponItemId = economyItemId(input.weaponItemId, "Weapon item ID");
  const reason = economyText(input.reason, "Staff reason", 300);
  if (!Number.isSafeInteger(input.slot) || input.slot < 0 || input.slot > 5)
    economyError("invalid_input", "The sticker slot is invalid.");
  return runEconomyMutation({
    operationName: "staff.item.sticker.detach",
    actorSteamId,
    idempotencyKey: input.idempotencyKey,
    request: { targetSteamId, weaponItemId, slot: input.slot, reason },
    work: async (context) => {
      const weapon = await lockEconomyInventoryItem(
        context.connection,
        weaponItemId,
      );
      if (weapon.ownerSteamId !== targetSteamId)
        economyError(
          "ownership_required",
          "That weapon does not belong to the selected player.",
        );
      const [attachmentRows] = await context.connection.query<
        Array<RowDataPacket & { sticker_item_id: string }>
      >(
        "SELECT sticker_item_id FROM portal_inventory_item_stickers WHERE weapon_item_id = ? AND sticker_slot = ? FOR UPDATE",
        [weaponItemId, input.slot],
      );
      const stickerItemId = attachmentRows[0]?.sticker_item_id
        ? economyItemId(String(attachmentRows[0].sticker_item_id))
        : null;
      if (!stickerItemId)
        economyError(
          "sticker_not_attached",
          "There is no sticker in that slot.",
        );
      const sticker = await lockEconomyInventoryItem(
        context.connection,
        stickerItemId,
      );
      if (
        sticker.ownerSteamId !== targetSteamId ||
        sticker.state !== "attached"
      ) {
        economyError(
          "sticker_not_attached",
          "That sticker attachment is no longer valid.",
        );
      }
      await context.connection.execute(
        "DELETE FROM portal_inventory_item_stickers WHERE weapon_item_id = ? AND sticker_slot = ?",
        [weaponItemId, input.slot],
      );
      await context.connection.execute(
        "UPDATE portal_inventory_items SET state = 'available' WHERE id = ? AND state = 'attached'",
        [stickerItemId],
      );
      await writeInventoryEvent({
        connection: context.connection,
        itemId: weaponItemId,
        actorSteamId,
        eventType: "staff.sticker.detached",
        idempotencyKey: context.idempotencyKey,
        lineKey: "staff:detach:weapon",
        metadata: { stickerItemId, slot: input.slot, reason },
      });
      await writeInventoryEvent({
        connection: context.connection,
        itemId: stickerItemId,
        actorSteamId,
        eventType: "sticker.detached",
        idempotencyKey: context.idempotencyKey,
        lineKey: "staff:detach:sticker",
        beforeState: economyInventorySnapshot(sticker),
        afterState: {
          ...economyInventorySnapshot(sticker),
          state: "available",
        },
        metadata: { weaponItemId, slot: input.slot, reason },
      });
      await writeEconomyAdminAudit({
        connection: context.connection,
        actorSteamId,
        action: "item.sticker.detached",
        targetSteamId,
        targetType: "inventory-item",
        targetId: weaponItemId,
        idempotencyKey: context.idempotencyKey,
        metadata: { stickerItemId, slot: input.slot, reason },
      });
      await enqueueEconomyLoadoutRefresh(
        context.connection,
        targetSteamId,
        context.idempotencyKey,
        "staff-sticker-detached",
        [weaponItemId, stickerItemId],
      );
      return { weaponItemId, stickerItemId, slot: input.slot };
    },
  });
}

export async function staffEquipEconomyItem(
  input: StaffEquipEconomyItemInput,
): Promise<EquipEconomyItemResult> {
  const actorSteamId = economySteamId(input.actorSteamId, "Staff Steam ID");
  const targetSteamId = economySteamId(input.targetSteamId, "Target Steam ID");
  const itemId = economyItemId(input.itemId);
  const slot = economySlot(input.slot);
  const reason = economyText(input.reason, "Staff reason", 300);
  return runEconomyMutation({
    operationName: "staff.loadout.equip",
    actorSteamId,
    idempotencyKey: input.idempotencyKey,
    request: { targetSteamId, itemId, slot, reason },
    work: async (context) => {
      const item = await lockEconomyInventoryItem(context.connection, itemId);
      if (item.ownerSteamId !== targetSteamId || item.state !== "available")
        economyError(
          "ownership_required",
          "That item is not available for the selected player.",
        );
      economyEnsureLoadoutCompatibility(item, slot);
      const savedSlot = await setEconomyLoadoutSlot({
        connection: context.connection,
        ownerSteamId: targetSteamId,
        slot,
        item,
      });
      await writeInventoryEvent({
        connection: context.connection,
        itemId,
        actorSteamId,
        eventType: "staff.loadout.equipped",
        idempotencyKey: context.idempotencyKey,
        lineKey: "staff:equip",
        metadata: { slotKey: slot.slotKey, reason },
      });
      await writeEconomyAdminAudit({
        connection: context.connection,
        actorSteamId,
        action: "loadout.equipped",
        targetSteamId,
        targetType: "loadout-slot",
        targetId: slot.slotKey,
        idempotencyKey: context.idempotencyKey,
        metadata: { itemId, reason },
      });
      await enqueueEconomyLoadoutRefresh(
        context.connection,
        targetSteamId,
        context.idempotencyKey,
        "staff-equipped",
        [itemId],
      );
      return { itemId, slot: savedSlot };
    },
  });
}

export async function staffClearEconomyLoadoutSlot(
  input: StaffClearEconomyLoadoutSlotInput,
): Promise<ClearEconomyLoadoutSlotResult> {
  const actorSteamId = economySteamId(input.actorSteamId, "Staff Steam ID");
  const targetSteamId = economySteamId(input.targetSteamId, "Target Steam ID");
  const slot = economySlot(input.slot);
  const reason = economyText(input.reason, "Staff reason", 300);
  return runEconomyMutation({
    operationName: "staff.loadout.clear",
    actorSteamId,
    idempotencyKey: input.idempotencyKey,
    request: { targetSteamId, slot, reason },
    work: async (context) => {
      const [slotRows] = await context.connection.query<
        Array<RowDataPacket & { item_id: string | null }>
      >(
        "SELECT item_id FROM portal_loadout_slots WHERE owner_steam_id = ? AND slot_key = ? FOR UPDATE",
        [targetSteamId, slot.slotKey],
      );
      const previousItemId = slotRows[0]?.item_id
        ? economyItemId(String(slotRows[0].item_id))
        : null;
      if (previousItemId) {
        const item = await lockEconomyInventoryItem(
          context.connection,
          previousItemId,
        );
        if (item.ownerSteamId !== targetSteamId)
          economyError(
            "ownership_required",
            "The equipped item no longer belongs to the selected player.",
          );
        await writeInventoryEvent({
          connection: context.connection,
          itemId: previousItemId,
          actorSteamId,
          eventType: "staff.loadout.cleared",
          idempotencyKey: context.idempotencyKey,
          lineKey: "staff:clear",
          metadata: { slotKey: slot.slotKey, reason },
        });
      }
      const savedSlot = await setEconomyLoadoutSlot({
        connection: context.connection,
        ownerSteamId: targetSteamId,
        slot,
        item: null,
      });
      await writeEconomyAdminAudit({
        connection: context.connection,
        actorSteamId,
        action: "loadout.cleared",
        targetSteamId,
        targetType: "loadout-slot",
        targetId: slot.slotKey,
        idempotencyKey: context.idempotencyKey,
        metadata: { previousItemId, reason },
      });
      await enqueueEconomyLoadoutRefresh(
        context.connection,
        targetSteamId,
        context.idempotencyKey,
        "staff-cleared",
        previousItemId ? [previousItemId] : [],
      );
      return { slot: savedSlot };
    },
  });
}

export async function getStaffEconomyAccount(
  steamId: string,
): Promise<StaffEconomyAccount> {
  economySteamId(steamId);
  const wallet = await getTokenWallet(steamId);
  const inventoryFilter: EconomyInventoryFilter = {
    states: ["available", "escrowed", "attached", "consumed", "revoked"],
    page: 1,
    pageSize: 100,
  };
  const firstInventoryPage = await getPlayerEconomyInventory(
    steamId,
    inventoryFilter,
  );
  const inventoryPageCount = Math.ceil(
    firstInventoryPage.total / firstInventoryPage.pageSize,
  );
  const inventory =
    inventoryPageCount <= 1
      ? firstInventoryPage
      : {
          ...firstInventoryPage,
          items: [
            ...firstInventoryPage.items,
            ...(
              await Promise.all(
                Array.from({ length: inventoryPageCount - 1 }, (_, index) =>
                  getPlayerEconomyInventory(steamId, {
                    ...inventoryFilter,
                    page: index + 2,
                  }),
                ),
              )
            ).flatMap((page) => page.items),
          ],
        };
  const loadout = await getPlayerEconomyLoadout(steamId);
  const pool = getPortalPool();
  if (!pool) {
    return {
      steamId,
      wallet,
      inventory,
      loadout,
      pendingIncomingTrades: 0,
      pendingOutgoingTrades: 0,
    };
  }
  const [tradeRows] = await pool.query<
    Array<
      RowDataPacket & { incoming: number | string; outgoing: number | string }
    >
  >(
    "SELECT SUM(counterparty_steam_id = ?) AS incoming, SUM(creator_steam_id = ?) AS outgoing FROM portal_economy_trades WHERE status = 'pending'",
    [steamId, steamId],
  );
  return {
    steamId,
    wallet,
    inventory,
    loadout,
    pendingIncomingTrades: economyNumber(
      tradeRows[0]?.incoming ?? 0,
      "pending incoming trade count",
    ),
    pendingOutgoingTrades: economyNumber(
      tradeRows[0]?.outgoing ?? 0,
      "pending outgoing trade count",
    ),
  };
}

export async function findStaffEconomyAccounts(
  filter: StaffEconomyAccountFilter = {},
): Promise<StaffEconomyAccountPage> {
  const pool = getPortalPool();
  const paging = economyPage(filter.page, filter.pageSize, 100);
  if (!pool)
    return {
      accounts: [],
      total: 0,
      page: paging.page,
      pageSize: paging.pageSize,
    };
  const values: unknown[] = [];
  let clause = "";
  if (filter.query?.trim()) {
    clause = " WHERE a.steam_id LIKE ?";
    values.push(
      "%" + economyText(filter.query, "Staff account search", 17) + "%",
    );
  }
  const [countRows] = await pool.query<
    Array<RowDataPacket & { total: number | string }>
  >(
    "SELECT COUNT(*) AS total FROM portal_token_accounts AS a" + clause,
    values,
  );
  const [rows] = await pool.query<
    Array<
      EconomyAccountRow & {
        inventory_count: number | string;
        pending_trade_count: number | string;
      }
    >
  >(
    "SELECT a.steam_id, a.balance, a.lifetime_earned, a.lifetime_spent, a.created_at, a.updated_at, " +
      "(SELECT COUNT(*) FROM portal_inventory_items AS i WHERE i.owner_steam_id = a.steam_id AND i.state IN ('available', 'escrowed', 'attached')) AS inventory_count, " +
      "(SELECT COUNT(*) FROM portal_economy_trades AS t WHERE t.status = 'pending' AND (t.creator_steam_id = a.steam_id OR t.counterparty_steam_id = a.steam_id)) AS pending_trade_count " +
      "FROM portal_token_accounts AS a" +
      clause +
      " ORDER BY a.updated_at DESC, a.steam_id ASC LIMIT ? OFFSET ?",
    [...values, paging.pageSize, paging.offset],
  );
  return {
    accounts: rows.map((row) => ({
      steamId: String(row.steam_id),
      wallet: toTokenWallet(row),
      inventoryCount: economyNumber(row.inventory_count, "inventory count"),
      pendingTradeCount: economyNumber(
        row.pending_trade_count,
        "pending trade count",
      ),
    })),
    total: economyCount(countRows),
    page: paging.page,
    pageSize: paging.pageSize,
  };
}
