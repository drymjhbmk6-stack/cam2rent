-- ============================================================
-- Admin-Benachrichtigungen
-- ============================================================

-- Tabelle: admin_notifications
CREATE TABLE IF NOT EXISTS admin_notifications (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  type        TEXT NOT NULL,          -- 'new_booking', 'booking_cancelled', 'new_damage', 'new_message', 'new_customer', 'overdue_return', 'new_review', 'payment_failed'
  title       TEXT NOT NULL,
  message     TEXT,
  link        TEXT,                    -- URL zum Navigieren
  is_read     BOOLEAN NOT NULL DEFAULT false,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Indizes für schnelle Abfragen
CREATE INDEX IF NOT EXISTS idx_admin_notifications_unread
  ON admin_notifications (is_read, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_admin_notifications_created
  ON admin_notifications (created_at DESC);

-- Automatisches Löschen von Einträgen älter als 90 Tage
-- (Täglicher Cron-Job via pg_cron oder manuell aufrufen)
-- Falls pg_cron verfügbar:
-- SELECT cron.schedule('cleanup-admin-notifications', '0 3 * * *',
--   $$DELETE FROM admin_notifications WHERE created_at < NOW() - INTERVAL '90 days'$$
-- );

-- Alternativ: SQL-Funktion zum Aufräumen
CREATE OR REPLACE FUNCTION cleanup_old_admin_notifications()
RETURNS void AS $$
BEGIN
  DELETE FROM admin_notifications
  WHERE created_at < NOW() - INTERVAL '90 days';
END;
$$ LANGUAGE plpgsql;
