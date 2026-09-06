import assert from "node:assert/strict";
import { registerHooks } from "node:module";
import { resolve } from "node:path";
import { pathToFileURL } from "node:url";
import test from "node:test";

const state = { signedIn: true, visibility: "public", calls: [] as Array<{ page: number; pageSize: number; query?: string }> };
Object.assign(globalThis, { __tradeInventoryRoute: state });
const stubs: Record<string, string> = {
  "@/lib/auth/session": "export async function getSession(){return globalThis.__tradeInventoryRoute.signedIn?{steamId:'76561198000000001'}:null;}",
  "@/lib/data/portal-repository": `const s=globalThis.__tradeInventoryRoute;
    export class EconomyRepositoryError extends Error {}
    export async function getTradePartnerInventory(viewer,owner,input){s.calls.push(input);return {visibility:s.visibility,items:[],total:s.visibility==='public'?57:undefined,page:input.page,pageSize:input.pageSize};}`,
};
registerHooks({ resolve(specifier, context, next) {
  if (stubs[specifier]) return { url: `data:text/javascript,${encodeURIComponent(stubs[specifier])}`, shortCircuit: true };
  if (specifier === "next/server") return { url: pathToFileURL(resolve("node_modules/next/server.js")).href, shortCircuit: true };
  if (specifier === "@/lib/economy/item-grid-layout") return { url: pathToFileURL(resolve("lib/economy/item-grid-layout.ts")).href, shortCircuit: true };
  return next(specifier, context);
} });
const { GET } = await import("./trades/partners/[steamId]/inventory/route.ts");
const context = { params: Promise.resolve({ steamId: "76561198000000002" }) };
const request = (query: string) => new Request(`http://localhost/api?${query}`);

test("trade inventory accepts only a measured four-row page size", async () => {
  for (const pageSize of [4,8,12,16,20]) {
    const response = await GET(request(`page=2&pageSize=${pageSize}&q=Fade`),context);
    assert.equal(response.status,200);
    assert.deepEqual(state.calls.at(-1),{page:2,pageSize,query:"Fade"});
    assert.equal((await response.json()).pageSize,pageSize);
    assert.equal(response.headers.get("cache-control"),"private, no-store");
  }
});

test("missing, oversized, and malformed page sizes safely use the maximum twenty items", async () => {
  for (const query of ["", "pageSize=60", "pageSize=0", "pageSize=5", "pageSize=4.5", "pageSize=wrong"]) {
    const response = await GET(request(query),context);
    assert.equal(response.status,200); assert.equal(state.calls.at(-1)!.pageSize,20);
  }
});

test("authentication, self-trade restriction, and private inventory response remain intact", async () => {
  state.signedIn=false;
  assert.equal((await GET(request("pageSize=8"),context)).status,401);
  state.signedIn=true;
  assert.equal((await GET(request("pageSize=8"),{params:Promise.resolve({steamId:"76561198000000001"})})).status,400);
  state.visibility="private";
  const response=await GET(request("pageSize=8"),context);
  const body=await response.json();
  assert.equal(body.visibility,"private"); assert.deepEqual(body.items,[]); assert.equal(body.total,undefined);
  state.visibility="public";
});
