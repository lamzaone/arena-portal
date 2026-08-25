import "server-only";

import dgram from "node:dgram";

export type ServerStatus = {
  state: "online" | "offline" | "unknown";
  players: number | null;
  maxPlayers: number | null;
  map: string | null;
  checkedAt: string;
};

type ServerTarget = { host: string; port: number };

function unavailable(state: ServerStatus["state"] = "unknown"): ServerStatus {
  return { state, players: null, maxPlayers: null, map: null, checkedAt: new Date().toISOString() };
}

function parseStatus(value: unknown): ServerStatus | null {
  if (!value || typeof value !== "object") return null;
  const record = value as Record<string, unknown>;
  const state = record.status === "online" || record.status === "offline" ? record.status : null;
  if (!state) return null;
  return {
    state,
    players: typeof record.players === "number" ? record.players : null,
    maxPlayers: typeof record.maxPlayers === "number" ? record.maxPlayers : null,
    map: typeof record.map === "string" ? record.map : null,
    checkedAt: new Date().toISOString()
  };
}

function serverTarget(): ServerTarget | null {
  const configured = (process.env.GAME_SERVER_ADDRESS ?? process.env.NEXT_PUBLIC_SERVER_CONNECT_URL ?? "").trim();
  const value = configured.replace(/^steam:\/\/connect\//i, "").replace(/^https?:\/\//i, "").replace(/\/$/, "");
  if (!value) return null;
  const match = value.match(/^([^/:]+)(?::(\d{1,5}))?(?:\/.*)?$/);
  if (!match) return null;
  const port = Number(match[2] ?? "27015");
  return Number.isInteger(port) && port > 0 && port <= 65_535 ? { host: match[1], port } : null;
}

function readCString(packet: Buffer, offset: number) {
  const end = packet.indexOf(0, offset);
  if (end === -1) throw new Error("Malformed Source query response.");
  return { value: packet.subarray(offset, end).toString("utf8"), offset: end + 1 };
}

function parseInfoResponse(packet: Buffer): Omit<ServerStatus, "checkedAt"> {
  if (packet.length < 6 || packet.readInt32LE(0) !== -1 || packet[4] !== 0x49) throw new Error("Unexpected Source query response.");
  let offset = 6; // Header, response kind, and protocol version.
  const name = readCString(packet, offset); offset = name.offset;
  const map = readCString(packet, offset); offset = map.offset;
  const folder = readCString(packet, offset); offset = folder.offset;
  const game = readCString(packet, offset); offset = game.offset;
  if (packet.length < offset + 5) throw new Error("Incomplete Source query response.");
  offset += 2; // Steam app id
  const players = packet[offset++];
  const maxPlayers = packet[offset++];
  return { state: "online", players, maxPlayers, map: map.value || null };
}

function querySourceServer(target: ServerTarget): Promise<ServerStatus> {
  const baseQuery = Buffer.concat([Buffer.from([0xff, 0xff, 0xff, 0xff, 0x54]), Buffer.from("Source Engine Query\0", "ascii")]);
  return new Promise((resolve, reject) => {
    const socket = dgram.createSocket("udp4");
    let finished = false;
    let awaitingChallenge = true;
    const finish = (result: ServerStatus | Error) => {
      if (finished) return;
      finished = true;
      clearTimeout(timeout);
      socket.close();
      if (result instanceof Error) reject(result);
      else resolve(result);
    };
    const send = (packet: Buffer) => socket.send(packet, target.port, target.host, (error) => {
      if (error) finish(error);
    });
    const timeout = setTimeout(() => finish(new Error("Source query timed out.")), 3_500);

    socket.once("error", (error) => finish(error));
    socket.on("message", (packet) => {
      if (finished || packet.length < 5 || packet.readInt32LE(0) !== -1) return;
      if (packet[4] === 0x41 && awaitingChallenge && packet.length >= 9) {
        awaitingChallenge = false;
        send(Buffer.concat([baseQuery, packet.subarray(5, 9)]));
        return;
      }
      if (packet[4] === 0x49) {
        try {
          finish({ ...parseInfoResponse(packet), checkedAt: new Date().toISOString() });
        } catch (error) {
          finish(error instanceof Error ? error : new Error("Invalid Source query response."));
        }
      }
    });
    send(baseQuery);
  });
}

async function queryStatusEndpoint(): Promise<ServerStatus | null> {
  const endpoint = process.env.SERVER_STATUS_ENDPOINT;
  if (!endpoint) return null;
  try {
    const response = await fetch(endpoint, { cache: "no-store", signal: AbortSignal.timeout(3_000) });
    return parseStatus(await response.json());
  } catch {
    return null;
  }
}

export async function getServerStatus(): Promise<ServerStatus> {
  // Query the game endpoint configured by the current Connect URL first. This
  // keeps the homepage in sync whenever the server IP changes in deployment.
  const target = serverTarget();
  if (target) {
    try {
      return await querySourceServer(target);
    } catch {
      // An optional HTTP status service remains a fallback on hosts that block UDP.
    }
  }
  return await queryStatusEndpoint() ?? unavailable(target ? "offline" : "unknown");
}
