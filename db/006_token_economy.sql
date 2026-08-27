-- Run this file against PORTAL_DATABASE_URL after 005_loadout_catalogue.sql.
-- MySQL 8.0.16+ is required (CHECK constraints are enforced from that release).
--
-- `portal_token_accounts`, `portal_token_ledger`, `portal_economy_catalogue`,
-- `portal_inventory_items`, `portal_loot_tables`, `portal_loot_entries`,
-- `portal_drop_awards`, `portal_crate_openings`, `portal_loadout_slots`, and
-- `portal_economy_jobs` are the shared contract used by TAPPED.Inventory.
-- The server plugin may claim visual/chat jobs from `portal_economy_jobs`, but
-- it must never use a job as the source of a financial mutation.

CREATE TABLE IF NOT EXISTS portal_token_accounts (
  steam_id VARCHAR(17) NOT NULL,
  balance BIGINT UNSIGNED NOT NULL DEFAULT 0,
  lifetime_earned BIGINT UNSIGNED NOT NULL DEFAULT 0,
  lifetime_spent BIGINT UNSIGNED NOT NULL DEFAULT 0,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (steam_id),
  CONSTRAINT portal_token_accounts_balance_nonnegative CHECK (balance >= 0),
  CONSTRAINT portal_token_accounts_earned_nonnegative CHECK (lifetime_earned >= 0),
  CONSTRAINT portal_token_accounts_spent_nonnegative CHECK (lifetime_spent >= 0)
) ENGINE=InnoDB;

-- This is append-only accounting.  `line_key` permits one idempotent operation
-- (for example, a trade) to write more than one guarded ledger line.
CREATE TABLE IF NOT EXISTS portal_token_ledger (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  account_steam_id VARCHAR(17) NOT NULL,
  delta BIGINT NOT NULL,
  balance_after BIGINT UNSIGNED NOT NULL,
  reason VARCHAR(64) NOT NULL,
  reference_type VARCHAR(48) NOT NULL,
  reference_id VARCHAR(96) NOT NULL,
  idempotency_key VARCHAR(128) NOT NULL,
  line_key VARCHAR(64) NOT NULL DEFAULT 'primary',
  actor_steam_id VARCHAR(17) NULL,
  metadata JSON NULL,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  UNIQUE KEY portal_token_ledger_idempotency_line (idempotency_key, line_key),
  KEY portal_token_ledger_account_created (account_steam_id, created_at, id),
  KEY portal_token_ledger_reference (reference_type, reference_id),
  CONSTRAINT portal_token_ledger_delta_nonzero CHECK (delta <> 0),
  CONSTRAINT portal_token_ledger_balance_nonnegative CHECK (balance_after >= 0)
) ENGINE=InnoDB;

CREATE TABLE IF NOT EXISTS portal_economy_operations (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  operation_name VARCHAR(80) NOT NULL,
  idempotency_key VARCHAR(128) NOT NULL,
  actor_steam_id VARCHAR(17) NOT NULL,
  request_hash CHAR(64) NOT NULL,
  status ENUM('processing', 'completed') NOT NULL DEFAULT 'processing',
  result_json JSON NULL,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  completed_at TIMESTAMP NULL,
  PRIMARY KEY (id),
  UNIQUE KEY portal_economy_operations_idempotency (idempotency_key),
  KEY portal_economy_operations_actor_created (actor_steam_id, created_at)
) ENGINE=InnoDB;

CREATE TABLE IF NOT EXISTS portal_economy_catalogue (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  catalogue_key VARCHAR(160) NULL,
  market_hash_name VARCHAR(255) NULL,
  item_type VARCHAR(32) NOT NULL,
  definition_index INT UNSIGNED NULL,
  paintkit INT UNSIGNED NULL,
  rarity_rank TINYINT UNSIGNED NOT NULL DEFAULT 0,
  display_name VARCHAR(180) NOT NULL,
  metadata JSON NOT NULL,
  enabled BOOLEAN NOT NULL DEFAULT TRUE,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  UNIQUE KEY portal_economy_catalogue_key_unique (catalogue_key),
  KEY portal_economy_catalogue_browse (enabled, item_type, rarity_rank, id),
  KEY portal_economy_catalogue_market_hash_name (market_hash_name),
  KEY portal_economy_catalogue_definition_paintkit (definition_index, paintkit),
  CONSTRAINT portal_economy_catalogue_item_type_known CHECK (item_type IN ('skin', 'knife', 'glove', 'crate', 'capsule', 'nametag', 'sticker', 'agent', 'music_kit', 'keychain', 'patch', 'graffiti'))
) ENGINE=InnoDB;

-- Price history is intentionally separate from the catalogue snapshot. Prices
-- are stored as EUR cents; one cent is one Token (1 EUR = 100 Tokens).  A
-- generated nullable key guarantees exactly zero or one current price per
-- catalogue item while preserving old market/last-known observations.
CREATE TABLE IF NOT EXISTS portal_economy_catalogue_prices (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  catalogue_id BIGINT UNSIGNED NOT NULL,
  market_price_eur_cents BIGINT UNSIGNED NOT NULL,
  token_price BIGINT UNSIGNED GENERATED ALWAYS AS (market_price_eur_cents) STORED,
  price_source VARCHAR(32) NOT NULL,
  source_reference VARCHAR(255) NULL,
  observed_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  is_current BOOLEAN NOT NULL DEFAULT TRUE,
  current_catalogue_id BIGINT UNSIGNED GENERATED ALWAYS AS (CASE WHEN is_current THEN catalogue_id ELSE NULL END) STORED,
  PRIMARY KEY (id),
  UNIQUE KEY portal_economy_catalogue_prices_current_unique (current_catalogue_id),
  KEY portal_economy_catalogue_prices_history (catalogue_id, observed_at, id),
  CONSTRAINT portal_economy_catalogue_prices_eur_cents_nonnegative CHECK (market_price_eur_cents >= 0),
  CONSTRAINT portal_economy_catalogue_prices_catalogue_fk FOREIGN KEY (catalogue_id) REFERENCES portal_economy_catalogue (id) ON DELETE RESTRICT
) ENGINE=InnoDB;

CREATE TABLE IF NOT EXISTS portal_loot_tables (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  code VARCHAR(64) NOT NULL,
  table_type ENUM('container', 'drop') NOT NULL,
  container_catalogue_id BIGINT UNSIGNED NULL,
  display_name VARCHAR(160) NOT NULL,
  enabled BOOLEAN NOT NULL DEFAULT TRUE,
  metadata JSON NOT NULL,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  UNIQUE KEY portal_loot_tables_code_unique (code),
  UNIQUE KEY portal_loot_tables_container_unique (container_catalogue_id),
  KEY portal_loot_tables_type_enabled (table_type, enabled, id),
  CONSTRAINT portal_loot_tables_shape CHECK ((table_type = 'container' AND container_catalogue_id IS NOT NULL) OR (table_type = 'drop' AND container_catalogue_id IS NULL)),
  CONSTRAINT portal_loot_tables_container_fk FOREIGN KEY (container_catalogue_id) REFERENCES portal_economy_catalogue (id) ON DELETE RESTRICT
) ENGINE=InnoDB;

CREATE TABLE IF NOT EXISTS portal_loot_entries (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  loot_table_id BIGINT UNSIGNED NOT NULL,
  catalogue_id BIGINT UNSIGNED NOT NULL,
  weight BIGINT UNSIGNED NOT NULL,
  min_float DECIMAL(8, 6) NULL,
  max_float DECIMAL(8, 6) NULL,
  seed_min INT UNSIGNED NULL,
  seed_max INT UNSIGNED NULL,
  stattrak_chance_bps SMALLINT UNSIGNED NOT NULL DEFAULT 0,
  attributes JSON NOT NULL,
  sort_order INT UNSIGNED NOT NULL DEFAULT 0,
  enabled BOOLEAN NOT NULL DEFAULT TRUE,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  UNIQUE KEY portal_loot_entries_table_sort_unique (loot_table_id, sort_order, id),
  KEY portal_loot_entries_roll (loot_table_id, enabled, id),
  CONSTRAINT portal_loot_entries_weight_positive CHECK (weight > 0),
  CONSTRAINT portal_loot_entries_float_range CHECK ((min_float IS NULL AND max_float IS NULL) OR (min_float >= 0 AND max_float <= 1 AND min_float <= max_float)),
  CONSTRAINT portal_loot_entries_seed_range CHECK ((seed_min IS NULL AND seed_max IS NULL) OR seed_min <= seed_max),
  CONSTRAINT portal_loot_entries_stattrak_chance CHECK (stattrak_chance_bps <= 10000),
  CONSTRAINT portal_loot_entries_table_fk FOREIGN KEY (loot_table_id) REFERENCES portal_loot_tables (id) ON DELETE RESTRICT,
  CONSTRAINT portal_loot_entries_catalogue_fk FOREIGN KEY (catalogue_id) REFERENCES portal_economy_catalogue (id) ON DELETE RESTRICT
) ENGINE=InnoDB;

CREATE TABLE IF NOT EXISTS portal_inventory_items (
  id CHAR(36) CHARACTER SET ascii COLLATE ascii_general_ci NOT NULL,
  owner_steam_id VARCHAR(17) NOT NULL,
  catalogue_id BIGINT UNSIGNED NULL,
  item_type VARCHAR(32) NOT NULL,
  definition_index INT UNSIGNED NULL,
  paintkit INT UNSIGNED NULL,
  seed INT UNSIGNED NULL,
  float_value DECIMAL(8, 6) NULL,
  stattrak BOOLEAN NOT NULL DEFAULT FALSE,
  stattrak_count BIGINT UNSIGNED NOT NULL DEFAULT 0,
  nametag VARCHAR(128) NULL,
  rarity_rank TINYINT UNSIGNED NOT NULL DEFAULT 0,
  state ENUM('available', 'escrowed', 'attached', 'consumed', 'revoked') NOT NULL DEFAULT 'available',
  attributes JSON NOT NULL,
  source JSON NOT NULL,
  acquired_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  consumed_at TIMESTAMP NULL,
  updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  KEY portal_inventory_items_owner_browse (owner_steam_id, state, item_type, rarity_rank, acquired_at, id),
  KEY portal_inventory_items_catalogue_owner (catalogue_id, owner_steam_id),
  KEY portal_inventory_items_state_updated (state, updated_at),
  CONSTRAINT portal_inventory_items_item_type_known CHECK (item_type IN ('skin', 'knife', 'glove', 'crate', 'capsule', 'nametag', 'sticker', 'agent', 'music_kit', 'keychain', 'patch', 'graffiti')),
  CONSTRAINT portal_inventory_items_float_range CHECK (float_value IS NULL OR (float_value >= 0 AND float_value <= 1)),
  CONSTRAINT portal_inventory_items_stattrak_count_nonnegative CHECK (stattrak_count >= 0),
  CONSTRAINT portal_inventory_items_catalogue_fk FOREIGN KEY (catalogue_id) REFERENCES portal_economy_catalogue (id) ON DELETE RESTRICT
) ENGINE=InnoDB;

CREATE TABLE IF NOT EXISTS portal_inventory_item_stickers (
  weapon_item_id CHAR(36) CHARACTER SET ascii COLLATE ascii_general_ci NOT NULL,
  sticker_slot TINYINT UNSIGNED NOT NULL,
  sticker_item_id CHAR(36) CHARACTER SET ascii COLLATE ascii_general_ci NOT NULL,
  sticker_catalogue_id BIGINT UNSIGNED NULL,
  sticker_definition_index INT UNSIGNED NULL,
  sticker_paintkit INT UNSIGNED NULL,
  sticker_rarity_rank TINYINT UNSIGNED NOT NULL DEFAULT 0,
  applied_by_steam_id VARCHAR(17) NOT NULL,
  attributes JSON NOT NULL,
  applied_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (weapon_item_id, sticker_slot),
  UNIQUE KEY portal_inventory_item_stickers_item_unique (sticker_item_id),
  KEY portal_inventory_item_stickers_catalogue (sticker_catalogue_id),
  CONSTRAINT portal_inventory_item_stickers_weapon_fk FOREIGN KEY (weapon_item_id) REFERENCES portal_inventory_items (id) ON DELETE RESTRICT,
  CONSTRAINT portal_inventory_item_stickers_item_fk FOREIGN KEY (sticker_item_id) REFERENCES portal_inventory_items (id) ON DELETE RESTRICT,
  CONSTRAINT portal_inventory_item_stickers_catalogue_fk FOREIGN KEY (sticker_catalogue_id) REFERENCES portal_economy_catalogue (id) ON DELETE RESTRICT
) ENGINE=InnoDB;

-- An immutable per-item history is kept so staff changes and player-paid
-- customizations are reconstructable without editing the item record itself.
CREATE TABLE IF NOT EXISTS portal_inventory_item_events (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  item_id CHAR(36) CHARACTER SET ascii COLLATE ascii_general_ci NOT NULL,
  actor_steam_id VARCHAR(17) NULL,
  event_type VARCHAR(64) NOT NULL,
  idempotency_key VARCHAR(128) NOT NULL,
  line_key VARCHAR(64) NOT NULL DEFAULT 'primary',
  before_state JSON NULL,
  after_state JSON NULL,
  metadata JSON NULL,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  UNIQUE KEY portal_inventory_item_events_idempotency_line (idempotency_key, line_key),
  KEY portal_inventory_item_events_item_created (item_id, created_at, id),
  CONSTRAINT portal_inventory_item_events_item_fk FOREIGN KEY (item_id) REFERENCES portal_inventory_items (id) ON DELETE RESTRICT
) ENGINE=InnoDB;

CREATE TABLE IF NOT EXISTS portal_drop_awards (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  steam_id VARCHAR(17) NOT NULL,
  drop_source ENUM('hourly', 'map_end', 'manual') NOT NULL,
  loot_table_id BIGINT UNSIGNED NOT NULL,
  loot_entry_id BIGINT UNSIGNED NOT NULL,
  item_id CHAR(36) CHARACTER SET ascii COLLATE ascii_general_ci NOT NULL,
  roll_value BIGINT UNSIGNED NOT NULL,
  total_weight BIGINT UNSIGNED NOT NULL,
  idempotency_key VARCHAR(128) NOT NULL,
  metadata JSON NULL,
  awarded_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  UNIQUE KEY portal_drop_awards_idempotency (idempotency_key),
  KEY portal_drop_awards_player_created (steam_id, awarded_at, id),
  CONSTRAINT portal_drop_awards_total_weight_positive CHECK (total_weight > 0),
  CONSTRAINT portal_drop_awards_table_fk FOREIGN KEY (loot_table_id) REFERENCES portal_loot_tables (id) ON DELETE RESTRICT,
  CONSTRAINT portal_drop_awards_entry_fk FOREIGN KEY (loot_entry_id) REFERENCES portal_loot_entries (id) ON DELETE RESTRICT,
  CONSTRAINT portal_drop_awards_item_fk FOREIGN KEY (item_id) REFERENCES portal_inventory_items (id) ON DELETE RESTRICT
) ENGINE=InnoDB;

CREATE TABLE IF NOT EXISTS portal_crate_openings (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  steam_id VARCHAR(17) NOT NULL,
  crate_item_id CHAR(36) CHARACTER SET ascii COLLATE ascii_general_ci NOT NULL,
  loot_table_id BIGINT UNSIGNED NOT NULL,
  loot_entry_id BIGINT UNSIGNED NOT NULL,
  reward_item_id CHAR(36) CHARACTER SET ascii COLLATE ascii_general_ci NOT NULL,
  roll_value BIGINT UNSIGNED NOT NULL,
  total_weight BIGINT UNSIGNED NOT NULL,
  idempotency_key VARCHAR(128) NOT NULL,
  metadata JSON NULL,
  opened_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  UNIQUE KEY portal_crate_openings_crate_unique (crate_item_id),
  UNIQUE KEY portal_crate_openings_idempotency (idempotency_key),
  KEY portal_crate_openings_player_created (steam_id, opened_at, id),
  CONSTRAINT portal_crate_openings_total_weight_positive CHECK (total_weight > 0),
  CONSTRAINT portal_crate_openings_crate_fk FOREIGN KEY (crate_item_id) REFERENCES portal_inventory_items (id) ON DELETE RESTRICT,
  CONSTRAINT portal_crate_openings_table_fk FOREIGN KEY (loot_table_id) REFERENCES portal_loot_tables (id) ON DELETE RESTRICT,
  CONSTRAINT portal_crate_openings_entry_fk FOREIGN KEY (loot_entry_id) REFERENCES portal_loot_entries (id) ON DELETE RESTRICT,
  CONSTRAINT portal_crate_openings_reward_fk FOREIGN KEY (reward_item_id) REFERENCES portal_inventory_items (id) ON DELETE RESTRICT
) ENGINE=InnoDB;

CREATE TABLE IF NOT EXISTS portal_loadout_slots (
  owner_steam_id VARCHAR(17) NOT NULL,
  slot_key VARCHAR(96) NOT NULL,
  slot_type ENUM('weapon', 'knife', 'glove', 'agent', 'music_kit') NOT NULL,
  team ENUM('T', 'CT') NULL,
  definition_index INT UNSIGNED NULL,
  item_id CHAR(36) CHARACTER SET ascii COLLATE ascii_general_ci NULL,
  updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (owner_steam_id, slot_key),
  KEY portal_loadout_slots_item (item_id),
  CONSTRAINT portal_loadout_slots_shape CHECK (
    (slot_type = 'weapon' AND team IS NOT NULL AND definition_index IS NOT NULL) OR
    (slot_type IN ('knife', 'glove', 'agent') AND team IS NOT NULL AND definition_index IS NULL) OR
    (slot_type = 'music_kit' AND team IS NULL AND definition_index IS NULL)
  ),
  CONSTRAINT portal_loadout_slots_item_fk FOREIGN KEY (item_id) REFERENCES portal_inventory_items (id) ON DELETE SET NULL
) ENGINE=InnoDB;

-- This queue is deliberately independent from portal_outbox.  TAPPED.Inventory
-- claims only `inventory.*` visual synchronization and `economy.*` chat jobs.
CREATE TABLE IF NOT EXISTS portal_economy_jobs (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  job_type VARCHAR(80) NOT NULL,
  target_steam_id VARCHAR(17) NULL,
  payload JSON NOT NULL,
  status ENUM('pending', 'processing', 'completed', 'failed', 'cancelled') NOT NULL DEFAULT 'pending',
  attempts INT UNSIGNED NOT NULL DEFAULT 0,
  idempotency_key VARCHAR(128) NULL,
  available_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  locked_by VARCHAR(96) NULL,
  locked_at TIMESTAMP NULL,
  processed_at TIMESTAMP NULL,
  last_error VARCHAR(500) NULL,
  result_message VARCHAR(500) NULL,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  UNIQUE KEY portal_economy_jobs_idempotency_type (idempotency_key, job_type),
  KEY portal_economy_jobs_status_available (status, available_at, id),
  KEY portal_economy_jobs_processing_lock (status, locked_at),
  KEY portal_economy_jobs_target_created (target_steam_id, created_at)
) ENGINE=InnoDB;

CREATE TABLE IF NOT EXISTS portal_economy_notifications (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  steam_id VARCHAR(17) NOT NULL,
  notification_type VARCHAR(64) NOT NULL,
  payload JSON NOT NULL,
  read_at TIMESTAMP NULL,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  KEY portal_economy_notifications_player_unread (steam_id, read_at, created_at, id)
) ENGINE=InnoDB;

-- Redeem codes are stored as SHA-256 hashes. The original text is shown only
-- once to the staff member who creates it, while this table tracks global
-- usage and the claim table below enforces one redemption per Steam account.
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

-- Code rewards are catalogue-backed so crates/capsules retain their active
-- loot-table contract and all cosmetics retain their authoritative metadata.
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

CREATE TABLE IF NOT EXISTS portal_economy_trades (
  id CHAR(36) CHARACTER SET ascii COLLATE ascii_general_ci NOT NULL,
  creator_steam_id VARCHAR(17) NOT NULL,
  counterparty_steam_id VARCHAR(17) NOT NULL,
  status ENUM('pending', 'accepted', 'rejected', 'cancelled', 'expired') NOT NULL DEFAULT 'pending',
  offered_tokens BIGINT UNSIGNED NOT NULL DEFAULT 0,
  requested_tokens BIGINT UNSIGNED NOT NULL DEFAULT 0,
  expires_at TIMESTAMP NULL,
  responded_at TIMESTAMP NULL,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  KEY portal_economy_trades_creator_status (creator_steam_id, status, created_at),
  KEY portal_economy_trades_counterparty_status (counterparty_steam_id, status, created_at),
  CONSTRAINT portal_economy_trades_distinct_parties CHECK (creator_steam_id <> counterparty_steam_id)
) ENGINE=InnoDB;

CREATE TABLE IF NOT EXISTS portal_trade_items (
  trade_id CHAR(36) CHARACTER SET ascii COLLATE ascii_general_ci NOT NULL,
  side ENUM('offered', 'requested') NOT NULL,
  item_id CHAR(36) CHARACTER SET ascii COLLATE ascii_general_ci NOT NULL,
  owner_steam_id VARCHAR(17) NOT NULL,
  state ENUM('requested', 'escrowed', 'transferred', 'returned', 'unavailable') NOT NULL,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (trade_id, item_id),
  KEY portal_trade_items_item (item_id),
  KEY portal_trade_items_owner_state (owner_steam_id, state),
  CONSTRAINT portal_trade_items_trade_fk FOREIGN KEY (trade_id) REFERENCES portal_economy_trades (id) ON DELETE RESTRICT,
  CONSTRAINT portal_trade_items_item_fk FOREIGN KEY (item_id) REFERENCES portal_inventory_items (id) ON DELETE RESTRICT
) ENGINE=InnoDB;

CREATE TABLE IF NOT EXISTS portal_trade_token_escrow (
  trade_id CHAR(36) CHARACTER SET ascii COLLATE ascii_general_ci NOT NULL,
  party_steam_id VARCHAR(17) NOT NULL,
  amount BIGINT UNSIGNED NOT NULL,
  side ENUM('offered', 'requested') NOT NULL,
  status ENUM('held', 'released', 'returned') NOT NULL DEFAULT 'held',
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  released_at TIMESTAMP NULL,
  PRIMARY KEY (trade_id, party_steam_id, side),
  KEY portal_trade_token_escrow_party_status (party_steam_id, status),
  CONSTRAINT portal_trade_token_escrow_trade_fk FOREIGN KEY (trade_id) REFERENCES portal_economy_trades (id) ON DELETE RESTRICT
) ENGINE=InnoDB;

CREATE TABLE IF NOT EXISTS portal_economy_admin_audit (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  actor_steam_id VARCHAR(17) NOT NULL,
  action VARCHAR(80) NOT NULL,
  target_steam_id VARCHAR(17) NULL,
  target_type VARCHAR(48) NOT NULL,
  target_id VARCHAR(96) NOT NULL,
  idempotency_key VARCHAR(128) NOT NULL,
  metadata JSON NULL,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  UNIQUE KEY portal_economy_admin_audit_idempotency_action (idempotency_key, action),
  KEY portal_economy_admin_audit_target (target_type, target_id, created_at),
  KEY portal_economy_admin_audit_actor_created (actor_steam_id, created_at)
) ENGINE=InnoDB;

-- The ledger and item event log are immutable accounting/audit evidence.
DROP TRIGGER IF EXISTS portal_token_ledger_prevent_update;
CREATE TRIGGER portal_token_ledger_prevent_update BEFORE UPDATE ON portal_token_ledger
FOR EACH ROW SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'portal_token_ledger is immutable';

DROP TRIGGER IF EXISTS portal_token_ledger_prevent_delete;
CREATE TRIGGER portal_token_ledger_prevent_delete BEFORE DELETE ON portal_token_ledger
FOR EACH ROW SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'portal_token_ledger is immutable';

DROP TRIGGER IF EXISTS portal_inventory_item_events_prevent_update;
CREATE TRIGGER portal_inventory_item_events_prevent_update BEFORE UPDATE ON portal_inventory_item_events
FOR EACH ROW SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'portal_inventory_item_events is immutable';

DROP TRIGGER IF EXISTS portal_inventory_item_events_prevent_delete;
CREATE TRIGGER portal_inventory_item_events_prevent_delete BEFORE DELETE ON portal_inventory_item_events
FOR EACH ROW SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'portal_inventory_item_events is immutable';

DROP TRIGGER IF EXISTS portal_economy_admin_audit_prevent_update;
CREATE TRIGGER portal_economy_admin_audit_prevent_update BEFORE UPDATE ON portal_economy_admin_audit
FOR EACH ROW SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'portal_economy_admin_audit is immutable';

DROP TRIGGER IF EXISTS portal_economy_admin_audit_prevent_delete;
CREATE TRIGGER portal_economy_admin_audit_prevent_delete BEFORE DELETE ON portal_economy_admin_audit
FOR EACH ROW SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'portal_economy_admin_audit is immutable';
