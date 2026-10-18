-- Apply to the PORTAL database. Group definitions keep their existing icon key.
-- Public symbol identifiers are hashes of normalized PNG pixels, never filenames.
CREATE TABLE IF NOT EXISTS portal_group_badge_symbols (
  symbol_id CHAR(24) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
  png_bytes MEDIUMBLOB NOT NULL,
  created_by_steam_id VARCHAR(20) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (symbol_id)
) ENGINE=InnoDB;
