import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { existsSync } from "node:fs";
import { registerHooks } from "node:module";
import { resolve } from "node:path";
import { DatabaseSync } from "node:sqlite";
import test from "node:test";
import { fileURLToPath, pathToFileURL } from "node:url";

const db = new DatabaseSync(":memory:");
db.exec("CREATE TABLE portal_sessions (token_hash TEXT PRIMARY KEY, steam_id TEXT, expires_at INTEGER, last_seen_at TEXT DEFAULT 'unchanged')");
const token = "opaque-session-token-with-at-least-thirty-two-characters";
const hash = createHash("sha256").update(token).digest("hex");
const steamId = "76561198000000001";
const imageKey = "a".repeat(64);
const origin = process.env.SITE_URL ? new URL(process.env.SITE_URL).origin : "https://arena.test";
const state = {
  cookie: token as string | undefined, fullSessionReads: 0,
  queries: [] as Array<{ sql: string; values: unknown[] }>,
  reads: 0, owners: [] as string[], poolAvailable: true, failQuery: false, expireDuringRead: false,
  async query(sql: string, values: unknown[]) {
    this.queries.push({ sql, values });
    if (this.failQuery) throw new Error("Session database unavailable");
    assert.match(sql.trim(), /^SELECT\b/i, "Thumbnail authentication must never write session state");
    const rows = db.prepare(sql).all(...values as Array<string | number>);
    if (this.expireDuringRead && rows[0]) rows[0].expires_at = Date.now() - 1;
    return [rows];
  },
  readFullSession(tokenHash: string) {
    this.fullSessionReads++;
    const row = db.prepare("SELECT steam_id, expires_at FROM portal_sessions WHERE token_hash = ? AND expires_at > ?").get(tokenHash, Date.now());
    return row ? { steamId: row.steam_id, expiresAt: Number(row.expires_at), profileThemeKey: "moderator" } : null;
  },
};
Object.assign(globalThis, { __thumbnailSessionTest: state });
const stubs: Record<string, string> = {
  "server-only": "export {};",
  "next/headers": "export async function cookies(){return {get:name=>name==='arena_session'?{value:globalThis.__thumbnailSessionTest.cookie}:undefined};}",
  "@/lib/data/database-pools": "export function getPortalDatabasePool(){const s=globalThis.__thumbnailSessionTest;return s.poolAvailable?s:null;}",
  "@/lib/data/portal-repository": `const s=globalThis.__thumbnailSessionTest;
    export async function getPortalSession(hash){return s.readFullSession(hash);}
    export async function createPortalSession(){throw Error('Unexpected session creation');}
    export async function revokePortalSession(){throw Error('Unexpected session revocation');}`,
  "@/lib/economy/thumbnail-service": `const s=globalThis.__thumbnailSessionTest;
    export function weaponThumbnailCache(){return {
      async read(key){s.reads++;return key==='${imageKey}'?Buffer.from('cached-webp'):null;},
      async lookup(){s.reads++;return {key:'${imageKey}',status:'ready',retryAfterMs:0};},
      async request(item,owner){s.owners.push(owner);return {key:'${imageKey}',status:'ready',retryAfterMs:0};}
    };}`,
};
registerHooks({ resolve(specifier, context, next) {
  if (stubs[specifier]) return { url: `data:text/javascript,${encodeURIComponent(stubs[specifier])}`, shortCircuit: true };
  const path = specifier.startsWith("@/") ? resolve(specifier.slice(2))
    : specifier.startsWith(".") && context.parentURL?.startsWith("file:") ? fileURLToPath(new URL(specifier, context.parentURL)) : null;
  if (path) {
    const source = [path, `${path}.ts`].find(existsSync);
    if (source) return { url: pathToFileURL(source).href, shortCircuit: true };
  }
  return next(specifier, context);
} });
const { GET } = await import("./thumbnails/[key]/route.ts");
const { POST } = await import("./thumbnails/route.ts");
const { getSession } = await import("../../../lib/auth/session.ts");
const context = (key = imageKey) => ({ params: Promise.resolve({ key }) });
const imageRequest = (headers: Record<string, string> = {}) => new Request(`${origin}/api/economy/thumbnails/${imageKey}`, { headers });
const statusRequest = (headers: Record<string, string> = {}, cacheOnly = false) => new Request(`${origin}/api/economy/thumbnails`, {
  method: "POST", headers: { "content-type": "application/json", origin, ...headers },
  body: JSON.stringify({ items: [{ defindex: 7, paintIndex: 44, float: 0.2, seed: 661 }], cacheOnly }),
});
test.beforeEach(() => {
  state.cookie = token; state.fullSessionReads = 0; state.queries = []; state.reads = 0; state.owners = [];
  state.poolAvailable = true; state.failQuery = false; state.expireDuringRead = false;
  db.exec("DELETE FROM portal_sessions");
  db.prepare("INSERT INTO portal_sessions (token_hash, steam_id, expires_at) VALUES (?, ?, ?)").run(hash, steamId, Date.now() + 60_000);
});
test.after(() => db.close());

test("twenty cached images use only indexed session reads without themes or last-seen writes", async () => {
  const responses = await Promise.all(Array.from({ length: 20 }, () => GET(imageRequest(), context())));
  assert.ok(responses.every(response => response.status === 200));
  assert.equal(state.fullSessionReads, 0);
  assert.equal(state.queries.length, 20);
  assert.ok(state.queries.every(query => !/\bJOIN\b|theme|last_seen/i.test(query.sql)));
  assert.ok(state.queries.every(query => query.values[0] === hash));
  assert.equal(db.prepare("SELECT last_seen_at FROM portal_sessions").get()?.last_seen_at, "unchanged");
});

test("cache-only POST authenticates once and never invokes render creation",async()=>{
  const response=await POST(statusRequest({},true));
  assert.equal(response.status,200);assert.equal(state.reads,1);
  assert.equal(state.queries.length,1);assert.deepEqual(state.owners,[]);
  assert.equal((await response.json()).tickets[0].src,`/api/economy/thumbnails/${imageKey}`);
});

test("missing, short and tampered cookies never authenticate", async () => {
  for (const cookie of [undefined, "short", `${token}-tampered`]) {
    state.cookie = cookie;
    assert.equal((await GET(imageRequest(), context())).status, 401);
  }
  assert.equal(state.reads, 0);
  assert.equal(state.queries.length, 1, "Only a syntactically valid opaque token reaches the database");
});

test("session expiry and revocation take effect on the next request without a stale cache", async () => {
  assert.equal((await GET(imageRequest(), context())).status, 200);
  db.prepare("UPDATE portal_sessions SET expires_at = ? WHERE token_hash = ?").run(Date.now(), hash);
  assert.equal((await GET(imageRequest(), context())).status, 401);
  db.prepare("UPDATE portal_sessions SET expires_at = ? WHERE token_hash = ?").run(Date.now() + 60_000, hash);
  assert.equal((await GET(imageRequest(), context())).status, 200);
  db.prepare("DELETE FROM portal_sessions WHERE token_hash = ?").run(hash);
  assert.equal((await GET(imageRequest(), context())).status, 401);
});

test("invalid identity, expiry during the read, and unavailable storage fail closed", async () => {
  db.prepare("UPDATE portal_sessions SET steam_id = ?").run("invalid-player");
  assert.equal((await GET(imageRequest(), context())).status, 401);
  db.prepare("UPDATE portal_sessions SET steam_id = ?").run(steamId);
  state.expireDuringRead = true;
  assert.equal((await GET(imageRequest(), context())).status, 401);
  state.expireDuringRead = false; state.failQuery = true;
  assert.equal((await GET(imageRequest(), context())).status, 401);
  state.failQuery = false; state.poolAvailable = false;
  assert.equal((await GET(imageRequest(), context())).status, 401);
  assert.equal(state.reads, 0);
});

test("conditional and missing images retain authentication and existing HTTP behavior", async () => {
  const response = await GET(imageRequest({ "if-none-match": `"${imageKey}"` }), context());
  assert.equal(response.status, 304);
  assert.match(response.headers.get("cache-control") ?? "", /private/);
  assert.equal(response.headers.get("vary"), "Cookie");
  assert.equal((await GET(imageRequest(), context("b".repeat(64)))).status, 404);
  assert.equal((await GET(imageRequest(), context("../invalid"))).status, 404);
  state.cookie = undefined;
  assert.equal((await GET(imageRequest({ "if-none-match": `"${imageKey}"` }), context())).status, 401);
});

test("POST keeps origin rejection and session-owned quota identity on the lightweight path", async () => {
  assert.equal((await POST(statusRequest({ origin: "https://attacker.test" }))).status, 403);
  assert.equal((await POST(statusRequest({ "sec-fetch-site": "cross-site" }))).status, 403);
  assert.equal(state.queries.length, 0);
  assert.equal((await POST(statusRequest())).status, 200);
  assert.deepEqual(state.owners, [steamId]);
  assert.equal(state.fullSessionReads, 0);
  assert.equal(state.queries.length, 1);
  db.prepare("DELETE FROM portal_sessions WHERE token_hash = ?").run(hash);
  assert.equal((await POST(statusRequest())).status, 401);
  assert.equal(state.owners.length, 1);
});

test("the full session API still returns its authorized theme and token hash", async () => {
  const session = await getSession();
  assert.equal(session?.steamId, steamId);
  assert.equal(session?.tokenHash, hash);
  assert.equal(session?.profileThemeKey, "moderator");
  assert.equal(state.fullSessionReads, 1);
});
