import assert from "node:assert/strict";
import { registerHooks } from "node:module";
import { DatabaseSync } from "node:sqlite";
import { beforeEach, after, test } from "node:test";

const actor = "76561198000000001";
const target = "76561198000000002";
const server = "05eda3ad-2921-4083-adfb-2e23596c8caa";
const now = Date.now();
const queuedAt = now - 10_000;
const db = new DatabaseSync(":memory:");
db.function("JSON_UNQUOTE", value => value);
const state = { session: true, admin: true, gameAvailable: true, failGame: false, calls: [] as Array<{ database: string; sql: string; args: unknown[] }> };
function pool(database: string) { return { async execute(sql: string, args: unknown[]) { return this.query(sql, args); }, async query(sql: string, args: unknown[]) {
  state.calls.push({ database, sql, args });
  if (database === "game" && state.failGame) throw new Error("private database credentials");
  return [db.prepare(sql).all(...args as (string | number | null)[])];
} }; }
Object.assign(globalThis, { __moderationStatus: state, __moderationPortalPool: pool("portal"), __moderationGamePool: () => state.gameAvailable ? pool("game") : null });
const stubs: Record<string, string> = {
  "@/lib/auth/session": `export const getSession=async()=>globalThis.__moderationStatus.session?{steamId:'${actor}'}:null`,
  "@/lib/admin/access": "export const getAdminAccess=async()=>({isAdmin:globalThis.__moderationStatus.admin})",
  "@/lib/data/database-pools": "export const getPortalDatabasePool=()=>globalThis.__moderationPortalPool;export const getGameDatabasePool=()=>globalThis.__moderationGamePool();",
};
registerHooks({ resolve(specifier, context, next) {
  if (stubs[specifier]) return { url: `data:text/javascript,${encodeURIComponent(stubs[specifier])}`, shortCircuit: true };
  return next(specifier, context);
} });
const { GET } = await import("./route.ts");
const request = (job = "7") => new Request(`https://portal.test/api/admin/moderation/status?job=${job}`);
const payload = () => ({ steamId: target, actorSteamId: actor, serverGuid: server, reason: "Disruption", durationMinutes: 60, queuedAt: new Date(queuedAt).toISOString() });
db.exec(`CREATE TABLE portal_outbox (id INTEGER PRIMARY KEY, status TEXT, event_type TEXT, payload TEXT, target_steam_id TEXT);
CREATE TABLE bans (Id INTEGER PRIMARY KEY, SteamId64 TEXT, AdminSteamId64 TEXT, Reason TEXT, Server TEXT, Length INTEGER, CreatedAt INTEGER, ExpiresAt INTEGER, BanType INTEGER, GlobalBan INTEGER);
CREATE TABLE sanctions (Id INTEGER PRIMARY KEY, SteamId64 TEXT, AdminSteamId64 TEXT, Reason TEXT, Server TEXT, Length INTEGER, CreatedAt INTEGER, ExpiresAt INTEGER, SanctionType INTEGER, GlobalSanction INTEGER, SanctionKind INTEGER);`);
function job(action = "gag", status = "completed", overrides: Record<string, unknown> = {}) {
  db.prepare("INSERT INTO portal_outbox VALUES (?, ?, ?, ?, ?)").run(7, status, `moderation.${action}`, JSON.stringify({ ...payload(), ...overrides }), target);
}
function native(action = "gag", overrides: Record<string, unknown> = {}) {
  const row = { Id: 1, SteamId64: target, AdminSteamId64: actor, Reason: "Disruption", Server: server, Length: 3_600_000, CreatedAt: now - 5_000, ExpiresAt: now - 5_000 + 3_600_000, ...(action === "ban" ? { BanType: 1, GlobalBan: 0 } : { SanctionType: 1, GlobalSanction: 0, SanctionKind: action === "gag" ? 1 : 2 }), ...overrides };
  const fields = Object.keys(row);
  db.prepare(`INSERT INTO ${action === "ban" ? "bans" : "sanctions"} (${fields.join(", ")}) VALUES (${fields.map(() => "?").join(", ")})`).run(...Object.values(row) as Array<string | number>);
}
function clear() { db.exec("DELETE FROM portal_outbox; DELETE FROM bans; DELETE FROM sanctions;"); }
beforeEach(() => { Object.assign(state, { session: true, admin: true, gameAvailable: true, failGame: false, calls: [] }); clear(); });
after(() => db.close());

test("status lookup requires a staff session and validates job IDs before reading storage", async () => {
  state.session = false; assert.equal((await GET(request())).status, 401);
  state.session = true; state.admin = false; assert.equal((await GET(request())).status, 403);
  state.admin = true;
  for (const value of ["7x", "0", "-1", "1.5", "9007199254740992"]) assert.equal((await GET(request(value))).status, 400);
  assert.equal(state.calls.length, 0);
});

test("staff can read only their own moderation job and responses expose no job payload", async () => {
  job("kick", "completed", { actorSteamId: "76561198000000009" });
  assert.equal((await GET(request())).status, 404);
  assert.equal(state.calls.filter(call => call.database === "game").length, 0);
  db.prepare("UPDATE portal_outbox SET payload = ?").run(JSON.stringify(payload()));
  const response = await GET(request());
  assert.match(response.headers.get("cache-control")!, /private.*no-store/);
  assert.deepEqual(await response.json(), { status: "completed", action: "kick" });
  db.prepare("UPDATE portal_outbox SET event_type = 'economy.purchase'").run();
  assert.equal((await GET(request())).status, 404);
});

test("bridge completion stays processing until the corresponding ban, gag or mute is durably stored", async () => {
  for (const action of ["ban", "gag", "mute"]) {
    clear(); job(action);
    assert.deepEqual(await (await GET(request())).json(), { status: "processing", action });
    native(action);
    assert.deepEqual(await (await GET(request())).json(), { status: "completed", action });
  }
});

test("old identical records and wrong target, issuer, server, reason, duration or type cannot confirm a new job", async () => {
  for (const action of ["ban", "gag", "mute"]) for (const override of [
    { CreatedAt: queuedAt - 1 }, { SteamId64: actor }, { AdminSteamId64: target }, { Server: "other-server" }, { Reason: "Different reason" },
    { Length: 60_000 }, { ExpiresAt: 0 }, { CreatedAt: now + 3_600_000 },
    action === "ban" ? { BanType: 2 } : { SanctionType: 2 }, action === "ban" ? { GlobalBan: 1 } : { GlobalSanction: 1 },
  ]) {
    clear(); job(action); native(action, override);
    assert.equal((await (await GET(request())).json()).status, "processing", `${action}: ${JSON.stringify(override)}`);
  }
});

test("permanent restrictions require zero expiry and silence requires both durable sanction kinds", async () => {
  job("silence", "completed", { durationMinutes: 0 }); native("gag", { Length: 0, ExpiresAt: 0 });
  assert.equal((await (await GET(request())).json()).status, "processing");
  native("mute", { Id: 2, Length: 0, ExpiresAt: 0 });
  assert.equal((await (await GET(request())).json()).status, "completed");
  db.prepare("UPDATE sanctions SET ExpiresAt = ?").run(now + 60_000);
  assert.equal((await (await GET(request())).json()).status, "processing");
});

test("unban confirms only after every target active ban expires, matching the bridge's database-wide scope", async () => {
  job("unban"); native("ban", { ExpiresAt: 0 }); native("ban", { Id: 2, Server: "other-server", AdminSteamId64: "0", ExpiresAt: 0 });
  assert.equal((await (await GET(request())).json()).status, "processing");
  db.prepare("UPDATE bans SET ExpiresAt = ? WHERE Id = 1").run(now - 1);
  assert.equal((await (await GET(request())).json()).status, "processing");
  db.prepare("UPDATE bans SET ExpiresAt = ? WHERE Id = 2").run(now - 1);
  native("ban", { Id: 3, SteamId64: actor, ExpiresAt: 0 });
  assert.equal((await (await GET(request())).json()).status, "completed");
});

test("ambiguous legacy jobs, malformed targets and unavailable native storage never claim success", async () => {
  job("ban", "completed", { queuedAt: undefined }); native("ban");
  assert.equal((await (await GET(request())).json()).status, "processing");
  db.prepare("UPDATE portal_outbox SET payload = ?").run(JSON.stringify({ ...payload(), steamId: actor }));
  assert.equal((await (await GET(request())).json()).status, "processing");
  db.prepare("UPDATE portal_outbox SET payload = ?").run(JSON.stringify(payload()));
  state.gameAvailable = false;
  assert.equal((await (await GET(request())).json()).status, "processing");
  state.gameAvailable = true; state.failGame = true;
  const failure = await GET(request());
  assert.equal(failure.status, 503);
  assert.doesNotMatch(JSON.stringify(await failure.json()), /credentials|Disruption|actorSteamId/);
});

test("pending and failed bridge outcomes stay distinct without unnecessary native queries", async () => {
  for (const status of ["pending", "processing", "failed"]) {
    clear(); job("ban", status);
    assert.deepEqual(await (await GET(request())).json(), { status, action: "ban" });
  }
  assert.equal(state.calls.filter(call => call.database === "game").length, 0);
});
