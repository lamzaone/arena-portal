-- Run this migration against PORTAL_DATABASE_URL after 020_identity_group_listings.sql.
-- Operation rows are short-lived idempotency receipts, not canonical economy
-- history. Canonical relationships remain in the FK-backed ledger, inventory,
-- opening, trade, and audit tables.

ALTER TABLE portal_economy_operations
  ADD INDEX IF NOT EXISTS portal_economy_operations_completed_retention
    (status, completed_at);
