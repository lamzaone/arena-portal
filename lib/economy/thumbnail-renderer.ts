import { chromium, type Browser, type BrowserContext, type Page } from "playwright";
import sharp from "sharp";
import { toInspectLink, weaponIdForDefindex } from "@skinhub/viewer";
import type { FrameItem, PlacementSlots } from "@skinhub/viewer/protocol";
import { readInspectUrl } from "@skinhub/cdn/inspect";
import { thumbnailFrameUrl, type WeaponThumbnail } from "./weapon-thumbnail.ts";
import { thumbnailBrowserOptions, thumbnailPersistentBrowserOptions } from "./thumbnail-browser.ts";
import { thumbnailModelProfileDirectory } from "./thumbnail-paths.ts";

type RenderState = { ready: boolean; error: string | null; item?: FrameItem };

async function withTimeout<T>(work: Promise<T>, milliseconds: number, message: string): Promise<T> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    return await Promise.race([work, new Promise<never>((_, reject) => {
      timer = setTimeout(() => reject(new Error(message)), milliseconds);
    })]);
  } finally { clearTimeout(timer); }
}

function diagnosticUrl(value: string) {
  // Inspect links and name tags are carried in the query. Never log them.
  try { const url = new URL(value); return `${url.origin}${url.pathname}`.slice(0, 240); }
  catch { return "unknown resource"; }
}

function diagnosticMessage(value: string) {
  return value.split("\n")[0].replace(/https?:\/\/[^\s"'<>]+/g, diagnosticUrl).slice(0, 300);
}

function frameItem(item: WeaponThumbnail): FrameItem {
  // Use the same float32 placement codec as the first-navigation URL. A full
  // six-slot tuple also explicitly clears every absent sticker and charm.
  const placement = readInspectUrl(toInspectLink({ ...item, nameTag: null }));
  return {
    weaponType: weaponIdForDefindex(item.defindex)!, paintIndex: item.paintIndex,
    float: item.float, seed: item.seed, legacyModel: item.legacyModel ?? false,
    statTrak: item.statTrak ?? false, nameTag: item.nameTag || null,
    stickers: [...placement.stickers, placement.keychain] as PlacementSlots,
  };
}

function matchesItem(actual: FrameItem | undefined, expected: FrameItem) {
  if (!actual) return false;
  return Object.entries(expected).every(([key, value]) => {
    if (key !== "stickers") return actual[key as keyof FrameItem] === value;
    return actual.stickers?.length === expected.stickers!.length && expected.stickers!.every((slot, index) => actual.stickers![index] &&
      Object.entries(slot).every(([field, entry]) =>
        // The URL decoder uses 1 and the protocol uses 0 for this unused field.
        field === "scale" || (actual.stickers![index] as unknown as Record<string, unknown>)[field] === entry));
  });
}
export function createWeaponThumbnailRenderer(options: { assetCacheDirectory?: string } = {}) {
  let browser: Browser | undefined;
  let persistentContext: BrowserContext | undefined;
  let closing: Promise<void> | undefined;
  let activeProfile: string | undefined;
  let page: Page | undefined;
  let idleTimer: ReturnType<typeof setTimeout> | undefined;
  let lastItem: WeaponThumbnail | undefined;
  let providerUnavailableUntil = 0;
  let events: string[] = [];
  const recordEvent = (value: string) => { events.push(value); if (events.length > 8) events.shift(); };
  async function close() {
    clearTimeout(idleTimer);
    if (closing) return closing;
    const current = browser;
    const currentContext = persistentContext;
    browser = undefined; page = undefined; lastItem = undefined;
    persistentContext = undefined;
    activeProfile = undefined;
    closing = (async () => {
      if (currentContext) await currentContext.close();
      else await current?.close();
    })().finally(() => { closing = undefined; });
    await closing;
  }
  return {
    close,
    async render(item: WeaponThumbnail): Promise<Buffer> {
      clearTimeout(idleTimer);
      // An upstream outage affects every queued item. Allow the next inventory
      // scan to retry after a short cooldown instead of opening 128 error pages.
      if (Date.now() < providerUnavailableUntil) throw new Error("SkinHub viewer temporarily unavailable; retry after cooldown");
      events = [];
      const started = Date.now();
      let stage = "browser-launch";
      try {
        // Idle shutdown is asynchronous. Reopening the same profile before it
        // releases its lock would make an otherwise valid preview fail.
        await closing;
        const profile = options.assetCacheDirectory
          ? thumbnailModelProfileDirectory(options.assetCacheDirectory, item.defindex) : undefined;
        if (persistentContext && activeProfile !== profile) await close();
        if (!browser?.isConnected()) {
          const launchOptions = thumbnailBrowserOptions();
          const viewportOptions = { viewport: { width: 640, height: 360 }, deviceScaleFactor: 1 };
          if (profile) {
            // A private, dedicated profile retains Chromium's HTTP, shader and
            // model resource caches across idle shutdowns and portal restarts.
            // Chromium honors provider freshness headers and evicts old assets.
            persistentContext = await chromium.launchPersistentContext(profile, {
              ...thumbnailPersistentBrowserOptions(), ...viewportOptions, acceptDownloads: false,
            });
            activeProfile = profile;
            browser = persistentContext.browser() ?? undefined;
            page = persistentContext.pages()[0] ?? await persistentContext.newPage();
          } else {
            browser = await chromium.launch(launchOptions);
            page = await browser.newPage(viewportOptions);
          }
          page.on("response", response => {
            if (response.status() >= 400) recordEvent(`HTTP ${response.status()} ${diagnosticUrl(response.url())}`);
          });
          page.on("requestfailed", request => {
            const reason = request.failure()?.errorText ?? "request failed";
            if (reason !== "net::ERR_ABORTED") recordEvent(`${diagnosticMessage(reason)} ${diagnosticUrl(request.url())}`);
          });
          page.on("pageerror", error => recordEvent(`JavaScript: ${diagnosticMessage(error.message)}`));
          page.on("crash", () => recordEvent("Browser page crashed"));
          await page.addInitScript(() => {
            const state: RenderState = {ready:false,error:null};
            (window as unknown as { __weaponRender: RenderState }).__weaponRender = state;
            window.addEventListener("message",event=>{
              if (event.source !== window || event.origin !== location.origin || event.data?.channel !== "skinhub-viewer" || event.data?.from !== "viewer") return;
              if (event.data.v !== 2) state.error="Renderer protocol changed";
              if (event.data.type === "error") {
                const code = event.data.error?.code;
                state.error="Renderer rejected the item" + (["render-failed","bad-inspect-link","bad-message","protocol-mismatch"].includes(code) ? ` (${code})` : "");
              }
              if (event.data.type === "hello" && event.data.problems?.length) state.error="Renderer rejected an item parameter";
              if (event.data.type === "hello") state.item=event.data.state?.item;
              if (event.data.type === "ready") state.ready=true;
            });
          });
        }
        const current = page!;
        const expected = frameItem(item);
        const fixedConfiguration = (value: WeaponThumbnail) => JSON.stringify({ ...value, paintIndex: 0, float: 0, seed: 0 });
        if (lastItem && fixedConfiguration(lastItem) === fixedConfiguration(item)
          && (lastItem.paintIndex === item.paintIndex || !item.charm)) {
          // Same-model finish patches retain the GL context and compiled assets.
          // A finish change reloads inside the viewer and must announce ready
          // again. Attachment/weapon/model changes and finishes with a charm
          // still navigate: measured in-place updates can acknowledge them
          // before drawing or reframing.
          const reload = lastItem.paintIndex !== item.paintIndex;
          stage = "item-update";
          await current.evaluate(({value,reload}) => {
            const state=(window as unknown as {__weaponRender: RenderState}).__weaponRender;
            state.item=undefined;
            if(reload)state.ready=false;
            const patch=reload ? value : {float:value.float,seed:value.seed};
            window.postMessage({channel:'skinhub-viewer',v:2,from:'host',type:'set',patch:{item:patch}},location.origin);
          },{value:expected,reload});
          await current.waitForFunction(value => {
            const state=(window as unknown as {__weaponRender:RenderState}).__weaponRender;
            if(state.error || (state.item?.weaponType===value.weaponType && state.item.paintIndex===value.paintIndex && state.item.float===value.float && state.item.seed===value.seed)) return true;
            window.postMessage({channel:'skinhub-viewer',v:2,from:'host',type:'hello'},location.origin);
            return false;
          },expected,{polling:25,timeout:15000});
        } else {
          // Full configuration for model/attachment changes prevents
          // an old attachment or a previous weapon from leaking into the image.
          stage = "navigation";
          const response = await current.goto(thumbnailFrameUrl(item),{waitUntil:"domcontentloaded",timeout:45000});
          if (!response || !response.ok()) {
            const status = response?.status();
            if (status === 429 || (status != null && status >= 500)) providerUnavailableUntil = Date.now() + 60000;
            throw new Error(`SkinHub viewer returned ${status ? `HTTP ${status}` : "no document"}`);
          }
        }
        stage = "viewer-ready";
        await current.waitForFunction(()=>{
          const state=(window as unknown as {__weaponRender:RenderState}).__weaponRender;
          return state.ready || state.error;
        },undefined,{polling:100,timeout:45000});
        const error=await current.evaluate(()=>(window as unknown as {__weaponRender:RenderState}).__weaponRender.error);
        if (error) throw new Error(error);
        stage = "item-identity";
        const identity=await current.evaluate(()=>(window as unknown as {__weaponRender:RenderState}).__weaponRender.item);
        if(!matchesItem(identity,expected))
          throw new Error("Renderer did not accept the requested item identity");
        stage = "canvas-visible";
        await current.locator("canvas").waitFor({state:"visible",timeout:45000});
        // The viewer fades its canvas in after ready. A visible canvas can still
        // be partially transparent, which would make its cached image too dim.
        stage = "canvas-opacity";
        await current.waitForFunction(finishFade=>{
          if ((window as unknown as {__weaponRender:RenderState}).__weaponRender.error) return true;
          let element: Element | null = document.querySelector("canvas");
          if (!element) return false;
          while (element) {
            // Complete only the presentation fade toward full opacity. Keep
            // model animation and fade-outs intact, and still check every
            // ancestor below before capturing the fully composed frame.
            // Charms can adjust framing after ready; keep their natural fade.
            for (const animation of finishFade ? element.getAnimations() : []) {
              const frames=animation.effect instanceof KeyframeEffect ? animation.effect.getKeyframes() : [];
              if ((animation as CSSTransition).transitionProperty === "opacity" && Number(frames.at(-1)?.opacity) === 1) {
                try { animation.finish(); } catch { /* The normal opacity gate remains authoritative. */ }
              }
            }
            if (Number(getComputedStyle(element).opacity) < 1) return false;
            element = element.parentElement;
          }
          return true;
        },!item.charm,{timeout:15000});
        // Ready precedes the browser's painted frame. Never cache that blank.
        stage = "paint";
        await withTimeout(current.evaluate(()=>new Promise<void>(resolve=>requestAnimationFrame(()=>requestAnimationFrame(()=>resolve())))),
          30000, "Thumbnail paint timed out");
        // Capture the composed WebGL frame directly. Playwright's screenshot
        // helper otherwise waits for unrelated external web fonts indefinitely.
        stage = "capture";
        const cdp=await current.context().newCDPSession(current);
        let deadline: ReturnType<typeof setTimeout> | undefined;
        try {
          await cdp.send('Emulation.setDefaultBackgroundColorOverride',{color:{r:0,g:0,b:0,a:0}});
          const captureFrame = async () => {
            // Some models announce ready before their first visible GPU frame.
            // Ignore a transparent/solid canvas rather than caching it forever.
            for (;;) {
              const renderError=await current.evaluate(()=>(window as unknown as {__weaponRender:RenderState}).__weaponRender.error);
              if(renderError)throw new Error(renderError);
              const capture=await cdp.send('Page.captureScreenshot',{format:'png',fromSurface:true,captureBeyondViewport:false});
              const png=Buffer.from(capture.data,'base64');
              const {channels}=await sharp(png).extract({left:80,top:40,width:480,height:260}).stats();
              if(channels.slice(0,3).some(channel=>channel.stdev>4)) return png;
              await new Promise(resolve=>setTimeout(resolve,250));
            }
          };
          const png=await Promise.race([
            captureFrame(),
            new Promise<never>((_,reject)=>{deadline=setTimeout(()=>reject(new Error('Thumbnail capture timed out')),30000);}),
          ]);
          const buffer=await sharp(png).resize(640,360).webp({quality:82,effort:3}).toBuffer();
          const finalError=await current.evaluate(()=>(window as unknown as {__weaponRender:RenderState}).__weaponRender.error);
          if(finalError)throw new Error(finalError);
          lastItem=item;
          return buffer;
        } finally { clearTimeout(deadline); await cdp.detach().catch(()=>{}); }
      } catch (error) {
        console.warn("Weapon thumbnail render failed:", JSON.stringify({
          stage, elapsedMs: Date.now() - started,
          error: error instanceof Error ? diagnosticMessage(error.message) : "unknown renderer error",
          item: { defindex: item.defindex, paintIndex: item.paintIndex, float: item.float, seed: item.seed,
            statTrak: item.statTrak, stickers: item.stickers?.length ?? 0, charm: item.charm?.id ?? null },
          events,
        }));
        await close().catch(() => {});
        throw error;
      } finally {
        // Keep model assets and compiled shaders warm while players browse.
        idleTimer=setTimeout(()=>void close().catch(()=>{
          console.warn("Weapon thumbnail browser could not close cleanly");
        }),5*60000);
        idleTimer.unref?.();
      }
    },
  };
}
