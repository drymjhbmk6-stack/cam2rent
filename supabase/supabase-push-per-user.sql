-- Push-Subscriptions an Mitarbeiter-Account binden, damit Notifications
-- nach Permission gefiltert werden koennen (Packer kriegt nur Versand-
-- Notifications, Buchhalter nur Mahnungen, etc.).
--
-- Bestehende Subscriptions ohne admin_user_id bleiben gueltig — sie kriegen
-- weiterhin ALLE Notifications (Backward-Compat fuer Legacy-ENV-Login).
-- Erst beim naechsten Re-Subscribe werden sie an einen User gebunden.

ALTER TABLE push_subscriptions
  ADD COLUMN IF NOT EXISTS admin_user_id UUID REFERENCES admin_users(id) ON DELETE CASCADE;

CREATE INDEX IF NOT EXISTS idx_push_subscriptions_user
  ON push_subscriptions(admin_user_id);
