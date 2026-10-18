import { readGroupBadgeSymbol } from "@/lib/data/group-badge-symbols";

export async function GET(request: Request, { params }: { params: Promise<{ symbolId: string }> }) {
  const { symbolId } = await params;
  if (!/^[a-f0-9]{24}$/.test(symbolId)) return new Response(null, { status: 404 });
  const png = await readGroupBadgeSymbol(symbolId);
  if (!png) return new Response(null, { status: 404, headers: { "Cache-Control": "no-store" } });
  const headers = { "Content-Type": "image/png", "X-Content-Type-Options": "nosniff", "Cache-Control": "public, max-age=31536000, immutable", ETag: `"${symbolId}"` };
  if (request.headers.get("if-none-match") === headers.ETag) return new Response(null, { status: 304, headers });
  return new Response(new Uint8Array(png), { headers });
}
