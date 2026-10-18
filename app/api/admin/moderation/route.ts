import { adminWriteConfigured, canActOnTarget, getAdminAccess, getServerGuid } from "@/lib/admin/access";
import { getSession, verifyAdminActionToken } from "@/lib/auth/session";
import { enqueuePortalBridgeEvent, enqueueStaffBan, enqueueStaffUnban, writeStaffModerationAudit } from "@/lib/data/portal-repository";
import { formActionRedirect } from "@/lib/form-action-response";
import { canUseModerationAction } from "@/lib/moderation/profile-policy";
import { getServerStatus } from "@/lib/server-status";

function redirect(request: Request, key: "notice" | "error", value: string) {
  let path = "/admin/bans";
  try {
    const referer = new URL(request.headers.get("referer") ?? "");
    if (referer.origin === new URL(request.url).origin && /^\/players\/7656119\d{10}$/.test(referer.pathname)) path = referer.pathname;
  } catch {}
  const url = new URL(path, request.url);
  url.searchParams.set(key, value);
  return formActionRedirect(request, url);
}

function validSteamId(value: string) {
  return /^7656119\d{10}$/.test(value);
}

export async function POST(request: Request) {
  const session = await getSession();
  if (!session) return formActionRedirect(request, "/api/auth/steam");

  const formData = await request.formData();
  if (!verifyAdminActionToken(session, String(formData.get("csrf") ?? ""))) return redirect(request, "error", "verification");

  const actor = await getAdminAccess(session.steamId);
  if (!actor.isAdmin) return redirect(request, "error", "forbidden");
  if (!adminWriteConfigured()) return redirect(request, "error", "writes-disabled");

  const action = String(formData.get("action") ?? "");
  const steamId = String(formData.get("steamId") ?? "").trim();
  if (!validSteamId(steamId)) return redirect(request, "error", "steamid");

  try {
    if (["kick", "gag", "mute", "silence"].includes(action)) {
      if (!canUseModerationAction(actor, action)) return redirect(request, "error", "action-permission");
      const target = await getAdminAccess(steamId);
      if (target.isAdmin && !canActOnTarget(actor, target)) return redirect(request, "error", "immunity");
      const reason = String(formData.get("reason") ?? "").trim();
      const durationText = String(formData.get("durationMinutes") ?? "");
      const durationMinutes = Number(durationText);
      if (!/^\d+$/.test(durationText) || !Number.isSafeInteger(durationMinutes) || durationMinutes < 0 || durationMinutes > 525600 || reason.length < 2 || reason.length > 200) return redirect(request, "error", "ban-details");
      const serverGuid = await getServerGuid();
      if (!serverGuid || !/^[0-9a-f]{8}-(?:[0-9a-f]{4}-){3}[0-9a-f]{12}$/i.test(serverGuid)) return redirect(request, "error", "server-guid");
      let targetConnectedAt: string | undefined;
      if (action === "kick") {
        const status = await getServerStatus();
        const player = status.roster.find(player => player.steamId === steamId);
        if (status.state !== "online" || !player) return redirect(request, "error", "player-offline");
        if (player.connectedSeconds != null && Number.isFinite(player.connectedSeconds)) targetConnectedAt = new Date(Date.parse(status.checkedAt) - player.connectedSeconds * 1000).toISOString();
      }
      const queuedAt = Date.now();
      const jobId = await enqueuePortalBridgeEvent(`moderation.${action}`, steamId, {
        steamId, playerName: String(formData.get("playerName") ?? "").trim().slice(0, 128) || "Unknown player",
        reason, durationMinutes, actorSteamId: actor.steamId, actorName: actor.displayName, serverGuid,
        queuedAt: new Date(queuedAt).toISOString(), expiresAt: new Date(queuedAt + 30_000).toISOString(), targetConnectedAt,
      });
      await writeStaffModerationAudit(actor.steamId, `staff.${action}.queued`, steamId);
      return redirect(request, "notice", `${action}-queued-${jobId}`);
    }
    if (action === "ban") {
      if (!actor.canBan) return redirect(request, "error", "ban-permission");

      const durationText = String(formData.get("durationMinutes") ?? "");
      const durationMinutes = /^\d+$/.test(durationText) ? Number(durationText) : Number.NaN;
      const reason = String(formData.get("reason") ?? "").trim();
      const playerName = String(formData.get("playerName") ?? "").trim().slice(0, 128) || "Unknown player";
      const serverGuid = await getServerGuid();
      const target = await getAdminAccess(steamId);
      if (!Number.isSafeInteger(durationMinutes) || durationMinutes < 0 || durationMinutes > 525_600 || reason.length < 2 || reason.length > 200) return redirect(request, "error", "ban-details");
      if (!serverGuid || !/^[0-9a-f]{8}-(?:[0-9a-f]{4}-){3}[0-9a-f]{12}$/i.test(serverGuid)) return redirect(request, "error", "server-guid");
      if (target.isAdmin && !canActOnTarget(actor, target)) return redirect(request, "error", "immunity");

      const jobId = await enqueueStaffBan({ steamId, playerName, durationMinutes, reason, actorSteamId: actor.steamId, actorName: actor.displayName, serverGuid });
      await writeStaffModerationAudit(actor.steamId, "staff.ban.queued", steamId);
      return redirect(request, "notice", `ban-queued-${jobId}`);
    }

    if (action === "unban") {
      if (!actor.canUnban) return redirect(request, "error", "unban-permission");
      const target = await getAdminAccess(steamId);
      if (target.isAdmin && !canActOnTarget(actor, target)) return redirect(request, "error", "immunity");
      const jobId = await enqueueStaffUnban({ steamId, actorSteamId: actor.steamId, actorName: actor.displayName });
      await writeStaffModerationAudit(actor.steamId, "staff.ban.revocation-queued", steamId);
      return redirect(request, "notice", `unban-queued-${jobId}`);
    }

    return redirect(request, "error", "action");
  } catch {
    return redirect(request, "error", "database");
  }
}
