-- Run this migration against PORTAL_DATABASE_URL after
-- 013_inventory_profile_theme_equip.sql.
--
-- Admins.Core and VIPCore memberships remain authoritative in their game
-- plug-ins.  This migration stores their complete group definitions in the
-- portal database so the Founder UI can manage presentation, tags, rewards,
-- and additive grants from one stable catalogue.

CREATE TABLE IF NOT EXISTS portal_identity_external_group_definitions (
  group_id BIGINT UNSIGNED NOT NULL,
  source_type ENUM('admins_core', 'vipcore') NOT NULL,
  external_key VARCHAR(100) NOT NULL,
  rank_weight INT NOT NULL DEFAULT 0,
  definition JSON NOT NULL,
  baseline_permissions JSON NOT NULL,
  capability_keys JSON NOT NULL,
  source_kind VARCHAR(32) CHARACTER SET ascii COLLATE ascii_general_ci NOT NULL DEFAULT 'config',
  source_reference VARCHAR(255) NULL,
  content_hash CHAR(64) CHARACTER SET ascii COLLATE ascii_general_ci NOT NULL,
  synced_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (group_id),
  UNIQUE KEY portal_identity_external_group_source_unique (source_type, external_key),
  KEY portal_identity_external_group_browse (source_type, rank_weight, external_key),
  CONSTRAINT portal_identity_external_group_group_fk FOREIGN KEY (group_id) REFERENCES portal_identity_groups (id) ON DELETE CASCADE,
  CONSTRAINT portal_identity_external_group_definition_valid CHECK (JSON_VALID(definition)),
  CONSTRAINT portal_identity_external_group_permissions_valid CHECK (JSON_VALID(baseline_permissions)),
  CONSTRAINT portal_identity_external_group_capabilities_valid CHECK (JSON_VALID(capability_keys)),
  CONSTRAINT portal_identity_external_group_source_kind_valid CHECK (source_kind REGEXP '^[a-z][a-z0-9_-]{0,31}$')
) ENGINE=InnoDB DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- A privilege can be discovered from more than one trustworthy input (for
-- example an Admins.Core group and a registered command).  The privilege row
-- remains the assignable definition; these rows explain where it came from.
CREATE TABLE IF NOT EXISTS portal_identity_privilege_sources (
  privilege_id BIGINT UNSIGNED NOT NULL,
  source_key VARCHAR(191) CHARACTER SET ascii COLLATE ascii_general_ci NOT NULL,
  source_kind VARCHAR(32) CHARACTER SET ascii COLLATE ascii_general_ci NOT NULL,
  source_reference VARCHAR(255) NULL,
  discovered_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  last_seen_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (privilege_id, source_key),
  KEY portal_identity_privilege_sources_source (source_kind, source_key),
  CONSTRAINT portal_identity_privilege_sources_privilege_fk FOREIGN KEY (privilege_id) REFERENCES portal_identity_privileges (id) ON DELETE CASCADE,
  CONSTRAINT portal_identity_privilege_sources_key_valid CHECK (source_key REGEXP '^[a-z0-9][a-z0-9._:@/-]{0,190}$'),
  CONSTRAINT portal_identity_privilege_sources_kind_valid CHECK (source_kind REGEXP '^[a-z][a-z0-9_-]{0,31}$')
) ENGINE=InnoDB DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
