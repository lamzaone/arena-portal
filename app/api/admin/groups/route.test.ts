import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { registerHooks } from "node:module";
import { resolve } from "node:path";
import { pathToFileURL } from "node:url";
import { beforeEach, test } from "node:test";

const state = { allowed: true, csrf: true, synced: true, tagFailure: false, calls: [] as { method: string; input: Record<string, unknown> }[] };
Object.assign(globalThis, { __inlineGroupTest: state });
const source = readFileSync(new URL("./route.ts", import.meta.url), "utf8");
function exportedStubs(module: string, exception: string) {
  const names = source.match(new RegExp(`import \\{([^}]+)\\} from "${module}"`))![1].split(",").map(name => name.trim()).filter(name => name && !name.startsWith("type ") && name !== exception);
  return `const s=globalThis.__inlineGroupTest;export class ${exception} extends Error{constructor(code,message){super(message);this.code=code}};` + names.map(name => `export async function ${name}(input){
    s.calls.push({method:'${name}',input});
    if('${name}'==='getIdentityAdminSnapshot')return {richChatTagsAvailable:true,groups:[{id:11,sourceType:'admins_core',externalKey:'STAFF'},{id:12,sourceType:'vipcore',externalKey:'VIP'}]};
    if('${name}'==='createIdentityChatTag'&&s.tagFailure)throw new Error('tag storage unavailable');
    return {groupId:10,tagId:20,name:input?.name,catalogueSynced:s.synced};
  }`).join("\n");
}
const stubs: Record<string, string> = {
  "@/lib/data/group-badge-symbols": "export class GroupBadgeSymbolError extends Error{};export const readGroupBadgeForm=request=>request.formData();export const saveGroupBadgeSymbol=async(file,actor)=>{globalThis.__inlineGroupTest.calls.push({method:'saveGroupBadgeSymbol',input:{name:file.name,actor}});return 'custom.0123456789abcdef01234567'};",
  "@/lib/data/identity-groups": exportedStubs("@/lib/data/identity-groups", "IdentityGroupError"),
  "@/lib/data/external-group-management": exportedStubs("@/lib/data/external-group-management", "ExternalGroupManagementError"),
  "@/lib/data/portal-repository": "export async function writeStaffActionAudit(){} export async function getExternalIdentityGroupMemberSteamIds(){return []}",
  "@/lib/admin/access": "export async function getAdminAccess(){const s=globalThis.__inlineGroupTest;return {isAdmin:s.allowed,isFounder:s.allowed,canManageGroups:s.allowed}}",
  "@/lib/auth/session": "export async function getSession(){return {steamId:'76561198000000001'}}export function verifyAdminActionToken(){return globalThis.__inlineGroupTest.csrf}",
  "@/lib/form-action-response": "export function formActionRedirect(request,url){return new Response(null,{status:303,headers:{Location:new URL(url,request.url).href}})}",
};
registerHooks({ resolve(specifier, context, next) {
  if (stubs[specifier]) return { url: `data:text/javascript,${encodeURIComponent(stubs[specifier])}`, shortCircuit: true };
  if (specifier === "@/lib/chat-colors") return { url: pathToFileURL(resolve("lib/chat-colors.ts")).href, shortCircuit: true };
  return next(specifier, context);
} });
const { POST } = await import("./route.ts");
function request(fields: Record<string, string> = {}) {
  const body = new FormData();
  for (const [key, value] of Object.entries({ action: "group-create", returnTab: "custom", requestKey: "inline-group-test", tagEnabled: "on", tagText: "", colorToken: "[gold]", displayName: "Beta testers", badgeLabel: "BETA", ...fields })) body.set(key, value);
  return new Request("https://portal.test/api/admin/groups", { method: "POST", body });
}
const result = (response: Response) => new URL(response.headers.get("Location")!);
beforeEach(() => Object.assign(state, { allowed: true, csrf: true, synced: true, tagFailure: false, calls: [] }));
test("inline creation still requires Founder access and valid CSRF", async () => {
  state.allowed = false; assert.equal(result(await POST(request())).searchParams.get("error"), "founder-required");
  state.allowed = true; state.csrf = false; assert.equal(result(await POST(request())).searchParams.get("error"), "verification");
  assert.equal(state.calls.length, 0);
});

test("custom symbols are saved only after Founder and CSRF checks and forwarded to the chosen group", async () => {
  const upload = () => {
    const body = new FormData();
    for (const [key, value] of Object.entries({ action: "group-update", groupId: "11", displayName: "Staff", badgeLabel: "STAFF", badgeIconKey: "shield", tagEnabled: "false", csrf: "test" })) body.set(key, value);
    body.set("badgeSymbol", new File([new Uint8Array([137, 80, 78, 71])], "emblem.png", { type: "image/png" }));
    return new Request("https://portal.test/api/admin/groups", { method: "POST", body });
  };
  state.allowed = false;
  await POST(upload());
  assert.equal(state.calls.length, 0);
  state.allowed = true; state.csrf = false;
  await POST(upload());
  assert.equal(state.calls.length, 0);
  state.csrf = true;
  await POST(upload());
  assert.equal(state.calls[0].method, "saveGroupBadgeSymbol");
  assert.equal(state.calls[1].method, "updateIdentityGroup");
  assert.equal(state.calls[1].input.groupId, 11);
  assert.equal(state.calls[1].input.badgeIconKey, "custom.0123456789abcdef01234567");
});
test("invalid group tag fields fail before creating any native or custom definition", async () => {
  for (const fields of [{ colorToken: "invalid" }, { tagStyle: "unknown-effect" }, { tagText: "x".repeat(65) }] as Record<string, string>[]) {
    assert.equal(result(await POST(request(fields))).searchParams.get("error"), "invalid_input");
  }
  assert.equal(state.calls.length, 0);
});
test("group creation assigns its tag immediately and can explicitly skip tags", async () => {
  assert.equal(result(await POST(request())).searchParams.get("notice"), "group-created");
  const tag = state.calls.find(call => call.method === "createIdentityChatTag")!;
  assert.equal(tag.input.text, "[BETA]"); assert.deepEqual(tag.input.assignTo, { groupId: 10 });
  state.calls = [];
  await POST(request({ tagEnabled: "false" }));
  assert.deepEqual(state.calls.map(call => call.method), ["createIdentityGroup"]);
});
test("a saved definition with pending catalogue or tag storage returns concrete partial success", async () => {
  state.synced = false;
  const runtime = result(await POST(request({ action: "external-admin-group-create", name: "STAFF" })));
  assert.equal(runtime.searchParams.get("notice"), "external-group-created-tag-pending");
  assert.equal(state.calls.some(call => call.method === "createIdentityChatTag"), false);
  state.calls = []; state.tagFailure = true;
  assert.equal(result(await POST(request())).searchParams.get("notice"), "group-created-tag-pending");
  assert.equal(state.calls.filter(call => call.method === "createIdentityGroup").length, 1);
});
test("custom tag creation passes the selected player and timed award into the atomic tag write", async () => {
  await POST(request({ action: "tag-create", tagEnabled: "false", tagTarget: "player", steamId: "76561198000000003", durationMinutes: "1440", tagKey: "award.test", tagText: "[AWARD]" }));
  assert.deepEqual(state.calls[0].input.assignTo, { steamId: "76561198000000003", durationMinutes: 1440, reason: "" });
});

test("custom group deletion archives access and returns to the remaining groups", async () => {
  const url = result(await POST(request({ action: "group-archive", groupId: "5", returnTab: "custom", tagEnabled: "false" })));
  assert.equal(state.calls[0].method, "archiveIdentityGroup");
  assert.equal(state.calls[0].input.groupId, 5);
  assert.equal(url.searchParams.get("tab"), "custom");
  assert.equal(url.searchParams.get("notice"), "group-archived");
  assert.equal(url.searchParams.has("group"), false);
});
