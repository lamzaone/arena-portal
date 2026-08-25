import "server-only";

import mysql, { type Pool, type ResultSetHeader, type RowDataPacket } from "mysql2/promise";

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
  AdminName: string;
  Server: string;
  GlobalSanction: number | boolean;
  CreatedAt: number;
};

type BanRow = RowDataPacket & {
  Id: number;
  Reason: string;
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

export type PortalBridgeEvent = "moderation.ban" | "moderation.unban" | "loadout.weapon.set" | "loadout.weapon.reset" | "loadout.knife.set" | "loadout.knife.reset" | "loadout.glove.set" | "loadout.glove.reset" | "loadout.agent.set" | "loadout.agent.reset" | "loadout.music-kit.set" | "loadout.music-kit.reset";

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
  adminName: string;
  expiresAt: number;
  length: number;
  createdAt: number;
};

export type PlayerDashboard = {
  sourceConnected: boolean;
  hasGameRecord: boolean;
  displayName: string | null;
  points: number;
  rank: number;
  leaderboardPosition: number | null;
  playtimeSeconds: number;
  kills: number;
  deaths: number;
  headshots: number;
  noscopes: number;
  gamesPlayed: number;
  gameWins: number;
  gameLosses: number;
  vipGroups: string[];
  adminGroups: string[];
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
  playtimeSeconds: number;
  kills: number;
  deaths: number;
  headshots: number;
  noscopes: number;
  vipGroups: string[];
  adminGroups: string[];
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
  body: string;
  status: string;
  createdAt: string;
  updatedAt: string;
  messages: CaseMessage[];
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

export type VipRosterPage = {
  vips: StaffVip[];
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
    bigNumberStrings: true
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
  try {
    const parsed = JSON.parse(value) as unknown;
    if (Array.isArray(parsed)) return parsed.filter((group): group is string => typeof group === "string");
  } catch {
    // Legacy Swiftly group fields can be comma-separated strings.
  }
  return value.split(",").map((group) => group.trim()).filter(Boolean);
}

async function safeGameQuery<T extends RowDataPacket>(sql: string, values: unknown[]) {
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

async function safeAdminQuery<T extends RowDataPacket>(sql: string, values: unknown[]) {
  return safeGameQuery<T>(sql, values);
}

function normalizeUnixTime(value: unknown) {
  const timestamp = Number(value ?? 0);
  return timestamp > 10_000_000_000 ? Math.floor(timestamp / 1_000) : timestamp;
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
  return typeof value === "object" && value !== null && !Array.isArray(value) ? value as Record<string, unknown> : null;
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

function parseLoadoutCatalogue(payload: unknown, syncedAt: Date): LoadoutCatalogue | null {
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
  if (!snapshot || !Array.isArray(snapshot.items) || !Array.isArray(snapshot.agents) || !Array.isArray(snapshot.musicKits)) return null;

  const items: LoadoutItem[] = snapshot.items.flatMap((entry) => {
    const item = asRecord(entry);
    const category = item?.category;
    const definitionIndex = asInteger(item?.definitionIndex);
    const key = asText(item?.key);
    if (!item || !key || definitionIndex === null || !["weapon", "knife", "glove"].includes(String(category))) return [];

    const paintkits: LoadoutPaintkit[] = Array.isArray(item.paintkits) ? item.paintkits.flatMap((paintkitEntry) => {
      const paintkit = asRecord(paintkitEntry);
      const paintkitIndex = asInteger(paintkit?.paintkit);
      const paintkitKey = asText(paintkit?.key);
      if (!paintkit || !paintkitKey || paintkitIndex === null || paintkitIndex < 0) return [];
      return [{
        key: paintkitKey,
        displayName: asText(paintkit.displayName, paintkitKey),
        paintkit: paintkitIndex,
        rarity: asText(paintkit.rarity, "Standard"),
        color: asText(paintkit.color, "#ff7185")
      }];
    }) : [];

    return [{
      key,
      displayName: asText(item.displayName, key),
      definitionIndex,
      category: category as LoadoutCategory,
      paintkits
    }];
  });

  const agents: LoadoutAgent[] = snapshot.agents.flatMap((entry) => {
    const agent = asRecord(entry);
    const agentIndex = asInteger(agent?.agentIndex);
    const team = asLoadoutTeam(agent?.team);
    const key = asText(agent?.key);
    if (!agent || !key || agentIndex === null || !team) return [];
    return [{
      key,
      displayName: asText(agent.displayName, key),
      agentIndex,
      team,
      rarity: asText(agent.rarity, "Standard"),
      color: asText(agent.color, "#ff7185")
    }];
  });

  const musicKits: LoadoutMusicKit[] = snapshot.musicKits.flatMap((entry) => {
    const musicKit = asRecord(entry);
    const musicKitIndex = asInteger(musicKit?.musicKitIndex);
    const key = asText(musicKit?.key);
    if (!musicKit || !key || musicKitIndex === null) return [];
    return [{
      key,
      displayName: asText(musicKit.displayName, key),
      musicKitIndex,
      rarity: asText(musicKit.rarity, "Standard"),
      color: asText(musicKit.color, "#ff7185")
    }];
  });

  const keychains: LoadoutKeychain[] = (Array.isArray(snapshot.keychains) ? snapshot.keychains : []).flatMap((entry) => {
    const keychain = asRecord(entry);
    const keychainIndex = asInteger(keychain?.keychain);
    const key = asText(keychain?.key);
    if (!keychain || !key || keychainIndex === null || keychainIndex < 1) return [];
    return [{
      key,
      displayName: asText(keychain.displayName, key),
      keychain: keychainIndex,
      rarity: asText(keychain.rarity, "Standard"),
      color: asText(keychain.color, "#ff7185")
    }];
  });

  const stickers: LoadoutSticker[] = (Array.isArray(snapshot.stickers) ? snapshot.stickers : []).flatMap((entry) => {
    const sticker = asRecord(entry);
    const stickerIndex = asInteger(sticker?.sticker);
    const key = asText(sticker?.key);
    if (!sticker || !key || stickerIndex === null || stickerIndex < 1) return [];
    return [{
      key,
      displayName: asText(sticker.displayName, key),
      sticker: stickerIndex,
      collection: asText(sticker.collection, "WeaponSkins"),
      rarity: asText(sticker.rarity, "Standard"),
      color: asText(sticker.color, "#ff7185")
    }];
  });

  return items.length ? {
    syncedAt: dateToIso(syncedAt),
    items: items.sort((left, right) => left.category.localeCompare(right.category) || left.displayName.localeCompare(right.displayName)),
    agents: agents.sort((left, right) => left.displayName.localeCompare(right.displayName)),
    musicKits: musicKits.sort((left, right) => left.displayName.localeCompare(right.displayName)),
    keychains: keychains.sort((left, right) => left.displayName.localeCompare(right.displayName)),
    stickers: stickers.sort((left, right) => left.collection.localeCompare(right.collection) || left.displayName.localeCompare(right.displayName))
  } : null;
}

export async function getLoadoutCatalogue(): Promise<LoadoutCatalogue | null> {
  const pool = getPortalPool();
  if (!pool) return null;

  try {
    const [rows] = await pool.query<PortalLoadoutCatalogueRow[]>(
      "SELECT payload, synced_at FROM portal_loadout_catalogue WHERE id = 1 LIMIT 1"
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
  return definitionIndex > 0 && definitionIndex < 100 && definitionIndex !== 42 && definitionIndex !== 59;
}

export async function getPlayerLoadout(steamId: string, catalogue?: LoadoutCatalogue | null): Promise<PlayerLoadout> {
  const pool = getGamePool();
  const empty: PlayerLoadout = { sourceConnected: Boolean(pool), weapons: [], knives: [], gloves: [], agents: [], musicKitIndex: null };
  if (!pool) return empty;

  const resolvedCatalogue = catalogue ?? await getLoadoutCatalogue();
  const [skinRows, knifeRows, gloveRows, agentRows, musicRows] = await Promise.all([
    safeGameQuery<LoadoutSkinRow>(
      "SELECT weapon_team, weapon_defindex, weapon_paint_id, weapon_wear, weapon_seed FROM wp_player_skins WHERE steamid = ?",
      [steamId]
    ),
    safeGameQuery<LoadoutKnifeRow>("SELECT weapon_team, knife FROM wp_player_knife WHERE steamid = ?", [steamId]),
    safeGameQuery<LoadoutGloveRow>("SELECT weapon_team, weapon_defindex FROM wp_player_gloves WHERE steamid = ?", [steamId]),
    safeGameQuery<LoadoutAgentRow>("SELECT weapon_team, agent_index FROM wp_player_agents WHERE steamid = ?", [steamId]),
    safeGameQuery<LoadoutMusicRow>("SELECT music_id FROM wp_player_music WHERE steamid = ?", [steamId])
  ]);

  const skins = skinRows.map((row) => ({
    team: teamFromStorage(row.weapon_team),
    definitionIndex: Number(row.weapon_defindex),
    paintkit: Number(row.weapon_paint_id),
    seed: Number(row.weapon_seed ?? 0),
    wear: Number(row.weapon_wear ?? 0)
  }));
  const skinByItem = new Map(skins.map((skin) => [`${skin.team}:${skin.definitionIndex}`, skin]));

  const knives = knifeRows.map((row) => {
    const team = teamFromStorage(row.weapon_team);
    const key = String(row.knife || "").trim();
    const item = resolvedCatalogue?.items.find((candidate) => candidate.category === "knife" && candidate.key.toLowerCase() === key.toLowerCase());
    const saved = item ? skinByItem.get(`${team}:${item.definitionIndex}`) : undefined;
    const savedKey = item?.key ?? (key || null);
    return saved ? { ...saved, key: savedKey } : { team, definitionIndex: item?.definitionIndex ?? 0, paintkit: 0, seed: 0, wear: 0, key: savedKey };
  });

  const gloves = gloveRows.map((row) => {
    const team = teamFromStorage(row.weapon_team);
    const definitionIndex = Number(row.weapon_defindex);
    const saved = skinByItem.get(`${team}:${definitionIndex}`);
    return saved ?? { team, definitionIndex, paintkit: 0, seed: 0, wear: 0 };
  });

  return {
    ...empty,
    weapons: skins.filter((skin) => isWeaponDefinitionIndex(skin.definitionIndex)),
    knives,
    gloves,
    agents: agentRows.map((row) => ({ team: teamFromStorage(row.weapon_team), agentIndex: Number(row.agent_index) })),
    musicKitIndex: musicRows[0] ? Number(musicRows[0].music_id) : null
  };
}

export async function getAdminAuthorization(steamId: string): Promise<AdminAuthorization | null> {
  const rows = await safeAdminQuery<AdminAuthorizationRow>(
    "SELECT SteamId64, Username, Permissions, Groups, Immunity, Servers FROM admins WHERE SteamId64 = ? LIMIT 1",
    [steamId]
  );
  const admin = rows[0];
  if (!admin) return null;

  return {
    steamId: String(admin.SteamId64),
    username: admin.Username || `Steam ${steamId}`,
    permissions: toGroups(admin.Permissions),
    groups: toGroups(admin.Groups),
    immunity: Number(admin.Immunity ?? 0),
    serverGuids: toGroups(admin.Servers)
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
    [steamId]
  );
  return Number(rows[0]?.total ?? 1);
}

export async function getPlayerDashboard(steamId: string): Promise<PlayerDashboard> {
  const pool = getGamePool();
  const empty: PlayerDashboard = {
    sourceConnected: Boolean(pool),
    hasGameRecord: false,
    displayName: null,
    points: 0,
    rank: 0,
    leaderboardPosition: null,
    playtimeSeconds: 0,
    kills: 0,
    deaths: 0,
    headshots: 0,
    noscopes: 0,
    gamesPlayed: 0,
    gameWins: 0,
    gameLosses: 0,
    vipGroups: [],
    adminGroups: [],
    bans: [],
    sanctions: [],
    kickHistoryAvailable: false,
    skinSummary: { skins: 0, knives: 0, gloves: 0, agents: 0, musicKits: 0 }
  };
  if (!pool) return empty;

  const noscopeColumn = await getNoscopeColumn(pool);
  const noscopeSelection = noscopeColumn ? `\`${noscopeColumn}\` AS noscopes` : "0 AS noscopes";
  const [stats, vipRows, adminRows, banRows, sanctionRows, skinRows, knifeRows, gloveRows, agentRows, musicRows] = await Promise.all([
    safeGameQuery<StatRow>(
      `SELECT name, value, rank, kills, deaths, headshots, ${noscopeSelection}, playtime, game_wins, game_losses, games_played FROM lvl_base WHERE steam = ? LIMIT 1`,
      [steamId]
    ),
    safeGameQuery<RowDataPacket & { group: string }>(
      "SELECT `group` FROM vip_users WHERE account_id = ? AND (expires = 0 OR expires > UNIX_TIMESTAMP()) ORDER BY `group`",
      [toAccountId(steamId)]
    ),
    safeAdminQuery<RowDataPacket & { Groups: string }>("SELECT Groups FROM admins WHERE SteamId64 = ? LIMIT 1", [steamId]),
    safeAdminQuery<BanRow>(
      "SELECT Id, Reason, AdminName, Server, ExpiresAt, Length, CreatedAt FROM bans WHERE SteamId64 = ? ORDER BY CreatedAt DESC LIMIT 25",
      [steamId]
    ),
    safeAdminQuery<SanctionRow>(
      "SELECT Id, SanctionKind, Reason, AdminName, ExpiresAt, Length, CreatedAt FROM sanctions WHERE SteamId64 = ? ORDER BY CreatedAt DESC LIMIT 25",
      [steamId]
    ),
    safeGameQuery<RowDataPacket & { total: number }>("SELECT COUNT(*) AS total FROM wp_player_skins WHERE steamid = ? AND weapon_defindex > 0 AND weapon_defindex < 100 AND weapon_defindex NOT IN (42, 59)", [steamId]),
    safeGameQuery<RowDataPacket & { total: number }>("SELECT COUNT(*) AS total FROM wp_player_knife WHERE steamid = ?", [steamId]),
    safeGameQuery<RowDataPacket & { total: number }>("SELECT COUNT(*) AS total FROM wp_player_gloves WHERE steamid = ?", [steamId]),
    safeGameQuery<RowDataPacket & { total: number }>("SELECT COUNT(*) AS total FROM wp_player_agents WHERE steamid = ?", [steamId]),
    safeGameQuery<RowDataPacket & { total: number }>("SELECT COUNT(DISTINCT music_id) AS total FROM wp_player_music WHERE steamid = ?", [steamId])
  ]);

  const player = stats[0];
  const leaderboardPosition = player ? await getLeaderboardPosition(steamId) : null;

  return {
    ...empty,
    hasGameRecord: Boolean(player),
    displayName: player?.name ?? null,
    points: Number(player?.value ?? 0),
    rank: Number(player?.rank ?? 0),
    leaderboardPosition,
    playtimeSeconds: Number(player?.playtime ?? 0),
    kills: Number(player?.kills ?? 0),
    deaths: Number(player?.deaths ?? 0),
    headshots: Number(player?.headshots ?? 0),
    noscopes: Number(player?.noscopes ?? 0),
    gamesPlayed: Number(player?.games_played ?? 0),
    gameWins: Number(player?.game_wins ?? 0),
    gameLosses: Number(player?.game_losses ?? 0),
    vipGroups: vipRows.map((row) => row.group),
    adminGroups: toGroups(adminRows[0]?.Groups),
    bans: banRows.map((row) => ({
      id: Number(row.Id), reason: row.Reason, adminName: row.AdminName,
      expiresAt: normalizeUnixTime(row.ExpiresAt), length: Number(row.Length), createdAt: normalizeUnixTime(row.CreatedAt)
    })),
    sanctions: sanctionRows.map((row) => ({
      id: Number(row.Id), reason: row.Reason, adminName: row.AdminName,
      expiresAt: normalizeUnixTime(row.ExpiresAt), length: Number(row.Length), createdAt: normalizeUnixTime(row.CreatedAt),
      kind: row.SanctionKind === 1 ? "Gag" : "Mute"
    })),
    skinSummary: {
      skins: Number(skinRows[0]?.total ?? 0),
      knives: Number(knifeRows[0]?.total ?? 0),
      gloves: Number(gloveRows[0]?.total ?? 0),
      agents: Number(agentRows[0]?.total ?? 0),
      musicKits: Number(musicRows[0]?.total ?? 0)
    }
  };
}

export async function getPublicPlayerProfile(steamId: string): Promise<PublicPlayerProfile | null> {
  const pool = getGamePool();
  if (!pool) return null;

  const noscopeColumn = await getNoscopeColumn(pool);
  const noscopeSelection = noscopeColumn ? `\`${noscopeColumn}\` AS noscopes` : "0 AS noscopes";
  const [rows, vipRows, adminRows, banRows] = await Promise.all([
    safeGameQuery<StatRow>(
      `SELECT name, value, rank, kills, deaths, headshots, ${noscopeSelection}, playtime, game_wins, game_losses, games_played FROM lvl_base WHERE steam = ? LIMIT 1`,
      [steamId]
    ),
    safeGameQuery<RowDataPacket & { group: string }>(
      "SELECT `group` FROM vip_users WHERE account_id = ? AND (expires = 0 OR expires > UNIX_TIMESTAMP()) ORDER BY `group`",
      [toAccountId(steamId)]
    ),
    safeAdminQuery<RowDataPacket & { Groups: string }>("SELECT Groups FROM admins WHERE SteamId64 = ? LIMIT 1", [steamId]),
    safeAdminQuery<RowDataPacket & { ExpiresAt: number }>("SELECT ExpiresAt FROM bans WHERE SteamId64 = ? ORDER BY CreatedAt DESC LIMIT 25", [steamId])
  ]);
  const player = rows[0];
  if (!player) return null;
  const isBanned = banRows.some((ban) => {
    const expiresAt = normalizeUnixTime(ban.ExpiresAt);
    return expiresAt === 0 || expiresAt > Math.floor(Date.now() / 1_000);
  });

  return {
    steamId,
    displayName: player.name || "Unknown player",
    points: Number(player.value ?? 0),
    leaderboardPosition: await getLeaderboardPosition(steamId),
    playtimeSeconds: Number(player.playtime ?? 0),
    kills: Number(player.kills ?? 0),
    deaths: Number(player.deaths ?? 0),
    headshots: Number(player.headshots ?? 0),
    noscopes: Number(player.noscopes ?? 0),
    vipGroups: vipRows.map((row) => row.group),
    adminGroups: toGroups(adminRows[0]?.Groups),
    isBanned
  };
}

function leaderboardFilter(query: string) {
  const search = query.trim().slice(0, 64);
  if (!search) return { sql: "", values: [] as unknown[] };
  const pattern = `%${search}%`;
  return { sql: "WHERE name LIKE ? OR CAST(steam AS CHAR) LIKE ?", values: [pattern, pattern] };
}

export async function getLeaderboard(pageInput: number, pageSize = 25, query = ""): Promise<LeaderboardPage> {
  const pool = getGamePool();
  const page = Math.max(1, Number.isFinite(pageInput) ? Math.floor(pageInput) : 1);
  if (!pool) return { players: [], total: 0, page, pageSize };

  const mvpColumn = await getMvpColumn(pool);
  const mvpSelection = mvpColumn ? `\`${mvpColumn}\` AS mvps` : "0 AS mvps";
  const offset = (page - 1) * pageSize;
  const filter = leaderboardFilter(query);
  const [totalRows, rows] = await Promise.all([
    safeGameQuery<CountRow>(`SELECT COUNT(*) AS total FROM lvl_base ${filter.sql}`, filter.values),
    safeGameQuery<LeaderboardRow>(
      `SELECT steam, name, rank, value, kills, deaths, ${mvpSelection} FROM lvl_base ${filter.sql} ORDER BY value DESC, kills DESC, deaths ASC, steam ASC LIMIT ? OFFSET ?`,
      [...filter.values, pageSize, offset]
    )
  ]);

  return {
    players: rows.map((row) => ({
      steamId: String(row.steam), name: row.name || "Unknown player", rank: Number(row.rank), points: Number(row.value),
      kills: Number(row.kills), deaths: Number(row.deaths), mvps: Number(row.mvps)
    })),
    total: Number(totalRows[0]?.total ?? 0),
    page,
    pageSize
  };
}

function moderationFilter(query: string) {
  const search = query.trim().slice(0, 64);
  if (!search) return { sql: "", values: [] as unknown[] };
  const pattern = `%${search}%`;
  return { sql: "WHERE PlayerName LIKE ? OR CAST(SteamId64 AS CHAR) LIKE ?", values: [pattern, pattern] };
}

export async function getStaffModeration(pageInput: number, query = "", pageSize = 25): Promise<StaffModerationPage> {
  const page = Math.max(1, Number.isFinite(pageInput) ? Math.floor(pageInput) : 1);
  const offset = (page - 1) * pageSize;
  const filter = moderationFilter(query);
  const [banCount, bans, sanctionCount, sanctions] = await Promise.all([
    safeGameQuery<CountRow>(`SELECT COUNT(*) AS total FROM bans ${filter.sql}`, filter.values),
    safeGameQuery<StaffBanRow>(
      `SELECT Id, SteamId64, PlayerName, ExpiresAt, Length, Reason, AdminSteamId64, AdminName, Server, GlobalBan, CreatedAt FROM bans ${filter.sql} ORDER BY CreatedAt DESC LIMIT ? OFFSET ?`,
      [...filter.values, pageSize, offset]
    ),
    safeGameQuery<CountRow>(`SELECT COUNT(*) AS total FROM sanctions ${filter.sql}`, filter.values),
    safeGameQuery<StaffSanctionRow>(
      `SELECT Id, SteamId64, PlayerName, SanctionKind, ExpiresAt, Length, Reason, AdminName, Server, GlobalSanction, CreatedAt FROM sanctions ${filter.sql} ORDER BY CreatedAt DESC LIMIT ? OFFSET ?`,
      [...filter.values, pageSize, offset]
    )
  ]);

  return {
    bans: bans.map((row) => ({
      id: Number(row.Id), steamId: String(row.SteamId64), playerName: row.PlayerName || "Unknown player", expiresAt: normalizeUnixTime(row.ExpiresAt),
      length: Number(row.Length), reason: row.Reason, adminSteamId: String(row.AdminSteamId64), adminName: row.AdminName || "Console",
      server: row.Server, global: Boolean(row.GlobalBan), createdAt: normalizeUnixTime(row.CreatedAt)
    })),
    banTotal: Number(banCount[0]?.total ?? 0),
    sanctions: sanctions.map((row) => ({
      id: Number(row.Id), steamId: String(row.SteamId64), playerName: row.PlayerName || "Unknown player", kind: row.SanctionKind === 1 ? "Gag" : "Mute",
      expiresAt: normalizeUnixTime(row.ExpiresAt), length: Number(row.Length), reason: row.Reason, adminName: row.AdminName || "Console",
      server: row.Server, global: Boolean(row.GlobalSanction), createdAt: normalizeUnixTime(row.CreatedAt)
    })),
    sanctionTotal: Number(sanctionCount[0]?.total ?? 0),
    page,
    pageSize
  };
}

export async function getStaffAdmins(): Promise<StaffAdmin[]> {
  const rows = await safeAdminQuery<AdminListRow>(
    "SELECT Id, SteamId64, Username, Permissions, Groups, Immunity, Servers FROM admins ORDER BY Immunity DESC, Username ASC"
  , []);

  return rows.map((row) => ({
    id: Number(row.Id),
    steamId: String(row.SteamId64),
    username: row.Username || `Steam ${row.SteamId64}`,
    groups: toGroups(row.Groups),
    permissions: toGroups(row.Permissions),
    immunity: Number(row.Immunity ?? 0),
    serverGuids: toGroups(row.Servers)
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
    "SELECT account_id, name, lastvisit, sid, `group`, expires FROM vip_users WHERE sid = ? ORDER BY `group` ASC, name ASC",
    [getVipServerId()]
  );
  return rows.map((row) => ({
    steamId: vipAccountToSteamId(String(row.account_id)),
    accountId: String(row.account_id),
    name: row.name || "Unknown player",
    group: row.group,
    expiresAt: Number(row.expires ?? 0),
    serverId: Number(row.sid ?? 0)
  }));
}

export async function getVipRoster(pageInput: number, pageSize = 25): Promise<VipRosterPage> {
  const pool = getGamePool();
  const page = clampStaffPage(pageInput);
  if (!pool) return { vips: [], total: 0, page, pageSize };

  const now = Math.floor(Date.now() / 1_000);
  const offset = (page - 1) * pageSize;
  try {
    const [[countRows], [rows]] = await Promise.all([
      pool.query<CountRow[]>("SELECT COUNT(*) AS total FROM vip_users WHERE sid = ? AND (`group` IS NOT NULL) AND (expires = 0 OR expires > ?)", [getVipServerId(), now]),
      pool.query<VipUserRow[]>(
        "SELECT account_id, name, lastvisit, sid, `group`, expires FROM vip_users WHERE sid = ? AND (`group` IS NOT NULL) AND (expires = 0 OR expires > ?) ORDER BY FIELD(`group`, 'ULTIMATE', 'DIAMOND', 'GOLD', 'SILVER', 'STANDARD'), name ASC LIMIT ? OFFSET ?",
        [getVipServerId(), now, pageSize, offset]
      )
    ]);
    return {
      vips: rows.map((row) => ({
        steamId: vipAccountToSteamId(String(row.account_id)), accountId: String(row.account_id), name: row.name || "Unknown player",
        group: row.group, expiresAt: Number(row.expires ?? 0), serverId: Number(row.sid ?? 0)
      })),
      total: Number(countRows[0]?.total ?? 0),
      page,
      pageSize
    };
  } catch {
    return { vips: [], total: 0, page, pageSize };
  }
}

function clampStaffPage(value: number) {
  return Math.max(1, Number.isFinite(value) ? Math.floor(value) : 1);
}

async function getCaseAttachments(pool: Pool, caseType: "appeal" | "ticket", caseId: number) {
  try {
    const [rows] = await pool.query<CaseAttachmentRow[]>(
      "SELECT id, case_type, case_id, message_id, file_name, content_type, created_at FROM portal_case_attachments WHERE case_type = ? AND case_id = ? ORDER BY id ASC",
      [caseType, caseId]
    );
    return rows;
  } catch {
    return [] as CaseAttachmentRow[];
  }
}

async function getCaseMessages(pool: Pool, caseType: "appeal" | "ticket", caseId: number): Promise<CaseMessage[]> {
  const table = caseType === "appeal" ? "portal_appeal_messages" : "portal_ticket_messages";
  const foreignKey = caseType === "appeal" ? "appeal_id" : "ticket_id";
  try {
    const [[rows], attachments] = await Promise.all([
      pool.query<CaseMessageRow[]>(`SELECT id, author_type, author_id, body, created_at FROM ${table} WHERE ${foreignKey} = ? ORDER BY id ASC`, [caseId]),
      getCaseAttachments(pool, caseType, caseId)
    ]);
    return rows.map((row) => ({
      id: Number(row.id),
      authorType: row.author_type === "staff" ? "staff" : "player",
      authorId: String(row.author_id),
      body: row.body,
      createdAt: dateToIso(row.created_at),
      attachments: attachments.filter((attachment) => Number(attachment.message_id) === Number(row.id)).map((attachment) => ({
        id: Number(attachment.id), fileName: attachment.file_name, contentType: attachment.content_type, createdAt: dateToIso(attachment.created_at)
      }))
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
      pool.query<CountRow[]>("SELECT COUNT(*) AS total FROM portal_ban_appeals"),
      pool.query<StaffAppealRow[]>("SELECT id, steam_id, ban_id, body, status, created_at, updated_at, closed_by, closed_at FROM portal_ban_appeals ORDER BY updated_at DESC LIMIT ? OFFSET ?", [pageSize, offset])
    ]);
    const appeals = await Promise.all(rows.map(async (row) => ({
      id: Number(row.id), steamId: String(row.steam_id), banId: row.ban_id == null ? null : Number(row.ban_id), body: row.body,
      status: row.status, createdAt: dateToIso(row.created_at), updatedAt: dateToIso(row.updated_at),
      closedBy: row.closed_by ? String(row.closed_by) : null, closedAt: row.closed_at ? dateToIso(row.closed_at) : null,
      messages: await getCaseMessages(pool, "appeal", Number(row.id))
    })));
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
      pool.query<StaffTicketRow[]>("SELECT id, steam_id, category, subject, body, status, created_at, updated_at, closed_by, closed_at FROM portal_tickets ORDER BY updated_at DESC LIMIT ? OFFSET ?", [pageSize, offset])
    ]);
    const tickets = await Promise.all(rows.map(async (row) => ({
      id: Number(row.id), steamId: String(row.steam_id), category: row.category, subject: row.subject, body: row.body,
      status: row.status, createdAt: dateToIso(row.created_at), updatedAt: dateToIso(row.updated_at),
      closedBy: row.closed_by ? String(row.closed_by) : null, closedAt: row.closed_at ? dateToIso(row.closed_at) : null,
      messages: await getCaseMessages(pool, "ticket", Number(row.id))
    })));
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

export async function enqueueStaffUnban(input: { steamId: string; actorSteamId: string; actorName: string }) {
  return enqueuePortalBridgeEvent("moderation.unban", input.steamId, input);
}

export async function enqueuePortalBridgeEvent(eventType: PortalBridgeEvent, targetSteamId: string | null, payload: object) {
  const pool = getPortalPool();
  if (!pool) throw new Error("Portal bridge storage is not configured.");

  const [result] = await pool.execute<ResultSetHeader>(
    "INSERT INTO portal_outbox (event_type, target_steam_id, payload) VALUES (?, ?, ?)",
    [eventType, targetSteamId, JSON.stringify(payload)]
  );
  return Number(result.insertId);
}

function dateToIso(value: Date) {
  return value instanceof Date ? value.toISOString() : new Date(value).toISOString();
}

export async function ensurePortalAccount(steamId: string) {
  const pool = getPortalPool();
  if (!pool) return;
  await pool.execute(
    "INSERT INTO portal_steam_accounts (steam_id) VALUES (?) ON DUPLICATE KEY UPDATE updated_at = CURRENT_TIMESTAMP",
    [steamId]
  );
}

export async function createPortalSession(input: { tokenHash: string; steamId: string; expiresAt: number }) {
  const pool = getPortalPool();
  if (!pool) throw new Error("Portal session storage is not configured.");

  await pool.execute(
    "INSERT INTO portal_steam_accounts (steam_id) VALUES (?) ON DUPLICATE KEY UPDATE updated_at = CURRENT_TIMESTAMP",
    [input.steamId]
  );
  await pool.execute("DELETE FROM portal_sessions WHERE expires_at <= ?", [Date.now()]);
  await pool.execute(
    "INSERT INTO portal_sessions (token_hash, steam_id, expires_at) VALUES (?, ?, ?)",
    [input.tokenHash, input.steamId, input.expiresAt]
  );
}

export async function getPortalSession(tokenHash: string) {
  const pool = getPortalPool();
  if (!pool) return null;

  try {
    const [rows] = await pool.query<PortalSessionRow[]>(
      "SELECT steam_id, expires_at FROM portal_sessions WHERE token_hash = ? AND expires_at > ? LIMIT 1",
      [tokenHash, Date.now()]
    );
    const session = rows[0];
    if (!session || !/^7656119\d{10}$/.test(session.steam_id)) return null;

    await pool.execute("UPDATE portal_sessions SET last_seen_at = CURRENT_TIMESTAMP WHERE token_hash = ?", [tokenHash]);
    return { steamId: session.steam_id, expiresAt: Number(session.expires_at) };
  } catch {
    return null;
  }
}

export async function revokePortalSession(tokenHash: string) {
  const pool = getPortalPool();
  if (!pool) return;
  try {
    await pool.execute("DELETE FROM portal_sessions WHERE token_hash = ?", [tokenHash]);
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
      [steamId]
    );
    return Promise.all(rows.map(async (row) => ({
      id: Number(row.id), category: row.category, subject: row.subject, body: row.body, status: row.status,
      createdAt: dateToIso(row.created_at), updatedAt: dateToIso(row.updated_at),
      messages: await getCaseMessages(pool, "ticket", Number(row.id))
    })));
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
      [steamId]
    );
    return Promise.all(rows.map(async (row) => ({
      id: row.id, banId: row.ban_id, body: row.body, status: row.status,
      createdAt: dateToIso(row.created_at), updatedAt: dateToIso(row.updated_at),
      messages: await getCaseMessages(pool, "appeal", Number(row.id))
    })));
  } catch {
    return [];
  }
}

export async function getAppealEligibility(steamId: string, banId: number | null) {
  const pool = getPortalPool();
  if (!pool) return { eligible: true, eligibleAt: null as string | null };
  try {
    const [rows] = await pool.query<AppealEligibilityRow[]>(
      "SELECT COALESCE(closed_at, updated_at) AS decision_at FROM portal_ban_appeals WHERE steam_id = ? AND ban_id <=> ? AND status = 'closed-banned' ORDER BY COALESCE(closed_at, updated_at) DESC LIMIT 1",
      [steamId, banId]
    );
    const decisionAt = rows[0]?.decision_at;
    if (!decisionAt) return { eligible: true, eligibleAt: null as string | null };
    const eligibleAt = new Date(decisionAt).getTime() + 7 * 24 * 60 * 60 * 1_000;
    return { eligible: Date.now() >= eligibleAt, eligibleAt: new Date(eligibleAt).toISOString() };
  } catch {
    // A portal schema that has not been migrated must not accidentally lock a player out.
    return { eligible: true, eligibleAt: null as string | null };
  }
}

async function writeAudit(pool: Pool, actorId: string, action: string, targetType: string, targetId: string) {
  await pool.execute(
    "INSERT INTO portal_audit_events (actor_type, actor_id, action, target_type, target_id) VALUES ('player', ?, ?, ?, ?)",
    [actorId, action, targetType, targetId]
  );
}

export async function writeStaffModerationAudit(actorSteamId: string, action: string, targetSteamId: string) {
  const pool = getPortalPool();
  if (!pool) return;
  try {
    await writeAudit(pool, actorSteamId, action, "steam-player", targetSteamId);
  } catch {
    // A portal-audit failure must not undo a moderation action already sent to Swiftly's database.
  }
}

export async function writeStaffActionAudit(actorSteamId: string, action: string, targetType: string, targetId: string) {
  const pool = getPortalPool();
  if (!pool) return;
  try {
    await writeAudit(pool, actorSteamId, action, targetType, targetId);
  } catch {
    // Staff actions are applied to the game database independently of the portal audit trail.
  }
}

export type CaseScreenshot = { fileName: string; contentType: string; data: Buffer };

export async function createTicket(input: { steamId: string; category: string; subject: string; body: string; screenshots?: CaseScreenshot[] }) {
  const pool = getPortalPool();
  if (!pool) throw new Error("Portal storage is not configured.");

  const screenshots = input.screenshots ?? [];
  const connection = await pool.getConnection();
  let ticketId = 0;
  try {
    await connection.beginTransaction();
    const [result] = await connection.execute<ResultSetHeader>(
      "INSERT INTO portal_tickets (steam_id, category, subject, body) VALUES (?, ?, ?, ?)",
      [input.steamId, input.category, input.subject, input.body]
    );
    ticketId = Number(result.insertId);
    if (screenshots.length) {
      const [messageResult] = await connection.execute<ResultSetHeader>(
        "INSERT INTO portal_ticket_messages (ticket_id, author_type, author_id, body) VALUES (?, 'player', ?, 'Screenshots attached to the original ticket.')",
        [ticketId, input.steamId]
      );
      for (const screenshot of screenshots) {
        await connection.execute(
          "INSERT INTO portal_case_attachments (case_type, case_id, message_id, file_name, content_type, file_data) VALUES ('ticket', ?, ?, ?, ?, ?)",
          [ticketId, Number(messageResult.insertId), screenshot.fileName, screenshot.contentType, screenshot.data]
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
  await writeAudit(pool, input.steamId, "ticket.created", "ticket", String(ticketId));
  return ticketId;
}

export async function createAppeal(input: { steamId: string; banId: number | null; body: string; screenshots?: CaseScreenshot[] }) {
  const pool = getPortalPool();
  if (!pool) throw new Error("Portal storage is not configured.");

  const screenshots = input.screenshots ?? [];
  const connection = await pool.getConnection();
  let appealId = 0;
  try {
    await connection.beginTransaction();
    const [result] = await connection.execute<ResultSetHeader>(
      "INSERT INTO portal_ban_appeals (steam_id, ban_id, body) VALUES (?, ?, ?)",
      [input.steamId, input.banId, input.body]
    );
    appealId = Number(result.insertId);
    if (screenshots.length) {
      const [messageResult] = await connection.execute<ResultSetHeader>(
        "INSERT INTO portal_appeal_messages (appeal_id, author_type, author_id, body) VALUES (?, 'player', ?, 'Screenshots attached to the original appeal.')",
        [appealId, input.steamId]
      );
      for (const screenshot of screenshots) {
        await connection.execute(
          "INSERT INTO portal_case_attachments (case_type, case_id, message_id, file_name, content_type, file_data) VALUES ('appeal', ?, ?, ?, ?, ?)",
          [appealId, Number(messageResult.insertId), screenshot.fileName, screenshot.contentType, screenshot.data]
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
  await writeAudit(pool, input.steamId, "appeal.created", "appeal", String(appealId));
  return appealId;
}

export async function getPlayerCaseTarget(caseType: "appeal" | "ticket", caseId: number, steamId: string) {
  const pool = getPortalPool();
  if (!pool) return null;
  const table = caseType === "appeal" ? "portal_ban_appeals" : "portal_tickets";
  try {
    const [rows] = await pool.query<Array<RowDataPacket & { id: number; status: string }>>(
      `SELECT id, status FROM ${table} WHERE id = ? AND steam_id = ? LIMIT 1`,
      [caseId, steamId]
    );
    const row = rows[0];
    return row ? { id: Number(row.id), status: row.status } : null;
  } catch {
    return null;
  }
}

export async function addPlayerCaseReply(input: { caseType: "appeal" | "ticket"; caseId: number; steamId: string; body: string; screenshots?: CaseScreenshot[] }) {
  const pool = getPortalPool();
  if (!pool) throw new Error("Portal storage is not configured.");

  const messageTable = input.caseType === "appeal" ? "portal_appeal_messages" : "portal_ticket_messages";
  const parentTable = input.caseType === "appeal" ? "portal_ban_appeals" : "portal_tickets";
  const foreignKey = input.caseType === "appeal" ? "appeal_id" : "ticket_id";
  const screenshots = input.screenshots ?? [];
  const body = input.body.trim() || "Screenshots attached.";
  const connection = await pool.getConnection();
  try {
    await connection.beginTransaction();
    const [messageResult] = await connection.execute<ResultSetHeader>(
      `INSERT INTO ${messageTable} (${foreignKey}, author_type, author_id, body) VALUES (?, 'player', ?, ?)`,
      [input.caseId, input.steamId, body]
    );
    for (const screenshot of screenshots) {
      await connection.execute(
        "INSERT INTO portal_case_attachments (case_type, case_id, message_id, file_name, content_type, file_data) VALUES (?, ?, ?, ?, ?, ?)",
        [input.caseType, input.caseId, Number(messageResult.insertId), screenshot.fileName, screenshot.contentType, screenshot.data]
      );
    }
    await connection.execute(`UPDATE ${parentTable} SET updated_at = CURRENT_TIMESTAMP WHERE id = ?`, [input.caseId]);
    await connection.commit();
  } catch (error) {
    await connection.rollback();
    throw error;
  } finally {
    connection.release();
  }
  await writeAudit(pool, input.steamId, `${input.caseType}.replied`, input.caseType, String(input.caseId));
}

export async function getStaffAppealTarget(appealId: number) {
  const pool = getPortalPool();
  if (!pool) return null;
  const [rows] = await pool.query<StaffAppealRow[]>(
    "SELECT id, steam_id, ban_id, body, status, created_at, updated_at, closed_by, closed_at FROM portal_ban_appeals WHERE id = ? LIMIT 1",
    [appealId]
  );
  const row = rows[0];
  return row ? { id: Number(row.id), steamId: String(row.steam_id), status: row.status } : null;
}

export async function getStaffTicketTarget(ticketId: number) {
  const pool = getPortalPool();
  if (!pool) return null;
  const [rows] = await pool.query<StaffTicketRow[]>(
    "SELECT id, steam_id, category, subject, body, status, created_at, updated_at, closed_by, closed_at FROM portal_tickets WHERE id = ? LIMIT 1",
    [ticketId]
  );
  const row = rows[0];
  return row ? { id: Number(row.id), steamId: String(row.steam_id), status: row.status } : null;
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

  const messageTable = input.caseType === "appeal" ? "portal_appeal_messages" : "portal_ticket_messages";
  const parentTable = input.caseType === "appeal" ? "portal_ban_appeals" : "portal_tickets";
  const foreignKey = input.caseType === "appeal" ? "appeal_id" : "ticket_id";
  const body = input.body.trim() || (input.screenshot ? "Screenshot attached." : "Case status updated.");

  const connection = await pool.getConnection();
  try {
    await connection.beginTransaction();
    const [messageResult] = await connection.execute<ResultSetHeader>(
      `INSERT INTO ${messageTable} (${foreignKey}, author_type, author_id, body) VALUES (?, 'staff', ?, ?)`,
      [input.caseId, input.actorSteamId, body]
    );
    const messageId = Number(messageResult.insertId);
    if (input.screenshot) {
      await connection.execute(
        "INSERT INTO portal_case_attachments (case_type, case_id, message_id, file_name, content_type, file_data) VALUES (?, ?, ?, ?, ?, ?)",
        [input.caseType, input.caseId, messageId, input.screenshot.fileName, input.screenshot.contentType, input.screenshot.data]
      );
    }
    if (input.status) {
      await connection.execute(
        `UPDATE ${parentTable} SET status = ?, closed_by = ?, closed_at = CURRENT_TIMESTAMP WHERE id = ?`,
        [input.status, input.actorSteamId, input.caseId]
      );
    } else {
      await connection.execute(`UPDATE ${parentTable} SET updated_at = CURRENT_TIMESTAMP WHERE id = ?`, [input.caseId]);
    }
    await connection.commit();
  } catch (error) {
    await connection.rollback();
    throw error;
  } finally {
    connection.release();
  }

  try {
    await writeAudit(pool, input.actorSteamId, `staff.${input.caseType}.${input.status ?? "replied"}`, input.caseType, String(input.caseId));
  } catch {
    // The staff reply has already been committed and must remain visible.
  }
}

export async function getCaseAttachment(attachmentId: number) {
  const pool = getPortalPool();
  if (!pool) return null;
  try {
    const [rows] = await pool.query<(CaseAttachmentBlobRow & { steam_id: string })[]>(
      `SELECT attachment.id, attachment.case_type, attachment.case_id, attachment.message_id, attachment.file_name, attachment.content_type, attachment.file_data, attachment.created_at, appeal.steam_id
       FROM portal_case_attachments AS attachment INNER JOIN portal_ban_appeals AS appeal ON attachment.case_type = 'appeal' AND attachment.case_id = appeal.id
       WHERE attachment.id = ?
       UNION ALL
       SELECT attachment.id, attachment.case_type, attachment.case_id, attachment.message_id, attachment.file_name, attachment.content_type, attachment.file_data, attachment.created_at, ticket.steam_id
       FROM portal_case_attachments AS attachment INNER JOIN portal_tickets AS ticket ON attachment.case_type = 'ticket' AND attachment.case_id = ticket.id
       WHERE attachment.id = ?`,
      [attachmentId, attachmentId]
    );
    const row = rows[0];
    if (!row) return null;
    return {
      id: Number(row.id), caseType: row.case_type, caseId: Number(row.case_id), ownerSteamId: String(row.steam_id),
      fileName: row.file_name, contentType: row.content_type, data: row.file_data
    };
  } catch {
    return null;
  }
}

export async function upsertStaffAdmin(input: { steamId: string; username: string; groups: string[]; immunity: number; serverGuids: string[] }) {
  const pool = getAdminPool();
  if (!pool) throw new Error("Game database is not configured.");
  await pool.execute(
    `INSERT INTO admins (SteamId64, Username, Permissions, Groups, Immunity, Servers)
     VALUES (?, ?, ?, ?, ?, ?)
     ON DUPLICATE KEY UPDATE Username = VALUES(Username), Groups = VALUES(Groups), Immunity = VALUES(Immunity), Servers = VALUES(Servers)`,
    [input.steamId, input.username, JSON.stringify([]), JSON.stringify(input.groups), input.immunity, JSON.stringify(input.serverGuids)]
  );
}

export async function upsertStaffVip(input: { steamId: string; name: string; group: string; durationMinutes: number; previousGroup?: string }) {
  const pool = getGamePool();
  if (!pool) throw new Error("Game database is not configured.");
  const accountId = toAccountId(input.steamId);
  const serverId = getVipServerId();
  const expires = input.durationMinutes === 0 ? 0 : Math.floor(Date.now() / 1_000) + input.durationMinutes * 60;
  const connection = await pool.getConnection();
  try {
    await connection.beginTransaction();
    if (input.previousGroup && input.previousGroup !== input.group) {
      await connection.execute("DELETE FROM vip_users WHERE account_id = ? AND sid = ? AND `group` = ?", [accountId, serverId, input.previousGroup]);
    }
    await connection.execute(
      `INSERT INTO vip_users (account_id, name, lastvisit, sid, \`group\`, expires)
       VALUES (?, ?, ?, ?, ?, ?)
       ON DUPLICATE KEY UPDATE name = VALUES(name), lastvisit = VALUES(lastvisit), expires = VALUES(expires)`,
      [accountId, input.name, Math.floor(Date.now() / 1_000), serverId, input.group, expires]
    );
    await connection.commit();
  } catch (error) {
    await connection.rollback();
    throw error;
  } finally {
    connection.release();
  }
}

export async function removeStaffVip(input: { steamId: string; group: string }) {
  const pool = getGamePool();
  if (!pool) throw new Error("Game database is not configured.");
  await pool.execute("DELETE FROM vip_users WHERE account_id = ? AND sid = ? AND `group` = ?", [toAccountId(input.steamId), getVipServerId(), input.group]);
}
