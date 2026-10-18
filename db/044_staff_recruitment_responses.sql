-- PORTAL_DATABASE_URL only. Additive; existing applications retain NULL feedback.
-- MariaDB supports IF NOT EXISTS for safely reapplying this column migration.
ALTER TABLE portal_staff_applications
  ADD COLUMN IF NOT EXISTS admin_response TEXT NULL AFTER reason;
