import assert from "node:assert/strict";
import { registerHooks } from "node:module";
import { resolve } from "node:path";
import { pathToFileURL } from "node:url";
import { beforeEach, test } from "node:test";

const actorId = "76561198000000001", targetId = "76561198000000002";
const warningId = "11111111-1111-4111-8111-111111111111";
const state = { session: true, csrf: true, writes: true, assigned: true, admin: true, permissions: ["admins.commands.warn"], immunity: 100, targetImmunity: 0, issued: [] as Record<string, unknown>[] };
Object.assign(globalThis, { __profileWarningTest: state });
const stubs: Record<string, string> = {
  "@/lib/auth/session": `const s=globalThis.__profileWarningTest;export async function getSession(){return s.session?{steamId:'${actorId}'}:null}export function verifyAdminActionToken(){return s.csrf}`,
  "@/lib/admin/access": `const s=globalThis.__profileWarningTest;export function adminWriteConfigured(){return s.writes}export async function getServerGuid(){return '${warningId}'}export async function getAdminAccess(id){return {steamId:id,displayName:'Staff',isAdmin:id==='${actorId}'?s.admin:s.targetImmunity>0,isAssignedToServer:s.assigned,immunity:id==='${actorId}'?s.immunity:s.targetImmunity,permissions:new Set(s.permissions)}}`,
  "@/lib/data/warnings": `import {validateWarningInput} from '${pathToFileURL(resolve("lib/moderation/warning-policy.ts")).href}';const s=globalThis.__profileWarningTest;export async function issuePlayerWarning(input){validateWarningInput(input);s.issued.push(input)}export async function revokePlayerWarning(){}export async function getWarningTarget(){return '${targetId}'}`,
  "@/lib/form-action-response": "export function formActionRedirect(request,path){return new Response(null,{status:303,headers:{Location:new URL(path,request.url).href}})}",
};
registerHooks({ resolve(specifier, context, next) {
  if (stubs[specifier]) return { url: `data:text/javascript,${encodeURIComponent(stubs[specifier])}`, shortCircuit: true };
  if (specifier.startsWith("@/")) return { url: pathToFileURL(resolve(`${specifier.slice(2)}.ts`)).href, shortCircuit: true };
  return next(specifier, context);
} });
const { POST } = await import("./route.ts");
function request(fields: Record<string, string> = {}, referer = `https://portal.test/players/${targetId}`) {
  const body = new FormData();
  for (const [key, value] of Object.entries({ action: "issue", id: warningId, csrf: "valid", steamId: targetId, playerName: "Arena player", reason: "Repeated disruption", durationMinutes: "60", ...fields })) body.set(key, value);
  return new Request("https://portal.test/api/admin/warnings", { method: "POST", body, headers: { referer } });
}
function destination(response: Response) { return new URL(response.headers.get("Location")!); }
beforeEach(() => Object.assign(state, { session: true, csrf: true, writes: true, assigned: true, admin: true, permissions: ["admins.commands.warn"], immunity: 100, targetImmunity: 0, issued: [] }));

test("profile Warn persists a timed warning and returns to the same player", async () => {
  const url = destination(await POST(request()));
  assert.equal(url.pathname, `/players/${targetId}`);
  assert.match(url.searchParams.get("notice")!, /Warning issued/);
  assert.equal(state.issued.length, 1);
  assert.equal(state.issued[0].id, warningId);
  assert.equal(state.issued[0].steamId, targetId);
  assert.equal(state.issued[0].durationMinutes, 60);
  assert.equal(state.issued[0].actorSteamId, actorId);
});

test("Warn denies unauthenticated, forged, disabled, unauthorized and immune-target actions", async () => {
  state.session = false;
  assert.equal(destination(await POST(request())).pathname, "/api/auth/steam");
  state.session = true; state.csrf = false;
  assert.match(destination(await POST(request())).searchParams.get("error")!, /Verification failed/);
  state.csrf = true; state.writes = false;
  assert.match(destination(await POST(request())).searchParams.get("error")!, /disabled/);
  state.writes = true; state.permissions = ["admins.commands.ban"];
  assert.match(destination(await POST(request())).searchParams.get("error")!, /permissions/);
  state.permissions = ["admins.commands.warn"]; state.assigned = false;
  assert.match(destination(await POST(request())).searchParams.get("error")!, /permissions/);
  state.assigned = true; state.admin = false;
  assert.match(destination(await POST(request())).searchParams.get("error")!, /permissions/);
  state.admin = true; state.targetImmunity = 101;
  assert.match(destination(await POST(request())).searchParams.get("error")!, /immunity/);
  assert.equal(state.issued.length, 0);
});

test("invalid warning details return an error to the profile without issuing a warning", async () => {
  const invalidFields: Record<string, string>[] = [{ durationMinutes: "0" }, { durationMinutes: "-1" }, { durationMinutes: "1.5" }, { durationMinutes: "525601" }, { reason: "x" }, { id: "invalid" }];
  for (const fields of invalidFields) {
    const url = destination(await POST(request(fields)));
    assert.equal(url.pathname, `/players/${targetId}`);
    assert.ok(url.searchParams.has("error"));
  }
  assert.equal(state.issued.length, 0);
});

test("warning redirects reject external, mismatched-player and lookalike profile URLs", async () => {
  for (const referer of ["https://evil.test/players/" + targetId, "https://portal.test/players/" + actorId, `https://portal.test/players/${targetId}/extra`, "https://portal.test/admin/warnings"]) {
    assert.equal(destination(await POST(request({}, referer))).pathname, "/admin/warnings");
  }
});
