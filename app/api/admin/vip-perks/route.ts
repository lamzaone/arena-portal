import { NextResponse } from "next/server";

import { getAdminAccess } from "@/lib/admin/access";
import { getSession, verifyAdminActionToken } from "@/lib/auth/session";
import {
  createVipPerk,
  grantVipPerkToGroup,
  grantVipPerkToPlayer,
  retireVipPerkOffer,
  revokeVipPerkGrant,
  saveVipPerkOffer,
  updateVipPerk,
  VipPerkError,
  type VipPerkActor,
} from "@/lib/data/vip-perks";

function value(formData: FormData, name: string) {
  return String(formData.get(name) ?? "").trim();
}

function number(formData: FormData, name: string) {
  return Number.parseInt(value(formData, name), 10);
}

function bool(formData: FormData, name: string) {
  return ["1", "true", "on", "yes"].includes(value(formData, name).toLocaleLowerCase("en-US"));
}

function actionView(action: string) {
  if (action === "player-grant" || action === "group-grant") return "assign";
  if (action === "offer-save" || action === "offer-retire") return "offers";
  if (action === "grant-revoke") return "active";
  return "definitions";
}

function redirect(request: Request, kind: "notice" | "error", message: string, view = "definitions") {
  const offerView = view === "offers";
  const url = new URL(offerView ? "/admin/groups/listings" : "/admin/groups/perks", request.url);
  url.searchParams.set("view", offerView ? "perks" : view);
  url.searchParams.set(kind, message);
  return NextResponse.redirect(url, 303);
}

export async function POST(request: Request) {
  const session = await getSession();
  if (!session) return NextResponse.redirect(new URL("/api/auth/steam", request.url), 303);
  const formData = await request.formData();
  const action = value(formData, "action");
  const returnView = actionView(action);
  if (!verifyAdminActionToken(session, value(formData, "csrf"))) return redirect(request, "error", "verification", returnView);
  const access = await getAdminAccess(session.steamId);
  if (!access.isFounder || !access.canManageGroups) return redirect(request, "error", "founder-required", returnView);
  const actor: VipPerkActor = { steamId: session.steamId, isFounder: access.isFounder };
  const requestKey = value(formData, "requestKey");

  try {
    switch (action) {
      case "perk-create":
        await createVipPerk({
          actor,
          requestKey,
          key: value(formData, "perkKey"),
          displayName: value(formData, "displayName"),
          description: value(formData, "description"),
          category: value(formData, "category"),
          configuration: value(formData, "configuration"),
        });
        return redirect(request, "notice", "perk-created", returnView);
      case "perk-update":
        await updateVipPerk({
          actor,
          requestKey,
          perkId: number(formData, "perkId"),
          displayName: value(formData, "displayName"),
          description: value(formData, "description"),
          category: value(formData, "category"),
          configuration: value(formData, "configuration"),
          enabled: bool(formData, "enabled"),
        });
        return redirect(request, "notice", "perk-updated", returnView);
      case "player-grant":
        await grantVipPerkToPlayer({
          actor,
          requestKey,
          perkId: number(formData, "perkId"),
          steamId: value(formData, "steamId"),
          durationMinutes: number(formData, "durationMinutes"),
          reason: value(formData, "reason"),
          configurationOverride: value(formData, "configurationOverride"),
        });
        return redirect(request, "notice", "player-granted", returnView);
      case "group-grant":
        await grantVipPerkToGroup({
          actor,
          requestKey,
          perkId: number(formData, "perkId"),
          groupId: number(formData, "groupId"),
          durationMinutes: number(formData, "durationMinutes"),
          reason: value(formData, "reason"),
          configurationOverride: value(formData, "configurationOverride"),
        });
        return redirect(request, "notice", "group-granted", returnView);
      case "grant-revoke":
        await revokeVipPerkGrant({
          actor,
          requestKey,
          grantType: value(formData, "grantType") === "group" ? "group" : "player",
          grantId: number(formData, "grantId"),
        });
        return redirect(request, "notice", "grant-revoked", returnView);
      case "offer-save":
        await saveVipPerkOffer({
          actor,
          requestKey,
          perkId: number(formData, "perkId"),
          tokenPrice: number(formData, "tokenPrice"),
          durationMinutes: number(formData, "durationMinutes"),
        });
        return redirect(request, "notice", "offer-saved", returnView);
      case "offer-retire":
        await retireVipPerkOffer({
          actor,
          requestKey,
          offerId: number(formData, "offerId"),
        });
        return redirect(request, "notice", "offer-retired", returnView);
      default:
        return redirect(request, "error", "unknown-action", returnView);
    }
  } catch (error) {
    if (error instanceof VipPerkError) return redirect(request, "error", error.code, returnView);
    console.error("VIP perk admin mutation failed", error);
    return redirect(request, "error", "storage", returnView);
  }
}
