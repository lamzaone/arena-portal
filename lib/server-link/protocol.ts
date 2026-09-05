export type RosterPlayer = {
  steamId: string;
  name: string;
  connectedSeconds?: number | null;
  score?: number | null;
};

export type Heartbeat = {
  version: 1;
  serverId: string;
  sessionId: string;
  sessionStartedAt: string;
  sequence: number;
  capturedAt: string;
  map: string | null;
  maxPlayers: number;
  players: number;
  bots: number;
  timeLeftSeconds?: number | null;
  roster: RosterPlayer[];
};

export type PublicStatus = {
  state: "online" | "lost" | "unknown";
  players: number | null;
  maxPlayers: number | null;
  map: string | null;
  bots: number;
  timeLeftSeconds?: number | null;
  roster: RosterPlayer[];
  checkedAt: string;
  lastSeenAt: string | null;
};

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const UTC_ISO_PATTERN = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{1,3})?Z$/;
const STEAM_ID64_MIN = 76_561_197_960_265_728n;
const STEAM_ID64_MAX = STEAM_ID64_MIN + 0xffff_ffffn;
const MAX_CLIENTS = 128;
const MAX_TEXT_CHARACTERS = 128;
const MAX_CAPTURE_AGE_MS = 30_000;
const MAX_FUTURE_TOLERANCE_MS = 10_000;
const LOST_AFTER_MS = 45_000;

function recordValue(value: unknown): Record<string, unknown> {
  if (value === null || typeof value !== "object" || Array.isArray(value)) {
    throw new Error("Heartbeat must be an object.");
  }
  return value as Record<string, unknown>;
}

function uuid(value: unknown, field: string): string {
  if (typeof value !== "string" || !UUID_PATTERN.test(value)) {
    throw new Error(`${field} must be a UUID.`);
  }
  return value.toLowerCase();
}

function utcInstant(value: unknown, field: string): { milliseconds: number; iso: string } {
  if (typeof value !== "string" || !UTC_ISO_PATTERN.test(value)) {
    throw new Error(`${field} must be a UTC ISO timestamp.`);
  }
  const milliseconds = Date.parse(value);
  if (!Number.isFinite(milliseconds)) {
    throw new Error(`${field} must be a valid UTC ISO timestamp.`);
  }
  const iso = new Date(milliseconds).toISOString();
  if (iso.slice(0, 19) !== value.slice(0, 19)) {
    throw new Error(`${field} must be a valid UTC ISO timestamp.`);
  }
  return { milliseconds, iso };
}

function boundedInteger(value: unknown, field: string, minimum: number, maximum: number): number {
  if (!Number.isSafeInteger(value) || (value as number) < minimum || (value as number) > maximum) {
    throw new Error(`${field} must be an integer from ${minimum} to ${maximum}.`);
  }
  return value as number;
}

function boundedText(value: unknown, field: string, nullable: false): string;
function boundedText(value: unknown, field: string, nullable: true): string | null;
function boundedText(value: unknown, field: string, nullable: boolean): string | null {
  if (nullable && value === null) return null;
  if (
    typeof value !== "string" ||
    value.length === 0 ||
    Array.from(value).length > MAX_TEXT_CHARACTERS ||
    /[\u0000-\u001f\u007f]/u.test(value)
  ) {
    throw new Error(`${field} must contain 1 to ${MAX_TEXT_CHARACTERS} printable characters.`);
  }
  return value.normalize("NFC");
}

function steamId(value: unknown): string {
  if (typeof value !== "string" || !/^\d{17}$/.test(value)) {
    throw new Error("steamId must be a Steam ID64 string.");
  }
  const numeric = BigInt(value);
  if (numeric < STEAM_ID64_MIN || numeric > STEAM_ID64_MAX) {
    throw new Error("steamId must identify an individual Steam account.");
  }
  return value;
}

export function validateHeartbeat(value: unknown, serverId: string, now: number): Heartbeat {
  if (!Number.isFinite(now)) throw new Error("now must be a timestamp.");
  const input = recordValue(value);
  if (input.version !== 1) throw new Error("version must be 1.");

  const expectedServerId = uuid(serverId, "configured serverId");
  const normalizedServerId = uuid(input.serverId, "serverId");
  if (normalizedServerId !== expectedServerId) throw new Error("serverId does not match this server.");

  const normalizedSessionId = uuid(input.sessionId, "sessionId");
  const sessionStartedAt = utcInstant(input.sessionStartedAt, "sessionStartedAt");
  const capturedAt = utcInstant(input.capturedAt, "capturedAt");
  if (capturedAt.milliseconds < now - MAX_CAPTURE_AGE_MS || capturedAt.milliseconds > now + MAX_FUTURE_TOLERANCE_MS) {
    throw new Error("capturedAt is outside the accepted time window.");
  }
  if (sessionStartedAt.milliseconds > capturedAt.milliseconds) {
    throw new Error("sessionStartedAt cannot be later than capturedAt.");
  }

  const sequence = boundedInteger(input.sequence, "sequence", 0, Number.MAX_SAFE_INTEGER);
  const maxPlayers = boundedInteger(input.maxPlayers, "maxPlayers", 1, MAX_CLIENTS);
  const players = boundedInteger(input.players, "players", 0, MAX_CLIENTS);
  const bots = boundedInteger(input.bots, "bots", 0, MAX_CLIENTS);
  if (players + bots > maxPlayers) throw new Error("players and bots cannot exceed maxPlayers.");
  const map = boundedText(input.map, "map", true);
  const timeLeftSeconds = input.timeLeftSeconds == null
    ? null
    : boundedInteger(input.timeLeftSeconds, "timeLeftSeconds", 0, 2_147_483_647);

  if (!Array.isArray(input.roster) || input.roster.length > MAX_CLIENTS) {
    throw new Error(`roster must contain no more than ${MAX_CLIENTS} players.`);
  }
  const seenSteamIds = new Set<string>();
  const roster = input.roster.map((item, index) => {
    const player = recordValue(item);
    const normalizedSteamId = steamId(player.steamId);
    if (seenSteamIds.has(normalizedSteamId)) throw new Error("roster contains a duplicate steamId.");
    seenSteamIds.add(normalizedSteamId);
    return {
      steamId: normalizedSteamId,
      name: boundedText(player.name, `roster[${index}].name`, false),
      ...(player.connectedSeconds == null ? {} : {
        connectedSeconds: boundedInteger(player.connectedSeconds, `roster[${index}].connectedSeconds`, 0, 4_294_967_295),
      }),
      ...(player.score == null ? {} : {
        score: boundedInteger(player.score, `roster[${index}].score`, -2_147_483_648, 2_147_483_647),
      }),
    };
  });
  if (roster.length !== players) throw new Error("players must equal the roster length.");

  return {
    version: 1,
    serverId: normalizedServerId,
    sessionId: normalizedSessionId,
    sessionStartedAt: sessionStartedAt.iso,
    sequence,
    capturedAt: capturedAt.iso,
    map,
    maxPlayers,
    players,
    bots,
    timeLeftSeconds,
    roster,
  };
}

function milliseconds(value: number | string | Date, field: string): number {
  const result = typeof value === "number" ? value : new Date(value).getTime();
  if (!Number.isFinite(result)) throw new Error(`${field} must be a valid timestamp.`);
  return result;
}

export function toPublicStatus(
  heartbeat: Heartbeat,
  receivedAt: number | string | Date,
  now: number,
): PublicStatus {
  const receivedMilliseconds = milliseconds(receivedAt, "receivedAt");
  const lost = now - receivedMilliseconds > LOST_AFTER_MS;
  return {
    state: lost ? "lost" : "online",
    players: heartbeat.players,
    maxPlayers: heartbeat.maxPlayers,
    map: heartbeat.map,
    bots: heartbeat.bots,
    timeLeftSeconds: lost || heartbeat.timeLeftSeconds == null ? null : Math.max(
      0,
      heartbeat.timeLeftSeconds - (heartbeat.players + heartbeat.bots > 0
        ? Math.floor(Math.max(0, now - Date.parse(heartbeat.capturedAt)) / 1_000)
        : 0),
    ),
    roster: lost ? [] : heartbeat.roster.map((player) => ({
      ...player,
      ...(player.connectedSeconds == null ? {} : {
        connectedSeconds: player.connectedSeconds + Math.floor(Math.max(0, now - Date.parse(heartbeat.capturedAt)) / 1_000),
      }),
    })),
    checkedAt: new Date(now).toISOString(),
    lastSeenAt: new Date(receivedMilliseconds).toISOString(),
  };
}

export function unknownPublicStatus(now: number = Date.now()): PublicStatus {
  return {
    state: "unknown",
    players: null,
    maxPlayers: null,
    map: null,
    bots: 0,
    timeLeftSeconds: null,
    roster: [],
    checkedAt: new Date(now).toISOString(),
    lastSeenAt: null,
  };
}
