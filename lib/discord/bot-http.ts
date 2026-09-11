export function botJson(body: unknown, status = 200) {
  return Response.json(body, { status, headers: { "Cache-Control": "no-store" } });
}
export async function readBotJson(request: Request): Promise<Record<string, unknown> | null> {
  if (!request.headers.get("content-type")?.includes("application/json")) return null;
  if (Number(request.headers.get("content-length")) > 4096) return null;
  const text = await request.text();
  if (text.length > 4096) return null;
  try { const value = JSON.parse(text); return value && typeof value === "object" && !Array.isArray(value) ? value : null; }
  catch { return null; }
}
export function isDiscordId(value: unknown): value is string { return typeof value === "string" && /^[1-9]\d{16,19}$/.test(value); }
export function isDatabaseId(value: unknown): value is string { return typeof value === "string" && /^[1-9]\d{0,19}$/.test(value); }
