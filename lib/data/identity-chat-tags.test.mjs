import assert from "node:assert/strict";
import { existsSync } from "node:fs";
import { registerHooks } from "node:module";
import { extname, resolve } from "node:path";
import { DatabaseSync } from "node:sqlite";
import test from "node:test";
import { fileURLToPath, pathToFileURL } from "node:url";

// Execute real create/update/read SQL against an isolated SQLite fixture.
// This verifies value persistence, validation and rollback, not MySQL DDL or locks.
const db = new DatabaseSync(":memory:");
db.exec(`
  CREATE TABLE portal_identity_chat_tags (
    id INTEGER PRIMARY KEY, tag_key TEXT UNIQUE, tag_text TEXT, color_token TEXT,
    name_color_token TEXT, message_color_token TEXT, tag_style TEXT NOT NULL DEFAULT '',
    name_style TEXT NOT NULL DEFAULT '', message_style TEXT NOT NULL DEFAULT '',
    badge_key TEXT NOT NULL DEFAULT '', enabled INTEGER, created_by_steam_id TEXT
  );
  CREATE TABLE portal_identity_audit_events (
    idempotency_key TEXT UNIQUE, actor_type TEXT, actor_id TEXT, action TEXT,
    target_type TEXT, target_id TEXT, metadata TEXT
  );
`);
let transactions = 0;
const pool = {
  async query(sql, values = []) {
    if (sql.includes("GET_LOCK")) return [[{ acquired: 1 }], []];
    if (!sql.includes("FROM portal_identity_chat_tags ORDER BY")) return [[], []];
    return [db.prepare(sql).all(...values), []];
  },
  async execute(sql, values = []) {
    const result = db.prepare(sql.replace("INSERT IGNORE", "INSERT OR IGNORE"))
      .run(...values.map((value) => typeof value === "boolean" ? Number(value) : value));
    return [{ affectedRows: Number(result.changes), insertId: Number(result.lastInsertRowid) }, []];
  },
  async getConnection() { return this; },
  async beginTransaction() { transactions++; db.exec("BEGIN"); },
  async commit() { db.exec("COMMIT"); },
  async rollback() { db.exec("ROLLBACK"); },
  release() {},
};
globalThis.__chatTagTestPool = pool;
function sourceModuleUrl(path) {
  const match = (extname(path) ? [path] : [`${path}.ts`, `${path}.tsx`, resolve(path, "index.ts")]).find(existsSync);
  return match ? pathToFileURL(match).href : null;
}
registerHooks({
  resolve(specifier, context, nextResolve) {
    if (specifier === "server-only") return { url: "data:text/javascript,export {};", shortCircuit: true };
    if (specifier === "@/lib/data/database-pools") return {
      url: "data:text/javascript,export function getGameDatabasePool(){return null} export function getPortalDatabasePool(){return globalThis.__chatTagTestPool}", shortCircuit: true,
    };
    if (specifier === "@/lib/data/identity-catalogue") return {
      url: "data:text/javascript,export async function ensureIdentityCatalogue(){} export async function getIdentityCatalogueStatus(){return {}} export async function syncIdentityCatalogue(){}", shortCircuit: true,
    };
    if (specifier.startsWith("@/")) {
      const url = sourceModuleUrl(resolve(specifier.slice(2)));
      if (url) return { url, shortCircuit: true };
    }
    if (specifier.startsWith(".") && context.parentURL?.startsWith("file:")) {
      const url = sourceModuleUrl(fileURLToPath(new URL(specifier, context.parentURL)));
      if (url) return { url, shortCircuit: true };
    }
    return nextResolve(specifier, context);
  },
});
const { createIdentityChatTag, updateIdentityChatTag, getIdentityAdminSnapshot } = await import("./identity-groups.ts");
const actor = { steamId: "76561198000000001", isFounder: true };
const base = { actor, requestKey: "chat-create-001", key: "group.rich", text: "[RICH]", colorToken: "#ab12ef" };

test("create, read, edit and clear rich tag presentation without losing colors", async () => {
  const { tagId } = await createIdentityChatTag({ ...base, nameColorToken: "rgb(0, 128, 255)",
    tagStyle: "glow bold bold", nameStyle: "italic", messageStyle: "pulse shimmer", badgeKey: "VIP" });
  const tag = (await getIdentityAdminSnapshot()).tags.find((entry) => entry.id === tagId);
  assert.deepEqual(tag, { id: tagId, key: "group.rich", text: "[RICH]", colorToken: "#AB12EF",
    nameColorToken: "#0080FF", messageColorToken: null, tagStyle: "bold glow", nameStyle: "italic",
    messageStyle: "shimmer pulse", badgeKey: "vip", enabled: true });
  await updateIdentityChatTag({ actor, tagId, requestKey: "chat-update-001", text: "[EDIT]", colorToken: "[/]",
    nameColorToken: "", messageColorToken: "[brown]", tagStyle: "gradient underline", nameStyle: "bold", messageStyle: "glow", badgeKey: "tapped", enabled: false });
  const updated = (await getIdentityAdminSnapshot()).tags.find((entry) => entry.id === tagId);
  assert.deepEqual(updated, { ...tag, text: "[EDIT]", colorToken: "[/]", nameColorToken: null,
    messageColorToken: "[brown]", tagStyle: "underline gradient", nameStyle: "bold", messageStyle: "glow", badgeKey: "tapped", enabled: false });
  await updateIdentityChatTag({ actor, tagId, requestKey: "chat-update-002", text: "[EDIT]", colorToken: "[gold]", enabled: true });
  const cleared = (await getIdentityAdminSnapshot()).tags.find((entry) => entry.id === tagId);
  for (const field of ["tagStyle", "nameStyle", "messageStyle", "badgeKey"]) assert.equal(cleared[field], "");
});

test("invalid styles, badges and colors are rejected before any transaction", async () => {
  const before = transactions;
  for (const invalid of [{ tagStyle: "color:red" }, { nameStyle: "<i>" }, { messageStyle: "url(x)" },
    { badgeKey: "../vip" }, { colorToken: "#fff;" }, { nameColorToken: "rgb(999,0,0)" }]) {
    await assert.rejects(createIdentityChatTag({ ...base, ...invalid }), { code: "invalid_input" });
    await assert.rejects(updateIdentityChatTag({ ...base, ...invalid, tagId: 1, enabled: true }), { code: "invalid_input" });
  }
  assert.equal(transactions, before);
});

test("replayed audit request rolls back a changed presentation", async () => {
  const previous = (await getIdentityAdminSnapshot()).tags[0];
  await assert.rejects(updateIdentityChatTag({ actor, requestKey: "chat-update-002", tagId: previous.id,
    text: "[WRONG]", colorToken: "#123456", tagStyle: "pulse", badgeKey: "vip", enabled: true }), { code: "request_replayed" });
  assert.deepEqual((await getIdentityAdminSnapshot()).tags[0], previous);
});
