-- Register Shadow as an enabled, UNLISTED inventory product and trusted theme.
-- Run against the Portal database with migrations 008 and 013-015 already
-- installed and the source-controlled Shadow theme build available.
--
-- The first registration is enabled and marketEnabled=false. Rerunning updates
-- presentation metadata only: it preserves listing status, enabled flags,
-- prices, existing catalogue/theme IDs and existing catalogue associations.
-- This migration grants no inventory, rewards, memberships or permissions and
-- changes no ownership or equipped selections. Staff can grant the item or
-- attach it to a reward through the existing inventory/group interfaces.
-- Run one migration session at a time with a client that stops on SQL errors
-- and rolls back/disconnects instead of continuing after a failed statement.

START TRANSACTION;

INSERT INTO portal_economy_catalogue
  (catalogue_key, market_hash_name, item_type, definition_index, paintkit,
   rarity_rank, display_name, metadata, enabled)
VALUES
  (
    'arena:special:profile_theme:shadow',
    NULL,
    'profile_theme',
    NULL,
    NULL,
    8,
    'Shadow Theme',
    JSON_OBJECT(
      'source', 'ARENA Portal',
      'customProduct', JSON_EXTRACT('true', '$'),
      'profileThemeKey', 'shadow',
      'themeSurfaces', JSON_ARRAY('profile', 'global', 'smallProfile', 'playerContainer'),
      'marketEnabled', JSON_EXTRACT('false', '$'),
      'imageUrl', '/images/economy/profile-themes/shadow.svg',
      'description', 'Obsidian surfaces, an embossed TAPPED monogram, drifting shadow forms and a moving platinum edge across the site.'
    ),
    TRUE
  )
ON DUPLICATE KEY UPDATE
  display_name = VALUES(display_name),
  metadata = JSON_SET(
    COALESCE(metadata, JSON_OBJECT()),
    '$.source', 'ARENA Portal',
    '$.customProduct', JSON_EXTRACT('true', '$'),
    '$.profileThemeKey', 'shadow',
    '$.themeSurfaces', JSON_ARRAY('profile', 'global', 'smallProfile', 'playerContainer'),
    '$.imageUrl', '/images/economy/profile-themes/shadow.svg',
    '$.description', 'Obsidian surfaces, an embossed TAPPED monogram, drifting shadow forms and a moving platinum edge across the site.'
  );

INSERT INTO portal_profile_themes
  (theme_key, catalogue_id, display_name, description, preview_image_url, enabled)
SELECT
  'shadow',
  catalogue.id,
  'Shadow',
  'Obsidian surfaces, an embossed TAPPED monogram, drifting shadow forms and a moving platinum edge across the site.',
  '/images/economy/profile-themes/shadow.svg',
  TRUE
FROM portal_economy_catalogue AS catalogue
WHERE catalogue.catalogue_key = 'arena:special:profile_theme:shadow'
  AND catalogue.item_type = 'profile_theme'
ON DUPLICATE KEY UPDATE
  display_name = VALUES(display_name),
  description = VALUES(description),
  preview_image_url = VALUES(preview_image_url);

COMMIT;
