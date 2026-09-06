import test from "node:test";
import assert from "node:assert/strict";
import { createBrowserThumbnailClient } from "./browser-thumbnail-client.ts";
import { normalizeWeaponThumbnail } from "../../lib/economy/weapon-thumbnail.ts";
import type { ThumbnailState } from "./thumbnail-client.ts";

const item = (seed = 1) => normalizeWeaponThumbnail({ defindex: 7, paintIndex: 44, float: .02, seed });
const image = () => new Blob(["webp"], { type: "image/webp" });
const tick = () => new Promise(resolve => setTimeout(resolve, 10));
const storage = () => ({ get: async () => undefined, put: async () => {}, delete: async () => {} });

test("twenty cards share one sequential renderer and identical appearances share one job", async () => {
  let active = 0, peak = 0, calls = 0;
  const client = createBrowserThumbnailClient({ cache: storage(), startDelay: 0, render: async () => {
    calls++; peak = Math.max(peak, ++active); await tick(); active--; return image();
  } });
  try {
    const ready: string[] = [];
    const stops = Array.from({ length: 20 }, (_, index) => client.watch(item(index % 10), state => { if (state.status === "ready") ready.push(state.src!); }));
    for (let i = 0; i < 100 && ready.length < 20; i++) await tick();
    assert.equal(ready.length, 20); assert.equal(calls, 10); assert.equal(peak, 1);
    assert.equal(new Set(ready).size, 10);
    stops.forEach(stop => stop());
  } finally { client.dispose(); }
});

test("persistent image hits bypass rendering and storage failures do not stop rendering", async () => {
  let calls = 0;
  const client = createBrowserThumbnailClient({ cache: { ...storage(), get: async signature => {
    if (signature.includes('"seed":1')) return image(); throw new Error("storage disabled");
  } }, startDelay: 0, render: async () => { calls++; return image(); } });
  try {
    const states: ThumbnailState[] = [];
    client.watch(item(1), state => states.push(state)); await tick();
    assert.equal(states.at(-1)?.status, "ready"); assert.equal(calls, 0);
    client.watch(item(2), state => states.push(state)); await tick(); await tick();
    assert.equal(states.at(-1)?.status, "ready"); assert.equal(calls, 1);
  } finally { client.dispose(); }
});

test("changing pages aborts unused work and never delivers its image to the new selection", async () => {
  const rendered: number[] = []; let aborted = false;
  const client = createBrowserThumbnailClient({ cache: storage(), startDelay: 0, render: async (value, signal) => {
    rendered.push(value.seed);
    if (value.seed === 1) await new Promise<void>((_, reject) => signal.addEventListener("abort", () => { aborted = true; reject(new Error("cancelled")); }, { once: true }));
    return image();
  } });
  try {
    const oldStates: ThumbnailState[] = [], nextStates: ThumbnailState[] = [];
    const stop = client.watch(item(1), state => oldStates.push(state));
    const queued = client.watch(item(2), () => {}); await tick();
    stop(); queued(); client.watch(item(3), state => nextStates.push(state));
    await tick(); await tick();
    assert.equal(aborted, true); assert.deepEqual(rendered, [1, 3]);
    assert.equal(oldStates.some(state => state.status === "ready"), false);
    assert.equal(nextStates.at(-1)?.status, "ready");
  } finally { client.dispose(); }
});

test("one failed model does not block the queue, and unused blob URLs are revoked on eviction", async () => {
  const revoked: string[] = []; let sequence = 0;
  const client = createBrowserThumbnailClient({ cache: storage(), startDelay: 0, maxEntries: 2,
    objectUrl: () => `blob:${++sequence}`, revokeUrl: value => revoked.push(value),
    render: async value => { if (value.seed === 1) throw new Error("missing model"); return image(); } });
  try {
    const first: ThumbnailState[] = [], second: ThumbnailState[] = [];
    const stop1 = client.watch(item(1), state => first.push(state));
    const stop2 = client.watch(item(2), state => second.push(state)); await tick(); await tick();
    assert.equal(first.at(-1)?.status, "unavailable"); assert.equal(second.at(-1)?.status, "ready");
    stop1(); stop2(); client.watch(item(3), () => {}); await tick(); await tick();
    client.watch(item(4), () => {}); await tick(); await tick();
    assert.ok(revoked.includes(second.at(-1)!.src!));
  } finally { client.dispose(); }
  assert.equal(revoked.length, sequence);
});

test("an old subscription stopped twice cannot remove a returning card's job", async () => {
  const client = createBrowserThumbnailClient({ cache: storage(), startDelay: 0, render: async () => image() });
  try {
    const stop = client.watch(item(), () => {}); stop();
    const states: ThumbnailState[] = [];
    client.watch(item(), state => states.push(state)); stop();
    await tick(); await tick();
    assert.equal(states.at(-1)?.status, "ready");
  } finally { client.dispose(); }
});
