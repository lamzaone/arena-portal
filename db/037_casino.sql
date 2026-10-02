-- Apply to the portal database after 006_token_economy.sql. No separate currency.
-- Casino receipts deliberately have no FK to prunable economy operation receipts.
CREATE TABLE IF NOT EXISTS portal_casino_rounds (
  id CHAR(36) NOT NULL,
  steam_id VARCHAR(17) NOT NULL,
  game ENUM('roulette','plinko','blackjack','crash') NOT NULL,
  request_key VARCHAR(128) NOT NULL,
  status ENUM('active','settled') NOT NULL,
  stake_tokens BIGINT UNSIGNED NOT NULL,
  payout_tokens BIGINT UNSIGNED NULL,
  private_state JSON NULL,
  public_state JSON NOT NULL,
  settings_snapshot JSON NOT NULL,
  engine_version VARCHAR(32) NOT NULL,
  created_at_ms BIGINT UNSIGNED NOT NULL,
  settled_at_ms BIGINT UNSIGNED NULL,
  expires_at_ms BIGINT UNSIGNED NULL,
  active_blackjack_player VARCHAR(17) GENERATED ALWAYS AS (CASE WHEN game = 'blackjack' AND status = 'active' THEN steam_id ELSE NULL END) STORED,
  PRIMARY KEY (id),
  UNIQUE KEY portal_casino_round_request (steam_id,request_key),
  UNIQUE KEY portal_casino_one_active_blackjack (active_blackjack_player),
  KEY portal_casino_player_history (steam_id,created_at_ms),
  CONSTRAINT portal_casino_stake_safe CHECK (stake_tokens BETWEEN 2 AND 9007199254740991),
  CONSTRAINT portal_casino_payout_safe CHECK (payout_tokens IS NULL OR payout_tokens <= 9007199254740991)
) ENGINE=InnoDB;
CREATE TABLE IF NOT EXISTS portal_casino_actions (
  request_key VARCHAR(128) NOT NULL,
  steam_id VARCHAR(17) NOT NULL,
  operation_name VARCHAR(80) NOT NULL,
  request_hash CHAR(64) NOT NULL,
  round_id CHAR(36) NOT NULL,
  result_json JSON NOT NULL,
  created_at_ms BIGINT UNSIGNED NOT NULL,
  PRIMARY KEY (request_key),
  KEY portal_casino_actions_player_round (steam_id,round_id)
) ENGINE=InnoDB;
CREATE TABLE IF NOT EXISTS portal_casino_crash_rounds (
  id CHAR(36) NOT NULL,
  opens_at_ms BIGINT UNSIGNED NOT NULL,
  start_at_ms BIGINT UNSIGNED NOT NULL,
  private_point SMALLINT UNSIGNED NOT NULL,
  completed_at_ms BIGINT UNSIGNED NULL,
  settings_snapshot JSON NOT NULL,
  engine_version VARCHAR(32) NOT NULL,
  PRIMARY KEY (id),
  KEY portal_casino_crash_recent (completed_at_ms),
  CONSTRAINT portal_casino_crash_point CHECK (private_point BETWEEN 100 AND 10000)
) ENGINE=InnoDB;
CREATE TABLE IF NOT EXISTS portal_casino_crash_bets (
  id CHAR(36) NOT NULL,
  round_id CHAR(36) NOT NULL,
  steam_id VARCHAR(17) NOT NULL,
  stake_tokens BIGINT UNSIGNED NOT NULL,
  auto_cashout SMALLINT UNSIGNED NULL,
  status ENUM('pending','active','cashed_out','lost') NOT NULL DEFAULT 'pending',
  cashout_multiplier SMALLINT UNSIGNED NULL,
  payout_tokens BIGINT UNSIGNED NULL,
  PRIMARY KEY (id),
  UNIQUE KEY portal_casino_crash_player (round_id,steam_id),
  KEY portal_casino_crash_liabilities (round_id,status,steam_id),
  CONSTRAINT portal_casino_crash_auto CHECK (auto_cashout IS NULL OR auto_cashout BETWEEN 101 AND 9999),
  CONSTRAINT portal_casino_crash_stake_safe CHECK (stake_tokens BETWEEN 2 AND 9007199254740991),
  CONSTRAINT portal_casino_crash_payout_safe CHECK (payout_tokens IS NULL OR payout_tokens <= 9007199254740991)
) ENGINE=InnoDB;
CREATE TABLE IF NOT EXISTS portal_casino_clock (
  id TINYINT UNSIGNED NOT NULL,
  current_round_id CHAR(36) NULL,
  PRIMARY KEY (id),
  CONSTRAINT portal_casino_single_clock CHECK (id = 1)
) ENGINE=InnoDB;
INSERT IGNORE INTO portal_casino_clock (id) VALUES (1);

-- Wallet locks must precede reservation locks. No FK to round rows: ordinary
-- credits must not acquire casino round/clock locks while holding the wallet.
CREATE TABLE IF NOT EXISTS portal_casino_reservations (
  round_id CHAR(36) NOT NULL,
  steam_id VARCHAR(17) NOT NULL,
  maximum_return BIGINT UNSIGNED NOT NULL,
  PRIMARY KEY (round_id),
  KEY portal_casino_wallet_reservations (steam_id),
  CONSTRAINT portal_casino_reserved_safe CHECK (maximum_return <= 9007199254740991)
) ENGINE=InnoDB;
