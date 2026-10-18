import { getAdminAccess } from "@/lib/admin/access";
import { getSession, verifyAdminActionToken } from "@/lib/auth/session";
import { normalizeRecruitmentFilters, type RecruitmentFilters } from "@/lib/data/staff-recruitment";
import { formActionRedirect } from "@/lib/form-action-response";
import { recruitmentErrorCode, staffRecruitmentRepository } from "@/lib/recruitment/service";

export async function POST(request: Request) {
  const session = await getSession();
  if (!session) return formActionRedirect(request, "/api/auth/steam");
  let destination = "/admin/recruitment";
  let filters: RecruitmentFilters = { name: "", status: "all" };
  let page = 1;
  const redirect = (key: "notice" | "error", code: string) => {
    const parameters = new URLSearchParams();
    if (destination === "/admin/recruitment") {
      if (filters.name) parameters.set("name", filters.name);
      if (filters.status !== "all") parameters.set("status", filters.status);
      if (page > 1) parameters.set("page", String(page));
    }
    parameters.set(key, code);
    return formActionRedirect(request, `${destination}?${parameters.toString()}${destination === "/staff" ? "#recruitment" : ""}`);
  };
  try {
    const form = await request.formData();
    if (form.get("returnTo") === "/staff") destination = "/staff";
    const returnName = form.get("returnName");
    const returnStatus = form.get("returnStatus");
    filters = normalizeRecruitmentFilters({ name: typeof returnName === "string" ? returnName : undefined, status: typeof returnStatus === "string" ? returnStatus : undefined });
    const returnPage = form.get("returnPage");
    const requestedPage = typeof returnPage === "string" ? Number(returnPage) : 1;
    page = Number.isSafeInteger(requestedPage) && requestedPage > 0 ? requestedPage : 1;
    if (!verifyAdminActionToken(session, String(form.get("csrf") ?? ""))) return redirect("error", "verification");
    const actor = await getAdminAccess(session.steamId);
    if (!actor.isAdmin) return redirect("error", "forbidden");
    const repository = staffRecruitmentRepository();
    if (form.get("action") === "set-open") {
      const open = String(form.get("open") ?? "");
      if (open !== "yes" && open !== "no") return redirect("error", "application-details");
      await repository.setOpen(open === "yes", session.steamId);
      return redirect("notice", "updated");
    }
    if (form.get("action") === "review") {
      const response = form.get("response");
      if (response !== null && typeof response !== "string") return redirect("error", "application-response");
      await repository.review(String(form.get("id") ?? ""), String(form.get("status") ?? ""), session.steamId, response === null ? undefined : response);
      return redirect("notice", "reviewed");
    }
    return redirect("error", "application-details");
  } catch (error) { return redirect("error", recruitmentErrorCode(error)); }
}
