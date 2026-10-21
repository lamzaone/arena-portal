-- Forward-only additive migration. Existing progress/rewards are preserved.
-- Wallet row locking serializes assignment creation across servers.
CREATE TABLE IF NOT EXISTS tapped_mission_assignments (
  steam_id VARCHAR(20) NOT NULL,
  period_kind VARCHAR(8) NOT NULL,
  period_start DATE NOT NULL,
  slot TINYINT UNSIGNED NOT NULL,
  mission_id VARCHAR(64) NOT NULL,
  assigned_at DATETIME(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
  PRIMARY KEY(steam_id,period_kind,period_start,slot),
  UNIQUE KEY mission_assignment_identity(steam_id,period_kind,period_start,mission_id),
  CONSTRAINT mission_assignment_slot CHECK (slot BETWEEN 1 AND 3),
  CONSTRAINT mission_assignment_period CHECK (period_kind IN ('daily','weekly','monthly'))
) ENGINE=InnoDB;
