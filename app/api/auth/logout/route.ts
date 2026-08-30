import { COOKIE_NAME, revokeCurrentSession, sessionCookieOptions } from "@/lib/auth/session";
import { formActionRedirect } from "@/lib/form-action-response";

export async function POST(request: Request) {
  await revokeCurrentSession();
  const response = formActionRedirect(request, "/", {
    replace: true,
    refresh: true,
  });
  response.cookies.set(COOKIE_NAME, "", { ...sessionCookieOptions(), maxAge: 0 });
  return response;
}
