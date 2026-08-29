-- Group-owned account-bound rewards are entitlements, not permanent grants.
-- Keep the award ledger immutable enough for audit/idempotency while recording
-- whether the granting membership is currently effective.  The final flag is
-- deliberately separate from inventory state so a later group re-grant never
-- restores an item that staff revoked independently.

ALTER TABLE portal_identity_group_reward_awards
  ADD COLUMN IF NOT EXISTS entitlement_active BOOLEAN NOT NULL DEFAULT TRUE AFTER awarded_at,
  ADD COLUMN IF NOT EXISTS entitlement_revoked_at TIMESTAMP NULL DEFAULT NULL AFTER entitlement_active,
  ADD COLUMN IF NOT EXISTS entitlement_revoked_by_steam_id VARCHAR(17) NULL AFTER entitlement_revoked_at,
  ADD COLUMN IF NOT EXISTS item_revoked_by_entitlement BOOLEAN NOT NULL DEFAULT FALSE AFTER entitlement_revoked_by_steam_id;
