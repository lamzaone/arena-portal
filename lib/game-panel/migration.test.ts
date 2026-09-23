import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { DatabaseSync } from "node:sqlite";
import test from "node:test";

const migration = readFileSync(new URL("../../db/035_game_panel_adapter.sql", import.meta.url), "utf8");

test("crate reward snapshot migration uses a repeatable MySQL column guard", () => {
  assert.match(migration, /information_schema\.COLUMNS/i);
  assert.match(migration, /TABLE_SCHEMA\s*=\s*DATABASE\(\)/i);
  assert.match(migration, /TABLE_NAME\s*=\s*'portal_crate_openings'/i);
  assert.match(migration, /COLUMN_NAME\s*=\s*'reward_snapshot'/i);
  assert.match(migration, /'SELECT 1'/i);
  assert.match(migration, /PREPARE panel_snapshot_stmt FROM @panel_snapshot_ddl/i);
  assert.match(migration, /EXECUTE panel_snapshot_stmt/i);
  assert.match(migration, /DEALLOCATE PREPARE panel_snapshot_stmt/i);
});

test("snapshot ALTER preserves legacy rows and stores new JSON in an isolated SQL fixture", () => {
  const ddl = migration.match(/'(ALTER TABLE portal_crate_openings ADD COLUMN reward_snapshot JSON NULL)'/i)?.[1];
  assert.ok(ddl, "nullable snapshot column must be added before repository reads use it");
  const db = new DatabaseSync(":memory:");
  try {
    db.exec("CREATE TABLE portal_crate_openings (id INTEGER PRIMARY KEY); INSERT INTO portal_crate_openings(id) VALUES (1)");
    db.exec(ddl);
    assert.equal(db.prepare("SELECT reward_snapshot FROM portal_crate_openings WHERE id = 1").get()?.reward_snapshot, null);
    const snapshot = JSON.stringify({ schemaVersion: 1, reward: { id: "reward-1" } });
    db.prepare("UPDATE portal_crate_openings SET reward_snapshot = ? WHERE id = 1").run(snapshot);
    assert.equal(db.prepare("SELECT reward_snapshot FROM portal_crate_openings WHERE id = 1").get()?.reward_snapshot, snapshot);
  } finally {
    db.close();
  }
});
