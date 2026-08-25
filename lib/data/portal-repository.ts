import "server-only";

import mysql, { type Pool, type ResultSetHeader, type RowDataPacket } from "mysql2/promise";

type StatRow = RowDataPacket & {
  name: string;
  value: number;
  rank: number;
  kills: number;
  deaths: number;
  headshots: number;
  playtime: number;
  game_wins: number;
  game_losses: number;
  games_played: number;
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
  playtimeSeconds: number;
  kills: number;
  deaths: number;
  headshots: number;
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

let gamePool: Pool | undefined;
let portalPool: Pool | undefined;

function createPool(connectionUrl: string) {
  return mysql.createPool({
    uri: connectionUrl,
    connectionLimit: 5,
    enableKeepAlive: true,
    namedPlaceholders: false
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

export function portalStorageConfigured() {
  return Boolean(process.env.PORTAL_DATABASE_URL);
}

export async function getPlayerDashboard(steamId: string): Promise<PlayerDashboard> {
  const pool = getGamePool();
  const empty: PlayerDashboard = {
    sourceConnected: Boolean(pool),
    hasGameRecord: false,
    displayName: null,
    points: 0,
    rank: 0,
    playtimeSeconds: 0,
    kills: 0,
    deaths: 0,
    headshots: 0,
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

  const [stats, vipRows, adminRows, banRows, sanctionRows, skinRows, knifeRows, gloveRows, agentRows, musicRows] = await Promise.all([
    safeGameQuery<StatRow>(
      "SELECT name, value, rank, kills, deaths, headshots, playtime, game_wins, game_losses, games_played FROM lvl_base WHERE steam = ? LIMIT 1",
      [steamId]
    ),
    safeGameQuery<RowDataPacket & { group: string }>(
      "SELECT `group` FROM vip_users WHERE account_id = ? AND (expires = 0 OR expires > UNIX_TIMESTAMP()) ORDER BY `group`",
      [toAccountId(steamId)]
    ),
    safeGameQuery<RowDataPacket & { Groups: string }>("SELECT Groups FROM admins WHERE SteamId64 = ? LIMIT 1", [steamId]),
    safeGameQuery<BanRow>(
      "SELECT Id, Reason, AdminName, Server, ExpiresAt, Length, CreatedAt FROM bans WHERE SteamId64 = ? ORDER BY CreatedAt DESC LIMIT 25",
      [steamId]
    ),
    safeGameQuery<SanctionRow>(
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
  return {
    ...empty,
    hasGameRecord: Boolean(player),
    displayName: player?.name ?? null,
    points: Number(player?.value ?? 0),
    rank: Number(player?.rank ?? 0),
    playtimeSeconds: Number(player?.playtime ?? 0),
    kills: Number(player?.kills ?? 0),
    deaths: Number(player?.deaths ?? 0),
    headshots: Number(player?.headshots ?? 0),
    gamesPlayed: Number(player?.games_played ?? 0),
    gameWins: Number(player?.game_wins ?? 0),
    gameLosses: Number(player?.game_losses ?? 0),
    vipGroups: vipRows.map((row) => row.group),
    adminGroups: toGroups(adminRows[0]?.Groups),
    bans: banRows.map((row) => ({
      id: Number(row.Id), reason: row.Reason, adminName: row.AdminName,
      expiresAt: Number(row.ExpiresAt), length: Number(row.Length), createdAt: Number(row.CreatedAt)
    })),
    sanctions: sanctionRows.map((row) => ({
      id: Number(row.Id), reason: row.Reason, adminName: row.AdminName,
      expiresAt: Number(row.ExpiresAt), length: Number(row.Length), createdAt: Number(row.CreatedAt),
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
