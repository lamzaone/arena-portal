import assert from "node:assert/strict";
import { registerHooks } from "node:module";
import test from "node:test";
import { resolve } from "node:path";
import sharp from "sharp";
import { readInspectUrl } from "@skinhub/cdn/inspect";

// Only the browser transport is replaced. The production renderer's protocol
// listener, identity validation, pixel statistics, and WebP encoding all run.
const browserTransport = {
  launch: async (): Promise<unknown> => { throw new Error("Missing browser fixture"); },
  launchPersistentContext: async (_directory: string, _options: unknown): Promise<unknown> => { throw new Error("Missing persistent browser fixture"); },
};
Object.assign(globalThis, { __thumbnailRendererTest: browserTransport });
registerHooks({
  resolve(specifier, context, next) {
    if (specifier === "playwright") {
      return {
        url: `data:text/javascript,${encodeURIComponent("export const chromium = globalThis.__thumbnailRendererTest;")}`,
        shortCircuit: true,
      };
    }
    return next(specifier, context);
  },
});
const { createWeaponThumbnailRenderer } = await import("./thumbnail-renderer.ts");

const item = { defindex: 7, paintIndex: 44, float: 0.15, seed: 661, statTrak: false as const };
const transparent = await sharp({ create: { width: 640, height: 360, channels: 4, background: { r: 0, g: 0, b: 0, alpha: 0 } } }).png().toBuffer();
const solid = await sharp({ create: { width: 640, height: 360, channels: 4, background: { r: 90, g: 90, b: 90, alpha: 1 } } }).png().toBuffer();
const painted = await sharp({ create: { width: 640, height: 360, channels: 4, background: { r: 0, g: 0, b: 0, alpha: 0 } } })
  .composite([{ input: { create: { width: 220, height: 100, channels: 4, background: { r: 170, g: 85, b: 20, alpha: 1 } } }, left: 180, top: 100 }])
  .png().toBuffer();

type Frame = { png: Buffer; error?: boolean };
type FixtureState = { captures: number; closes: number; detached: number; opacityChecks: number; profiles: string[]; closeWait?: Promise<void>;
  navigations: number; patches: Record<string, unknown>[]; readyReset: boolean[]; corruptIdentity?: Record<string, unknown>; animations: unknown[];
  httpStatus: number; waits: number; ready: boolean; hangPaint?: () => void; onNavigate?: () => void; emitPage: (name: string, value?: unknown) => void };
type ViewerEvent = { source: unknown; origin: string; data: Record<string, unknown> };
type BrowserCallback = (value?: unknown) => unknown;

async function withFrames(
  frames: Frame[],
  run: (renderer: ReturnType<typeof createWeaponThumbnailRenderer>, state: FixtureState) => Promise<void>,
  options: { assetCacheDirectory?: string } = {},
) {
  const listeners = new Map<string, (value?: unknown) => void>();
  const state: FixtureState = { captures: 0, closes: 0, detached: 0, opacityChecks: 0, profiles: [], navigations: 0, patches: [], readyReset: [], animations: [],
    httpStatus: 200, waits: 0, ready: true, emitPage: (name, value) => listeners.get(name)?.(value) };
  let viewerItem: Record<string, unknown> = {};
  let pendingReady = 0;
  let onMessage: ((event: ViewerEvent) => void) | undefined;
  const fakeWindow = {
    addEventListener(name: string, listener: (event: ViewerEvent) => void) {
      assert.equal(name, "message");
      onMessage = listener;
    },
    postMessage(message: { type: string; patch?: { item: Record<string, unknown> } }) {
      if (message.type === "set") {
        const patch = message.patch!.item;
        state.patches.push(patch);
        state.readyReset.push(!(fakeWindow as unknown as { __weaponRender: { ready: boolean } }).__weaponRender.ready);
        if (patch.paintIndex != null && viewerItem.paintIndex !== patch.paintIndex) pendingReady = 3;
        viewerItem = { ...viewerItem, ...patch };
      } else if (message.type === "hello") emit({ type: "hello", state: { item: { ...viewerItem, ...state.corruptIdentity } } });
    },
  };
  const emit = (data: Record<string, unknown>) => onMessage?.({
    source: fakeWindow,
    origin: "https://skinhub.gg",
    data: { channel: "skinhub-viewer", v: 2, from: "viewer", ...data },
  });
  const page = {
    on(name: string, callback: (value?: unknown) => void) { listeners.set(name, callback); },
    async addInitScript(callback: BrowserCallback) { callback(); },
    async goto(url: string) {
      state.navigations++;
      state.onNavigate?.();
      const parameters = new URL(url).searchParams;
      const placement = readInspectUrl(parameters.get("i")!);
      viewerItem = {
        weaponType: parameters.get("weapon"), paintIndex: Number(parameters.get("paint")),
        float: Number(parameters.get("float")), seed: Number(parameters.get("seed")),
        statTrak: parameters.get("st") === "-1" ? false : Number(parameters.get("st")),
        nameTag: parameters.get("nametag") || null, legacyModel: parameters.get("legacy") === "1",
        stickers: [...placement.stickers, placement.keychain].map(slot => ({ ...slot, ...(slot && "wear" in slot ? { scale: 1 } : {}) })),
      };
      emit({ type: "hello", problems: [], state: { item: { ...viewerItem, ...state.corruptIdentity } } });
      if (state.ready) emit({ type: "ready" });
      return { ok: () => state.httpStatus < 400, status: () => state.httpStatus };
    },
    async evaluate(callback: BrowserCallback, value?: unknown) { return callback(value); },
    async waitForFunction(callback: BrowserCallback, value?: unknown) {
      state.waits++;
      for (let attempt = 0; attempt < 5; attempt++) {
        if (pendingReady && --pendingReady === 0) emit({ type: "ready" });
        if (await callback(value)) return;
      }
      assert.fail("The fixture must reach the production readiness gate");
    },
    locator(selector: string) {
      assert.equal(selector, "canvas");
      return { async waitFor() {} };
    },
    context() {
      return { async newCDPSession() {
        return {
          async send(method: string) {
            if (method !== "Page.captureScreenshot") return {};
            assert.equal(pendingReady, 0, "A previous ready cannot authorize capture of a newly loading finish");
            const frame = frames[state.captures++];
            // Exhausting the finite fixture fails immediately, so a broken
            // blank-frame retry cannot leave this test waiting for 30 seconds.
            if (!frame) throw new Error("Unexpected additional frame capture");
            if (frame.error) emit({ type: "error", error: { code: "render-failed" } });
            return { data: frame.png.toString("base64") };
          },
          async detach() { state.detached++; },
        };
      } };
    },
  };
  browserTransport.launch = async () => {
    let connected = true;
    return { isConnected: () => connected, newPage: async () => page,
      close: async () => { connected = false; state.closes++; } };
  };
  browserTransport.launchPersistentContext = async (directory, options) => {
    state.profiles.push(directory);
    assert.ok((options as { args: string[] }).args.includes("--disk-cache-size=1073741824"));
    const browser = await browserTransport.launch() as { close: () => Promise<void> };
    return { browser: () => browser, pages: () => [], newPage: async () => page, close: async () => { await state.closeWait; await browser.close(); } };
  };
  const globals = {
    window: fakeWindow,
    document: { querySelector: () => ({ parentElement: null, getAnimations: () => state.animations }) },
    getComputedStyle: () => ({ opacity: ++state.opacityChecks < 3 ? "0.5" : "1" }),
    location: { origin: "https://skinhub.gg" },
    requestAnimationFrame: (callback: (timestamp: number) => void) => { if (state.hangPaint) state.hangPaint(); else callback(0); return 0; },
    KeyframeEffect: Object,
  };
  const previous = Object.fromEntries(Object.keys(globals).map(key => [key, Object.getOwnPropertyDescriptor(globalThis, key)]));
  for (const [key, value] of Object.entries(globals)) Object.defineProperty(globalThis, key, { value, configurable: true, writable: true });
  const renderer = createWeaponThumbnailRenderer(options);
  try { await run(renderer, state); }
  finally {
    await renderer.close();
    for (const key of Object.keys(globals)) {
      if (previous[key]) Object.defineProperty(globalThis, key, previous[key]);
      else Reflect.deleteProperty(globalThis, key);
    }
  }
}

test("rejects an HTTP error page without waiting for ready and backs off an unavailable provider", async t => {
  let clock = Date.now(); t.mock.method(Date, "now", () => clock);
  const warnings: unknown[][] = []; t.mock.method(console, "warn", (...values: unknown[]) => warnings.push(values));
  await withFrames([{ png: painted }], async (renderer, state) => {
    state.httpStatus = 525;
    await assert.rejects(renderer.render(item), /SkinHub viewer returned HTTP 525/);
    assert.equal(state.waits, 0, "An HTTP error document can never announce viewer readiness");
    assert.equal(state.captures, 0);
    assert.equal(state.closes, 1);
    await assert.rejects(renderer.render({ ...item, seed: 2 }), /temporarily unavailable/);
    assert.equal(state.navigations, 1, "Other queued items must not immediately hammer the failing provider");
    assert.equal(warnings.length, 1, "The outage should be logged once, not for every queued item");
    const diagnostic = JSON.stringify(warnings[0]);
    assert.match(diagnostic, /navigation/);
    assert.match(diagnostic, /525/);
    assert.match(diagnostic, /661/);
    clock += 60001; state.httpStatus = 200;
    await renderer.render(item);
    assert.equal(state.captures, 1, "A later inventory scan must recover automatically");
  });
});

test("a missing individual viewer page does not pause renders of other items", async t => {
  t.mock.method(console, "warn", () => {});
  await withFrames([{ png: painted }], async (renderer, state) => {
    state.httpStatus = 404;
    await assert.rejects(renderer.render(item), /HTTP 404/);
    state.httpStatus = 200;
    await renderer.render({ ...item, seed: 2 });
    assert.equal(state.captures, 1);
  });
});

test("a readiness failure reports the item and bounded asset errors without inspect queries or name tags", async t => {
  const warnings: unknown[][] = []; t.mock.method(console, "warn", (...values: unknown[]) => warnings.push(values));
  await withFrames([], async (renderer, state) => {
    state.ready = false;
    state.onNavigate = () => {
      for (let index = 0; index < 12; index++) state.emitPage("response", {
        status: () => 503, url: () => `https://cdn.skinhub.gg/model-${index}.glb?i=private-inspect&nametag=private-name`,
      });
      state.emitPage("requestfailed", {
        failure: () => ({ errorText: "net::ERR_CONNECTION_RESET" }), url: () => "https://cdn.skinhub.gg/paint.vtex?token=private-token",
      });
      state.emitPage("pageerror", { message: "Fetch failed https://cdn.skinhub.gg/paint.vtex?token=private-token" });
    };
    await assert.rejects(renderer.render({ ...item, nameTag: "private-name" }));
    const diagnostic = JSON.parse(warnings[0][1] as string);
    assert.equal(diagnostic.stage, "viewer-ready");
    assert.equal(diagnostic.item.defindex, 7);
    assert.equal(diagnostic.item.seed, 661);
    assert.equal(diagnostic.events.length, 8);
    assert.match(JSON.stringify(diagnostic.events), /HTTP 503.*model-11/);
    assert.match(JSON.stringify(diagnostic.events), /ERR_CONNECTION_RESET/);
    assert.match(JSON.stringify(diagnostic.events), /JavaScript: Fetch failed/);
    assert.doesNotMatch(JSON.stringify(warnings), /private-/);
    assert.equal(state.captures, 0);
  });
});

test("a stalled paint frame releases the worker without caching a previous screenshot", async t => {
  t.mock.timers.enable({ apis: ["setTimeout"] });
  t.mock.method(console, "warn", () => {});
  await withFrames([{ png: painted }], async (renderer, state) => {
    let painted!: () => void;
    const started = new Promise<void>(resolve => { painted = resolve; });
    state.hangPaint = painted;
    const rendered = renderer.render(item);
    const rejected = assert.rejects(rendered, /paint.*timed out/i);
    await started; t.mock.timers.tick(30000); await rejected;
    assert.equal(state.captures, 0);
    assert.equal(state.closes, 1);
    state.hangPaint = undefined;
    await renderer.render({ ...item, seed: 2 });
    assert.equal(state.captures, 1);
  });
});

test("rejects a late renderer error even when the captured frame has visible pixels", async () => {
  await withFrames([{ png: painted, error: true }], async (renderer, state) => {
    await assert.rejects(renderer.render(item), /Renderer rejected the item/);
    assert.equal(state.captures, 1);
    assert.equal(state.closes, 1, "An errored browser must be discarded before another item renders");
    assert.equal(state.detached, 1);
  });
});

test("does not capture a visible but partially faded canvas", async () => {
  await withFrames([{ png: painted }], async (renderer, state) => {
    await renderer.render(item);
    assert.ok(state.opacityChecks >= 3, "Capture must wait until the viewer's fade-in finishes");
    assert.equal(state.captures, 1);
  });
});

test("reuses the document for a finish change only after a fresh ready and full identity acknowledgement", async () => {
  await withFrames([{ png: painted }, { png: painted }], async (renderer, state) => {
    await renderer.render(item);
    await renderer.render({ ...item, paintIndex: 180, seed: 3 });
    assert.equal(state.navigations, 1);
    assert.equal(state.patches.length, 1);
    assert.deepEqual(state.readyReset, [true], "The previous finish's ready event cannot release the new finish");
    assert.equal(state.patches[0].statTrak, false);
    assert.equal(state.patches[0].nameTag, null);
    assert.equal((state.patches[0].stickers as unknown[]).length, 6, "All sticker and charm slots must be stated");
    assert.equal(state.captures, 2);
  });
});

test("weapon, model, attachment, counter and name changes retain fresh navigation", async () => {
  const variants = [
    item, { ...item, defindex: 23 }, { ...item, legacyModel: true },
    { ...item, statTrak: 0 }, { ...item, nameTag: "Test" },
    { ...item, stickers: [{ slot: 0 as const, id: 37, wear: 0.1 }] },
    { ...item, charm: { id: 1, seed: 13 } }, item,
  ];
  await withFrames(variants.map(() => ({ png: painted })), async (renderer, state) => {
    for (const value of variants) await renderer.render(value);
    assert.equal(state.navigations, variants.length);
    assert.equal(state.patches.length, 0);
  });
});

test("a finish change with an unchanged charm navigates because its framing is asynchronous", async () => {
  await withFrames([{ png: painted }, { png: painted }], async (renderer, state) => {
    const customized = { ...item, charm: { id: 1, seed: 13 } };
    await renderer.render(customized);
    await renderer.render({ ...customized, paintIndex: 180 });
    assert.equal(state.navigations, 2);
    assert.equal(state.patches.length, 0);
  });
});

test("rejects acknowledged state with an old attachment or StatTrak counter before capture", async () => {
  for (const corruption of [{ statTrak: 0 }, { nameTag: "Old name" }, { stickers: [] }, { legacyModel: true }]) {
    await withFrames([{ png: painted }], async (renderer, state) => {
      state.corruptIdentity = corruption;
      await assert.rejects(renderer.render(item), /requested item identity/);
      assert.equal(state.captures, 0);
    });
  }
});

test("finishes only a canvas fade toward full opacity and retains the opacity gate", async () => {
  await withFrames([{ png: painted }], async (renderer, state) => {
    const finished: string[] = [];
    state.animations = [
      { transitionProperty: "opacity", effect: { getKeyframes: () => [{ opacity: 0 }, { opacity: 1 }] }, finish: () => finished.push("fade-in") },
      { transitionProperty: "opacity", effect: { getKeyframes: () => [{ opacity: 1 }, { opacity: 0 }] }, finish: () => finished.push("fade-out") },
      { transitionProperty: "transform", effect: { getKeyframes: () => [{ opacity: 1 }] }, finish: () => finished.push("model-motion") },
    ];
    await renderer.render(item);
    assert.ok(finished.includes("fade-in"));
    assert.ok(finished.every(value => value === "fade-in"));
    assert.ok(state.opacityChecks >= 3, "Finishing a known transition cannot bypass another faded ancestor");
  });
});

test("keeps the natural fade for charms whose framing continues to settle after ready", async () => {
  await withFrames([{ png: painted }], async (renderer, state) => {
    let finished = 0;
    state.animations = [{ transitionProperty: "opacity", effect: { getKeyframes: () => [{ opacity: 0 }, { opacity: 1 }] }, finish: () => finished++ }];
    await renderer.render({ ...item, charm: { id: 1, seed: 13 } });
    assert.equal(finished, 0);
    assert.ok(state.opacityChecks >= 3);
  });
});

test("reuses the persistent asset directory after closing and restarting the renderer", async () => {
  await withFrames([{ png: painted }, { png: painted }], async (renderer, state) => {
    await renderer.render(item);
    await renderer.close();
    await renderer.render({ ...item, seed: 2 });
    assert.deepEqual(state.profiles, [resolve("fixture-assets/server/models-7"), resolve("fixture-assets/server/models-7")]);
    assert.equal(state.captures, 2);
  }, { assetCacheDirectory: "fixture-assets/server" });
});

test("switching model buckets closes the browser and returns to the same persisted bucket", async () => {
  await withFrames([{ png: painted }, { png: painted }, { png: painted }], async (renderer, state) => {
    await renderer.render(item);
    await renderer.render({ ...item, defindex: 9, paintIndex: 344 });
    await renderer.render({ ...item, seed: 2 });
    assert.deepEqual(state.profiles, [7, 1, 7].map(bucket => resolve(`fixture-assets/server/models-${bucket}`)));
    assert.equal(state.closes, 2);
  }, { assetCacheDirectory: "fixture-assets/server" });
});

test("a request arriving during idle shutdown waits for the profile to be released", async () => {
  await withFrames([{ png: painted }, { png: painted }], async (renderer, state) => {
    await renderer.render(item);
    let release!: () => void;
    state.closeWait = new Promise<void>(resolve => { release = resolve; });
    const closing = renderer.close();
    const next = renderer.render({ ...item, seed: 2 });
    try {
      await Promise.resolve();
      await Promise.resolve();
      assert.equal(state.profiles.length, 1, "The still-open profile must not be launched a second time");
    } finally { release(); await closing; await next; }
    assert.equal(state.profiles.length, 2);
  }, { assetCacheDirectory: "fixture-assets/server" });
});

test("skips transparent and solid frames, then encodes only the painted preview", async () => {
  await withFrames([{ png: transparent }, { png: solid }, { png: painted }], async (renderer, state) => {
    const output = await renderer.render(item);
    const metadata = await sharp(output).metadata();
    assert.equal(state.captures, 3);
    assert.equal(metadata.format, "webp");
    assert.equal(metadata.width, 640);
    assert.equal(metadata.height, 360);
    const { channels } = await sharp(output).extract({ left: 80, top: 40, width: 480, height: 260 }).stats();
    assert.ok(channels.slice(0, 3).some(channel => channel.stdev > 4));
    assert.equal(state.closes, 0);
    assert.equal(state.detached, 1);
  });
});

test("stops retrying blank frames when a later capture reports a rendering failure", async () => {
  await withFrames([{ png: transparent }, { png: solid, error: true }], async (renderer, state) => {
    await assert.rejects(renderer.render(item), /Renderer rejected the item/);
    assert.equal(state.captures, 2);
    assert.equal(state.closes, 1);
    assert.equal(state.detached, 1);
  });
});
