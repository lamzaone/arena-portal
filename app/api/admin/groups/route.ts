import { NextResponse } from "next/server";

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
import { getExternalIdentityGroupMemberSteamIds } from "@/lib/data/portal-repository";

function redirect(
  request: Request,
  key: "notice" | "error",
  value: string,
) {
  const url = new URL("/admin/groups", request.url);
  url.searchParams.set(key, value);
  return NextResponse.redirect(url, 303);
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

export async function POST(request: Request) {
  const session = await getSession();
  if (!session) {
    return NextResponse.redirect(new URL("/api/auth/steam", request.url), 303);
  }
  const formData = await request.formData();
  if (!verifyAdminActionToken(session, text(formData, "csrf"))) {
    return redirect(request, "error", "verification");
  }
  const access = await getAdminAccess(session.steamId);
  if (!access.isAdmin || !access.canManageGroups || !access.isFounder) {
    return redirect(request, "error", "founder-required");
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
        return redirect(request, "notice", "catalogue-synced");

      case "group-create":
        await createIdentityGroup({
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
        return redirect(request, "notice", "group-created");

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
        return redirect(request, "notice", "group-updated");

      case "group-archive":
        await archiveIdentityGroup({
          actor,
          requestKey,
          groupId: number(formData, "groupId"),
        });
        return redirect(request, "notice", "group-archived");

      case "membership-assign":
        await assignIdentityGroup({
          actor,
          requestKey,
          groupId: number(formData, "groupId"),
          steamId: text(formData, "steamId"),
          durationMinutes: number(formData, "durationMinutes"),
          reason: text(formData, "reason"),
        });
        return redirect(request, "notice", "membership-assigned");

      case "membership-remove":
        await removeIdentityGroupMembership({
          actor,
          requestKey,
          groupId: number(formData, "groupId"),
          steamId: text(formData, "steamId"),
        });
        return redirect(request, "notice", "membership-removed");

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
        return redirect(request, "notice", "tag-created");

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
        return redirect(request, "notice", "tag-updated");

      case "group-tag-attach":
        await attachIdentityGroupTag({
          actor,
          requestKey,
          groupId: number(formData, "groupId"),
          tagId: number(formData, "tagId"),
          sortOrder: number(formData, "sortOrder"),
        });
        return redirect(request, "notice", "group-tag-attached");

      case "group-tag-detach":
        await detachIdentityGroupTag({
          actor,
          requestKey,
          groupId: number(formData, "groupId"),
          tagId: number(formData, "tagId"),
        });
        return redirect(request, "notice", "group-tag-detached");

      case "player-tag-grant":
        await grantIdentityPlayerTag({
          actor,
          requestKey,
          steamId: text(formData, "steamId"),
          tagId: number(formData, "tagId"),
          durationMinutes: number(formData, "durationMinutes"),
          reason: text(formData, "reason"),
        });
        return redirect(request, "notice", "player-tag-granted");

      case "player-tag-revoke":
        await revokeIdentityPlayerTag({
          actor,
          requestKey,
          steamId: text(formData, "steamId"),
          tagId: number(formData, "tagId"),
        });
        return redirect(request, "notice", "player-tag-revoked");

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
        return redirect(request, "notice", "privilege-created");

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
        return redirect(request, "notice", "privilege-updated");

      case "group-privilege-attach":
        await attachIdentityGroupPrivilege({
          actor,
          requestKey,
          groupId: number(formData, "groupId"),
          privilegeId: number(formData, "privilegeId"),
        });
        return redirect(request, "notice", "group-privilege-attached");

      case "group-privilege-detach":
        await detachIdentityGroupPrivilege({
          actor,
          requestKey,
          groupId: number(formData, "groupId"),
          privilegeId: number(formData, "privilegeId"),
        });
        return redirect(request, "notice", "group-privilege-detached");

      case "player-privilege-grant":
        await grantIdentityPlayerPrivilege({
          actor,
          requestKey,
          steamId: text(formData, "steamId"),
          privilegeId: number(formData, "privilegeId"),
          durationMinutes: number(formData, "durationMinutes"),
          reason: text(formData, "reason"),
        });
        return redirect(request, "notice", "player-privilege-granted");

      case "player-privilege-revoke":
        await revokeIdentityPlayerPrivilege({
          actor,
          requestKey,
          steamId: text(formData, "steamId"),
          privilegeId: number(formData, "privilegeId"),
        });
        return redirect(request, "notice", "player-privilege-revoked");

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
        return redirect(request, "notice", "reward-added");

      case "reward-retire":
        await retireIdentityGroupReward({
          actor,
          requestKey,
          rewardId: number(formData, "rewardId"),
        });
        return redirect(request, "notice", "reward-retired");

      default:
        return redirect(request, "error", "action");
    }
  } catch (error) {
    if (error instanceof IdentityGroupError) {
      return redirect(request, "error", error.code);
    }
    return redirect(request, "error", "database");
  }
}
