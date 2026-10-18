import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { registerHooks } from "node:module";
import { beforeEach, test } from "node:test";

const state = { csrf: true, founder: true, manage: true, synced: true, calls: [] as Array<{ method: string; input: Record<string, unknown> }> };
Object.assign(globalThis, { __deleteAdminGroupRoute: state });
const routeSource = readFileSync(new URL("./route.ts", import.meta.url), "utf8");
function exportsFor(module: string, error: string) {
  const names = routeSource.match(new RegExp(`import \\{([^}]+)\\} from "${module}"`))![1].split(",").map(name => name.trim()).filter(name => name && !name.startsWith("type ") && name !== error);
  return `export class ${error} extends Error{}` + names.map(name => `export async function ${name}(input){globalThis.__deleteAdminGroupRoute.calls.push({method:'${name}',input});return {name:input.previousName,catalogueSynced:globalThis.__deleteAdminGroupRoute.synced}}`).join("\n");
}
const stubs: Record<string, string> = {
  "@/lib/data/identity-groups": exportsFor("@/lib/data/identity-groups", "IdentityGroupError"),
  "@/lib/data/external-group-management": exportsFor("@/lib/data/external-group-management", "ExternalGroupManagementError"),
  "@/lib/chat-colors": "export const normalizeChatColor=()=>'';export const normalizeChatStyle=()=>'';export const normalizeChatBadge=()=>'';",
  "@/lib/admin/access": "export async function getAdminAccess(){const s=globalThis.__deleteAdminGroupRoute;return {isAdmin:true,isFounder:s.founder,canManageGroups:s.manage}}",
  "@/lib/auth/session": "export const getSession=async()=>({steamId:'76561198000000001'});export const verifyAdminActionToken=()=>globalThis.__deleteAdminGroupRoute.csrf;",
  "@/lib/data/portal-repository": "export const getExternalIdentityGroupMemberSteamIds=async()=>[];export const writeStaffActionAudit=async(...input)=>globalThis.__deleteAdminGroupRoute.calls.push({method:'audit',input});",
  "@/lib/form-action-response": "export const formActionRedirect=(request,target)=>Response.redirect(new URL(target,request.url),303);",
};
registerHooks({ resolve(specifier, context, next) {
  return stubs[specifier] ? { url: `data:text/javascript,${encodeURIComponent(stubs[specifier])}`, shortCircuit: true } : next(specifier, context);
} });
const { POST } = await import("./route.ts");
const request = () => new Request("https://portal.test/api/admin/groups", { method: "POST", body: new URLSearchParams({ action: "external-admin-group-delete", runtimeRowId: "12", previousName: "MOD", csrf: "valid", requestKey: "delete-test" }) });
const result = (response: Response) => new URL(response.headers.get("location")!).searchParams;
beforeEach(() => { state.csrf = state.founder = state.manage = state.synced = true; state.calls = []; });

test("runtime Admin deletion requires valid CSRF, Founder and group-management access before dispatch", async () => {
  state.csrf = false; assert.equal(result(await POST(request())).get("error"), "verification");
  state.csrf = true; state.founder = false; assert.equal(result(await POST(request())).get("error"), "founder-required");
  state.founder = true; state.manage = false; assert.equal(result(await POST(request())).get("error"), "founder-required");
  assert.equal(state.calls.length, 0);
});

test("runtime Admin deletion forwards exact source reference, audits, and reports projection sync pending", async () => {
  assert.equal(result(await POST(request())).get("notice"), "external-admin-group-deleted");
  assert.deepEqual(state.calls[0], { method: "deleteRuntimeAdminsCoreGroup", input: {
    actorSteamId: "76561198000000001", requestKey: "delete-test", rowId: "12", previousName: "MOD",
  } });
  assert.equal(state.calls[1].method, "audit");
  state.synced = false;
  assert.equal(result(await POST(request())).get("notice"), "external-group-delete-sync-pending");
});
