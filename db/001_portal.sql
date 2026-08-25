-- Run this file against PORTAL_DATABASE_URL, never against the game database.
-- MySQL 8.0+

CREATE TABLE IF NOT EXISTS portal_steam_accounts (
  steam_id VARCHAR(17) PRIMARY KEY,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS portal_discord_links (
  steam_id VARCHAR(17) NOT NULL,
  discord_user_id VARCHAR(32) NOT NULL,
  linked_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (steam_id),
  UNIQUE KEY portal_discord_links_discord_user_unique (discord_user_id)
);

CREATE TABLE IF NOT EXISTS portal_tickets (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  steam_id VARCHAR(17) NOT NULL,
  category VARCHAR(32) NOT NULL,
  subject VARCHAR(120) NOT NULL,
  body TEXT NOT NULL,
  status VARCHAR(24) NOT NULL DEFAULT 'open',
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  KEY portal_tickets_steam_status_created (steam_id, status, created_at)
);

CREATE TABLE IF NOT EXISTS portal_ticket_messages (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  ticket_id BIGINT UNSIGNED NOT NULL,
  author_type VARCHAR(16) NOT NULL,
  author_id VARCHAR(64) NOT NULL,
  body TEXT NOT NULL,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  KEY portal_ticket_messages_ticket_created (ticket_id, created_at)
);

CREATE TABLE IF NOT EXISTS portal_ban_appeals (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  steam_id VARCHAR(17) NOT NULL,
  ban_id BIGINT NULL,
  body TEXT NOT NULL,
  status VARCHAR(24) NOT NULL DEFAULT 'submitted',
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  KEY portal_ban_appeals_steam_status_created (steam_id, status, created_at)
);

CREATE TABLE IF NOT EXISTS portal_appeal_messages (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  appeal_id BIGINT UNSIGNED NOT NULL,
  author_type VARCHAR(16) NOT NULL,
  author_id VARCHAR(64) NOT NULL,
  body TEXT NOT NULL,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  KEY portal_appeal_messages_appeal_created (appeal_id, created_at)
);

CREATE TABLE IF NOT EXISTS portal_role_policies (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  discord_guild_id VARCHAR(32) NOT NULL,
  discord_role_id VARCHAR(32) NOT NULL,
  minimum_points INT NULL,
  required_vip_group VARCHAR(64) NULL,
  required_admin_group VARCHAR(64) NULL,
  enabled BOOLEAN NOT NULL DEFAULT TRUE,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  UNIQUE KEY portal_role_policies_guild_role_unique (discord_guild_id, discord_role_id)
);

CREATE TABLE IF NOT EXISTS portal_outbox (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  event_type VARCHAR(64) NOT NULL,
  target_steam_id VARCHAR(17) NULL,
  payload JSON NOT NULL,
  status VARCHAR(24) NOT NULL DEFAULT 'pending',
  attempts INT NOT NULL DEFAULT 0,
  available_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  processed_at TIMESTAMP NULL,
  PRIMARY KEY (id),
  KEY portal_outbox_status_available (status, available_at)
);

CREATE TABLE IF NOT EXISTS portal_audit_events (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  actor_type VARCHAR(16) NOT NULL,
  actor_id VARCHAR(64) NOT NULL,
  action VARCHAR(80) NOT NULL,
  target_type VARCHAR(32) NOT NULL,
  target_id VARCHAR(64) NOT NULL,
  metadata JSON NULL,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  KEY portal_audit_target (target_type, target_id, created_at)
);
