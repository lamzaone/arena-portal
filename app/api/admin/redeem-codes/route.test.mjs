import assert from "node:assert/strict";
import { registerHooks } from "node:module";
import { beforeEach, test } from "node:test";

const state = { session: { steamId: "76561198000000001" }, csrf: true, allowed: true, calls: [] };
globalThis.__redeemRouteState = state;
const stubs = {
  "@/lib/admin/access": "export async function getAdminAccess(){return {canManageEconomy:globalThis.__redeemRouteState.allowed}}",
  "@/lib/auth/session": "export async function getSession(){return globalThis.__redeemRouteState.session} export function verifyAdminActionToken(){return globalThis.__redeemRouteState.csrf}",
  "@/lib/data/portal-repository": `const s=globalThis.__redeemRouteState;
    export async function createEconomyRedeemCode(){throw new Error('unexpected create')}
    export async function getEconomyCatalogue(){return {items:[],total:0}}
    export async function setEconomyRedeemCodeEnabled(){throw new Error('unexpected toggle')}
    export async function restartEconomyRedeemCode(input){s.calls.push({action:'restart',...input});return {codeId:2}}
    export async function removeEconomyRedeemCode(input){s.calls.push({action:'remove',...input});return {codeId:1}}`,
  "@/lib/economy/request": "export function economyMutationFailure(error){return Response.json({ok:false,message:error.message},{status:400})}",
};
registerHooks({ resolve(specifier, context, next) {
  return stubs[specifier] ? { url: `data:text/javascript,${encodeURIComponent(stubs[specifier])}`, shortCircuit: true } : next(specifier, context);
} });
const { POST } = await import("./route.ts");
const request = (action, extra = {}) => new Request("http://localhost/api/admin/redeem-codes", {
  method: "POST", headers: { "content-type": "application/json" },
  body: JSON.stringify({ action, csrf: "valid", codeId: 1, idempotencyKey: "redeem-management-test-0001", ...extra }),
});
beforeEach(() => { state.session = { steamId: "76561198000000001" }; state.csrf = state.allowed = true; state.calls = []; });
for (const action of ["restart", "remove"]) {
  test(`${action} dispatches with authenticated actor and supplied action key`, async () => {
    const response = await POST(request(action, { actorSteamId: "forged" }));
    assert.equal(response.status, 200);
    assert.equal(state.calls.length, 1);
    assert.deepEqual(state.calls[0], { action, actorSteamId: state.session.steamId, codeId: 1, idempotencyKey: "redeem-management-test-0001" });
  });
  test(`${action} requires session, CSRF, and economy staff access`, async () => {
    state.session = null; assert.equal((await POST(request(action))).status, 401);
    state.session = { steamId: "76561198000000001" }; state.csrf = false;
    assert.equal((await POST(request(action))).status, 403);
    state.csrf = true; state.allowed = false;
    assert.equal((await POST(request(action))).status, 403);
    assert.equal(state.calls.length, 0);
  });
  test(`${action} rejects malformed IDs and missing idempotency`, async () => {
    for (const codeId of [0, -1, 1.5, null, "abc", Number.MAX_SAFE_INTEGER + 1])
      assert.equal((await POST(request(action, { codeId }))).status, 400);
    assert.equal((await POST(request(action, { idempotencyKey: "" }))).status, 400);
    assert.equal(state.calls.length, 0);
  });
}
