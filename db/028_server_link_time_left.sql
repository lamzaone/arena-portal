-- Apply before deploying the portal that reads map time from server snapshots.
-- Older server plugins can continue sending heartbeats without the optional field.
ALTER TABLE portal_server_link_snapshots
  ADD COLUMN time_left_seconds INT UNSIGNED NULL AFTER bots;
