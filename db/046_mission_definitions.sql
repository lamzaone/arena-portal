-- Shared Inventory/portal contract. UTC calendar publication; progress rows retain frozen JSON.
CREATE TABLE IF NOT EXISTS portal_mission_definitions (
  period_kind VARCHAR(8) NOT NULL,
  mission_id VARCHAR(64) NOT NULL,
  disabled_immediately TINYINT(1) NOT NULL DEFAULT 0,
  disabled_until_period_start DATE NULL,
  created_at DATETIME(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
  updated_at DATETIME(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6) ON UPDATE CURRENT_TIMESTAMP(6),
  PRIMARY KEY(period_kind, mission_id)
) ENGINE=InnoDB;

CREATE TABLE IF NOT EXISTS portal_mission_definition_versions (
  period_kind VARCHAR(8) NOT NULL,
  mission_id VARCHAR(64) NOT NULL,
  version BIGINT UNSIGNED NOT NULL,
  effective_period_start DATE NOT NULL,
  enabled TINYINT(1) NOT NULL DEFAULT 1,
  definition LONGTEXT NOT NULL,
  actor_steam_id VARCHAR(20) NOT NULL,
  created_at DATETIME(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
  PRIMARY KEY(period_kind, mission_id, version),
  KEY mission_publication(period_kind, mission_id, effective_period_start, version),
  CONSTRAINT fk_mission_definition_version FOREIGN KEY(period_kind, mission_id)
    REFERENCES portal_mission_definitions(period_kind, mission_id)
) ENGINE=InnoDB;
