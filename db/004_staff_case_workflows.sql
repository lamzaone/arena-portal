-- Run this file against PORTAL_DATABASE_URL after 003_portal_outbox_bridge.sql.
-- Adds staff-facing appeal/ticket resolution and screenshot storage.

ALTER TABLE portal_ban_appeals
  ADD COLUMN IF NOT EXISTS closed_by VARCHAR(17) NULL AFTER status,
  ADD COLUMN IF NOT EXISTS closed_at TIMESTAMP NULL AFTER closed_by;

ALTER TABLE portal_tickets
  ADD COLUMN IF NOT EXISTS closed_by VARCHAR(17) NULL AFTER status,
  ADD COLUMN IF NOT EXISTS closed_at TIMESTAMP NULL AFTER closed_by;

CREATE TABLE IF NOT EXISTS portal_case_attachments (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  case_type VARCHAR(16) NOT NULL,
  case_id BIGINT UNSIGNED NOT NULL,
  message_id BIGINT UNSIGNED NULL,
  file_name VARCHAR(180) NOT NULL,
  content_type VARCHAR(96) NOT NULL,
  file_data MEDIUMBLOB NOT NULL,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  KEY portal_case_attachments_case_message (case_type, case_id, message_id)
);
