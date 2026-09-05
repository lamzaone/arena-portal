import { rosterAvatarEnrichment } from "@/lib/server-link/presentation";
import { getServerStatus } from "@/lib/server-status";
import { getSteamProfiles } from "@/lib/steam/profiles";

export async function GET() {
  const status = await getServerStatus();
  const steamIds = status.state === "online" ? status.roster.map((player) => player.steamId) : [];
  const profiles = await getSteamProfiles(steamIds);
  return Response.json({ players: rosterAvatarEnrichment(status, profiles) }, {
    headers: { "Cache-Control": "no-store" },
  });
}
