import "server-only";

import { getPortalDatabasePool } from "@/lib/data/database-pools";
import { ensureDiscordVerifiedGroupMembership } from "@/lib/data/identity-groups";
import { createDiscordLinkRepository, DiscordLinkError, type DiscordLinkRedemption } from "./link-repository";

function repository() {
  const pool = getPortalDatabasePool();
  if (!pool) throw new DiscordLinkError("storage_unavailable", "Discord linking is temporarily unavailable. Try again later.");
  return createDiscordLinkRepository(pool);
}

export function discordVerifiedGroupKey() {
  return process.env.DISCORD_VERIFIED_GROUP_KEY?.trim() || "discord_verified";
}

async function ensureVerifiedMembership(steamId: string) {
  try {
    await ensureDiscordVerifiedGroupMembership(steamId, discordVerifiedGroupKey());
  } catch (error) {
    // The link is durable in the portal database. The next profile read and
    // the bot snapshot both retry an interrupted cross-database grant.
    console.error("Discord link saved; verified group assignment is pending", error);
  }
}

export async function issueDiscordLinkCode(discordUserId: string) {
  return repository().issue(discordUserId);
}

export async function redeemDiscordLinkCode(input: DiscordLinkRedemption) {
  const link = await repository().redeem(input);
  await ensureVerifiedMembership(link.steamId);
  return link;
}

export async function getDiscordLinkForSteam(steamId: string) {
  const link = await repository().getForSteam(steamId);
  if (link) await ensureVerifiedMembership(link.steamId);
  return link;
}
