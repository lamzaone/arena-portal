import assert from "node:assert/strict";
import { registerHooks } from "node:module";
import { beforeEach, test } from "node:test";

const state = { session: true, csrf: true, admin: true, manage: true, immunity: true, calls: [] as unknown[], audits: [] as unknown[] };
Object.assign(globalThis, { __staffAdminEditRoute: state });
const stubs: Record<string, string> = {
  "@/lib/auth/session": `export const getSession=async()=>globalThis.__staffAdminEditRoute.session?{steamId:'76561198000000001'}:null;export const verifyAdminActionToken=()=>globalThis.__staffAdminEditRoute.csrf;`,
  "@/lib/admin/access": `const s=globalThis.__staffAdminEditRoute;export const getAdminAccess=async steamId=>({steamId,isAdmin:s.admin,canManageAdmins:s.manage,immunity:50});export const canActOnTarget=()=>s.immunity;`,
  "@/lib/data/identity-groups": "export const getIdentityVipGroupSnapshot=async()=>({definitions:[]});export const reconcileIdentityGroupRewards=async()=>{};",
  "@/lib/data/portal-repository": `export const gameStorageConfigured=()=>true;export const portalStorageConfigured=()=>true;export const upsertStaffVip=async()=>{};export const writeStaffActionAudit=async(...args)=>globalThis.__staffAdminEditRoute.audits.push(args);`,
  "@/lib/form-action-response": "export const formActionRedirect=(request,target)=>Response.redirect(new URL(target,request.url),303);",
  "@/lib/content/group-presentation": "export const normalizeVipGroup=s=>s;",
  "@/lib/data/staff-admin-memberships": `export class StaffAdminMembershipError extends Error{};export const assignStaffAdminMembership=async()=>{};export const extendStaffAdminMembership=async()=>{};export const removeStaffAdminMembership=async()=>{};export const editStaffAdminMembership=async input=>globalThis.__staffAdminEditRoute.calls.push(input);`,
  "@/lib/data/staff-vip-memberships": `export class StaffVipMembershipError extends Error{};export const consolidateStaffVipMemberships=async()=>{};export const editStaffVipMembership=async()=>{};export const extendStaffVipMembership=async()=>{};export const removeStaffVipMembership=async()=>{};export const withSerializedNativeVipMutation=async()=>{};`,
};
registerHooks({ resolve(specifier, context, next) {
  return stubs[specifier] ? { url: `data:text/javascript,${encodeURIComponent(stubs[specifier])}`, shortCircuit: true } : next(specifier, context);
} });
const { POST } = await import("./route.ts");
const request = (fields: Record<string, string> = {}) => {
  const form = new FormData();
  for (const [key, value] of Object.entries({ action: "admin-membership-edit", csrf: "valid", steamId: "76561198000000002",
    membershipSource: "portal", groupId: "100", scopeId: "1", rowVersion: "4", membershipUuid: "253b7a55-e04a-48af-8de9-26c6bf81f867",
    newGroup: "ADMIN", expiryMode: "replace", durationMinutes: "60", expectedExpiresAt: "2027-01-01T00:00:00.000Z", ...fields })) form.set(key, value);
  return new Request("https://portal.test/api/admin/staff", { method: "POST", body: form });
};
beforeEach(() => { state.session = state.csrf = state.admin = state.manage = state.immunity = true; state.calls = []; state.audits = []; });
const error = (response: Response) => new URL(response.headers.get("location")!).searchParams.get("error");

test("admin membership edit requires a session, CSRF, manage-admin permission and target immunity", async () => {
  state.session = false;
  assert.match((await POST(request())).headers.get("location")!, /\/api\/auth\/steam/);
  state.session = true; state.csrf = false;
  assert.equal(error(await POST(request())), "verification");
  state.csrf = true; state.admin = false;
  assert.equal(error(await POST(request())), "forbidden");
  state.admin = true; state.manage = false;
  assert.equal(error(await POST(request())), "admin-permission");
  state.manage = true; state.immunity = false;
  assert.equal(error(await POST(request())), "immunity");
  assert.equal(state.calls.length, 0); assert.equal(state.audits.length, 0);
});

test("admin edit forwards the authenticated actor and every exact portal reference field", async () => {
  const response = await POST(request({ actorSteamId: "forged", actorImmunity: "999" }));
  assert.equal(new URL(response.headers.get("location")!).searchParams.get("notice"), "admin-edited");
  assert.deepEqual(state.calls, [{ reference: { source: "portal", steamId: "76561198000000002", groupId: 100,
    scopeId: 1, rowVersion: 4, membershipUuid: "253b7a55-e04a-48af-8de9-26c6bf81f867" },
    newGroup: "ADMIN", expiryMode: "replace", durationMinutes: 60, expectedExpiresAt: "2027-01-01T00:00:00.000Z",
    reason: "", actorSteamId: "76561198000000001", actorImmunity: 50 }]);
  assert.equal(state.audits.length, 1);
});

test("admin edit rejects malformed exact references, expiry modes and non-whole durations", async () => {
  const invalidFields: Array<Record<string, string>> = [{ rowVersion: "4x" }, { membershipUuid: "missing" }, { scopeId: "0" }, { expiryMode: "unknown" },
    { durationMinutes: "60garbage" }, { durationMinutes: "1.5" }, { durationMinutes: "0" }, { expectedExpiresAt: "invalid" }];
  for (const fields of invalidFields) {
    assert.equal(error(await POST(request(fields))), "admin-details", JSON.stringify(fields));
  }
  assert.equal(state.calls.length, 0);
});

test("native admin edit retains the exact stored group reference and rejects timed native expiry", async () => {
  const fields = { membershipSource: "native", adminId: "3", storedGroup: "MOD", expiryMode: "keep", durationMinutes: "0", expectedExpiresAt: "" };
  assert.equal(error(await POST(request(fields))), null);
  assert.deepEqual((state.calls[0] as { reference: unknown }).reference, { source: "native", steamId: "76561198000000002", adminId: 3, storedGroup: "MOD" });
  assert.equal(error(await POST(request({ ...fields, expiryMode: "replace", durationMinutes: "60" }))), "admin-details");
  assert.equal(state.calls.length, 1);
});
