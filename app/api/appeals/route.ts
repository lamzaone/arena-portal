import { NextResponse } from "next/server";

import { parseCaseScreenshots } from "@/lib/cases/evidence";
import { getSession } from "@/lib/auth/session";
import { addPlayerCaseReply, createAppeal, getAppealEligibility, getPlayerCaseTarget, getPlayerDashboard } from "@/lib/data/portal-repository";

function hasActiveBan(expiresAt: number) {
  return expiresAt === 0 || expiresAt > Math.floor(Date.now() / 1_000);
}

function redirect(request: Request, key: "submitted" | "replied" | "error", value = "1") {
  const url = new URL("/appeals", request.url);
  url.searchParams.set(key, value);
  return NextResponse.redirect(url, 303);
}

function parseCaseId(value: FormDataEntryValue | null) {
  const id = Number.parseInt(String(value ?? ""), 10);
  return Number.isSafeInteger(id) && id > 0 ? id : null;
}

function isClosedAppeal(status: string) {
  return ["closed-banned", "closed-unbanned", "closed"].includes(status);
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
      const appeal = await getPlayerCaseTarget("appeal", caseId, session.steamId);
      if (!appeal) return redirect(request, "error", "case");
      if (isClosedAppeal(appeal.status)) return redirect(request, "error", "closed");
      await addPlayerCaseReply({ caseType: "appeal", caseId, steamId: session.steamId, body, screenshots });
      return redirect(request, "replied");
    }

    if (body.length < 20 || body.length > 5_000) return redirect(request, "error", "validation");
    const dashboard = await getPlayerDashboard(session.steamId);
    const activeBan = dashboard.bans.find((ban) => hasActiveBan(ban.expiresAt));
    if (!activeBan) return redirect(request, "error", "not-banned");
    const eligibility = await getAppealEligibility(session.steamId, activeBan.id);
    if (!eligibility.eligible) return redirect(request, "error", "cooldown");
    await createAppeal({ steamId: session.steamId, banId: activeBan.id, body, screenshots });
    return redirect(request, "submitted");
  } catch (error) {
    const reason = error instanceof Error && ["screenshot", "too-many-screenshots"].includes(error.message) ? "screenshot" : "storage";
    return redirect(request, "error", reason);
  }
}
