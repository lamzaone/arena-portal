import { getAdminAccess } from "@/lib/admin/access";
import { getSession, verifyAdminActionToken } from "@/lib/auth/session";
import {
  addIdentityGroupReward,
  archiveIdentityGroup,
  assignIdentityGroup,
  attachIdentityGroupPrivilege,
  attachIdentityGroupTag,
  createIdentityChatTag,
  createIdentityGroup,
  createIdentityPrivilege,
  detachIdentityGroupPrivilege,
  detachIdentityGroupTag,
  extendIdentityGroupMembership,
  grantIdentityPlayerPrivilege,
  grantIdentityPlayerTag,
  getIdentityAdminSnapshot,
  IdentityGroupError,
  removeIdentityGroupMembership,
  retireIdentityGroupReward,
  revokeIdentityPlayerPrivilege,
  revokeIdentityPlayerTag,
  syncExternalIdentityCatalogue,
  updateIdentityChatTag,
  updateIdentityGroup,
  updateIdentityPrivilege,
  type IdentityFounderActor,
  type IdentityPrivilegeScope,
  type IdentityTradePolicy,
} from "@/lib/data/identity-groups";
import {
  createRuntimeAdminsCoreGroup,
  createRuntimeVipCoreGroup,
  ExternalGroupManagementError,
  updateRuntimeAdminsCoreGroup,
  updateRuntimeVipCoreGroup,
} from "@/lib/data/external-group-management";
import {
  getExternalIdentityGroupMemberSteamIds,
  writeStaffActionAudit,
} from "@/lib/data/portal-repository";
import { formActionRedirect } from "@/lib/form-action-response";

function redirect(
  request: Request,
  key: "notice" | "error",
  value: string,
  groupId?: string,
  tab = "connected",
) {
  const url = new URL("/admin/groups", request.url);
  url.searchParams.set(key, value);
  if (["connected", "create", "membership", "tags", "permissions", "awards"].includes(tab)) {
    url.searchParams.set("tab", tab);
  }
  if (groupId && /^\d+$/.test(groupId)) {
    url.searchParams.set("group", groupId);
    if (tab === "connected") url.hash = `group-${groupId}`;
  }
  return formActionRedirect(request, url);
}

function text(formData: FormData, key: string) {
  return String(formData.get(key) ?? "").trim();
}

function number(formData: FormData, key: string) {
  return Number.parseInt(text(formData, key), 10);
}

function bool(formData: FormData, key: string) {
  return ["1", "true", "on", "yes"].includes(
    text(formData, key).toLocaleLowerCase("en-US"),
  );
}

function returnTab(request: Request, formData: FormData) {
  const allowed = new Set([
    "connected",
    "create",
    "membership",
    "tags",
    "permissions",
    "awards",
  ]);
  const submitted = text(formData, "returnTab");
  if (allowed.has(submitted)) return submitted;
  const referer = request.headers.get("referer");
  if (referer) {
    try {
      const tab = new URL(referer).searchParams.get("tab") ?? "";
      if (allowed.has(tab)) return tab;
    } catch {
      // A malformed optional Referer does not affect mutation validation.
    }
  }
  const action = text(formData, "action");
  if (action === "group-create") return "create";
  if (action.startsWith("membership-")) return "membership";
  if (action === "tag-create" || action === "tag-update") return "tags";
  if (action === "privilege-create" || action === "privilege-update") {
    return "permissions";
  }
  if (action.startsWith("player-")) return "awards";
  return "connected";
}

export async function POST(request: Request) {
  const session = await getSession();
  if (!session) {
    return formActionRedirect(request, "/api/auth/steam");
  }
  const formData = await request.formData();
  const redirectTab = returnTab(request, formData);
  const redirectResult = (key: "notice" | "error", value: string) =>
    redirect(request, key, value, text(formData, "groupId"), redirectTab);
  if (!verifyAdminActionToken(session, text(formData, "csrf"))) {
    return redirectResult("error", "verification");
  }
  const access = await getAdminAccess(session.steamId);
  if (!access.isAdmin || !access.canManageGroups || !access.isFounder) {
    return redirectResult("error", "founder-required");
  }
  const actor: IdentityFounderActor = {
    steamId: session.steamId,
    isFounder: access.isFounder,
  };
  const action = text(formData, "action");
  const requestKey = text(formData, "requestKey");

  try {
    switch (action) {
      case "external-catalogue-sync":
        await syncExternalIdentityCatalogue({ actor, requestKey });
        return redirectResult("notice", "catalogue-synced");

      case "external-admin-group-create": {
        const result = await createRuntimeAdminsCoreGroup({
          actorSteamId: actor.steamId,
          requestKey,
          name: text(formData, "name"),
          permissions: text(formData, "permissions"),
          serverGuids: text(formData, "serverGuids"),
          immunity: text(formData, "immunity"),
        });
        await writeStaffActionAudit(
          actor.steamId,
          "identity.admins-core-group.created",
          "admins-core-group",
          result.name,
        );
        return redirectResult(
          "notice",
          result.catalogueSynced
            ? "external-admin-group-created"
            : "external-group-saved-sync-pending",
        );
      }

      case "external-admin-group-update": {
        const result = await updateRuntimeAdminsCoreGroup({
          actorSteamId: actor.steamId,
          requestKey,
          rowId: text(formData, "runtimeRowId"),
          previousName: text(formData, "previousName"),
          name: text(formData, "name"),
          permissions: text(formData, "permissions"),
          serverGuids: text(formData, "serverGuids"),
          immunity: text(formData, "immunity"),
        });
        await writeStaffActionAudit(
          actor.steamId,
          "identity.admins-core-group.updated",
          "admins-core-group",
          result.name,
        );
        return redirectResult(
          "notice",
          result.catalogueSynced
            ? "external-admin-group-updated"
            : "external-group-saved-sync-pending",
        );
      }

      case "external-vip-group-create": {
        const result = await createRuntimeVipCoreGroup({
          actorSteamId: actor.steamId,
          requestKey,
          name: text(formData, "name"),
          weight: text(formData, "weight"),
          values: text(formData, "valuesJson"),
          enabled: bool(formData, "runtimeEnabled"),
        });
        await writeStaffActionAudit(
          actor.steamId,
          "identity.vipcore-group.created",
          "vipcore-group",
          result.name,
        );
        return redirectResult(
          "notice",
          result.catalogueSynced
            ? "external-vip-group-created"
            : "external-group-saved-sync-pending",
        );
      }

      case "external-vip-group-update": {
        const result = await updateRuntimeVipCoreGroup({
          actorSteamId: actor.steamId,
          requestKey,
          previousName: text(formData, "previousName"),
          name: text(formData, "name"),
          weight: text(formData, "weight"),
          values: text(formData, "valuesJson"),
          enabled: bool(formData, "runtimeEnabled"),
        });
        await writeStaffActionAudit(
          actor.steamId,
          "identity.vipcore-group.updated",
          "vipcore-group",
          result.name,
        );
        return redirectResult(
          "notice",
          result.catalogueSynced
            ? "external-vip-group-updated"
            : "external-group-saved-sync-pending",
        );
      }

      case "group-create":
        const createdGroup = await createIdentityGroup({
          actor,
          requestKey,
          key: text(formData, "groupKey"),
          displayName: text(formData, "displayName"),
          description: text(formData, "description"),
          badgeLabel: text(formData, "badgeLabel"),
          badgeIconKey: text(formData, "badgeIconKey") || "shield",
          badgeColor: text(formData, "badgeColor"),
          badgeSoftColor: text(formData, "badgeSoftColor"),
          profilePriority: number(formData, "profilePriority"),
        });
        return redirect(
          request,
          "notice",
          "group-created",
          String(createdGroup.groupId),
          "connected",
        );

      case "group-update":
        await updateIdentityGroup({
          actor,
          requestKey,
          groupId: number(formData, "groupId"),
          displayName: text(formData, "displayName"),
          description: text(formData, "description"),
          badgeLabel: text(formData, "badgeLabel"),
          badgeIconKey: text(formData, "badgeIconKey") || "shield",
          badgeColor: text(formData, "badgeColor"),
          badgeSoftColor: text(formData, "badgeSoftColor"),
          profilePriority: number(formData, "profilePriority"),
          enabled: bool(formData, "enabled"),
        });
        return redirectResult("notice", "group-updated");

      case "group-archive":
        await archiveIdentityGroup({
          actor,
          requestKey,
          groupId: number(formData, "groupId"),
        });
        return redirectResult("notice", "group-archived");

      case "membership-assign":
        await assignIdentityGroup({
          actor,
          requestKey,
          groupId: number(formData, "groupId"),
          steamId: text(formData, "steamId"),
          durationMinutes: number(formData, "durationMinutes"),
          reason: text(formData, "reason"),
        });
        return redirectResult("notice", "membership-assigned");

      case "membership-remove":
        await removeIdentityGroupMembership({
          actor,
          requestKey,
          groupId: number(formData, "groupId"),
          steamId: text(formData, "steamId"),
        });
        return redirectResult("notice", "membership-removed");

      case "membership-extend":
        await extendIdentityGroupMembership({
          actor,
          requestKey,
          groupId: number(formData, "groupId"),
          steamId: text(formData, "steamId"),
          durationMinutes: number(formData, "durationMinutes"),
        });
        return redirectResult("notice", "membership-extended");

      case "tag-create":
        await createIdentityChatTag({
          actor,
          requestKey,
          key: text(formData, "tagKey"),
          text: text(formData, "tagText"),
          colorToken: text(formData, "colorToken"),
          nameColorToken: text(formData, "nameColorToken"),
          messageColorToken: text(formData, "messageColorToken"),
        });
        return redirectResult("notice", "tag-created");

      case "tag-update":
        await updateIdentityChatTag({
          actor,
          requestKey,
          tagId: number(formData, "tagId"),
          text: text(formData, "tagText"),
          colorToken: text(formData, "colorToken"),
          nameColorToken: text(formData, "nameColorToken"),
          messageColorToken: text(formData, "messageColorToken"),
          enabled: bool(formData, "enabled"),
        });
        return redirectResult("notice", "tag-updated");

      case "group-tag-attach":
        await attachIdentityGroupTag({
          actor,
          requestKey,
          groupId: number(formData, "groupId"),
          tagId: number(formData, "tagId"),
          sortOrder: number(formData, "sortOrder"),
        });
        return redirectResult("notice", "group-tag-attached");

      case "group-tag-detach":
        await detachIdentityGroupTag({
          actor,
          requestKey,
          groupId: number(formData, "groupId"),
          tagId: number(formData, "tagId"),
        });
        return redirectResult("notice", "group-tag-detached");

      case "player-tag-grant":
        await grantIdentityPlayerTag({
          actor,
          requestKey,
          steamId: text(formData, "steamId"),
          tagId: number(formData, "tagId"),
          durationMinutes: number(formData, "durationMinutes"),
          reason: text(formData, "reason"),
        });
        return redirectResult("notice", "player-tag-granted");

      case "player-tag-revoke":
        await revokeIdentityPlayerTag({
          actor,
          requestKey,
          steamId: text(formData, "steamId"),
          tagId: number(formData, "tagId"),
        });
        return redirectResult("notice", "player-tag-revoked");

      case "privilege-create":
        await createIdentityPrivilege({
          actor,
          requestKey,
          key: text(formData, "privilegeKey"),
          scope: text(formData, "scope") as IdentityPrivilegeScope,
          displayName: text(formData, "displayName"),
          description: text(formData, "description"),
          sensitive: bool(formData, "sensitive"),
        });
        return redirectResult("notice", "privilege-created");

      case "privilege-update":
        await updateIdentityPrivilege({
          actor,
          requestKey,
          privilegeId: number(formData, "privilegeId"),
          displayName: text(formData, "displayName"),
          description: text(formData, "description"),
          sensitive: bool(formData, "sensitive"),
          enabled: bool(formData, "enabled"),
        });
        return redirectResult("notice", "privilege-updated");

      case "group-privilege-attach":
        await attachIdentityGroupPrivilege({
          actor,
          requestKey,
          groupId: number(formData, "groupId"),
          privilegeId: number(formData, "privilegeId"),
        });
        return redirectResult("notice", "group-privilege-attached");

      case "group-privilege-detach":
        await detachIdentityGroupPrivilege({
          actor,
          requestKey,
          groupId: number(formData, "groupId"),
          privilegeId: number(formData, "privilegeId"),
        });
        return redirectResult("notice", "group-privilege-detached");

      case "player-privilege-grant":
        await grantIdentityPlayerPrivilege({
          actor,
          requestKey,
          steamId: text(formData, "steamId"),
          privilegeId: number(formData, "privilegeId"),
          durationMinutes: number(formData, "durationMinutes"),
          reason: text(formData, "reason"),
        });
        return redirectResult("notice", "player-privilege-granted");

      case "player-privilege-revoke":
        await revokeIdentityPlayerPrivilege({
          actor,
          requestKey,
          steamId: text(formData, "steamId"),
          privilegeId: number(formData, "privilegeId"),
        });
        return redirectResult("notice", "player-privilege-revoked");

      case "reward-add":
        const rewardGroupId = number(formData, "groupId");
        const rewardGroup = (await getIdentityAdminSnapshot()).groups.find(
          (group) => group.id === rewardGroupId,
        );
        const trustedExternalMemberSteamIds =
          rewardGroup?.sourceType === "admins_core" ||
          rewardGroup?.sourceType === "vipcore"
            ? await getExternalIdentityGroupMemberSteamIds({
                sourceType: rewardGroup.sourceType,
                externalKey: rewardGroup.externalKey ?? "",
              })
            : [];
        await addIdentityGroupReward({
          actor,
          requestKey,
          groupId: rewardGroupId,
          catalogueId: number(formData, "catalogueId"),
          quantity: number(formData, "quantity"),
          tradePolicy: text(formData, "tradePolicy") as IdentityTradePolicy,
          trustedExternalMemberSteamIds,
        });
        return redirectResult("notice", "reward-added");

      case "reward-retire":
        await retireIdentityGroupReward({
          actor,
          requestKey,
          rewardId: number(formData, "rewardId"),
        });
        return redirectResult("notice", "reward-retired");

      default:
        return redirectResult("error", "action");
    }
  } catch (error) {
    if (error instanceof IdentityGroupError) {
      return redirectResult("error", error.code);
    }
    if (error instanceof ExternalGroupManagementError) {
      return redirectResult("error", error.code);
    }
    return redirectResult("error", "database");
  }
}
