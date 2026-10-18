import { getSession, verifyProfileActionToken } from "@/lib/auth/session";
import { formActionRedirect } from "@/lib/form-action-response";
import { readRecruitmentPlaytime, recruitmentErrorCode, staffRecruitmentRepository } from "@/lib/recruitment/service";

export async function POST(request: Request) {
  const session = await getSession();
  if (!session) return formActionRedirect(request, "/api/auth/steam");
  const redirect = (key: "notice" | "error", code: string) => formActionRedirect(request, `/staff?${key}=${encodeURIComponent(code)}#recruitment`);
  try {
    const form = await request.formData();
    if (!verifyProfileActionToken(session, String(form.get("csrf") ?? ""))) return redirect("error", "verification");
    await staffRecruitmentRepository().submit({
      steamId: session.steamId,
      nickname: String(form.get("nickname") ?? ""),
      age: String(form.get("age") ?? ""),
      discordProfile: String(form.get("discordProfile") ?? ""),
      steamGroupMember: String(form.get("steamGroupMember") ?? ""),
      reason: String(form.get("reason") ?? ""),
      // Ignore client-supplied playtime, Steam IDs, and verification flags.
      playtimeSeconds: await readRecruitmentPlaytime(session.steamId),
    });
    return redirect("notice", "submitted");
  } catch (error) { return redirect("error", recruitmentErrorCode(error)); }
}
