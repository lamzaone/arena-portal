import { NextResponse } from "next/server";

import { getSession } from "@/lib/auth/session";
import {
  EconomyRepositoryError,
  searchTradePlayers,
} from "@/lib/data/portal-repository";
import { resolvePlayerIdentities } from "@/lib/player-identities";

const noStore = { "Cache-Control": "no-store" };

function json(payload: unknown, status = 200) {
  return NextResponse.json(payload, { status, headers: noStore });
}

export async function GET(request: Request) {
  const session = await getSession();
  const searchParams = new URL(request.url).searchParams;
  const query = searchParams.get("q")?.trim() ?? "";
  const includeSelf = searchParams.get("includeSelf") === "1";
  if (!query) return json({ ok: true, players: [] });
  if (query.length > 64 || (query.length < 2 && !/^7656119\d{10}$/.test(query))) {
    return json(
      {
        ok: false,
        message: "Search with at least two characters or a complete SteamID64.",
      },
      400,
    );
  }

  try {
    const players = await searchTradePlayers({
      query,
      excludeSteamId: includeSelf ? undefined : session?.steamId,
      limit: 8,
    });
    const identities = await resolvePlayerIdentities(
      players.map((player) => ({
        steamId: player.steamId,
        displayName: player.displayName,
      })),
    );
    return json({
      ok: true,
      players: players.map((player) => {
        const identity = identities[player.steamId];
        return {
          steamId: player.steamId,
          displayName: identity?.displayName ?? player.displayName,
          avatarUrl: identity?.avatarUrl ?? null,
          presence: identity?.presence ?? "unknown",
          profileThemeKey: identity?.profileThemeKey ?? null,
          identityGroups: identity?.identityGroups ?? [],
          inventoryVisibility: player.inventoryVisibility,
        };
      }),
    });
  } catch (error) {
    if (error instanceof EconomyRepositoryError && error.code === "invalid_input")
      return json({ ok: false, message: error.message }, 400);
    return json(
      { ok: false, message: "Player search is temporarily unavailable." },
      503,
    );
  }
}
