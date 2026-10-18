-- Portal database only. Recruitment is closed until a staff member opens it.
CREATE TABLE IF NOT EXISTS portal_staff_recruitment (
  id TINYINT UNSIGNED NOT NULL PRIMARY KEY,
  is_open BOOLEAN NOT NULL DEFAULT FALSE,
  updated_by VARCHAR(17) NULL,
  updated_at BIGINT UNSIGNED NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

INSERT INTO portal_staff_recruitment (id, is_open)
SELECT 1, FALSE WHERE NOT EXISTS (SELECT 1 FROM portal_staff_recruitment WHERE id = 1);

CREATE TABLE IF NOT EXISTS portal_staff_applications (
  id CHAR(36) NOT NULL PRIMARY KEY,
  steam_id VARCHAR(17) NOT NULL,
  nickname VARCHAR(128) NOT NULL,
  age TINYINT UNSIGNED NOT NULL,
  discord_profile VARCHAR(100) NOT NULL,
  discord_linked BOOLEAN NOT NULL,
  steam_group_member BOOLEAN NOT NULL,
  playtime_seconds BIGINT UNSIGNED NULL,
  reason TEXT NOT NULL,
  status VARCHAR(24) NOT NULL DEFAULT 'submitted',
  created_at BIGINT UNSIGNED NOT NULL,
  reviewed_by VARCHAR(17) NULL,
  reviewed_at BIGINT UNSIGNED NULL,
  active_steam_id VARCHAR(17) GENERATED ALWAYS AS
    (CASE WHEN status IN ('submitted', 'reviewing') THEN steam_id ELSE NULL END) STORED,
  UNIQUE KEY portal_staff_application_active (active_steam_id),
  KEY portal_staff_application_player (steam_id, created_at),
  KEY portal_staff_application_created (created_at, id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
