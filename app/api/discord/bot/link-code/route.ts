import { authorizeDiscordBot } from "@/lib/discord/bot-auth";
import { discordLinkFailure, discordLinkJson, readDiscordLinkBody } from "@/lib/discord/link-http";
import { issueDiscordLinkCode } from "@/lib/discord/link-service";
import { portalRedirectUrl } from "@/lib/portal-url";

export async function POST(request: Request) {
  if (!authorizeDiscordBot(request)) return discordLinkJson({ ok: false, message: "Unauthorized." }, 401);
  const body = await readDiscordLinkBody(request);
  if (!body || typeof body.discordUserId !== "string" || !/^[1-9]\d{16,19}$/.test(body.discordUserId)) {
    return discordLinkJson({ ok: false, message: "A valid Discord user ID is required." }, 400);
  }
  try {
    const linkUrl = portalRedirectUrl(request.url, "/discord-link").toString();
    const issued = await issueDiscordLinkCode(body.discordUserId);
    return discordLinkJson({ ...issued, linkUrl });
  } catch (error) {
    return discordLinkFailure(error);
  }
}
