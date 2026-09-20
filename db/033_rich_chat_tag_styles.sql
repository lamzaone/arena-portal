-- Apply to the Portal database before deploying the rich chat editor.
-- Repeatable on MySQL 8 and MariaDB: metadata guards avoid unsupported
-- ADD COLUMN IF NOT EXISTS / DROP CHECK syntax differences.
-- Existing definitions retain plain styles and no badge. Run one migration session at a time.

SET @chat_ddl = IF(EXISTS(SELECT 1 FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'portal_identity_chat_tags' AND COLUMN_NAME = 'tag_style'), 'SELECT 1', 'ALTER TABLE portal_identity_chat_tags ADD COLUMN tag_style VARCHAR(96) CHARACTER SET ascii COLLATE ascii_general_ci NOT NULL DEFAULT ''''');
PREPARE chat_stmt FROM @chat_ddl;
EXECUTE chat_stmt;
DEALLOCATE PREPARE chat_stmt;

SET @chat_ddl = IF(EXISTS(SELECT 1 FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'portal_identity_chat_tags' AND COLUMN_NAME = 'name_style'), 'SELECT 1', 'ALTER TABLE portal_identity_chat_tags ADD COLUMN name_style VARCHAR(96) CHARACTER SET ascii COLLATE ascii_general_ci NOT NULL DEFAULT ''''');
PREPARE chat_stmt FROM @chat_ddl;
EXECUTE chat_stmt;
DEALLOCATE PREPARE chat_stmt;

SET @chat_ddl = IF(EXISTS(SELECT 1 FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'portal_identity_chat_tags' AND COLUMN_NAME = 'message_style'), 'SELECT 1', 'ALTER TABLE portal_identity_chat_tags ADD COLUMN message_style VARCHAR(96) CHARACTER SET ascii COLLATE ascii_general_ci NOT NULL DEFAULT ''''');
PREPARE chat_stmt FROM @chat_ddl;
EXECUTE chat_stmt;
DEALLOCATE PREPARE chat_stmt;

SET @chat_ddl = IF(EXISTS(SELECT 1 FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'portal_identity_chat_tags' AND COLUMN_NAME = 'badge_key'), 'SELECT 1', 'ALTER TABLE portal_identity_chat_tags ADD COLUMN badge_key VARCHAR(32) CHARACTER SET ascii COLLATE ascii_general_ci NOT NULL DEFAULT ''''');
PREPARE chat_stmt FROM @chat_ddl;
EXECUTE chat_stmt;
DEALLOCATE PREPARE chat_stmt;

SET @chat_drop = CONCAT('ALTER TABLE portal_identity_chat_tags ', IF(LOCATE('MariaDB', VERSION()) > 0, 'DROP CONSTRAINT ', 'DROP CHECK '), 'portal_identity_chat_tags_color_valid');
SET @chat_ddl = IF(EXISTS(SELECT 1 FROM information_schema.TABLE_CONSTRAINTS WHERE CONSTRAINT_SCHEMA = DATABASE() AND TABLE_NAME = 'portal_identity_chat_tags' AND CONSTRAINT_NAME = 'portal_identity_chat_tags_color_valid' AND CONSTRAINT_TYPE = 'CHECK'), @chat_drop, 'SELECT 1');
PREPARE chat_stmt FROM @chat_ddl;
EXECUTE chat_stmt;
DEALLOCATE PREPARE chat_stmt;
ALTER TABLE portal_identity_chat_tags ADD CONSTRAINT portal_identity_chat_tags_color_valid
  CHECK (color_token REGEXP '^#[0-9A-Fa-f]{6}$' OR color_token IN ('[default]', '[white]', '[/]', '[grey]', '[gray]', '[silver]', '[bluegrey]', '[darkred]', '[red]', '[lightred]', '[gold]', '[orange]', '[yellow]', '[lightyellow]', '[olive]', '[green]', '[lime]', '[blue]', '[lightblue]', '[darkblue]', '[lightpurple]', '[purple]', '[magenta]', '[black]', '[brown]', '[teamcolor]'));

SET @chat_drop = CONCAT('ALTER TABLE portal_identity_chat_tags ', IF(LOCATE('MariaDB', VERSION()) > 0, 'DROP CONSTRAINT ', 'DROP CHECK '), 'portal_identity_chat_tags_name_color_valid');
SET @chat_ddl = IF(EXISTS(SELECT 1 FROM information_schema.TABLE_CONSTRAINTS WHERE CONSTRAINT_SCHEMA = DATABASE() AND TABLE_NAME = 'portal_identity_chat_tags' AND CONSTRAINT_NAME = 'portal_identity_chat_tags_name_color_valid' AND CONSTRAINT_TYPE = 'CHECK'), @chat_drop, 'SELECT 1');
PREPARE chat_stmt FROM @chat_ddl;
EXECUTE chat_stmt;
DEALLOCATE PREPARE chat_stmt;
ALTER TABLE portal_identity_chat_tags ADD CONSTRAINT portal_identity_chat_tags_name_color_valid
  CHECK (name_color_token IS NULL OR name_color_token REGEXP '^#[0-9A-Fa-f]{6}$' OR name_color_token IN ('[default]', '[white]', '[/]', '[grey]', '[gray]', '[silver]', '[bluegrey]', '[darkred]', '[red]', '[lightred]', '[gold]', '[orange]', '[yellow]', '[lightyellow]', '[olive]', '[green]', '[lime]', '[blue]', '[lightblue]', '[darkblue]', '[lightpurple]', '[purple]', '[magenta]', '[black]', '[brown]', '[teamcolor]'));

SET @chat_drop = CONCAT('ALTER TABLE portal_identity_chat_tags ', IF(LOCATE('MariaDB', VERSION()) > 0, 'DROP CONSTRAINT ', 'DROP CHECK '), 'portal_identity_chat_tags_message_color_valid');
SET @chat_ddl = IF(EXISTS(SELECT 1 FROM information_schema.TABLE_CONSTRAINTS WHERE CONSTRAINT_SCHEMA = DATABASE() AND TABLE_NAME = 'portal_identity_chat_tags' AND CONSTRAINT_NAME = 'portal_identity_chat_tags_message_color_valid' AND CONSTRAINT_TYPE = 'CHECK'), @chat_drop, 'SELECT 1');
PREPARE chat_stmt FROM @chat_ddl;
EXECUTE chat_stmt;
DEALLOCATE PREPARE chat_stmt;
ALTER TABLE portal_identity_chat_tags ADD CONSTRAINT portal_identity_chat_tags_message_color_valid
  CHECK (message_color_token IS NULL OR message_color_token REGEXP '^#[0-9A-Fa-f]{6}$' OR message_color_token IN ('[default]', '[white]', '[/]', '[grey]', '[gray]', '[silver]', '[bluegrey]', '[darkred]', '[red]', '[lightred]', '[gold]', '[orange]', '[yellow]', '[lightyellow]', '[olive]', '[green]', '[lime]', '[blue]', '[lightblue]', '[darkblue]', '[lightpurple]', '[purple]', '[magenta]', '[black]', '[brown]', '[teamcolor]'));
