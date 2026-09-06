/* Runs only inside the script-only, opaque-origin viewer sandbox. */
(() => {
  "use strict";
  const portalOrigin = new URL(document.currentScript.src).origin;
  const assetPrefix = portalOrigin + "/api/economy/render-assets/";
  const channel = "arena-weapon-render";
  const send = message => parent.postMessage({ channel, ...message }, portalOrigin);

  // The sandbox cannot access portal storage. The viewer's preference store
  // still needs its own temporary storage API to initialize.
  for (const name of ["localStorage", "sessionStorage"]) {
    const data = new Map();
    Object.defineProperty(window, name, { configurable: true, value: {
      getItem: key => data.get(String(key)) ?? null,
      setItem: (key, value) => { data.set(String(key), String(value)); },
      removeItem: key => { data.delete(String(key)); }, clear: () => data.clear(),
      key: index => [...data.keys()][index] ?? null, get length() { return data.size; },
    } });
  }

  // Adapt the cached document's documented URL configuration locally. Item
  // names and inspect payloads never enter the resource proxy's URL or cache.
  const search = new URLSearchParams(location.hash.slice(1)).toString();
  const chunks = window.__next_f = window.__next_f || [];
  let push = Array.prototype.push;
  Object.defineProperty(chunks, "push", {
    get: () => (...values) => push.apply(chunks, values.map(value => {
      if (Array.isArray(value) && typeof value[1] === "string") {
        value = [...value];
        value[1] = value[1].replace(/"search":"[^"\\]*(?:\\.[^"\\]*)*","identity":null/g,
          () => '"search":' + JSON.stringify(search) + ',"identity":null');
      }
      return value;
    })),
    set: value => { push = value; }, configurable: true,
  });

  function resourceUrl(input) {
    const url = new URL(input, "https://skinhub.gg");
    if (url.protocol === "blob:" || url.protocol === "data:") return url.href;
    if (url.origin === portalOrigin && url.pathname.startsWith("/api/economy/render-assets/")) return url.href;
    if (url.hostname === "skinhub.gg" && /^\/(?:_next\/static|skins|env|models|textures|fonts|maps)\//.test(url.pathname))
      return assetPrefix + "viewer" + url.pathname;
    if (url.hostname === "skinhub.gg" && url.pathname === "/logo.webp") return assetPrefix + "viewer/logo.webp";
    if (url.hostname === "cdn.skinhub.gg") return assetPrefix + "cdn" + url.pathname;
    throw new Error("Unsupported viewer resource");
  }
  const nativeFetch = window.fetch.bind(window);
  const assets = new Map(); let assetSequence = 0;
  function assetFetch(url, signal) {
    if (/^(?:blob|data):/.test(url)) return nativeFetch(url, { signal });
    return new Promise((resolve, reject) => {
      const id = String(++assetSequence);
      const abort = () => finish(new DOMException("Aborted", "AbortError"));
      const timer = setTimeout(() => finish(new Error("Viewer asset timed out")), 40000);
      function finish(error, result) { clearTimeout(timer); assets.delete(id); signal?.removeEventListener("abort", abort); if (error) reject(error); else resolve(result); }
      assets.set(id, finish);
      if (signal?.aborted) { abort(); return; }
      signal?.addEventListener("abort", abort, { once: true });
      send({ type: "asset", id, url });
    });
  }
  window.addEventListener("message", event => {
    if (event.source !== parent || event.origin !== portalOrigin || event.data?.channel !== channel) return;
    const data = event.data, finish = assets.get(data.id);
    if (!finish) return;
    if (data.type === "asset-ready" && data.bytes instanceof ArrayBuffer) finish(null, new Response(data.bytes, { headers: { "Content-Type": data.mime } }));
    else if (data.type === "asset-failed") finish(new Error("Viewer asset unavailable"));
  });
  window.fetch = async (input, init) => {
    try {
      const response = await assetFetch(resourceUrl(input instanceof Request ? input.url : String(input)), init?.signal ?? (input instanceof Request ? input.signal : undefined));
      if (!response.ok) throw new Error("Viewer asset unavailable");
      return response;
    } catch (error) { if (error.name !== "AbortError") send({ type: "error" }); throw error; }
  };
  const imageSrc = Object.getOwnPropertyDescriptor(HTMLImageElement.prototype, "src");
  const imageVersions = new WeakMap();
  Object.defineProperty(HTMLImageElement.prototype, "src", { ...imageSrc, set(value) {
    const version = {}; imageVersions.set(this, version);
    const url = resourceUrl(value);
    if (/^(?:blob|data):/.test(url)) { imageSrc.set.call(this, url); return; }
    assetFetch(url).then(response => response.blob()).then(blob => {
      if (imageVersions.get(this) !== version) return;
      const src = URL.createObjectURL(blob);
      this.addEventListener("load", () => URL.revokeObjectURL(src), { once: true });
      this.addEventListener("error", () => { URL.revokeObjectURL(src); send({ type: "error" }); }, { once: true });
      imageSrc.set.call(this, src);
    }).catch(() => { send({ type: "error" }); this.dispatchEvent(new Event("error")); });
  } });
  const setAttribute = HTMLImageElement.prototype.setAttribute;
  HTMLImageElement.prototype.setAttribute = function (name, value) {
    if (name.toLowerCase() === "src") this.src = value;
    else setAttribute.call(this, name, value);
  };

  const getContext = HTMLCanvasElement.prototype.getContext;
  HTMLCanvasElement.prototype.getContext = function (type, options) {
    return getContext.call(this, type, /webgl/.test(type) ? { ...options, preserveDrawingBuffer: true } : options);
  };

  // Keep compiled assets while idle without continuously drawing a hidden 3D
  // viewer. The next item resumes the callbacks that the renderer requested.
  const nativeFrame = window.requestAnimationFrame.bind(window);
  const cancelFrame = window.cancelAnimationFrame.bind(window);
  let paused = false, sequence = 0;
  const frames = new Map();
  function schedule(id, entry) {
    const run = time => {
      cancelFrame(entry.native); clearTimeout(entry.timer);
      entry.native = null; entry.timer = null;
      if (paused || !frames.has(id)) return;
      frames.delete(id); entry.callback(time);
    };
    entry.native = nativeFrame(run);
    // Chromium throttles animation frames in an offscreen iframe. A timer
    // lets this single active snapshot finish without making the frame visible.
    entry.timer = setTimeout(() => run(performance.now()), 32);
  }
  window.requestAnimationFrame = callback => {
    const id = ++sequence, entry = { callback, native: null, timer: null }; frames.set(id, entry);
    if (!paused) schedule(id, entry); return id;
  };
  window.cancelAnimationFrame = id => { const entry = frames.get(id); if (entry) { cancelFrame(entry.native); clearTimeout(entry.timer); } frames.delete(id); };
  function resume() { paused = false; for (const [id, entry] of frames) if (entry.native == null) schedule(id, entry); }

  let capturing = false;
  async function capture() {
    const deadline = performance.now() + 15000;
    do {
      await new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve)));
      const canvas = document.querySelector("canvas");
      if (!canvas || canvas.width !== 640 || canvas.height !== 360) continue;
      let faded = false;
      for (let element = canvas; element; element = element.parentElement) if (Number(getComputedStyle(element).opacity) < 1) faded = true;
      if (faded) continue;
      const copy = document.createElement("canvas"); copy.width = 640; copy.height = 360;
      const context = copy.getContext("2d", { willReadFrequently: true }); context.drawImage(canvas, 0, 0);
      const pixels = context.getImageData(80, 40, 480, 260).data;
      let count = 0, sum = 0, squared = 0;
      for (let index = 0; index < pixels.length; index += 16) {
        const value = (pixels[index] + pixels[index + 1] + pixels[index + 2]) * pixels[index + 3] / 765;
        sum += value; squared += value * value; count++;
      }
      if (squared / count - (sum / count) ** 2 < 16) continue;
      const blob = await new Promise(resolve => copy.toBlob(resolve, "image/webp", 0.82));
      if (blob?.size) return blob;
    } while (performance.now() < deadline);
    throw new Error("Viewer did not paint a complete item");
  }
  window.addEventListener("message", async event => {
    if (event.source !== parent || event.origin !== portalOrigin || event.data?.channel !== channel) return;
    if (event.data.type === "resume") { resume(); return; }
    if (event.data.type !== "capture" || typeof event.data.id !== "string" || event.data.id.length > 64 || capturing) return;
    capturing = true; resume();
    try { const blob = await capture(); paused = true; send({ type: "image", id: event.data.id, blob }); }
    catch { paused = true; send({ type: "failed", id: event.data.id }); }
    finally { capturing = false; }
  });
})();
