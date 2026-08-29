-- Run this migration against PORTAL_DATABASE_URL after 012_identity_groups.sql.
--
-- A profile theme is equipped from one concrete, currently-owned inventory
-- instance.  `active_theme_id` continues to identify the trusted code-owned
-- presentation; `active_theme_item_id` proves that the player still owns the
-- item.  Profile reads join both values, so selling, trading, consuming, or
-- revoking the instance immediately falls back to the default presentation.

ALTER TABLE portal_profile_themes
  ADD COLUMN IF NOT EXISTS catalogue_id BIGINT UNSIGNED NULL AFTER theme_key;

ALTER TABLE portal_profile_themes
  ADD UNIQUE KEY IF NOT EXISTS portal_profile_themes_catalogue_unique (catalogue_id);

-- Refuse an ambiguous key instead of letting UPDATE choose an arbitrary
-- catalogue row. Trusted profile renderers require a one-to-one definition.
DROP TEMPORARY TABLE IF EXISTS portal_profile_theme_mapping_preflight;
CREATE TEMPORARY TABLE portal_profile_theme_mapping_preflight (
  ok TINYINT NOT NULL,
  CONSTRAINT portal_profile_theme_catalogue_ambiguous CHECK (ok = 1)
) ENGINE=MEMORY;
INSERT INTO portal_profile_theme_mapping_preflight (ok)
SELECT 0
WHERE EXISTS (
  SELECT 1
  FROM (
    SELECT theme.id
    FROM portal_profile_themes AS theme
    INNER JOIN portal_economy_catalogue AS catalogue
      ON catalogue.item_type = 'profile_theme'
     AND (
       JSON_UNQUOTE(JSON_EXTRACT(catalogue.metadata, '$.profileThemeKey')) = theme.theme_key
       OR JSON_UNQUOTE(JSON_EXTRACT(catalogue.metadata, '$.themeKey')) = theme.theme_key
       OR catalogue.catalogue_key IN (
         CONCAT('tappd:special:profile-theme:', REPLACE(theme.theme_key, '_', '-')),
         CONCAT('tappd:special:profile_theme:', theme.theme_key)
       )
     )
    WHERE theme.catalogue_id IS NULL
    GROUP BY theme.id
    HAVING COUNT(DISTINCT catalogue.id) > 1
  ) AS ambiguous_theme
);
DROP TEMPORARY TABLE portal_profile_theme_mapping_preflight;

UPDATE portal_profile_themes AS theme
INNER JOIN (
  SELECT theme_candidate.id AS theme_id, MIN(catalogue.id) AS catalogue_id
  FROM portal_profile_themes AS theme_candidate
  INNER JOIN portal_economy_catalogue AS catalogue
    ON catalogue.item_type = 'profile_theme'
   AND (
     JSON_UNQUOTE(JSON_EXTRACT(catalogue.metadata, '$.profileThemeKey')) = theme_candidate.theme_key
     OR JSON_UNQUOTE(JSON_EXTRACT(catalogue.metadata, '$.themeKey')) = theme_candidate.theme_key
     OR catalogue.catalogue_key IN (
       CONCAT('tappd:special:profile-theme:', REPLACE(theme_candidate.theme_key, '_', '-')),
       CONCAT('tappd:special:profile_theme:', theme_candidate.theme_key)
     )
   )
  WHERE theme_candidate.catalogue_id IS NULL
  GROUP BY theme_candidate.id
) AS candidate ON candidate.theme_id = theme.id
SET theme.catalogue_id = candidate.catalogue_id
WHERE theme.catalogue_id IS NULL;

ALTER TABLE portal_player_settings
  ADD COLUMN IF NOT EXISTS active_theme_item_id CHAR(36) CHARACTER SET ascii COLLATE ascii_general_ci NULL AFTER active_theme_id;

ALTER TABLE portal_player_settings
  ADD KEY IF NOT EXISTS portal_player_settings_active_theme_item (active_theme_item_id);

-- Upgrade legacy theme entitlements to a concrete, currently-owned instance.
-- If no such proof exists, explicitly retire the old equipped value so reads
-- and writes agree on inventory-backed ownership semantics.
UPDATE portal_player_settings AS settings
INNER JOIN portal_profile_themes AS theme ON theme.id = settings.active_theme_id
INNER JOIN portal_inventory_items AS item
  ON item.owner_steam_id = settings.steam_id
 AND item.catalogue_id = theme.catalogue_id
 AND item.item_type = 'profile_theme'
 AND item.state = 'available'
LEFT JOIN portal_inventory_items AS newer_item
  ON newer_item.owner_steam_id = item.owner_steam_id
 AND newer_item.catalogue_id = item.catalogue_id
 AND newer_item.item_type = 'profile_theme'
 AND newer_item.state = 'available'
 AND (
   newer_item.acquired_at > item.acquired_at
   OR (newer_item.acquired_at = item.acquired_at AND newer_item.id > item.id)
 )
SET settings.active_theme_item_id = item.id
WHERE settings.active_theme_item_id IS NULL
  AND newer_item.id IS NULL;

UPDATE portal_player_settings AS settings
LEFT JOIN portal_profile_themes AS theme ON theme.id = settings.active_theme_id
LEFT JOIN portal_inventory_items AS item
  ON item.id = settings.active_theme_item_id
 AND item.owner_steam_id = settings.steam_id
 AND item.catalogue_id = theme.catalogue_id
 AND item.item_type = 'profile_theme'
 AND item.state = 'available'
SET settings.active_theme_id = NULL,
    settings.active_theme_item_id = NULL
WHERE (settings.active_theme_id IS NOT NULL OR settings.active_theme_item_id IS NOT NULL)
  AND item.id IS NULL;

ALTER TABLE portal_player_settings
  DROP CONSTRAINT IF EXISTS portal_player_settings_theme_item_pair,
  ADD CONSTRAINT portal_player_settings_theme_item_pair CHECK (
    (active_theme_id IS NULL AND active_theme_item_id IS NULL) OR
    (active_theme_id IS NOT NULL AND active_theme_item_id IS NOT NULL)
  );

SET @profile_theme_catalogue_fk_exists = (
  SELECT COUNT(*)
  FROM information_schema.TABLE_CONSTRAINTS
  WHERE CONSTRAINT_SCHEMA = DATABASE()
    AND TABLE_NAME = 'portal_profile_themes'
    AND CONSTRAINT_NAME = 'portal_profile_themes_catalogue_fk'
);
SET @profile_theme_catalogue_fk_sql = IF(
  @profile_theme_catalogue_fk_exists > 0,
  'SELECT 1',
  'ALTER TABLE portal_profile_themes ADD CONSTRAINT portal_profile_themes_catalogue_fk FOREIGN KEY (catalogue_id) REFERENCES portal_economy_catalogue (id) ON DELETE RESTRICT'
);
PREPARE profile_theme_catalogue_fk_statement FROM @profile_theme_catalogue_fk_sql;
EXECUTE profile_theme_catalogue_fk_statement;
DEALLOCATE PREPARE profile_theme_catalogue_fk_statement;

SET @profile_theme_item_fk_exists = (
  SELECT COUNT(*)
  FROM information_schema.TABLE_CONSTRAINTS
  WHERE CONSTRAINT_SCHEMA = DATABASE()
    AND TABLE_NAME = 'portal_player_settings'
    AND CONSTRAINT_NAME = 'portal_player_settings_theme_item_fk'
);
SET @profile_theme_item_fk_sql = IF(
  @profile_theme_item_fk_exists > 0,
  'SELECT 1',
  'ALTER TABLE portal_player_settings ADD CONSTRAINT portal_player_settings_theme_item_fk FOREIGN KEY (active_theme_item_id) REFERENCES portal_inventory_items (id) ON DELETE RESTRICT'
);
PREPARE profile_theme_item_fk_statement FROM @profile_theme_item_fk_sql;
EXECUTE profile_theme_item_fk_statement;
DEALLOCATE PREPARE profile_theme_item_fk_statement;
