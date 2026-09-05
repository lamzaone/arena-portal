-- Run this additive migration against PORTAL_DATABASE_URL after
-- 026_inventory_sale_locks.sql. The table retains one current public snapshot
-- per configured server; it deliberately stores no authentication material or
-- roster history.

CREATE TABLE IF NOT EXISTS portal_server_link_snapshots (
  server_id CHAR(36) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
  session_id CHAR(36) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
  session_started_at DATETIME(3) NOT NULL,
  sequence BIGINT UNSIGNED NOT NULL,
  captured_at DATETIME(3) NOT NULL,
  map VARCHAR(128) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci NULL,
  max_players TINYINT UNSIGNED NOT NULL,
  players TINYINT UNSIGNED NOT NULL,
  bots TINYINT UNSIGNED NOT NULL,
  roster JSON NOT NULL,
  received_at DATETIME(3) NOT NULL,
  PRIMARY KEY (server_id)
) ENGINE = InnoDB;

-- Rollback (removes the current snapshots, which cannot be recovered):
-- DROP TABLE portal_server_link_snapshots;
