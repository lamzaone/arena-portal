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

type PortalSessionRow = RowDataPacket & {
  steam_id: string;
  expires_at: number;
};

export type PortalBridgeEvent = "moderation.ban" | "moderation.unban" | "loadout.weapon.set" | "loadout.weapon.reset" | "loadout.knife.set" | "loadout.knife.reset" | "loadout.glove.set" | "loadout.glove.reset" | "loadout.agent.set" | "loadout.agent.reset" | "loadout.music-kit.set" | "loadout.music-kit.reset";

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
};

export type BanAppeal = {
  id: number;
  banId: number | null;
  body: string;
  status: string;
  createdAt: string;
  updatedAt: string;
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
    safeGameQuery<RowDataPacket & { total: number }>("SELECT COUNT(*) AS total FROM wp_player_skins WHERE steamid = ?", [steamId]),
    safeGameQuery<RowDataPacket & { total: number }>("SELECT COUNT(*) AS total FROM wp_player_knife WHERE steamid = ?", [steamId]),
    safeGameQuery<RowDataPacket & { total: number }>("SELECT COUNT(*) AS total FROM wp_player_gloves WHERE steamid = ?", [steamId]),
    safeGameQuery<RowDataPacket & { total: number }>("SELECT COUNT(*) AS total FROM wp_player_agents WHERE steamid = ?", [steamId]),
    safeGameQuery<RowDataPacket & { total: number }>("SELECT COUNT(*) AS total FROM wp_player_music WHERE steamid = ?", [steamId])
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
    return rows.map((row) => ({ ...row, createdAt: dateToIso(row.created_at), updatedAt: dateToIso(row.updated_at) }));
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
    return rows.map((row) => ({
      id: row.id, banId: row.ban_id, body: row.body, status: row.status,
      createdAt: dateToIso(row.created_at), updatedAt: dateToIso(row.updated_at)
    }));
  } catch {
    return [];
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

export async function createTicket(steamId: string, category: string, subject: string, body: string) {
  const pool = getPortalPool();
  if (!pool) throw new Error("Portal storage is not configured.");

  const [result] = await pool.execute<ResultSetHeader>(
    "INSERT INTO portal_tickets (steam_id, category, subject, body) VALUES (?, ?, ?, ?)",
    [steamId, category, subject, body]
  );
  await writeAudit(pool, steamId, "ticket.created", "ticket", String(result.insertId));
  return result.insertId;
}

export async function createAppeal(steamId: string, banId: number | null, body: string) {
  const pool = getPortalPool();
  if (!pool) throw new Error("Portal storage is not configured.");

  const [result] = await pool.execute<ResultSetHeader>(
    "INSERT INTO portal_ban_appeals (steam_id, ban_id, body) VALUES (?, ?, ?)",
    [steamId, banId, body]
  );
  await writeAudit(pool, steamId, "appeal.created", "appeal", String(result.insertId));
  return result.insertId;
}
