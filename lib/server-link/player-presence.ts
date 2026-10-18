import type { PublicStatus } from "./protocol.ts";
import { statusAtClientTime } from "./presentation.ts";

export type PlayerServerPresence = "online" | "offline" | "unknown";

/** Presence describes CS2 roster membership, never a website session or Steam persona. */
export function playerServerPresence(status: PublicStatus | null, steamId: string, receivedAt: number, now: number): PlayerServerPresence {
  if (!status || status.state !== "online" || !status.lastSeenAt || !Number.isFinite(Date.parse(status.lastSeenAt)) || !Number.isFinite(Date.parse(status.checkedAt))) return "unknown";
  const current = statusAtClientTime(status, receivedAt, now);
  if (current.state !== "online") return "unknown";
  return current.roster.some((player) => player.steamId === steamId) ? "online" : "offline";
}
