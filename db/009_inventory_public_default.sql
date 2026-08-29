ALTER TABLE portal_player_settings
  MODIFY inventory_visibility ENUM('private', 'public') NOT NULL DEFAULT 'public';

-- This migration intentionally changes the existing population as well as the
-- default: every inventory starts public and players may opt back into private
-- visibility from their own profile settings.
UPDATE portal_player_settings
SET inventory_visibility = 'public'
WHERE inventory_visibility <> 'public';
