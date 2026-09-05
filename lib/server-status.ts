import "server-only";

import { toPublicStatus, unknownPublicStatus, type PublicStatus } from "./server-link/protocol";
import { getStoredHeartbeat } from "./server-link/repository";

export type ServerStatus = PublicStatus;

export async function getServerStatus(): Promise<ServerStatus> {
  const now = Date.now();
  const serverId = process.env.GAME_SERVER_GUID?.trim();
  if (!serverId) return unknownPublicStatus(now);
  try {
    const stored = await getStoredHeartbeat(serverId.toLowerCase());
    return stored
      ? toPublicStatus(stored.heartbeat, stored.receivedAt, now)
      : unknownPublicStatus(now);
  } catch {
    return unknownPublicStatus(now);
  }
}
