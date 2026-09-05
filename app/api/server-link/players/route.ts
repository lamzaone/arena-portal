import { currentRoster, trustedSteamAvatarUrl } from "@/lib/server-link/presentation";
import { getPlayerIdentityGroupBadges } from "@/lib/data/portal-repository";
import { resolvePlayerIdentities } from "@/lib/player-identities";
import { getServerStatus } from "@/lib/server-status";

export async function GET() {
  const status = await getServerStatus();
  const roster = currentRoster(status);
  const groups = await getPlayerIdentityGroupBadges(roster.map((player) => player.steamId));
  const identities = await resolvePlayerIdentities(roster.map((player) => ({
    steamId: player.steamId,
    displayName: player.name,
    identityGroups: groups.get(player.steamId) ?? [],
  })));
  const players = roster.flatMap((player) => {
    const identity = identities[player.steamId];
    return identity ? [{ ...identity, displayName: player.name, avatarUrl: trustedSteamAvatarUrl(identity.avatarUrl) }] : [];
  });
  return Response.json({ players }, {
    headers: { "Cache-Control": "no-store" },
  });
}
