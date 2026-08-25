-- Run this migration against PORTAL_DATABASE_URL for existing portal databases.
-- New installations receive this table from 001_portal.sql.

CREATE TABLE IF NOT EXISTS portal_sessions (
  token_hash CHAR(64) NOT NULL,
  steam_id VARCHAR(17) NOT NULL,
  expires_at BIGINT UNSIGNED NOT NULL,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  last_seen_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (token_hash),
  KEY portal_sessions_steam_expiry (steam_id, expires_at)
);
