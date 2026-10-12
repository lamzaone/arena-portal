import { getAdminAccess, adminWriteConfigured, getServerGuid } from "@/lib/admin/access";
import { getSession, verifyAdminActionToken } from "@/lib/auth/session";
import { issuePlayerWarning, revokePlayerWarning, getWarningTarget } from "@/lib/data/warnings";
import { authorizeWarning } from "@/lib/moderation/warning-policy";
import { formActionRedirect } from "@/lib/form-action-response";

export async function POST(request: Request) {
  const redirect = (key: string, message: string) => formActionRedirect(request, `/admin/warnings?${key}=${encodeURIComponent(message)}`);
  const session = await getSession();
  if (!session) return formActionRedirect(request, "/api/auth/steam");
  const form = await request.formData();
  if (!verifyAdminActionToken(session, String(form.get("csrf") ?? ""))) return redirect("error", "Verification failed.");
  if (!adminWriteConfigured()) return redirect("error", "Moderation writes are disabled.");
  try {
    const actor = await getAdminAccess(session.steamId);
    const action = String(form.get("action"));
    const id = String(form.get("id") ?? "");
    const reason = String(form.get("reason") ?? "").trim();
    if (reason.length < 2 || reason.length > 500) return redirect("error", "Provide a reason between 2 and 500 characters.");
    if (action === "issue") {
      const steamId = String(form.get("steamId") ?? "").trim();
      authorizeWarning(actor, await getAdminAccess(steamId), "issue");
      await issuePlayerWarning({ id, steamId, reason, playerName: String(form.get("playerName") ?? "").trim() || "Unknown player", durationMinutes: Number(form.get("durationMinutes")), serverGuid: await getServerGuid(), actorSteamId: actor.steamId, actorName: actor.displayName });
    } else if (action === "revoke") {
      const target = await getWarningTarget(id);
      if (!target) return redirect("error", "Warning not found on this server.");
      authorizeWarning(actor, await getAdminAccess(target), "revoke");
      await revokePlayerWarning(id, actor.steamId, reason);
    } else return redirect("error", "Unknown action.");
    return redirect("notice", action === "issue" ? "Warning issued. The player must acknowledge it in game." : "Warning revoked.");
  } catch (error) {
    const message = (error as Error).message;
    return redirect("error", message === "permission" ? "Your server assignment and warn/unwarn permissions do not allow this action." : message === "immunity" ? "The player has higher immunity." : message === "details" ? "Invalid warning details." : "The warning could not be saved.");
  }
}
