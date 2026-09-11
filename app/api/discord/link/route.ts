import { getSession, verifyProfileActionToken } from "@/lib/auth/session";
import { discordLinkFailure, discordLinkJson, readDiscordLinkBody } from "@/lib/discord/link-http";
import { redeemDiscordLinkCode } from "@/lib/discord/link-service";

export async function POST(request: Request) {
  const session = await getSession();
  if (!session) return discordLinkJson({ ok: false, message: "Sign in with Steam before linking Discord." }, 401);
  const body = await readDiscordLinkBody(request);
  if (!body) return discordLinkJson({ ok: false, message: "The link request was invalid." }, 400);
  if (!verifyProfileActionToken(session, typeof body.csrf === "string" ? body.csrf : "")) {
    return discordLinkJson({ ok: false, message: "Your session verification has expired. Reload and try again." }, 403);
  }
  if (typeof body.code !== "string" || body.code.length > 64) return discordLinkJson({ ok: false, message: "Enter the link code from the Discord bot." }, 400);
  try {
    const link = await redeemDiscordLinkCode({ steamId: session.steamId, code: body.code, source: "portal" });
    return discordLinkJson({ ok: true, message: "Your Discord account is linked.", link });
  } catch (error) {
    return discordLinkFailure(error);
  }
}
