-- PORTAL database only. Requires 001, 012 and 027; no game-table writes.
CREATE TABLE IF NOT EXISTS portal_discord_group_roles (
  discord_guild_id VARCHAR(32) NOT NULL,
  group_id BIGINT UNSIGNED NOT NULL,
  discord_role_id VARCHAR(32) NOT NULL,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (discord_guild_id, group_id),
  UNIQUE KEY portal_discord_managed_role (discord_guild_id, discord_role_id)
) ENGINE = InnoDB;

CREATE TABLE IF NOT EXISTS portal_discord_notifications (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  event_type VARCHAR(64) NOT NULL,
  title VARCHAR(256) NOT NULL,
  body TEXT NOT NULL,
  target_steam_id VARCHAR(17) NULL,
  target_path VARCHAR(512) NULL,
  status VARCHAR(24) NOT NULL DEFAULT 'pending',
  attempts INT NOT NULL DEFAULT 0,
  available_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  lease_token CHAR(64) NULL,
  lease_expires_at DATETIME NULL,
  discord_message_id VARCHAR(32) NULL,
  last_error VARCHAR(512) NULL,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  processed_at DATETIME NULL,
  PRIMARY KEY (id),
  KEY portal_discord_pending (status, available_at, id),
  KEY portal_discord_expired_lease (status, lease_expires_at)
) ENGINE = InnoDB;
