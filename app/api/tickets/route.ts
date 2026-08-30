import { NextResponse } from "next/server";

import { parseCaseScreenshots } from "@/lib/cases/evidence";
import { getSession } from "@/lib/auth/session";
import { getIdentityGroupListing } from "@/lib/data/identity-group-listings";
import { addPlayerCaseReply, createTicket, getPlayerCaseTarget } from "@/lib/data/portal-repository";
import {
  identityGroupListingRequestCopy,
  isPublishedDonationListing,
} from "@/lib/identity-group-listing-presentation";

const categories = new Set(["player-report", "admin-report", "bug", "account", "vip", "other"]);

function redirect(request: Request, key: "submitted" | "replied" | "error", value = "1") {
  const url = new URL("/tickets", request.url);
  url.searchParams.set(key, value);
  return NextResponse.redirect(url, 303);
}

function parseCaseId(value: FormDataEntryValue | null) {
  const id = Number.parseInt(String(value ?? ""), 10);
  return Number.isSafeInteger(id) && id > 0 ? id : null;
}

function parseListingId(value: FormDataEntryValue | null) {
  const raw = String(value ?? "").trim();
  if (!/^\d{1,18}$/.test(raw)) return null;
  const id = Number(raw);
  return Number.isSafeInteger(id) && id > 0 ? id : null;
}

function isClosedTicket(status: string) {
  return ["solved", "unsolved", "closed"].includes(status);
}

export async function POST(request: Request) {
  const session = await getSession();
  if (!session) return NextResponse.redirect(new URL("/api/auth/steam", request.url), 303);

  const formData = await request.formData();
  const action = String(formData.get("action") ?? "create");
  const submittedBody = String(formData.get("body") ?? "").trim();

  try {
    const screenshots = await parseCaseScreenshots(formData);
    if (action === "reply") {
      const caseId = parseCaseId(formData.get("caseId"));
      if (!caseId || (!submittedBody && !screenshots.length)) return redirect(request, "error", "validation");
      const ticket = await getPlayerCaseTarget("ticket", caseId, session.steamId);
      if (!ticket) return redirect(request, "error", "case");
      if (isClosedTicket(ticket.status)) return redirect(request, "error", "closed");
      await addPlayerCaseReply({ caseType: "ticket", caseId, steamId: session.steamId, body: submittedBody, screenshots });
      return redirect(request, "replied");
    }

    let category = String(formData.get("category") ?? "");
    let subject = String(formData.get("subject") ?? "").trim();
    let body = submittedBody;
    if (formData.has("listingId")) {
      const requestedListingId = parseListingId(formData.get("listingId"));
      if (!requestedListingId) return redirect(request, "error", "listing");
      const listing = await getIdentityGroupListing(requestedListingId);
      if (!listing || !isPublishedDonationListing(listing)) {
        return redirect(request, "error", "listing");
      }
      const canonical = identityGroupListingRequestCopy(listing);
      category = "vip";
      subject = canonical.subject;
      body = canonical.body;
    }
    if (!categories.has(category) || subject.length < 4 || subject.length > 120 || body.length < 10 || body.length > 5_000) {
      return redirect(request, "error", "validation");
    }
    await createTicket({ steamId: session.steamId, category, subject, body, screenshots });
    return redirect(request, "submitted");
  } catch (error) {
    const reason = error instanceof Error && ["screenshot", "too-many-screenshots"].includes(error.message) ? "screenshot" : "storage";
    return redirect(request, "error", reason);
  }
}
