import { canActOnTarget, getAdminAccess } from "@/lib/admin/access";
import { getSession, verifyAdminActionToken } from "@/lib/auth/session";
import { addStaffCaseReply, enqueueStaffUnban, getStaffAppealTarget, getStaffTicketTarget, writeStaffActionAudit } from "@/lib/data/portal-repository";
import { formActionRedirect } from "@/lib/form-action-response";
import { parseCasePriority } from "@/lib/cases/priority";
import { setStaffCasePriority } from "@/lib/cases/priority-repository";

const allowedImageTypes = new Set(["image/jpeg", "image/png", "image/webp"]);
const maxScreenshotBytes = 5 * 1024 * 1024;

function redirect(request: Request, tab: "appeals" | "tickets", key: "notice" | "error", value: string) {
  const url = new URL(`/admin/${tab}`, request.url);
  url.searchParams.set(key, value);
  return formActionRedirect(request, url);
}

function parseCaseId(value: FormDataEntryValue | null) {
  const raw = String(value ?? "");
  if (!/^\d+$/.test(raw)) return null;
  const id = Number(raw);
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
  if (!["appeal-reply", "appeal-close-banned", "appeal-close-unbanned", "appeal-priority", "ticket-reply", "ticket-close-solved", "ticket-close-unsolved", "ticket-priority"].includes(action)) return redirect(request, tab, "error", "case");
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

      if (action === "appeal-priority") {
        const priority = parseCasePriority(formData.get("priority"));
        if (!priority) return redirect(request, "appeals", "error", "priority");
        await setStaffCasePriority({ caseType: "appeal", caseId, priority, actorSteamId: actor.steamId });
        return redirect(request, "appeals", "notice", "priority-saved");
      }

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
    if (action === "ticket-priority") {
      const priority = parseCasePriority(formData.get("priority"));
      if (!priority) return redirect(request, "tickets", "error", "priority");
      await setStaffCasePriority({ caseType: "ticket", caseId, priority, actorSteamId: actor.steamId });
      return redirect(request, "tickets", "notice", "priority-saved");
    }
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
    const reason = error instanceof Error && ["screenshot", "priority-storage", "case"].includes(error.message) ? error.message : "database";
    return redirect(request, tab, "error", reason);
  }
}
