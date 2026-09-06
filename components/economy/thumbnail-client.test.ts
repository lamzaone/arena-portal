import assert from "node:assert/strict";
import test, { type TestContext } from "node:test";
import { thumbnailSignature, type WeaponThumbnail } from "../../lib/economy/weapon-thumbnail.ts";
import { createWeaponThumbnailClient, type ThumbnailState } from "./thumbnail-client.ts";
type CacheStorage = Pick<Storage, "getItem" | "setItem">;
type Request = { items: WeaponThumbnail[]; signal: AbortSignal; at: number; waitMs?: number };
const item = (seed: number): WeaponThumbnail => ({ defindex: 7, paintIndex: 44, float: 0.2, seed });
const src = (seed: number) => `/api/economy/thumbnails/${String(seed).padStart(64, "0")}`;
const ready = (items: WeaponThumbnail[]) => Response.json({ tickets: items.map(value => ({ status: "ready", src: src(value.seed), retryAfterMs: 0 })) });
async function flush() { for (let index = 0; index < 12; index++) await Promise.resolve(); }
async function advance(t: TestContext, milliseconds: number) { t.mock.timers.tick(milliseconds); await flush(); }

test("cached snapshot clients batch reads without rendering, long polling or rapid retries", async t => {
  t.mock.timers.enable({apis:["Date","setTimeout"],now:1000});
  const requests:Array<{cacheOnly:boolean;waitMs:number;items:WeaponThumbnail[]}>=[];
  const client=createWeaponThumbnailClient((async(_url,options)=>{
    const body=JSON.parse(String(options?.body));requests.push(body);
    return Response.json({tickets:body.items.map(()=>({status:"unavailable",retryAfterMs:0}))});
  }) as typeof fetch,()=>undefined,{cacheOnly:true});
  t.after(()=>client.dispose());
  for(let seed=0;seed<20;seed++)client.watchWeaponThumbnail(item(seed),()=>{});
  await advance(t,16);
  assert.equal(requests.length,1);assert.equal(requests[0].items.length,20);
  assert.equal(requests[0].cacheOnly,true);assert.equal(requests[0].waitMs,0);
  await advance(t,29999);assert.equal(requests.length,1);
  await advance(t,1);assert.equal(requests.length,2);
});

test("a stalled snapshot read aborts in one second while normal artwork remains usable",async t=>{
  t.mock.timers.enable({apis:["Date","setTimeout"],now:1000});
  const signals:AbortSignal[]=[],states:ThumbnailState[]=[];
  const client=createWeaponThumbnailClient((async(_url,options)=>{
    const signal=options!.signal as AbortSignal;signals.push(signal);
    return new Promise((_resolve,reject)=>signal.addEventListener('abort',()=>reject(new Error('aborted')),{once:true}));
  }) as typeof fetch,()=>undefined,{cacheOnly:true});
  t.after(()=>client.dispose());client.watchWeaponThumbnail(item(1),state=>states.push(state));
  await advance(t,16);await advance(t,1000);
  assert.equal(signals[0].aborted,true);assert.equal(states.at(-1)?.status,'unavailable');
  await advance(t,29999);assert.equal(signals.length,1);
});
async function setup(t: TestContext, response: (request: Request, index: number) => Promise<Response> | Response = request => ready(request.items), storage?: () => CacheStorage | undefined) {
  t.mock.timers.enable({ apis: ["Date", "setTimeout"], now: 1_000 });
  const requests: Request[] = [];
  const fetcher = (async (_url: string | URL | globalThis.Request, options?: RequestInit) => {
    const body = JSON.parse(String(options?.body));
    const request = { items: body.items, waitMs: body.waitMs, signal: options!.signal as AbortSignal, at: Date.now() };
    requests.push(request);
    return response(request, requests.length - 1);
  }) as typeof fetch;
  const client = createWeaponThumbnailClient(fetcher, storage);
  t.after(() => client.dispose());
  return { client, requests };
}

test("a newly visible identity preempts an existing sixty-second retry timer", async t => {
  const { client, requests } = await setup(t, (request, index) => index === 0
    ? Response.json({ tickets: [{ status: "unavailable", retryAfterMs: 60_000 }] })
    : ready(request.items));
  client.watchWeaponThumbnail(item(1), () => {});
  await advance(t, 400);
  assert.equal(requests.length, 1);
  const subscribedAt = Date.now();
  client.watchWeaponThumbnail(item(2), () => {});
  await advance(t, 16);
  assert.equal(requests.length, 2);
  assert.deepEqual(requests[1].items.map(value => value.seed), [2]);
  assert.equal(requests[1].at - subscribedAt, 16);
});

test("first requests batch for one frame and matching full identities share one ticket", async t => {
  const { client, requests } = await setup(t);
  const states: ThumbnailState[][] = [[],[]];
  client.watchWeaponThumbnail(item(3), value => states[0].push(value));
  client.watchWeaponThumbnail({ ...item(3) }, value => states[1].push(value));
  for (let seed = 4; seed < 24; seed++) client.watchWeaponThumbnail(item(seed), () => {});
  await advance(t,15); assert.equal(requests.length,0);
  await advance(t,1); await advance(t,0);
  assert.equal(requests[0].items.length,20);
  assert.ok(requests.every(request => request.items.length <= 20));
  assert.equal(requests.flatMap(request => request.items).length,21);
  assert.equal(states[0].at(-1)?.status,"ready"); assert.equal(states[1].at(-1)?.status,"ready");
});

test("ready cache hits notify immediately without another request", async t => {
  const { client, requests } = await setup(t);
  const stop = client.watchWeaponThumbnail(item(20), () => {});
  await advance(t,400); stop();
  const states: ThumbnailState[] = [];
  client.watchWeaponThumbnail(item(20), state => states.push(state));
  assert.deepEqual(states,[{status:"ready",src:src(20)}]);
  await advance(t,60_000); assert.equal(requests.length,1);
});

test("server queued retry hints are honored without a two-second floor", async t => {
  const { client, requests } = await setup(t, (request, index) => index === 0
    ? Response.json({tickets:[{status:"queued",retryAfterMs:500}]}) : ready(request.items));
  client.watchWeaponThumbnail(item(21), () => {});
  await advance(t,400);
  await advance(t,499); assert.equal(requests.length,1);
  await advance(t,1); assert.equal(requests.length,2);
});

test("transient HTTP failures recover with one and two-second retries", async t => {
  const { client, requests } = await setup(t, (request, index) => index < 2 ? new Response(null,{status:503}) : ready(request.items));
  const states: ThumbnailState[] = [];
  client.watchWeaponThumbnail(item(22), state => states.push(state));
  await advance(t,400);
  await advance(t,999); assert.equal(requests.length,1);
  await advance(t,1); assert.equal(requests.length,2);
  await advance(t,1999); assert.equal(requests.length,2);
  await advance(t,1); assert.equal(requests.length,3);
  assert.equal(states.at(-1)?.status,"ready");
});

test("unsubscribe cancels an unused timer and cancelled listeners receive no completion", async t => {
  const { client, requests } = await setup(t);
  const clear = t.mock.method(globalThis,"clearTimeout");
  const states: ThumbnailState[] = [];
  const stop = client.watchWeaponThumbnail(item(23), state => states.push(state));
  stop();
  assert.ok(clear.mock.callCount() > 0);
  await advance(t,60_000);
  assert.equal(requests.length,0); assert.deepEqual(states,[{status:"loading"}]);
});

test("orphaned requests abort and their late completion cannot block or overwrite a new identity", async t => {
  const completions: Array<(value: Response) => void> = [];
  const { client, requests } = await setup(t, () => new Promise(resolve => completions.push(resolve)));
  const oldStates: ThumbnailState[] = [], newStates: ThumbnailState[] = [];
  const stop = client.watchWeaponThumbnail(item(24), state => oldStates.push(state));
  await advance(t,400); stop();
  assert.equal(requests[0].signal.aborted,true);
  client.watchWeaponThumbnail(item(25), state => newStates.push(state));
  await advance(t,120); assert.equal(requests.length,2);
  completions[0](ready([item(24)])); await flush();
  assert.deepEqual(oldStates,[{status:"loading"}]); assert.deepEqual(newStates,[{status:"loading"}]);
  completions[1](ready([item(25)])); await flush();
  assert.deepEqual(newStates.at(-1),{status:"ready",src:src(25)});
});

test("disposing the client cancels pending work and suppresses late responses", async t => {
  let complete!: (value: Response) => void;
  const { client, requests } = await setup(t, () => new Promise(resolve => { complete=resolve; }));
  const states: ThumbnailState[] = [];
  client.watchWeaponThumbnail(item(26), state => states.push(state));
  await advance(t,400); client.dispose();
  assert.equal(requests[0].signal.aborted,true);
  complete(ready([item(26)])); await flush(); await advance(t,60_000);
  assert.deepEqual(states,[{status:"loading"}]); assert.equal(requests.length,1);
});

test("authentication failure pauses only affected entries and another item is requested promptly", async t => {
  const { client, requests } = await setup(t, (request,index) => index === 0 ? new Response(null,{status:401}) : ready(request.items));
  const stop=client.watchWeaponThumbnail(item(27),()=>{});
  await advance(t,400); await advance(t,1000);
  client.watchWeaponThumbnail(item(28),()=>{}); await advance(t,120);
  assert.equal(requests.length,2); assert.deepEqual(requests[1].items.map(value=>value.seed),[28]);
  await advance(t,60_000); assert.equal(requests.length,2);
  stop(); client.watchWeaponThumbnail(item(27),()=>{}); await advance(t,120);
  assert.equal(requests.length,3);
});

test("cache identities retain float, seed, and StatTrak differences", async t => {
  const { client, requests } = await setup(t);
  const variants: WeaponThumbnail[] = [item(30), { ...item(30), float: 0.200001 }, item(31), { ...item(30), statTrak: 0 }];
  for (const variant of variants) client.watchWeaponThumbnail(variant, () => {});
  await advance(t, 120);
  assert.equal(requests.length, 1);
  assert.deepEqual(requests[0].items, variants);
});

test("transient retry delays increase and remain capped at thirty seconds", async t => {
  const { client, requests } = await setup(t, () => new Response(null, { status: 503 }));
  client.watchWeaponThumbnail(item(32), () => {});
  await advance(t, 120);
  for (const [index, delay] of [1_000, 2_000, 5_000, 10_000, 20_000, 30_000, 30_000].entries()) {
    await advance(t, delay - 1);
    assert.equal(requests.length, index + 1);
    await advance(t, 1);
    assert.equal(requests.length, index + 2);
  }
});

test("removing the earliest subscriber moves the timer to the remaining deadline", async t => {
  const { client, requests } = await setup(t);
  const stop = client.watchWeaponThumbnail(item(33), () => {});
  await advance(t, 4);
  client.watchWeaponThumbnail(item(34), () => {});
  stop();
  await advance(t, 15);
  assert.equal(requests.length, 0);
  await advance(t, 1);
  assert.deepEqual(requests[0].items, [item(34)]);
});

test("a partially cancelled batch still serves its remaining subscriber", async t => {
  let complete!: (value: Response) => void;
  const { client, requests } = await setup(t, () => new Promise(resolve => { complete = resolve; }));
  const cancelled: ThumbnailState[] = [], subscribed: ThumbnailState[] = [];
  const stop = client.watchWeaponThumbnail(item(35), state => cancelled.push(state));
  client.watchWeaponThumbnail(item(36), state => subscribed.push(state));
  await advance(t, 120);
  stop();
  assert.equal(requests[0].signal.aborted, false);
  complete(ready(requests[0].items));
  await flush();
  assert.deepEqual(cancelled, [{ status: "loading" }]);
  assert.deepEqual(subscribed.at(-1), { status: "ready", src: src(36) });
});

test("invalidated in-flight results never restore stale artwork", async t => {
  const completions: Array<(value: Response) => void> = [];
  const { client, requests } = await setup(t, () => new Promise(resolve => completions.push(resolve)));
  const states: ThumbnailState[] = [];
  client.watchWeaponThumbnail(item(37), state => states.push(state));
  await advance(t, 120);
  client.invalidateWeaponThumbnail(item(37));
  assert.equal(requests[0].signal.aborted, true);
  completions[0](ready([item(37)]));
  await flush();
  assert.deepEqual(states, [{ status: "loading" }, { status: "unavailable" }]);
  await advance(t, 1_000);
  assert.equal(requests.length, 2);
  completions[1](ready([item(37)]));
  await flush();
  assert.equal(states.at(-1)?.status, "ready");
});

test("invalid thumbnail URLs recover without displaying external or old artwork", async t => {
  const { client, requests } = await setup(t, (request, index) => index === 0
    ? Response.json({ tickets: [{ status: "ready", src: "https://example.com/old-art.png", retryAfterMs: 0 }] })
    : ready(request.items));
  const states: ThumbnailState[] = [];
  client.watchWeaponThumbnail(item(38), state => states.push(state));
  await advance(t, 120);
  assert.deepEqual(states.at(-1), { status: "unavailable" });
  await advance(t, 1_000);
  assert.equal(requests.length, 2);
  assert.deepEqual(states.at(-1), { status: "ready", src: src(38) });
});

test("active-entry eviction retains visible items and can reuse the finished-preview index", async t => {
  const { client, requests } = await setup(t);
  client.watchWeaponThumbnail(item(0), () => {});
  for (let seed = 1; seed < 512; seed++) {
    const stop = client.watchWeaponThumbnail(item(seed), () => {});
    await advance(t, 120);
    stop();
  }
  client.watchWeaponThumbnail(item(512), () => {});
  await advance(t, 120);
  const states: ThumbnailState[] = [];
  client.watchWeaponThumbnail(item(0), state => states.push(state));
  assert.deepEqual(states, [{ status: "ready", src: src(0) }]);
  const before = requests.length;
  const restored: ThumbnailState[] = [];
  client.watchWeaponThumbnail(item(1), state => restored.push(state));
  await advance(t, 120);
  assert.equal(requests.length, before);
  assert.deepEqual(restored, [{ status: "ready", src: src(1) }]);
});

function memoryStorage(): CacheStorage {
  const values = new Map<string, string>();
  return { getItem: key => values.get(key) ?? null, setItem: (key, value) => { values.set(key, value); } };
}

test("a new client restores finished previews without waiting for another POST", async t => {
  const storage = memoryStorage();
  const { client, requests } = await setup(t, undefined, () => storage);
  client.watchWeaponThumbnail(item(40), () => {});
  await advance(t, 16);
  assert.equal(requests.length, 1);
  client.dispose();
  let requested = false;
  const reloaded = createWeaponThumbnailClient(async () => { requested = true; throw new Error("Cache should serve this item"); }, () => storage);
  t.after(() => reloaded.dispose());
  const states: ThumbnailState[] = [];
  reloaded.watchWeaponThumbnail(item(40), state => states.push(state));
  assert.deepEqual(states, [{ status: "ready", src: src(40) }]);
  await advance(t, 60_000);
  assert.equal(requested, false);
});

test("persistent previews remain separated by full float, seed, StatTrak and attachments", async t => {
  const storage = memoryStorage();
  const { client } = await setup(t, undefined, () => storage);
  client.watchWeaponThumbnail(item(41), () => {});
  await advance(t, 16);
  client.dispose();
  const reloaded = createWeaponThumbnailClient(async () => { throw new Error("No request yet"); }, () => storage);
  t.after(() => reloaded.dispose());
  const variants = [item(42), { ...item(41), float: 0.200000001 }, { ...item(41), statTrak: 0 },
    { ...item(41), stickers: [{ slot: 0 as const, id: 37, wear: 0.1 }] },
    { ...item(41), charm: { id: 5, seed: 7, offset: [0, 0, 1] as [number, number, number] } }];
  for (const variant of variants) {
    const states: ThumbnailState[] = [];
    reloaded.watchWeaponThumbnail(variant, state => states.push(state));
    assert.deepEqual(states, [{ status: "loading" }]);
  }
});

test("missing cached images are forgotten across reloads and can be regenerated", async t => {
  const storage = memoryStorage();
  const { client, requests } = await setup(t, undefined, () => storage);
  client.watchWeaponThumbnail(item(43), () => {});
  await advance(t, 16);
  client.invalidateWeaponThumbnail(item(43));
  const reloaded = createWeaponThumbnailClient(async () => ready([item(43)]), () => storage);
  t.after(() => reloaded.dispose());
  const states: ThumbnailState[] = [];
  reloaded.watchWeaponThumbnail(item(43), state => states.push(state));
  assert.deepEqual(states, [{ status: "loading" }]);
  await advance(t, 16);
  assert.deepEqual(states.at(-1), { status: "ready", src: src(43) });
  await advance(t, 1_000);
  assert.equal(requests.length, 2);
});

test("blocked browser storage and malformed stored data do not prevent previews", async t => {
  const { client } = await setup(t, undefined, () => { throw new Error("Storage denied"); });
  const states: ThumbnailState[] = [];
  client.watchWeaponThumbnail(item(44), state => states.push(state));
  await advance(t, 16);
  assert.deepEqual(states.at(-1), { status: "ready", src: src(44) });
  const corrupt = createWeaponThumbnailClient(async () => ready([item(45)]), () => ({
    getItem: () => "{invalid json", setItem: () => { throw new Error("Quota exceeded"); },
  }));
  t.after(() => corrupt.dispose());
  const recovered: ThumbnailState[] = [];
  corrupt.watchWeaponThumbnail(item(45), state => recovered.push(state));
  await advance(t, 16);
  assert.deepEqual(recovered.at(-1), { status: "ready", src: src(45) });
});

test("persistent cache keeps at most 512 finished identities", async t => {
  const storage = memoryStorage();
  const { client } = await setup(t, undefined, () => storage);
  for (let seed = 0; seed <= 512; seed++) {
    const stop = client.watchWeaponThumbnail(item(seed), () => {});
    await advance(t, 16);
    stop();
  }
  client.dispose();
  const reloaded = createWeaponThumbnailClient(async () => { throw new Error("No request yet"); }, () => storage);
  t.after(() => reloaded.dispose());
  const oldest: ThumbnailState[] = [], newest: ThumbnailState[] = [];
  reloaded.watchWeaponThumbnail(item(0), state => oldest.push(state));
  reloaded.watchWeaponThumbnail(item(512), state => newest.push(state));
  assert.deepEqual(oldest, [{ status: "loading" }]);
  assert.deepEqual(newest, [{ status: "ready", src: src(512) }]);
});

test("stored entries cannot redirect thumbnails to unrelated or external image URLs", async t => {
  const storage: CacheStorage = { getItem: () => JSON.stringify([
    [thumbnailSignature(item(46)), "https://example.com/old-art.webp"],
    [thumbnailSignature(item(47)), "/api/players/private-info"],
    [thumbnailSignature(item(48)), src(48)],
  ]), setItem: () => {} };
  const { client, requests } = await setup(t, undefined, () => storage);
  const states: ThumbnailState[][] = [[], [], []];
  for (let index = 0; index < 3; index++) client.watchWeaponThumbnail(item(46 + index), state => states[index].push(state));
  assert.deepEqual(states.map(values => values[0].status), ["loading", "loading", "ready"]);
  await advance(t, 16);
  assert.deepEqual(requests[0].items.map(value => value.seed), [46, 47]);
});

test("queued requests use completion-driven waiting without a fixed retry delay", async t => {
  const { client, requests } = await setup(t, (request,index) => index === 0
    ? Response.json({tickets:[{status:"queued",retryAfterMs:0}]}) : ready(request.items));
  client.watchWeaponThumbnail(item(50), () => {});
  await advance(t,16);
  await advance(t,0);
  assert.equal(requests.length,2);
  assert.ok(requests.every(request => request.waitMs === 5000));
  assert.equal(requests[1].at,requests[0].at);
});

test("newly requested items preempt an outstanding wait without losing existing subscribers", async t => {
  const completions: Array<(value:Response)=>void>=[];
  const {client,requests}=await setup(t,()=>new Promise(resolve=>completions.push(resolve)));
  const oldStates:ThumbnailState[]=[],nextStates:ThumbnailState[]=[];
  client.watchWeaponThumbnail(item(51),state=>oldStates.push(state));
  await advance(t,16);
  client.watchWeaponThumbnail(item(52),state=>nextStates.push(state));
  assert.equal(requests[0].signal.aborted,true);
  await advance(t,16);
  assert.equal(requests.length,2);
  assert.deepEqual(requests[1].items.map(value=>value.seed),[52,51]);
  completions[0](ready([item(51)]));await flush();
  assert.deepEqual(oldStates,[{status:"loading"}]);
  completions[1](ready(requests[1].items));await flush();
  assert.deepEqual(oldStates.at(-1),{status:"ready",src:src(51)});
  assert.deepEqual(nextStates.at(-1),{status:"ready",src:src(52)});
});

test("a newly selected item is included even when twenty older items are waiting", async t => {
  const {client,requests}=await setup(t,()=>new Promise(()=>{}));
  for(let seed=60;seed<80;seed++)client.watchWeaponThumbnail(item(seed),()=>{});
  await advance(t,16);
  client.watchWeaponThumbnail(item(80),()=>{});
  await advance(t,16);
  assert.equal(requests[0].signal.aborted,true);
  assert.equal(requests[1].items.length,20);
  assert.equal(requests[1].items[0].seed,80);
});

test("pending batches rotate so every subscribed identity stays renewed", async t => {
  const completions: Array<(value: Response) => void> = [];
  const { client, requests } = await setup(t, () => new Promise(resolve => completions.push(resolve)));
  for (let seed = 60; seed < 80; seed++) client.watchWeaponThumbnail(item(seed), () => {});
  await advance(t, 16);
  client.watchWeaponThumbnail(item(80), () => {});
  await advance(t, 16);
  for (let round = 1; round <= 5; round++) {
    const request = requests[round];
    assert.ok(request);
    await advance(t, request.waitMs!);
    completions[round](Response.json({ tickets: request.items.map(() => ({ status: "queued", retryAfterMs: 0 })) }));
    await flush();
    await advance(t, 0);
  }
  for (let index = 1; index < requests.length - 1; index++) {
    const consecutive = requests.slice(index, index + 2);
    assert.equal(new Set(consecutive.flatMap(request => request.items.map(value => value.seed))).size, 21,
      "every two requests must renew all 21 pending identities");
  }
  assert.ok(requests.slice(1).every(request => request.waitMs === 2500),
    "multiple batches must rotate within the ten-second server lease");
});
