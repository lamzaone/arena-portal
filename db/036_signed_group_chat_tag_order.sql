-- Apply to PORTAL_DATABASE_URL after 035_game_panel_adapter.sql.
-- Preserve existing unsigned values while allowing tags to precede VIP with -1.
ALTER TABLE portal_identity_group_chat_tags
  MODIFY sort_order INT NOT NULL DEFAULT 0;
