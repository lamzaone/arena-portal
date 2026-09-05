import type { PublicStatus, RosterPlayer } from "./protocol.ts";
import { isIndividualSteamId64 } from "../steam/steam-id.ts";

const LOST_AFTER_MS = 45_000;

export function playerLinks(steamId: string): { portal: string; steam: string } | null {
  if (!isIndividualSteamId64(steamId)) return null;
  return {
    portal: `/players/${steamId}`,
    steam: `https://steamcommunity.com/profiles/${steamId}`,
  };
}

export function trustedSteamAvatarUrl(value: string | null | undefined): string | null {
  if (!value || value.length > 2_048) return null;
  try {
    const url = new URL(value);
    const host = url.hostname.toLocaleLowerCase("en-US");
    if (
      url.protocol !== "https:" ||
      !(
        host === "steamstatic.com" ||
        host.endsWith(".steamstatic.com") ||
        host === "steamcdn-a.akamaihd.net"
      )
    ) {
      return null;
    }
    return url.toString();
  } catch {
    return null;
  }
}

export function currentRoster(status: PublicStatus): RosterPlayer[] {
  return status.state === "online" ? status.roster : [];
}

export function rosterAvatarEnrichment(
  status: PublicStatus,
  profiles: ReadonlyMap<string, { avatarFull: string }>,
): Array<{ steamId: string; avatarUrl: string | null }> {
  return currentRoster(status).flatMap((player) => {
    if (!playerLinks(player.steamId)) return [];
    return [{
      steamId: player.steamId,
      avatarUrl: trustedSteamAvatarUrl(profiles.get(player.steamId)?.avatarFull),
    }];
  });
}

export function statusAtClientTime(status: PublicStatus, receivedAt: number, now: number): PublicStatus {
  if (status.state !== "online" || status.lastSeenAt === null) return status;
  const serverAge = Date.parse(status.checkedAt) - Date.parse(status.lastSeenAt);
  const clientElapsed = now - receivedAt;
  if (
    !Number.isFinite(serverAge) ||
    !Number.isFinite(clientElapsed) ||
    Math.max(0, serverAge) + Math.max(0, clientElapsed) <= LOST_AFTER_MS
  ) {
    return status;
  }
  return { ...status, state: "lost", roster: [] };
}
