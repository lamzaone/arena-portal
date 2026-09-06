import { createHash, randomUUID } from "node:crypto";
import { mkdir, open, readFile } from "node:fs/promises";
import { dirname, isAbsolute, relative, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import mysql from "mysql2/promise";
import { decodeObject, isUnpricedCustomWeapon, manifestRevision, removalBlockers } from "./remove-unpriced-custom-weapons-policy.mjs";

const args = new Map(process.argv.slice(2).map((arg) => { const at = arg.indexOf("="); return at < 0 ? [arg, true] : [arg.slice(0, at), arg.slice(at + 1)]; }));
for (const key of args.keys()) if (!["--apply", "--audit"].includes(key)) throw new Error(`Unknown option: ${key}`);
const apply = args.has("--apply");
if (apply !== args.has("--audit")) throw new Error("Apply requires --apply --audit=<read-only report path>; omit both to audit.");
if (!process.env.PORTAL_DATABASE_URL) throw new Error("Load the intended PORTAL_DATABASE_URL explicitly.");
const outputDirectory = resolve(dirname(fileURLToPath(import.meta.url)), "../../.tmp-weapon-customization-release");
await mkdir(outputDirectory, { recursive: true });
const runId = randomUUID();
const snapshotPath = resolve(outputDirectory, `unpriced-custom-weapons-${apply ? "before-apply" : "audit"}-${runId}.json`);
async function durableSnapshot(path, value) {
  const file = await open(path, "wx");
  try { await file.writeFile(JSON.stringify(value, null, 2) + "\n"); await file.sync(); } finally { await file.close(); }
}
let approved;
if (apply) {
  const path = resolve(String(args.get("--audit"))), inside = relative(outputDirectory, path);
  if (inside.startsWith("..") || isAbsolute(inside)) throw new Error("Audit must be inside the ignored release directory.");
  approved = JSON.parse(await readFile(path, "utf8"));
  if (approved.mode !== "audit" || approved.manifestRevision !== manifestRevision || !Array.isArray(approved.items)) throw new Error("Audit format or manifest revision changed; run a new audit.");
}
let connection;
try {
  connection = await mysql.createConnection({ uri: process.env.PORTAL_DATABASE_URL, supportBigNumbers: true, bigNumberStrings: true, dateStrings: true, multipleStatements: false });
  await connection.query(apply ? "START TRANSACTION" : "START TRANSACTION READ ONLY");
  const [[database]] = await connection.query("SELECT DATABASE() AS database_name, @@hostname AS server_host");
  const databaseFingerprint = createHash("sha256").update(JSON.stringify(database)).digest("hex");
  if (approved && approved.databaseFingerprint !== databaseFingerprint) throw new Error("Audit belongs to a different database.");
  const lock = apply ? " FOR UPDATE" : "";
  const auditedIds = approved?.items.map((row) => row.id).sort();
  if (auditedIds && (!auditedIds.length || auditedIds.length > 10000 || auditedIds.some((id) => !/^[0-9a-f-]{36}$/i.test(id)))) throw new Error("Audit has an empty or invalid bounded item list.");
  const marks = (ids) => ids.map(() => "?").join(",");
  const [inventory] = await connection.query("SELECT * FROM portal_inventory_items WHERE " + (auditedIds ? `id IN (${marks(auditedIds)})` : "item_type IN ('skin','knife') AND state NOT IN ('consumed','revoked')") + " ORDER BY id" + lock, auditedIds ?? []);
  const catalogueIds = [...new Set(inventory.map((row) => row.catalogue_id).filter((id) => id !== null))].sort((a, b) => Number(a) - Number(b));
  let catalogue = [], prices = [], variants = [];
  if (catalogueIds.length) {
    [catalogue] = await connection.query(`SELECT id, item_type, definition_index, paintkit, display_name FROM portal_economy_catalogue WHERE id IN (${marks(catalogueIds)}) ORDER BY id` + lock, catalogueIds);
    [prices] = await connection.query(`SELECT * FROM portal_economy_catalogue_prices WHERE catalogue_id IN (${marks(catalogueIds)}) AND is_current = 1 ORDER BY catalogue_id, id` + lock, catalogueIds);
    // Protect even expired positive variant evidence; ambiguity never removes an item.
    [variants] = await connection.query(`SELECT * FROM portal_economy_market_variant_prices WHERE catalogue_id IN (${marks(catalogueIds)}) ORDER BY catalogue_id, stattrak, wear` + lock, catalogueIds);
  }
  const catalogueById = new Map(catalogue.map((row) => [String(row.id), row]));
  const positiveVariants = new Set(variants.filter((row) => Number(row.market_price_eur_cents) > 0).map((row) => String(row.catalogue_id)));
  const priceById = new Map();
  for (const row of prices) {
    if (priceById.has(String(row.catalogue_id))) throw new Error("Multiple current catalogue prices require review.");
    priceById.set(String(row.catalogue_id), row);
  }
  const enriched = inventory.map((row) => {
    const key = String(row.catalogue_id), price = priceById.get(key);
    return { ...row, display_name: catalogueById.get(key)?.display_name ?? null, market_price_eur_cents: price?.market_price_eur_cents ?? null, token_price: price?.token_price ?? null, price_source: price?.price_source ?? null, has_positive_variant_price: positiveVariants.has(key) ? 1 : 0 };
  });
  const beforeById = new Map((approved?.items ?? []).map((row) => [row.id, row]));
  const sameAuditedIdentity = (row) => {
    const before = beforeById.get(row.id);
    return !approved || before && ["owner_steam_id", "catalogue_id", "item_type", "definition_index", "paintkit"].every((key) => String(row[key]) === String(before[key]));
  };
  const items = enriched.filter((row) => isUnpricedCustomWeapon(row) && sameAuditedIdentity(row));
  const ids = items.map((row) => row.id);
  let stickers = [], loadouts = [], trades = [];
  if (ids.length) {
    [stickers] = await connection.query(`SELECT * FROM portal_inventory_item_stickers WHERE weapon_item_id IN (${marks(ids)})` + lock, ids);
    [loadouts] = await connection.query(`SELECT * FROM portal_loadout_slots WHERE item_id IN (${marks(ids)})` + lock, ids);
    [trades] = await connection.query(`SELECT ti.*, t.status FROM portal_trade_items ti INNER JOIN portal_economy_trades t ON t.id = ti.trade_id WHERE ti.item_id IN (${marks(ids)}) AND t.status = 'pending'` + lock, ids);
  }
  const blockers = removalBlockers(items, stickers, trades);
  const summary = {
    weapons: items.length, owners: new Set(items.map((row) => row.owner_steam_id)).size,
    states: items.reduce((counts, row) => ({ ...counts, [row.state]: (counts[row.state] ?? 0) + 1 }), {}),
    stickers: stickers.length, charms: items.filter((row) => decodeObject(row.attributes).keychain || decodeObject(row.attributes).charm).length,
    loadoutSlots: loadouts.length, pendingTradeReferences: trades.length, saleLocked: items.filter((row) => Number(row.sale_locked)).length,
    blockers: blockers.length, skippedSinceAudit: approved ? approved.items.length - items.length : 0,
    sourceTypes: items.reduce((counts, row) => { const source = decodeObject(row.source); const key = source.type ?? source.source ?? "unspecified"; counts[key] = (counts[key] ?? 0) + 1; return counts; }, {}),
  };
  const report = { mode: apply ? "before-apply" : "audit", runId, auditedRunId: approved?.runId ?? null, createdAt: new Date().toISOString(), manifestRevision, databaseFingerprint, summary, items, prices, variants, loadouts, stickers, trades, blockers };
  await durableSnapshot(snapshotPath, report);
  if (apply) {
    if (blockers.length) throw new Error(`Apply aborted: ${blockers.length} new attachment/trade/state blockers; snapshot: ${snapshotPath}`);
    const reason = "operator_authorized_removal_of_unpriced_custom_weapons";
    const beforeInventory = new Map(inventory.map((row) => [row.id, row]));
    for (const row of items) {
      const attributes = { ...decodeObject(row.attributes), customWeaponRemoval: { runId, auditedRunId: approved.runId, manifestRevision, reason } };
      const [result] = await connection.execute("UPDATE portal_inventory_items SET state = 'revoked', attributes = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ? AND state = 'available'", [JSON.stringify(attributes), row.id]);
      if (result.affectedRows !== 1) throw new Error("Inventory changed while locked; aborting the batch.");
      await connection.execute("UPDATE portal_loadout_slots SET item_id = NULL WHERE item_id = ?", [row.id]);
      const [[after]] = await connection.query("SELECT * FROM portal_inventory_items WHERE id = ?", [row.id]);
      await connection.execute("INSERT INTO portal_inventory_item_events (item_id, actor_steam_id, event_type, idempotency_key, line_key, before_state, after_state, metadata) VALUES (?, NULL, 'system.unpriced_custom_weapon.revoked', ?, ?, ?, ?, ?)", [row.id, `custom-weapon-removal:${runId}`, row.id, JSON.stringify(beforeInventory.get(row.id)), JSON.stringify(after), JSON.stringify({ runId, auditedRunId: approved.runId, manifestRevision, reason, systemActor: "catalogue-maintenance", price: priceById.get(String(row.catalogue_id)) ?? null, clearedLoadoutSlots: loadouts.filter((slot) => slot.item_id === row.id) })]);
    }
    for (const owner of new Set(items.map((row) => row.owner_steam_id))) {
      const itemIds = items.filter((row) => row.owner_steam_id === owner).map((row) => row.id);
      await connection.execute("INSERT INTO portal_economy_jobs (job_type, target_steam_id, payload, idempotency_key) VALUES ('economy.loadout.refresh', ?, ?, ?)", [owner, JSON.stringify({ steamId: owner, reason, itemIds }), `custom-removal:${runId}:${owner}`]);
      await connection.execute("INSERT INTO portal_economy_notifications (steam_id, notification_type, payload) VALUES (?, 'inventory.updated', ?)", [owner, JSON.stringify({ reason, runId, itemIds, removedCount: itemIds.length, message: `${itemIds.length} unpriced custom weapons were removed from your inventory.` })]);
    }
    await connection.commit();
  } else await connection.rollback();
  console.log(JSON.stringify({ mode: apply ? "applied" : "audit", runId, snapshotPath, ...summary }, null, 2));
} catch (error) {
  await connection?.rollback().catch(() => {});
  console.error(error?.sql || error?.code ? `Weapon removal failed (${error.code ?? "database_error"}); transaction rolled back.` : error.message);
  process.exitCode = 1;
} finally { await connection?.end(); }
