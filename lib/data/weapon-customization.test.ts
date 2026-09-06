import assert from "node:assert/strict";
import { existsSync } from "node:fs";
import { registerHooks } from "node:module";
import { extname, resolve } from "node:path";
import { DatabaseSync } from "node:sqlite";
import test from "node:test";
import { fileURLToPath, pathToFileURL } from "node:url";

// Exercise the real repository SQL/transaction in isolated SQLite. MySQL row
// locking and production replication still need a live staging-server check.
const db = new DatabaseSync(":memory:");
let failRefresh = false;
const sql = (value: string) => value.replaceAll(" FOR UPDATE", "").replaceAll("INSERT IGNORE INTO", "INSERT OR IGNORE INTO").replaceAll("ON DUPLICATE KEY UPDATE", "ON CONFLICT DO UPDATE SET");
const values = (input: unknown[]) => input.map((v) => typeof v === "boolean" ? Number(v) : v) as Array<string | number | null>;
const executor = {
  async query(query: string, args: unknown[] = []) { return [db.prepare(sql(query)).all(...values(args)), []]; },
  async execute(query: string, args: unknown[] = []) {
    if (failRefresh && query.includes("INSERT INTO portal_economy_jobs")) throw new Error("refresh unavailable");
    const result = db.prepare(sql(query)).run(...values(args));
    return [{ affectedRows: Number(result.changes), insertId: Number(result.lastInsertRowid) }, []];
  },
  async getConnection() { return this; }, async beginTransaction() { db.exec("BEGIN"); },
  async commit() { db.exec("COMMIT"); }, async rollback() { db.exec("ROLLBACK"); }, release() {},
};
Object.assign(globalThis, { __weaponTestPool: executor });
function moduleUrl(path: string) {
  const file = (extname(path) ? [path] : [`${path}.ts`, `${path}.tsx`, resolve(path, "index.ts")]).find(existsSync);
  return file ? pathToFileURL(file).href : null;
}
registerHooks({ resolve(specifier, context, next) {
  const stubs: Record<string, string> = {
    "server-only": "export {};",
    "@/lib/data/database-pools": "export function getGameDatabasePool(){return globalThis.__weaponTestPool} export function getPortalDatabasePool(){return globalThis.__weaponTestPool}",
    "@/lib/data/identity-catalogue": "export async function ensureIdentityCatalogue(){} export async function getIdentityCatalogueStatus(){} export async function syncIdentityCatalogue(){}",
    "@/lib/data/staff-vip-memberships": "export class StaffVipMembershipError extends Error {}",
    "@/lib/data/vip-membership-activation-saga": "export async function activateVipMembershipItemWithSaga(){}",
  };
  if (stubs[specifier]) return { url: `data:text/javascript,${stubs[specifier]}`, shortCircuit: true };
  if (specifier === "next/server") return { url: pathToFileURL(resolve("node_modules/next/server.js")).href, shortCircuit: true };
  const url = specifier.startsWith("@/") ? moduleUrl(resolve(specifier.slice(2)))
    : specifier.startsWith(".") && context.parentURL?.startsWith("file:") ? moduleUrl(fileURLToPath(new URL(specifier, context.parentURL))) : null;
  return url ? { url, shortCircuit: true } : next(specifier, context);
} });
const { customizeEconomyWeapon } = await import("./portal-repository.ts");
db.exec(`
CREATE TABLE portal_economy_operations (id INTEGER PRIMARY KEY, operation_name TEXT, idempotency_key TEXT UNIQUE, actor_steam_id TEXT, request_hash TEXT, status TEXT DEFAULT 'pending', result_json TEXT, completed_at TEXT);
CREATE TABLE portal_inventory_items (id TEXT PRIMARY KEY, owner_steam_id TEXT, catalogue_id INTEGER, item_type TEXT, state TEXT DEFAULT 'available', definition_index INTEGER, paintkit INTEGER, seed INTEGER, float_value REAL, stattrak INTEGER DEFAULT 0, stattrak_count INTEGER DEFAULT 0, nametag TEXT, rarity_rank INTEGER DEFAULT 4, tradable INTEGER DEFAULT 1, sale_locked INTEGER DEFAULT 0, attributes TEXT DEFAULT '{}', source TEXT DEFAULT '{}', acquired_at TEXT DEFAULT '2026-01-01', consumed_at TEXT, updated_at TEXT DEFAULT '2026-01-01');
CREATE TABLE portal_economy_catalogue (id INTEGER PRIMARY KEY, catalogue_key TEXT, market_hash_name TEXT, display_name TEXT, rarity_rank INTEGER, metadata TEXT, enabled INTEGER);
CREATE TABLE portal_economy_catalogue_prices (id INTEGER PRIMARY KEY, catalogue_id INTEGER, is_current INTEGER, market_price_eur_cents INTEGER, token_price INTEGER, price_source TEXT, source_reference TEXT, observed_at TEXT);
CREATE TABLE portal_inventory_item_stickers (weapon_item_id TEXT, sticker_slot INTEGER, sticker_item_id TEXT UNIQUE, sticker_catalogue_id INTEGER, sticker_definition_index INTEGER, sticker_paintkit INTEGER, sticker_rarity_rank INTEGER, applied_by_steam_id TEXT, attributes TEXT, PRIMARY KEY(weapon_item_id, sticker_slot));
CREATE TABLE portal_inventory_item_events (item_id TEXT, actor_steam_id TEXT, event_type TEXT, idempotency_key TEXT, line_key TEXT, before_state TEXT, after_state TEXT, metadata TEXT);
CREATE TABLE portal_economy_jobs (id INTEGER PRIMARY KEY, job_type TEXT, target_steam_id TEXT, payload TEXT, idempotency_key TEXT UNIQUE);
`);
const player = "76561198000000001";
const other = "76561198000000002";
const placement = { slot: 4, id: 37, stickerItemId: "10000000-0000-4000-8000-000000000002", offsetX: 0.2, offsetY: -0.1, rotation: 90, wear: 0.15 };
const charm = { id: 5, charmItemId: "10000000-0000-4000-8000-000000000003", offsetX: 1, offsetY: 2, offsetZ: 3 };
const request = (customization: unknown = { stickers: [placement], charm }, key = "customization-test-0001") => ({ steamId: player, weaponItemId: "10000000-0000-4000-8000-000000000001", customization, idempotencyKey: key });
const row = (id: string) => db.prepare("SELECT * FROM portal_inventory_items WHERE id = ?").get(id)!;
const count = (table: string) => db.prepare(`SELECT count(*) AS n FROM ${table}`).get()!.n;
function reset() {
  failRefresh = false;
  for (const table of ["portal_economy_operations", "portal_inventory_item_events", "portal_economy_jobs", "portal_inventory_item_stickers", "portal_inventory_items"]) db.exec(`DELETE FROM ${table}`);
  const insert = db.prepare("INSERT INTO portal_inventory_items (id, owner_steam_id, item_type, definition_index, paintkit, seed, float_value, attributes) VALUES (?,?,?,?,?,?,?,?)");
  insert.run("10000000-0000-4000-8000-000000000001", player, "skin", 7, 44, 661, 0.123456789, JSON.stringify({ stickerSlots: 5, unrelated: "keep" }));
  insert.run("10000000-0000-4000-8000-000000000002", player, "sticker", 37, null, null, null, JSON.stringify({ customMetadata: "keep" }));
  insert.run("10000000-0000-4000-8000-000000000003", player, "keychain", 5, null, 123, null, "{}");
}

test("saves owned attachments atomically, preserves instance identity and makes retries idempotent", async () => {
  reset();
  await customizeEconomyWeapon(request());
  assert.equal(row("10000000-0000-4000-8000-000000000002").state, "attached");
  assert.equal(row("10000000-0000-4000-8000-000000000003").state, "consumed");
  assert.equal(row("10000000-0000-4000-8000-000000000001").float_value, 0.123456789);
  assert.equal(row("10000000-0000-4000-8000-000000000001").seed, 661);
  assert.equal(row("10000000-0000-4000-8000-000000000001").stattrak, 0);
  const attributes = JSON.parse(String(row("10000000-0000-4000-8000-000000000001").attributes));
  assert.equal(attributes.unrelated, "keep");
  assert.deepEqual(attributes.keychain, { id: 5, seed: 123, offsetX: 1, offsetY: 2, offsetZ: 3 });
  const sticker = db.prepare("SELECT * FROM portal_inventory_item_stickers").get()!;
  const positions = JSON.parse(String(sticker.attributes));
  assert.equal(positions.schema, 1);
  assert.ok(Math.abs(positions.offsetX - 0.32881461) < 0.000001);
  assert.equal(positions.customMetadata, "keep");
  const eventCount = count("portal_inventory_item_events");
  await customizeEconomyWeapon(request());
  assert.equal(count("portal_inventory_item_events"), eventCount);
  assert.equal(count("portal_economy_jobs"), 1);
});
test("repositioning an attached sticker/charm consumes no new inventory items", async () => {
  reset(); await customizeEconomyWeapon(request());
  const { stickerItemId: _s, ...existingSticker } = placement;
  const { charmItemId: _c, ...existingCharm } = charm;
  await customizeEconomyWeapon(request({ stickers: [{ ...existingSticker, rotation: 180 }], charm: { ...existingCharm, offsetZ: 4 } }, "customization-test-0002"));
  assert.equal(count("portal_inventory_item_stickers"), 1);
  assert.equal(JSON.parse(String(row("10000000-0000-4000-8000-000000000001").attributes)).keychain.offsetZ, 4);
});
test("rejects another player's weapon or additions and unavailable items", async () => {
  for (const id of ["10000000-0000-4000-8000-000000000001", "10000000-0000-4000-8000-000000000002", "10000000-0000-4000-8000-000000000003"]) {
    reset(); db.prepare("UPDATE portal_inventory_items SET owner_steam_id = ? WHERE id = ?").run(other, id);
    await assert.rejects(customizeEconomyWeapon(request()), { code: "ownership_required" });
    assert.equal(count("portal_inventory_item_stickers"), 0);
    assert.equal(count("portal_economy_jobs"), 0);
  }
  reset(); db.exec("UPDATE portal_inventory_items SET state = 'escrowed' WHERE id = '10000000-0000-4000-8000-000000000001'");
  await assert.rejects(customizeEconomyWeapon(request()), { code: "ownership_required" });
});
test("a failed refresh job rolls back consumed charms, attachment rows and audit events", async () => {
  reset(); failRefresh = true;
  await assert.rejects(customizeEconomyWeapon(request()), /refresh unavailable/);
  assert.equal(row("10000000-0000-4000-8000-000000000002").state, "available");
  assert.equal(row("10000000-0000-4000-8000-000000000003").state, "available");
  assert.equal(count("portal_inventory_item_stickers"), 0);
  assert.equal(count("portal_inventory_item_events"), 0);
  assert.equal(count("portal_economy_operations"), 0);
});
test("preserves legacy sixth slots and rejects forged identities", async () => {
  reset(); db.exec("INSERT INTO portal_inventory_item_stickers (weapon_item_id, sticker_slot, sticker_item_id, sticker_definition_index, attributes) VALUES ('10000000-0000-4000-8000-000000000001',5,'10000000-0000-4000-8000-000000000004',99,'{}')");
  await customizeEconomyWeapon(request());
  assert.equal(count("portal_inventory_item_stickers"), 2);
  await assert.rejects(customizeEconomyWeapon(request({ stickers: [{ ...placement, id: 99 }], charm }, "customization-test-0003")), { code: "ownership_required" });
  assert.equal(count("portal_inventory_item_stickers"), 2);
});
