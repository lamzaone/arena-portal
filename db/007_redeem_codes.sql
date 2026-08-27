-- Run this file against an existing PORTAL_DATABASE_URL after 006_token_economy.sql.
-- Fresh installations receive the same idempotent tables through 006 and the
-- TAPPED.Inventory server-start schema bootstrap.

CREATE TABLE IF NOT EXISTS portal_redeem_codes (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  code_hash CHAR(64) CHARACTER SET ascii COLLATE ascii_general_ci NOT NULL,
  code_hint VARCHAR(24) NOT NULL,
  display_name VARCHAR(120) NOT NULL,
  token_amount BIGINT UNSIGNED NOT NULL DEFAULT 0,
  max_redemptions INT UNSIGNED NULL,
  redemption_count INT UNSIGNED NOT NULL DEFAULT 0,
  enabled BOOLEAN NOT NULL DEFAULT TRUE,
  created_by_steam_id VARCHAR(17) NOT NULL,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  UNIQUE KEY portal_redeem_codes_hash_unique (code_hash),
  KEY portal_redeem_codes_manage (enabled, created_at, id),
  CONSTRAINT portal_redeem_codes_tokens_nonnegative CHECK (token_amount >= 0),
  CONSTRAINT portal_redeem_codes_usage_limit CHECK (max_redemptions IS NULL OR max_redemptions >= 1),
  CONSTRAINT portal_redeem_codes_usage_count_nonnegative CHECK (redemption_count >= 0)
) ENGINE=InnoDB;

CREATE TABLE IF NOT EXISTS portal_redeem_code_items (
  redeem_code_id BIGINT UNSIGNED NOT NULL,
  catalogue_id BIGINT UNSIGNED NOT NULL,
  quantity SMALLINT UNSIGNED NOT NULL DEFAULT 1,
  sort_order SMALLINT UNSIGNED NOT NULL DEFAULT 0,
  PRIMARY KEY (redeem_code_id, catalogue_id),
  KEY portal_redeem_code_items_catalogue (catalogue_id),
  CONSTRAINT portal_redeem_code_items_quantity_positive CHECK (quantity >= 1),
  CONSTRAINT portal_redeem_code_items_code_fk FOREIGN KEY (redeem_code_id) REFERENCES portal_redeem_codes (id) ON DELETE RESTRICT,
  CONSTRAINT portal_redeem_code_items_catalogue_fk FOREIGN KEY (catalogue_id) REFERENCES portal_economy_catalogue (id) ON DELETE RESTRICT
) ENGINE=InnoDB;

CREATE TABLE IF NOT EXISTS portal_redeem_code_redemptions (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  redeem_code_id BIGINT UNSIGNED NOT NULL,
  steam_id VARCHAR(17) NOT NULL,
  redeemed_via ENUM('website', 'server') NOT NULL,
  token_amount BIGINT UNSIGNED NOT NULL DEFAULT 0,
  item_count INT UNSIGNED NOT NULL DEFAULT 0,
  idempotency_key VARCHAR(128) NOT NULL,
  redeemed_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  UNIQUE KEY portal_redeem_code_redemptions_once_per_player (redeem_code_id, steam_id),
  UNIQUE KEY portal_redeem_code_redemptions_idempotency (idempotency_key),
  KEY portal_redeem_code_redemptions_player_created (steam_id, redeemed_at, id),
  CONSTRAINT portal_redeem_code_redemptions_code_fk FOREIGN KEY (redeem_code_id) REFERENCES portal_redeem_codes (id) ON DELETE RESTRICT
) ENGINE=InnoDB;
