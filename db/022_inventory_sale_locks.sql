-- Run this migration against PORTAL_DATABASE_URL after 021_economy_operation_retention.sql.
-- Sale locks are independent from the inventory lifecycle: locked items remain
-- available for loadouts, trades, customisation, and crate opening.

SET @portal_inventory_sale_locked_column_exists = (
  SELECT COUNT(*)
  FROM information_schema.COLUMNS
  WHERE TABLE_SCHEMA = DATABASE()
    AND TABLE_NAME = 'portal_inventory_items'
    AND COLUMN_NAME = 'sale_locked'
);
SET @portal_inventory_sale_locked_column_sql = IF(
  @portal_inventory_sale_locked_column_exists > 0,
  'SELECT 1',
  'ALTER TABLE portal_inventory_items ADD COLUMN sale_locked BOOLEAN NOT NULL DEFAULT FALSE AFTER tradable'
);
PREPARE portal_inventory_sale_locked_column_statement
  FROM @portal_inventory_sale_locked_column_sql;
EXECUTE portal_inventory_sale_locked_column_statement;
DEALLOCATE PREPARE portal_inventory_sale_locked_column_statement;

SET @portal_inventory_sale_lock_browse_index_exists = (
  SELECT COUNT(DISTINCT INDEX_NAME)
  FROM information_schema.STATISTICS
  WHERE TABLE_SCHEMA = DATABASE()
    AND TABLE_NAME = 'portal_inventory_items'
    AND INDEX_NAME = 'portal_inventory_items_owner_sale_lock_browse'
);
SET @portal_inventory_sale_lock_browse_index_sql = IF(
  @portal_inventory_sale_lock_browse_index_exists > 0,
  'SELECT 1',
  'ALTER TABLE portal_inventory_items ADD INDEX portal_inventory_items_owner_sale_lock_browse (owner_steam_id, sale_locked, state, acquired_at, id)'
);
PREPARE portal_inventory_sale_lock_browse_index_statement
  FROM @portal_inventory_sale_lock_browse_index_sql;
EXECUTE portal_inventory_sale_lock_browse_index_statement;
DEALLOCATE PREPARE portal_inventory_sale_lock_browse_index_statement;
