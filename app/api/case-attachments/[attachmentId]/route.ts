import { NextResponse } from "next/server";

import { getAdminAccess } from "@/lib/admin/access";
import { getSession } from "@/lib/auth/session";
import { getCaseAttachment } from "@/lib/data/portal-repository";

type AttachmentRouteProps = { params: Promise<{ attachmentId: string }> };

export async function GET(_request: Request, { params }: AttachmentRouteProps) {
  const session = await getSession();
  if (!session) return new NextResponse("Unauthorized", { status: 401 });
  const { attachmentId: rawAttachmentId } = await params;
  const attachmentId = Number.parseInt(rawAttachmentId, 10);
  if (!Number.isSafeInteger(attachmentId) || attachmentId <= 0) return new NextResponse("Not found", { status: 404 });

  const attachment = await getCaseAttachment(attachmentId);
  if (!attachment) return new NextResponse("Not found", { status: 404 });
  const access = session.steamId === attachment.ownerSteamId ? null : await getAdminAccess(session.steamId);
  const mayView = session.steamId === attachment.ownerSteamId || (attachment.caseType === "appeal" ? access?.canUnban : access?.isAdmin);
  if (!mayView) return new NextResponse("Forbidden", { status: 403 });

  const safeFileName = attachment.fileName.replace(/[\\"\r\n]/g, "_");
  return new NextResponse(new Uint8Array(attachment.data), {
    headers: {
      "Content-Type": attachment.contentType,
      "Content-Disposition": `inline; filename="${safeFileName}"`,
      "Cache-Control": "private, max-age=3600",
      "X-Content-Type-Options": "nosniff"
    }
  });
}
