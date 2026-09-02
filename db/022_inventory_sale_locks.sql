-- Run this migration against PORTAL_DATABASE_URL after 021_economy_operation_retention.sql.
-- Sale locks are independent from the inventory lifecycle: locked items remain
-- available for loadouts, trades, customisation, and crate opening.

ALTER TABLE portal_inventory_items
  ADD COLUMN IF NOT EXISTS sale_locked BOOLEAN NOT NULL DEFAULT FALSE AFTER tradable,
  ADD INDEX IF NOT EXISTS portal_inventory_items_owner_sale_lock_browse
    (owner_steam_id, sale_locked, state, acquired_at, id);
