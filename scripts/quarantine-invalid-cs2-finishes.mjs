import { randomUUID } from "node:crypto";
import { writeFile } from "node:fs/promises";
import mysql from "mysql2/promise";
import { manifestRevision, planCatalogueQuarantine } from "./cs2-catalogue-quarantine-policy.mjs";

// Default is a read-only transaction. Apply/restore must be explicitly selected.
const args = new Map(process.argv.slice(2).map((argument) => {
  const separator = argument.indexOf("=");
  return separator < 0 ? [argument, true] : [argument.slice(0, separator), argument.slice(separator + 1)];
}));
for (const key of args.keys()) if (!["--apply", "--actor", "--restore", "--report"].includes(key)) throw new Error(`Unknown option: ${key}`);
const apply = args.has("--apply");
const restore = args.get("--restore");
const actor = args.get("--actor");
if (apply && restore) throw new Error("Choose apply or restore, not both.");
if ((apply || restore) && !/^\d{17}$/.test(String(actor))) throw new Error("--actor must be the responsible staff Steam ID.");
if (restore && !/^[0-9a-f-]{36}$/i.test(String(restore))) throw new Error("--restore must be a quarantine run ID.");
if (!process.env.PORTAL_DATABASE_URL) throw new Error("PORTAL_DATABASE_URL is required; load the intended environment explicitly.");

let connection;
try {
  connection = await mysql.createConnection({ uri: process.env.PORTAL_DATABASE_URL, supportBigNumbers: true, bigNumberStrings: true, dateStrings: true, multipleStatements: false });
  await connection.query(apply || restore ? "START TRANSACTION" : "START TRANSACTION READ ONLY");
  const runId = randomUUID();
  const decode = (value) => typeof value === "string" ? JSON.parse(value) : value;
  const writeAudit = (action, metadata) => connection.execute(
    "INSERT INTO portal_economy_admin_audit (actor_steam_id, action, target_type, target_id, idempotency_key, metadata) VALUES (?, ?, 'catalogue_quarantine', ?, ?, ?)",
    [actor, action, runId, `cs2-finish-quarantine:${runId}`, JSON.stringify(metadata)],
  );
  if (restore) {
    const [audits] = await connection.query("SELECT metadata FROM portal_economy_admin_audit WHERE target_id = ? AND action = 'catalogue.finish_quarantine' FOR UPDATE", [restore]);
    if (audits.length !== 1) throw new Error("Quarantine audit was not found or was ambiguous.");
    const original = decode(audits[0].metadata);
    const restoredCatalogue = [], restoredEntries = [];
    for (const before of original.catalogue) {
      const [rows] = await connection.query("SELECT id, item_type, definition_index, paintkit, enabled, metadata FROM portal_economy_catalogue WHERE id = ? FOR UPDATE", [before.id]);
      const current = rows[0], metadata = current && decode(current.metadata);
      if (!current || Number(current.enabled) !== 0 || metadata?.finishQuarantine?.runId !== restore || current.item_type !== before.item_type || String(current.definition_index) !== String(before.definition_index) || String(current.paintkit) !== String(before.paintkit))
        throw new Error("A quarantined catalogue row changed; review it before restoring.");
      delete metadata.finishQuarantine;
      await connection.execute("UPDATE portal_economy_catalogue SET enabled = ?, metadata = ? WHERE id = ?", [before.enabled, JSON.stringify(metadata), before.id]);
      restoredCatalogue.push(before.id);
    }
    for (const before of original.entries) {
      const [rows] = await connection.query("SELECT id, catalogue_id, enabled, attributes FROM portal_loot_entries WHERE id = ? FOR UPDATE", [before.id]);
      const current = rows[0], attributes = current && decode(current.attributes);
      if (!current || Number(current.enabled) !== 0 || attributes?.finishQuarantine?.runId !== restore || String(current.catalogue_id) !== String(before.catalogue_id))
        throw new Error("A quarantined loot row changed; review it before restoring.");
      delete attributes.finishQuarantine;
      await connection.execute("UPDATE portal_loot_entries SET enabled = ?, attributes = ? WHERE id = ?", [before.enabled, JSON.stringify(attributes), before.id]);
      restoredEntries.push(before.id);
    }
    for (const before of original.typeCorrections ?? []) {
      const [rows] = await connection.query("SELECT item_type, metadata FROM portal_economy_catalogue WHERE id = ? FOR UPDATE", [before.id]);
      const current = rows[0], metadata = current && decode(current.metadata);
      if (current?.item_type !== "glove" || metadata?.finishTypeCorrection !== restore) throw new Error("Corrected glove row changed; review before restore.");
      delete metadata.finishTypeCorrection;
      await connection.execute("UPDATE portal_economy_catalogue SET item_type = ?, metadata = ? WHERE id = ?", [before.item_type, JSON.stringify(metadata), before.id]);
    }
    for (const before of original.inventoryTypeCorrections ?? []) {
      const [result] = await connection.execute("UPDATE portal_inventory_items SET item_type = ? WHERE id = ? AND catalogue_id = ? AND definition_index = 4725 AND paintkit = ? AND item_type = 'glove'", [before.item_type, before.id, before.catalogue_id, before.paintkit]);
      if (result.affectedRows !== 1) throw new Error("Corrected inventory glove changed; review before restore.");
    }
    await writeAudit("catalogue.finish_quarantine_restored", { restoredRunId: restore, restoredCatalogue, restoredEntries });
    await connection.commit();
    console.log(JSON.stringify({ runId, restoredCatalogue: restoredCatalogue.length, restoredEntries: restoredEntries.length }));
  } else {
    const lock = apply ? " FOR UPDATE" : "";
    const [catalogue] = await connection.query("SELECT c.id, c.item_type, c.definition_index, c.paintkit, c.display_name, c.enabled, c.metadata, p.price_source, p.source_reference, p.market_price_eur_cents, EXISTS(SELECT 1 FROM portal_economy_catalogue_prices p WHERE p.catalogue_id = c.id AND p.is_current = 1) AS has_price FROM portal_economy_catalogue c LEFT JOIN portal_economy_catalogue_prices p ON p.catalogue_id = c.id AND p.is_current = 1 WHERE c.item_type IN ('skin','knife','glove')" + lock);
    const [entries] = await connection.query("SELECT id, catalogue_id, enabled, attributes FROM portal_loot_entries WHERE enabled = 1" + lock);
    const [inventory] = await connection.query("SELECT catalogue_id, state, COUNT(*) AS item_count FROM portal_inventory_items WHERE state IN ('available','equipped','attached','escrowed') GROUP BY catalogue_id, state");
    const plan = planCatalogueQuarantine(catalogue, entries, inventory);
    const report = { catalogueTypeCorrections: plan.typeCorrections.map(({id, display_name}) => ({id, displayName: display_name, itemType: "glove"})), mode: apply ? "apply" : "audit", runId, manifestRevision, unpricedCustomCatalogueRows: plan.invalidCatalogue.length, catalogueRowsToDisable: plan.catalogue.length, lootRowsToDisable: plan.entries.length, ownedUnpricedCustomItems: plan.ownedInventory.reduce((sum, row) => sum + Number(row.item_count), 0), validFinishesWithoutCataloguePrice: plan.validWithoutCataloguePrice, examples: plan.invalidCatalogue.map(({ id, display_name, definition_index, paintkit }) => ({ id, name: display_name, definitionIndex: definition_index, paintkit })), ownedInventory: plan.ownedInventory };
    if (args.has("--report")) await writeFile(String(args.get("--report")), JSON.stringify(report, null, 2) + "\n", { flag: "wx" });
    if (apply) {
      const inventoryTypeCorrections = [];
      for (const before of plan.typeCorrections) {
        const metadata = decode(before.metadata);
        if (metadata.finishTypeCorrection) throw new Error("Existing glove correction requires staff review.");
        await connection.execute("UPDATE portal_economy_catalogue SET item_type = 'glove', metadata = ? WHERE id = ?", [JSON.stringify({ ...metadata, finishTypeCorrection: runId }), before.id]);
        const [owned] = await connection.query("SELECT id, catalogue_id, item_type, paintkit FROM portal_inventory_items WHERE catalogue_id = ? AND definition_index = 4725 AND paintkit = ? AND item_type = 'skin' FOR UPDATE", [before.id, before.paintkit]);
        inventoryTypeCorrections.push(...owned);
        for (const item of owned) await connection.execute("UPDATE portal_inventory_items SET item_type = 'glove' WHERE id = ?", [item.id]);
      }
      const marker = { runId, manifestRevision, reason: "custom_server_finish_without_staff_price" };
      for (const row of plan.catalogue) {
        const metadata = decode(row.metadata);
        if (metadata.finishQuarantine) throw new Error("Existing quarantine marker requires staff review.");
        await connection.execute("UPDATE portal_economy_catalogue SET enabled = 0, metadata = ? WHERE id = ?", [JSON.stringify({ ...metadata, finishQuarantine: marker }), row.id]);
      }
      for (const row of plan.entries) {
        const attributes = decode(row.attributes);
        if (attributes.finishQuarantine) throw new Error("Existing loot quarantine marker requires staff review.");
        await connection.execute("UPDATE portal_loot_entries SET enabled = 0, attributes = ? WHERE id = ?", [JSON.stringify({ ...attributes, finishQuarantine: marker }), row.id]);
      }
      await writeAudit("catalogue.finish_quarantine", { manifestRevision, catalogue: plan.catalogue, entries: plan.entries, typeCorrections: plan.typeCorrections, inventoryTypeCorrections });
      await connection.commit();
    } else await connection.rollback();
    console.log(JSON.stringify(report, null, 2));
  }
} catch (error) {
  if (connection) await connection.rollback().catch(() => {});
  // Connector messages can contain connection details; do not echo credentials.
  console.error(error?.sql || error?.code ? `Catalogue audit failed (${error.code ?? "database_error"}).` : error.message);
  process.exitCode = 1;
} finally {
  await connection?.end();
}
