-- Run this migration against PORTAL_DATABASE_URL after
-- 016_profile_theme_surfaces.sql.
--
-- TAP GOD is a trusted Special-grade Profile Theme. The database stores only
-- its catalogue/entitlement data; profile and ranking presentation remains
-- source-controlled by the portal's trusted theme registry.

INSERT INTO portal_economy_catalogue
  (
    catalogue_key,
    market_hash_name,
    item_type,
    definition_index,
    paintkit,
    rarity_rank,
    display_name,
    metadata,
    enabled
  )
VALUES
  (
    'tappd:special:profile_theme:tap_god',
    NULL,
    'profile_theme',
    NULL,
    NULL,
    8,
    'TAP GOD Theme',
    JSON_OBJECT(
      'source', 'ARENA Portal',
      'customProduct', TRUE,
      'profileThemeKey', 'tap_god',
      'themeSurfaces', JSON_ARRAY('profile', 'ranking_entry'),
      'marketEnabled', TRUE,
      'imageUrl', '/images/economy/profile-themes/tap-god.svg',
      'description', 'Equip this inventory item to transform your profile and ranking entry with the TAP GOD gothic crimson-and-black presentation.'
    ),
    TRUE
  )
ON DUPLICATE KEY UPDATE
  item_type = VALUES(item_type),
  rarity_rank = VALUES(rarity_rank),
  display_name = VALUES(display_name),
  enabled = TRUE,
  metadata = JSON_SET(
    COALESCE(metadata, JSON_OBJECT()),
    '$.source', 'ARENA Portal',
    '$.customProduct', TRUE,
    '$.profileThemeKey', 'tap_god',
    '$.themeSurfaces', JSON_ARRAY('profile', 'ranking_entry'),
    '$.marketEnabled', TRUE,
    '$.imageUrl', '/images/economy/profile-themes/tap-god.svg',
    '$.description', 'Equip this inventory item to transform your profile and ranking entry with the TAP GOD gothic crimson-and-black presentation.'
  );

INSERT INTO portal_profile_themes
  (
    theme_key,
    catalogue_id,
    display_name,
    description,
    preview_image_url,
    enabled
  )
SELECT
  'tap_god',
  catalogue.id,
  'TAP GOD',
  'Gothic crimson-and-black profile and ranking entry with cathedral tracery, blood-neon effects, animated sigils, and reactive hover treatments.',
  '/images/economy/profile-themes/tap-god.svg',
  TRUE
FROM portal_economy_catalogue AS catalogue
WHERE catalogue.catalogue_key = 'tappd:special:profile_theme:tap_god'
LIMIT 1
ON DUPLICATE KEY UPDATE
  catalogue_id = VALUES(catalogue_id),
  display_name = VALUES(display_name),
  description = VALUES(description),
  preview_image_url = VALUES(preview_image_url),
  enabled = TRUE;

INSERT INTO portal_economy_catalogue_prices
  (
    catalogue_id,
    market_price_eur_cents,
    price_source,
    source_reference,
    is_current
  )
SELECT
  catalogue.id,
  999999,
  'bootstrap-profile-theme',
  'TAP GOD profile theme launch price: 999999 Tokens',
  TRUE
FROM portal_economy_catalogue AS catalogue
WHERE catalogue.catalogue_key = 'tappd:special:profile_theme:tap_god'
  AND NOT EXISTS (
    SELECT 1
    FROM portal_economy_catalogue_prices AS current_price
    WHERE current_price.catalogue_id = catalogue.id
      AND current_price.is_current = TRUE
  );

UPDATE portal_inventory_items AS item
INNER JOIN portal_economy_catalogue AS catalogue
  ON catalogue.id = item.catalogue_id
SET item.item_type = 'profile_theme',
    item.rarity_rank = 8,
    item.attributes = JSON_SET(
      COALESCE(item.attributes, JSON_OBJECT()),
      '$.customProduct', TRUE,
      '$.profileThemeKey', 'tap_god'
    )
WHERE catalogue.catalogue_key = 'tappd:special:profile_theme:tap_god';
