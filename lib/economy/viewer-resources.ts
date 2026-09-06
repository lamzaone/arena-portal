import { createHash, randomUUID } from "node:crypto";
import { mkdir, readFile, writeFile, rename, readdir, stat, unlink } from "node:fs/promises";
import { join, resolve } from "node:path";

export const VIEWER_ASSET_PREFIX = "/api/economy/render-assets/";
export const VIEWER_TEMPLATE_URL = "https://skinhub.gg/frame?weapon=weapon_ak47&paint=44&bloom=0&scale=1&bg=transparent&hostloading=1";
const extensions = /\.(?:js|css|json|png|jpe?g|webp|avif|svg|glb|gltf|bin|wasm|ktx2?|hdr|exr|woff2?|ttf)$/;

export function viewerRequestOrigin(request: Request) {
  // Next can construct request.url with its internal listening hostname. Use
  // the actual virtual host and the TLS proxy's scheme for browser-facing URLs.
  const url = new URL(request.url);
  const host = request.headers.get("host") || url.host;
  if (!/^[a-zA-Z0-9.\[\]:-]+$/.test(host)) throw new Error("Invalid viewer host");
  const forwarded = request.headers.get("x-forwarded-proto")?.split(",")[0].trim();
  const protocol = forwarded === "https" || forwarded === "http" ? `${forwarded}:` : url.protocol;
  return new URL(`${protocol}//${host}`).origin;
}

export function viewerResourceUrl(provider: string, path: string): string | null {
  if (path.length > 1024 || !/^[a-zA-Z0-9_./-]+$/.test(path) || path.split("/").some(part => !part || part === "." || part === "..") || !extensions.test(path)) return null;
  const allowed = provider === "cdn"
    ? /^(?:manifest\.json$|(?:data|models|weapontex|weaponcomposite|knifetex|knifecomposite|glovetex|glovecomposite|textures|position|stickers|stickertex|stickercomposite|defaults|stattrak|nametag|charms|keychains|env|maps)\/)/.test(path)
    : provider === "viewer" && /^(?:_next\/static\/|(?:skins|env|models|textures|fonts|maps)\/|logo\.webp$)/.test(path);
  return allowed ? `https://${provider === "cdn" ? "cdn.skinhub.gg" : "skinhub.gg"}/${path}` : null;
}

export function rewriteViewerResource(source: string, origin: string) {
  return source.replaceAll("https://cdn.skinhub.gg", `${origin}${VIEWER_ASSET_PREFIX}cdn`)
    .replaceAll("https://skinhub.gg/_next/", `${origin}${VIEWER_ASSET_PREFIX}viewer/_next/`)
    .replace(/(?<!\/render-assets\/viewer)\/_next\//g, `${VIEWER_ASSET_PREFIX}viewer/_next/`);
}

export function viewerFramePolicy(origin: string) {
  const assets = `${origin}${VIEWER_ASSET_PREFIX}`;
  return `sandbox allow-scripts; default-src 'none'; script-src 'unsafe-inline' 'unsafe-eval' ${assets} ${origin}/scripts/weapon-render-bridge.js; style-src 'unsafe-inline' ${assets}; connect-src ${assets} blob:; img-src ${assets} blob: data:; font-src ${assets}; worker-src blob:; base-uri 'none'; form-action 'none'; frame-ancestors 'self';`;
}

type Resource = { bytes: Buffer; type: string; storedAt: number };
type Options = { directory: string; fetcher?: (url: string, init: RequestInit) => Promise<Response>; maxBytes?: number; maxAssetBytes?: number };

export function createViewerResourceCache({ directory, fetcher = fetch, maxBytes = 1024 * 1024 * 1024, maxAssetBytes = 64 * 1024 * 1024 }: Options) {
  const pending = new Map<string, Promise<Resource>>();
  const failures = new Map<string, number>();
  let publishing = Promise.resolve();
  let active = 0;
  const waiting: Array<() => void> = [];
  async function download(url: string): Promise<Resource> {
    if (active >= 4) await new Promise<void>(done => waiting.push(done));
    else active++;
    try {
      const response = await fetcher(url, { redirect: "error", credentials: "omit", cache: "no-store", signal: AbortSignal.timeout(30000) });
      if (!response.ok) throw new Error(`Viewer resource HTTP ${response.status}`);
      if (Number(response.headers.get("content-length")) > maxAssetBytes) throw new Error("Viewer resource too large");
      const chunks: Uint8Array[] = []; let size = 0;
      const reader = response.body?.getReader();
      if (!reader) throw new Error("Empty viewer resource");
      try {
        for (;;) {
          const part = await reader.read(); if (part.done) break;
          size += part.value.length;
          if (size > maxAssetBytes) { await reader.cancel(); throw new Error("Viewer resource too large"); }
          chunks.push(part.value);
        }
      } finally { reader.releaseLock(); }
      if (!size) throw new Error("Empty viewer resource");
      return { bytes: Buffer.concat(chunks), type: response.headers.get("content-type") ?? "application/octet-stream", storedAt: Date.now() };
    } finally { const next = waiting.shift(); if (next) next(); else active--; }
  }
  async function stored(key: string): Promise<Resource | null> {
    try {
      const [bytes, metadata] = await Promise.all([readFile(join(directory,`${key}.data`)), readFile(join(directory,`${key}.json`),"utf8")]);
      const info = JSON.parse(metadata);
      return bytes.length && typeof info.type === "string" && typeof info.storedAt === "number" ? { bytes, ...info } : null;
    } catch { return null; }
  }
  async function publish(key: string, resource: Resource) {
    const task = publishing.then(async () => {
      await mkdir(directory, { recursive: true });
      // One shared disk budget; all filenames come from SHA-256, never URLs.
      const files = await Promise.all((await readdir(directory)).filter(name => /^[a-f0-9]{64}\.data$/.test(name)).map(async name => ({ name, info: await stat(join(directory,name)).catch(() => null) })));
      let size = files.reduce((total, file) => total + (file.info?.size ?? 0), 0);
      for (const file of files.sort((a,b) => (a.info?.mtimeMs ?? 0) - (b.info?.mtimeMs ?? 0))) {
        if (size + resource.bytes.length <= maxBytes) break;
        await unlink(join(directory,file.name)).catch(() => {});
        await unlink(join(directory,file.name.replace(".data",".json"))).catch(() => {});
        size -= file.info?.size ?? 0;
      }
      if (resource.bytes.length > maxBytes) throw new Error("Viewer cache budget exceeded");
      const temp = join(directory,`${key}.${randomUUID()}.tmp`);
      try {
        await writeFile(temp,resource.bytes); await rename(temp,join(directory,`${key}.data`));
        await writeFile(temp,JSON.stringify({ type: resource.type, storedAt: resource.storedAt })); await rename(temp,join(directory,`${key}.json`));
      } finally { await unlink(temp).catch(() => {}); }
    });
    publishing = task.catch(() => {}); await task;
  }
  return {
    get(url: string): Promise<Resource> {
      const key = createHash("sha256").update(url).digest("hex");
      const current = pending.get(key); if (current) return current;
      if (pending.size >= 64) return Promise.reject(new Error("Viewer resource queue full"));
      const work = (async () => {
        const previous = await stored(key);
        const ttl = url === VIEWER_TEMPLATE_URL ? 6 * 3600000 : 24 * 3600000;
        if (previous && Date.now() - previous.storedAt < ttl) return previous;
        if ((failures.get(key) ?? 0) > Date.now()) {
          if (previous) return previous;
          throw new Error("Viewer resource temporarily unavailable");
        }
        try {
          const resource = await download(url);
          // Keep the known working document if an upstream error is returned as HTML.
          if (url === VIEWER_TEMPLATE_URL && !resource.bytes.includes(Buffer.from("FrameViewer"))) throw new Error("Viewer template unavailable");
          if (url !== VIEWER_TEMPLATE_URL && (/text\/html/i.test(resource.type) || /^\s*<(?:!doctype|html)/i.test(resource.bytes.subarray(0,128).toString()))) throw new Error("Viewer returned an error page");
          await publish(key,resource); return resource;
        } catch (error) {
          failures.set(key,Date.now()+60000);
          if (failures.size > 2048) failures.delete(failures.keys().next().value!);
          if (previous) return previous;
          throw error;
        }
      })().finally(() => pending.delete(key));
      pending.set(key,work); return work;
    },
  };
}

const globals = globalThis as typeof globalThis & { __viewerResources?: ReturnType<typeof createViewerResourceCache> };
export function viewerResources() {
  return globals.__viewerResources ??= createViewerResourceCache({ directory: resolve(process.env.ARENA_HOSTING_ROOT
    ? `${process.env.ARENA_HOSTING_ROOT}/cache/weapon-viewer-resources` : ".cache/weapon-viewer-resources") });
}
