-- PORTAL database, after 028_discord_bridge.sql. No external connections are made by this migration file.
CREATE TABLE IF NOT EXISTS arena_player_reports (
  id CHAR(32) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
  server_scope VARCHAR(128) NOT NULL,
  version INT UNSIGNED NOT NULL DEFAULT 1,
  report_type VARCHAR(16) NOT NULL,
  reporter_steam_id VARCHAR(17) NOT NULL,
  reporter_name VARCHAR(128) NOT NULL,
  target_steam_id VARCHAR(17) NULL,
  target_name VARCHAR(128) NULL,
  reason VARCHAR(2000) NOT NULL,
  status VARCHAR(16) NOT NULL DEFAULT 'active',
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  resolution_actor_steam_id VARCHAR(17) NULL,
  resolution_actor_name VARCHAR(128) NULL,
  resolution_note VARCHAR(2000) NULL,
  resolved_at DATETIME NULL,
  PRIMARY KEY (id),
  KEY arena_report_active (server_scope, status, target_steam_id, created_at),
  KEY arena_report_reporter (reporter_steam_id, created_at)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
