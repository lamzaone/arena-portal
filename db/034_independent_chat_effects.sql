-- Run after 033_rich_chat_tag_styles.sql. Safe to rerun; existing styles survive.
-- Independent effect settings exceed the original shared 96-character fields.
ALTER TABLE portal_identity_chat_tags
  MODIFY COLUMN tag_style VARCHAR(1024) CHARACTER SET ascii COLLATE ascii_general_ci NOT NULL DEFAULT '',
  MODIFY COLUMN name_style VARCHAR(1024) CHARACTER SET ascii COLLATE ascii_general_ci NOT NULL DEFAULT '',
  MODIFY COLUMN message_style VARCHAR(1024) CHARACTER SET ascii COLLATE ascii_general_ci NOT NULL DEFAULT '';
