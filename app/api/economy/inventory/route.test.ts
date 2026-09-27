import assert from "node:assert/strict";
import { registerHooks } from "node:module";
import { resolve } from "node:path";
import { pathToFileURL } from "node:url";
import test from "node:test";

const state = {
  authenticated: true,
  calls: [] as Array<Record<string, unknown>>,
  materialCalls: [] as Array<Record<string, unknown>>,
};
Object.assign(globalThis, { __ownedInventoryRoute: state });

const stubs: Record<string, string> = {
  "@/lib/auth/session": "export async function getSession(){return globalThis.__ownedInventoryRoute.authenticated?{steamId:'76561198000000001'}:null;}",
  "@/lib/economy/player-inventory": `export async function getPlayerEconomyInventoryPage(steamId, filter){globalThis.__ownedInventoryRoute.calls.push({steamId,...filter});return {items:[{id:'item-1'}],total:37,page:filter.page,pageSize:filter.pageSize};}
    export async function getCompletePlayerEconomyInventory(steamId, filter){globalThis.__ownedInventoryRoute.materialCalls.push({steamId,...filter});return {items:[{id:'sticker-1'}],total:1,page:1,pageSize:100};}`,
};
registerHooks({ resolve(specifier, context, next) {
  if (stubs[specifier]) return { url: `data:text/javascript,${encodeURIComponent(stubs[specifier])}`, shortCircuit: true };
  if (specifier === "next/server") return { url: pathToFileURL(resolve("node_modules/next/server.js")).href, shortCircuit: true };
  if (specifier === "@/lib/economy/item-taxonomy") return { url: pathToFileURL(resolve("lib/economy/item-taxonomy.ts")).href, shortCircuit: true };
  if (specifier === "@/lib/economy/item-grid-layout") return { url: pathToFileURL(resolve("lib/economy/item-grid-layout.ts")).href, shortCircuit: true };
  return next(specifier, context);
} });

const { GET } = await import("./route.ts");
const request = (query = "") => new Request(`http://localhost/api/economy/inventory?${query}`);

test.beforeEach(() => { state.authenticated = true; state.calls.length = 0; state.materialCalls.length = 0; });

test("inventory reads a bounded server page with filters and private caching", async () => {
  const response = await GET(request("page=3&pageSize=12&q=Fade&type=skin&rarity=6&sort=float&hideEquipped=1"));
  assert.equal(response.status, 200);
  assert.deepEqual(state.calls, [{
    steamId: "76561198000000001", page: 3, pageSize: 12, query: "Fade",
    itemTypes: ["skin"], rarityRanks: [6], sort: "float", hideEquipped: true,
  }]);
  assert.deepEqual(await response.json(), { ok: true, items: [{ id: "item-1" }], total: 37, page: 3, pageSize: 12 });
  assert.equal(response.headers.get("cache-control"), "private, no-store");
});

test("invalid filters and anonymous requests never read inventory", async () => {
  for (const query of ["page=0", "page=no", "type=unknown", "rarity=90", "sort=price", `q=${"x".repeat(121)}`]) {
    assert.equal((await GET(request(query))).status, 400);
  }
  state.authenticated = false;
  assert.equal((await GET(request())).status, 401);
  assert.equal(state.calls.length, 0);
});

test("missing and oversized page sizes load at most twenty items", async () => {
  await GET(request());
  await GET(request("pageSize=100"));
  assert.deepEqual(state.calls.map((call) => call.pageSize), [20, 20]);
});

test("attachment materials load only on demand for the signed-in owner", async () => {
  const response = await GET(request("mode=materials"));
  assert.equal(response.status, 200);
  assert.deepEqual(state.materialCalls, [{ steamId: "76561198000000001", itemTypes: ["sticker", "nametag", "keychain"] }]);
  assert.deepEqual(await response.json(), { ok: true, items: [{ id: "sticker-1" }] });
  assert.equal(state.calls.length, 0);
});
