-- Apply after the economy schema exists, before enabling large Token grants.
-- Stop economy writers during deployment, back up the database, run this file,
-- then deploy the matching portal and TAPPED.Inventory plugin before resuming.
-- TAPPED.Inventory also performs this upgrade under its startup schema lock.
-- MySQL DDL commits independently: rerunning after interruption is safe.
-- Existing values, numeric defaults, nullability, CHECKs and audit triggers stay intact.
-- Wallets use the full unsigned 64-bit range; ledger deltas need both signs.
-- Lifetime turnover is wider because repeated credits/debits can exceed one wallet.
-- Other Token amounts (wagers, trades, redeem rewards and prices) are already BIGINT UNSIGNED.

SET @tapped_wallet_previous_sql_mode = @@SESSION.sql_mode;
SET SESSION sql_mode = CONCAT(@tapped_wallet_previous_sql_mode, ',STRICT_ALL_TABLES');

SET @tapped_wallet_ddl = (
  SELECT CONCAT('ALTER TABLE `portal_token_accounts` ', GROUP_CONCAT(
    CONCAT('MODIFY COLUMN `', c.COLUMN_NAME, '` ', expected.target_type,
      IF(c.IS_NULLABLE = 'YES', ' NULL', ' NOT NULL'),
      IF(c.COLUMN_DEFAULT IS NULL, '', CONCAT(' DEFAULT ', c.COLUMN_DEFAULT)))
    ORDER BY c.ORDINAL_POSITION SEPARATOR ', '))
  FROM information_schema.columns c
  JOIN (
    SELECT 'balance' AS column_name, 'BIGINT UNSIGNED' AS target_type, 20 AS target_precision
    UNION ALL SELECT 'lifetime_earned', 'DECIMAL(65,0)', 65
    UNION ALL SELECT 'lifetime_spent', 'DECIMAL(65,0)', 65
  ) expected ON expected.column_name = c.COLUMN_NAME
  WHERE c.TABLE_SCHEMA = DATABASE() AND c.TABLE_NAME = 'portal_token_accounts'
    AND NOT (
      (expected.target_type = 'BIGINT UNSIGNED' AND c.DATA_TYPE = 'bigint' AND c.COLUMN_TYPE LIKE '%unsigned%')
      OR (expected.target_type <> 'BIGINT UNSIGNED' AND c.DATA_TYPE = 'decimal'
        AND c.NUMERIC_PRECISION = expected.target_precision AND c.NUMERIC_SCALE = 0
        AND c.COLUMN_TYPE NOT LIKE '%unsigned%')
    )
);
SET @tapped_wallet_ddl = COALESCE(@tapped_wallet_ddl, 'DO 0');
PREPARE tapped_wallet_statement FROM @tapped_wallet_ddl;
EXECUTE tapped_wallet_statement;
DEALLOCATE PREPARE tapped_wallet_statement;

SET @tapped_wallet_ddl = (
  SELECT CONCAT('ALTER TABLE `portal_token_ledger` ', GROUP_CONCAT(
    CONCAT('MODIFY COLUMN `', c.COLUMN_NAME, '` ', expected.target_type,
      IF(c.IS_NULLABLE = 'YES', ' NULL', ' NOT NULL'),
      IF(c.COLUMN_DEFAULT IS NULL, '', CONCAT(' DEFAULT ', c.COLUMN_DEFAULT)))
    ORDER BY c.ORDINAL_POSITION SEPARATOR ', '))
  FROM information_schema.columns c
  JOIN (
    SELECT 'delta' AS column_name, 'DECIMAL(20,0)' AS target_type
    UNION ALL SELECT 'balance_after', 'BIGINT UNSIGNED'
  ) expected ON expected.column_name = c.COLUMN_NAME
  WHERE c.TABLE_SCHEMA = DATABASE() AND c.TABLE_NAME = 'portal_token_ledger'
    AND NOT (
      (expected.target_type = 'BIGINT UNSIGNED' AND c.DATA_TYPE = 'bigint' AND c.COLUMN_TYPE LIKE '%unsigned%')
      OR (expected.target_type <> 'BIGINT UNSIGNED' AND c.DATA_TYPE = 'decimal'
        AND c.NUMERIC_PRECISION = 20 AND c.NUMERIC_SCALE = 0
        AND c.COLUMN_TYPE NOT LIKE '%unsigned%')
    )
);
SET @tapped_wallet_ddl = COALESCE(@tapped_wallet_ddl, 'DO 0');
PREPARE tapped_wallet_statement FROM @tapped_wallet_ddl;
EXECUTE tapped_wallet_statement;
DEALLOCATE PREPARE tapped_wallet_statement;

SET SESSION sql_mode = @tapped_wallet_previous_sql_mode;
