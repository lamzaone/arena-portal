import { thumbnailSignature, type WeaponThumbnail } from "../../lib/economy/weapon-thumbnail.ts";
import { createBrowserThumbnailStorage, validThumbnailBlob, type BrowserThumbnailStorage } from "./browser-thumbnail-storage.ts";
import type { ThumbnailState } from "./thumbnail-client.ts";

type Listener = (state: ThumbnailState) => void;
type Entry = { item: WeaponThumbnail; signature: string; state: ThumbnailState; listeners: Set<Listener>; queued: boolean };
type Options = {
  render: (item: WeaponThumbnail, signal: AbortSignal) => Promise<Blob>;
  cache?: BrowserThumbnailStorage; startDelay?: number; maxEntries?: number;
  objectUrl?: (blob: Blob) => string; revokeUrl?: (url: string) => void; close?: () => void;
};

/** All visible cards share one GPU job; completed cards contain only an img. */
export function createBrowserThumbnailClient({ render, cache = createBrowserThumbnailStorage(), startDelay = 250, maxEntries = 64,
  objectUrl = blob => URL.createObjectURL(blob), revokeUrl = url => URL.revokeObjectURL(url), close = () => {} }: Options) {
  const entries = new Map<string, Entry>();
  let active: { entry: Entry; controller: AbortController } | undefined;
  let timer: ReturnType<typeof setTimeout> | undefined, idle: ReturnType<typeof setTimeout> | undefined;
  let disposed = false;
  const current = (entry: Entry) => !disposed && entries.get(entry.signature) === entry && entry.listeners.size > 0;
  const notify = (entry: Entry) => entry.listeners.forEach(listener => listener(entry.state));
  function remove(entry: Entry) {
    if (entries.get(entry.signature) !== entry) return;
    entries.delete(entry.signature);
    if (entry.state.src) revokeUrl(entry.state.src);
    if (active?.entry === entry) active.controller.abort();
  }
  function ready(entry: Entry, blob: Blob) {
    if (!current(entry) || !validThumbnailBlob(blob)) return;
    entry.state = { status: "ready", src: objectUrl(blob) }; notify(entry);
  }
  function schedule(delay = startDelay) {
    if (disposed || active || timer !== undefined) return;
    if (![...entries.values()].some(entry => entry.queued && entry.listeners.size)) {
      if (idle === undefined) idle = setTimeout(() => { idle = undefined; close(); }, 30000);
      return;
    }
    clearTimeout(idle); idle = undefined;
    timer = setTimeout(() => { timer = undefined; void run(); }, delay);
  }
  async function run() {
    if (disposed || active) return;
    const entry = [...entries.values()].find(value => value.queued && value.listeners.size);
    if (!entry) { schedule(); return; }
    entry.queued = false;
    const job = { entry, controller: new AbortController() }; active = job;
    try {
      const blob = await render(entry.item, job.controller.signal);
      if (current(entry) && !job.controller.signal.aborted) {
        if (!validThumbnailBlob(blob)) throw new Error("Invalid item image");
        ready(entry, blob);
        void cache.put(entry.signature, blob).catch(() => {});
      }
    } catch {
      if (current(entry) && !job.controller.signal.aborted) { entry.state = { status: "unavailable" }; notify(entry); }
    } finally { if (active === job) active = undefined; schedule(0); }
  }
  async function load(entry: Entry) {
    let blob: Blob | undefined;
    try { blob = await cache.get(entry.signature); } catch { /* Rendering still works without storage. */ }
    if (!current(entry)) return;
    if (blob && validThumbnailBlob(blob)) ready(entry, blob);
    else { entry.queued = true; schedule(); }
  }
  return {
    watch(item: WeaponThumbnail, listener: Listener) {
      if (disposed) { listener({ status: "unavailable" }); return () => {}; }
      const signature = thumbnailSignature(item);
      let entry = entries.get(signature);
      if (!entry) {
        for (const value of entries.values()) {
          if (entries.size < maxEntries) break;
          if (!value.listeners.size) remove(value);
        }
        if (entries.size >= maxEntries) { listener({ status: "unavailable" }); return () => {}; }
        entry = { item, signature, state: { status: "loading" }, listeners: new Set(), queued: false };
        entries.set(signature, entry);
        // The initial cache lookup happens once even for duplicate cards.
        void Promise.resolve().then(() => load(entry!));
      }
      entry.listeners.add(listener); listener(entry.state);
      return () => {
        entry.listeners.delete(listener);
        // Navigation cancels both waiting and active jobs. A returning card gets
        // a fresh entry, so an old completion cannot overwrite the new item.
        if (!entry.listeners.size && entry.state.status !== "ready") remove(entry);
        schedule();
      };
    },
    invalidate(item: WeaponThumbnail) {
      const signature = thumbnailSignature(item), entry = entries.get(signature);
      void cache.delete(signature).catch(() => {});
      if (!entry) return;
      if (entry.state.src) revokeUrl(entry.state.src);
      entry.state = { status: "unavailable" }; notify(entry);
    },
    dispose() {
      disposed = true; clearTimeout(timer); clearTimeout(idle);
      for (const entry of entries.values()) remove(entry);
      close();
    },
  };
}

let renderer: ReturnType<typeof import("./browser-weapon-renderer.ts").createBrowserWeaponRenderer> | undefined;
const client = createBrowserThumbnailClient({
  async render(item, signal) {
    const { createBrowserWeaponRenderer } = await import("./browser-weapon-renderer.ts");
    signal.throwIfAborted();
    renderer ??= createBrowserWeaponRenderer();
    return renderer.render(item, signal);
  },
  close() { renderer?.close(); renderer = undefined; },
});
export const watchBrowserWeaponThumbnail = client.watch;
export const invalidateBrowserWeaponThumbnail = client.invalidate;
