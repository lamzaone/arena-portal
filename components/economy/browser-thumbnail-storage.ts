export type BrowserThumbnailStorage = {
  get(signature: string): Promise<Blob | undefined>;
  put(signature: string, blob: Blob): Promise<void>;
  delete(signature: string): Promise<void>;
};

const CACHE_NAME = "arena.weapon-images.v1";
const MAX_IMAGE_BYTES = 2 * 1024 * 1024;
const MAX_CACHE_BYTES = 64 * 1024 * 1024;
const MAX_IMAGES = 128;
const MAX_AGE = 7 * 86400000;
export const validThumbnailBlob = (blob: Blob) => blob.type === "image/webp" && blob.size > 0 && blob.size <= MAX_IMAGE_BYTES;

/** Local images are never uploaded into the server's trusted snapshot cache. */
export function createBrowserThumbnailStorage(getCaches = () => globalThis.caches): BrowserThumbnailStorage {
  let writing = Promise.resolve();
  async function key(signature: string) {
    const hash = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(signature));
    return `${location.origin}/__weapon-images/v1/${Array.from(new Uint8Array(hash), n => n.toString(16).padStart(2,"0")).join("")}`;
  }
  return {
    async get(signature) {
      try {
        const cache = await getCaches().open(CACHE_NAME), url = await key(signature);
        const response = await cache.match(url);
        if (!response) return;
        const stored = Number(response.headers.get("X-Image-Stored"));
        if (!stored || Date.now() - stored > MAX_AGE || Number(response.headers.get("Content-Length")) > MAX_IMAGE_BYTES) { await cache.delete(url); return; }
        const blob = await response.blob();
        if (validThumbnailBlob(blob)) return blob;
        await cache.delete(url);
      } catch { /* Storage is optional, including private browsing and quota errors. */ }
    },
    put(signature, blob) {
      const task = writing.then(async () => {
        if (!validThumbnailBlob(blob)) return;
        const cache = await getCaches().open(CACHE_NAME), url = await key(signature);
        // Delete then put moves a replacement to the end of CacheStorage's order.
        await cache.delete(url);
        await cache.put(url, new Response(blob, { headers: { "Content-Type": "image/webp", "Content-Length": String(blob.size), "X-Image-Stored": String(Date.now()) } }));
        const keys = await cache.keys();
        const sizes = await Promise.all(keys.map(async request => Number((await cache.match(request))?.headers.get("Content-Length")) || MAX_IMAGE_BYTES));
        let bytes = sizes.reduce((sum, size) => sum + size, 0), count = keys.length;
        for (let index = 0; index < keys.length && (count > MAX_IMAGES || bytes > MAX_CACHE_BYTES); index++) {
          await cache.delete(keys[index]); bytes -= sizes[index]; count--;
        }
      }).catch(() => {});
      writing = task; return task;
    },
    async delete(signature) {
      try { await writing; await (await getCaches().open(CACHE_NAME)).delete(await key(signature)); } catch { /* optional */ }
    },
  };
}
