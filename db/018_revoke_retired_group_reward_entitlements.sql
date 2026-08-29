-- Run this migration against PORTAL_DATABASE_URL after
-- 017_tap_god_profile_theme.sql.
--
-- Older portal builds retained inventory instances when an account-bound
-- group reward was retired. Backfill those stale entitlements using the same
-- non-destructive `revoked` inventory state used by the runtime lifecycle.

START TRANSACTION;

CREATE TEMPORARY TABLE portal_retired_group_reward_targets (
  reward_id BIGINT UNSIGNED NOT NULL,
  steam_id VARCHAR(17) NOT NULL,
  ordinal SMALLINT UNSIGNED NOT NULL,
  item_id CHAR(36) CHARACTER SET ascii COLLATE ascii_general_ci NOT NULL,
  item_state VARCHAR(16) NOT NULL,
  PRIMARY KEY (reward_id, steam_id, ordinal),
  UNIQUE KEY portal_retired_group_reward_targets_item (item_id)
) ENGINE=InnoDB;

INSERT INTO portal_retired_group_reward_targets
  (reward_id, steam_id, ordinal, item_id, item_state)
SELECT
  awards.reward_id,
  awards.steam_id,
  awards.ordinal,
  awards.item_id,
  items.state
FROM portal_identity_group_reward_awards AS awards
INNER JOIN portal_identity_group_rewards AS rewards
  ON rewards.id = awards.reward_id
INNER JOIN portal_inventory_items AS items
  ON items.id = awards.item_id
  AND items.owner_steam_id = awards.steam_id
WHERE rewards.enabled = FALSE
  AND rewards.trade_policy = 'account_bound'
  AND awards.entitlement_active = TRUE
  AND items.tradable = FALSE
  AND items.state <> 'escrowed';

UPDATE portal_player_settings AS settings
INNER JOIN portal_retired_group_reward_targets AS targets
  ON targets.steam_id = settings.steam_id
  AND targets.item_id = settings.active_theme_item_id
SET settings.active_theme_id = NULL,
    settings.active_theme_item_id = NULL;

UPDATE portal_loadout_slots AS slots
INNER JOIN portal_retired_group_reward_targets AS targets
  ON targets.steam_id = slots.owner_steam_id
  AND targets.item_id = slots.item_id
SET slots.item_id = NULL;

-- Preserve stickers attached to a revoked weapon. A sticker which is itself
-- a retired target remains destined for revocation below.
UPDATE portal_inventory_items AS stickers
INNER JOIN portal_inventory_item_stickers AS relations
  ON relations.sticker_item_id = stickers.id
INNER JOIN portal_retired_group_reward_targets AS weapon_targets
  ON weapon_targets.item_id = relations.weapon_item_id
LEFT JOIN portal_retired_group_reward_targets AS sticker_targets
  ON sticker_targets.item_id = relations.sticker_item_id
SET stickers.state = 'available'
WHERE stickers.state = 'attached'
  AND sticker_targets.item_id IS NULL;

DELETE relations
FROM portal_inventory_item_stickers AS relations
LEFT JOIN portal_retired_group_reward_targets AS weapon_targets
  ON weapon_targets.item_id = relations.weapon_item_id
LEFT JOIN portal_retired_group_reward_targets AS sticker_targets
  ON sticker_targets.item_id = relations.sticker_item_id
WHERE weapon_targets.item_id IS NOT NULL
   OR sticker_targets.item_id IS NOT NULL;

INSERT IGNORE INTO portal_inventory_item_events
  (item_id, actor_steam_id, event_type, idempotency_key, line_key, before_state, after_state, metadata)
SELECT
  targets.item_id,
  NULL,
  'identity.group_reward.revoked',
  CONCAT('identity-retired-backfill:', targets.item_id),
  'entitlement',
  JSON_OBJECT(
    'ownerSteamId', targets.steam_id,
    'state', targets.item_state,
    'tradable', FALSE
  ),
  JSON_OBJECT(
    'ownerSteamId', targets.steam_id,
    'state', 'revoked',
    'tradable', FALSE
  ),
  JSON_OBJECT(
    'rewardId', targets.reward_id,
    'ordinal', targets.ordinal,
    'reason', 'retired-group-reward-backfill'
  )
FROM portal_retired_group_reward_targets AS targets
WHERE targets.item_state IN ('available', 'attached');

UPDATE portal_inventory_items AS items
INNER JOIN portal_retired_group_reward_targets AS targets
  ON targets.item_id = items.id
  AND targets.steam_id = items.owner_steam_id
SET items.state = 'revoked'
WHERE items.tradable = FALSE
  AND items.state IN ('available', 'attached');

UPDATE portal_identity_group_reward_awards AS awards
INNER JOIN portal_retired_group_reward_targets AS targets
  ON targets.reward_id = awards.reward_id
  AND targets.steam_id = awards.steam_id
  AND targets.ordinal = awards.ordinal
SET awards.entitlement_active = FALSE,
    awards.entitlement_revoked_at = COALESCE(
      awards.entitlement_revoked_at,
      CURRENT_TIMESTAMP
    ),
    awards.entitlement_revoked_by_steam_id = NULL,
    awards.item_revoked_by_entitlement = targets.item_state IN (
      'available',
      'attached'
    );

INSERT IGNORE INTO portal_economy_jobs
  (job_type, target_steam_id, payload, idempotency_key)
SELECT
  'economy.loadout.refresh',
  targets.steam_id,
  JSON_OBJECT(
    'steamId', targets.steam_id,
    'reason', 'retired-group-reward-backfill',
    'itemIds', JSON_ARRAY(targets.item_id)
  ),
  CONCAT('identity-retired-backfill:', targets.item_id)
FROM portal_retired_group_reward_targets AS targets
WHERE targets.item_state IN ('available', 'attached');

DROP TEMPORARY TABLE portal_retired_group_reward_targets;

COMMIT;
