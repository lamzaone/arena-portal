const PREFIX = "/api/economy/render-assets/";
const CACHE = "arena.weapon-assets.v1";
const MAX_ASSET_BYTES = 64 * 1024 * 1024;
const MAX_CACHE_BYTES = 256 * 1024 * 1024;

export function browserViewerAssetUrl(input: unknown, origin: string): string | null {
  if (typeof input !== "string" || input.length > 1200) return null;
  try {
    const url = new URL(input);
    if (url.origin !== origin || url.search || url.hash || url.username || url.password) return null;
    // The sandbox can request only public render data, never portal APIs or
    // scripts. The backend also validates the provider and directory allowlist.
    if (!url.pathname.startsWith(PREFIX) || !/^\/api\/economy\/render-assets\/(?:cdn|viewer)\/[a-zA-Z0-9_./-]+\.(?:json|png|jpe?g|webp|avif|glb|gltf|bin|ktx2?|hdr|exr)$/.test(url.pathname)) return null;
    return url.href;
  } catch { return null; }
}

/** Opaque frames cannot share a browser cache reliably. The parent stores only
 * public binary assets and passes bytes into each isolated renderer. */
export function createBrowserViewerAssets() {
  const pending = new Map<string, Promise<{ bytes: ArrayBuffer; type: string }>>();
  let writing = Promise.resolve(), active = 0;
  const waiting: Array<() => void> = [];
  async function store(cache: Cache, url: string, bytes: ArrayBuffer, type: string) {
    const task = writing.then(async () => {
      await cache.delete(url);
      await cache.put(url, new Response(bytes, { headers: { "Content-Type": type, "Content-Length": String(bytes.byteLength), "X-Asset-Stored": String(Date.now()) } }));
      const keys = await cache.keys();
      const sizes = await Promise.all(keys.map(async request => Number((await cache.match(request))?.headers.get("Content-Length")) || MAX_ASSET_BYTES));
      let total = sizes.reduce((sum, n) => sum + n, 0), count = keys.length;
      for (let i = 0; i < keys.length && (total > MAX_CACHE_BYTES || count > 256); i++) {
        await cache.delete(keys[i]); total -= sizes[i]; count--;
      }
    }).catch(() => {});
    writing = task; return task;
  }
  async function load(url: string) {
    let cache: Cache | undefined;
    try {
      cache = await caches.open(CACHE);
      const response = await cache.match(url);
      if (response && Date.now() - Number(response.headers.get("X-Asset-Stored")) < 86400000) {
        const bytes = await response.arrayBuffer();
        if (bytes.byteLength && bytes.byteLength <= MAX_ASSET_BYTES) return { bytes, type: response.headers.get("Content-Type") || "application/octet-stream" };
      }
    } catch { /* The normal HTTP cache still works when CacheStorage is disabled. */ }
    if (active >= 6) await new Promise<void>(resolve => waiting.push(resolve)); else active++;
    try {
      const response = await fetch(url, { credentials: "omit", redirect: "error", signal: AbortSignal.timeout(35000) });
      if (!response.ok || Number(response.headers.get("Content-Length")) > MAX_ASSET_BYTES) throw new Error("Viewer asset unavailable");
      const bytes = await response.arrayBuffer(), type = response.headers.get("Content-Type") || "application/octet-stream";
      if (!bytes.byteLength || bytes.byteLength > MAX_ASSET_BYTES || /text\/html/i.test(type)) throw new Error("Invalid viewer asset");
      if (cache) await store(cache, url, bytes, type);
      return { bytes, type };
    } finally { const next = waiting.shift(); if (next) next(); else active--; }
  }
  return {
    get(input: unknown) {
      const url = browserViewerAssetUrl(input, location.origin);
      if (!url) return Promise.reject(new Error("Unsupported viewer asset"));
      const existing = pending.get(url); if (existing) return existing;
      if (pending.size >= 64) return Promise.reject(new Error("Viewer asset queue full"));
      const work = load(url).finally(() => pending.delete(url)); pending.set(url, work); return work;
    },
  };
}
