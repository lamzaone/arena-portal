-- Run this migration against PORTAL_DATABASE_URL after
-- 015_group_reward_entitlements.sql.
--
-- Theme surface authorization remains source-controlled. These values update
-- player-facing descriptions and catalogue metadata only; they cannot inject
-- CSS, markup, or enable a surface unsupported by the trusted portal build.

UPDATE portal_profile_themes
SET description = 'Cyberpunk blue-and-yellow profile and ranking entry with sharp cuts, animated accents, and custom hover effects.'
WHERE theme_key = 'beta_tester';

UPDATE portal_economy_catalogue
SET metadata = JSON_SET(
  COALESCE(metadata, JSON_OBJECT()),
  '$.profileThemeKey', 'beta_tester',
  '$.themeSurfaces', JSON_ARRAY('profile', 'ranking_entry'),
  '$.description', 'Equip this inventory item to transform your profile and ranking entry with the BETA TESTER cyberpunk blue-and-yellow presentation.'
)
WHERE catalogue_key = 'tappd:special:profile_theme:beta_tester'
  AND item_type = 'profile_theme';
