import assert from "node:assert/strict";
import { existsSync } from "node:fs";
import { registerHooks } from "node:module";
import { extname, resolve } from "node:path";
import { DatabaseSync } from "node:sqlite";
import test from "node:test";
import { fileURLToPath, pathToFileURL } from "node:url";

// Run real repository SQL in isolated SQLite; only MySQL syntax is adapted.
const db = new DatabaseSync(":memory:");
let activeDiscountRows: Array<Record<string, unknown>> = [];
db.function("JSON_UNQUOTE", (value) => value);
const sql = (query: string) => query.replaceAll(" FOR UPDATE", "").replaceAll("INSERT IGNORE INTO", "INSERT OR IGNORE INTO").replace(/ ON DUPLICATE KEY UPDATE .+$/, " ON CONFLICT DO NOTHING");
const executor = {
  async query(query: string, args: unknown[] = []) {
    if (query.includes("portal_economy_discount_rules")) return [activeDiscountRows, []];
    return [db.prepare(sql(query)).all(...args as Array<string | number | null>), []];
  },
  async execute(query: string, args: unknown[] = []) {
    const result = db.prepare(sql(query)).run(...args.map((value) => typeof value === "boolean" ? Number(value) : value) as Array<string | number | null>);
    return [{ affectedRows: Number(result.changes), insertId: Number(result.lastInsertRowid) }, []];
  },
  async getConnection() { return this; }, async beginTransaction() { db.exec("BEGIN"); },
  async commit() { db.exec("COMMIT"); }, async rollback() { db.exec("ROLLBACK"); }, release() {},
};
Object.assign(globalThis, { __finishTestPool: executor });
function moduleUrl(path: string) {
  const file = (extname(path) ? [path] : [`${path}.ts`, `${path}.tsx`, resolve(path, "index.ts")]).find(existsSync);
  return file ? pathToFileURL(file).href : null;
}
registerHooks({ resolve(specifier, context, next) {
  const stubs: Record<string, string> = {
    "server-only": "export {};",
    "@/lib/data/database-pools": "export function getGameDatabasePool(){return globalThis.__finishTestPool} export function getPortalDatabasePool(){return globalThis.__finishTestPool}",
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
const { getEconomyCatalogue, getEconomyCatalogueItem, getEconomyCrateDropPreview, purchaseEconomyItem, sellEconomyItem, awardEconomyDrop } = await import("./portal-repository.ts");
db.exec(`
CREATE TABLE portal_steam_accounts (steam_id TEXT PRIMARY KEY, updated_at TEXT);
CREATE TABLE portal_economy_catalogue (id INTEGER PRIMARY KEY, catalogue_key TEXT, market_hash_name TEXT, item_type TEXT, definition_index INTEGER, paintkit INTEGER, rarity_rank INTEGER DEFAULT 3, display_name TEXT, metadata TEXT DEFAULT '{}', enabled INTEGER DEFAULT 1, created_at TEXT, updated_at TEXT);
CREATE TABLE portal_economy_catalogue_prices (id INTEGER PRIMARY KEY, catalogue_id INTEGER, is_current INTEGER, market_price_eur_cents INTEGER, token_price INTEGER, price_source TEXT, source_reference TEXT, observed_at TEXT);
CREATE TABLE portal_economy_operations (id INTEGER PRIMARY KEY, operation_name TEXT, idempotency_key TEXT UNIQUE, actor_steam_id TEXT, request_hash TEXT, status TEXT DEFAULT 'pending', result_json TEXT, completed_at TEXT);
CREATE TABLE portal_token_accounts (steam_id TEXT PRIMARY KEY, balance INTEGER DEFAULT 0, lifetime_earned INTEGER DEFAULT 0, lifetime_spent INTEGER DEFAULT 0, created_at TEXT, updated_at TEXT);
CREATE TABLE portal_loot_tables (id INTEGER PRIMARY KEY, code TEXT, table_type TEXT, container_catalogue_id INTEGER, display_name TEXT, enabled INTEGER DEFAULT 1, metadata TEXT DEFAULT '{}');
CREATE TABLE portal_loot_entries (id INTEGER PRIMARY KEY, loot_table_id INTEGER, catalogue_id INTEGER, weight INTEGER DEFAULT 1, min_float REAL, max_float REAL, seed_min INTEGER, seed_max INTEGER, stattrak_chance_bps INTEGER DEFAULT 0, attributes TEXT DEFAULT '{}', enabled INTEGER DEFAULT 1);
CREATE TABLE portal_inventory_items (id TEXT PRIMARY KEY, owner_steam_id TEXT, catalogue_id INTEGER, item_type TEXT, definition_index INTEGER, paintkit INTEGER, seed INTEGER, float_value REAL, stattrak INTEGER, stattrak_count INTEGER, nametag TEXT, rarity_rank INTEGER, tradable INTEGER, state TEXT, attributes TEXT, source TEXT);
CREATE TABLE portal_inventory_item_events (item_id TEXT, actor_steam_id TEXT, event_type TEXT, idempotency_key TEXT, line_key TEXT, before_state TEXT, after_state TEXT, metadata TEXT);
CREATE TABLE portal_drop_awards (id INTEGER PRIMARY KEY, steam_id TEXT, drop_source TEXT, loot_table_id INTEGER, loot_entry_id INTEGER, item_id TEXT, roll_value INTEGER, total_weight INTEGER, idempotency_key TEXT, metadata TEXT);
CREATE TABLE portal_economy_notifications (steam_id TEXT, notification_type TEXT, payload TEXT);
CREATE TABLE portal_economy_jobs (job_type TEXT, target_steam_id TEXT, payload TEXT, idempotency_key TEXT);
CREATE TABLE portal_token_ledger (account_steam_id TEXT, delta INTEGER, balance_after INTEGER, reason TEXT, reference_type TEXT, reference_id TEXT, idempotency_key TEXT, line_key TEXT, actor_steam_id TEXT, metadata TEXT);
ALTER TABLE portal_inventory_items ADD COLUMN sale_locked INTEGER DEFAULT 0;
ALTER TABLE portal_inventory_items ADD COLUMN acquired_at TEXT;
ALTER TABLE portal_inventory_items ADD COLUMN consumed_at TEXT;
ALTER TABLE portal_inventory_items ADD COLUMN updated_at TEXT;
CREATE TABLE portal_inventory_item_stickers (weapon_item_id TEXT, sticker_item_id TEXT);
CREATE TABLE portal_loadout_slots (owner_steam_id TEXT, item_id TEXT, updated_at TEXT);
INSERT INTO portal_economy_catalogue (id, item_type, definition_index, paintkit, display_name) VALUES (1,'skin',9,250,'AWP | Full Stop'), (2,'skin',7,44,'Stale name'), (3,'crate',null,null,'Case');
INSERT INTO portal_loot_tables (id,code,table_type,container_catalogue_id,display_name) VALUES (1,'case','container',3,'Case'), (2,'invalid-drop','drop',null,'Drop');
INSERT INTO portal_loot_entries (id,loot_table_id,catalogue_id,weight) VALUES (1,1,1,100), (2,1,2,5), (3,2,1,100);
`);

test("public pagination excludes unreleased pairs but retains real unpriced finishes", async () => {
  const page = await getEconomyCatalogue({ itemTypes: ["skin"], pageSize: 1 });
  assert.equal(page.total, 1);
  assert.deepEqual(page.items.map((item) => item.id), [2]);
  assert.equal(page.items[0].price, null);
  assert.equal(page.items[0].displayName, "AK-47 | Case Hardened");
  assert.equal(page.items[0].metadata.marketBaseName, "AK-47 | Case Hardened");
  assert.equal(await getEconomyCatalogueItem(1), null);
  assert.equal((await getEconomyCatalogue({ includeDisabled: true, itemTypes: ["skin"] })).total, 2);
});

test("invalid purchases fail before any wallet mutation", async () => {
  await assert.rejects(purchaseEconomyItem({ steamId: "76561198000000001", catalogueId: 1, floatValue: 0.1, idempotencyKey: "invalid-finish-purchase" }), { code: "catalogue_unavailable" });
  assert.equal(db.prepare("SELECT count(*) AS n FROM portal_token_accounts").get()!.n, 0);
  assert.equal(db.prepare("SELECT count(*) AS n FROM portal_economy_operations").get()!.n, 0);
});

test("crate preview removes invalid outcomes before calculating odds", async () => {
  const preview = await getEconomyCrateDropPreview(3);
  assert.equal(preview?.totalWeight, 5);
  assert.deepEqual(preview?.drops.map((drop) => drop.catalogue.id), [2]);
});

test("an invalid-only random drop fails with an empty pool and rolls back the wallet", async () => {
  await assert.rejects(awardEconomyDrop({ steamId: "76561198000000001", lootTableId: 2, source: "hourly", idempotencyKey: "invalid-finish-drop" }), { code: "loot_table_empty" });
  assert.equal(db.prepare("SELECT count(*) AS n FROM portal_token_accounts").get()!.n, 0);
});

test("drops randomize fixed legacy seeds and wear within the actual finish limits", async () => {
  db.exec(`INSERT INTO portal_economy_catalogue (id,item_type,definition_index,paintkit,display_name,metadata) VALUES (4,'skin',24,879,'UMP-45 | Fade','{"minFloat":0,"maxFloat":1,"supportsStattrak":true}');
    INSERT INTO portal_loot_tables (id,code,table_type,display_name) VALUES (3,'fade-drop','drop','Fade');
    INSERT INTO portal_loot_entries (id,loot_table_id,catalogue_id,min_float,max_float,seed_min,seed_max,stattrak_chance_bps) VALUES (4,3,4,0.9,1,17,17,10000);`);
  const seeds = new Set(), floats = new Set();
  for (let index = 0; index < 16; index++) {
    const result = await awardEconomyDrop({ steamId: "76561198000000001", lootTableId: 3, source: "hourly", idempotencyKey: `real-finish-drop-${index}` });
    const item = db.prepare("SELECT * FROM portal_inventory_items WHERE id = ?").get(result.itemId)!;
    assert.equal(item.paintkit, 879);
    assert.ok(Number(item.float_value) >= 0 && Number(item.float_value) <= 0.08);
    assert.ok(Number(item.seed) >= 0 && Number(item.seed) <= 1000);
    assert.equal(item.stattrak, 0);
    seeds.add(item.seed); floats.add(item.float_value);
  }
  assert.ok(seeds.size > 1);
  assert.ok(floats.size > 1);
});

test("a configured positive staff price makes a custom Glock finish eligible without a public quote", async () => {
  db.exec(`INSERT INTO portal_economy_catalogue (id,item_type,definition_index,paintkit,display_name) VALUES (5,'skin',4,44,'Glock-18 | Case Hardened');
    INSERT INTO portal_economy_catalogue_prices (id,catalogue_id,is_current,market_price_eur_cents,token_price,price_source,source_reference) VALUES (1,5,1,100,100,'staff-last-known','staff-panel');
    INSERT INTO portal_loot_tables (id,code,table_type,display_name) VALUES (4,'custom-glock','drop','Custom Glock');
    INSERT INTO portal_loot_entries (id,loot_table_id,catalogue_id) VALUES (5,4,5);`);
  const catalogue = await getEconomyCatalogueItem(5);
  assert.equal(catalogue?.metadata.customServerFinish, true);
  const result = await awardEconomyDrop({ steamId: "76561198000000001", lootTableId: 4, source: "hourly", idempotencyKey: "custom-priced-drop" });
  assert.equal(result.catalogueId, 5);
  db.exec("UPDATE portal_token_accounts SET balance = 1000 WHERE steam_id = '76561198000000001'");
  const purchase = await purchaseEconomyItem({ steamId: "76561198000000001", catalogueId: 5, floatValue: 0.123456, seed: 661, expectedUnitPriceTokens: 100, idempotencyKey: "custom-priced-purchase" });
  assert.equal(purchase.totalPriceTokens, 100);
  const purchased = db.prepare("SELECT id, seed, float_value FROM portal_inventory_items WHERE catalogue_id = 5 AND source LIKE '%marketplace_purchase%'").get()!;
  assert.equal(purchased.seed, 661);
  assert.equal(purchased.float_value, 0.123456);
  await sellEconomyItem({ steamId: "76561198000000001", itemId: String(purchased.id), idempotencyKey: "custom-priced-sale" });
  assert.equal(db.prepare("SELECT state FROM portal_inventory_items WHERE id = ?").get(String(purchased.id))!.state, "consumed");
  assert.ok(Number(db.prepare("SELECT balance FROM portal_token_accounts WHERE steam_id = '76561198000000001'").get()!.balance) > 900);
  db.exec("UPDATE portal_economy_catalogue_prices SET market_price_eur_cents = 0, token_price = 0 WHERE id = 1");
  assert.equal(await getEconomyCatalogueItem(5), null);
  await assert.rejects(awardEconomyDrop({ steamId: "76561198000000001", lootTableId: 4, source: "hourly", idempotencyKey: "custom-zero-price-drop" }), { code: "loot_table_empty" });
});

test("checkout rejects a changed or missing displayed price before creating items or debiting Tokens", async () => {
  db.exec("UPDATE portal_economy_catalogue_prices SET market_price_eur_cents = 100, token_price = 100 WHERE id = 1");
  const snapshot = () => ({
    wallet: db.prepare("SELECT balance FROM portal_token_accounts WHERE steam_id = '76561198000000001'").get()!.balance,
    items: db.prepare("SELECT count(*) AS n FROM portal_inventory_items").get()!.n,
    ledger: db.prepare("SELECT count(*) AS n FROM portal_token_ledger").get()!.n,
    operations: db.prepare("SELECT count(*) AS n FROM portal_economy_operations").get()!.n,
  });
  const before = snapshot();
  for (const expectedUnitPriceTokens of [undefined,80,120]) {
    await assert.rejects(purchaseEconomyItem({steamId:"76561198000000001",catalogueId:5,floatValue:.2,seed:661,expectedUnitPriceTokens,idempotencyKey:`price-change-${expectedUnitPriceTokens}`}),
      {code:expectedUnitPriceTokens === undefined ? "invalid_input" : "price_changed"});
    assert.deepEqual(snapshot(),before);
  }
});

test("checkout compares the final promotion price and idempotent retries charge it only once", async () => {
  activeDiscountRows = [{id:1,display_name:"Current promotion",target_type:"catalogue_item",catalogue_id:5,item_type:null,percentage_bps:2000,fixed_tokens:0,priority:0,enabled:1,starts_at:null,ends_at:null,created_by_steam_id:"76561198000000001",created_at:null,updated_at:null}];
  const input = {steamId:"76561198000000001",catalogueId:5,floatValue:.2,seed:661,expectedUnitPriceTokens:80,idempotencyKey:"accepted-discount-price"};
  const before = Number(db.prepare("SELECT balance FROM portal_token_accounts WHERE steam_id = '76561198000000001'").get()!.balance);
  const result = await purchaseEconomyItem(input);
  assert.equal(result.priceTokens,80);
  await purchaseEconomyItem(input);
  assert.equal(Number(db.prepare("SELECT balance FROM portal_token_accounts WHERE steam_id = '76561198000000001'").get()!.balance),before-80);
  await assert.rejects(purchaseEconomyItem({...input,expectedUnitPriceTokens:100}),{code:"idempotency_conflict"});
  activeDiscountRows=[];
  await assert.rejects(purchaseEconomyItem({...input,idempotencyKey:"promotion-ended-price"}),{code:"price_changed"});
});

test("a newly resolved public quote cannot silently replace the displayed purchase price", async () => {
  const walletBefore = db.prepare("SELECT balance FROM portal_token_accounts WHERE steam_id = '76561198000000001'").get()!.balance;
  const itemsBefore = db.prepare("SELECT count(*) AS n FROM portal_inventory_items").get()!.n;
  await assert.rejects(purchaseEconomyItem({steamId:"76561198000000001",catalogueId:2,floatValue:.2,seed:661,expectedUnitPriceTokens:100,idempotencyKey:"public-price-changed",
    resolvedMarketQuote:{baseEuroCents:150,euroCents:150,source:"csfloat-exact-listing",sourceReference:"https://csfloat.com/api/v1/listings/123",marketHashName:"AK-47 | Case Hardened (Field-Tested)",marketVersion:null,floatValue:.2,wear:"Field-Tested",stattrak:false,seed:661,seedMatched:true,floatDiscountBps:0,pricingRule:"external-exact-v2",fromFallback:false,fallbackStale:false,fallbackObservedAt:null}}),{code:"price_changed"});
  assert.equal(db.prepare("SELECT balance FROM portal_token_accounts WHERE steam_id = '76561198000000001'").get()!.balance,walletBefore);
  assert.equal(db.prepare("SELECT count(*) AS n FROM portal_inventory_items").get()!.n,itemsBefore);
});

test("a manual price cannot authorize a nonexistent weapon or paint material", async () => {
  for (const [id, definition, paint] of [[6, 99999, 44], [7, 4, 99999]]) {
    db.prepare("INSERT INTO portal_economy_catalogue (id,item_type,definition_index,paintkit,display_name) VALUES (?,'skin',?,?,'Not a CS2 identity')").run(id, definition, paint);
    db.prepare("INSERT INTO portal_economy_catalogue_prices (catalogue_id,is_current,market_price_eur_cents,token_price,price_source,source_reference) VALUES (?,1,100,100,'staff-last-known','staff-panel')").run(id);
    db.prepare("INSERT INTO portal_loot_tables (id,code,table_type,display_name) VALUES (?,?,'drop','Malformed')").run(id, `malformed-${id}`);
    db.prepare("INSERT INTO portal_loot_entries (id,loot_table_id,catalogue_id) VALUES (?,?,?)").run(id, id, id);
    assert.equal(await getEconomyCatalogueItem(id), null);
    await assert.rejects(purchaseEconomyItem({ steamId: "76561198000000001", catalogueId: id, floatValue: 0.1, seed: 1, idempotencyKey: `malformed-purchase-${id}` }), { code: "catalogue_unavailable" });
    await assert.rejects(awardEconomyDrop({ steamId: "76561198000000001", lootTableId: id, source: "hourly", idempotencyKey: `malformed-drop-${id}` }), { code: "loot_table_empty" });
  }
});
