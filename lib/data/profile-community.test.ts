import assert from "node:assert/strict";
import { registerHooks } from "node:module";
import { DatabaseSync } from "node:sqlite";
import test from "node:test";

const db = new DatabaseSync(":memory:");
db.exec(`
 CREATE TABLE portal_profile_community (steam_id TEXT PRIMARY KEY, comments_enabled INTEGER NOT NULL DEFAULT 1);
 CREATE TABLE portal_profile_reputation (target_steam_id TEXT, actor_steam_id TEXT, value INTEGER, PRIMARY KEY(target_steam_id,actor_steam_id));
 CREATE TABLE portal_profile_commendations (target_steam_id TEXT, actor_steam_id TEXT, kind TEXT, PRIMARY KEY(target_steam_id,actor_steam_id,kind));
 CREATE TABLE portal_profile_comments (id TEXT PRIMARY KEY, target_steam_id TEXT, author_steam_id TEXT, body TEXT, request_id TEXT, created_at INTEGER, deleted_at INTEGER, deleted_by TEXT, UNIQUE(author_steam_id,request_id));
 CREATE TABLE portal_profile_community_limits (actor_steam_id TEXT PRIMARY KEY, last_action_at INTEGER NOT NULL DEFAULT 0);
`);
let connected = true;
let transactionTail = Promise.resolve();
const run = (sql: string, values: (string | number | boolean | null)[] = []) => {
 const adapted = sql.replace(/ FOR UPDATE/g, "").replace(/INSERT IGNORE INTO/g, "INSERT OR IGNORE INTO")
  .replace(/ON DUPLICATE KEY UPDATE value = VALUES\(value\)/g, "ON CONFLICT(target_steam_id,actor_steam_id) DO UPDATE SET value=excluded.value")
  .replace(/ON DUPLICATE KEY UPDATE comments_enabled = VALUES\(comments_enabled\)/g, "ON CONFLICT(steam_id) DO UPDATE SET comments_enabled=excluded.comments_enabled");
 const args = values.map(value => typeof value === "boolean" ? Number(value) : value);
 if (/^\s*SELECT/i.test(adapted)) return [db.prepare(adapted).all(...args), []];
 const result = db.prepare(adapted).run(...args);
 return [{ affectedRows: Number(result.changes) }, []];
};
const pool = {
 async query(sql: string, values?: (string | number | boolean | null)[]) { return run(sql, values); },
 async getConnection() {
  let releaseLock!: () => void;
  const previous = transactionTail;
  transactionTail = new Promise(resolve => { releaseLock = resolve; });
  await previous;
  return {
   async beginTransaction() { db.exec("BEGIN"); },
   async query(sql: string, values?: (string | number | boolean | null)[]) { return run(sql, values); },
   async execute(sql: string, values?: (string | number | boolean | null)[]) { return run(sql, values); },
   async commit() { db.exec("COMMIT"); }, async rollback() { db.exec("ROLLBACK"); }, release() { releaseLock(); },
  };
 },
};
Object.assign(globalThis, { __profileCommunityPool: () => connected ? pool : null });
registerHooks({ resolve(specifier, context, next) {
 if (specifier === "server-only") return { url: "data:text/javascript,export {}", shortCircuit: true };
 if (specifier === "@/lib/data/database-pools") return { url: "data:text/javascript,export function getPortalDatabasePool(){return globalThis.__profileCommunityPool()}", shortCircuit: true };
 return next(specifier, context);
} });
const { getProfileCommunity, getProfileCommunitySummaries, mutateProfileCommunity } = await import("./profile-community.ts");
const actor = "76561198000000001", target = "76561198000000002", other = "76561198000000003";
let now = 10_000;
test.beforeEach(() => {
 connected = true; now += 100_000;
 test.mock.method(Date, "now", () => now);
 for (const table of ["portal_profile_community", "portal_profile_reputation", "portal_profile_commendations", "portal_profile_comments", "portal_profile_community_limits"]) db.exec(`DELETE FROM ${table}`);
});
test.after(() => db.close());
const mutate = (action: Record<string, unknown>, who = actor) => mutateProfileCommunity({ actorSteamId: who, targetSteamId: target, ...action } as Parameters<typeof mutateProfileCommunity>[0]);

test("reputation is one mutable vote per account and repeated concurrent submissions cannot farm points", async () => {
 await Promise.all(Array.from({ length: 6 }, () => mutate({ action: "reputation", value: 1 })));
 assert.equal((await getProfileCommunitySummaries([target]))[target].reputation, 1);
 now += 501;
 await mutate({ action: "reputation", value: -1 });
 assert.equal((await getProfileCommunity(target, actor)).myReputation, -1);
 assert.equal((await getProfileCommunitySummaries([target]))[target].reputation, -1);
 now += 501;
 await mutate({ action: "reputation", value: 0 });
 assert.equal((await getProfileCommunitySummaries([target]))[target].reputation, 0);
});

test("a commendation submits a deduplicated mutable selection and rejects unknown categories", async () => {
 await mutate({ action: "commendations", kinds: ["helpful", "goat", "helpful"] });
 await mutate({ action: "commendations", kinds: ["goat", "helpful"] });
 let summary = (await getProfileCommunitySummaries([target]))[target];
 assert.equal(summary.commendationTotal, 2); assert.equal(summary.commendations.helpful, 1);
 now += 501;
 await mutate({ action: "commendations", kinds: ["funny"] });
 summary = (await getProfileCommunitySummaries([target]))[target];
 assert.equal(summary.commendationTotal, 1); assert.equal(summary.commendations.helpful, 0);
 await assert.rejects(mutate({ action: "commendations", kinds: ["owner"] }), /valid commendation/i);
});

test("all community interactions reject self voting and invalid IDs", async () => {
 for (const action of [{ action: "reputation", value: 1 }, { action: "commendations", kinds: ["goat"] }, { action: "comment", body: "Hello", requestId: "e91a2f90-e577-44b1-bc67-000000000001" }]) {
  await assert.rejects(mutate(action, target), /own profile/i);
 }
 await assert.rejects(mutateProfileCommunity({ actorSteamId: "bad", targetSteamId: target, action: "reputation", value: 1 }), /valid player/i);
});

test("only the owner controls comments and the server rejects new comments when disabled", async () => {
 await assert.rejects(mutate({ action: "comments_setting", enabled: false }), /own profile/i);
 await mutate({ action: "comments_setting", enabled: false }, target);
 await assert.rejects(mutate({ action: "comment", body: "Hello", requestId: "e91a2f90-e577-44b1-bc67-000000000001" }), /disabled/i);
 assert.equal((await getProfileCommunity(target, actor)).commentsEnabled, false);
});

test("comments remain plain text, bounded, idempotent, paginated and deletable only by author or profile owner", async () => {
 const requestId = "e91a2f90-e577-44b1-bc67-000000000001";
 await mutate({ action: "comment", body: "<script>alert(1)</script> hi", requestId });
 await mutate({ action: "comment", body: "<script>alert(1)</script> hi", requestId });
 let profile = await getProfileCommunity(target, actor);
 assert.equal(profile.comments.total, 1); assert.equal(profile.comments.records[0].body, "<script>alert(1)</script> hi");
 const comment = profile.comments.records[0];
 await assert.rejects(mutate({ action: "delete_comment", commentId: comment.id }, other), /delete/i);
 now += 501;
 await mutate({ action: "delete_comment", commentId: comment.id }, target);
 await mutate({ action: "comment", body: "<script>alert(1)</script> hi", requestId });
 assert.equal((await getProfileCommunity(target, actor)).comments.total, 0, "retry never resurrects deleted comments");
 await assert.rejects(mutate({ action: "comment", body: "x".repeat(1001), requestId }), /1.*1000/i);
 for (let index = 0; index < 13; index++) {
  now += 61_000;
  await mutate({ action: "comment", body: `Message ${index}`, requestId: `e91a2f90-e577-44b1-bc67-${String(index + 2).padStart(12, "0")}` });
 }
 profile = await getProfileCommunity(target, actor, 2);
 assert.equal(profile.comments.page, 2); assert.equal(profile.comments.total, 13); assert.equal(profile.comments.records.length, 3);
 assert.equal((await getProfileCommunity(target, actor, 999)).comments.page, 2);
 now += 501;
 await mutate({ action: "delete_comment", commentId: profile.comments.records[0].id });
 assert.equal((await getProfileCommunity(target, actor)).comments.total, 12);
});

test("mutating actions enforce the server cooldown and failed changes roll back", async () => {
 await mutate({ action: "reputation", value: 1 });
 await assert.rejects(mutate({ action: "commendations", kinds: ["goat"] }), /slow down/i);
 assert.equal((await getProfileCommunitySummaries([target]))[target].commendationTotal, 0);
 now += 500;
 await mutate({ action: "commendations", kinds: ["goat"] });
});

test("unavailable or unmigrated storage gives truthful unavailable reads and clear write errors", async () => {
 connected = false;
 assert.equal((await getProfileCommunity(target, actor)).available, false);
 await assert.rejects(mutate({ action: "reputation", value: 1 }), /unavailable/i);
 connected = true;
 db.exec("ALTER TABLE portal_profile_commendations RENAME TO saved_commendations");
 try {
  assert.equal((await getProfileCommunitySummaries([target]))[target].available, false);
  await assert.rejects(mutate({ action: "commendations", kinds: ["goat"] }), /unavailable/i);
 } finally { db.exec("ALTER TABLE saved_commendations RENAME TO portal_profile_commendations"); }
});
