import assert from "node:assert/strict";
import { existsSync } from "node:fs";
import { registerHooks } from "node:module";
import { extname, resolve } from "node:path";
import test from "node:test";
import { fileURLToPath, pathToFileURL } from "node:url";

const state = {
  eligibility: { eligible: true, eligibleAt: null, reason: null as string | null, openAppealId: null as number | null },
  createFailure: null as string | null,
  replyStatus: "reviewing",
  created: 0,
  replied: 0,
};
Object.assign(globalThis, { __appealRouteTest: state });
function moduleUrl(path: string) {
  const file = (extname(path) ? [path] : [`${path}.ts`, resolve(path, "index.ts")]).find(existsSync);
  return file ? pathToFileURL(file).href : null;
}
registerHooks({ resolve(specifier, context, next) {
  const stubs: Record<string, string> = {
    "server-only": "export {};",
    "@/lib/auth/session": "export async function getSession(){return {steamId:'76561198000000001'}}",
    "@/lib/data/portal-repository": `const state = globalThis.__appealRouteTest;
      export async function getPlayerDashboard(){return {bans:[{id:17,expiresAt:0}]}}
      export async function getAppealEligibility(){return state.eligibility}
      export async function createAppeal(){if(state.createFailure)throw new Error(state.createFailure);state.created++;return 1}
      export async function getPlayerCaseTarget(){return {id:1,status:state.replyStatus}}
      export async function addPlayerCaseReply(){state.replied++}`,
  };
  if (stubs[specifier]) return { url: `data:text/javascript,${encodeURIComponent(stubs[specifier])}`, shortCircuit: true };
  const url = specifier.startsWith("@/") ? moduleUrl(resolve(specifier.slice(2)))
    : specifier.startsWith(".") && context.parentURL?.startsWith("file:") ? moduleUrl(fileURLToPath(new URL(specifier, context.parentURL))) : null;
  return url ? { url, shortCircuit: true } : next(specifier, context);
} });
const { POST } = await import("./route.ts");
function request(action = "create", progressive = false) {
  const body = new FormData();
  body.set("action", action); body.set("body", "Please review my ban and this evidence."); body.set("caseId", "1");
  return new Request("http://localhost/api/appeals", {
    method: "POST", body, headers: progressive ? { "x-requested-with": "XMLHttpRequest" } : {},
  });
}
test.beforeEach(() => {
  state.eligibility = { eligible: true, eligibleAt: null, reason: null, openAppealId: null };
  state.createFailure = null; state.created = 0; state.replied = 0; state.replyStatus = "reviewing";
});

test("an open appeal redirects with the specific reason and prevents creation", async () => {
  state.eligibility = { eligible: false, eligibleAt: null, reason: "open-appeal", openAppealId: 3 };
  const response = await POST(request());
  assert.equal(response.status, 303);
  assert.equal(new URL(response.headers.get("location")!).searchParams.get("error"), "open-appeal");
  assert.equal(state.created, 0);
});

test("a duplicate detected inside creation returns the open-appeal message to both form modes", async () => {
  state.createFailure = "open-appeal";
  for (const progressive of [false, true]) {
    const response = await POST(request("create", progressive));
    assert.equal(response.status, progressive ? 200 : 303);
    const destination = progressive ? (await response.json()).redirect : response.headers.get("location");
    assert.equal(new URL(destination).searchParams.get("error"), "open-appeal");
    assert.equal(state.created, 0);
  }
});

test("cooldown remains distinct whether detected before or inside creation", async () => {
  state.eligibility = { eligible: false, eligibleAt: null, reason: "cooldown", openAppealId: null };
  assert.equal(new URL((await POST(request())).headers.get("location")!).searchParams.get("error"), "cooldown");
  state.eligibility.eligible = true; state.createFailure = "cooldown";
  assert.equal(new URL((await POST(request())).headers.get("location")!).searchParams.get("error"), "cooldown");
  assert.equal(state.created, 0);
});

test("the player can still reply to the existing open appeal", async () => {
  state.eligibility = { eligible: false, eligibleAt: null, reason: "open-appeal", openAppealId: 1 };
  const response = await POST(request("reply"));
  assert.equal(new URL(response.headers.get("location")!).searchParams.get("replied"), "1");
  assert.equal(state.replied, 1); assert.equal(state.created, 0);
});

test("replies remain disabled for every closed appeal status", async () => {
  for (const status of ["closed-banned", "closed-unbanned", "closed"]) {
    state.replyStatus = status;
    const response = await POST(request("reply"));
    assert.equal(new URL(response.headers.get("location")!).searchParams.get("error"), "closed");
  }
  assert.equal(state.replied, 0);
});

test("eligible submissions still redirect to success", async () => {
  const response = await POST(request());
  assert.equal(new URL(response.headers.get("location")!).searchParams.get("submitted"), "1");
  assert.equal(state.created, 1);
});
