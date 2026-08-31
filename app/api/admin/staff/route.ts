import { canActOnTarget, getAdminAccess } from "@/lib/admin/access";
import { getSession, verifyAdminActionToken } from "@/lib/auth/session";
import { getIdentityVipGroupSnapshot, reconcileIdentityGroupRewards } from "@/lib/data/identity-groups";
import { gameStorageConfigured, portalStorageConfigured, upsertStaffVip, writeStaffActionAudit } from "@/lib/data/portal-repository";
import { formActionRedirect } from "@/lib/form-action-response";
import { normalizeVipGroup } from "@/lib/content/group-presentation";
import {
  assignStaffAdminMembership,
  extendStaffAdminMembership,
  removeStaffAdminMembership,
  StaffAdminMembershipError,
  type StaffAdminMembershipReference,
  type StaffAdminMembershipSource,
} from "@/lib/data/staff-admin-memberships";
import {
  consolidateStaffVipMemberships,
  editStaffVipMembership,
  extendStaffVipMembership,
  removeStaffVipMembership,
  StaffVipMembershipError,
  type StaffVipMembershipExpiryMode,
  type StaffVipMembershipReference,
  type StaffVipMembershipSource,
  withSerializedNativeVipMutation,
} from "@/lib/data/staff-vip-memberships";

function redirect(request: Request, tab: "admins" | "vips", key: "notice" | "error", value: string) {
  const assignment = tab === "admins" ? "admin" : "vip";
  const url = new URL("/admin/groups", request.url);
  url.searchParams.set("tab", "membership");
  url.searchParams.set("assignment", assignment);
  url.searchParams.set(key, value);
  url.hash = `${assignment}-assignments`;
  return formActionRedirect(request, url);
}

function validSteamId(value: string) {
  return /^7656119\d{10}$/.test(value);
}

function validDuration(value: number) {
  return Number.isSafeInteger(value) && value >= 0 && value <= 525_600;
}

function positiveDurationMinutes(value: FormDataEntryValue | null) {
  const text = String(value ?? "").trim();
  if (!/^\d+$/.test(text)) return null;
  const parsed = Number(text);
  return Number.isSafeInteger(parsed) && parsed >= 1 && parsed <= 525_600
    ? parsed
    : null;
}

function validVipAccountId(value: string, steamId: string) {
  if (!/^\d{1,20}$/.test(value)) return false;
  try {
    const base = BigInt("76561197960265728");
    const accountId = BigInt(value);
    const resolvedSteamId = accountId >= base ? accountId : accountId + base;
    return resolvedSteamId.toString() === steamId;
  } catch {
    return false;
  }
}

const fallbackVipGroups = new Set(["ULTIMATE", "DIAMOND", "GOLD", "SILVER", "STANDARD"]);

function vipGroupIdentity(value: string) {
  return normalizeVipGroup(value.normalize("NFKC")).toLocaleLowerCase("en-US");
}

function optionalVipServerId(value: FormDataEntryValue | null) {
  if (value === null || String(value).trim() === "") return undefined;
  const parsed = Number.parseInt(String(value), 10);
  return Number.isSafeInteger(parsed) && parsed >= 0 && parsed <= 2_147_483_647
    ? parsed
    : null;
}

function exactStoredVipGroup(value: FormDataEntryValue | null) {
  const group = String(value ?? "");
  return group.length >= 1 &&
      group.length <= 64 &&
      !/[\u0000-\u001f\u007f]/.test(group)
    ? group
    : null;
}

function vipMembershipExpiryMode(value: FormDataEntryValue | null) {
  return value === "keep" ||
      value === "extend" ||
      value === "replace" ||
      value === "permanent"
    ? value satisfies StaffVipMembershipExpiryMode
    : null;
}

function exactStoredAdminGroup(value: FormDataEntryValue | null) {
  const group = String(value ?? "");
  return group.length >= 1 &&
      group.length <= 100 &&
      !/[\u0000-\u001f\u007f]/.test(group)
    ? group
    : null;
}

function vipMembershipSource(value: FormDataEntryValue | null) {
  return value === "native" || value === "portal"
    ? value satisfies StaffVipMembershipSource
    : null;
}

function adminMembershipSource(value: FormDataEntryValue | null) {
  return value === "native" || value === "portal"
    ? value satisfies StaffAdminMembershipSource
    : null;
}

function positiveGroupId(value: FormDataEntryValue | null) {
  const text = String(value ?? "").trim();
  if (!/^\d+$/.test(text)) return null;
  const parsed = Number(text);
  return Number.isSafeInteger(parsed) && parsed > 0 ? parsed : null;
}

function arenaMembershipUuid(value: FormDataEntryValue | null) {
  const text = String(value ?? "").trim();
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/.test(text)
    ? text
    : null;
}

function vipMembershipReference(
  formData: FormData,
  steamId: string,
  sourceField: "membershipSource" | "targetSource",
): StaffVipMembershipReference | null {
  const source = vipMembershipSource(formData.get(sourceField));
  if (source === "portal") {
    const groupId = positiveGroupId(formData.get("groupId"));
    const arenaGroupId = positiveGroupId(formData.get("arenaGroupId"));
    const scopeId = positiveGroupId(formData.get("scopeId"));
    const membershipUuid = arenaMembershipUuid(formData.get("membershipUuid"));
    return groupId === null || arenaGroupId === null || scopeId === null || !membershipUuid
      ? null
      : { source, steamId, groupId, arenaGroupId, scopeId, membershipUuid };
  }
  if (source === "native") {
    const accountId = String(formData.get("accountId") ?? "").trim();
    const serverId = optionalVipServerId(formData.get("serverId"));
    const storedGroup = exactStoredVipGroup(formData.get("storedGroup"));
    if (
      !accountId ||
      !validVipAccountId(accountId, steamId) ||
      serverId === null ||
      serverId === undefined ||
      !storedGroup
    ) {
      return null;
    }
    return { source, steamId, accountId, serverId, storedGroup };
  }
  return null;
}

function adminMembershipReference(
  formData: FormData,
  steamId: string,
): StaffAdminMembershipReference | null {
  const source = adminMembershipSource(formData.get("membershipSource"));
  if (source === "portal") {
    const groupId = positiveGroupId(formData.get("groupId"));
    const membershipUuid = arenaMembershipUuid(formData.get("membershipUuid"));
    const scopeId = positiveGroupId(formData.get("scopeId"));
    const rowVersion = positiveGroupId(formData.get("rowVersion"));
    return groupId === null || membershipUuid === null || scopeId === null || rowVersion === null
      ? null
      : { source, steamId, groupId, membershipUuid, scopeId, rowVersion };
  }
  if (source === "native") {
    const adminId = positiveGroupId(formData.get("adminId"));
    const storedGroup = exactStoredAdminGroup(formData.get("storedGroup"));
    return adminId === null || !storedGroup
      ? null
      : { source, steamId, adminId, storedGroup };
  }
  return null;
}

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

  const vipSnapshot = action.startsWith("vip-")
    ? await getIdentityVipGroupSnapshot()
    : null;
  const allowedVipGroups = vipSnapshot?.definitions.length
    ? new Set(vipSnapshot.definitions.map((group) => group.name))
    : vipSnapshot?.databaseAuthoritative || portalStorageConfigured()
      ? new Set<string>()
      : fallbackVipGroups;
  const allowedVipGroupsByIdentity = new Map(
    [...allowedVipGroups].map((group) => [vipGroupIdentity(group), group] as const),
  );

  try {
    if (action === "admin-membership-assign") {
      if (!actor.canManageAdmins) return redirect(request, "admins", "error", "admin-permission");
      const target = await getAdminAccess(steamId);
      if (!canActOnTarget(actor, target)) {
        return redirect(request, "admins", "error", "immunity");
      }
      const groupId = positiveGroupId(formData.get("groupId"));
      const assignmentMinutes = positiveDurationMinutes(
        formData.get("durationMinutes"),
      );
      const reason = String(formData.get("reason") ?? "");
      if (
        groupId === null ||
        assignmentMinutes === null ||
        reason.length > 180
      ) {
        return redirect(request, "admins", "error", "admin-details");
      }
      await assignStaffAdminMembership({
        steamId,
        groupId,
        durationMinutes: assignmentMinutes,
        actorSteamId: actor.steamId,
        actorImmunity: actor.immunity,
        reason,
      });
      await writeStaffActionAudit(
        actor.steamId,
        "staff.admin.membership.assigned",
        "steam-player",
        steamId,
      );
      return redirect(request, "admins", "notice", "admin-assigned");
    }

    if (action === "admin-membership-extend") {
      if (!actor.canManageAdmins) return redirect(request, "admins", "error", "admin-permission");
      const target = await getAdminAccess(steamId);
      if (!canActOnTarget(actor, target)) {
        return redirect(request, "admins", "error", "immunity");
      }
      const reference = adminMembershipReference(formData, steamId);
      const extensionMinutes = positiveDurationMinutes(
        formData.get("durationMinutes"),
      );
      if (
        !reference ||
        reference.source !== "portal" ||
        extensionMinutes === null
      ) {
        return redirect(request, "admins", "error", "admin-details");
      }
      await extendStaffAdminMembership({
        reference,
        extensionMinutes,
        actorSteamId: actor.steamId,
        actorImmunity: actor.immunity,
        expectedExpiresAt: String(formData.get("expectedExpiresAt") ?? ""),
      });
      await writeStaffActionAudit(
        actor.steamId,
        "staff.admin.membership.extended",
        "steam-player",
        steamId,
      );
      return redirect(request, "admins", "notice", "admin-extended");
    }

    if (action === "admin-membership-remove") {
      if (!actor.canManageAdmins) return redirect(request, "admins", "error", "admin-permission");
      const target = await getAdminAccess(steamId);
      if (!canActOnTarget(actor, target)) {
        return redirect(request, "admins", "error", "immunity");
      }
      const reference = adminMembershipReference(formData, steamId);
      if (!reference) return redirect(request, "admins", "error", "admin-details");
      await removeStaffAdminMembership({
        reference,
        actorSteamId: actor.steamId,
        actorImmunity: actor.immunity,
      });
      await writeStaffActionAudit(
        actor.steamId,
        "staff.admin.membership.removed",
        "steam-player",
        steamId,
      );
      return redirect(request, "admins", "notice", "admin-removed");
    }

    if (action === "vip-upsert") {
      if (!actor.canManageVips) return redirect(request, "vips", "error", "vip-permission");
      const name = String(formData.get("name") ?? "").trim().slice(0, 64) || `Steam ${steamId}`;
      const group = String(formData.get("group") ?? "").trim();
      const previousGroupEntry = formData.get("previousGroup");
      const previousGroup = previousGroupEntry === null
        ? undefined
        : exactStoredVipGroup(previousGroupEntry) ?? undefined;
      const rawAccountId = String(formData.get("accountId") ?? "").trim();
      const accountId = rawAccountId || undefined;
      const durationMinutes = Number.parseInt(String(formData.get("durationMinutes") ?? ""), 10);
      const serverId = optionalVipServerId(formData.get("serverId"));
      const canonicalGroup = allowedVipGroupsByIdentity.get(vipGroupIdentity(group));
      if (!canonicalGroup || (previousGroupEntry !== null && !previousGroup) || (accountId !== undefined && !validVipAccountId(accountId, steamId)) || !validDuration(durationMinutes) || serverId === null) return redirect(request, "vips", "error", "vip-details");
      const updatedVip = await withSerializedNativeVipMutation(steamId, () =>
        upsertStaffVip({ steamId, accountId, name, group: canonicalGroup, durationMinutes, previousGroup, serverId }),
      );
      await reconcileIdentityGroupRewards({
        steamId,
        vipGroupNames: updatedVip.vipGroupNames,
      });
      await writeStaffActionAudit(actor.steamId, "staff.vip.upserted", "steam-player", steamId);
      return redirect(request, "vips", "notice", "vip-saved");
    }

    if (action === "vip-membership-extend") {
      if (!actor.canManageVips) return redirect(request, "vips", "error", "vip-permission");
      const reference = vipMembershipReference(formData, steamId, "membershipSource");
      const extensionMinutes = Number.parseInt(
        String(formData.get("durationMinutes") ?? ""),
        10,
      );
      if (!reference || !validDuration(extensionMinutes) || extensionMinutes === 0) {
        return redirect(request, "vips", "error", "vip-details");
      }
      await extendStaffVipMembership({
        reference,
        extensionMinutes,
        actorSteamId: actor.steamId,
        expectedExpiresAt: String(formData.get("expectedExpiresAt") ?? ""),
      });
      await writeStaffActionAudit(
        actor.steamId,
        "staff.vip.membership.extended",
        "steam-player",
        steamId,
      );
      return redirect(request, "vips", "notice", "vip-extended");
    }

    if (action === "vip-membership-edit") {
      if (!actor.canManageVips) return redirect(request, "vips", "error", "vip-permission");
      const reference = vipMembershipReference(formData, steamId, "membershipSource");
      const newGroup = exactStoredVipGroup(formData.get("newGroup"));
      const newServerId = optionalVipServerId(formData.get("newServerId"));
      const expiryMode = vipMembershipExpiryMode(formData.get("expiryMode"));
      const durationMinutes = Number.parseInt(
        String(formData.get("durationMinutes") ?? "0"),
        10,
      );
      if (
        !reference ||
        !newGroup ||
        newServerId === null ||
        newServerId === undefined ||
        !expiryMode ||
        !validDuration(durationMinutes) ||
        ((expiryMode === "extend" || expiryMode === "replace") && durationMinutes === 0)
      ) {
        return redirect(request, "vips", "error", "vip-details");
      }
      await editStaffVipMembership({
        reference,
        actorSteamId: actor.steamId,
        newGroup,
        newServerId,
        expiryMode,
        durationMinutes,
        expectedExpiresAt: String(formData.get("expectedExpiresAt") ?? ""),
      });
      await writeStaffActionAudit(
        actor.steamId,
        "staff.vip.membership.edited",
        "steam-player",
        steamId,
      );
      return redirect(request, "vips", "notice", "vip-saved");
    }

    if (action === "vip-membership-remove") {
      if (!actor.canManageVips) return redirect(request, "vips", "error", "vip-permission");
      const reference = vipMembershipReference(formData, steamId, "membershipSource");
      if (!reference) return redirect(request, "vips", "error", "vip-details");
      await removeStaffVipMembership({ reference, actorSteamId: actor.steamId });
      await writeStaffActionAudit(
        actor.steamId,
        "staff.vip.membership.removed",
        "steam-player",
        steamId,
      );
      return redirect(request, "vips", "notice", "vip-removed");
    }

    if (action === "vip-membership-consolidate") {
      if (!actor.canManageVips) return redirect(request, "vips", "error", "vip-permission");
      const target = vipMembershipReference(formData, steamId, "targetSource");
      if (!target) return redirect(request, "vips", "error", "vip-details");
      await consolidateStaffVipMemberships({ target, actorSteamId: actor.steamId });
      await writeStaffActionAudit(
        actor.steamId,
        "staff.vip.membership.consolidated",
        "steam-player",
        steamId,
      );
      return redirect(request, "vips", "notice", "vip-consolidated");
    }

    return redirect(request, tab, "error", "action");
  } catch (error) {
    if (error instanceof StaffAdminMembershipError) {
      return redirect(request, tab, "error", error.code);
    }
    if (error instanceof StaffVipMembershipError) {
      return redirect(request, tab, "error", error.code);
    }
    return redirect(request, tab, "error", "database");
  }
}
