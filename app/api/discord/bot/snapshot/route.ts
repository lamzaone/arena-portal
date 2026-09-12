import { authorizeDiscordBot } from "@/lib/discord/bot-auth";
import { botJson } from "@/lib/discord/bot-http";
import { getDiscordBotSnapshot } from "@/lib/discord/bot-service";
import { reportDiscordFailure } from "@/lib/discord/diagnostics";
export const runtime = "nodejs";
export async function GET(request: Request) {
  if (!authorizeDiscordBot(request)) return botJson({ error: "Unauthorized." }, 401);
  try { return botJson(await getDiscordBotSnapshot()); }
  catch (error) {
    reportDiscordFailure("snapshot", error);
    return botJson({ error: "Identity sources are unavailable; role synchronization must wait." }, 503);
  }
}
