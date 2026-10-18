import assert from "node:assert/strict";
import { existsSync } from "node:fs";
import { registerHooks } from "node:module";
import { extname, resolve } from "node:path";
import test from "node:test";
import { fileURLToPath, pathToFileURL } from "node:url";

const state = { isAdmin: true, canUnban: true, csrf: true, immune: false, targetExists: true, saves: [] as unknown[], replies: 0 };
Object.assign(globalThis, { __staffCaseRouteTest: state });
function moduleUrl(path: string) {
  const file = (extname(path) ? [path] : [`${path}.ts`, resolve(path, "index.ts")]).find(existsSync);
  return file ? pathToFileURL(file).href : null;
}
registerHooks({ resolve(specifier, context, next) {
  const stubs: Record<string, string> = {
    "@/lib/auth/session": "export async function getSession(){return {steamId:'76561198000000001'}} export function verifyAdminActionToken(){return globalThis.__staffCaseRouteTest.csrf}",
    "@/lib/admin/access": `const s=globalThis.__staffCaseRouteTest; export async function getAdminAccess(id){return {isAdmin:id==='76561198000000002'?s.immune:s.isAdmin,canUnban:s.canUnban,steamId:id}} export function canActOnTarget(){return !s.immune}`,
    "@/lib/data/portal-repository": `const s=globalThis.__staffCaseRouteTest; export async function getStaffAppealTarget(){return s.targetExists?{steamId:'76561198000000002'}:null} export const getStaffTicketTarget=getStaffAppealTarget; export async function addStaffCaseReply(){s.replies++} export async function enqueueStaffUnban(){} export async function writeStaffActionAudit(){}`,
    "@/lib/cases/priority-repository": "export async function setStaffCasePriority(input){globalThis.__staffCaseRouteTest.saves.push(input)}",
  };
  if (stubs[specifier]) return { url: `data:text/javascript,${encodeURIComponent(stubs[specifier])}`, shortCircuit: true };
  const url = specifier.startsWith("@/") ? moduleUrl(resolve(specifier.slice(2)))
    : specifier.startsWith(".") && context.parentURL?.startsWith("file:") ? moduleUrl(fileURLToPath(new URL(specifier, context.parentURL))) : null;
  return url ? { url, shortCircuit: true } : next(specifier, context);
} });
const { POST } = await import("./route.ts");
function request(kind = "ticket", priority = "high", caseId = "2") {
  const body = new FormData();
  body.set("action", `${kind}-priority`); body.set("caseId", caseId); body.set("priority", priority); body.set("csrf", "token");
  return new Request("http://localhost/api/admin/cases", { method: "POST", body });
}
const destination = (response: Response) => new URL(response.headers.get("location")!);
test.beforeEach(() => Object.assign(state, { isAdmin: true, canUnban: true, csrf: true, immune: false, targetExists: true, saves: [], replies: 0 }));

test("staff priority updates save the exact case, validated label and authenticated actor without a reply", async () => {
  assert.equal(destination(await POST(request())).searchParams.get("notice"), "priority-saved");
  assert.deepEqual(state.saves, [{ caseType: "ticket", caseId: 2, priority: "high", actorSteamId: "76561198000000001" }]);
  assert.equal(state.replies, 0);
});
test("priority changes require CSRF verification and current staff authorization", async () => {
  state.csrf = false;
  assert.equal(destination(await POST(request())).searchParams.get("error"), "verification");
  state.csrf = true; state.isAdmin = false;
  assert.equal(destination(await POST(request())).searchParams.get("error"), "forbidden");
  assert.equal(state.saves.length, 0);
});
test("appeal priorities keep unban permission and target immunity checks", async () => {
  state.canUnban = false;
  assert.equal(destination(await POST(request("appeal"))).searchParams.get("error"), "unban-permission");
  state.canUnban = true; state.immune = true;
  assert.equal(destination(await POST(request("appeal"))).searchParams.get("error"), "immunity");
  assert.equal(state.saves.length, 0);
});
test("invalid priorities, malformed IDs and nonexistent cases never persist", async () => {
  assert.equal(destination(await POST(request("ticket", "owner"))).searchParams.get("error"), "priority");
  assert.equal(destination(await POST(request("ticket", "high", "2junk"))).searchParams.get("error"), "case");
  state.targetExists = false;
  assert.equal(destination(await POST(request())).searchParams.get("error"), "case");
  assert.equal(state.saves.length, 0);
});
