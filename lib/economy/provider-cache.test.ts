import assert from "node:assert/strict";
import { registerHooks } from "node:module";
import test, { type TestContext } from "node:test";

registerHooks({ resolve(specifier, context, next) {
  if (specifier === "server-only") return { url: "data:text/javascript,export{}", shortCircuit: true };
  return next(specifier, context);
} });

const padding = "x".repeat(2 * 1024 * 1024);
const normal = "AK-47 | Case Hardened (Field-Tested)";
const stattrak = `StatTrak™ ${normal}`;
let moduleId = 0;
const freshModule = (path: string) => import(new URL(`${path}?cache-test=${++moduleId}`, import.meta.url).href);

function provider(t: TestContext, payload: (url: URL) => unknown) {
  const requests: URL[] = [], oversizedWrites: string[] = [];
  t.mock.method(globalThis, "fetch", async (input: string | URL | Request, init?: RequestInit & { next?: { revalidate?: number } }) => {
    const url = new URL(String(input));
    requests.push(url);
    const value = payload(url);
    const body = typeof value === "string" ? value : JSON.stringify(value);
    // Next attempts to store the raw fetch body, before the caller extracts
    // prices or image URLs. Reproduce its per-entry limit without live APIs.
    if (Buffer.byteLength(body) > 2 * 1024 * 1024 && init?.next?.revalidate) oversizedWrites.push(url.href);
    return new Response(body, { headers: { "Content-Type": typeof value === "string" ? "text/html" : "application/json" } });
  });
  return { requests, oversizedWrites };
}

test("large Skinport feeds retain shared parsed prices without oversized Next cache writes", async t => {
  t.mock.timers.enable({ apis: ["Date"], now: 1000 });
  const { requests, oversizedWrites } = provider(t, url => url.pathname.includes("history")
    ? [{ market_hash_name: normal, currency: "EUR", last_30_days: { median: 12.34 }, padding },
      { market_hash_name: stattrak, currency: "EUR", last_30_days: { median: 56.78 } }]
    : [{ market_hash_name: "Sticker | Test", currency: "EUR", median_price: 1.5, padding }]);
  const { getSkinportHistoricalPrices } = await freshModule("./skinport-prices.ts");
  const lookups = [{ marketHashName: normal }, { marketHashName: stattrak }, { marketHashName: normal, marketVersion: "Phase 2" }];
  const batches = await Promise.all(Array.from({ length: 20 }, () => getSkinportHistoricalPrices(lookups)));
  for (const batch of batches) assert.deepEqual(batch.map((quote: { eurCents: number } | null) => quote?.eurCents ?? null), [1234, 5678, null]);
  assert.equal(requests.length, 2, "concurrent lookups share the two provider downloads");
  assert.deepEqual(oversizedWrites, [], "raw feed bodies must bypass Next's 2 MB data cache");
  await getSkinportHistoricalPrices(lookups);
  assert.equal(requests.length, 2);
  t.mock.timers.tick(30 * 60 * 1000 + 1);
  await getSkinportHistoricalPrices(lookups);
  assert.equal(requests.length, 4, "prices are refreshed after their existing TTL");
});

test("large external indexes cache parsed estimates and retain separate StatTrak identities", async t => {
  t.mock.timers.enable({ apis: ["Date"], now: 1000 });
  const { requests, oversizedWrites } = provider(t, url => {
    if (url.hostname === "csfloat.com") return [{ market_hash_name: normal, min_price: 1000, padding }, { market_hash_name: stattrak, min_price: 4000 }];
    if (url.hostname === "api.skincash.gg") return { currency: "USD", items: [{ market_hash_name: normal, price: 20, padding }] };
    return { rates: { EUR: 0.9 } };
  });
  const { getExternalMarketPrices } = await freshModule("./external-market-prices.ts");
  const batches = await Promise.all(Array.from({ length: 20 }, () => getExternalMarketPrices([normal, stattrak])));
  for (const batch of batches) {
    assert.deepEqual(batch.map((quote: { eurCents: number }) => quote.eurCents), [1350, 3600]);
    assert.ok(batch.every((quote: { exactFloat: boolean; exactSeed: boolean }) => !quote.exactFloat && !quote.exactSeed));
  }
  assert.equal(requests.length, 4);
  assert.deepEqual(oversizedWrites, []);
  await getExternalMarketPrices([normal]);
  assert.equal(requests.length, 4);
  t.mock.timers.tick(15 * 60 * 1000 + 1);
  await getExternalMarketPrices([normal]);
  assert.equal(requests.length, 6, "refresh indexes while keeping the valid exchange-rate snapshot");
});

test("large Steam pages share one download per exact market name and cache only image results", async t => {
  t.mock.timers.enable({ apis: ["Date"], now: 1000 });
  const image = "https://community.steamstatic.com/economy/image/test-art";
  const { requests, oversizedWrites } = provider(t, () => `<html>${padding}<img src="${image}"></html>`);
  const { getMarketPreviewForNames } = await freshModule("../loadout/market-preview.ts");
  const results = await Promise.all(Array.from({ length: 20 }, () => getMarketPreviewForNames([normal])));
  assert.ok(results.every(value => value === image));
  assert.deepEqual(oversizedWrites, []);
  assert.equal(requests.length, 1, "simultaneous cards must share a pending Steam fetch");
  await getMarketPreviewForNames([normal]);
  assert.equal(requests.length, 1);
  await getMarketPreviewForNames([normal.replace("Field-Tested", "Factory New")]);
  assert.equal(requests.length, 2, "different wear is a distinct artwork identity");
  t.mock.timers.tick(12 * 60 * 60 * 1000 + 1);
  await getMarketPreviewForNames([normal]);
  assert.equal(requests.length, 3);
});

test("a failed Steam preview is retried after its cooldown without a stuck pending request", async t => {
  t.mock.timers.enable({ apis: ["Date"], now: 1000 });
  let calls = 0;
  const image = "https://community.steamstatic.com/economy/image/recovered";
  t.mock.method(globalThis, "fetch", async () => ++calls === 1 ? new Response(null, { status: 503 }) : new Response(`<img src="${image}">`));
  const { getMarketPreviewForNames } = await freshModule("../loadout/market-preview.ts");
  assert.equal(await getMarketPreviewForNames([normal]), null);
  assert.equal(await getMarketPreviewForNames([normal]), null);
  assert.equal(calls, 1);
  t.mock.timers.tick(10 * 60 * 1000 + 1);
  assert.equal(await getMarketPreviewForNames([normal]), image);
  assert.equal(calls, 2);
});
