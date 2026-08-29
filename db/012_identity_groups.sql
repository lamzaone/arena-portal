-- Run this file against PORTAL_DATABASE_URL after 011_special_item_taxonomy.sql.
--
-- Identity groups are portal-owned presentation and entitlement records. Existing
-- Admins.Core and VIPCore groups are represented by external adapter rows; their
-- memberships remain authoritative in the game database. Custom memberships,
-- chat tags, additional privileges, badges, and catalogue rewards live here.
--
-- The website must never derive Founder authority from these tables. Founder is
-- anchored to the active server's external Admins.Core assignment.

CREATE TABLE IF NOT EXISTS portal_identity_groups (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  group_key VARCHAR(64) CHARACTER SET ascii COLLATE ascii_general_ci NOT NULL,
  display_name VARCHAR(100) NOT NULL,
  source_type ENUM('custom', 'admins_core', 'vipcore') NOT NULL DEFAULT 'custom',
  external_key VARCHAR(100) NULL,
  description VARCHAR(255) NULL,
  badge_label VARCHAR(32) NOT NULL,
  badge_icon_key VARCHAR(32) CHARACTER SET ascii COLLATE ascii_general_ci NOT NULL DEFAULT 'shield',
  badge_color CHAR(7) CHARACTER SET ascii COLLATE ascii_general_ci NOT NULL DEFAULT '#f0b35a',
  badge_soft_color CHAR(7) CHARACTER SET ascii COLLATE ascii_general_ci NOT NULL DEFAULT '#ffe4b8',
  profile_priority SMALLINT NOT NULL DEFAULT 0,
  enabled BOOLEAN NOT NULL DEFAULT TRUE,
  created_by_steam_id VARCHAR(17) NOT NULL,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  UNIQUE KEY portal_identity_groups_key_unique (group_key),
  UNIQUE KEY portal_identity_groups_external_unique (source_type, external_key),
  KEY portal_identity_groups_browse (enabled, profile_priority, display_name, id),
  CONSTRAINT portal_identity_groups_key_valid CHECK (group_key REGEXP '^[a-z0-9][a-z0-9._:-]{0,63}$'),
  CONSTRAINT portal_identity_groups_source_shape CHECK (
    (source_type = 'custom' AND external_key IS NULL) OR
    (source_type IN ('admins_core', 'vipcore') AND external_key IS NOT NULL)
  ),
  CONSTRAINT portal_identity_groups_badge_color_valid CHECK (badge_color REGEXP '^#[0-9A-Fa-f]{6}$'),
  CONSTRAINT portal_identity_groups_badge_soft_color_valid CHECK (badge_soft_color REGEXP '^#[0-9A-Fa-f]{6}$')
) ENGINE=InnoDB DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS portal_identity_group_memberships (
  group_id BIGINT UNSIGNED NOT NULL,
  steam_id VARCHAR(17) NOT NULL,
  starts_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  expires_at TIMESTAMP NULL DEFAULT NULL,
  granted_by_steam_id VARCHAR(17) NOT NULL,
  grant_reason VARCHAR(180) NULL,
  revoked_at TIMESTAMP NULL DEFAULT NULL,
  revoked_by_steam_id VARCHAR(17) NULL,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (group_id, steam_id),
  KEY portal_identity_group_memberships_player (steam_id, revoked_at, expires_at, group_id),
  KEY portal_identity_group_memberships_active (group_id, revoked_at, expires_at, steam_id),
  CONSTRAINT portal_identity_group_memberships_group_fk FOREIGN KEY (group_id) REFERENCES portal_identity_groups (id) ON DELETE RESTRICT,
  CONSTRAINT portal_identity_group_memberships_date_range CHECK (expires_at IS NULL OR expires_at > starts_at)
) ENGINE=InnoDB DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS portal_identity_privileges (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  privilege_key VARCHAR(96) CHARACTER SET ascii COLLATE ascii_general_ci NOT NULL,
  scope ENUM('portal', 'game') NOT NULL,
  display_name VARCHAR(100) NOT NULL,
  description VARCHAR(255) NULL,
  is_sensitive BOOLEAN NOT NULL DEFAULT FALSE,
  enabled BOOLEAN NOT NULL DEFAULT TRUE,
  created_by_steam_id VARCHAR(17) NOT NULL,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  UNIQUE KEY portal_identity_privileges_key_unique (privilege_key),
  KEY portal_identity_privileges_browse (enabled, scope, display_name, id),
  CONSTRAINT portal_identity_privileges_key_valid CHECK (privilege_key REGEXP '^[a-z0-9][a-z0-9.*:_-]{0,95}$')
) ENGINE=InnoDB DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS portal_identity_group_privileges (
  group_id BIGINT UNSIGNED NOT NULL,
  privilege_id BIGINT UNSIGNED NOT NULL,
  granted_by_steam_id VARCHAR(17) NOT NULL,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (group_id, privilege_id),
  KEY portal_identity_group_privileges_privilege (privilege_id, group_id),
  CONSTRAINT portal_identity_group_privileges_group_fk FOREIGN KEY (group_id) REFERENCES portal_identity_groups (id) ON DELETE CASCADE,
  CONSTRAINT portal_identity_group_privileges_privilege_fk FOREIGN KEY (privilege_id) REFERENCES portal_identity_privileges (id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS portal_identity_player_privileges (
  steam_id VARCHAR(17) NOT NULL,
  privilege_id BIGINT UNSIGNED NOT NULL,
  starts_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  expires_at TIMESTAMP NULL DEFAULT NULL,
  granted_by_steam_id VARCHAR(17) NOT NULL,
  grant_reason VARCHAR(180) NULL,
  revoked_at TIMESTAMP NULL DEFAULT NULL,
  revoked_by_steam_id VARCHAR(17) NULL,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (steam_id, privilege_id),
  KEY portal_identity_player_privileges_active (steam_id, revoked_at, expires_at, privilege_id),
  CONSTRAINT portal_identity_player_privileges_privilege_fk FOREIGN KEY (privilege_id) REFERENCES portal_identity_privileges (id) ON DELETE RESTRICT,
  CONSTRAINT portal_identity_player_privileges_date_range CHECK (expires_at IS NULL OR expires_at > starts_at)
) ENGINE=InnoDB DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS portal_identity_chat_tags (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  tag_key VARCHAR(64) CHARACTER SET ascii COLLATE ascii_general_ci NOT NULL,
  tag_text VARCHAR(64) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci NOT NULL,
  color_token VARCHAR(24) CHARACTER SET ascii COLLATE ascii_general_ci NOT NULL DEFAULT '[gold]',
  name_color_token VARCHAR(24) CHARACTER SET ascii COLLATE ascii_general_ci NULL,
  message_color_token VARCHAR(24) CHARACTER SET ascii COLLATE ascii_general_ci NULL,
  enabled BOOLEAN NOT NULL DEFAULT TRUE,
  created_by_steam_id VARCHAR(17) NOT NULL,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  UNIQUE KEY portal_identity_chat_tags_key_unique (tag_key),
  KEY portal_identity_chat_tags_browse (enabled, tag_text, id),
  CONSTRAINT portal_identity_chat_tags_key_valid CHECK (tag_key REGEXP '^[a-z0-9][a-z0-9._:-]{0,63}$'),
  CONSTRAINT portal_identity_chat_tags_color_valid CHECK (color_token REGEXP '^\\[[a-z]+\\]$'),
  CONSTRAINT portal_identity_chat_tags_name_color_valid CHECK (name_color_token IS NULL OR name_color_token REGEXP '^\\[[a-z]+\\]$'),
  CONSTRAINT portal_identity_chat_tags_message_color_valid CHECK (message_color_token IS NULL OR message_color_token REGEXP '^\\[[a-z]+\\]$')
) ENGINE=InnoDB DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CREATE TABLE IF NOT EXISTS does not repair a table left behind by an older
-- partial run. Keep decorated GlobalChatTags labels lossless even when the
-- portal database was originally created with a latin1 server default.
ALTER TABLE portal_identity_chat_tags
  MODIFY tag_text VARCHAR(64) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci NOT NULL;

-- A group can have no chat tag: that is represented by having no row here.
CREATE TABLE IF NOT EXISTS portal_identity_group_chat_tags (
  group_id BIGINT UNSIGNED NOT NULL,
  tag_id BIGINT UNSIGNED NOT NULL,
  sort_order SMALLINT UNSIGNED NOT NULL DEFAULT 0,
  assigned_by_steam_id VARCHAR(17) NOT NULL,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (group_id, tag_id),
  KEY portal_identity_group_chat_tags_order (group_id, sort_order, tag_id),
  KEY portal_identity_group_chat_tags_tag (tag_id, group_id),
  CONSTRAINT portal_identity_group_chat_tags_group_fk FOREIGN KEY (group_id) REFERENCES portal_identity_groups (id) ON DELETE CASCADE,
  CONSTRAINT portal_identity_group_chat_tags_tag_fk FOREIGN KEY (tag_id) REFERENCES portal_identity_chat_tags (id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS portal_identity_player_chat_tags (
  steam_id VARCHAR(17) NOT NULL,
  tag_id BIGINT UNSIGNED NOT NULL,
  starts_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  expires_at TIMESTAMP NULL DEFAULT NULL,
  assigned_by_steam_id VARCHAR(17) NOT NULL,
  grant_reason VARCHAR(180) NULL,
  revoked_at TIMESTAMP NULL DEFAULT NULL,
  revoked_by_steam_id VARCHAR(17) NULL,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (steam_id, tag_id),
  KEY portal_identity_player_chat_tags_active (steam_id, revoked_at, expires_at, tag_id),
  CONSTRAINT portal_identity_player_chat_tags_tag_fk FOREIGN KEY (tag_id) REFERENCES portal_identity_chat_tags (id) ON DELETE RESTRICT,
  CONSTRAINT portal_identity_player_chat_tags_date_range CHECK (expires_at IS NULL OR expires_at > starts_at)
) ENGINE=InnoDB DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS portal_identity_player_tag_preferences (
  steam_id VARCHAR(17) NOT NULL,
  tag_id BIGINT UNSIGNED NOT NULL,
  hidden BOOLEAN NOT NULL DEFAULT FALSE,
  updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (steam_id, tag_id),
  CONSTRAINT portal_identity_player_tag_preferences_tag_fk FOREIGN KEY (tag_id) REFERENCES portal_identity_chat_tags (id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS portal_identity_group_rewards (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  group_id BIGINT UNSIGNED NOT NULL,
  catalogue_id BIGINT UNSIGNED NOT NULL,
  quantity SMALLINT UNSIGNED NOT NULL DEFAULT 1,
  trade_policy ENUM('tradable', 'account_bound') NOT NULL DEFAULT 'tradable',
  enabled BOOLEAN NOT NULL DEFAULT TRUE,
  created_by_steam_id VARCHAR(17) NOT NULL,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  retired_at TIMESTAMP NULL DEFAULT NULL,
  retired_by_steam_id VARCHAR(17) NULL,
  PRIMARY KEY (id),
  KEY portal_identity_group_rewards_active (group_id, enabled, id),
  KEY portal_identity_group_rewards_catalogue (catalogue_id, enabled, id),
  CONSTRAINT portal_identity_group_rewards_group_fk FOREIGN KEY (group_id) REFERENCES portal_identity_groups (id) ON DELETE RESTRICT,
  CONSTRAINT portal_identity_group_rewards_catalogue_fk FOREIGN KEY (catalogue_id) REFERENCES portal_economy_catalogue (id) ON DELETE RESTRICT,
  CONSTRAINT portal_identity_group_rewards_quantity_positive CHECK (quantity BETWEEN 1 AND 25)
) ENGINE=InnoDB DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS portal_identity_group_reward_awards (
  reward_id BIGINT UNSIGNED NOT NULL,
  steam_id VARCHAR(17) NOT NULL,
  ordinal SMALLINT UNSIGNED NOT NULL,
  item_id CHAR(36) CHARACTER SET ascii COLLATE ascii_general_ci NOT NULL,
  awarded_by_steam_id VARCHAR(17) NULL,
  awarded_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (reward_id, steam_id, ordinal),
  UNIQUE KEY portal_identity_group_reward_awards_item_unique (item_id),
  KEY portal_identity_group_reward_awards_player (steam_id, awarded_at, reward_id),
  CONSTRAINT portal_identity_group_reward_awards_reward_fk FOREIGN KEY (reward_id) REFERENCES portal_identity_group_rewards (id) ON DELETE RESTRICT,
  CONSTRAINT portal_identity_group_reward_awards_item_fk FOREIGN KEY (item_id) REFERENCES portal_inventory_items (id) ON DELETE RESTRICT
) ENGINE=InnoDB DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS portal_identity_audit_events (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  idempotency_key VARCHAR(160) CHARACTER SET ascii COLLATE ascii_general_ci NOT NULL,
  actor_type ENUM('founder', 'system') NOT NULL,
  actor_id VARCHAR(64) NOT NULL,
  action VARCHAR(80) NOT NULL,
  target_type VARCHAR(48) NOT NULL,
  target_id VARCHAR(96) NOT NULL,
  metadata JSON NULL,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  UNIQUE KEY portal_identity_audit_events_idempotency (idempotency_key),
  KEY portal_identity_audit_events_target (target_type, target_id, created_at, id),
  KEY portal_identity_audit_events_actor (actor_id, created_at, id)
) ENGINE=InnoDB DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

DROP TRIGGER IF EXISTS portal_identity_audit_events_prevent_update;
CREATE TRIGGER portal_identity_audit_events_prevent_update BEFORE UPDATE ON portal_identity_audit_events
FOR EACH ROW SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'portal_identity_audit_events is immutable';

DROP TRIGGER IF EXISTS portal_identity_audit_events_prevent_delete;
CREATE TRIGGER portal_identity_audit_events_prevent_delete BEFORE DELETE ON portal_identity_audit_events
FOR EACH ROW SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'portal_identity_audit_events is immutable';

-- External adapter rows make Admins.Core and VIPCore groups configurable in the
-- same portal UI without copying their authoritative membership records.
-- Abort before seeding if either unique key was previously claimed by a
-- different adapter. INSERT IGNORE alone would hide that conflict and leave a
-- misleading portal identity wired to the wrong external authority.
DROP TEMPORARY TABLE IF EXISTS portal_identity_expected_adapters;
CREATE TEMPORARY TABLE portal_identity_expected_adapters (
  group_key VARCHAR(64) CHARACTER SET ascii COLLATE ascii_general_ci NOT NULL,
  source_type VARCHAR(24) CHARACTER SET ascii COLLATE ascii_general_ci NOT NULL,
  external_key VARCHAR(100) NOT NULL,
  PRIMARY KEY (group_key),
  UNIQUE KEY portal_identity_expected_adapter_external (source_type, external_key)
) ENGINE=MEMORY;
INSERT INTO portal_identity_expected_adapters (group_key, source_type, external_key)
VALUES
  ('admins_core.trial_staff', 'admins_core', 'Trial Staff'),
  ('admins_core.guardian', 'admins_core', 'Guardian'),
  ('admins_core.enforcer', 'admins_core', 'Enforcer'),
  ('admins_core.overseer', 'admins_core', 'Overseer'),
  ('admins_core.director', 'admins_core', 'Director'),
  ('admins_core.founder', 'admins_core', 'Founder'),
  ('vipcore.standard', 'vipcore', 'STANDARD'),
  ('vipcore.silver', 'vipcore', 'SILVER'),
  ('vipcore.gold', 'vipcore', 'GOLD'),
  ('vipcore.diamond', 'vipcore', 'DIAMOND'),
  ('vipcore.ultimate', 'vipcore', 'ULTIMATE');

DROP TEMPORARY TABLE IF EXISTS portal_identity_adapter_preflight;
CREATE TEMPORARY TABLE portal_identity_adapter_preflight (
  ok TINYINT NOT NULL,
  CONSTRAINT portal_identity_adapter_seed_conflict CHECK (ok = 1)
) ENGINE=MEMORY;
INSERT INTO portal_identity_adapter_preflight (ok)
SELECT 0
WHERE EXISTS (
  SELECT 1
  FROM portal_identity_groups AS existing_group
  INNER JOIN portal_identity_expected_adapters AS expected
    ON existing_group.group_key = expected.group_key
    OR (
      existing_group.source_type = expected.source_type
      AND existing_group.external_key = expected.external_key
    )
  WHERE existing_group.group_key <> expected.group_key
     OR existing_group.source_type <> expected.source_type
     OR existing_group.external_key <> expected.external_key
);
DROP TEMPORARY TABLE portal_identity_adapter_preflight;
DROP TEMPORARY TABLE portal_identity_expected_adapters;

INSERT IGNORE INTO portal_identity_groups
  (group_key, display_name, source_type, external_key, description, badge_label, badge_icon_key, badge_color, badge_soft_color, profile_priority, created_by_steam_id)
VALUES
  ('admins_core.trial_staff', 'Trial Staff', 'admins_core', 'Trial Staff', 'Admins.Core staff group', 'STAFF', 'shield', '#b9bfd0', '#e6eaf2', 110, 'system'),
  ('admins_core.guardian', 'Guardian', 'admins_core', 'Guardian', 'Admins.Core staff group', 'GUARDIAN', 'shield', '#6ce5bd', '#c7f8e5', 120, 'system'),
  ('admins_core.enforcer', 'Enforcer', 'admins_core', 'Enforcer', 'Admins.Core staff group', 'ENFORCER', 'shield', '#ffb56a', '#ffe0ba', 130, 'system'),
  ('admins_core.overseer', 'Overseer', 'admins_core', 'Overseer', 'Admins.Core staff group', 'OVERSEER', 'shield', '#b192ff', '#e2d8ff', 140, 'system'),
  ('admins_core.director', 'Director', 'admins_core', 'Director', 'Admins.Core staff group', 'DIRECTOR', 'shield', '#61b7ff', '#cae8ff', 150, 'system'),
  ('admins_core.founder', 'Founder', 'admins_core', 'Founder', 'Immutable external founder authority', 'FOUNDER', 'crown', '#ff718f', '#ffd1da', 1000, 'system'),
  ('vipcore.standard', 'STANDARD', 'vipcore', 'STANDARD', 'VIPCore membership tier', 'VIP', 'crown', '#9de768', '#d7f7bd', 10, 'system'),
  ('vipcore.silver', 'SILVER', 'vipcore', 'SILVER', 'VIPCore membership tier', 'VIP SILVER', 'crown', '#c8d0df', '#edf1f8', 20, 'system'),
  ('vipcore.gold', 'GOLD', 'vipcore', 'GOLD', 'VIPCore membership tier', 'VIP GOLD', 'crown', '#ffd34d', '#fff0b0', 30, 'system'),
  ('vipcore.diamond', 'DIAMOND', 'vipcore', 'DIAMOND', 'VIPCore membership tier', 'VIP DIAMOND', 'crown', '#58b8ff', '#c5e9ff', 40, 'system'),
  ('vipcore.ultimate', 'ULTIMATE', 'vipcore', 'ULTIMATE', 'VIPCore membership tier', 'VIP ULTIMATE', 'crown', '#b46cff', '#e4c5ff', 50, 'system');

-- Preserve the current GlobalChatTags defaults as editable definitions. A
-- future DB-backed plug-in reads these by stable tag ID rather than list index.
INSERT IGNORE INTO portal_identity_chat_tags
  (tag_key, tag_text, color_token, name_color_token, message_color_token, created_by_steam_id)
VALUES
  ('admin.trial_staff', '✧ STAFF ✧', '[silver]', '[silver]', '[white]', 'system'),
  ('admin.guardian', '✦ MODERATOR ✦', '[lightblue]', '[lightblue]', '[white]', 'system'),
  ('admin.enforcer', '✦ ADMINISTRATOR ✦', '[blue]', '[lightblue]', '[white]', 'system'),
  ('admin.overseer', '✦ SR.ADMINISTRATOR ✦', '[lightpurple]', '[lightpurple]', '[white]', 'system'),
  ('admin.director', '✦ MANAGER ✦', '[gold]', '[gold]', '[white]', 'system'),
  ('admin.founder', '✦ FOUNDER ✦', '[red]', '[red]', '[silver]', 'system'),
  ('vip.standard', '[VIP]', '[lime]', '[default]', '[white]', 'system'),
  ('vip.silver', '[VIP SILVER]', '[silver]', '[default]', '[white]', 'system'),
  ('vip.gold', '[VIP GOLD]', '[gold]', '[default]', '[white]', 'system'),
  ('vip.diamond', '[VIP DIAMOND]', '[blue]', '[default]', '[silver]', 'system'),
  ('vip.ultimate', '[VIP ULTIMATE]', '[purple]', '[lightpurple]', '[silver]', 'system'),
  ('user.absolute_god', '▲ ABSOLUTE GOD ▲', '[lightred]', '[lightred]', '[lightred]', 'system');

-- Repair only the original plain bootstrap labels from the first migration
-- revision. Founder-customized values are not overwritten on later runs.
UPDATE portal_identity_chat_tags SET tag_text = '✧ STAFF ✧'
WHERE tag_key = 'admin.trial_staff' AND tag_text = 'STAFF';
UPDATE portal_identity_chat_tags SET tag_text = '✦ MODERATOR ✦'
WHERE tag_key = 'admin.guardian' AND tag_text = 'MODERATOR';
UPDATE portal_identity_chat_tags SET tag_text = '✦ ADMINISTRATOR ✦'
WHERE tag_key = 'admin.enforcer' AND tag_text = 'ADMINISTRATOR';
UPDATE portal_identity_chat_tags SET tag_text = '✦ SR.ADMINISTRATOR ✦'
WHERE tag_key = 'admin.overseer' AND tag_text = 'SR.ADMINISTRATOR';
UPDATE portal_identity_chat_tags SET tag_text = '✦ MANAGER ✦'
WHERE tag_key = 'admin.director' AND tag_text = 'MANAGER';
UPDATE portal_identity_chat_tags SET tag_text = '✦ FOUNDER ✦'
WHERE tag_key = 'admin.founder' AND tag_text = 'FOUNDER';

INSERT IGNORE INTO portal_identity_group_chat_tags (group_id, tag_id, sort_order, assigned_by_steam_id)
SELECT groups.id, tags.id, 0, 'system'
FROM portal_identity_groups AS groups
INNER JOIN portal_identity_chat_tags AS tags
  ON tags.tag_key = CASE groups.group_key
    WHEN 'admins_core.trial_staff' THEN 'admin.trial_staff'
    WHEN 'admins_core.guardian' THEN 'admin.guardian'
    WHEN 'admins_core.enforcer' THEN 'admin.enforcer'
    WHEN 'admins_core.overseer' THEN 'admin.overseer'
    WHEN 'admins_core.director' THEN 'admin.director'
    WHEN 'admins_core.founder' THEN 'admin.founder'
    WHEN 'vipcore.standard' THEN 'vip.standard'
    WHEN 'vipcore.silver' THEN 'vip.silver'
    WHEN 'vipcore.gold' THEN 'vip.gold'
    WHEN 'vipcore.diamond' THEN 'vip.diamond'
    WHEN 'vipcore.ultimate' THEN 'vip.ultimate'
    ELSE NULL
  END;

INSERT IGNORE INTO portal_identity_player_chat_tags
  (steam_id, tag_id, assigned_by_steam_id, grant_reason)
SELECT
  '76561198008960898',
  tags.id,
  'system',
  'Migrated from GlobalChatTags UserTags'
FROM portal_identity_chat_tags AS tags
WHERE tags.tag_key = 'user.absolute_god';
