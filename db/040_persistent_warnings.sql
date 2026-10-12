-- PORTAL_DATABASE_URL only. UTC instants are stored as epoch milliseconds.
-- Apply locally/at deployment; this migration never changes a player's access.
CREATE TABLE IF NOT EXISTS portal_warnings (
  id CHAR(36) NOT NULL PRIMARY KEY,
  steam_id VARCHAR(20) NOT NULL,
  player_name VARCHAR(128) NOT NULL,
  server_guid CHAR(36) NOT NULL,
  reason VARCHAR(500) NOT NULL,
  issuer_steam_id VARCHAR(20) NOT NULL,
  issuer_name VARCHAR(128) NOT NULL,
  issued_at BIGINT NOT NULL,
  expires_at BIGINT NOT NULL,
  acknowledged_at BIGINT NULL,
  revoked_at BIGINT NULL,
  revoked_by VARCHAR(20) NULL,
  revoke_reason VARCHAR(500) NULL,
  KEY portal_warnings_player (steam_id, server_guid, issued_at),
  KEY portal_warnings_delivery (server_guid, revoked_at, acknowledged_at, expires_at)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
