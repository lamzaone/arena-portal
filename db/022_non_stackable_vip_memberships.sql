-- Run this migration against PORTAL_DATABASE_URL after
-- 021_economy_operation_retention.sql.
--
-- VIPCore's legacy membership table is keyed by (group, player), so it cannot
-- serialize or constrain a player's cross-tier item conversions. This row is
-- the portal's one-per-player tier/expiry ledger and shared lock. Conversion
-- rates are deliberately not stored here: every activation revalues both
-- tiers from the current canonical marketplace listings.

CREATE TABLE IF NOT EXISTS portal_vip_membership_conversion_state (
  steam_id VARCHAR(17) NOT NULL,
  group_id BIGINT UNSIGNED NOT NULL,
  entitlement_expires_at TIMESTAMP NULL DEFAULT NULL,
  native_suppressed_until TIMESTAMP NULL DEFAULT NULL,
  native_suppressed_permanently BOOLEAN NOT NULL DEFAULT FALSE,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (steam_id),
  KEY portal_vip_conversion_state_group (group_id, entitlement_expires_at, steam_id),
  CONSTRAINT portal_vip_conversion_state_group_fk FOREIGN KEY (group_id) REFERENCES portal_identity_groups (id) ON DELETE RESTRICT
) ENGINE=InnoDB DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- Safe to rerun after an earlier draft of 022: frozen-value fields are no
-- longer authoritative and their old CHECK would reject live-rate rows.
-- Oracle MySQL 8.0.16 does not support IF EXISTS on these ALTER clauses, so
-- guard each cleanup through INFORMATION_SCHEMA instead.
SET @vip_conversion_shape_exists = (
  SELECT COUNT(*)
  FROM information_schema.TABLE_CONSTRAINTS
  WHERE CONSTRAINT_SCHEMA = DATABASE()
    AND TABLE_NAME = 'portal_vip_membership_conversion_state'
    AND CONSTRAINT_NAME = 'portal_vip_conversion_state_shape'
    AND CONSTRAINT_TYPE = 'CHECK'
);
SET @vip_conversion_shape_sql = IF(
  @vip_conversion_shape_exists > 0,
  'ALTER TABLE portal_vip_membership_conversion_state DROP CHECK portal_vip_conversion_state_shape',
  'SELECT 1'
);
PREPARE vip_conversion_shape_statement FROM @vip_conversion_shape_sql;
EXECUTE vip_conversion_shape_statement;
DEALLOCATE PREPARE vip_conversion_shape_statement;

SET @vip_remaining_value_exists = (
  SELECT COUNT(*)
  FROM information_schema.COLUMNS
  WHERE TABLE_SCHEMA = DATABASE()
    AND TABLE_NAME = 'portal_vip_membership_conversion_state'
    AND COLUMN_NAME = 'remaining_value_micros'
);
SET @vip_remaining_value_sql = IF(
  @vip_remaining_value_exists > 0,
  'ALTER TABLE portal_vip_membership_conversion_state DROP COLUMN remaining_value_micros',
  'SELECT 1'
);
PREPARE vip_remaining_value_statement FROM @vip_remaining_value_sql;
EXECUTE vip_remaining_value_statement;
DEALLOCATE PREPARE vip_remaining_value_statement;

SET @vip_sponsor_value_exists = (
  SELECT COUNT(*)
  FROM information_schema.COLUMNS
  WHERE TABLE_SCHEMA = DATABASE()
    AND TABLE_NAME = 'portal_vip_membership_conversion_state'
    AND COLUMN_NAME = 'sponsor_value_micros'
);
SET @vip_sponsor_value_sql = IF(
  @vip_sponsor_value_exists > 0,
  'ALTER TABLE portal_vip_membership_conversion_state DROP COLUMN sponsor_value_micros',
  'SELECT 1'
);
PREPARE vip_sponsor_value_statement FROM @vip_sponsor_value_sql;
EXECUTE vip_sponsor_value_statement;
DEALLOCATE PREPARE vip_sponsor_value_statement;

SET @vip_cross_tier_locked_exists = (
  SELECT COUNT(*)
  FROM information_schema.COLUMNS
  WHERE TABLE_SCHEMA = DATABASE()
    AND TABLE_NAME = 'portal_vip_membership_conversion_state'
    AND COLUMN_NAME = 'cross_tier_locked'
);
SET @vip_cross_tier_locked_sql = IF(
  @vip_cross_tier_locked_exists > 0,
  'ALTER TABLE portal_vip_membership_conversion_state DROP COLUMN cross_tier_locked',
  'SELECT 1'
);
PREPARE vip_cross_tier_locked_statement FROM @vip_cross_tier_locked_sql;
EXECUTE vip_cross_tier_locked_statement;
DEALLOCATE PREPARE vip_cross_tier_locked_statement;

SET @vip_accounted_at_exists = (
  SELECT COUNT(*)
  FROM information_schema.COLUMNS
  WHERE TABLE_SCHEMA = DATABASE()
    AND TABLE_NAME = 'portal_vip_membership_conversion_state'
    AND COLUMN_NAME = 'accounted_at'
);
SET @vip_accounted_at_sql = IF(
  @vip_accounted_at_exists > 0,
  'ALTER TABLE portal_vip_membership_conversion_state DROP COLUMN accounted_at',
  'SELECT 1'
);
PREPARE vip_accounted_at_statement FROM @vip_accounted_at_sql;
EXECUTE vip_accounted_at_statement;
DEALLOCATE PREPARE vip_accounted_at_statement;

SET @vip_native_suppressed_until_exists = (
  SELECT COUNT(*)
  FROM information_schema.COLUMNS
  WHERE TABLE_SCHEMA = DATABASE()
    AND TABLE_NAME = 'portal_vip_membership_conversion_state'
    AND COLUMN_NAME = 'native_suppressed_until'
);
SET @vip_native_suppressed_until_sql = IF(
  @vip_native_suppressed_until_exists > 0,
  'SELECT 1',
  'ALTER TABLE portal_vip_membership_conversion_state ADD COLUMN native_suppressed_until TIMESTAMP NULL DEFAULT NULL AFTER entitlement_expires_at'
);
PREPARE vip_native_suppressed_until_statement FROM @vip_native_suppressed_until_sql;
EXECUTE vip_native_suppressed_until_statement;
DEALLOCATE PREPARE vip_native_suppressed_until_statement;

SET @vip_native_suppressed_permanently_exists = (
  SELECT COUNT(*)
  FROM information_schema.COLUMNS
  WHERE TABLE_SCHEMA = DATABASE()
    AND TABLE_NAME = 'portal_vip_membership_conversion_state'
    AND COLUMN_NAME = 'native_suppressed_permanently'
);
SET @vip_native_suppressed_permanently_sql = IF(
  @vip_native_suppressed_permanently_exists > 0,
  'SELECT 1',
  'ALTER TABLE portal_vip_membership_conversion_state ADD COLUMN native_suppressed_permanently BOOLEAN NOT NULL DEFAULT FALSE AFTER native_suppressed_until'
);
PREPARE vip_native_suppressed_permanently_statement FROM @vip_native_suppressed_permanently_sql;
EXECUTE vip_native_suppressed_permanently_statement;
DEALLOCATE PREPARE vip_native_suppressed_permanently_statement;

-- Adopt legacy portal VIP memberships that predate the one-tier ledger. A
-- player is safe to backfill only when exactly one active VIPCore group is
-- present. Conflicting multi-tier accounts intentionally receive no ledger:
-- ledger-authoritative runtime reads fail them closed until staff chooses the
-- surviving exact membership in Connected Groups.
INSERT IGNORE INTO portal_vip_membership_conversion_state (
  steam_id,
  group_id,
  entitlement_expires_at,
  native_suppressed_until,
  native_suppressed_permanently
)
SELECT
  membership.steam_id,
  MIN(membership.group_id) AS group_id,
  CASE
    WHEN MAX(membership.expires_at IS NULL) = 1 THEN NULL
    ELSE MAX(membership.expires_at)
  END AS entitlement_expires_at,
  CASE
    WHEN MAX(membership.expires_at IS NULL) = 1 THEN NULL
    ELSE MAX(membership.expires_at)
  END AS native_suppressed_until,
  MAX(membership.expires_at IS NULL) = 1 AS native_suppressed_permanently
FROM portal_identity_group_memberships AS membership
INNER JOIN portal_identity_groups AS identity_group
  ON identity_group.id = membership.group_id
 AND identity_group.source_type = 'vipcore'
 AND identity_group.enabled = TRUE
 AND identity_group.external_key IS NOT NULL
 AND identity_group.external_key <> ''
WHERE membership.revoked_at IS NULL
  AND membership.starts_at <= CURRENT_TIMESTAMP
  AND (membership.expires_at IS NULL OR membership.expires_at > CURRENT_TIMESTAMP)
GROUP BY membership.steam_id
HAVING COUNT(DISTINCT membership.group_id) = 1;

-- Remove the retired immutable-price hint from catalogue projections so new
-- inventory grants do not keep copying a value that activation ignores.
UPDATE portal_economy_catalogue AS catalogue
INNER JOIN portal_identity_group_listings AS listing
  ON listing.catalogue_id = catalogue.id
SET catalogue.metadata = JSON_REMOVE(
  COALESCE(catalogue.metadata, JSON_OBJECT()),
  '$.membershipConversionValueTokens'
)
WHERE catalogue.item_type = 'vip_membership';
