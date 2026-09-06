import test from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { createThumbnailCache } from "./thumbnail-cache.ts";
import { normalizeWeaponThumbnail } from "./weapon-thumbnail.ts";

const item=normalizeWeaponThumbnail({defindex:7,paintIndex:44,float:0.15,seed:661,statTrak:false});
async function fixture(run:(directory:string)=>Promise<void>){
  const directory=await mkdtemp(join(tmpdir(),'arena-thumbnails-test-'));
  try {await run(directory);} finally {
    assert.ok(resolve(directory).startsWith(resolve(tmpdir())+requireSeparator()));
    assert.ok(directory.includes('arena-thumbnails-test-'));
    await rm(directory,{recursive:true,force:true});
  }
}
function requireSeparator(){return process.platform==='win32'?'\\':'/';}

test("cache-only lookups never render or consume a creation budget",async()=>fixture(async directory=>{
  let renders=0;
  const cache=createThumbnailCache({directory,maxNewPerHour:1,render:async()=>{renders++;return Buffer.from('snapshot');}});
  const missing=await cache.lookup(item);
  assert.equal(missing.status,'unavailable');
  await cache.drain();assert.equal(renders,0);
  await cache.request(item,'player');await cache.drain();
  assert.equal((await cache.lookup(item)).status,'ready');
  assert.equal(renders,1);
}));

test("trusted background jobs survive closed pages and retain queue bounds",async t=>fixture(async directory=>{
  let clock=Date.now();t.mock.method(Date,'now',()=>clock);
  const gate=deferred(),started=deferred();const seeds:number[]=[];
  const cache=createThumbnailCache({directory,maxPending:2,maxNewPerHour:0,render:async value=>{seeds.push(value.seed);started.resolve();await gate.promise;return Buffer.from('snapshot');}});
  assert.equal((await cache.request(item,'owner',{background:true})).status,'queued');await started.promise;
  const second=await cache.request({...item,seed:2},'owner',{background:true});
  assert.equal((await cache.request({...item,seed:3},'owner',{background:true})).status,'busy');
  clock+=60000;gate.resolve();await cache.drain();
  assert.deepEqual(seeds,[661,2]);
  assert.equal((await cache.read(second.key))?.toString(),'snapshot');
  assert.equal((await cache.request({...item,seed:3},'owner')).status,'busy','Untrusted requests keep their normal quota');
}));

test("deduplicates simultaneous exact renders and survives cache recreation",async()=>fixture(async(directory)=>{
  let calls=0;
  const cache=createThumbnailCache({directory,render:async()=>{calls++;return Buffer.from('test-image');}});
  const tickets=await Promise.all(Array.from({length:12},()=>cache.request(item,'player')));
  assert.equal(new Set(tickets.map(ticket=>ticket.key)).size,1);
  await cache.drain();
  assert.equal(calls,1);
  assert.equal((await cache.request(item,'player')).status,'ready');
  const recreated=createThumbnailCache({directory,render:async()=>{throw Error('must not render a cached image');}});
  assert.equal((await recreated.request(item,'another-player')).status,'ready');
  assert.equal((await recreated.read(tickets[0].key))?.toString(),'test-image');
  assert.equal(await recreated.read('../outside'),null);
}));
test("failure never becomes an image and retries are cooled down",async()=>fixture(async(directory)=>{
  let calls=0;
  const cache=createThumbnailCache({directory,render:async()=>{calls++;throw Error('renderer unavailable');}});
  const ticket=await cache.request(item,'player');
  await cache.drain();
  assert.equal((await cache.request(item,'player')).status,'unavailable');
  assert.equal(await cache.read(ticket.key),null);
  assert.equal(calls,1);
}));
test("bounded queue does not drop existing jobs when new requests exceed capacity",async()=>fixture(async(directory)=>{
  let finish!:()=>void;
  const block=new Promise<void>(resolve=>{finish=resolve;});
  const cache=createThumbnailCache({directory,maxPending:2,render:async()=>{await block;return Buffer.from('image');}});
  assert.equal((await cache.request(item,'player')).status,'queued');
  assert.equal((await cache.request({...item,seed:2},'player')).status,'queued');
  assert.equal((await cache.request({...item,seed:3},'player')).status,'busy');
  finish();await cache.drain();
  assert.equal((await cache.request(item,'player')).status,'ready');
}));
test("creation rate limits do not block ready files or duplicate jobs",async()=>fixture(async(directory)=>{
  const cache=createThumbnailCache({directory,maxNewPerHour:1,render:async()=>Buffer.from('image')});
  await cache.request(item,'player');await cache.drain();
  assert.equal((await cache.request(item,'player')).status,'ready');
  assert.equal((await cache.request({...item,seed:2},'player')).status,'busy');
  assert.equal((await cache.request({...item,seed:2},'other')).status,'queued');
  await cache.drain();
}));
test("persistent disk budget evicts old renders before writing a new file",async()=>fixture(async(directory)=>{
  const cache=createThumbnailCache({directory,maxBytes:8,render:async()=>Buffer.from('image')});
  const first=await cache.request(item,'player');await cache.drain();
  const recreated=createThumbnailCache({directory,maxBytes:8,render:async()=>Buffer.from('other')});
  const second=await recreated.request({...item,seed:2},'player');await recreated.drain();
  assert.equal(await recreated.read(first.key),null);
  assert.equal((await recreated.read(second.key))?.toString(),'other');
}));
test("abandoned preview selections cannot occupy the queue ahead of current tickets",async(t)=>fixture(async(directory)=>{
  let clock=Date.now();t.mock.method(Date,'now',()=>clock);
  let finish!:()=>void, started!:()=>void;
  const block=new Promise<void>(resolve=>{finish=resolve;});
  const firstStarted=new Promise<void>(resolve=>{started=resolve;});
  const seeds:number[]=[];
  const cache=createThumbnailCache({directory,render:async(value)=>{seeds.push(value.seed);started();await block;return Buffer.from('image');}});
  await cache.request(item,'player');await firstStarted;
  const abandoned=await cache.request({...item,seed:2},'player');
  clock+=11000;
  await cache.request({...item,seed:3},'player');
  finish();await cache.drain();
  assert.deepEqual(seeds,[661,3]);
  assert.equal(await cache.read(abandoned.key),null);
}));

function deferred() {
  let resolve!: () => void;
  const promise = new Promise<void>(done => { resolve = done; });
  return { promise, resolve };
}

async function signalWithin(signal: Promise<void>, message: string) {
  let timeout: ReturnType<typeof setTimeout> | undefined;
  try {
    await Promise.race([signal, new Promise<never>((_, reject) => {
      timeout = setTimeout(() => reject(new Error(message)), 1500);
    })]);
  } finally { clearTimeout(timeout); }
}

test("optional grouping reduces mixed-page profile switches while preserving exact identities and FIFO by default", async () => {
  for (const grouped of [false, true]) await fixture(async directory => {
    const started = deferred(), release = deferred();
    const rendered: typeof item[] = [];
    const cache = createThumbnailCache({
      directory,
      groupForItem: grouped ? value => String(value.defindex % 8) : undefined,
      render: async value => {
        if (value.seed === 999) { started.resolve(); await release.promise; }
        else rendered.push(value);
        return Buffer.from("image");
      },
    });
    await cache.request({ ...item, seed: 999 }, "primer");
    await started.promise;
    const definitions = [8, 1, 2, 3, 4, 13, 14, 7];
    const page = Array.from({ length: 20 }, (_, seed) => ({
      ...item, defindex: definitions[seed % 8], seed, float: 0.1 + seed / 1000,
    }));
    for (const value of page) await cache.request(value, "player");
    release.resolve();
    await cache.drain();
    assert.equal(rendered[0], page[0], "The oldest queued job must render first");
    assert.deepEqual([...rendered].sort((a, b) => a.seed - b.seed), page,
      "Grouping must preserve every exact float/seed/configuration");
    const switches = rendered.slice(1).filter((value, index) =>
      value.defindex % 8 !== rendered[index].defindex % 8).length;
    assert.equal(switches, grouped ? 7 : 19);
    if (!grouped) assert.deepEqual(rendered, page);
  });
});

test("grouping cannot pull later matching arrivals ahead of a bounded cohort or starve another owner", async () => fixture(async directory => {
  const started = deferred(), release = deferred();
  const seeds: number[] = [];
  const cache = createThumbnailCache({
    directory,
    groupForItem: value => String(value.defindex % 8),
    render: async value => {
      if (value.seed === 999) { started.resolve(); await release.promise; }
      else {
        seeds.push(value.seed);
        if (value.seed === 0 || value.seed === 2)
          await cache.request({ ...item, seed: 100 + value.seed }, "new-owner");
      }
      return Buffer.from("image");
    },
  });
  await cache.request({ ...item, seed: 999 }, "primer");
  await started.promise;
  for (let seed = 0; seed < 21; seed++) await cache.request(
    { ...item, seed, defindex: seed === 1 ? 1 : 7 }, seed === 1 ? "waiting-owner" : "busy-owner",
  );
  release.resolve();
  await cache.drain();
  assert.equal(seeds[0], 0);
  assert.equal(seeds.indexOf(1), 19, "A different bucket waits no longer than its original 20-job cohort");
  assert.equal(seeds.indexOf(20), 20, "Even an already queued matching job outside the cohort cannot jump in");
  assert.deepEqual(new Set(seeds.slice(0, 20)), new Set(Array.from({ length: 20 }, (_, seed) => seed)));
  assert.deepEqual(seeds.slice(21), [100, 102], "New owners retain arrival order in their next cohort");
}));

test("grouped jobs recheck expiry at execution and keep renewed visible selections", async t => fixture(async directory => {
  let clock = Date.now();
  t.mock.method(Date, "now", () => clock);
  const started = deferred(), release = deferred();
  const seeds: number[] = [];
  const renewed = { ...item, seed: 3 };
  const cache = createThumbnailCache({
    directory,
    groupForItem: value => String(value.defindex % 8),
    render: async value => {
      seeds.push(value.seed);
      if (value.seed === 999) { started.resolve(); await release.promise; }
      if (value.seed === 1) {
        clock += 11000;
        await cache.request(renewed, "player");
      }
      return Buffer.from("image");
    },
  });
  await cache.request({ ...item, seed: 999 }, "primer");
  await started.promise;
  await cache.request({ ...item, seed: 1 }, "player");
  const expired = await cache.request({ ...item, seed: 2, defindex: 1 }, "other-owner");
  await cache.request(renewed, "player");
  release.resolve();
  await cache.drain();
  assert.deepEqual(seeds, [999, 1, 3]);
  assert.equal(await cache.read(expired.key), null);
  assert.equal((await cache.request(renewed, "player")).status, "ready");
}));

test("independent lanes keep running later cohorts while the other lane is blocked", async () => fixture(async directory => {
  const primerStarted = deferred(), primerRelease = deferred();
  const started = Array.from({ length: 5 }, deferred), release = Array.from({ length: 5 }, deferred);
  const active = [0, 0], maximum = [0, 0], order: number[] = [];
  let drained = false;
  const cache = createThumbnailCache({
    directory, renderLanes: 2,
    laneForItem: value => value.seed % 2,
    groupForItem: value => String(value.seed % 2),
    render: async value => {
      if (value.seed === 999) { primerStarted.resolve(); await primerRelease.promise; }
      else {
        const lane = value.seed % 2;
        active[lane]++; maximum[lane] = Math.max(maximum[lane], active[lane]);
        order.push(value.seed); started[value.seed].resolve();
        await release[value.seed].promise;
        active[lane]--;
      }
      return Buffer.from("image");
    },
  });
  await cache.request({ ...item, seed: 999 }, "primer"); await primerStarted.promise;
  for (const seed of [1, 0, 3, 2]) await cache.request({ ...item, seed }, "player");
  const drain = cache.drain().then(() => { drained = true; });
  try {
    await signalWithin(started[0].promise, "The idle lane must start while the other lane's first cohort is blocked");
    assert.deepEqual(order, [0]);
    primerRelease.resolve();
    await signalWithin(Promise.all([started[1].promise, started[0].promise]).then(() => {}), "Both lanes must start before either first render finishes");
    assert.deepEqual(order, [0, 1]);
    assert.deepEqual(active, [1, 1]);
    await cache.request({ ...item, seed: 4 }, "later-owner");
    release[0].resolve();
    await signalWithin(started[2].promise, "Lane 0 should progress while lane 1 remains blocked");
    assert.deepEqual(order, [0, 1, 2]);
    assert.equal(drained, false);
    release[2].resolve();
    await signalWithin(started[4].promise, "A free lane must start its next cohort before the other lane finishes");
    assert.equal(active[1], 1);
    release[4].resolve(); release[1].resolve();
    await signalWithin(started[3].promise, "Lane 1 must retain its remaining job");
    assert.equal(drained, false);
    release[3].resolve();
    await drain;
    assert.deepEqual(maximum, [1, 1]);
    assert.deepEqual(active, [0, 0]);
  } finally { primerRelease.resolve(); release.forEach(gate => gate.resolve()); await drain; }
}));

test("waiting for a finished ticket resolves only after its image is published", async () => fixture(async directory => {
  const started = deferred(), release = deferred();
  const cache = createThumbnailCache({ directory, render: async () => { started.resolve(); await release.promise; return Buffer.from("image"); } });
  const ticket = await cache.request(item, "player");
  await started.promise;
  let finished = false;
  const wait = cache.waitForAny([ticket.key, ticket.key], new AbortController().signal, 5000).then(() => { finished = true; });
  await Promise.resolve();
  assert.equal(finished, false);
  release.resolve();
  await signalWithin(wait, "Published images must wake queued requests immediately");
  assert.equal((await cache.read(ticket.key))?.toString(), "image");
  await cache.waitForAny([ticket.key], new AbortController().signal, 5000);
  await cache.drain();
}));

test("ticket waiters wake after failures and expired queued jobs are removed", async t => fixture(async directory => {
  let clock = Date.now(); t.mock.method(Date, "now", () => clock);
  const started = deferred(), release = deferred();
  const cache = createThumbnailCache({ directory, render: async value => {
    if (value.seed === 661) { started.resolve(); await release.promise; throw new Error("Render failure"); }
    return Buffer.from("image");
  } });
  const failing = await cache.request(item, "player");
  await started.promise;
  const abandoned = await cache.request({ ...item, seed: 2 }, "player");
  const failedWait = cache.waitForAny([failing.key], new AbortController().signal, 5000);
  const abandonedWait = cache.waitForAny([abandoned.key], new AbortController().signal, 5000);
  clock += 11000;
  release.resolve();
  await signalWithin(Promise.all([failedWait, abandonedWait]).then(() => {}), "Failed and expired jobs must both wake their waiters");
  await cache.drain();
  assert.equal((await cache.request(item, "player")).status, "unavailable");
  assert.equal(await cache.read(abandoned.key), null);
}));

test("waiting for any lane wakes on its first publication without expiring another lane's active render", async t => fixture(async directory => {
  let clock = Date.now(); t.mock.method(Date, "now", () => clock);
  const started = [deferred(), deferred()], release = [deferred(), deferred()];
  const cache = createThumbnailCache({ directory, renderLanes: 2, laneForItem: value => value.seed % 2,
    render: async value => {
      const lane = value.seed % 2;
      started[lane].resolve(); await release[lane].promise;
      return Buffer.from(`image-${lane}`);
    },
  });
  const slow = await cache.request({ ...item, seed: 1 }, "player");
  await started[1].promise;
  let slowFinished = false;
  const slowWait = cache.waitForAny([slow.key], new AbortController().signal, 5000).then(() => { slowFinished = true; });
  clock += 11000;
  const fast = await cache.request({ ...item, seed: 0 }, "player");
  const controller = new AbortController();
  const removed = t.mock.method(controller.signal, "removeEventListener");
  const either = cache.waitForAny([slow.key, fast.key], controller.signal, 5000);
  try {
    await started[0].promise;
    assert.equal(slowFinished, false, "The other worker must not prune an active render after its ticket ages");
    release[0].resolve();
    await signalWithin(either, "A published image must wake a batch whose other image is still rendering");
    assert.equal((await cache.read(fast.key))?.toString(), "image-0");
    assert.equal(await cache.read(slow.key), null);
    assert.equal(slowFinished, false);
    assert.equal(removed.mock.callCount(), 1);
    release[1].resolve();
    await slowWait;
    assert.equal(removed.mock.callCount(), 1, "A completed wait must detach from all remaining keys");
  } finally { release.forEach(gate => gate.resolve()); await cache.drain(); }
}));

test("ticket waits cancel cleanly, handle completed-ticket races and cap the timeout", async t => fixture(async directory => {
  t.mock.timers.enable({ apis: ["setTimeout"] });
  const started = deferred(), release = deferred();
  const cache = createThumbnailCache({ directory, render: async () => { started.resolve(); await release.promise; return Buffer.from("image"); } });
  const ticket = await cache.request(item, "player");
  await started.promise;
  try {
    const controller = new AbortController();
    const removed = t.mock.method(controller.signal, "removeEventListener");
    const cancelled = cache.waitForAny([ticket.key], controller.signal, 5000);
    controller.abort();
    await cancelled;
    assert.equal(removed.mock.callCount(), 1);
    await cache.waitForAny([ticket.key], controller.signal, 5000);
    await cache.waitForAny([], new AbortController().signal, 5000);
    await cache.waitForAny(["already-finished"], new AbortController().signal, 5000);
    let timedOut = false;
    const timeout = cache.waitForAny([ticket.key], new AbortController().signal, 60000).then(() => { timedOut = true; });
    t.mock.timers.tick(4999); await Promise.resolve();
    assert.equal(timedOut, false);
    t.mock.timers.tick(1); await timeout;
    assert.equal(timedOut, true);
  } finally { release.resolve(); await cache.drain(); }
}));

test("a late render failure leaves the other lane running and does not abort subsequent jobs", async () => fixture(async directory => {
  const primerStarted = deferred(), primerRelease = deferred();
  const failingStarted = deferred(), otherStarted = deferred(), nextStarted = deferred();
  const fail = deferred(), finishOther = deferred();
  const cache = createThumbnailCache({
    directory, renderLanes: 2, laneForItem: value => value.seed % 2,
    render: async value => {
      if (value.seed === 999) { primerStarted.resolve(); await primerRelease.promise; }
      if (value.seed === 0) { failingStarted.resolve(); await fail.promise; throw new Error("late GPU failure"); }
      if (value.seed === 1) { otherStarted.resolve(); await finishOther.promise; }
      if (value.seed === 2) nextStarted.resolve();
      return Buffer.from("image");
    },
  });
  await cache.request({ ...item, seed: 999 }, "primer"); await primerStarted.promise;
  for (const seed of [0, 1, 2]) await cache.request({ ...item, seed }, "player");
  primerRelease.resolve();
  try {
    await signalWithin(Promise.all([failingStarted.promise, otherStarted.promise]).then(() => {}), "Both lanes must be active before the delayed failure");
    fail.resolve();
    await signalWithin(nextStarted.promise, "A failed lane must continue with its next job");
    assert.equal((await cache.request({ ...item, seed: 0 }, "player")).status, "unavailable");
    assert.equal((await cache.request({ ...item, seed: 1 }, "player")).status, "queued");
  } finally { primerRelease.resolve(); fail.resolve(); finishOther.resolve(); await cache.drain(); }
  for (const seed of [1, 2]) assert.equal((await cache.request({ ...item, seed }, "player")).status, "ready");
}));

test("simultaneous lane completions retain the shared disk budget", async () => fixture(async directory => {
  const primerStarted = deferred(), primerRelease = deferred(), bothStarted = deferred(), release = deferred();
  let started = 0;
  const cache = createThumbnailCache({
    directory, maxBytes: 8, renderLanes: 2, laneForItem: value => value.seed % 2,
    render: async value => {
      if (value.seed === 999) { primerStarted.resolve(); await primerRelease.promise; return Buffer.from("p"); }
      if (++started === 2) bothStarted.resolve();
      await release.promise;
      return Buffer.from("image");
    },
  });
  const tickets = [await cache.request({ ...item, seed: 999 }, "primer")];
  await primerStarted.promise;
  for (const seed of [0, 1]) tickets.push(await cache.request({ ...item, seed }, "player"));
  primerRelease.resolve();
  try { await signalWithin(bothStarted.promise, "Both lane outputs must be ready to publish together"); }
  finally { primerRelease.resolve(); release.resolve(); await cache.drain(); }
  const stored = await Promise.all(tickets.map(ticket => cache.read(ticket.key)));
  assert.equal(stored.filter(Boolean).length, 1);
  assert.ok(stored.reduce((size, image) => size + (image?.length ?? 0), 0) <= 8);
}));
