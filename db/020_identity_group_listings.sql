-- Run this migration against PORTAL_DATABASE_URL after 019_vip_perks.sql.
--
-- A listing is the single editable sales definition for a catalogue-backed
-- membership item. The same item can be published independently on the EUR
-- donation page and in the Token marketplace. The purchased inventory row
-- snapshots this metadata, so later listing edits never rewrite an owned
-- entitlement.

CREATE TABLE IF NOT EXISTS portal_identity_group_listings (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  group_id BIGINT UNSIGNED NOT NULL,
  catalogue_id BIGINT UNSIGNED NULL,
  listing_name VARCHAR(180) NOT NULL,
  description VARCHAR(255) NULL,
  duration_minutes INT UNSIGNED NOT NULL,
  euro_price_cents BIGINT UNSIGNED NOT NULL DEFAULT 500,
  token_price BIGINT UNSIGNED NOT NULL DEFAULT 500,
  vip_page_enabled BOOLEAN NOT NULL DEFAULT FALSE,
  market_enabled BOOLEAN NOT NULL DEFAULT FALSE,
  enabled BOOLEAN NOT NULL DEFAULT TRUE,
  sort_order INT NOT NULL DEFAULT 0,
  created_by_steam_id VARCHAR(17) NOT NULL,
  updated_by_steam_id VARCHAR(17) NOT NULL,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  UNIQUE KEY portal_identity_group_listings_catalogue_unique (catalogue_id),
  KEY portal_identity_group_listings_group (group_id, enabled, sort_order, id),
  KEY portal_identity_group_listings_vip_page (enabled, vip_page_enabled, sort_order, id),
  KEY portal_identity_group_listings_market (enabled, market_enabled, sort_order, id),
  CONSTRAINT portal_identity_group_listings_group_fk FOREIGN KEY (group_id) REFERENCES portal_identity_groups (id) ON DELETE RESTRICT,
  CONSTRAINT portal_identity_group_listings_catalogue_fk FOREIGN KEY (catalogue_id) REFERENCES portal_economy_catalogue (id) ON DELETE RESTRICT,
  CONSTRAINT portal_identity_group_listings_duration_valid CHECK (duration_minutes BETWEEN 0 AND 525600),
  CONSTRAINT portal_identity_group_listings_euro_price_valid CHECK (euro_price_cents BETWEEN 1 AND 1000000000),
  CONSTRAINT portal_identity_group_listings_token_price_valid CHECK (token_price BETWEEN 1 AND 1000000000),
  CONSTRAINT portal_identity_group_listings_sort_order_valid CHECK (sort_order BETWEEN -1000000 AND 1000000)
) ENGINE=InnoDB DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- Preserve every existing TAPPED.Inventory VIP product and its catalogue ID.
-- The one-month variants also replace the old hard-coded EUR cards on /vip.
INSERT IGNORE INTO portal_identity_group_listings
  (
    group_id,
    catalogue_id,
    listing_name,
    description,
    duration_minutes,
    euro_price_cents,
    token_price,
    vip_page_enabled,
    market_enabled,
    enabled,
    sort_order,
    created_by_steam_id,
    updated_by_steam_id
  )
SELECT
  identity_group.id,
  catalogue.id,
  catalogue.display_name,
  NULLIF(JSON_UNQUOTE(JSON_EXTRACT(catalogue.metadata, '$.description')), 'null'),
  CAST(JSON_UNQUOTE(JSON_EXTRACT(catalogue.metadata, '$.vipDurationMinutes')) AS UNSIGNED),
  CASE
    WHEN CAST(JSON_UNQUOTE(JSON_EXTRACT(catalogue.metadata, '$.vipDurationMinutes')) AS UNSIGNED) = 43200
    THEN CASE UPPER(identity_group.external_key)
      WHEN 'STANDARD' THEN 500
      WHEN 'SILVER' THEN 1000
      WHEN 'GOLD' THEN 1500
      WHEN 'DIAMOND' THEN 2000
      WHEN 'ULTIMATE' THEN 2500
      ELSE GREATEST(LEAST(COALESCE(prices.market_price_eur_cents, 500), 1000000000), 1)
    END
    ELSE GREATEST(LEAST(COALESCE(prices.market_price_eur_cents, 500), 1000000000), 1)
  END,
  GREATEST(LEAST(COALESCE(prices.market_price_eur_cents, 500), 1000000000), 1),
  definitions.group_id IS NOT NULL
    AND CAST(JSON_UNQUOTE(JSON_EXTRACT(catalogue.metadata, '$.vipDurationMinutes')) AS UNSIGNED) = 43200,
  definitions.group_id IS NOT NULL
    AND LOWER(COALESCE(JSON_UNQUOTE(JSON_EXTRACT(catalogue.metadata, '$.marketEnabled')), 'true')) IN ('true', '1'),
  catalogue.enabled AND definitions.group_id IS NOT NULL,
  GREATEST(-1000000, LEAST(1000000, -COALESCE(definitions.rank_weight, identity_group.profile_priority))),
  'system',
  'system'
FROM portal_economy_catalogue AS catalogue
INNER JOIN portal_identity_groups AS identity_group
  ON identity_group.source_type = 'vipcore'
 AND UPPER(identity_group.external_key) = UPPER(JSON_UNQUOTE(JSON_EXTRACT(catalogue.metadata, '$.vipTier')))
LEFT JOIN portal_identity_external_group_definitions AS definitions
  ON definitions.group_id = identity_group.id
 AND definitions.source_type = identity_group.source_type
 AND definitions.external_key = identity_group.external_key
LEFT JOIN portal_economy_catalogue_prices AS prices
  ON prices.catalogue_id = catalogue.id
 AND prices.is_current = TRUE
WHERE catalogue.item_type = 'vip_membership'
  AND JSON_UNQUOTE(JSON_EXTRACT(catalogue.metadata, '$.vipDurationMinutes')) REGEXP '^[0-9]{1,6}$'
  AND CAST(JSON_UNQUOTE(JSON_EXTRACT(catalogue.metadata, '$.vipDurationMinutes')) AS UNSIGNED) BETWEEN 0 AND 525600;

-- Make sure every connected VIPCore group has an editable monthly donation
-- item even on a fresh database where the inventory plug-in has not seeded its
-- legacy catalogue yet.
INSERT IGNORE INTO portal_economy_catalogue
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
SELECT
  CONCAT('tappd:special:group-membership:', identity_group.id, ':monthly'),
  NULL,
  'vip_membership',
  NULL,
  NULL,
  8,
  CONCAT(identity_group.display_name, ' - 1 Month'),
  JSON_OBJECT(
    'source', 'ARENA Portal',
    'specialKind', 'vip_membership',
    'customProduct', JSON_EXTRACT('true', '$'),
    'membershipListingManaged', JSON_EXTRACT('true', '$'),
    'membershipGroupId', identity_group.id,
    'membershipGroupKey', identity_group.group_key,
    'membershipGroupName', identity_group.display_name,
    'membershipSourceType', identity_group.source_type,
    'membershipExternalKey', identity_group.external_key,
    'membershipDurationMinutes', 43200,
    'vipTier', identity_group.external_key,
    'vipDurationMinutes', 43200,
    'marketEnabled', JSON_EXTRACT('false', '$'),
    'description', CONCAT('Activates ', identity_group.display_name, ' for one month.')
  ),
  TRUE
FROM portal_identity_groups AS identity_group
INNER JOIN portal_identity_external_group_definitions AS definitions
  ON definitions.group_id = identity_group.id
 AND definitions.source_type = identity_group.source_type
 AND definitions.external_key = identity_group.external_key
WHERE identity_group.source_type = 'vipcore'
  AND identity_group.enabled = TRUE
  AND NOT EXISTS (
    SELECT 1
    FROM portal_identity_group_listings AS listings
    WHERE listings.group_id = identity_group.id
      AND listings.duration_minutes = 43200
  );

INSERT IGNORE INTO portal_identity_group_listings
  (
    group_id,
    catalogue_id,
    listing_name,
    description,
    duration_minutes,
    euro_price_cents,
    token_price,
    vip_page_enabled,
    market_enabled,
    enabled,
    sort_order,
    created_by_steam_id,
    updated_by_steam_id
  )
SELECT
  identity_group.id,
  catalogue.id,
  catalogue.display_name,
  NULLIF(JSON_UNQUOTE(JSON_EXTRACT(catalogue.metadata, '$.description')), 'null'),
  43200,
  CASE UPPER(identity_group.external_key)
    WHEN 'STANDARD' THEN 500
    WHEN 'SILVER' THEN 1000
    WHEN 'GOLD' THEN 1500
    WHEN 'DIAMOND' THEN 2000
    WHEN 'ULTIMATE' THEN 2500
    ELSE 500
  END,
  CASE UPPER(identity_group.external_key)
    WHEN 'STANDARD' THEN 500
    WHEN 'SILVER' THEN 1000
    WHEN 'GOLD' THEN 1500
    WHEN 'DIAMOND' THEN 2000
    WHEN 'ULTIMATE' THEN 2500
    ELSE 500
  END,
  TRUE,
  FALSE,
  TRUE,
  GREATEST(-1000000, LEAST(1000000, -COALESCE(definitions.rank_weight, identity_group.profile_priority))),
  'system',
  'system'
FROM portal_identity_groups AS identity_group
INNER JOIN portal_economy_catalogue AS catalogue
  ON catalogue.catalogue_key = CONCAT('tappd:special:group-membership:', identity_group.id, ':monthly')
INNER JOIN portal_identity_external_group_definitions AS definitions
  ON definitions.group_id = identity_group.id
 AND definitions.source_type = identity_group.source_type
 AND definitions.external_key = identity_group.external_key
WHERE identity_group.source_type = 'vipcore';

-- Keep the legacy 24-hour and 7-day Token products, but bring them under the
-- same listing authority instead of letting a later inventory bootstrap add
-- unmanaged catalogue rows. If the plug-in ran first, the opening backfill
-- above already adopted those exact products and these inserts are no-ops.
INSERT IGNORE INTO portal_economy_catalogue
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
SELECT
  CONCAT('tappd:special:group-membership:', identity_group.id, ':', variants.duration_code),
  NULL,
  'vip_membership',
  NULL,
  NULL,
  8,
  CONCAT(identity_group.display_name, ' VIP - ', variants.duration_label),
  JSON_OBJECT(
    'source', 'ARENA Portal',
    'specialKind', 'vip_membership',
    'customProduct', JSON_EXTRACT('true', '$'),
    'membershipListingManaged', JSON_EXTRACT('true', '$'),
    'membershipGroupId', identity_group.id,
    'membershipGroupKey', identity_group.group_key,
    'membershipGroupName', identity_group.display_name,
    'membershipSourceType', identity_group.source_type,
    'membershipExternalKey', identity_group.external_key,
    'membershipDurationMinutes', variants.duration_minutes,
    'vipTier', identity_group.external_key,
    'vipDurationMinutes', variants.duration_minutes,
    'marketEnabled', JSON_EXTRACT('true', '$'),
    'description', CONCAT('Activates ', identity_group.display_name, ' VIP for ', variants.duration_label, '.'),
    'imageUrl', CONCAT('/images/economy/vip/', LOWER(identity_group.external_key), '.png')
  ),
  TRUE
FROM portal_identity_groups AS identity_group
INNER JOIN portal_identity_external_group_definitions AS definitions
  ON definitions.group_id = identity_group.id
 AND definitions.source_type = identity_group.source_type
 AND definitions.external_key = identity_group.external_key
CROSS JOIN (
  SELECT '24h' AS duration_code, '24 Hours' AS duration_label, 1440 AS duration_minutes
  UNION ALL
  SELECT '7d', '7 Days', 10080
) AS variants
WHERE identity_group.source_type = 'vipcore'
  AND identity_group.enabled = TRUE
  AND NOT EXISTS (
    SELECT 1
    FROM portal_identity_group_listings AS listings
    WHERE listings.group_id = identity_group.id
      AND listings.duration_minutes = variants.duration_minutes
  );

INSERT IGNORE INTO portal_identity_group_listings
  (
    group_id,
    catalogue_id,
    listing_name,
    description,
    duration_minutes,
    euro_price_cents,
    token_price,
    vip_page_enabled,
    market_enabled,
    enabled,
    sort_order,
    created_by_steam_id,
    updated_by_steam_id
  )
SELECT
  identity_group.id,
  catalogue.id,
  catalogue.display_name,
  NULLIF(JSON_UNQUOTE(JSON_EXTRACT(catalogue.metadata, '$.description')), 'null'),
  variants.duration_minutes,
  CEIL((CASE UPPER(identity_group.external_key)
    WHEN 'STANDARD' THEN 500
    WHEN 'SILVER' THEN 1000
    WHEN 'GOLD' THEN 1500
    WHEN 'DIAMOND' THEN 2000
    WHEN 'ULTIMATE' THEN 2500
    ELSE 500
  END) * variants.duration_minutes / 43200),
  CEIL((CASE UPPER(identity_group.external_key)
    WHEN 'STANDARD' THEN 500
    WHEN 'SILVER' THEN 1000
    WHEN 'GOLD' THEN 1500
    WHEN 'DIAMOND' THEN 2000
    WHEN 'ULTIMATE' THEN 2500
    ELSE 500
  END) * variants.duration_minutes / 43200),
  FALSE,
  TRUE,
  TRUE,
  GREATEST(-1000000, LEAST(1000000, variants.sort_order - COALESCE(definitions.rank_weight, identity_group.profile_priority))),
  'system',
  'system'
FROM portal_identity_groups AS identity_group
CROSS JOIN (
  SELECT '24h' AS duration_code, 1440 AS duration_minutes, 100 AS sort_order
  UNION ALL
  SELECT '7d', 10080, 200
) AS variants
INNER JOIN portal_economy_catalogue AS catalogue
  ON catalogue.catalogue_key = CONCAT('tappd:special:group-membership:', identity_group.id, ':', variants.duration_code)
INNER JOIN portal_identity_external_group_definitions AS definitions
  ON definitions.group_id = identity_group.id
 AND definitions.source_type = identity_group.source_type
 AND definitions.external_key = identity_group.external_key
WHERE identity_group.source_type = 'vipcore';

-- Permanent donation products are first-class inventory items too. They are
-- hidden from the Token market by default, but staff may publish them there.
INSERT IGNORE INTO portal_economy_catalogue
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
SELECT
  CONCAT('tappd:special:group-membership:', identity_group.id, ':permanent'),
  NULL,
  'vip_membership',
  NULL,
  NULL,
  8,
  CONCAT(identity_group.display_name, ' - Permanent'),
  JSON_OBJECT(
    'source', 'ARENA Portal',
    'specialKind', 'vip_membership',
    'customProduct', JSON_EXTRACT('true', '$'),
    'membershipListingManaged', JSON_EXTRACT('true', '$'),
    'membershipGroupId', identity_group.id,
    'membershipGroupKey', identity_group.group_key,
    'membershipGroupName', identity_group.display_name,
    'membershipSourceType', identity_group.source_type,
    'membershipExternalKey', identity_group.external_key,
    'membershipDurationMinutes', 0,
    'vipTier', identity_group.external_key,
    'vipDurationMinutes', 0,
    'marketEnabled', JSON_EXTRACT('false', '$'),
    'description', CONCAT('Activates permanent ', identity_group.display_name, ' membership.')
  ),
  TRUE
FROM portal_identity_groups AS identity_group
INNER JOIN portal_identity_external_group_definitions AS definitions
  ON definitions.group_id = identity_group.id
 AND definitions.source_type = identity_group.source_type
 AND definitions.external_key = identity_group.external_key
WHERE identity_group.source_type = 'vipcore'
  AND identity_group.enabled = TRUE
  AND NOT EXISTS (
    SELECT 1
    FROM portal_identity_group_listings AS listings
    WHERE listings.group_id = identity_group.id
      AND listings.duration_minutes = 0
  );

INSERT IGNORE INTO portal_identity_group_listings
  (
    group_id,
    catalogue_id,
    listing_name,
    description,
    duration_minutes,
    euro_price_cents,
    token_price,
    vip_page_enabled,
    market_enabled,
    enabled,
    sort_order,
    created_by_steam_id,
    updated_by_steam_id
  )
SELECT
  identity_group.id,
  catalogue.id,
  catalogue.display_name,
  NULLIF(JSON_UNQUOTE(JSON_EXTRACT(catalogue.metadata, '$.description')), 'null'),
  0,
  3 * CASE UPPER(identity_group.external_key)
    WHEN 'STANDARD' THEN 500
    WHEN 'SILVER' THEN 1000
    WHEN 'GOLD' THEN 1500
    WHEN 'DIAMOND' THEN 2000
    WHEN 'ULTIMATE' THEN 2500
    ELSE 500
  END,
  3 * CASE UPPER(identity_group.external_key)
    WHEN 'STANDARD' THEN 500
    WHEN 'SILVER' THEN 1000
    WHEN 'GOLD' THEN 1500
    WHEN 'DIAMOND' THEN 2000
    WHEN 'ULTIMATE' THEN 2500
    ELSE 500
  END,
  TRUE,
  FALSE,
  TRUE,
  GREATEST(-1000000, LEAST(1000000, 1000 - COALESCE(definitions.rank_weight, identity_group.profile_priority))),
  'system',
  'system'
FROM portal_identity_groups AS identity_group
INNER JOIN portal_economy_catalogue AS catalogue
  ON catalogue.catalogue_key = CONCAT('tappd:special:group-membership:', identity_group.id, ':permanent')
INNER JOIN portal_identity_external_group_definitions AS definitions
  ON definitions.group_id = identity_group.id
 AND definitions.source_type = identity_group.source_type
 AND definitions.external_key = identity_group.external_key
WHERE identity_group.source_type = 'vipcore';

-- Add a current catalogue price only when a listing-managed item does not
-- already have one. The listing table remains authoritative for the separate
-- EUR and Token values; this snapshot exists for normal inventory rendering.
INSERT INTO portal_economy_catalogue_prices
  (catalogue_id, market_price_eur_cents, price_source, source_reference, is_current)
SELECT
  listings.catalogue_id,
  CASE WHEN listings.market_enabled THEN listings.token_price ELSE listings.euro_price_cents END,
  'group-listing-v1',
  CONCAT('Identity group listing ', listings.id),
  TRUE
FROM portal_identity_group_listings AS listings
WHERE listings.catalogue_id IS NOT NULL
  AND NOT EXISTS (
    SELECT 1
    FROM portal_economy_catalogue_prices AS current_price
    WHERE current_price.catalogue_id = listings.catalogue_id
      AND current_price.is_current = TRUE
  );

-- Normalize legacy items to the generic identity-group entitlement contract.
UPDATE portal_economy_catalogue AS catalogue
INNER JOIN portal_identity_group_listings AS listings ON listings.catalogue_id = catalogue.id
INNER JOIN portal_identity_groups AS identity_group ON identity_group.id = listings.group_id
SET catalogue.item_type = 'vip_membership',
    catalogue.rarity_rank = 8,
    catalogue.metadata = JSON_SET(
      catalogue.metadata,
      '$.specialKind', 'vip_membership',
      '$.customProduct', JSON_EXTRACT('true', '$'),
      '$.membershipListingManaged', JSON_EXTRACT('true', '$'),
      '$.membershipListingId', listings.id,
      '$.membershipGroupId', identity_group.id,
      '$.membershipGroupKey', identity_group.group_key,
      '$.membershipGroupName', identity_group.display_name,
      '$.membershipSourceType', identity_group.source_type,
      '$.membershipExternalKey', identity_group.external_key,
      '$.membershipDurationMinutes', listings.duration_minutes,
      '$.marketEnabled', JSON_EXTRACT(IF(listings.enabled AND listings.market_enabled, 'true', 'false'), '$'),
      '$.donationEnabled', JSON_EXTRACT(IF(listings.enabled AND listings.vip_page_enabled, 'true', 'false'), '$'),
      '$.donationPriceEuroCents', listings.euro_price_cents,
      '$.description', COALESCE(listings.description, '')
    );

UPDATE portal_inventory_items AS items
INNER JOIN portal_economy_catalogue AS catalogue ON catalogue.id = items.catalogue_id
SET items.item_type = 'vip_membership',
    items.rarity_rank = 8,
    items.attributes = JSON_SET(items.attributes, '$.customProduct', TRUE)
WHERE catalogue.item_type = 'vip_membership';

-- Founder remains an external Admins.Core trust anchor. Admins.Core
-- intentionally ignores portal Founder memberships, so a legacy listing for
-- that group must never stay visible or purchasable.
UPDATE portal_identity_group_listings AS listings
INNER JOIN portal_identity_groups AS identity_group ON identity_group.id = listings.group_id
SET listings.enabled = FALSE,
    listings.vip_page_enabled = FALSE,
    listings.market_enabled = FALSE,
    listings.updated_by_steam_id = 'system'
WHERE identity_group.source_type = 'admins_core'
  AND LOWER(TRIM(COALESCE(identity_group.external_key, ''))) = 'founder';

-- External groups remain sellable only while their current Admins.Core or
-- VIPCore definition is present. Catalogue synchronization can retire a stale
-- definition without deleting the presentation row, so fail those listings
-- closed on both storefront channels.
UPDATE portal_identity_group_listings AS listings
INNER JOIN portal_identity_groups AS identity_group ON identity_group.id = listings.group_id
LEFT JOIN portal_identity_external_group_definitions AS external_definition
  ON external_definition.group_id = identity_group.id
 AND external_definition.source_type = identity_group.source_type
 AND external_definition.external_key = identity_group.external_key
SET listings.enabled = FALSE,
    listings.vip_page_enabled = FALSE,
    listings.market_enabled = FALSE,
    listings.updated_by_steam_id = 'system'
WHERE identity_group.source_type IN ('admins_core', 'vipcore')
  AND external_definition.group_id IS NULL;

UPDATE portal_economy_catalogue AS catalogue
INNER JOIN portal_identity_group_listings AS listings ON listings.catalogue_id = catalogue.id
INNER JOIN portal_identity_groups AS identity_group ON identity_group.id = listings.group_id
LEFT JOIN portal_identity_external_group_definitions AS external_definition
  ON external_definition.group_id = identity_group.id
 AND external_definition.source_type = identity_group.source_type
 AND external_definition.external_key = identity_group.external_key
SET catalogue.metadata = JSON_SET(
      catalogue.metadata,
      '$.marketEnabled', JSON_EXTRACT('false', '$'),
      '$.donationEnabled', JSON_EXTRACT('false', '$')
    )
WHERE identity_group.source_type IN ('admins_core', 'vipcore')
  AND external_definition.group_id IS NULL;

UPDATE portal_economy_catalogue AS catalogue
INNER JOIN portal_identity_group_listings AS listings ON listings.catalogue_id = catalogue.id
INNER JOIN portal_identity_groups AS identity_group ON identity_group.id = listings.group_id
SET catalogue.metadata = JSON_SET(
      catalogue.metadata,
      '$.marketEnabled', JSON_EXTRACT('false', '$'),
      '$.donationEnabled', JSON_EXTRACT('false', '$')
    )
WHERE identity_group.source_type = 'admins_core'
  AND LOWER(TRIM(COALESCE(identity_group.external_key, ''))) = 'founder';
