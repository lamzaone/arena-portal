-- Run against PORTAL_DATABASE_URL. Shared by the portal and Arena game plugin.
-- Existing portal_discord_links from 001_portal.sql enforces one-to-one links.
-- Codes are SHA-256 hashes of 12 uppercase hexadecimal characters, without hyphens.
-- All DATETIME values are UTC. Issuance and redemption must use transactions.
CREATE TABLE IF NOT EXISTS portal_discord_link_codes (
  code_hash CHAR(64) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
  discord_user_id VARCHAR(32) NOT NULL,
  expires_at DATETIME NOT NULL,
  consumed_at DATETIME NULL,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (code_hash),
  UNIQUE KEY portal_discord_link_codes_discord_user_unique (discord_user_id),
  KEY portal_discord_link_codes_expiry (expires_at)
) ENGINE = InnoDB;
