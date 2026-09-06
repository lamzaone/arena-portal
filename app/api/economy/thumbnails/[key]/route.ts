import { getSessionIdentity } from "@/lib/auth/session-identity";
import { weaponThumbnailCache } from "@/lib/economy/thumbnail-service";

export const runtime = "nodejs";
export async function GET(request: Request, { params }: { params: Promise<{ key: string }> }) {
  if (!await getSessionIdentity()) return new Response(null, { status: 401 });
  const { key } = await params;
  if (!/^[a-f0-9]{64}$/.test(key)) return new Response(null, { status: 404 });
  const bytes = await weaponThumbnailCache().read(key);
  if (!bytes) return new Response(null, { status: 404, headers: { "Cache-Control": "no-store" } });
  const headers = { "Content-Type": "image/webp", "Cache-Control": "private, max-age=31536000, immutable", ETag: `"${key}"`, Vary: "Cookie" };
  if (request.headers.get("if-none-match") === headers.ETag) return new Response(null, { status: 304, headers });
  return new Response(new Uint8Array(bytes), { headers });
}
