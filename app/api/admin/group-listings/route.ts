import { NextResponse } from "next/server";

import { getAdminAccess } from "@/lib/admin/access";
import { getSession, verifyAdminActionToken } from "@/lib/auth/session";
import {
  createIdentityGroupListing,
  IdentityGroupListingError,
  updateIdentityGroupListing,
  type GroupListingActor,
} from "@/lib/data/identity-group-listings";

function value(formData: FormData, name: string) {
  return String(formData.get(name) ?? "").trim();
}

function integer(formData: FormData, name: string) {
  const raw = value(formData, name);
  if (!/^-?\d+$/.test(raw)) return Number.NaN;
  const parsed = Number(raw);
  return Number.isSafeInteger(parsed) ? parsed : Number.NaN;
}

function bool(formData: FormData, name: string) {
  return ["1", "true", "on", "yes"].includes(
    value(formData, name).toLocaleLowerCase("en-US"),
  );
}

function euroCents(formData: FormData, name: string) {
  const raw = value(formData, name).replace(",", ".");
  if (!/^\d{1,8}(?:\.\d{1,2})?$/.test(raw)) return Number.NaN;
  const [euros, fraction = ""] = raw.split(".");
  const cents = Number(euros) * 100 + Number(fraction.padEnd(2, "0"));
  return Number.isSafeInteger(cents) ? cents : Number.NaN;
}

function redirect(
  request: Request,
  kind: "notice" | "error",
  message: string,
  listingId?: number,
) {
  const url = new URL("/admin/groups/listings", request.url);
  url.searchParams.set("view", "memberships");
  url.searchParams.set(kind, message);
  if (Number.isSafeInteger(listingId) && Number(listingId) > 0) {
    url.searchParams.set("listing", String(listingId));
    url.hash = `listing-${listingId}`;
  }
  return NextResponse.redirect(url, 303);
}

export async function POST(request: Request) {
  const session = await getSession();
  if (!session) {
    return NextResponse.redirect(new URL("/api/auth/steam", request.url), 303);
  }

  const formData = await request.formData();
  const listingId = integer(formData, "listingId");
  if (!verifyAdminActionToken(session, value(formData, "csrf"))) {
    return redirect(request, "error", "verification", listingId);
  }

  const access = await getAdminAccess(session.steamId);
  if (!access.isFounder || !access.canManageGroups) {
    return redirect(request, "error", "founder-required", listingId);
  }

  const actor: GroupListingActor = {
    steamId: session.steamId,
    isFounder: access.isFounder,
  };
  const shared = {
    actor,
    requestKey: value(formData, "requestKey"),
    listingName: value(formData, "listingName"),
    description: value(formData, "description"),
    durationMinutes: integer(formData, "durationMinutes"),
    euroPriceCents: euroCents(formData, "euroPrice"),
    tokenPrice: integer(formData, "tokenPrice"),
    vipPageEnabled: bool(formData, "vipPageEnabled"),
    marketEnabled: bool(formData, "marketEnabled"),
    enabled: bool(formData, "enabled"),
    sortOrder: integer(formData, "sortOrder"),
    confirmStaffAccess: bool(formData, "confirmStaffAccess"),
  };

  try {
    switch (value(formData, "action")) {
      case "listing-create": {
        const result = await createIdentityGroupListing({
          ...shared,
          groupId: integer(formData, "groupId"),
        });
        return redirect(request, "notice", "listing-created", result.listingId);
      }
      case "listing-update":
        await updateIdentityGroupListing({ ...shared, listingId });
        return redirect(request, "notice", "listing-updated", listingId);
      default:
        return redirect(request, "error", "unknown-action", listingId);
    }
  } catch (error) {
    if (error instanceof IdentityGroupListingError) {
      return redirect(request, "error", error.code, listingId);
    }
    console.error("Identity group listing mutation failed", error);
    return redirect(request, "error", "storage", listingId);
  }
}
