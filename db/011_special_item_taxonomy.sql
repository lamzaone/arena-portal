-- Run after 010_economy_discount_rules.sql.
--
-- Portal-native products use real item types and rank 8 (Special). Rank 8 is
-- reserved for trusted custom catalogue products; imported CS2 rarity remains
-- capped at rank 7 (Extraordinary). This migration also adds an authoritative
-- per-instance transferability flag for rewards that must stay account-bound.

-- MariaDB DDL auto-commits. Reject unexpected legacy shapes before removing
-- the old checks so a bad row cannot leave the schema only partially guarded.
-- Known VIP bootstrap rows and the BETA TESTER key are repaired below.
DROP TEMPORARY TABLE IF EXISTS portal_special_taxonomy_preflight;
CREATE TEMPORARY TABLE portal_special_taxonomy_preflight (
  ok TINYINT NOT NULL,
  CONSTRAINT portal_special_taxonomy_legacy_data_invalid CHECK (ok = 1)
) ENGINE=MEMORY;
INSERT INTO portal_special_taxonomy_preflight (ok)
SELECT 0
WHERE EXISTS (
  SELECT 1
  FROM portal_economy_catalogue AS catalogue
  WHERE catalogue.rarity_rank > 8
     OR (
       catalogue.rarity_rank = 8
       AND LOWER(COALESCE(JSON_UNQUOTE(JSON_EXTRACT(catalogue.metadata, '$.customProduct')), 'false')) NOT IN ('true', '1')
       AND COALESCE(catalogue.item_type, '') NOT IN ('vip_membership', 'profile_theme')
       AND COALESCE(catalogue.catalogue_key, '') NOT LIKE 'tappd:special:vip:%'
       AND COALESCE(catalogue.catalogue_key, '') <> 'tappd:special:profile_theme:beta_tester'
       AND COALESCE(JSON_UNQUOTE(JSON_EXTRACT(catalogue.metadata, '$.specialKind')), '') <> 'vip_membership'
     )
)
OR EXISTS (
  SELECT 1
  FROM portal_inventory_items AS item
  LEFT JOIN portal_economy_catalogue AS catalogue ON catalogue.id = item.catalogue_id
  WHERE item.rarity_rank > 8
     OR (
       item.item_type IN ('vip_membership', 'profile_theme')
       AND (
         catalogue.id IS NULL
         OR (
           catalogue.item_type NOT IN ('vip_membership', 'profile_theme')
           AND catalogue.catalogue_key NOT LIKE 'tappd:special:vip:%'
           AND catalogue.catalogue_key <> 'tappd:special:profile_theme:beta_tester'
           AND COALESCE(JSON_UNQUOTE(JSON_EXTRACT(catalogue.metadata, '$.specialKind')), '') <> 'vip_membership'
         )
       )
     )
     OR (
       item.rarity_rank = 8
       AND LOWER(COALESCE(JSON_UNQUOTE(JSON_EXTRACT(item.attributes, '$.customProduct')), 'false')) NOT IN ('true', '1')
       AND COALESCE(catalogue.item_type, '') NOT IN ('vip_membership', 'profile_theme')
       AND COALESCE(catalogue.catalogue_key, '') NOT LIKE 'tappd:special:vip:%'
       AND COALESCE(catalogue.catalogue_key, '') <> 'tappd:special:profile_theme:beta_tester'
       AND COALESCE(JSON_UNQUOTE(JSON_EXTRACT(catalogue.metadata, '$.specialKind')), '') <> 'vip_membership'
     )
);
DROP TEMPORARY TABLE portal_special_taxonomy_preflight;

ALTER TABLE portal_economy_catalogue
  DROP CONSTRAINT IF EXISTS portal_economy_catalogue_item_type_known,
  DROP CONSTRAINT IF EXISTS portal_economy_catalogue_rarity_known,
  DROP CONSTRAINT IF EXISTS portal_economy_catalogue_special_custom,
  DROP CONSTRAINT IF EXISTS portal_economy_catalogue_native_product_shape;

ALTER TABLE portal_inventory_items
  DROP CONSTRAINT IF EXISTS portal_inventory_items_item_type_known,
  DROP CONSTRAINT IF EXISTS portal_inventory_items_rarity_known,
  DROP CONSTRAINT IF EXISTS portal_inventory_items_special_custom,
  DROP CONSTRAINT IF EXISTS portal_inventory_items_native_product_shape;

ALTER TABLE portal_economy_discount_rules
  DROP CONSTRAINT IF EXISTS portal_economy_discount_rules_item_type_known;

ALTER TABLE portal_inventory_items
  ADD COLUMN IF NOT EXISTS tradable BOOLEAN NOT NULL DEFAULT TRUE AFTER rarity_rank;

-- Migrate every bootstrapped VIP product and every linked historical/current
-- instance. The catalogue key is included so this also repairs early rows
-- whose metadata was incomplete.
UPDATE portal_economy_catalogue
SET item_type = 'vip_membership',
    rarity_rank = 8,
    metadata = JSON_SET(
      metadata,
      '$.specialKind', 'vip_membership',
      '$.customProduct', TRUE
    )
WHERE catalogue_key LIKE 'tappd:special:vip:%'
   OR item_type = 'vip_membership'
   OR JSON_UNQUOTE(JSON_EXTRACT(metadata, '$.specialKind')) = 'vip_membership';

-- Trusted presentation definition. CSS and markup remain code-owned; this row
-- grants only the stable key used by the profile renderer.
INSERT INTO portal_profile_themes
  (theme_key, display_name, description, preview_image_url, enabled)
VALUES
  (
    'beta_tester',
    'BETA TESTER',
    'Cyberpunk blue-and-yellow profile with sharp cuts, animated accents, and custom hover effects.',
    '/images/economy/profile-themes/beta-tester.svg',
    TRUE
  )
ON DUPLICATE KEY UPDATE
  theme_key = VALUES(theme_key);

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
    'tappd:special:profile_theme:beta_tester',
    NULL,
    'profile_theme',
    NULL,
    NULL,
    8,
    'BETA TESTER Theme',
    JSON_OBJECT(
      'source', 'ARENA Portal',
      'customProduct', TRUE,
      'profileThemeKey', 'beta_tester',
      'marketEnabled', TRUE,
      'imageUrl', '/images/economy/profile-themes/beta-tester.svg',
      'description', 'Equip this inventory item to transform your profile with the BETA TESTER cyberpunk blue-and-yellow presentation.'
    ),
    TRUE
  )
ON DUPLICATE KEY UPDATE
  item_type = VALUES(item_type),
  rarity_rank = VALUES(rarity_rank),
  metadata = JSON_SET(
    metadata,
    '$.customProduct', TRUE,
    '$.profileThemeKey', 'beta_tester'
  );

-- Native products are catalogue-backed trusted custom products. This also
-- repairs concrete instances from partial/older runs after the catalogue
-- upserts have established their final type and rarity.
UPDATE portal_economy_catalogue
SET rarity_rank = 8,
    metadata = JSON_SET(metadata, '$.customProduct', TRUE)
WHERE item_type IN ('vip_membership', 'profile_theme');

UPDATE portal_inventory_items AS item
INNER JOIN portal_economy_catalogue AS catalogue
  ON catalogue.id = item.catalogue_id
SET item.item_type = catalogue.item_type,
    item.rarity_rank = catalogue.rarity_rank,
    item.attributes = JSON_SET(item.attributes, '$.customProduct', TRUE)
WHERE catalogue.item_type IN ('vip_membership', 'profile_theme');

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
  'BETA TESTER profile theme launch price: 999999 Tokens',
  TRUE
FROM portal_economy_catalogue AS catalogue
WHERE catalogue.catalogue_key = 'tappd:special:profile_theme:beta_tester'
  AND NOT EXISTS (
    SELECT 1
    FROM portal_economy_catalogue_prices AS current_price
    WHERE current_price.catalogue_id = catalogue.id
      AND current_price.is_current = TRUE
  );

ALTER TABLE portal_economy_catalogue
  ADD CONSTRAINT portal_economy_catalogue_item_type_known CHECK (
    item_type IN (
      'skin', 'knife', 'glove', 'crate', 'capsule', 'nametag', 'sticker',
      'agent', 'music_kit', 'keychain', 'patch', 'graffiti',
      'vip_membership', 'profile_theme'
    )
  ),
  ADD CONSTRAINT portal_economy_catalogue_rarity_known CHECK (
    rarity_rank <= 8
  ),
  ADD CONSTRAINT portal_economy_catalogue_special_custom CHECK (
    rarity_rank <> 8 OR
    LOWER(COALESCE(
      JSON_UNQUOTE(JSON_EXTRACT(metadata, '$.customProduct')),
      'false'
    )) IN ('true', '1')
  ),
  ADD CONSTRAINT portal_economy_catalogue_native_product_shape CHECK (
    item_type NOT IN ('vip_membership', 'profile_theme') OR (
      rarity_rank = 8 AND
      LOWER(COALESCE(
        JSON_UNQUOTE(JSON_EXTRACT(metadata, '$.customProduct')),
        'false'
      )) IN ('true', '1')
    )
  );

ALTER TABLE portal_inventory_items
  ADD CONSTRAINT portal_inventory_items_item_type_known CHECK (
    item_type IN (
      'skin', 'knife', 'glove', 'crate', 'capsule', 'nametag', 'sticker',
      'agent', 'music_kit', 'keychain', 'patch', 'graffiti',
      'vip_membership', 'profile_theme'
    )
  ),
  ADD CONSTRAINT portal_inventory_items_rarity_known CHECK (
    rarity_rank <= 8
  ),
  ADD CONSTRAINT portal_inventory_items_special_custom CHECK (
    rarity_rank <> 8 OR
    LOWER(COALESCE(
      JSON_UNQUOTE(JSON_EXTRACT(attributes, '$.customProduct')),
      'false'
    )) IN ('true', '1')
  ),
  ADD CONSTRAINT portal_inventory_items_native_product_shape CHECK (
    item_type NOT IN ('vip_membership', 'profile_theme') OR (
      catalogue_id IS NOT NULL AND
      rarity_rank = 8 AND
      LOWER(COALESCE(
        JSON_UNQUOTE(JSON_EXTRACT(attributes, '$.customProduct')),
        'false'
      )) IN ('true', '1')
    )
  );

ALTER TABLE portal_economy_discount_rules
  ADD CONSTRAINT portal_economy_discount_rules_item_type_known CHECK (
    item_type IS NULL OR item_type IN (
      'skin', 'knife', 'glove', 'crate', 'capsule', 'nametag', 'sticker',
      'agent', 'music_kit', 'keychain', 'patch', 'graffiti',
      'vip_membership', 'profile_theme'
    )
  );
