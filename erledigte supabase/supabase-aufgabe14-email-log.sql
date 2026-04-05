-- ============================================================================
-- Aufgabe 14: Email-Log Tabelle für automatische Erinnerungs-E-Mails
-- ============================================================================

CREATE TABLE IF NOT EXISTS email_log (
  id              UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  booking_id      TEXT        NOT NULL REFERENCES bookings(id) ON DELETE CASCADE,
  customer_email  TEXT        NOT NULL,
  email_type      TEXT        NOT NULL CHECK (email_type IN (
                    'return_reminder_2d',
                    'return_reminder_0d',
                    'overdue_1d',
                    'overdue_3d',
                    'review_request'
                  )),
  sent_at         TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  status          TEXT        NOT NULL DEFAULT 'sent' CHECK (status IN ('sent', 'failed')),
  resend_message_id TEXT
);

-- Index für schnelle Duplikat-Prüfung (booking + email_type)
CREATE INDEX IF NOT EXISTS idx_email_log_booking_type
  ON email_log (booking_id, email_type);

-- Index für zeitbasierte Abfragen
CREATE INDEX IF NOT EXISTS idx_email_log_sent_at
  ON email_log (sent_at DESC);

-- RLS aktivieren
ALTER TABLE email_log ENABLE ROW LEVEL SECURITY;

-- Nur Service-Role darf lesen/schreiben (Cron-Job nutzt service key)
CREATE POLICY "Service role full access on email_log"
  ON email_log
  FOR ALL
  USING (auth.role() = 'service_role')
  WITH CHECK (auth.role() = 'service_role');
