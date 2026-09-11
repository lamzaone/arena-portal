import "server-only";

import { getPortalDatabasePool } from "@/lib/data/database-pools";
import { createDiscordLinkRepository, DiscordLinkError, type DiscordLinkRedemption } from "./link-repository";

function repository() {
  const pool = getPortalDatabasePool();
  if (!pool) throw new DiscordLinkError("storage_unavailable", "Discord linking is temporarily unavailable. Try again later.");
  return createDiscordLinkRepository(pool);
}

export async function issueDiscordLinkCode(discordUserId: string) {
  return repository().issue(discordUserId);
}

export async function redeemDiscordLinkCode(input: DiscordLinkRedemption) {
  return repository().redeem(input);
}

export async function getDiscordLinkForSteam(steamId: string) {
  return repository().getForSteam(steamId);
}
