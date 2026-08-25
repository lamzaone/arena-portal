import "server-only";

export type SteamProfile = {
  steamId: string;
  name: string;
  avatarFull: string;
};

type SteamSummaryResponse = {
  response?: {
    players?: Array<{
      steamid?: string;
      personaname?: string;
      avatarfull?: string;
    }>;
  };
};

type CompleteSteamPlayer = {
  steamid: string;
  personaname: string;
  avatarfull: string;
};

export async function getSteamProfiles(steamIds: string[]) {
  const uniqueIds = [...new Set(steamIds.filter((steamId) => /^7656119\d{10}$/.test(steamId)))].slice(0, 100);
  const apiKey = process.env.STEAM_WEB_API_KEY;
  if (!apiKey || !uniqueIds.length) return new Map<string, SteamProfile>();

  try {
    const response = await fetch(
      `https://api.steampowered.com/ISteamUser/GetPlayerSummaries/v0002/?key=${encodeURIComponent(apiKey)}&steamids=${uniqueIds.join(",")}`,
      { next: { revalidate: 3_600 } }
    );
    if (!response.ok) return new Map<string, SteamProfile>();

    const payload = await response.json() as SteamSummaryResponse;
    return new Map((payload.response?.players ?? [])
      .filter((player): player is CompleteSteamPlayer => Boolean(player.steamid && player.personaname && player.avatarfull))
      .map((player) => [player.steamid, { steamId: player.steamid, name: player.personaname, avatarFull: player.avatarfull }]));
  } catch {
    return new Map<string, SteamProfile>();
  }
}
