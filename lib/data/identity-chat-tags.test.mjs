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
let missingRichColumn = "";
let hasGroups = false;
let readError = null;
let writeError = null;
const tagReadAttempts = [];
function missingField(column) {
  return Object.assign(new Error(`Unknown column '${column}' in 'field list'`), { code: "ER_BAD_FIELD_ERROR", errno: 1054 });
}
function guardSchema(sql) {
  if (missingRichColumn && new RegExp(`(?:tags\\.)?${missingRichColumn}(?![a-z_])`).test(sql.replaceAll(/'' AS [a-z_]+/g, ""))) {
    throw missingField(sql.includes("tags.tag_style") ? `tags.${missingRichColumn}` : missingRichColumn);
  }
}
const pool = {
  async query(sql, values = []) {
    if (sql.includes("GET_LOCK")) return [[{ acquired: 1 }], []];
    if (hasGroups && sql.includes("FROM portal_identity_groups AS g")) return [[{
      id: 1, group_key: "staff", display_name: "Staff", source_type: "custom", enabled: 1,
      badge_label: "Staff", badge_icon_key: "shield", badge_color: "#FFFFFF", badge_soft_color: "#000000", profile_priority: 10,
    }], []];
    if (hasGroups && sql.includes("FROM portal_identity_privileges ORDER BY")) return [[{
      id: 1, privilege_key: "admins.notify", scope: "game", display_name: "Notify", enabled: 1,
    }], []];
    if (sql.includes("portal_identity_chat_tags")) {
      tagReadAttempts.push(sql);
      if (readError) throw readError;
      guardSchema(sql);
    }
    if (sql.includes("FROM portal_identity_player_chat_tags AS assigned") || sql.includes("FROM portal_identity_group_chat_tags AS links")) {
      const fields = sql.slice(7, sql.indexOf(" FROM "))
        .replace("assigned.steam_id, assigned.starts_at, assigned.expires_at, assigned.grant_reason, ", "")
        .replace("preferences.hidden", "0 AS hidden").replace("links.group_id", "1 AS group_id");
      return [db.prepare(`SELECT ${fields} FROM portal_identity_chat_tags AS tags`).all().map((tag) => ({ ...tag,
        steam_id: "76561198000000001", starts_at: "2026-01-01", expires_at: null })), []];
    }
    if (!sql.includes("FROM portal_identity_chat_tags ORDER BY")) return [[], []];
    return [db.prepare(sql).all(...values), []];
  },
  async execute(sql, values = []) {
    if (sql.includes("portal_identity_chat_tags")) {
      if (writeError) throw writeError;
      guardSchema(sql);
    }
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
      url: "data:text/javascript,export function getGameDatabasePool(){return globalThis.__chatTagTestGamePool ?? null} export function getPortalDatabasePool(){return globalThis.__chatTagTestPool}", shortCircuit: true,
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
const { createIdentityChatTag, updateIdentityChatTag, getIdentityAdminSnapshot, getEffectiveIdentity } = await import("./identity-groups.ts");
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


test("missing rich-tag columns preserve legacy admin and effective identity reads", async () => {
  for (const column of ["tag_style", "name_style", "message_style", "badge_key"]) {
    missingRichColumn = column;
    try {
      const snapshot = await getIdentityAdminSnapshot();
      assert.equal(snapshot.richChatTagsAvailable, false);
      assert.equal(snapshot.tags.length, 1);
      assert.equal(snapshot.tags[0].text, "[EDIT]");
      assert.equal(snapshot.directTagGrants.length, 1);
      for (const field of ["tagStyle", "nameStyle", "messageStyle", "badgeKey"]) assert.equal(snapshot.tags[0][field], "");
      const effective = await getEffectiveIdentity({ steamId: actor.steamId });
      assert.equal(effective.tags.length, 1);
      assert.equal(effective.tags[0].colorToken, "[gold]");
      assert.equal(effective.tags[0].tagStyle, "");
    } finally { missingRichColumn = ""; }
  }
  assert.equal((await getIdentityAdminSnapshot()).richChatTagsAvailable, true);
});

test("old-schema writes fail with migration 033 guidance and do not change existing data", async () => {
  const previous = (await getIdentityAdminSnapshot()).tags;
  missingRichColumn = "tag_style";
  try {
    const expected = (error) => error.code === "rich_chat_migration_required" && error.message.includes("033_rich_chat_tag_styles.sql");
    await assert.rejects(createIdentityChatTag({ ...base, key: "group.new", requestKey: "legacy-create-01", tagStyle: "glow" }), expected);
    await assert.rejects(updateIdentityChatTag({ ...base, tagId: 1, requestKey: "legacy-update-01", enabled: true }), expected);
  } finally { missingRichColumn = ""; }
  assert.deepEqual((await getIdentityAdminSnapshot()).tags, previous);
});

test("unrelated missing columns and database failures are never treated as rich-tag rollout", async () => {
  for (const error of [missingField("enabled"), missingField("other.tag_style"),
    Object.assign(new Error("connection lost"), { code: "PROTOCOL_CONNECTION_LOST" })]) {
    readError = error;
    const before = tagReadAttempts.length;
    try { await assert.rejects(getIdentityAdminSnapshot(), (actual) => actual === error); }
    finally { readError = null; }
    assert.equal(tagReadAttempts.slice(before).some((sql) => sql.includes("'' AS tag_style")), false);
    writeError = error;
    try { await assert.rejects(updateIdentityChatTag({ ...base, tagId: 1, requestKey: "db-failure-01", enabled: true }), (actual) => actual === error); }
    finally { writeError = null; }
  }
});


test("legacy rich-field fallback preserves group tags, memberships and permission catalogue", async () => {
  hasGroups = true;
  missingRichColumn = "tag_style";
  const before = tagReadAttempts.length;
  globalThis.__chatTagTestGamePool = { async query(sql) {
    if (sql.startsWith("SELECT membership.steam_id")) return [[{
      steam_id: actor.steamId, legacy_portal_group_id: 1, group_type: "custom", expires_at: null,
    }], []];
    return [[], []];
  } };
  try {
    const snapshot = await getIdentityAdminSnapshot();
    assert.equal(snapshot.richChatTagsAvailable, false);
    assert.equal(snapshot.groups[0].displayName, "Staff");
    assert.equal(snapshot.groups[0].tags[0].text, "[EDIT]");
    assert.equal(snapshot.privileges[0].key, "admins.notify");
    const effective = await getEffectiveIdentity({ steamId: actor.steamId });
    assert.equal(effective.groups[0].hasPortalMembership, true);
    assert.equal(effective.groups[0].tags[0].text, "[EDIT]");
    assert.equal(effective.groups[0].tags[0].tagStyle, "");
    assert.equal(tagReadAttempts.slice(before).filter((sql) => sql.includes("'' AS tag_style")).length, 5);
  } finally { missingRichColumn = ""; hasGroups = false; delete globalThis.__chatTagTestGamePool; }
});

test("Arena connection failures still reject the admin snapshot", async () => {
  const error = Object.assign(new Error("Arena connection refused"), { code: "ECONNREFUSED" });
  globalThis.__chatTagTestGamePool = { async query() { throw error; } };
  try { await assert.rejects(getIdentityAdminSnapshot(), (actual) => actual === error); }
  finally { delete globalThis.__chatTagTestGamePool; }
});
