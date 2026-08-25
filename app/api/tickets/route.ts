import { NextResponse } from "next/server";

import { getSession } from "@/lib/auth/session";
import { createTicket } from "@/lib/data/portal-repository";

const categories = new Set(["player-report", "admin-report", "bug", "account", "other"]);

export async function POST(request: Request) {
  const session = await getSession();
  if (!session) return NextResponse.redirect(new URL("/api/auth/steam", request.url), 303);

  const formData = await request.formData();
  const category = String(formData.get("category") ?? "");
  const subject = String(formData.get("subject") ?? "").trim();
  const body = String(formData.get("body") ?? "").trim();
  if (!categories.has(category) || subject.length < 4 || subject.length > 120 || body.length < 10 || body.length > 5_000) {
    return NextResponse.redirect(new URL("/tickets?error=validation", request.url), 303);
  }

  try {
    await createTicket(session.steamId, category, subject, body);
    return NextResponse.redirect(new URL("/tickets?submitted=1", request.url), 303);
  } catch {
    return NextResponse.redirect(new URL("/tickets?error=storage", request.url), 303);
  }
}
