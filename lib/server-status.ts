import "server-only";

import { toPublicStatus, unknownPublicStatus, type PublicStatus } from "./server-link/protocol";
import { getStoredHeartbeat } from "./server-link/repository";

export type ServerStatus = PublicStatus;

export async function getServerStatus(): Promise<ServerStatus> {
  const serverId = process.env.GAME_SERVER_GUID?.trim();
  if (!serverId) return unknownPublicStatus();
  try {
    const stored = await getStoredHeartbeat(serverId.toLowerCase());
    const now = Date.now();
    return stored
      ? toPublicStatus(stored.heartbeat, stored.receivedAt, now)
      : unknownPublicStatus(now);
  } catch {
    return unknownPublicStatus();
  }
}
