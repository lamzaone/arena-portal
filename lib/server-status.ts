import "server-only";

export type ServerStatus = {
  state: "online" | "offline" | "unknown";
  players: number | null;
  maxPlayers: number | null;
  map: string | null;
  checkedAt: string;
};

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

export async function getServerStatus(): Promise<ServerStatus> {
  const endpoint = process.env.SERVER_STATUS_ENDPOINT;
  if (!endpoint) {
    return { state: "unknown", players: null, maxPlayers: null, map: null, checkedAt: new Date().toISOString() };
  }

  try {
    const response = await fetch(endpoint, {
      cache: "no-store",
      signal: AbortSignal.timeout(3_000)
    });
    return parseStatus(await response.json()) ?? {
      state: "unknown",
      players: null,
      maxPlayers: null,
      map: null,
      checkedAt: new Date().toISOString()
    };
  } catch {
    return { state: "unknown", players: null, maxPlayers: null, map: null, checkedAt: new Date().toISOString() };
  }
}
