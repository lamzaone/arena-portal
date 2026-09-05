-- Register the nine rank themes as enabled, UNLISTED inventory products.
-- Run against the Portal database after 025_arena_group_commerce_bridge.sql
-- and with the trusted rank-theme build available. Migration 015 and the
-- current reward lifecycle are required for membership-bound rewards.
--
-- This migration creates no group rewards, memberships, inventory items,
-- ownership rows, prices, or equipped selections. Staff chooses the groups,
-- quantity and trade policy later in the existing Group Rewards interface.
-- Choose account_bound there when the theme should expire with membership.
-- Standard and Founder have no theme definition in this release.
--
-- enabled=TRUE keeps these items available to Staff administration and equip.
-- marketEnabled=false is the existing Market listing AND purchase gate.
-- Rerunning reasserts unlisted registration while preserving unrelated JSON
-- metadata. Run one migration session at a time; use a client that stops on
-- errors and rolls back/disconnects, never one configured to continue errors.
-- After registration, check nine catalogue/theme pairs and preview URLs.
-- Group reward assignment/backfill remains a separate Staff action.

CREATE TEMPORARY TABLE portal_rank_theme_definitions (
  theme_key VARCHAR(64) CHARACTER SET ascii COLLATE ascii_general_ci NOT NULL,
  display_name VARCHAR(100) NOT NULL,
  description VARCHAR(255) NOT NULL,
  all_surfaces BOOLEAN NOT NULL,
  PRIMARY KEY (theme_key)
) ENGINE=InnoDB DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

INSERT INTO portal_rank_theme_definitions
  (theme_key, display_name, description, all_surfaces)
VALUES
  ('vip_silver', 'VIP Silver', 'A silver profile with brushed-metal details and an avatar crest.', FALSE),
  ('vip_gold', 'VIP Gold', 'A gold profile with gilded lines, an avatar crest, and animated highlights.', FALSE),
  ('vip_diamond', 'VIP Diamond', 'Diamond-blue facets, illuminated cards, and ambient light across the profile, site UI, compact profiles, and player containers.', TRUE),
  ('vip_ultimate', 'VIP Ultimate', 'An amethyst aurora with orbit details and drifting particles across the profile, site UI, compact profiles, and player containers.', TRUE),
  ('staff', 'Staff', 'A steel profile with a shield crest and a structured grid.', FALSE),
  ('moderator', 'Moderator', 'A mint profile with a shield crest, edge lighting, and animated highlights.', FALSE),
  ('administrator', 'Administrator', 'Amber beams and illuminated cards across the profile, site UI, compact profiles, and player containers.', TRUE),
  ('senior_administrator', 'Sr. Administrator', 'Violet orbit details and drifting particles across the profile, site UI, compact profiles, and player containers.', TRUE),
  ('owner', 'Owner', 'A crimson crown halo, layered crest, and atmospheric motion across the profile, site UI, compact profiles, and player containers.', TRUE);

START TRANSACTION;

INSERT INTO portal_economy_catalogue
  (catalogue_key, market_hash_name, item_type, definition_index, paintkit,
   rarity_rank, display_name, metadata, enabled)
SELECT
  CONCAT('arena:membership:profile_theme:', definition.theme_key),
  NULL,
  'profile_theme',
  NULL,
  NULL,
  8,
  CONCAT(definition.display_name, ' Theme'),
  JSON_OBJECT(
    'source', 'ARENA Portal',
    'customProduct', JSON_EXTRACT('true', '$'),
    'profileThemeKey', definition.theme_key,
    'themeSurfaces', JSON_EXTRACT(IF(
      definition.all_surfaces,
      JSON_ARRAY('profile', 'global', 'smallProfile', 'playerContainer'),
      JSON_ARRAY('profile')
    ), '$'),
    'marketEnabled', JSON_EXTRACT('false', '$'),
    'imageUrl', CONCAT('/images/economy/profile-themes/', REPLACE(definition.theme_key, '_', '-'), '.svg'),
    'description', definition.description
  ),
  TRUE
FROM portal_rank_theme_definitions AS definition
WHERE TRUE
ON DUPLICATE KEY UPDATE
  item_type = VALUES(item_type),
  rarity_rank = VALUES(rarity_rank),
  display_name = VALUES(display_name),
  enabled = TRUE,
  metadata = JSON_SET(
    COALESCE(metadata, JSON_OBJECT()),
    '$.source', 'ARENA Portal',
    '$.customProduct', JSON_EXTRACT('true', '$'),
    '$.profileThemeKey', JSON_UNQUOTE(JSON_EXTRACT(VALUES(metadata), '$.profileThemeKey')),
    '$.themeSurfaces', JSON_EXTRACT(VALUES(metadata), '$.themeSurfaces'),
    '$.marketEnabled', JSON_EXTRACT('false', '$'),
    '$.imageUrl', JSON_UNQUOTE(JSON_EXTRACT(VALUES(metadata), '$.imageUrl')),
    '$.description', JSON_UNQUOTE(JSON_EXTRACT(VALUES(metadata), '$.description'))
  );

INSERT INTO portal_profile_themes
  (theme_key, catalogue_id, display_name, description, preview_image_url, enabled)
SELECT
  definition.theme_key,
  catalogue.id,
  definition.display_name,
  definition.description,
  CONCAT('/images/economy/profile-themes/', REPLACE(definition.theme_key, '_', '-'), '.svg'),
  TRUE
FROM portal_rank_theme_definitions AS definition
INNER JOIN portal_economy_catalogue AS catalogue
  ON catalogue.catalogue_key = CONCAT('arena:membership:profile_theme:', definition.theme_key)
WHERE TRUE
ON DUPLICATE KEY UPDATE
  catalogue_id = VALUES(catalogue_id),
  display_name = VALUES(display_name),
  description = VALUES(description),
  preview_image_url = VALUES(preview_image_url),
  enabled = TRUE;

COMMIT;

DROP TEMPORARY TABLE portal_rank_theme_definitions;
