-- Run against the Portal database after 026_rank_themes.sql with the trusted
-- all-theme site UI build available. This migration updates presentation
-- descriptions and surface metadata for existing registered themes only.
--
-- It creates no products or theme definitions, and changes no listing status,
-- enabled flags, prices, rewards, inventory, ownership, or equipped selections.
-- Source-controlled manifests remain the authority for supported surfaces.
-- Run one migration session at a time with a client that stops on SQL errors.

CREATE TEMPORARY TABLE portal_global_theme_descriptions (
  theme_key VARCHAR(64) CHARACTER SET ascii COLLATE ascii_general_ci NOT NULL,
  description VARCHAR(255) NOT NULL,
  PRIMARY KEY (theme_key)
) ENGINE=InnoDB DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

INSERT INTO portal_global_theme_descriptions (theme_key, description)
VALUES
  ('beta_tester', 'Cyberpunk blue and yellow, sharp geometry, animated signals, and reactive highlights across the site, profile, and player cards.'),
  ('tap_god', 'Gothic crimson and black, cathedral tracery, blood rain, and animated sigils across the site, profile, and player cards.'),
  ('vip_silver', 'Brushed silver, satin reflections, and a metallic avatar crest across the site, profile, and player cards.'),
  ('vip_gold', 'Warm gold grain, gilded borders, and moving metallic highlights across the site, profile, and player cards.'),
  ('vip_diamond', 'Diamond-blue facets, geometric gems, and prismatic glints across the site, profile, and player cards.'),
  ('vip_ultimate', 'Electric amethyst, branching arcs, and charged geometry across the site, profile, and player cards.'),
  ('staff', 'Brushed steel, a shield crest, and precise grid details across the site, profile, and player cards.'),
  ('moderator', 'Jade edge lighting, a shield crest, and sweeping scanner details across the site, profile, and player cards.'),
  ('administrator', 'Amber traces, illuminated geometry, and sweeping highlights across the site, profile, and player cards.'),
  ('senior_administrator', 'Violet orbital details, layered geometry, and drifting particles across the site, profile, and player cards.'),
  ('owner', 'A crimson crown halo, layered crest, and atmospheric motion across the site, profile, and player cards.');

START TRANSACTION;

UPDATE portal_profile_themes AS theme
INNER JOIN portal_global_theme_descriptions AS presentation
  ON presentation.theme_key = theme.theme_key
SET theme.description = presentation.description;

UPDATE portal_economy_catalogue AS catalogue
INNER JOIN portal_profile_themes AS theme
  ON theme.catalogue_id = catalogue.id
INNER JOIN portal_global_theme_descriptions AS presentation
  ON presentation.theme_key = theme.theme_key
SET catalogue.metadata = JSON_SET(
  COALESCE(catalogue.metadata, JSON_OBJECT()),
  '$.themeSurfaces', JSON_ARRAY('profile', 'global', 'smallProfile', 'playerContainer'),
  '$.description', presentation.description
)
WHERE catalogue.item_type = 'profile_theme';

COMMIT;

DROP TEMPORARY TABLE portal_global_theme_descriptions;
