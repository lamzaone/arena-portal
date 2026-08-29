-- Run this migration against PORTAL_DATABASE_URL after 007_redeem_codes.sql.
-- Profile themes are trusted, code-owned presentations. The database stores
-- only their stable key and player entitlement; it never stores executable
-- CSS supplied by a player.

CREATE TABLE IF NOT EXISTS portal_profile_themes (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  theme_key VARCHAR(64) CHARACTER SET ascii COLLATE ascii_general_ci NOT NULL,
  catalogue_id BIGINT UNSIGNED NULL,
  display_name VARCHAR(100) NOT NULL,
  description VARCHAR(255) NOT NULL,
  preview_image_url VARCHAR(512) NULL,
  enabled BOOLEAN NOT NULL DEFAULT TRUE,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  UNIQUE KEY portal_profile_themes_key_unique (theme_key),
  UNIQUE KEY portal_profile_themes_catalogue_unique (catalogue_id),
  KEY portal_profile_themes_enabled_name (enabled, display_name, id),
  CONSTRAINT portal_profile_themes_key_valid CHECK (theme_key REGEXP '^[a-z0-9][a-z0-9_-]{0,63}$'),
  CONSTRAINT portal_profile_themes_catalogue_fk FOREIGN KEY (catalogue_id) REFERENCES portal_economy_catalogue (id) ON DELETE RESTRICT
) ENGINE=InnoDB;

CREATE TABLE IF NOT EXISTS portal_player_theme_ownership (
  steam_id VARCHAR(17) NOT NULL,
  theme_id BIGINT UNSIGNED NOT NULL,
  source_type VARCHAR(32) NOT NULL DEFAULT 'grant',
  source_reference VARCHAR(128) NULL,
  acquired_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (steam_id, theme_id),
  KEY portal_player_theme_ownership_theme (theme_id, acquired_at),
  CONSTRAINT portal_player_theme_ownership_theme_fk FOREIGN KEY (theme_id) REFERENCES portal_profile_themes (id) ON DELETE RESTRICT
) ENGINE=InnoDB;

CREATE TABLE IF NOT EXISTS portal_player_settings (
  steam_id VARCHAR(17) NOT NULL,
  inventory_visibility ENUM('private', 'public') NOT NULL DEFAULT 'public',
  active_theme_id BIGINT UNSIGNED NULL,
  active_theme_item_id CHAR(36) CHARACTER SET ascii COLLATE ascii_general_ci NULL,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (steam_id),
  KEY portal_player_settings_visibility (inventory_visibility, steam_id),
  KEY portal_player_settings_active_theme (active_theme_id),
  KEY portal_player_settings_active_theme_item (active_theme_item_id),
  KEY portal_player_settings_owned_theme (steam_id, active_theme_id),
  CONSTRAINT portal_player_settings_theme_fk FOREIGN KEY (active_theme_id) REFERENCES portal_profile_themes (id) ON DELETE RESTRICT,
  CONSTRAINT portal_player_settings_theme_item_fk FOREIGN KEY (active_theme_item_id) REFERENCES portal_inventory_items (id) ON DELETE RESTRICT,
  CONSTRAINT portal_player_settings_owned_theme_fk FOREIGN KEY (steam_id, active_theme_id) REFERENCES portal_player_theme_ownership (steam_id, theme_id) ON DELETE RESTRICT,
  CONSTRAINT portal_player_settings_theme_item_pair CHECK (
    (active_theme_id IS NULL AND active_theme_item_id IS NULL) OR
    (active_theme_id IS NOT NULL AND active_theme_item_id IS NOT NULL)
  )
) ENGINE=InnoDB;
