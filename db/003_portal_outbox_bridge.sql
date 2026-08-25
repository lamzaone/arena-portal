-- Run against PORTAL_DATABASE_URL after 001_portal.sql.
-- Adds safe claim and diagnostic fields for the Swiftly portal bridge.

ALTER TABLE portal_outbox
  ADD COLUMN IF NOT EXISTS locked_by VARCHAR(96) NULL AFTER attempts,
  ADD COLUMN IF NOT EXISTS locked_at TIMESTAMP NULL AFTER locked_by,
  ADD COLUMN IF NOT EXISTS last_error VARCHAR(500) NULL AFTER processed_at,
  ADD COLUMN IF NOT EXISTS result_message VARCHAR(500) NULL AFTER last_error,
  ADD KEY IF NOT EXISTS portal_outbox_processing_lock (status, locked_at);
