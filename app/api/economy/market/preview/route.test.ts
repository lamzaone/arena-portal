import assert from "node:assert/strict";
import { registerHooks } from "node:module";
import { resolve } from "node:path";
import { pathToFileURL } from "node:url";
import test from "node:test";

const state = {
  authenticated: true, item: null as Record<string, unknown> | null,
  itemReads: 0, catalogueReads: 0, marketReads: 0,
  catalogueImage: "https://community.steamstatic.com/economy/image/catalogue" as string | null,
};
Object.assign(globalThis, { __cataloguePreviewTest: state });
const stubs: Record<string, string> = {
  "@/lib/auth/session": "export async function getSession(){return globalThis.__cataloguePreviewTest.authenticated?{steamId:'76561198000000001'}:null;}",
  "@/lib/auth/session-identity": "export async function getSessionIdentity(){return globalThis.__cataloguePreviewTest.authenticated?{steamId:'76561198000000001'}:null;}",
  "@/lib/data/portal-repository": "export async function getEconomyCatalogueItem(){const s=globalThis.__cataloguePreviewTest;s.itemReads++;return s.item;}",
  "@/lib/economy/cs2-item-images": "export async function getCs2CatalogueImage(){const s=globalThis.__cataloguePreviewTest;s.catalogueReads++;return s.catalogueImage;}",
  "@/lib/loadout/market-preview": "export async function getMarketPreviewForNames(){globalThis.__cataloguePreviewTest.marketReads++;return 'https://community.steamstatic.com/economy/image/market';}",
};
registerHooks({ resolve(specifier, context, next) {
  if (stubs[specifier]) return { url: `data:text/javascript,${encodeURIComponent(stubs[specifier])}`, shortCircuit: true };
  if (specifier === "next/server") return { url: pathToFileURL(resolve("node_modules/next/server.js")).href, shortCircuit: true };
  return next(specifier, context);
} });
const { GET } = await import("./route.ts");
const request = (query = "catalogueId=1&mode=catalogue") => new Request(`https://arena.test/api/economy/market/preview?${query}`);
test.beforeEach(() => {
  state.authenticated = true;
  state.item = { id: 1, itemType: "skin", displayName: "AK-47 | Case Hardened", marketHashName: null, definitionIndex: 7, paintkit: 44, imageUrl: null, metadata: {} };
  state.itemReads = state.catalogueReads = state.marketReads = 0;
  state.catalogueImage = "https://community.steamstatic.com/economy/image/catalogue";
});
test("stored catalogue art returns without downloading any upstream catalogue or market page", async () => {
  for (const imageUrl of ["/images/economy/custom-glock.webp", "https://community.steamstatic.com/economy/image/ak"]) {
    state.item!.imageUrl = imageUrl;
    const response = await GET(request());
    assert.equal(response.status, 200);
    assert.equal((await response.json()).imageUrl, imageUrl);
  }
  assert.equal(state.catalogueReads, 0);
  assert.equal(state.marketReads, 0);
});
test("missing normal artwork uses the shared image index without scraping Steam for float variants", async () => {
  const response = await GET(request("catalogueId=1&mode=catalogue&float=0.65"));
  assert.equal((await response.json()).imageUrl, state.catalogueImage);
  assert.equal(state.catalogueReads, 1);
  assert.equal(state.marketReads, 0);
});
test("failed stored artwork can request a different catalogue fallback", async () => {
  state.item!.imageUrl = "https://community.steamstatic.com/economy/image/broken";
  const body = await (await GET(request("catalogueId=1&mode=catalogue&fallback=1"))).json();
  assert.equal(body.imageUrl, state.catalogueImage);
  assert.equal(state.catalogueReads, 1);
  assert.equal(state.marketReads, 0);
});
test("unknown artwork and unsafe URLs return an honest empty preview", async () => {
  state.catalogueImage = null;
  for (const imageUrl of ["javascript:alert(1)", "http://unsafe.test/art", "/images/economy/../secret"]) {
    state.item!.imageUrl = imageUrl;
    const body = await (await GET(request())).json();
    assert.deepEqual(body, { imageUrl: null, imageUrls: [] });
  }
  assert.equal(state.marketReads, 0);
});
test("invalid and unauthenticated requests never read catalogue images", async () => {
  state.authenticated = false;
  assert.equal((await GET(request())).status, 401);
  state.authenticated = true;
  assert.equal((await GET(request("catalogueId=-1&mode=catalogue"))).status, 400);
  assert.equal(state.itemReads, 0);
  assert.equal(state.catalogueReads, 0);
  state.item = null;
  assert.equal((await GET(request())).status, 404);
});
test("the existing wear-aware API remains available for callers requesting it", async () => {
  const body = await (await GET(request("catalogueId=1&float=0.2"))).json();
  assert.equal(body.imageUrl, "https://community.steamstatic.com/economy/image/market");
  assert.equal(state.marketReads, 1);
});
