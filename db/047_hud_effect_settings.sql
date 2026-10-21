-- After 046_mission_definitions.sql. No changes to player mission snapshots.
CREATE TABLE IF NOT EXISTS portal_hud_effect_settings (
  id TINYINT UNSIGNED NOT NULL PRIMARY KEY,
  version BIGINT UNSIGNED NOT NULL DEFAULT 0,
  config_json LONGTEXT NOT NULL,
  updated_by VARCHAR(20) NULL,
  updated_at DATETIME(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
  CONSTRAINT portal_hud_effect_json CHECK (JSON_VALID(config_json))
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
INSERT IGNORE INTO portal_hud_effect_settings (id,version,config_json) VALUES
  (1,0,'{"styleId":"none","palette":"original","speed":1,"intensity":0.5,"reducedMotion":"respect"}');

-- Staff configuration retries share their committed response and cannot create
-- additional mission versions/audit events after a lost HTTP response.
CREATE TABLE IF NOT EXISTS portal_staff_config_operations (
  actor_steam_id VARCHAR(20) NOT NULL,
  idempotency_key VARCHAR(128) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
  request_hash CHAR(64) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
  result_json LONGTEXT NULL,
  created_at DATETIME(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
  PRIMARY KEY(actor_steam_id,idempotency_key),
  CONSTRAINT portal_staff_config_result_json CHECK (result_json IS NULL OR JSON_VALID(result_json))
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
