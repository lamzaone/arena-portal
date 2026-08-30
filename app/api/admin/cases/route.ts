import { canActOnTarget, getAdminAccess } from "@/lib/admin/access";
import { getSession, verifyAdminActionToken } from "@/lib/auth/session";
import { addStaffCaseReply, enqueueStaffUnban, getStaffAppealTarget, getStaffTicketTarget, writeStaffActionAudit } from "@/lib/data/portal-repository";
import { formActionRedirect } from "@/lib/form-action-response";

const allowedImageTypes = new Set(["image/jpeg", "image/png", "image/webp"]);
const maxScreenshotBytes = 5 * 1024 * 1024;

function redirect(request: Request, tab: "appeals" | "tickets", key: "notice" | "error", value: string) {
  const url = new URL("/admin", request.url);
  url.searchParams.set("tab", tab);
  url.searchParams.set(key, value);
  return formActionRedirect(request, url);
}

function parseCaseId(value: FormDataEntryValue | null) {
  const id = Number.parseInt(String(value ?? ""), 10);
  return Number.isSafeInteger(id) && id > 0 ? id : null;
}

async function getScreenshot(value: FormDataEntryValue | null) {
  if (!(value instanceof File) || value.size === 0) return undefined;
  if (value.size > maxScreenshotBytes || !allowedImageTypes.has(value.type)) throw new Error("screenshot");
  const fileName = value.name.replace(/[^a-zA-Z0-9._-]/g, "_").slice(0, 180) || "screenshot";
  return { fileName, contentType: value.type, data: Buffer.from(await value.arrayBuffer()) };
}

export async function POST(request: Request) {
  const session = await getSession();
  if (!session) return formActionRedirect(request, "/api/auth/steam");

  const formData = await request.formData();
  const action = String(formData.get("action") ?? "");
  const tab = action.startsWith("ticket-") ? "tickets" : "appeals";
  if (!verifyAdminActionToken(session, String(formData.get("csrf") ?? ""))) return redirect(request, tab, "error", "verification");

  const actor = await getAdminAccess(session.steamId);
  if (!actor.isAdmin) return redirect(request, tab, "error", "forbidden");
  const caseId = parseCaseId(formData.get("caseId"));
  if (!caseId) return redirect(request, tab, "error", "case");
  const body = String(formData.get("body") ?? "").trim();
  if (body.length > 5_000) return redirect(request, tab, "error", "message");

  try {
    const screenshot = await getScreenshot(formData.get("screenshot"));
    if (action.startsWith("appeal-")) {
      if (!actor.canUnban) return redirect(request, "appeals", "error", "unban-permission");
      const appeal = await getStaffAppealTarget(caseId);
      if (!appeal) return redirect(request, "appeals", "error", "case");
      const target = await getAdminAccess(appeal.steamId);
      if (target.isAdmin && !canActOnTarget(actor, target)) return redirect(request, "appeals", "error", "immunity");

      if (action === "appeal-close-unbanned") {
        await enqueueStaffUnban({ steamId: appeal.steamId, actorSteamId: actor.steamId, actorName: actor.displayName });
        await addStaffCaseReply({ caseType: "appeal", caseId, actorSteamId: actor.steamId, body, status: "closed-unbanned", screenshot });
        await writeStaffActionAudit(actor.steamId, "staff.appeal.closed-unbanned", "appeal", String(caseId));
        return redirect(request, "appeals", "notice", "appeal-unbanned");
      }
      if (action === "appeal-close-banned") {
        await addStaffCaseReply({ caseType: "appeal", caseId, actorSteamId: actor.steamId, body, status: "closed-banned", screenshot });
        await writeStaffActionAudit(actor.steamId, "staff.appeal.closed-banned", "appeal", String(caseId));
        return redirect(request, "appeals", "notice", "appeal-banned");
      }
      if (action === "appeal-reply" && (body.length > 0 || screenshot)) {
        await addStaffCaseReply({ caseType: "appeal", caseId, actorSteamId: actor.steamId, body, screenshot });
        return redirect(request, "appeals", "notice", "appeal-replied");
      }
      return redirect(request, "appeals", "error", "message");
    }

    const ticket = await getStaffTicketTarget(caseId);
    if (!ticket) return redirect(request, "tickets", "error", "case");
    if (action === "ticket-close-solved") {
      await addStaffCaseReply({ caseType: "ticket", caseId, actorSteamId: actor.steamId, body, status: "solved", screenshot });
      await writeStaffActionAudit(actor.steamId, "staff.ticket.solved", "ticket", String(caseId));
      return redirect(request, "tickets", "notice", "ticket-solved");
    }
    if (action === "ticket-close-unsolved") {
      await addStaffCaseReply({ caseType: "ticket", caseId, actorSteamId: actor.steamId, body, status: "unsolved", screenshot });
      await writeStaffActionAudit(actor.steamId, "staff.ticket.unsolved", "ticket", String(caseId));
      return redirect(request, "tickets", "notice", "ticket-unsolved");
    }
    if (action === "ticket-reply" && (body.length > 0 || screenshot)) {
      await addStaffCaseReply({ caseType: "ticket", caseId, actorSteamId: actor.steamId, body, screenshot });
      return redirect(request, "tickets", "notice", "ticket-replied");
    }
    return redirect(request, "tickets", "error", "message");
  } catch (error) {
    return redirect(request, tab, "error", error instanceof Error && error.message === "screenshot" ? "screenshot" : "database");
  }
}
