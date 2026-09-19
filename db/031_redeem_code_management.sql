-- Portal database only. Preserve previous campaigns, claims and reward history.
-- Existing game servers remain compatible: archived codes are also disabled
-- and their public hashes are replaced. Restart creates a fresh campaign ID.
SET @redeem_archive_column_exists = (
  SELECT COUNT(*) FROM information_schema.COLUMNS
  WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'portal_redeem_codes' AND COLUMN_NAME = 'removed_at'
);
SET @redeem_archive_sql = IF(@redeem_archive_column_exists > 0, 'SELECT 1',
  'ALTER TABLE portal_redeem_codes ADD COLUMN removed_at DATETIME NULL DEFAULT NULL');
PREPARE redeem_archive_statement FROM @redeem_archive_sql;
EXECUTE redeem_archive_statement;
DEALLOCATE PREPARE redeem_archive_statement;
