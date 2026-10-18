import assert from "node:assert/strict";
import { registerHooks } from "node:module";
import { beforeEach, test } from "node:test";

const state = {
  session: { steamId: "76561198000000001" } as { steamId: string } | null,
  csrf: true,
  access: { isAdmin: true, canViewEconomy: true, canManageEconomy: true },
  calls: 0,
  throws: false,
  status: "refreshed",
};
Object.assign(globalThis, { __staffPriceRefreshTest: state });
const stubs: Record<string, string> = {
  "next/server": "export const NextResponse={json:(body,init)=>Response.json(body,init)};",
  "@/lib/auth/session": `const s=globalThis.__staffPriceRefreshTest;
    export async function getSession(){return s.session}
    export function verifyAdminActionToken(session,token){return s.csrf && token==='valid'}`,
  "@/lib/admin/access": "export async function getAdminAccess(){return globalThis.__staffPriceRefreshTest.access}",
  "@/lib/economy/price-refresh": `export async function refreshAllEconomyPublicPrices(...args){
    const s=globalThis.__staffPriceRefreshTest;s.calls++;
    if(args.length)throw new Error('Client filters must not constrain the refresh');
    if(s.throws)throw new Error('private provider/database details');
    return {status:s.status,scanned:1350,matched:4000,updated:1200,variantCached:4000,unmatched:20};}`,
};
registerHooks({ resolve(specifier, context, next) {
  return stubs[specifier]
    ? { url: `data:text/javascript,${encodeURIComponent(stubs[specifier])}`, shortCircuit: true }
    : next(specifier, context);
} });
const { POST } = await import("./route.ts");
const request = (fields: Record<string, unknown> = {}) => new Request("https://portal.test/api/admin/economy/prices/refresh", {
  method: "POST", headers: { "Content-Type": "application/json" },
  body: JSON.stringify({ csrf: "valid", ...fields }),
});
beforeEach(() => {
  state.session = { steamId: "76561198000000001" };
  state.csrf = true;
  state.access = { isAdmin: true, canViewEconomy: true, canManageEconomy: true };
  state.calls = 0; state.throws = false; state.status = "refreshed";
});

test("refresh-all requires a session, valid CSRF, and full economy administration", async () => {
  state.session = null;
  assert.equal((await POST(request())).status, 401);
  state.session = { steamId: "76561198000000001" };
  state.csrf = false;
  assert.equal((await POST(request())).status, 403);
  state.csrf = true;
  for (const permission of ["isAdmin", "canViewEconomy", "canManageEconomy"] as const) {
    state.access[permission] = false;
    assert.equal((await POST(request())).status, 403);
    state.access[permission] = true;
  }
  assert.equal(state.calls, 0);
});

test("refresh-all uses the complete existing refresh service regardless of visible search or page", async () => {
  const response = await POST(request({ marketplaceQ: "AK-47", catalogueIds: [1], page: 4 }));
  assert.equal(response.status, 200);
  assert.equal(response.headers.get("Cache-Control"), "no-store");
  const body = await response.json();
  assert.equal(body.scanned, 1350);
  assert.equal(body.updated, 1200);
  assert.equal(state.calls, 1);
});

test("refresh-all returns distinct busy and unavailable states and safe provider failures", async () => {
  state.status = "busy";
  assert.equal((await POST(request())).status, 202);
  state.status = "unavailable";
  assert.equal((await POST(request())).status, 503);
  state.throws = true;
  const response = await POST(request());
  assert.equal(response.status, 502);
  assert.doesNotMatch(await response.text(), /private provider/);
});

test("malformed refresh payloads never start a refresh", async () => {
  for (const body of ["broken-json", "null", "[]", '{"csrf":42}']) {
    const response = await POST(new Request("https://portal.test/api/admin/economy/prices/refresh", {
      method: "POST", headers: { "Content-Type": "application/json" }, body,
    }));
    assert.ok([400, 403].includes(response.status));
  }
  assert.equal(state.calls, 0);
});
