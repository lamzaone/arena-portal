-- Run this migration against PORTAL_DATABASE_URL after 009_inventory_public_default.sql.
--
-- Catalogue price snapshots remain immutable base/original prices. Discounts
-- are separate, time-bounded rules applied by the portal at quote and purchase
-- time. Exactly one rule is selected: item rules outrank category rules, then
-- higher priority, larger saving for the current base price, and finally the
-- newest rule ID. Rules never stack.

CREATE TABLE IF NOT EXISTS portal_economy_discount_rules (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  display_name VARCHAR(120) NOT NULL,
  target_type ENUM('catalogue_item', 'item_type') NOT NULL,
  catalogue_id BIGINT UNSIGNED NULL,
  item_type VARCHAR(32) NULL,
  percentage_bps SMALLINT UNSIGNED NOT NULL DEFAULT 0,
  fixed_tokens BIGINT UNSIGNED NOT NULL DEFAULT 0,
  priority SMALLINT NOT NULL DEFAULT 0,
  enabled BOOLEAN NOT NULL DEFAULT TRUE,
  starts_at TIMESTAMP NULL DEFAULT NULL,
  ends_at TIMESTAMP NULL DEFAULT NULL,
  created_by_steam_id VARCHAR(17) NOT NULL,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  KEY portal_economy_discount_rules_active (enabled, starts_at, ends_at, target_type, priority, id),
  KEY portal_economy_discount_rules_catalogue (catalogue_id, enabled, priority, id),
  KEY portal_economy_discount_rules_item_type (item_type, enabled, priority, id),
  CONSTRAINT portal_economy_discount_rules_catalogue_fk FOREIGN KEY (catalogue_id) REFERENCES portal_economy_catalogue (id) ON DELETE RESTRICT,
  CONSTRAINT portal_economy_discount_rules_target_shape CHECK (
    (target_type = 'catalogue_item' AND catalogue_id IS NOT NULL AND item_type IS NULL) OR
    (target_type = 'item_type' AND catalogue_id IS NULL AND item_type IS NOT NULL)
  ),
  CONSTRAINT portal_economy_discount_rules_item_type_known CHECK (
    item_type IS NULL OR item_type IN ('skin', 'knife', 'glove', 'crate', 'capsule', 'nametag', 'sticker', 'agent', 'music_kit', 'keychain', 'patch', 'graffiti', 'vip_membership', 'profile_theme')
  ),
  CONSTRAINT portal_economy_discount_rules_percentage_range CHECK (percentage_bps <= 10000),
  CONSTRAINT portal_economy_discount_rules_adjustment_positive CHECK (percentage_bps > 0 OR fixed_tokens > 0),
  CONSTRAINT portal_economy_discount_rules_date_range CHECK (ends_at IS NULL OR starts_at IS NULL OR ends_at > starts_at)
) ENGINE=InnoDB;

CREATE TABLE IF NOT EXISTS portal_economy_discount_exclusions (
  rule_id BIGINT UNSIGNED NOT NULL,
  catalogue_id BIGINT UNSIGNED NOT NULL,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (rule_id, catalogue_id),
  KEY portal_economy_discount_exclusions_catalogue (catalogue_id, rule_id),
  CONSTRAINT portal_economy_discount_exclusions_rule_fk FOREIGN KEY (rule_id) REFERENCES portal_economy_discount_rules (id) ON DELETE CASCADE,
  CONSTRAINT portal_economy_discount_exclusions_catalogue_fk FOREIGN KEY (catalogue_id) REFERENCES portal_economy_catalogue (id) ON DELETE RESTRICT
) ENGINE=InnoDB;

-- Before this migration the staff crate editor doubled its direct Token input
-- so a hidden 50% container markdown could halve it again. Preserve that old
-- row for audit, close it, and create a corrected base snapshot once. The new
-- source name makes this block idempotent if a migration runner retries it.
START TRANSACTION;

DROP TEMPORARY TABLE IF EXISTS portal_economy_crate_price_corrections;

CREATE TEMPORARY TABLE portal_economy_crate_price_corrections AS
SELECT catalogue_id,
       FLOOR(market_price_eur_cents / 2) AS corrected_eur_cents
FROM portal_economy_catalogue_prices
WHERE is_current = TRUE
  AND price_source = 'staff-custom-crate';

UPDATE portal_economy_catalogue_prices AS price
INNER JOIN portal_economy_crate_price_corrections AS correction
  ON correction.catalogue_id = price.catalogue_id
SET price.is_current = FALSE
WHERE price.is_current = TRUE
  AND price.price_source = 'staff-custom-crate';

INSERT INTO portal_economy_catalogue_prices
  (catalogue_id, market_price_eur_cents, price_source, source_reference, is_current)
SELECT catalogue_id,
       corrected_eur_cents,
       'staff-custom-crate-direct-v2',
       'Corrected staff direct Token price; no implicit container markdown',
       TRUE
FROM portal_economy_crate_price_corrections;

DROP TEMPORARY TABLE portal_economy_crate_price_corrections;

COMMIT;
