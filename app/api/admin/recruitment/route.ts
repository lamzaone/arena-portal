import { getAdminAccess } from "@/lib/admin/access";
import { getSession, verifyAdminActionToken } from "@/lib/auth/session";
import { formActionRedirect } from "@/lib/form-action-response";
import { recruitmentErrorCode, staffRecruitmentRepository } from "@/lib/recruitment/service";

export async function POST(request: Request) {
  const session = await getSession();
  if (!session) return formActionRedirect(request, "/api/auth/steam");
  let destination = "/admin/recruitment";
  const redirect = (key: "notice" | "error", code: string) => formActionRedirect(request, `${destination}?${key}=${encodeURIComponent(code)}${destination === "/staff" ? "#recruitment" : ""}`);
  try {
    const form = await request.formData();
    if (form.get("returnTo") === "/staff") destination = "/staff";
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
      await repository.review(String(form.get("id") ?? ""), String(form.get("status") ?? ""), session.steamId);
      return redirect("notice", "reviewed");
    }
    return redirect("error", "application-details");
  } catch (error) { return redirect("error", recruitmentErrorCode(error)); }
}
