import { thumbnailSignature, type WeaponThumbnail } from "../../lib/economy/weapon-thumbnail.ts";

export type ThumbnailState = { status: "loading" | "ready" | "unavailable"; src?: string };
type Listener = (state: ThumbnailState) => void;
type Entry = {
  item: WeaponThumbnail;
  state: ThumbnailState;
  listeners: Set<Listener>;
  next: number;
  failures: number;
  revision: number;
  lastRequested: number;
};
type Pending = { entry: Entry; revision: number };
type Request = { batch: Pending[]; controller: AbortController; timeout?: ReturnType<typeof setTimeout> };
const BATCH_DELAY_MS = 16;
const BATCH_SIZE = 20;
const SNAPSHOT_REFRESH_MS = 30_000;
const TRANSIENT_RETRY_MS = [1_000, 2_000, 5_000, 10_000, 20_000, 30_000];
const READY_CACHE_KEY = "arena.weapon-thumbnails.v1";
const isThumbnailUrl = (src: unknown): src is string => typeof src === "string" && /^\/api\/economy\/thumbnails\/[a-f0-9]{64}$/.test(src);
type CacheStorage = Pick<Storage, "getItem" | "setItem">;

/** Only immutable preview identities/URLs are saved, never inventory or prices. */
function createReadyCache(getStorage: () => CacheStorage | undefined) {
  let entries: Map<string, string> | undefined;
  let storage: CacheStorage | undefined;
  let dirty = false;
  function read() {
    if (entries) return entries;
    entries = new Map();
    try {
      storage = getStorage();
      const raw = storage?.getItem(READY_CACHE_KEY);
      if (raw && raw.length <= 1_048_576) {
        const saved: unknown = JSON.parse(raw);
        if (Array.isArray(saved)) for (const entry of saved.slice(-512)) {
          if (Array.isArray(entry) && typeof entry[0] === "string" && entry[0].length <= 8192 && isThumbnailUrl(entry[1])) entries.set(entry[0], entry[1]);
        }
      }
    } catch { /* Browser storage is optional, including in private browsing. */ }
    return entries;
  }
  return {
    get(signature: string) { return read().get(signature); },
    set(signature: string, src: string) {
      const cache = read();
      cache.delete(signature);
      cache.set(signature, src);
      while (cache.size > 512) cache.delete(cache.keys().next().value!);
      dirty = true;
    },
    delete(signature: string) { dirty = read().delete(signature) || dirty; },
    save() {
      if (!dirty) return;
      dirty = false;
      try { storage?.setItem(READY_CACHE_KEY, JSON.stringify([...read()])); }
      catch { /* A full/disabled localStorage must not delay the image. */ }
    },
  };
}

/** Each client owns its subscriptions, cache, and request lifetime. */
export function createWeaponThumbnailClient(fetcher: typeof fetch = (...args) => fetch(...args),
  getStorage: () => CacheStorage | undefined = () => typeof window === "undefined" ? undefined : window.localStorage,
  options: { cacheOnly?: boolean } = {}) {
  const entries = new Map<string, Entry>();
  const readyCache = createReadyCache(getStorage);
  let timer: ReturnType<typeof setTimeout> | undefined;
  let timerDeadline: number | undefined;
  let active: Request | undefined;
  let requestOrder = 0;
  let disposed = false;

  function clearTimer() {
    if (timer !== undefined) clearTimeout(timer);
    timer = undefined;
    timerDeadline = undefined;
  }

  function schedule() {
    if (disposed || active) return;
    const pending = [...entries.values()].filter(entry => entry.listeners.size && entry.state.status !== "ready" && Number.isFinite(entry.next));
    const deadline = pending.length ? Math.min(...pending.map(entry => entry.next)) : undefined;
    if (deadline === undefined) { clearTimer(); return; }
    if (timer !== undefined && timerDeadline === deadline) return;
    // A newly visible item must be able to preempt another item's retry timer.
    clearTimer();
    timerDeadline = deadline;
    timer = setTimeout(() => { timer = undefined; timerDeadline = undefined; void poll(); }, Math.max(0, deadline - Date.now()));
  }

  function retry(entry: Entry, paused = false) {
    entry.state = { status: "unavailable" };
    const delay = options.cacheOnly ? SNAPSHOT_REFRESH_MS : TRANSIENT_RETRY_MS[Math.min(entry.failures++, TRANSIENT_RETRY_MS.length - 1)];
    entry.next = paused ? Infinity : Date.now() + delay;
  }

  function notify(entry: Entry) {
    entry.listeners.forEach(listener => listener(entry.state));
  }

  function cancelRequest(requeue = false) {
    if (!active) return;
    const cancelled = active;
    active = undefined;
    clearTimeout(cancelled.timeout);
    cancelled.controller.abort();
    if (requeue) for (const { entry, revision } of cancelled.batch) {
      if (entry.listeners.size && entry.revision === revision) entry.next = Date.now() + BATCH_DELAY_MS;
    }
  }

  function cancelUnusedRequest() {
    if (active && !active.batch.some(({ entry, revision }) => entry.listeners.size && entry.revision === revision)) cancelRequest();
  }

  async function poll() {
    if (disposed || active) return;
    const pending = [...entries.values()]
      .filter(entry => entry.listeners.size && entry.state.status !== "ready" && entry.next <= Date.now())
      .sort((a, b) => a.lastRequested - b.lastRequested);
    const batch = pending.slice(0, BATCH_SIZE).map(entry => ({ entry, revision: entry.revision }));
    if (!batch.length) { schedule(); return; }
    const request: Request = { batch, controller: new AbortController() };
    active = request;
    // Rotate all active identities, including a selection beside a full grid.
    // Shorten each wait so every batch renews within the server's ten-second lease.
    batch.forEach(({ entry }) => { entry.lastRequested = ++requestOrder; });
    const waitMs = options.cacheOnly ? 0 : Math.max(100, Math.floor(5000 / Math.ceil(pending.length / BATCH_SIZE)));
    request.timeout = setTimeout(() => request.controller.abort(), options.cacheOnly ? 1_000 : 15_000);
    let paused = false;
    try {
      const response = await fetcher("/api/economy/thumbnails", {
        method: "POST", credentials: "same-origin", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ items: batch.map(({ entry }) => entry.item), waitMs, ...(options.cacheOnly ? { cacheOnly: true } : {}) }), signal: request.controller.signal,
      });
      paused = response.status === 401 || response.status === 403;
      if (!response.ok) throw new Error("Preview unavailable");
      const body = await response.json() as { tickets?: Array<{ status: string; src?: string; retryAfterMs?: number }> };
      if (!Array.isArray(body?.tickets) || body.tickets.length !== batch.length) throw new Error("Invalid previews");
      if (active !== request || disposed) return;
      batch.forEach(({ entry, revision }, index) => {
        if (entry.revision !== revision) return;
        const ticket = body.tickets![index];
        if (!ticket || !["ready", "queued", "busy", "unavailable"].includes(ticket.status)
          || (ticket.status === "ready" && !isThumbnailUrl(ticket.src))) {
          retry(entry);
          return;
        }
        entry.state = ticket.status === "ready" ? { status: "ready", src: ticket.src }
          : { status: options.cacheOnly || ticket.status === "unavailable" ? "unavailable" : "loading" };
        entry.failures = 0;
        const delay = Number.isFinite(ticket.retryAfterMs) && (ticket.retryAfterMs! > 0 || (ticket.retryAfterMs === 0 && ticket.status === "queued")) ? ticket.retryAfterMs! : 1_000;
        entry.next = ticket.status === "ready" ? Infinity : Date.now() + (options.cacheOnly ? SNAPSHOT_REFRESH_MS : delay);
        if (ticket.status === "ready") readyCache.set(thumbnailSignature(entry.item), ticket.src!);
      });
    } catch {
      if (active !== request || disposed) return;
      batch.forEach(({ entry, revision }) => { if (entry.revision === revision) retry(entry, paused); });
    } finally {
      clearTimeout(request.timeout);
      // Aborted requests may finish after a replacement request has started.
      if (active === request) {
        active = undefined;
        readyCache.save();
        batch.forEach(({ entry, revision }) => { if (entry.revision === revision) notify(entry); });
        schedule();
      }
    }
  }

  function watchWeaponThumbnail(item: WeaponThumbnail, listener: Listener) {
    if (disposed) { listener({ status: "unavailable" }); return () => {}; }
    const signature = thumbnailSignature(item);
    let entry = entries.get(signature);
    if (!entry) {
      // Evict unused cache entries without displacing a visible card's identity.
      if (entries.size >= 512) for (const [key, value] of entries) {
        if (!value.listeners.size) entries.delete(key);
        if (entries.size < 512) break;
      }
      if (entries.size >= 512) { listener({ status: "unavailable" }); return () => {}; }
      const src = readyCache.get(signature);
      entry = { item, state: src ? { status: "ready", src } : { status: "loading" }, listeners: new Set(),
        next: src ? Infinity : Date.now() + BATCH_DELAY_MS, failures: 0, revision: 0, lastRequested: 0 };
      entries.set(signature, entry);
    } else if (!entry.listeners.size && entry.state.status !== "ready" && !Number.isFinite(entry.next)) {
      // Remounting retries an entry that was paused by an authentication failure.
      entry.state = { status: "loading" };
      entry.next = Date.now() + BATCH_DELAY_MS;
      entry.failures = 0;
    }
    entry.listeners.add(listener);
    listener(entry.state);
    if (active && entry.state.status !== "ready" && Number.isFinite(entry.next)
      && !active.batch.some(pending => pending.entry === entry && pending.revision === entry.revision)) {
      // A new page/seed must not wait behind a five-second completion request.
      // Preserve existing subscribers and put the new identity in the next batch.
      entry.lastRequested = 0;
      cancelRequest(true);
    }
    schedule();
    return () => {
      entry.listeners.delete(listener);
      cancelUnusedRequest();
      schedule();
    };
  }

  function invalidateWeaponThumbnail(item: WeaponThumbnail) {
    const entry = entries.get(thumbnailSignature(item));
    if (!entry || disposed) return;
    readyCache.delete(thumbnailSignature(item));
    readyCache.save();
    entry.revision++;
    retry(entry);
    notify(entry);
    cancelUnusedRequest();
    schedule();
  }

  function dispose() {
    disposed = true;
    clearTimer();
    entries.forEach(entry => entry.listeners.clear());
    cancelUnusedRequest();
    entries.clear();
  }

  return { watchWeaponThumbnail, invalidateWeaponThumbnail, dispose };
}

const client = createWeaponThumbnailClient();
export const watchWeaponThumbnail = client.watchWeaponThumbnail;
export const invalidateWeaponThumbnail = client.invalidateWeaponThumbnail;

// Legacy shared-snapshot client. Item grids use normal catalogue artwork and
// do not mount thumbnail subscriptions.
const snapshots = createWeaponThumbnailClient(undefined, undefined, { cacheOnly: true });
export const watchCachedWeaponThumbnail = snapshots.watchWeaponThumbnail;
export const invalidateCachedWeaponThumbnail = snapshots.invalidateWeaponThumbnail;
