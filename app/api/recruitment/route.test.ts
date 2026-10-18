import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import { registerHooks } from "node:module";
import { extname, resolve } from "node:path";
import { DatabaseSync } from "node:sqlite";
import test from "node:test";
import { fileURLToPath, pathToFileURL } from "node:url";

const database = new DatabaseSync(":memory:");
const sql = (statement: string) => statement.replaceAll(" FOR UPDATE", "");
const pool = {
  async query(statement: string, args: unknown[] = []) { return [database.prepare(sql(statement)).all(...args as never[]), []]; },
  async getConnection() {
    return {
      async beginTransaction() { database.exec("BEGIN"); },
      async query(statement: string, args: unknown[] = []) { return pool.query(statement, args); },
      async execute(statement: string, args: unknown[] = []) { return [{ affectedRows: Number(database.prepare(sql(statement)).run(...args as never[]).changes) }, []]; },
      async commit() { database.exec("COMMIT"); },
      async rollback() { database.exec("ROLLBACK"); },
      release() {},
    };
  },
};
const state = { signedIn: true, csrf: true, admin: false, pool };
Object.assign(globalThis, { __recruitmentRouteTest: state });
function moduleUrl(path: string) {
  const file = (extname(path) ? [path] : [`${path}.ts`, `${path}.tsx`, resolve(path, "index.ts")]).find(existsSync);
  return file ? pathToFileURL(file).href : null;
}
registerHooks({ resolve(specifier, context, next) {
  const stubs: Record<string, string> = {
    "server-only": "export {};",
    "@/lib/data/database-pools": "export function getGameDatabasePool(){return globalThis.__recruitmentRouteTest.pool} export function getPortalDatabasePool(){return globalThis.__recruitmentRouteTest.pool}",
    "@/lib/auth/session": `export async function getSession(){return globalThis.__recruitmentRouteTest.signedIn?{steamId:'76561198000000001'}:null} export function verifyProfileActionToken(){return globalThis.__recruitmentRouteTest.csrf} export function verifyAdminActionToken(){return globalThis.__recruitmentRouteTest.csrf}`,
    "@/lib/admin/access": "export async function getAdminAccess(){return {isAdmin:globalThis.__recruitmentRouteTest.admin}}",
    "@/lib/steam/profiles": "export async function getSteamProfiles(){return new Map()}",
  };
  if (stubs[specifier]) return { url: `data:text/javascript,${encodeURIComponent(stubs[specifier])}`, shortCircuit: true };
  const url = specifier.startsWith("@/") ? moduleUrl(resolve(specifier.slice(2)))
    : specifier.startsWith(".") && context.parentURL?.startsWith("file:") ? moduleUrl(fileURLToPath(new URL(specifier, context.parentURL))) : null;
  return url ? { url, shortCircuit: true } : next(specifier, context);
} });
const { POST: apply } = await import("./route.ts");
const { POST: manage } = await import("../admin/recruitment/route.ts");
const { recruitmentErrorCode } = await import("../../../lib/recruitment/service.ts");
const migration = readFileSync(new URL("../../../db/041_staff_recruitment.sql", import.meta.url), "utf8")
  .replace(/\b(?:BIGINT|TINYINT|INT) UNSIGNED\b/g, "INTEGER")
  .replace(/UNIQUE KEY \w+\s*\(/g, "UNIQUE (")
  .replace(/,\s*KEY \w+\s*\([^)]*\)/g, "")
  .replace(/\) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci/g, ")");
database.exec(migration);
database.exec(readFileSync(new URL("../../../db/044_staff_recruitment_responses.sql", import.meta.url), "utf8").replace("ADD COLUMN IF NOT EXISTS", "ADD COLUMN").replace(" AFTER reason", ""));
database.exec("CREATE TABLE portal_discord_links (steam_id TEXT PRIMARY KEY, discord_user_id TEXT); CREATE TABLE portal_audit_events (actor_type TEXT, actor_id TEXT, action TEXT, target_type TEXT, target_id TEXT); CREATE TABLE lvl_base (steam TEXT PRIMARY KEY, name TEXT, playtime INTEGER)");
const steamId = "76561198000000001";
function request(values: Record<string, string> = {}, admin = false, progressive = false) {
  const body = new FormData();
  const defaults = admin ? { action: "set-open", open: "yes" } : { nickname: "Applicant", age: "24", steamGroupMember: "yes", discordProfile: "https://discord.com/users/12345678901234567", reason: "I can help players and keep the server a friendly place to play.", csrf: "token" };
  for (const [key, value] of Object.entries({ ...defaults, ...values })) body.set(key, value);
  return new Request(`http://localhost/api/${admin ? "admin/" : ""}recruitment`, { method: "POST", body, headers: progressive ? { "x-requested-with": "XMLHttpRequest" } : {} });
}
function destination(response: Response) { return new URL(response.headers.get("location")!); }
function count() { return database.prepare("SELECT COUNT(*) AS total FROM portal_staff_applications").get()?.total; }
test.beforeEach(() => {
  state.signedIn = true; state.csrf = true; state.admin = false;
  database.exec("DELETE FROM portal_staff_applications; DELETE FROM portal_discord_links; DELETE FROM portal_audit_events; DELETE FROM lvl_base; UPDATE portal_staff_recruitment SET is_open = 1");
  database.prepare("INSERT INTO lvl_base VALUES (?, 'Real player', 21600)").run(steamId);
});
test.after(() => database.close());

test("anonymous application and staff requests require sign in without writing", async () => {
  state.signedIn = false;
  assert.equal(destination(await apply(request())).pathname, "/api/auth/steam");
  assert.equal(destination(await manage(request({}, true))).pathname, "/api/auth/steam");
  assert.equal(count(), 0);
});

test("only known error codes are exposed when storage reports an arbitrary error", () => {
  assert.equal(recruitmentErrorCode(new Error("constructor")), "recruitment-unavailable");
  assert.equal(recruitmentErrorCode(new Error("application-active")), "application-active");
});

test("both mutations enforce CSRF before writing", async () => {
  state.csrf = false; state.admin = true;
  assert.equal(destination(await apply(request())).searchParams.get("error"), "verification");
  assert.equal(destination(await manage(request({ open: "no" }, true))).searchParams.get("error"), "verification");
  assert.equal(count(), 0);
  assert.equal(database.prepare("SELECT is_open FROM portal_staff_recruitment").get()?.is_open, 1);
});

test("a signed in player cannot close recruitment or review applications", async () => {
  assert.equal(destination(await manage(request({ open: "no" }, true))).searchParams.get("error"), "forbidden");
  await apply(request());
  const id = String(database.prepare("SELECT id FROM portal_staff_applications").get()?.id);
  assert.equal(destination(await manage(request({ action: "review", id, status: "accepted" }, true))).searchParams.get("error"), "forbidden");
  assert.equal(database.prepare("SELECT status FROM portal_staff_applications").get()?.status, "submitted");
});

test("the route ignores forged identity, playtime and link flags", async () => {
  database.prepare("INSERT INTO portal_discord_links VALUES (?, '98765432109876543')").run(steamId);
  const response = await apply(request({ steamId: "76561198999999999", playtimeSeconds: "999999999", discordLinked: "false", discordProfile: "tampered" }));
  assert.equal(destination(response).searchParams.get("notice"), "submitted");
  const row = database.prepare("SELECT steam_id, playtime_seconds, discord_linked, discord_profile FROM portal_staff_applications").get();
  assert.deepEqual({ ...row }, { steam_id: steamId, playtime_seconds: 21600, discord_linked: 1, discord_profile: "https://discord.com/users/98765432109876543" });
});

test("staff can close recruitment and the server rejects a stale open form", async () => {
  state.admin = true;
  await manage(request({ open: "no" }, true));
  assert.equal(destination(await apply(request())).searchParams.get("error"), "recruitment-closed");
  assert.equal(count(), 0);
});

test("validation and duplicate errors survive native and enhanced submissions", async () => {
  assert.equal(destination(await apply(request({ age: "twenty" }))).searchParams.get("error"), "application-details");
  await apply(request());
  assert.equal(destination(await apply(request())).searchParams.get("error"), "application-active");
  const response = await apply(request({}, false, true));
  assert.equal(response.status, 200);
  assert.equal(new URL((await response.json()).redirect).searchParams.get("error"), "application-active");
  assert.equal(count(), 1);
});

test("staff reviews persist plain text responses with trusted session actors and preserve filters", async () => {
  await apply(request());
  const id = String(database.prepare("SELECT id FROM portal_staff_applications").get()?.id);
  state.admin = true;
  const response = await manage(request({ action: "review", id, status: "accepted", response: "  Welcome.\n<script>plain text</script>  ", actorSteamId: "76561198999999999", reviewedBy: "76561198999999999", returnName: "  Ａｐｐｌｉｃａｎｔ  ", returnStatus: " ACCEPTED ", returnPage: "2" }, true));
  const url = destination(response);
  assert.equal(url.pathname, "/admin/recruitment"); assert.equal(url.searchParams.get("notice"), "reviewed");
  assert.equal(url.searchParams.get("name"), "Applicant"); assert.equal(url.searchParams.get("status"), "accepted"); assert.equal(url.searchParams.get("page"), "2");
  const row = database.prepare("SELECT status, admin_response, reviewed_by FROM portal_staff_applications WHERE id = ?").get(id);
  assert.deepEqual({ ...row }, { status: "accepted", admin_response: "Welcome.\n<script>plain text</script>", reviewed_by: steamId });
  assert.equal(database.prepare("SELECT actor_id FROM portal_audit_events WHERE action = 'recruitment.application.accepted'").get()?.actor_id, steamId);
});

test("staff can update a final response while the original decision remains immutable", async () => {
  await apply(request()); state.admin = true;
  const id = String(database.prepare("SELECT id FROM portal_staff_applications").get()?.id);
  await manage(request({ action: "review", id, status: "declined", response: "Please try again later." }, true));
  assert.equal(destination(await manage(request({ action: "review", id, status: "declined", response: "New response." }, true))).searchParams.get("notice"), "reviewed");
  assert.equal(database.prepare("SELECT admin_response FROM portal_staff_applications").get()?.admin_response, "New response.");
  assert.equal(destination(await manage(request({ action: "review", id, status: "accepted", response: "Must not replace this." }, true))).searchParams.get("error"), "application-closed");
  assert.equal(database.prepare("SELECT status, admin_response FROM portal_staff_applications").get()?.status, "declined");
  assert.equal(database.prepare("SELECT admin_response FROM portal_staff_applications").get()?.admin_response, "New response.");
  await manage(request({ action: "review", id, status: "declined" }, true));
  assert.equal(database.prepare("SELECT admin_response FROM portal_staff_applications").get()?.admin_response, "New response.");
  await manage(request({ action: "review", id, status: "declined", response: "\n  " }, true));
  assert.equal(database.prepare("SELECT admin_response FROM portal_staff_applications").get()?.admin_response, null);
});

test("unauthorized accounts, stale verification and oversized responses cannot change feedback", async () => {
  await apply(request());
  const id = String(database.prepare("SELECT id FROM portal_staff_applications").get()?.id);
  assert.equal(destination(await manage(request({ action: "review", id, status: "accepted", response: "Forged decision" }, true))).searchParams.get("error"), "forbidden");
  state.admin = true; state.csrf = false;
  assert.equal(destination(await manage(request({ action: "review", id, status: "accepted", response: "Stale form" }, true))).searchParams.get("error"), "verification");
  state.csrf = true;
  assert.equal(destination(await manage(request({ action: "review", id, status: "accepted", response: "x".repeat(2001) }, true))).searchParams.get("error"), "application-response");
  const row = database.prepare("SELECT status, admin_response, reviewed_by FROM portal_staff_applications").get();
  assert.deepEqual({ ...row }, { status: "submitted", admin_response: null, reviewed_by: null });
});

test("review returns only to known paths with sanitized filters in native and enhanced responses", async () => {
  await apply(request()); state.admin = true;
  const id = String(database.prepare("SELECT id FROM portal_staff_applications").get()?.id);
  for (const progressive of [false, true]) {
    const response = await manage(request({ action: "review", id, status: "reviewing", returnTo: "https://evil.example/steal", returnName: "  %_&?#=  ", returnStatus: "constructor", returnPage: "-1" }, true, progressive));
    const url = progressive ? new URL((await response.json()).redirect) : destination(response);
    assert.equal(url.origin, "http://localhost"); assert.equal(url.pathname, "/admin/recruitment"); assert.equal(url.hash, "");
    assert.equal(url.searchParams.get("name"), "%_&?#="); assert.ok(url.searchParams.get("status") === null || url.searchParams.get("status") === "all");
    assert.ok(url.searchParams.get("page") === null || url.searchParams.get("page") === "1");
    assert.equal(url.searchParams.get("notice"), "reviewed");
  }
  const staff = destination(await manage(request({ action: "set-open", open: "no", returnTo: "/staff", returnName: "Applicant", returnStatus: "accepted", returnPage: "8" }, true)));
  assert.equal(staff.pathname, "/staff"); assert.equal(staff.hash, "#recruitment"); assert.equal(staff.searchParams.get("name"), null);
});

test("baseline requirements remain advisory for younger, unlinked, low-hour non-members", async () => {
  database.prepare("UPDATE lvl_base SET playtime = 0 WHERE steam = ?").run(steamId);
  const response = await apply(request({ age: "13", steamGroupMember: "no", discordProfile: "https://discord.com/users/12345678901234567" }));
  assert.equal(destination(response).searchParams.get("notice"), "submitted");
  const row = database.prepare("SELECT age, steam_group_member, discord_linked, playtime_seconds FROM portal_staff_applications").get();
  assert.deepEqual({ ...row }, { age: 13, steam_group_member: 0, discord_linked: 0, playtime_seconds: 0 });
});
