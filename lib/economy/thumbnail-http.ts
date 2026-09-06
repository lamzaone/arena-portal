import { normalizeWeaponThumbnail, type WeaponThumbnail } from "./weapon-thumbnail.ts";
import type { ThumbnailTicket } from "./thumbnail-cache.ts";

type Dependencies = {
  session: () => Promise<{ steamId: string } | null>;
  request: (item: WeaponThumbnail, owner: string) => Promise<ThumbnailTicket>;
  lookup?: (item: WeaponThumbnail) => Promise<ThumbnailTicket>;
  waitForAny?: (keys: readonly string[], signal: AbortSignal, maxWaitMs: number) => Promise<void>;
};
export async function thumbnailStatusResponse(request: Request, dependencies: Dependencies) {
  const json = (body: unknown, status = 200) => Response.json(body, { status, headers: { "Cache-Control": "no-store" } });
  const origin = request.headers.get("origin");
  const allowedOrigin = new URL(process.env.SITE_URL || request.url).origin;
  if (origin !== allowedOrigin || request.headers.get("sec-fetch-site") === "cross-site") return json({ error: "Invalid origin" }, 403);
  if (!request.headers.get("content-type")?.startsWith("application/json")) return json({ error: "JSON required" }, 415);
  const session = await dependencies.session();
  if (!session) return json({ error: "Sign in to load previews" }, 401);
  // Bound streamed input as well as Content-Length, which clients can omit.
  const reader = request.body?.getReader();
  if (!reader) return json({ error: "Items required" }, 400);
  let length = 0;
  const chunks: Uint8Array[] = [];
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    length += value.length;
    if (length > 65536) { await reader.cancel(); return json({ error: "Request too large" }, 413); }
    chunks.push(value);
  }
  let items: WeaponThumbnail[];
  let waitMs = 0;
  let cacheOnly = false;
  try {
    const body = JSON.parse(Buffer.concat(chunks).toString("utf8"));
    if (!Array.isArray(body.items) || !body.items.length || body.items.length > 20) throw new Error();
    if (body.cacheOnly !== undefined && typeof body.cacheOnly !== "boolean") throw new Error();
    cacheOnly = body.cacheOnly === true;
    if (body.waitMs !== undefined) {
      if (!Number.isSafeInteger(body.waitMs) || body.waitMs < 0 || body.waitMs > 5000) throw new Error();
      waitMs = body.waitMs;
    }
    items = body.items.map(normalizeWeaponThumbnail);
  } catch { return json({ error: "Invalid preview configuration" }, 400); }
  if (request.signal.aborted) return json({ error: "Request cancelled" }, 499);
  if (cacheOnly && !dependencies.lookup) return json({ error: "Snapshot cache unavailable" }, 503);
  const readTickets = () => Promise.all(items.map(item => cacheOnly ? dependencies.lookup!(item) : dependencies.request(item, session.steamId)));
  let tickets = await readTickets();
  const waiting = !cacheOnly && waitMs > 0 && dependencies.waitForAny;
  if (waiting && !tickets.some(ticket => ticket.status === "ready")) {
    const keys = tickets.filter(ticket => ticket.status === "queued").map(ticket => ticket.key);
    if (keys.length) {
      // Completion wakes this request immediately. Five seconds keeps visible
      // jobs renewed well inside the queue's ten-second abandonment window.
      await waiting(keys, request.signal, waitMs);
      if (request.signal.aborted) return json({ error: "Request cancelled" }, 499);
      tickets = await readTickets();
    }
  }
  return json({ tickets: tickets.map(ticket => ({ ...ticket,
    retryAfterMs: waiting && ticket.status === "queued" ? 0 : ticket.retryAfterMs,
    src: ticket.status === "ready" ? `/api/economy/thumbnails/${ticket.key}` : null })) });
}
