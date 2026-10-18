-- Run against the portal database. Safe to reapply; existing cases default to normal.
CREATE TABLE IF NOT EXISTS portal_case_priorities (
  case_type ENUM('appeal', 'ticket') NOT NULL,
  case_id BIGINT UNSIGNED NOT NULL,
  priority ENUM('low', 'normal', 'high', 'urgent') NOT NULL DEFAULT 'normal',
  updated_by VARCHAR(17) NOT NULL,
  updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (case_type, case_id),
  KEY portal_case_priorities_queue (case_type, priority, case_id)
);
