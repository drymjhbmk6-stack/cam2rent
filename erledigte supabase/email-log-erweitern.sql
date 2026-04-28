-- ============================================================================
-- Email-Log Tabelle erweitern: Alle E-Mail-Typen + neue Spalten
-- ============================================================================

-- CHECK-Constraint entfernen damit alle email_type Werte erlaubt sind
ALTER TABLE email_log DROP CONSTRAINT IF EXISTS email_log_email_type_check;

-- booking_id nullable machen (nicht alle Mails haben eine Buchungs-ID)
ALTER TABLE email_log ALTER COLUMN booking_id DROP NOT NULL;

-- Neue Spalten hinzufuegen (falls nicht vorhanden)
ALTER TABLE email_log ADD COLUMN IF NOT EXISTS subject TEXT;
ALTER TABLE email_log ADD COLUMN IF NOT EXISTS error_message TEXT;
