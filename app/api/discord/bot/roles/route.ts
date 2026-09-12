import { authorizeDiscordBot } from "@/lib/discord/bot-auth";
import { botJson, isDatabaseId, isDiscordId, readBotJson } from "@/lib/discord/bot-http";
import { saveDiscordGroupRole } from "@/lib/discord/bot-service";
export const runtime = "nodejs";
export async function POST(request: Request) {
  if (!authorizeDiscordBot(request)) return botJson({ error: "Unauthorized." }, 401);
  const input = await readBotJson(request);
  if (!input || !(isDatabaseId(input.groupId) || input.groupId === "staff") || !isDiscordId(input.discordRoleId) ||
    (input.previousRoleId != null && !isDiscordId(input.previousRoleId))) return botJson({ error: "Invalid role mapping." }, 400);
  try {
    const saved = await saveDiscordGroupRole({ groupId: input.groupId, discordRoleId: input.discordRoleId, previousRoleId: input.previousRoleId as string | null ?? null });
    return saved ? botJson({ ok: true }) : botJson({ error: "Role mapping changed. Refresh the snapshot." }, 409);
  } catch { return botJson({ error: "Role mapping could not be stored." }, 503); }
}
