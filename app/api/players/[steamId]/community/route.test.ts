import assert from "node:assert/strict";
import { existsSync } from "node:fs";
import { registerHooks } from "node:module";
import { extname, resolve } from "node:path";
import test from "node:test";
import { fileURLToPath, pathToFileURL } from "node:url";

const state = { session: true, csrf: true, writes: [] as Record<string, unknown>[], failure: null as { code: string; message: string } | null };
Object.assign(globalThis, { __communityRouteState: state });
function moduleUrl(path: string) {
 const file = (extname(path) ? [path] : [`${path}.ts`, resolve(path, "index.ts")]).find(existsSync);
 return file ? pathToFileURL(file).href : null;
}
registerHooks({ resolve(specifier, context, next) {
 if (specifier === "next/server") return next("next/server.js", context);
 const stubs: Record<string, string> = {
  "server-only": "export {};",
  "@/lib/auth/session": "const state=globalThis.__communityRouteState;export async function getSession(){return state.session?{steamId:'76561198000000001'}:null}export function verifyProfileActionToken(session,token){if(/[^A-Za-z0-9_-]/.test(token))throw new Error('Input buffers must have the same byte length');return state.csrf&&token==='verified'}",
  "@/lib/data/profile-community": `const state=globalThis.__communityRouteState;
    export class ProfileCommunityError extends Error{constructor(code,message){super(message);this.code=code}}
    export function parseProfileCommunityAction(input){if(input.action==='reputation'&&[-1,0,1].includes(input.value))return {action:input.action,value:input.value};throw new ProfileCommunityError('invalid_input','Invalid action')}
    export async function getProfileCommunity(){return {available:true,comments:{records:[],page:1,total:0,pageSize:10}}}
    export async function mutateProfileCommunity(input){if(state.failure)throw new ProfileCommunityError(state.failure.code,state.failure.message);state.writes.push(input)}
  `,
  "@/lib/player-identities": "export async function resolvePlayerIdentities(){return {}}",
 };
 if (stubs[specifier]) return { url: `data:text/javascript,${encodeURIComponent(stubs[specifier])}`, shortCircuit: true };
 const url = specifier.startsWith("@/") ? moduleUrl(resolve(specifier.slice(2))) : specifier.startsWith(".") && context.parentURL?.startsWith("file:") ? moduleUrl(fileURLToPath(new URL(specifier, context.parentURL))) : null;
 return url ? { url, shortCircuit: true } : next(specifier, context);
} });
const { GET, POST } = await import("./route.ts");
const context = { params: Promise.resolve({ steamId: "76561198000000002" }) };
const request = (data: unknown = { csrf: "verified", action: "reputation", value: 1 }) => new Request("http://localhost/api/players/76561198000000002/community", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(data) });
test.beforeEach(() => { state.session = true; state.csrf = true; state.failure = null; state.writes = []; });

test("public reads are uncached and mutations require a valid session-bound CSRF token", async () => {
 state.session = false;
 assert.equal((await GET(new Request("http://localhost/api/players/76561198000000002/community"), context)).status, 200);
 assert.equal((await POST(request(), context)).status, 401);
 state.session = true; state.csrf = false;
 assert.equal((await POST(request(), context)).status, 403);
 assert.equal(state.writes.length, 0);
});
test("actor identity is always taken from the session and confirmed results return a fresh community snapshot", async () => {
 const response = await POST(request({ csrf: "verified", action: "reputation", value: 1, actorSteamId: "76561198000000003" }), context);
 assert.equal(response.status, 200); assert.match(response.headers.get("Cache-Control")!, /no-store/);
 assert.equal(state.writes[0].actorSteamId, "76561198000000001");
 assert.equal(state.writes[0].targetSteamId, "76561198000000002");
 assert.equal((await response.json()).community.available, true);
});
test("malformed JSON, invalid actions, target IDs and oversized content never reach storage", async () => {
 assert.equal((await POST(request({ csrf: "verified", action: "reputation", value: 7 }), context)).status, 400);
 assert.equal((await POST(request(), { params: Promise.resolve({ steamId: "invalid" }) })).status, 400);
 assert.equal((await POST(request({ csrf: "verified", body: "x".repeat(17_000) }), context)).status, 413);
 assert.equal((await POST(new Request("http://localhost", { method: "POST", body: "{" }), context)).status, 400);
 assert.equal(state.writes.length, 0);
});
test("malformed multibyte CSRF tokens are rejected before reaching the timing-safe verifier", async () => {
 const response = await POST(request({ csrf: "é".repeat(43), action: "reputation", value: 1 }), context);
 assert.equal(response.status, 403); assert.equal(state.writes.length, 0);
});
test("permissions, closed comments, cooldowns and unavailable storage use meaningful status codes", async () => {
 for (const [code, status] of [["forbidden", 403], ["disabled", 409], ["rate_limited", 429], ["unavailable", 503]] as const) {
  state.failure = { code, message: "The safe public error." };
  const response = await POST(request(), context);
  assert.equal(response.status, status); assert.equal((await response.json()).message, "The safe public error.");
 }
});
