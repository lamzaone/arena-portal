-- Run this migration against PORTAL_DATABASE_URL after
-- 024_identity_group_rename_saga.sql.
--
-- The arena database becomes authoritative for groups and memberships, while
-- this database continues to own catalogue listings, inventory instances,
-- wallets, marketplace history, and inventory rewards. These nullable bridge
-- columns retain every legacy portal relationship for a rolling migration;
-- no existing identity row or foreign key is removed here.

SET @arena_listing_group_uuid_column_exists = (
  SELECT COUNT(*)
  FROM information_schema.COLUMNS
  WHERE TABLE_SCHEMA = DATABASE()
    AND TABLE_NAME = 'portal_identity_group_listings'
    AND COLUMN_NAME = 'arena_group_uuid'
);
SET @arena_listing_group_uuid_column_sql = IF(
  @arena_listing_group_uuid_column_exists > 0,
  'SELECT 1',
  'ALTER TABLE portal_identity_group_listings ADD COLUMN arena_group_uuid CHAR(36) CHARACTER SET ascii COLLATE ascii_bin NULL AFTER group_id'
);
PREPARE arena_listing_group_uuid_column_statement
  FROM @arena_listing_group_uuid_column_sql;
EXECUTE arena_listing_group_uuid_column_statement;
DEALLOCATE PREPARE arena_listing_group_uuid_column_statement;

SET @arena_listing_group_key_column_exists = (
  SELECT COUNT(*)
  FROM information_schema.COLUMNS
  WHERE TABLE_SCHEMA = DATABASE()
    AND TABLE_NAME = 'portal_identity_group_listings'
    AND COLUMN_NAME = 'arena_group_key'
);
SET @arena_listing_group_key_column_sql = IF(
  @arena_listing_group_key_column_exists > 0,
  'SELECT 1',
  'ALTER TABLE portal_identity_group_listings ADD COLUMN arena_group_key VARCHAR(64) CHARACTER SET ascii COLLATE ascii_general_ci NULL AFTER arena_group_uuid'
);
PREPARE arena_listing_group_key_column_statement
  FROM @arena_listing_group_key_column_sql;
EXECUTE arena_listing_group_key_column_statement;
DEALLOCATE PREPARE arena_listing_group_key_column_statement;

SET @arena_listing_scope_uuid_column_exists = (
  SELECT COUNT(*)
  FROM information_schema.COLUMNS
  WHERE TABLE_SCHEMA = DATABASE()
    AND TABLE_NAME = 'portal_identity_group_listings'
    AND COLUMN_NAME = 'arena_scope_uuid'
);
SET @arena_listing_scope_uuid_column_sql = IF(
  @arena_listing_scope_uuid_column_exists > 0,
  'SELECT 1',
  'ALTER TABLE portal_identity_group_listings ADD COLUMN arena_scope_uuid CHAR(36) CHARACTER SET ascii COLLATE ascii_bin NULL AFTER arena_group_key'
);
PREPARE arena_listing_scope_uuid_column_statement
  FROM @arena_listing_scope_uuid_column_sql;
EXECUTE arena_listing_scope_uuid_column_statement;
DEALLOCATE PREPARE arena_listing_scope_uuid_column_statement;

SET @arena_listing_group_version_column_exists = (
  SELECT COUNT(*)
  FROM information_schema.COLUMNS
  WHERE TABLE_SCHEMA = DATABASE()
    AND TABLE_NAME = 'portal_identity_group_listings'
    AND COLUMN_NAME = 'arena_group_row_version'
);
SET @arena_listing_group_version_column_sql = IF(
  @arena_listing_group_version_column_exists > 0,
  'SELECT 1',
  'ALTER TABLE portal_identity_group_listings ADD COLUMN arena_group_row_version BIGINT UNSIGNED NULL AFTER arena_scope_uuid'
);
PREPARE arena_listing_group_version_column_statement
  FROM @arena_listing_group_version_column_sql;
EXECUTE arena_listing_group_version_column_statement;
DEALLOCATE PREPARE arena_listing_group_version_column_statement;

-- Group rewards remain portal-owned because they manufacture and revoke
-- portal inventory. The UUID is the durable cross-database target; group_id
-- remains in place until the legacy identity tables reach end of life.
SET @arena_reward_group_uuid_column_exists = (
  SELECT COUNT(*)
  FROM information_schema.COLUMNS
  WHERE TABLE_SCHEMA = DATABASE()
    AND TABLE_NAME = 'portal_identity_group_rewards'
    AND COLUMN_NAME = 'arena_group_uuid'
);
SET @arena_reward_group_uuid_column_sql = IF(
  @arena_reward_group_uuid_column_exists > 0,
  'SELECT 1',
  'ALTER TABLE portal_identity_group_rewards ADD COLUMN arena_group_uuid CHAR(36) CHARACTER SET ascii COLLATE ascii_bin NULL AFTER group_id'
);
PREPARE arena_reward_group_uuid_column_statement
  FROM @arena_reward_group_uuid_column_sql;
EXECUTE arena_reward_group_uuid_column_statement;
DEALLOCATE PREPARE arena_reward_group_uuid_column_statement;

SET @arena_reward_group_key_column_exists = (
  SELECT COUNT(*)
  FROM information_schema.COLUMNS
  WHERE TABLE_SCHEMA = DATABASE()
    AND TABLE_NAME = 'portal_identity_group_rewards'
    AND COLUMN_NAME = 'arena_group_key'
);
SET @arena_reward_group_key_column_sql = IF(
  @arena_reward_group_key_column_exists > 0,
  'SELECT 1',
  'ALTER TABLE portal_identity_group_rewards ADD COLUMN arena_group_key VARCHAR(64) CHARACTER SET ascii COLLATE ascii_general_ci NULL AFTER arena_group_uuid'
);
PREPARE arena_reward_group_key_column_statement
  FROM @arena_reward_group_key_column_sql;
EXECUTE arena_reward_group_key_column_statement;
DEALLOCATE PREPARE arena_reward_group_key_column_statement;

SET @arena_reward_scope_uuid_column_exists = (
  SELECT COUNT(*)
  FROM information_schema.COLUMNS
  WHERE TABLE_SCHEMA = DATABASE()
    AND TABLE_NAME = 'portal_identity_group_rewards'
    AND COLUMN_NAME = 'arena_scope_uuid'
);
SET @arena_reward_scope_uuid_column_sql = IF(
  @arena_reward_scope_uuid_column_exists > 0,
  'SELECT 1',
  'ALTER TABLE portal_identity_group_rewards ADD COLUMN arena_scope_uuid CHAR(36) CHARACTER SET ascii COLLATE ascii_bin NULL AFTER arena_group_key'
);
PREPARE arena_reward_scope_uuid_column_statement
  FROM @arena_reward_scope_uuid_column_sql;
EXECUTE arena_reward_scope_uuid_column_statement;
DEALLOCATE PREPARE arena_reward_scope_uuid_column_statement;

-- Guard indexes through INFORMATION_SCHEMA so this file can be rerun on both
-- MariaDB and MySQL versions that do not share CREATE INDEX IF NOT EXISTS.
SET @arena_listing_group_uuid_index_exists = (
  SELECT COUNT(*)
  FROM information_schema.STATISTICS
  WHERE TABLE_SCHEMA = DATABASE()
    AND TABLE_NAME = 'portal_identity_group_listings'
    AND INDEX_NAME = 'portal_group_listings_arena_group'
);
SET @arena_listing_group_uuid_index_sql = IF(
  @arena_listing_group_uuid_index_exists > 0,
  'SELECT 1',
  'CREATE INDEX portal_group_listings_arena_group ON portal_identity_group_listings (arena_group_uuid, arena_scope_uuid, enabled, id)'
);
PREPARE arena_listing_group_uuid_index_statement
  FROM @arena_listing_group_uuid_index_sql;
EXECUTE arena_listing_group_uuid_index_statement;
DEALLOCATE PREPARE arena_listing_group_uuid_index_statement;

SET @arena_reward_group_uuid_index_exists = (
  SELECT COUNT(*)
  FROM information_schema.STATISTICS
  WHERE TABLE_SCHEMA = DATABASE()
    AND TABLE_NAME = 'portal_identity_group_rewards'
    AND INDEX_NAME = 'portal_group_rewards_arena_group'
);
SET @arena_reward_group_uuid_index_sql = IF(
  @arena_reward_group_uuid_index_exists > 0,
  'SELECT 1',
  'CREATE INDEX portal_group_rewards_arena_group ON portal_identity_group_rewards (arena_group_uuid, arena_scope_uuid, enabled, id)'
);
PREPARE arena_reward_group_uuid_index_statement
  FROM @arena_reward_group_uuid_index_sql;
EXECUTE arena_reward_group_uuid_index_statement;
DEALLOCATE PREPARE arena_reward_group_uuid_index_statement;

-- One trusted projection joins a portal catalogue product to its arena target.
-- Inventory attributes remain the immutable purchase/grant snapshot; this row
-- is the live target checked before preparing a new activation command.
CREATE TABLE IF NOT EXISTS portal_arena_group_catalogue_targets (
  catalogue_id BIGINT UNSIGNED NOT NULL,
  listing_id BIGINT UNSIGNED NULL,
  legacy_portal_group_id BIGINT UNSIGNED NULL,
  arena_group_uuid CHAR(36) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
  arena_group_key VARCHAR(64) CHARACTER SET ascii COLLATE ascii_general_ci
    NOT NULL,
  arena_scope_uuid CHAR(36) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
  arena_group_type ENUM('admin', 'vip', 'custom') NOT NULL,
  arena_group_row_version BIGINT UNSIGNED NOT NULL,
  duration_minutes INT UNSIGNED NOT NULL,
  target_snapshot JSON NOT NULL,
  enabled BOOLEAN NOT NULL DEFAULT TRUE,
  created_at DATETIME(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
  updated_at DATETIME(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6)
    ON UPDATE CURRENT_TIMESTAMP(6),
  PRIMARY KEY (catalogue_id),
  UNIQUE KEY portal_arena_group_targets_listing_unique (listing_id),
  KEY portal_arena_group_targets_group
    (arena_group_uuid, arena_scope_uuid, enabled, catalogue_id),
  CONSTRAINT portal_arena_group_targets_catalogue_fk FOREIGN KEY (catalogue_id)
    REFERENCES portal_economy_catalogue (id) ON DELETE RESTRICT,
  CONSTRAINT portal_arena_group_targets_listing_fk FOREIGN KEY (listing_id)
    REFERENCES portal_identity_group_listings (id) ON DELETE RESTRICT,
  CONSTRAINT portal_arena_group_targets_group_uuid_valid CHECK (
    arena_group_uuid REGEXP '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
  ),
  CONSTRAINT portal_arena_group_targets_scope_uuid_valid CHECK (
    arena_scope_uuid REGEXP '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
  ),
  CONSTRAINT portal_arena_group_targets_group_key_valid CHECK (
    arena_group_key REGEXP '^[a-z0-9][a-z0-9._:-]{0,63}$'
  ),
  CONSTRAINT portal_arena_group_targets_version_positive CHECK (
    arena_group_row_version >= 1
  ),
  CONSTRAINT portal_arena_group_targets_duration_valid CHECK (
    duration_minutes BETWEEN 0 AND 525600
  ),
  CONSTRAINT portal_arena_group_targets_snapshot_valid CHECK (
    JSON_VALID(target_snapshot)
  )
) ENGINE=InnoDB DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- Cross-host membership delivery is a durable saga, not a distributed SQL
-- transaction. A job is committed with the inventory reservation before its
-- command is sent. The same command UUID is retried until the arena receipt is
-- known, then portal inventory is finalized in a separate local transaction.
CREATE TABLE IF NOT EXISTS portal_membership_activation_jobs (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  job_uuid CHAR(36) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
  arena_command_uuid CHAR(36) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
  economy_operation_id BIGINT UNSIGNED NOT NULL,
  idempotency_key VARCHAR(128) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
  request_hash CHAR(64) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
  item_id CHAR(36) CHARACTER SET ascii COLLATE ascii_general_ci NOT NULL,
  owner_steam_id VARCHAR(17) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
  catalogue_id BIGINT UNSIGNED NOT NULL,
  listing_id BIGINT UNSIGNED NULL,
  arena_group_uuid CHAR(36) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
  arena_group_key VARCHAR(64) CHARACTER SET ascii COLLATE ascii_general_ci
    NOT NULL,
  arena_scope_uuid CHAR(36) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
  arena_group_type ENUM('admin', 'vip', 'custom') NOT NULL,
  arena_group_row_version BIGINT UNSIGNED NOT NULL,
  duration_minutes INT UNSIGNED NOT NULL,
  request_payload JSON NOT NULL,
  rate_snapshot JSON NULL,
  rate_snapshot_hash CHAR(64) CHARACTER SET ascii COLLATE ascii_bin NULL,
  rate_snapshot_expires_at DATETIME(6) NULL,
  status ENUM(
    'prepared',
    'dispatching',
    'retry_wait',
    'arena_applied',
    'finalizing',
    'completed',
    'rejected',
    'manual_review'
  ) NOT NULL DEFAULT 'prepared',
  -- The writer copies item_id here on insert and clears it atomically with a
  -- durable rejection. MariaDB 10.5 does not allow the equivalent indexed
  -- generated expression over this ENUM. Every other state keeps the item
  -- reserved and unique.
  reserved_item_id CHAR(36) CHARACTER SET ascii COLLATE ascii_general_ci NULL,
  attempts INT UNSIGNED NOT NULL DEFAULT 0,
  available_at DATETIME(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
  locked_by VARCHAR(96) NULL,
  locked_at DATETIME(6) NULL,
  arena_receipt JSON NULL,
  result_json JSON NULL,
  error_code VARCHAR(64) CHARACTER SET ascii COLLATE ascii_general_ci NULL,
  last_error VARCHAR(500) NULL,
  arena_applied_at DATETIME(6) NULL,
  completed_at DATETIME(6) NULL,
  created_at DATETIME(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
  updated_at DATETIME(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6)
    ON UPDATE CURRENT_TIMESTAMP(6),
  PRIMARY KEY (id),
  UNIQUE KEY portal_membership_jobs_job_uuid_unique (job_uuid),
  UNIQUE KEY portal_membership_jobs_command_uuid_unique (arena_command_uuid),
  UNIQUE KEY portal_membership_jobs_operation_unique (economy_operation_id),
  UNIQUE KEY portal_membership_jobs_idempotency_unique (idempotency_key),
  UNIQUE KEY portal_membership_jobs_reserved_item_unique (reserved_item_id),
  KEY portal_membership_jobs_request_hash (request_hash),
  KEY portal_membership_jobs_delivery (status, available_at, id),
  KEY portal_membership_jobs_processing (status, locked_at, id),
  KEY portal_membership_jobs_player
    (owner_steam_id, created_at, id),
  KEY portal_membership_jobs_arena_target
    (arena_group_uuid, arena_scope_uuid, status, id),
  CONSTRAINT portal_membership_jobs_operation_fk FOREIGN KEY
    (economy_operation_id)
    REFERENCES portal_economy_operations (id) ON DELETE RESTRICT,
  CONSTRAINT portal_membership_jobs_item_fk FOREIGN KEY (item_id)
    REFERENCES portal_inventory_items (id) ON DELETE RESTRICT,
  CONSTRAINT portal_membership_jobs_catalogue_fk FOREIGN KEY (catalogue_id)
    REFERENCES portal_economy_catalogue (id) ON DELETE RESTRICT,
  CONSTRAINT portal_membership_jobs_listing_fk FOREIGN KEY (listing_id)
    REFERENCES portal_identity_group_listings (id) ON DELETE RESTRICT,
  CONSTRAINT portal_membership_jobs_job_uuid_valid CHECK (
    job_uuid REGEXP '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
  ),
  CONSTRAINT portal_membership_jobs_command_uuid_valid CHECK (
    arena_command_uuid REGEXP '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
  ),
  CONSTRAINT portal_membership_jobs_request_hash_valid CHECK (
    request_hash REGEXP '^[0-9a-f]{64}$'
  ),
  CONSTRAINT portal_membership_jobs_item_uuid_valid CHECK (
    item_id REGEXP '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
  ),
  CONSTRAINT portal_membership_jobs_group_uuid_valid CHECK (
    arena_group_uuid REGEXP '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
  ),
  CONSTRAINT portal_membership_jobs_scope_uuid_valid CHECK (
    arena_scope_uuid REGEXP '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
  ),
  CONSTRAINT portal_membership_jobs_group_key_valid CHECK (
    arena_group_key REGEXP '^[a-z0-9][a-z0-9._:-]{0,63}$'
  ),
  CONSTRAINT portal_membership_jobs_group_version_positive CHECK (
    arena_group_row_version >= 1
  ),
  CONSTRAINT portal_membership_jobs_duration_valid CHECK (
    duration_minutes BETWEEN 0 AND 525600
  ),
  CONSTRAINT portal_membership_jobs_payload_valid CHECK (
    JSON_VALID(request_payload)
  ),
  CONSTRAINT portal_membership_jobs_rate_shape CHECK (
    (
      rate_snapshot IS NULL AND
      rate_snapshot_hash IS NULL AND
      rate_snapshot_expires_at IS NULL
    ) OR
    (
      rate_snapshot IS NOT NULL AND
      JSON_VALID(rate_snapshot) AND
      rate_snapshot_hash REGEXP '^[0-9a-f]{64}$' AND
      rate_snapshot_expires_at IS NOT NULL
    )
  ),
  CONSTRAINT portal_membership_jobs_vip_rate_required CHECK (
    arena_group_type <> 'vip' OR rate_snapshot IS NOT NULL
  ),
  CONSTRAINT portal_membership_jobs_receipt_valid CHECK (
    arena_receipt IS NULL OR JSON_VALID(arena_receipt)
  ),
  CONSTRAINT portal_membership_jobs_result_valid CHECK (
    result_json IS NULL OR JSON_VALID(result_json)
  ),
  CONSTRAINT portal_membership_jobs_reservation_shape CHECK (
    reserved_item_id IS NULL OR reserved_item_id = item_id
  ),
  CONSTRAINT portal_membership_jobs_rejected_releases_item CHECK (
    status <> 'rejected' OR reserved_item_id IS NULL
  )
) ENGINE=InnoDB DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- Rolling-upgrade hardening for preview installations. CREATE TABLE IF NOT
-- EXISTS cannot add the explicit reservation column to an existing table.
-- Generated-column previews are stopped before any data change: MariaDB 10.5
-- rejects the old ENUM-dependent expression, while automatic conversion has
-- different guarantees across engines. Convert such a column explicitly to
-- an ordinary nullable CHAR(36), then rerun this migration.
SET @portal_jobs_reservation_is_generated = (
  SELECT COUNT(*)
  FROM information_schema.COLUMNS
  WHERE TABLE_SCHEMA = DATABASE()
    AND TABLE_NAME = 'portal_membership_activation_jobs'
    AND COLUMN_NAME = 'reserved_item_id'
    AND (
      EXTRA LIKE '%GENERATED%' OR
      COALESCE(GENERATION_EXPRESSION, '') <> ''
    )
);
SET @portal_jobs_generated_guard_sql = IF(
  @portal_jobs_reservation_is_generated = 0,
  'SELECT 1',
  'SELECT 1 FROM `portal_upgrade_blocked__reserved_item_id_is_generated__convert_to_ordinary_char36`'
);
PREPARE portal_jobs_generated_guard_statement
  FROM @portal_jobs_generated_guard_sql;
EXECUTE portal_jobs_generated_guard_statement;
DEALLOCATE PREPARE portal_jobs_generated_guard_statement;

SET @portal_jobs_reservation_column_exists = (
  SELECT COUNT(*)
  FROM information_schema.COLUMNS
  WHERE TABLE_SCHEMA = DATABASE()
    AND TABLE_NAME = 'portal_membership_activation_jobs'
    AND COLUMN_NAME = 'reserved_item_id'
);
SET @portal_jobs_reservation_column_sql = IF(
  @portal_jobs_reservation_column_exists > 0,
  'SELECT 1',
  'ALTER TABLE portal_membership_activation_jobs ADD COLUMN reserved_item_id CHAR(36) CHARACTER SET ascii COLLATE ascii_general_ci NULL AFTER status'
);
PREPARE portal_jobs_reservation_column_statement
  FROM @portal_jobs_reservation_column_sql;
EXECUTE portal_jobs_reservation_column_statement;
DEALLOCATE PREPARE portal_jobs_reservation_column_statement;

-- Backfill uses the immutable inventory item identity. Rejected attempts are
-- deliberately NULL so a later attempt can reserve the item. Any duplicate
-- non-rejected item stops the migration before the unique index is attempted.
SET @portal_jobs_duplicate_reservations = (
  SELECT COUNT(*)
  FROM (
    SELECT item_id
    FROM portal_membership_activation_jobs
    WHERE status <> 'rejected'
    GROUP BY item_id
    HAVING COUNT(*) > 1
  ) AS duplicate_reservations
);
SET @portal_jobs_duplicate_guard_sql = IF(
  @portal_jobs_duplicate_reservations = 0,
  'SELECT 1',
  'SELECT 1 FROM `portal_upgrade_blocked__duplicate_active_inventory_reservations`'
);
PREPARE portal_jobs_duplicate_guard_statement
  FROM @portal_jobs_duplicate_guard_sql;
EXECUTE portal_jobs_duplicate_guard_statement;
DEALLOCATE PREPARE portal_jobs_duplicate_guard_statement;

UPDATE portal_membership_activation_jobs
SET reserved_item_id = CASE
  WHEN status = 'rejected' THEN NULL
  ELSE item_id
END
WHERE NOT (
  reserved_item_id <=> CASE
    WHEN status = 'rejected' THEN NULL
    ELSE item_id
  END
);

SET @portal_jobs_reservation_index_exists = (
  SELECT COUNT(DISTINCT INDEX_NAME)
  FROM information_schema.STATISTICS
  WHERE TABLE_SCHEMA = DATABASE()
    AND TABLE_NAME = 'portal_membership_activation_jobs'
    AND INDEX_NAME = 'portal_membership_jobs_reserved_item_unique'
);
SET @portal_jobs_reservation_index_valid = (
  SELECT COUNT(*)
  FROM (
    SELECT INDEX_NAME
    FROM information_schema.STATISTICS
    WHERE TABLE_SCHEMA = DATABASE()
      AND TABLE_NAME = 'portal_membership_activation_jobs'
      AND INDEX_NAME = 'portal_membership_jobs_reserved_item_unique'
    GROUP BY INDEX_NAME
    HAVING MAX(NON_UNIQUE) = 0
      AND COUNT(*) = 1
      AND MAX(COLUMN_NAME) = 'reserved_item_id'
      AND MAX(SUB_PART IS NULL) = 1
  ) AS valid_reservation_index
);
SET @portal_jobs_reservation_index_guard_sql = IF(
  @portal_jobs_reservation_index_exists = 0 OR
    @portal_jobs_reservation_index_valid = 1,
  'SELECT 1',
  'SELECT 1 FROM `portal_upgrade_blocked__reserved_item_index_has_wrong_shape`'
);
PREPARE portal_jobs_reservation_index_guard_statement
  FROM @portal_jobs_reservation_index_guard_sql;
EXECUTE portal_jobs_reservation_index_guard_statement;
DEALLOCATE PREPARE portal_jobs_reservation_index_guard_statement;

SET @portal_jobs_reservation_index_sql = IF(
  @portal_jobs_reservation_index_exists > 0,
  'SELECT 1',
  'ALTER TABLE portal_membership_activation_jobs ADD UNIQUE INDEX portal_membership_jobs_reserved_item_unique (reserved_item_id)'
);
PREPARE portal_jobs_reservation_index_statement
  FROM @portal_jobs_reservation_index_sql;
EXECUTE portal_jobs_reservation_index_statement;
DEALLOCATE PREPARE portal_jobs_reservation_index_statement;

-- Remove only an exact preview UNIQUE(item_id). The non-unique item index used
-- by the foreign key is retained, while rejected attempts can be preserved and
-- the same restored item can create a new command.
SET @portal_jobs_legacy_unique_drops = (
  SELECT GROUP_CONCAT(
    CONCAT('DROP INDEX `', REPLACE(INDEX_NAME, '`', '``'), '`')
    ORDER BY INDEX_NAME SEPARATOR ', '
  )
  FROM (
    SELECT INDEX_NAME
    FROM information_schema.STATISTICS
    WHERE TABLE_SCHEMA = DATABASE()
      AND TABLE_NAME = 'portal_membership_activation_jobs'
      AND INDEX_NAME <> 'PRIMARY'
    GROUP BY INDEX_NAME
    HAVING MAX(NON_UNIQUE) = 0
      AND COUNT(*) = 1
      AND MAX(COLUMN_NAME) = 'item_id'
  ) AS legacy_unique_indexes
);
SET @portal_jobs_legacy_unique_sql = IF(
  @portal_jobs_legacy_unique_drops IS NULL,
  'SELECT 1',
  CONCAT(
    'ALTER TABLE portal_membership_activation_jobs ',
    @portal_jobs_legacy_unique_drops
  )
);
PREPARE portal_jobs_legacy_unique_statement
  FROM @portal_jobs_legacy_unique_sql;
EXECUTE portal_jobs_legacy_unique_statement;
DEALLOCATE PREPARE portal_jobs_legacy_unique_statement;

-- Portal reward reconciliation consumes arena outbox events at least once.
-- This local receipt makes inventory effects exactly-once from the portal's
-- perspective and gives the arena dispatcher a durable acknowledgement.
CREATE TABLE IF NOT EXISTS portal_arena_membership_event_receipts (
  arena_event_uuid CHAR(36) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
  event_type VARCHAR(80) CHARACTER SET ascii COLLATE ascii_general_ci NOT NULL,
  payload_hash CHAR(64) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
  status ENUM('processing', 'completed', 'failed')
    NOT NULL DEFAULT 'processing',
  result_json JSON NULL,
  last_error VARCHAR(500) NULL,
  received_at DATETIME(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
  completed_at DATETIME(6) NULL,
  updated_at DATETIME(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6)
    ON UPDATE CURRENT_TIMESTAMP(6),
  PRIMARY KEY (arena_event_uuid),
  KEY portal_arena_event_receipts_recovery
    (status, updated_at, arena_event_uuid),
  CONSTRAINT portal_arena_event_receipts_uuid_valid CHECK (
    arena_event_uuid REGEXP '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
  ),
  CONSTRAINT portal_arena_event_receipts_type_valid CHECK (
    event_type REGEXP '^[a-z][a-z0-9._:-]{0,79}$'
  ),
  CONSTRAINT portal_arena_event_receipts_hash_valid CHECK (
    payload_hash REGEXP '^[0-9a-f]{64}$'
  ),
  CONSTRAINT portal_arena_event_receipts_result_valid CHECK (
    result_json IS NULL OR JSON_VALID(result_json)
  )
) ENGINE=InnoDB DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- `activation_pending` is appended to the ENUM, preserving every existing
-- ordinal and value. Existing application versions never write it, so this is
-- safe to deploy before the saga worker. Once used, all sale/trade/equip paths
-- must continue requiring state='available', as they do today.
SET @portal_inventory_activation_pending_exists = (
  SELECT COUNT(*)
  FROM information_schema.COLUMNS
  WHERE TABLE_SCHEMA = DATABASE()
    AND TABLE_NAME = 'portal_inventory_items'
    AND COLUMN_NAME = 'state'
    AND LOCATE('''activation_pending''', COLUMN_TYPE) > 0
);
SET @portal_inventory_activation_pending_sql = IF(
  @portal_inventory_activation_pending_exists > 0,
  'SELECT 1',
  'ALTER TABLE portal_inventory_items MODIFY COLUMN state ENUM(''available'', ''escrowed'', ''attached'', ''consumed'', ''revoked'', ''activation_pending'') NOT NULL DEFAULT ''available'''
);
PREPARE portal_inventory_activation_pending_statement
  FROM @portal_inventory_activation_pending_sql;
EXECUTE portal_inventory_activation_pending_statement;
DEALLOCATE PREPARE portal_inventory_activation_pending_statement;
