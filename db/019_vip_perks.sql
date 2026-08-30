-- Run this migration against PORTAL_DATABASE_URL after
-- 018_revoke_retired_group_reward_entitlements.sql.
--
-- VIP perks are independent, timed entitlements. They do not manufacture a
-- VIPCore membership and they never grant portal staff authority. VIPCore may
-- read the effective rows through its separately configured `portal` database
-- connection and merge them on top of the player's normal group features.

CREATE TABLE IF NOT EXISTS portal_vip_perks (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  perk_key VARCHAR(96) CHARACTER SET ascii COLLATE ascii_general_ci NOT NULL,
  display_name VARCHAR(100) NOT NULL,
  description VARCHAR(255) NULL,
  category VARCHAR(48) CHARACTER SET ascii COLLATE ascii_general_ci NOT NULL DEFAULT 'gameplay',
  configuration JSON NOT NULL,
  enabled BOOLEAN NOT NULL DEFAULT TRUE,
  created_by_steam_id VARCHAR(17) NOT NULL,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  UNIQUE KEY portal_vip_perks_key_unique (perk_key),
  KEY portal_vip_perks_browse (enabled, category, display_name, id),
  CONSTRAINT portal_vip_perks_key_valid CHECK (perk_key REGEXP '^[a-z0-9][a-z0-9._:-]{0,95}$'),
  CONSTRAINT portal_vip_perks_category_valid CHECK (category REGEXP '^[a-z0-9][a-z0-9_-]{0,47}$')
) ENGINE=InnoDB DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- VIPCore refreshes this heartbeat only for feature modules currently
-- registered on a live server. Commerce fails closed when the matching key is
-- absent or stale, so Tokens cannot purchase an unloaded runtime feature.
CREATE TABLE IF NOT EXISTS portal_vip_perk_runtime_features (
  server_id INT NOT NULL,
  feature_key VARCHAR(96) CHARACTER SET ascii COLLATE ascii_general_ci NOT NULL,
  last_seen_at TIMESTAMP(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
  PRIMARY KEY (server_id, feature_key),
  KEY portal_vip_perk_runtime_features_freshness (server_id, last_seen_at, feature_key),
  CONSTRAINT portal_vip_perk_runtime_features_server_valid CHECK (server_id >= 0),
  CONSTRAINT portal_vip_perk_runtime_features_key_valid CHECK (feature_key REGEXP '^[a-z0-9][a-z0-9._:-]{0,95}$')
) ENGINE=InnoDB DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS portal_vip_perk_shop_offers (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  perk_id BIGINT UNSIGNED NOT NULL,
  token_price BIGINT UNSIGNED NOT NULL,
  duration_minutes INT UNSIGNED NOT NULL,
  enabled BOOLEAN NOT NULL DEFAULT TRUE,
  created_by_steam_id VARCHAR(17) NOT NULL,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  retired_at TIMESTAMP NULL DEFAULT NULL,
  retired_by_steam_id VARCHAR(17) NULL,
  PRIMARY KEY (id),
  UNIQUE KEY portal_vip_perk_shop_offers_variant (perk_id, duration_minutes),
  KEY portal_vip_perk_shop_offers_browse (enabled, perk_id, token_price, id),
  CONSTRAINT portal_vip_perk_shop_offers_perk_fk FOREIGN KEY (perk_id) REFERENCES portal_vip_perks (id) ON DELETE RESTRICT,
  CONSTRAINT portal_vip_perk_shop_offers_price_positive CHECK (token_price BETWEEN 1 AND 1000000000),
  CONSTRAINT portal_vip_perk_shop_offers_duration_valid CHECK (duration_minutes BETWEEN 1 AND 525600)
) ENGINE=InnoDB DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS portal_vip_perk_group_grants (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  perk_id BIGINT UNSIGNED NOT NULL,
  group_id BIGINT UNSIGNED NOT NULL,
  configuration_override JSON NULL,
  starts_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  expires_at TIMESTAMP NULL DEFAULT NULL,
  granted_by_steam_id VARCHAR(17) NOT NULL,
  grant_reason VARCHAR(180) NULL,
  revoked_at TIMESTAMP NULL DEFAULT NULL,
  revoked_by_steam_id VARCHAR(17) NULL,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  KEY portal_vip_perk_group_grants_active (group_id, revoked_at, expires_at, perk_id, id),
  KEY portal_vip_perk_group_grants_perk (perk_id, revoked_at, expires_at, group_id),
  CONSTRAINT portal_vip_perk_group_grants_perk_fk FOREIGN KEY (perk_id) REFERENCES portal_vip_perks (id) ON DELETE RESTRICT,
  CONSTRAINT portal_vip_perk_group_grants_group_fk FOREIGN KEY (group_id) REFERENCES portal_identity_groups (id) ON DELETE RESTRICT,
  CONSTRAINT portal_vip_perk_group_grants_date_range CHECK (expires_at IS NULL OR expires_at > starts_at)
) ENGINE=InnoDB DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS portal_vip_perk_player_grants (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  perk_id BIGINT UNSIGNED NOT NULL,
  steam_id VARCHAR(17) NOT NULL,
  source_type ENUM('staff', 'shop') NOT NULL DEFAULT 'staff',
  offer_id BIGINT UNSIGNED NULL,
  configuration_override JSON NULL,
  starts_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  expires_at TIMESTAMP NULL DEFAULT NULL,
  granted_by_steam_id VARCHAR(17) NOT NULL,
  grant_reason VARCHAR(180) NULL,
  revoked_at TIMESTAMP NULL DEFAULT NULL,
  revoked_by_steam_id VARCHAR(17) NULL,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  KEY portal_vip_perk_player_grants_active (steam_id, revoked_at, expires_at, perk_id, id),
  KEY portal_vip_perk_player_grants_perk (perk_id, revoked_at, expires_at, steam_id),
  KEY portal_vip_perk_player_grants_offer (offer_id, steam_id, id),
  CONSTRAINT portal_vip_perk_player_grants_perk_fk FOREIGN KEY (perk_id) REFERENCES portal_vip_perks (id) ON DELETE RESTRICT,
  CONSTRAINT portal_vip_perk_player_grants_offer_fk FOREIGN KEY (offer_id) REFERENCES portal_vip_perk_shop_offers (id) ON DELETE RESTRICT,
  CONSTRAINT portal_vip_perk_player_grants_date_range CHECK (expires_at IS NULL OR expires_at > starts_at),
  CONSTRAINT portal_vip_perk_player_grants_source_shape CHECK (
    (source_type = 'staff' AND offer_id IS NULL) OR
    (source_type = 'shop' AND offer_id IS NOT NULL)
  )
) ENGINE=InnoDB DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS portal_vip_perk_purchases (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  offer_id BIGINT UNSIGNED NOT NULL,
  perk_id BIGINT UNSIGNED NOT NULL,
  player_grant_id BIGINT UNSIGNED NOT NULL,
  steam_id VARCHAR(17) NOT NULL,
  token_price BIGINT UNSIGNED NOT NULL,
  duration_minutes INT UNSIGNED NOT NULL,
  balance_after BIGINT UNSIGNED NOT NULL,
  entitlement_expires_at TIMESTAMP NOT NULL,
  idempotency_key VARCHAR(128) CHARACTER SET ascii COLLATE ascii_general_ci NOT NULL,
  purchased_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  UNIQUE KEY portal_vip_perk_purchases_idempotency (idempotency_key),
  KEY portal_vip_perk_purchases_player (steam_id, purchased_at, id),
  KEY portal_vip_perk_purchases_offer (offer_id, purchased_at, id),
  CONSTRAINT portal_vip_perk_purchases_offer_fk FOREIGN KEY (offer_id) REFERENCES portal_vip_perk_shop_offers (id) ON DELETE RESTRICT,
  CONSTRAINT portal_vip_perk_purchases_perk_fk FOREIGN KEY (perk_id) REFERENCES portal_vip_perks (id) ON DELETE RESTRICT,
  CONSTRAINT portal_vip_perk_purchases_grant_fk FOREIGN KEY (player_grant_id) REFERENCES portal_vip_perk_player_grants (id) ON DELETE RESTRICT
) ENGINE=InnoDB DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

DROP TRIGGER IF EXISTS portal_vip_perk_purchases_prevent_update;
CREATE TRIGGER portal_vip_perk_purchases_prevent_update BEFORE UPDATE ON portal_vip_perk_purchases
FOR EACH ROW SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'portal_vip_perk_purchases is immutable';

DROP TRIGGER IF EXISTS portal_vip_perk_purchases_prevent_delete;
CREATE TRIGGER portal_vip_perk_purchases_prevent_delete BEFORE DELETE ON portal_vip_perk_purchases
FOR EACH ROW SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'portal_vip_perk_purchases is immutable';

CREATE TABLE IF NOT EXISTS portal_vip_perk_admin_audit (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  idempotency_key VARCHAR(160) CHARACTER SET ascii COLLATE ascii_general_ci NOT NULL,
  request_hash CHAR(64) CHARACTER SET ascii COLLATE ascii_general_ci NULL,
  actor_steam_id VARCHAR(17) NOT NULL,
  action VARCHAR(80) CHARACTER SET ascii COLLATE ascii_general_ci NOT NULL,
  target_type VARCHAR(48) CHARACTER SET ascii COLLATE ascii_general_ci NOT NULL,
  target_id VARCHAR(96) NOT NULL,
  metadata JSON NULL,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  UNIQUE KEY portal_vip_perk_admin_audit_idempotency (idempotency_key),
  KEY portal_vip_perk_admin_audit_actor (actor_steam_id, created_at, id),
  KEY portal_vip_perk_admin_audit_target (target_type, target_id, created_at, id),
  CONSTRAINT portal_vip_perk_admin_audit_hash_valid CHECK (request_hash IS NULL OR request_hash REGEXP '^[0-9a-f]{64}$')
) ENGINE=InnoDB DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CREATE TABLE IF NOT EXISTS does not add columns when a preview of migration
-- 019 has already been applied. Nullable preserves prior immutable audit rows;
-- every portal mutation written by the current code supplies a hash.
ALTER TABLE portal_vip_perk_admin_audit
  ADD COLUMN IF NOT EXISTS request_hash CHAR(64) CHARACTER SET ascii COLLATE ascii_general_ci NULL AFTER idempotency_key;

DROP TRIGGER IF EXISTS portal_vip_perk_admin_audit_prevent_update;
CREATE TRIGGER portal_vip_perk_admin_audit_prevent_update BEFORE UPDATE ON portal_vip_perk_admin_audit
FOR EACH ROW SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'portal_vip_perk_admin_audit is immutable';

DROP TRIGGER IF EXISTS portal_vip_perk_admin_audit_prevent_delete;
CREATE TRIGGER portal_vip_perk_admin_audit_prevent_delete BEFORE DELETE ON portal_vip_perk_admin_audit
FOR EACH ROW SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'portal_vip_perk_admin_audit is immutable';

-- The initial definitions mirror the currently deployed VIPCore feature keys.
-- Values use the current ULTIMATE configuration as the explicit standalone
-- default; Founder-managed definitions can tune or disable them before offers
-- are published. No Token shop offer is enabled automatically.
INSERT IGNORE INTO portal_vip_perks
  (perk_key, display_name, description, category, configuration, created_by_steam_id)
VALUES
  ('vip.antiflash', 'Anti-flash', 'Reduces flash impact.', 'survivability', JSON_EXTRACT('true', '$'), 'system'),
  ('vip.armor', 'Spawn armor', 'Spawn with configured armor.', 'loadout', JSON_OBJECT('Armor', 100), 'system'),
  ('vip.bhop', 'Bunny hop', 'Enables configured bunny-hop movement.', 'movement', JSON_OBJECT('Timer', 0, 'MaxSpeed', 300, 'JumpForce', 305), 'system'),
  ('vip.doublejump', 'Double jump', 'Adds configurable air jumps.', 'movement', JSON_OBJECT('MaxJumps', 2, 'Boost', 320), 'system'),
  ('vip.fastreload', 'Fast reload', 'Enables fast reload.', 'combat', JSON_EXTRACT('true', '$'), 'system'),
  ('vip.fov', 'Field of view', 'Enables the VIP field-of-view control.', 'cosmetic', JSON_EXTRACT('1', '$'), 'system'),
  ('vip.health', 'Spawn health', 'Spawn with configured health.', 'survivability', JSON_OBJECT('Health', 125), 'system'),
  ('vip.items', 'Spawn utilities', 'Receive configured utility items on spawn.', 'loadout', JSON_OBJECT('GiveOnPistolRounds', TRUE, 'CT', JSON_ARRAY('weapon_hegrenade', 'weapon_flashbang', 'weapon_smokegrenade'), 'T', JSON_ARRAY('weapon_hegrenade', 'weapon_flashbang', 'weapon_smokegrenade')), 'system'),
  ('vip.killscreen', 'Kill screen', 'Shows the configured kill screen.', 'cosmetic', JSON_OBJECT('Duration', 1.0), 'system'),
  ('vip.money', 'Spawn money', 'Spawn with configured money.', 'loadout', JSON_OBJECT('Money', '16000'), 'system'),
  ('vip.rainbowmodel', 'Rainbow model', 'Enables the animated rainbow model.', 'cosmetic', JSON_OBJECT('Enabled', JSON_EXTRACT('true', '$'), 'IntervalSeconds', 1.4), 'system'),
  ('vip.round_end_abilities', 'Round-end abilities', 'Applies configured round-end movement effects.', 'movement', JSON_OBJECT('SpeedModifier', 2.0, 'GravityModifier', 0.5), 'system'),
  ('vip.smokecolor', 'Smoke color', 'Uses the configured smoke color.', 'cosmetic', JSON_ARRAY(180, 0, 255), 'system'),
  ('vip.speed', 'Movement speed', 'Applies configured movement speed.', 'movement', JSON_OBJECT('Speed', 1.1), 'system'),
  ('vip.vampirism', 'Vampirism', 'Returns configured health from damage.', 'combat', JSON_OBJECT('GiveHealthMode', 'OnDamage', 'HealthReturnMode', 'Percent', 'Percent', 15, 'Flat', 0), 'system'),
  ('vip.zeus', 'Zeus', 'Enables the VIP Zeus perk.', 'loadout', JSON_EXTRACT('true', '$'), 'system');
