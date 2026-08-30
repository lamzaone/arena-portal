import { canActOnTarget, getAdminAccess, getServerGuid, getStaffGroupDefinitions } from "@/lib/admin/access";
import { getSession, verifyAdminActionToken } from "@/lib/auth/session";
import { getIdentityVipGroupDefinitions, reconcileIdentityGroupRewards } from "@/lib/data/identity-groups";
import { gameStorageConfigured, removeStaffVip, upsertStaffAdmin, upsertStaffVip, writeStaffActionAudit } from "@/lib/data/portal-repository";
import { formActionRedirect } from "@/lib/form-action-response";

function redirect(request: Request, tab: "admins" | "vips", key: "notice" | "error", value: string) {
  const url = new URL("/admin", request.url);
  url.searchParams.set("tab", tab);
  url.searchParams.set(key, value);
  return formActionRedirect(request, url);
}

function validSteamId(value: string) {
  return /^7656119\d{10}$/.test(value);
}

function validDuration(value: number) {
  return Number.isSafeInteger(value) && value >= 0 && value <= 525_600;
}

const fallbackVipGroups = new Set(["ULTIMATE", "DIAMOND", "GOLD", "SILVER", "STANDARD"]);

export async function POST(request: Request) {
  const session = await getSession();
  if (!session) return formActionRedirect(request, "/api/auth/steam");

  const formData = await request.formData();
  const action = String(formData.get("action") ?? "");
  const tab = action.startsWith("vip-") ? "vips" : "admins";
  if (!verifyAdminActionToken(session, String(formData.get("csrf") ?? ""))) return redirect(request, tab, "error", "verification");

  const actor = await getAdminAccess(session.steamId);
  if (!actor.isAdmin) return redirect(request, tab, "error", "forbidden");
  if (!gameStorageConfigured()) return redirect(request, tab, "error", "game-storage");

  const steamId = String(formData.get("steamId") ?? "").trim();
  if (!validSteamId(steamId)) return redirect(request, tab, "error", "steamid");

  const vipDefinitions = action.startsWith("vip-")
    ? await getIdentityVipGroupDefinitions()
    : [];
  const allowedVipGroups = vipDefinitions.length
    ? new Set(vipDefinitions.map((group) => group.name))
    : fallbackVipGroups;

  try {
    if (action === "admin-upsert") {
      if (!actor.canManageAdmins) return redirect(request, "admins", "error", "admin-permission");
      const username = String(formData.get("username") ?? "").trim().slice(0, 64);
      const assignedGroups = [...new Set(formData.getAll("groups").map((value) => String(value).trim()).filter(Boolean))];
      const groupDefinitions = await getStaffGroupDefinitions();
      const matchingGroups = groupDefinitions.filter((group) => assignedGroups.includes(group.name));
      const target = await getAdminAccess(steamId);
      const immunity = matchingGroups.reduce((highest, group) => Math.max(highest, group.immunity), 0);
      const serverGuid = await getServerGuid();
      if (!username || !matchingGroups.length || matchingGroups.length !== assignedGroups.length || immunity > actor.immunity || !serverGuid) return redirect(request, "admins", "error", "admin-details");
      if (target.isAdmin && !canActOnTarget(actor, target)) return redirect(request, "admins", "error", "immunity");
      await upsertStaffAdmin({ steamId, username, groups: assignedGroups, immunity, serverGuids: [...new Set([...target.serverGuids, serverGuid])] });
      await reconcileIdentityGroupRewards({
        steamId,
        adminGroupNames: assignedGroups,
      });
      await writeStaffActionAudit(actor.steamId, "staff.admin.upserted", "steam-player", steamId);
      return redirect(request, "admins", "notice", "admin-saved");
    }

    if (action === "vip-upsert") {
      if (!actor.canManageVips) return redirect(request, "vips", "error", "vip-permission");
      const name = String(formData.get("name") ?? "").trim().slice(0, 64) || `Steam ${steamId}`;
      const group = String(formData.get("group") ?? "").trim();
      const previousGroup = String(formData.get("previousGroup") ?? "").trim() || undefined;
      const durationMinutes = Number.parseInt(String(formData.get("durationMinutes") ?? ""), 10);
      if (!allowedVipGroups.has(group) || (previousGroup && !allowedVipGroups.has(previousGroup)) || !validDuration(durationMinutes)) return redirect(request, "vips", "error", "vip-details");
      const updatedVip = await upsertStaffVip({ steamId, name, group, durationMinutes, previousGroup });
      await reconcileIdentityGroupRewards({
        steamId,
        vipGroupNames: updatedVip.vipGroupNames,
      });
      await writeStaffActionAudit(actor.steamId, "staff.vip.upserted", "steam-player", steamId);
      return redirect(request, "vips", "notice", "vip-saved");
    }

    if (action === "vip-remove") {
      if (!actor.canManageVips) return redirect(request, "vips", "error", "vip-permission");
      const group = String(formData.get("group") ?? "").trim();
      if (!allowedVipGroups.has(group)) return redirect(request, "vips", "error", "vip-details");
      const updatedVip = await removeStaffVip({ steamId, group });
      await reconcileIdentityGroupRewards({
        steamId,
        vipGroupNames: updatedVip.vipGroupNames,
      });
      await writeStaffActionAudit(actor.steamId, "staff.vip.removed", "steam-player", steamId);
      return redirect(request, "vips", "notice", "vip-removed");
    }

    return redirect(request, tab, "error", "action");
  } catch {
    return redirect(request, tab, "error", "database");
  }
}
