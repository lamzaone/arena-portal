-- PORTAL_DATABASE_URL only. Additive; no game database or existing account changes.
-- UTC instants use epoch milliseconds. Each actor has one reputation vote and
-- one mutable set of commendations per profile; retries cannot inflate counts.
CREATE TABLE IF NOT EXISTS portal_profile_community (
  steam_id VARCHAR(17) NOT NULL PRIMARY KEY,
  comments_enabled BOOLEAN NOT NULL DEFAULT TRUE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS portal_profile_reputation (
  target_steam_id VARCHAR(17) NOT NULL,
  actor_steam_id VARCHAR(17) NOT NULL,
  value SMALLINT NOT NULL,
  PRIMARY KEY (target_steam_id, actor_steam_id),
  CONSTRAINT portal_profile_reputation_value CHECK (value IN (-1, 1)),
  CONSTRAINT portal_profile_reputation_no_self CHECK (target_steam_id <> actor_steam_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS portal_profile_commendations (
  target_steam_id VARCHAR(17) NOT NULL,
  actor_steam_id VARCHAR(17) NOT NULL,
  kind VARCHAR(16) NOT NULL,
  PRIMARY KEY (target_steam_id, actor_steam_id, kind),
  CONSTRAINT portal_profile_commendation_kind CHECK (kind IN ('helpful', 'teacher', 'funny', 'pro_player', 'goat')),
  CONSTRAINT portal_profile_commendation_no_self CHECK (target_steam_id <> actor_steam_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS portal_profile_comments (
  id CHAR(36) NOT NULL PRIMARY KEY,
  target_steam_id VARCHAR(17) NOT NULL,
  author_steam_id VARCHAR(17) NOT NULL,
  body VARCHAR(1000) NOT NULL,
  request_id CHAR(36) NOT NULL,
  created_at BIGINT NOT NULL,
  deleted_at BIGINT NULL,
  deleted_by VARCHAR(17) NULL,
  UNIQUE KEY portal_profile_comment_request (author_steam_id, request_id),
  KEY portal_profile_comment_page (target_steam_id, deleted_at, created_at, id),
  KEY portal_profile_comment_limit (author_steam_id, created_at),
  CONSTRAINT portal_profile_comment_no_self CHECK (target_steam_id <> author_steam_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS portal_profile_community_limits (
  actor_steam_id VARCHAR(17) NOT NULL PRIMARY KEY,
  last_action_at BIGINT NOT NULL DEFAULT 0
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
