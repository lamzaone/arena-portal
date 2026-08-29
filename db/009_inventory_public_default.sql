ALTER TABLE portal_player_settings
  MODIFY inventory_visibility ENUM('private', 'public') NOT NULL DEFAULT 'public';
