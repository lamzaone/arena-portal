CREATE TABLE IF NOT EXISTS portal_game_panel_nonces (
 server_id VARCHAR(64) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
 request_id CHAR(32) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
 expires_at DATETIME(6) NOT NULL,
 PRIMARY KEY(server_id,request_id), KEY panel_nonce_expiry(expires_at)
) ENGINE=InnoDB;

-- Preserve immutable rewards even after a drop is sold or traded. Legacy rows
-- remain NULL; current inventory cannot faithfully reconstruct their history.
-- Use the existing portable guard rather than ADD COLUMN IF NOT EXISTS.
SET @panel_snapshot_ddl = IF(
 EXISTS (
  SELECT 1 FROM information_schema.COLUMNS
  WHERE TABLE_SCHEMA = DATABASE()
   AND TABLE_NAME = 'portal_crate_openings'
   AND COLUMN_NAME = 'reward_snapshot'
 ),
 'SELECT 1',
 'ALTER TABLE portal_crate_openings ADD COLUMN reward_snapshot JSON NULL'
);
PREPARE panel_snapshot_stmt FROM @panel_snapshot_ddl;
EXECUTE panel_snapshot_stmt;
DEALLOCATE PREPARE panel_snapshot_stmt;
CREATE TABLE IF NOT EXISTS portal_game_panel_rate_windows (
 server_id VARCHAR(64) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
 subject VARCHAR(32) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
 window_started BIGINT UNSIGNED NOT NULL,
 request_count INT UNSIGNED NOT NULL,
 PRIMARY KEY(server_id,subject,window_started), KEY panel_rate_expiry(window_started)
) ENGINE=InnoDB;
CREATE TABLE IF NOT EXISTS portal_game_panel_operations (
 server_id VARCHAR(64) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
 actor_steam_id CHAR(17) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
 operation_id VARCHAR(46) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
 operation_name VARCHAR(64) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
 body_hash CHAR(64) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
 economy_key VARCHAR(128) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
 state VARCHAR(16) NOT NULL DEFAULT 'pending',
 lease_token CHAR(32) CHARACTER SET ascii COLLATE ascii_bin NULL,
 lease_until DATETIME(6) NULL,
 result_json JSON NULL, error_json JSON NULL,
 created_at DATETIME(6) NOT NULL, expires_at DATETIME(6) NOT NULL,
 PRIMARY KEY(server_id,actor_steam_id,operation_id),
 UNIQUE KEY panel_economy_key(economy_key), KEY panel_operation_expiry(expires_at)
) ENGINE=InnoDB;
