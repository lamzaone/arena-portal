import { NextResponse } from "next/server";

import { parseCaseScreenshots } from "@/lib/cases/evidence";
import { getSession } from "@/lib/auth/session";
import { addPlayerCaseReply, createTicket, getPlayerCaseTarget } from "@/lib/data/portal-repository";

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

function isClosedTicket(status: string) {
  return ["solved", "unsolved", "closed"].includes(status);
}

export async function POST(request: Request) {
  const session = await getSession();
  if (!session) return NextResponse.redirect(new URL("/api/auth/steam", request.url), 303);

  const formData = await request.formData();
  const action = String(formData.get("action") ?? "create");
  const body = String(formData.get("body") ?? "").trim();

  try {
    const screenshots = await parseCaseScreenshots(formData);
    if (action === "reply") {
      const caseId = parseCaseId(formData.get("caseId"));
      if (!caseId || (!body && !screenshots.length)) return redirect(request, "error", "validation");
      const ticket = await getPlayerCaseTarget("ticket", caseId, session.steamId);
      if (!ticket) return redirect(request, "error", "case");
      if (isClosedTicket(ticket.status)) return redirect(request, "error", "closed");
      await addPlayerCaseReply({ caseType: "ticket", caseId, steamId: session.steamId, body, screenshots });
      return redirect(request, "replied");
    }

    const category = String(formData.get("category") ?? "");
    const subject = String(formData.get("subject") ?? "").trim();
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
