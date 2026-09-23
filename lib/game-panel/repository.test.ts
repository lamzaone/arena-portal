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
const sql = (value: string) =>
  value
    .replaceAll(" FOR UPDATE", "")
    .replaceAll("INSERT IGNORE INTO", "INSERT OR IGNORE INTO")
    .replaceAll("ON DUPLICATE KEY UPDATE", "ON CONFLICT DO UPDATE SET");
const values = (input: unknown[]) =>
  input.map((v) => (typeof v === "boolean" ? Number(v) : v)) as Array<
    string | number | null
  >;
const executor = {
  async query(query: string, args: unknown[] = []) {
    return [db.prepare(sql(query)).all(...values(args)), []];
  },
  async execute(query: string, args: unknown[] = []) {
    if (failRefresh && query.includes("INSERT INTO portal_economy_jobs"))
      throw new Error("refresh unavailable");
    const result = db.prepare(sql(query)).run(...values(args));
    return [
      {
        affectedRows: Number(result.changes),
        insertId: Number(result.lastInsertRowid),
      },
      [],
    ];
  },
  async getConnection() {
    return this;
  },
  async beginTransaction() {
    db.exec("BEGIN");
  },
  async commit() {
    db.exec("COMMIT");
  },
  async rollback() {
    db.exec("ROLLBACK");
  },
  release() {},
};
Object.assign(globalThis, { __panelCommercePool: executor });
function moduleUrl(path: string) {
  const file = (
    extname(path)
      ? [path]
      : [`${path}.ts`, `${path}.tsx`, resolve(path, "index.ts")]
  ).find(existsSync);
  return file ? pathToFileURL(file).href : null;
}
registerHooks({
  resolve(specifier, context, next) {
    const stubs: Record<string, string> = {
      "server-only": "export {};",
      "@/lib/data/database-pools":
        "export function getGameDatabasePool(){return globalThis.__panelCommercePool} export function getPortalDatabasePool(){return globalThis.__panelCommercePool}",
      "@/lib/data/identity-catalogue":
        "export async function ensureIdentityCatalogue(){} export async function getIdentityCatalogueStatus(){} export async function syncIdentityCatalogue(){}",
      "@/lib/data/staff-vip-memberships":
        "export class StaffVipMembershipError extends Error {}",
      "@/lib/data/vip-membership-activation-saga":
        "export async function activateVipMembershipItemWithSaga(){}",
    };
    if (stubs[specifier])
      return {
        url: `data:text/javascript,${stubs[specifier]}`,
        shortCircuit: true,
      };
    if (specifier === "next/server")
      return {
        url: pathToFileURL(resolve("node_modules/next/server.js")).href,
        shortCircuit: true,
      };
    const url = specifier.startsWith("@/")
      ? moduleUrl(resolve(specifier.slice(2)))
      : specifier.startsWith(".") && context.parentURL?.startsWith("file:")
        ? moduleUrl(fileURLToPath(new URL(specifier, context.parentURL)))
        : null;
    return url ? { url, shortCircuit: true } : next(specifier, context);
  },
});

const {
  getPlayerCrateOpeningSnapshots,
  getEconomyOperationReceipt,
  getPlayerEconomyInventory,
  purchaseEconomyItem,
} = await import("../data/portal-repository.ts");
db.function("JSON_UNQUOTE", (value) => value);
db.exec(`
CREATE TABLE portal_crate_openings (id INTEGER PRIMARY KEY,steam_id TEXT,crate_item_id TEXT,loot_table_id INTEGER,loot_entry_id INTEGER,reward_item_id TEXT,reward_snapshot TEXT);
CREATE TABLE portal_economy_operations (id INTEGER PRIMARY KEY,operation_name TEXT,idempotency_key TEXT UNIQUE,actor_steam_id TEXT,request_hash TEXT,status TEXT DEFAULT 'pending',result_json TEXT,completed_at TEXT);
CREATE TABLE portal_inventory_items (id TEXT PRIMARY KEY, owner_steam_id TEXT, catalogue_id INTEGER, item_type TEXT, state TEXT DEFAULT 'available', definition_index INTEGER, paintkit INTEGER, seed INTEGER, float_value REAL, stattrak INTEGER DEFAULT 0, stattrak_count INTEGER DEFAULT 0, nametag TEXT, rarity_rank INTEGER DEFAULT 4, tradable INTEGER DEFAULT 1, sale_locked INTEGER DEFAULT 0, attributes TEXT DEFAULT '{}', source TEXT DEFAULT '{}', acquired_at TEXT DEFAULT '2026-01-01', consumed_at TEXT, updated_at TEXT DEFAULT '2026-01-01');
CREATE TABLE portal_economy_catalogue (id INTEGER PRIMARY KEY,catalogue_key TEXT,market_hash_name TEXT,display_name TEXT,item_type TEXT,definition_index INTEGER,paintkit INTEGER,rarity_rank INTEGER,metadata TEXT,enabled INTEGER,created_at TEXT,updated_at TEXT);
CREATE TABLE portal_economy_catalogue_prices (id INTEGER PRIMARY KEY,catalogue_id INTEGER,is_current INTEGER,market_price_eur_cents INTEGER,token_price INTEGER,price_source TEXT,source_reference TEXT,observed_at TEXT);
CREATE TABLE portal_inventory_item_stickers (weapon_item_id TEXT,sticker_slot INTEGER,sticker_item_id TEXT,sticker_catalogue_id INTEGER,sticker_definition_index INTEGER,sticker_paintkit INTEGER,sticker_rarity_rank INTEGER,attributes TEXT,applied_at TEXT);
CREATE TABLE portal_loadout_slots (owner_steam_id TEXT,item_id TEXT,slot_key TEXT);
CREATE TABLE portal_player_settings (steam_id TEXT,active_theme_item_id TEXT);
CREATE TABLE portal_economy_discount_rules (id INTEGER,display_name TEXT,target_type TEXT,catalogue_id INTEGER,item_type TEXT,percentage_bps INTEGER,fixed_tokens INTEGER,priority INTEGER,enabled INTEGER,starts_at TEXT,ends_at TEXT,created_by_steam_id TEXT,created_at TEXT,updated_at TEXT);
CREATE TABLE portal_economy_discount_exclusions (rule_id INTEGER,catalogue_id INTEGER);
CREATE TABLE portal_game_panel_operations (economy_key TEXT,actor_steam_id TEXT,operation_id TEXT,operation_name TEXT,state TEXT);
`);
const actor = "76561198000000001",
  other = "76561198000000002";
const crate = "10000000-0000-4000-8000-000000000001",
  reward = "10000000-0000-4000-8000-000000000002";
const snapshot = {
  openingId: 1,
  crateItemId: crate,
  rewardItemId: reward,
  rewardCatalogueId: 7,
  rewardLootEntryId: 8,
  rewardRarityRank: 4,
  globalAnnouncementQueued: false,
  reward: {
    id: reward,
    catalogueId: 7,
    itemType: "skin",
    displayName: "Original finish",
    imageUrl: null,
    rarityRank: 4,
    definitionIndex: 7,
    paintkit: 44,
    floatValue: 0.123456,
    seed: 661,
    stattrak: false,
    stattrakCount: 0,
    nametag: null,
  },
};

test("reconciliation reads immutable opening data without current reward or loot tables", async () => {
  db.prepare(
    "INSERT OR REPLACE INTO portal_crate_openings VALUES (1,?,?,4,8,?,?)",
  ).run(actor, crate, reward, JSON.stringify({ schema: 1, opening: snapshot }));
  assert.deepEqual(await getPlayerCrateOpeningSnapshots(actor, [crate]), {
    openings: [snapshot],
    crateItemIds: [crate],
    missingCrateItemIds: [],
  });
  assert.deepEqual(await getPlayerCrateOpeningSnapshots(other, [crate]), {
    openings: [],
    crateItemIds: [],
    missingCrateItemIds: [crate],
  });
  db.prepare(
    "UPDATE portal_crate_openings SET reward_snapshot=NULL WHERE id=1",
  ).run();
  await assert.rejects(getPlayerCrateOpeningSnapshots(actor, [crate]), {
    code: "opening_snapshot_unavailable",
  });
});
test("canonical receipts enforce actor and repository operation identity", async () => {
  db.prepare(
    "INSERT INTO portal_economy_operations (id,operation_name,idempotency_key,actor_steam_id,status,result_json) VALUES (1,'marketplace.purchase','receipt-key',?,'completed',?)",
  ).run(actor, JSON.stringify({ itemIds: [reward] }));
  assert.deepEqual(
    await getEconomyOperationReceipt({
      actorSteamId: actor,
      idempotencyKey: "receipt-key",
      operationName: "marketplace.purchase",
    }),
    { status: "completed", result: { itemIds: [reward] } },
  );
  await assert.rejects(
    getEconomyOperationReceipt({
      actorSteamId: other,
      idempotencyKey: "receipt-key",
      operationName: "marketplace.purchase",
    }),
    { code: "idempotency_conflict" },
  );
  await assert.rejects(
    getEconomyOperationReceipt({
      actorSteamId: actor,
      idempotencyKey: "receipt-key",
      operationName: "crate.open",
    }),
    { code: "idempotency_conflict" },
  );
});

test("stored opening snapshots reject unsafe cosmetics and omit arbitrary metadata", async () => {
  const save = (opening: unknown) =>
    db
      .prepare(
        "UPDATE portal_crate_openings SET reward_snapshot = ? WHERE id=1",
      )
      .run(JSON.stringify({ schema: 1, opening }));
  save({
    ...snapshot,
    reward: { ...snapshot.reward, seed: Number.MAX_SAFE_INTEGER + 1 },
  });
  await assert.rejects(getPlayerCrateOpeningSnapshots(actor, [crate]), {
    code: "invalid_database_value",
  });
  save({
    ...snapshot,
    privateSecret: "hidden",
    reward: { ...snapshot.reward, attributes: { private: "hidden" } },
  });
  assert.deepEqual(
    (await getPlayerCrateOpeningSnapshots(actor, [crate])).openings,
    [snapshot],
  );
});
test("locked checkout rejects changed prices for memberships, themes and containers before wallet access", async () => {
  let id = 100;
  for (const itemType of [
    "vip_membership",
    "profile_theme",
    "crate",
    "capsule",
  ]) {
    id++;
    db.prepare(
      "INSERT INTO portal_economy_catalogue (id,display_name,item_type,rarity_rank,metadata,enabled) VALUES (?,?,?,4,'{}',1)",
    ).run(id, "Product " + itemType, itemType);
    db.prepare(
      "INSERT INTO portal_economy_catalogue_prices (id,catalogue_id,is_current,market_price_eur_cents,token_price,price_source,source_reference) VALUES (?,?,1,1200,1200,'staff-last-known','staff-panel')",
    ).run(id, id);
    const before = db
      .prepare("SELECT count(*) AS n FROM portal_economy_operations")
      .get()!.n;
    await assert.rejects(
      purchaseEconomyItem({
        steamId: actor,
        catalogueId: id,
        expectedUnitPriceTokens: 1000,
        idempotencyKey: "stale-" + itemType,
      }),
      { code: "price_changed" },
    );
    assert.equal(
      db.prepare("SELECT count(*) AS n FROM portal_economy_operations").get()!
        .n,
      before,
    );
  }
});
test("repository rejects unadmitted native commands before economic work", async () => {
  await assert.rejects(
    purchaseEconomyItem({
      steamId: actor,
      catalogueId: 101,
      expectedUnitPriceTokens: 1200,
      idempotencyKey: "gp1_" + "a".repeat(64),
    }),
    { code: "operation_expired" },
  );
});
test("inventory sorts the full owned collection before pagination and hides equipped before count", async () => {
  const insert = db.prepare(
    "INSERT INTO portal_inventory_items (id,owner_steam_id,item_type,definition_index,attributes,float_value,paintkit) VALUES (?,?,?,?,?,?,999999)",
  );
  for (let n = 1; n <= 30; n++)
    insert.run(
      "20000000-0000-4000-8000-" + String(n).padStart(12, "0"),
      actor,
      "skin",
      n === 30 ? 9 : 7,
      JSON.stringify({
        displayName: "Finish " + String(31 - n).padStart(2, "0"),
      }),
      n / 100,
    );
  insert.run(
    "30000000-0000-4000-8000-000000000001",
    other,
    "skin",
    7,
    JSON.stringify({ displayName: "A foreign finish" }),
    0.01,
  );
  const page = await getPlayerEconomyInventory(actor, {
    sort: "name",
    page: 2,
    pageSize: 12,
    category: "rifles",
    definitionIndex: 7,
  });
  assert.equal(page.total, 29);
  assert.equal(page.items.length, 12);
  assert.equal(page.items[0].displayName, "Finish 14");
  db.prepare("INSERT INTO portal_loadout_slots VALUES (?,?,'weapon:T:7')").run(
    actor,
    page.items[0].id,
  );
  const hidden = await getPlayerEconomyInventory(actor, {
    sort: "name",
    page: 2,
    pageSize: 12,
    hideEquipped: true,
    category: "rifles",
  });
  assert.equal(hidden.total, 28);
  assert.equal(hidden.items[0].displayName, "Finish 15");
});

test("name sorting includes legacy custom display names and StatTrak prefixes", async () => {
  const insert = db.prepare(
    "INSERT INTO portal_inventory_items (id,owner_steam_id,item_type,definition_index,paintkit,attributes,stattrak) VALUES (?,?, 'skin',7,999998,?,?)",
  );
  insert.run(
    "40000000-0000-4000-8000-000000000001",
    other,
    JSON.stringify({ customDisplayName: "Alpha" }),
    1,
  );
  insert.run(
    "40000000-0000-4000-8000-000000000002",
    other,
    JSON.stringify({ customDisplayName: "Bravo" }),
    0,
  );
  const result = await getPlayerEconomyInventory(other, {
    sort: "name",
    query: "40000000",
  });
  assert.deepEqual(
    result.items.map((i) => i.displayName),
    ["Bravo", "StatTrak\u2122 Alpha"],
  );
});
