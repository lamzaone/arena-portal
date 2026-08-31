-- Run this migration against PORTAL_DATABASE_URL after
-- 023_database_authoritative_identity_sources.sql.
--
-- Runtime Admins.Core/VIPCore names are mutable, while portal group IDs and
-- owned inventory snapshots are stable. Rename intents bridge the game and
-- portal databases durably; aliases let immutable legacy item snapshots keep
-- resolving to the same group without rewriting inventory under group locks.

CREATE TABLE IF NOT EXISTS portal_identity_group_rename_intents (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  group_id BIGINT UNSIGNED NOT NULL,
  source_type ENUM('admins_core', 'vipcore') NOT NULL,
  previous_external_key VARCHAR(100) NOT NULL,
  next_external_key VARCHAR(100) NOT NULL,
  previous_lookup_key VARCHAR(100) CHARACTER SET utf8mb4 COLLATE utf8mb4_bin NOT NULL,
  next_lookup_key VARCHAR(100) CHARACTER SET utf8mb4 COLLATE utf8mb4_bin NOT NULL,
  status ENUM('pending', 'completed', 'cancelled') NOT NULL DEFAULT 'pending',
  request_key VARCHAR(160) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
  requested_by_steam_id VARCHAR(17) NOT NULL,
  failure_reason VARCHAR(255) NULL,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  completed_at TIMESTAMP NULL DEFAULT NULL,
  cancelled_at TIMESTAMP NULL DEFAULT NULL,
  updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  UNIQUE KEY portal_identity_group_rename_request (source_type, request_key),
  KEY portal_identity_group_rename_recovery (status, id),
  KEY portal_identity_group_rename_group (group_id, status, id),
  CONSTRAINT portal_identity_group_rename_group_fk FOREIGN KEY (group_id)
    REFERENCES portal_identity_groups (id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS portal_identity_group_external_aliases (
  group_id BIGINT UNSIGNED NOT NULL,
  source_type ENUM('admins_core', 'vipcore') NOT NULL,
  alias_external_key VARCHAR(100) NOT NULL,
  alias_lookup_key VARCHAR(100) CHARACTER SET utf8mb4 COLLATE utf8mb4_bin NOT NULL,
  rename_intent_id BIGINT UNSIGNED NULL,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (group_id, alias_lookup_key),
  UNIQUE KEY portal_identity_group_alias_source (source_type, alias_lookup_key),
  KEY portal_identity_group_alias_intent (rename_intent_id),
  CONSTRAINT portal_identity_group_alias_group_fk FOREIGN KEY (group_id)
    REFERENCES portal_identity_groups (id) ON DELETE CASCADE,
  CONSTRAINT portal_identity_group_alias_intent_fk FOREIGN KEY (rename_intent_id)
    REFERENCES portal_identity_group_rename_intents (id) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
