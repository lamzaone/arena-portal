import { toInspectLink, weaponIdForDefindex } from "@skinhub/viewer";
import { readInspectUrl } from "@skinhub/cdn/inspect";
import { thumbnailFrameUrl, type WeaponThumbnail } from "../../lib/economy/weapon-thumbnail.ts";
import type { FrameItem, PlacementSlots } from "@skinhub/viewer/protocol";
import { createBrowserViewerAssets } from "./browser-viewer-assets.ts";

function expectedItem(item: WeaponThumbnail): FrameItem {
  const placement = readInspectUrl(toInspectLink({ ...item, nameTag: null }));
  return { weaponType: weaponIdForDefindex(item.defindex)!, paintIndex: item.paintIndex,
    float: item.float, seed: item.seed, legacyModel: item.legacyModel ?? false,
    statTrak: item.statTrak ?? false, nameTag: item.nameTag || null,
    stickers: [...placement.stickers, placement.keychain] as PlacementSlots };
}
function matches(actual: FrameItem | undefined, expected: FrameItem) {
  if (!actual) return false;
  return Object.entries(expected).every(([key,value]) => key !== "stickers" ? actual[key as keyof FrameItem] === value
    : actual.stickers?.length === expected.stickers!.length && expected.stickers!.every((slot,index) => actual.stickers![index] && Object.entries(slot).every(([field,entry]) => field === "scale" || (actual.stickers![index] as unknown as Record<string,unknown>)[field] === entry)));
}

/** One isolated renderer per tab; callers serialize render() through the queue. */
export function createBrowserWeaponRenderer() {
  const assets = createBrowserViewerAssets();
  let assetMessages = 0;
  let unavailableUntil = 0;
  let frame: HTMLIFrameElement | undefined, last: WeaponThumbnail | undefined;
  let state: { ready: boolean; item?: FrameItem; error?: string } = { ready: false };
  let capture: { id: string; resolve: (blob: Blob) => void; reject: (error: Error) => void } | undefined;
  let listening = false;
  const send = (message: object) => frame?.contentWindow?.postMessage(message, "*");
  function onMessage(event: MessageEvent) {
    if (event.source !== frame?.contentWindow || event.origin !== "null") return;
    const data = event.data;
    if (data?.channel === "arena-weapon-render" && data.type === "asset" && typeof data.id === "string" && data.id.length <= 64) {
      const target = frame!.contentWindow!;
      if (assetMessages >= 64) { target.postMessage({ channel: "arena-weapon-render", type: "asset-failed", id: data.id }, "*"); return; }
      assetMessages++;
      void assets.get(data.url).then(({ bytes, type }) => {
        // A transfer uses a copy because coalesced callers share the cache result.
        const copy = bytes.slice(0);
        target.postMessage({ channel: "arena-weapon-render", type: "asset-ready", id: data.id, bytes: copy, mime: type }, "*", [copy]);
      }, () => target.postMessage({ channel: "arena-weapon-render", type: "asset-failed", id: data.id }, "*")).catch(() => {}).finally(() => assetMessages--);
      return;
    }
    if (data?.channel === "skinhub-viewer" && data.from === "viewer") {
      if (data.v !== 2) state.error = "Viewer protocol changed";
      else if (data.type === "error" || (data.type === "hello" && data.problems?.length)) state.error = "Viewer rejected this item";
      else if (data.type === "hello") state.item = data.state?.item;
      else if (data.type === "ready") state.ready = true;
    } else if (data?.channel === "arena-weapon-render" && data.type === "error") {
      state.error = "Viewer assets unavailable";
      capture?.reject(new Error(state.error));
    }
    else if (data?.channel === "arena-weapon-render" && capture && data.id === capture.id) {
      const pending = capture; capture = undefined;
      if (data.type === "image" && data.blob instanceof Blob && data.blob.type === "image/webp" && data.blob.size > 0 && data.blob.size <= 2 * 1024 * 1024) pending.resolve(data.blob);
      else pending.reject(new Error("Viewer image export failed"));
    }
  }
  function close() {
    if (listening) window.removeEventListener("message",onMessage);
    listening = false; frame?.remove(); frame = undefined; last = undefined;
    capture?.reject(new Error("Viewer closed")); capture = undefined;
  }
  async function waitUntil(check: () => boolean, signal: AbortSignal) {
    const deadline = Date.now() + 45000;
    for (;;) {
      signal.throwIfAborted();
      if (state.error) throw new Error(state.error);
      if (check()) return;
      if (Date.now() >= deadline) throw new Error("Browser viewer timed out");
      send({channel:"skinhub-viewer",v:2,from:"host",type:"hello"});
      await new Promise(resolve => setTimeout(resolve,50));
    }
  }
  return { close, async render(item: WeaponThumbnail, signal: AbortSignal): Promise<Blob> {
    signal.throwIfAborted();
    const expected = expectedItem(item);
    const fixed = (value: WeaponThumbnail) => JSON.stringify({...value,paintIndex:0,float:0,seed:0});
    const reuse = frame && last && fixed(last) === fixed(item) && (last.paintIndex === item.paintIndex || !item.charm);
    const abort = () => close();
    signal.addEventListener("abort",abort,{once:true});
    try {
      if (!reuse) {
        close(); state = {ready:false};
        if (Date.now() < unavailableUntil) throw new Error("Viewer temporarily unavailable");
        try {
          // Detect a missing/error document before creating a frame which could
          // otherwise spend the entire readiness timeout waiting for its script.
          const response = await fetch("/api/economy/render-frame", { method: "HEAD", credentials: "omit", signal: AbortSignal.any([signal, AbortSignal.timeout(30000)]) });
          if (!response.ok) throw new Error("Viewer document unavailable");
        } catch (error) { if (!signal.aborted) unavailableUntil = Date.now() + 60000; throw error; }
        signal.throwIfAborted();
        window.addEventListener("message",onMessage); listening = true;
        frame = document.createElement("iframe"); frame.sandbox.add("allow-scripts");
        frame.title = "Item image renderer"; frame.setAttribute("aria-hidden","true"); frame.tabIndex = -1;
        // Keep a viewport-sized layout box so the viewer's visibility observer
        // starts. The frame itself remains invisible and non-interactive.
        frame.style.cssText = "position:fixed;left:0;top:0;width:640px;height:360px;border:0;opacity:0;pointer-events:none;z-index:-1";
        frame.src = "/api/economy/render-frame#" + new URL(thumbnailFrameUrl(item)).search.slice(1);
        document.body.append(frame);
      } else {
        state.item = undefined;
        if (last!.paintIndex !== item.paintIndex) state.ready = false;
        send({channel:"arena-weapon-render",type:"resume"});
        send({channel:"skinhub-viewer",v:2,from:"host",type:"set",patch:{item:expected}});
      }
      await waitUntil(() => state.ready && matches(state.item,expected),signal);
      let timeout: ReturnType<typeof setTimeout> | undefined;
      try {
        const blob = await new Promise<Blob>((resolve,reject) => {
          const id = crypto.randomUUID(); capture = {id,resolve,reject};
          timeout = setTimeout(() => reject(new Error("Browser image capture timed out")),20000);
          send({channel:"arena-weapon-render",type:"capture",id});
        });
        signal.throwIfAborted(); if (state.error) throw new Error(state.error);
        last = item; return blob;
      } finally { clearTimeout(timeout); capture = undefined; }
    } catch (error) { close(); throw error; }
    finally { signal.removeEventListener("abort",abort); }
  } };
}
