import assert from "node:assert/strict";
import { registerHooks } from "node:module";
import { resolve } from "node:path";
import { pathToFileURL } from "node:url";
import { beforeEach, test } from "node:test";

const actorId = "76561198000000001", targetId = "76561198000000002";
const state = { session: true, csrf: true, writes: true, permissions: ["*"], immunity: 100, targetImmunity: 0, online: true, calls: [] as { event: string; steamId: string; payload: Record<string, unknown> }[] };
Object.assign(globalThis, { __profileModerationTest: state });
const stubs: Record<string, string> = {
  "@/lib/auth/session": `const s=globalThis.__profileModerationTest; export async function getSession(){return s.session?{steamId:'${actorId}'}:null} export function verifyAdminActionToken(){return s.csrf}`,
  "@/lib/admin/access": `const s=globalThis.__profileModerationTest;export async function getAdminAccess(id){return {steamId:id,displayName:'Staff',isAdmin:id==='${actorId}'||s.targetImmunity>0,immunity:id==='${actorId}'?s.immunity:s.targetImmunity,permissions:new Set(s.permissions),canBan:s.permissions.includes('*')||s.permissions.includes('admins.commands.ban'),canUnban:true}} export function adminWriteConfigured(){return s.writes} export function canActOnTarget(a,t){return a.immunity>=t.immunity} export async function getServerGuid(){return '11111111-1111-4111-8111-111111111111'}`,
  "@/lib/data/portal-repository": `const s=globalThis.__profileModerationTest;export async function enqueuePortalBridgeEvent(event,steamId,payload){s.calls.push({event,steamId,payload});return 7} export async function enqueueStaffBan(payload){return enqueuePortalBridgeEvent('moderation.ban',payload.steamId,payload)} export async function enqueueStaffUnban(payload){return enqueuePortalBridgeEvent('moderation.unban',payload.steamId,payload)} export async function writeStaffModerationAudit(){}`,
  "@/lib/server-status": `const s=globalThis.__profileModerationTest;export async function getServerStatus(){return {state:s.online?'online':'lost',checkedAt:new Date().toISOString(),roster:s.online?[{steamId:'${targetId}',connectedSeconds:120}]:[]}}`,
  "@/lib/form-action-response": `export function formActionRedirect(request,url){return new Response(null,{status:303,headers:{Location:new URL(url,request.url).href}})}`,
};
registerHooks({ resolve(specifier, context, next) {
  if (stubs[specifier]) return { url: `data:text/javascript,${encodeURIComponent(stubs[specifier])}`, shortCircuit: true };
  if (specifier.startsWith("@/")) return { url: pathToFileURL(resolve(`${specifier.slice(2)}.ts`)).href, shortCircuit: true };
  return next(specifier, context);
} });
const { POST } = await import("./route.ts");
function request(fields: Record<string, string> = {}, referer = `https://portal.test/players/${targetId}`) {
  const body = new FormData();
  for (const [key, value] of Object.entries({ action: "mute", steamId: targetId, csrf: "valid", durationMinutes: "60", reason: "Disruptive communication", ...fields })) body.set(key, value);
  return new Request("https://portal.test/api/admin/moderation", { method: "POST", body, headers: { referer } });
}
function error(response: Response) { return new URL(response.headers.get("Location")!).searchParams.get("error"); }
beforeEach(() => Object.assign(state, { session: true, csrf: true, writes: true, permissions: ["*"], immunity: 100, targetImmunity: 0, online: true, calls: [] }));
test("profile moderation enforces authentication, CSRF, action-specific permission and immunity", async () => {
  state.session = false;
  assert.match((await POST(request())).headers.get("Location")!, /auth\/steam/);
  state.session = true; state.csrf = false;
  assert.equal(error(await POST(request())), "verification");
  state.csrf = true; state.permissions = ["admins.commands.ban"];
  assert.equal(error(await POST(request())), "action-permission");
  state.permissions = ["*"]; state.targetImmunity = 101;
  assert.equal(error(await POST(request())), "immunity");
  assert.equal(state.calls.length, 0);
});
test("kick requires a fresh online target and enqueues a short-lived connection-bound job", async () => {
  state.online = false;
  assert.equal(error(await POST(request({ action: "kick" }))), "player-offline");
  state.online = true;
  const response = await POST(request({ action: "kick" }));
  assert.equal(state.calls[0].event, "moderation.kick");
  assert.equal(Date.parse(String(state.calls[0].payload.expiresAt)) - Date.parse(String(state.calls[0].payload.queuedAt)), 30000);
  assert.ok(Date.parse(String(state.calls[0].payload.targetConnectedAt)) < Date.now() - 110000);
  assert.match(response.headers.get("Location")!, new RegExp(`/players/${targetId}`));
});
test("communication actions retain durations and cannot use malformed inputs or external redirects", async () => {
  for (const durationMinutes of ["-1", "1x", "1.5", "525601"]) assert.equal(error(await POST(request({ durationMinutes }))), "ban-details");
  assert.equal(state.calls.length, 0);
  const response = await POST(request({ action: "silence", durationMinutes: "0" }, "https://evil.test/players/76561198000000002"));
  assert.equal(state.calls[0].event, "moderation.silence");
  assert.equal(state.calls[0].payload.durationMinutes, 0);
  assert.equal(new URL(response.headers.get("Location")!).pathname, "/admin/bans");
});
