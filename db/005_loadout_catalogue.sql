-- Run this file against PORTAL_DATABASE_URL after 004_staff_case_workflows.sql.
-- The Swiftly TAPPED.PortalBridge writes a validated WeaponSkins catalogue here.
-- The website never writes directly to wp_player_* cosmetic tables.

CREATE TABLE IF NOT EXISTS portal_loadout_catalogue (
  id TINYINT UNSIGNED NOT NULL,
  payload JSON NOT NULL,
  bridge_id VARCHAR(96) NOT NULL,
  synced_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (id)
);
