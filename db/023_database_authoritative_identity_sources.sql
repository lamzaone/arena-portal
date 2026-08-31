-- Run this migration against PORTAL_DATABASE_URL after
-- 022_non_stackable_vip_memberships.sql.
--
-- Once Admins.Core or VIPCore has supplied definitions from its database, JSON
-- remains only a historical bootstrap input. This durable marker prevents a
-- transient game-database outage (or a later environment change) from
-- re-importing stale JSON permissions, ranks, or tiers into the portal.

CREATE TABLE IF NOT EXISTS portal_identity_catalogue_authority (
  source_type ENUM('admins_core', 'vipcore') NOT NULL,
  database_authoritative BOOLEAN NOT NULL DEFAULT TRUE,
  established_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  last_confirmed_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (source_type),
  KEY portal_identity_catalogue_authority_confirmed (last_confirmed_at)
) ENGINE=InnoDB DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

INSERT INTO portal_identity_catalogue_authority
  (source_type, database_authoritative, established_at, last_confirmed_at)
SELECT
  source_type,
  TRUE,
  MIN(created_at),
  MAX(synced_at)
FROM portal_identity_external_group_definitions
WHERE source_kind = 'runtime'
GROUP BY source_type
ON DUPLICATE KEY UPDATE
  database_authoritative = TRUE,
  last_confirmed_at = GREATEST(last_confirmed_at, VALUES(last_confirmed_at));
