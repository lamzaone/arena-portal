import { authorizeDiscordBot } from "@/lib/discord/bot-auth";
import { botJson, isDatabaseId, isDiscordId, readBotJson } from "@/lib/discord/bot-http";
import { discordNotificationRepository, discordNotificationUrl } from "@/lib/discord/bot-service";
import { reportDiscordFailure } from "@/lib/discord/diagnostics";
export const runtime = "nodejs";
export async function POST(request: Request) {
  if (!authorizeDiscordBot(request)) return botJson({ error: "Unauthorized." }, 401);
  const input = await readBotJson(request);
  if (!input) return botJson({ error: "Invalid request." }, 400);
  try {
    if (input.action === "claim") {
      const events = await discordNotificationRepository().claim();
      return botJson({ events: events.map(({ path, ...event }) => ({ ...event, url: discordNotificationUrl(path) })) });
    }
    if (!["complete", "retry"].includes(String(input.action)) || !isDatabaseId(input.id) ||
      typeof input.leaseToken !== "string" || !/^[a-f0-9]{64}$/.test(input.leaseToken) ||
      (input.action === "complete" && !isDiscordId(input.messageId))) return botJson({ error: "Invalid acknowledgement." }, 400);
    const accepted = await discordNotificationRepository().settle({
      action: input.action as "complete" | "retry", id: input.id, leaseToken: input.leaseToken,
      messageId: isDiscordId(input.messageId) ? input.messageId : undefined,
    });
    return accepted ? botJson({ ok: true }) : botJson({ error: "Notification lease expired or changed." }, 409);
  } catch (error) {
    reportDiscordFailure(input.action === "claim" ? "notifications.claim" : input.action === "retry" ? "notifications.retry" : "notifications.complete", error);
    return botJson({ error: "Notification storage is unavailable." }, 503);
  }
}
