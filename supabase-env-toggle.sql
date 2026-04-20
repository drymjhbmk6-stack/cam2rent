-- ─── Test/Live-Modus Umschaltung (Env-Toggle) ───────────────────────────────
--
-- Fuegt auf den relevanten Tabellen einen `is_test`-Flag hinzu, damit Test-
-- Daten sauber von Live-Daten getrennt werden koennen (GoBD-konforme Buchhaltung,
-- saubere Counter, Reports ohne Kontamination).
--
-- Idempotent: Laeuft mehrfach ohne Fehler.
--
-- Default = FALSE, damit bestehende Buchungen/Rechnungen als Live gelten
-- (koennen nachtraeglich manuell markiert werden falls noetig).
-- ────────────────────────────────────────────────────────────────────────────

-- Bookings
ALTER TABLE bookings         ADD COLUMN IF NOT EXISTS is_test BOOLEAN NOT NULL DEFAULT FALSE;
CREATE INDEX IF NOT EXISTS idx_bookings_is_test         ON bookings(is_test) WHERE is_test = TRUE;

-- Invoices
ALTER TABLE invoices         ADD COLUMN IF NOT EXISTS is_test BOOLEAN NOT NULL DEFAULT FALSE;
CREATE INDEX IF NOT EXISTS idx_invoices_is_test         ON invoices(is_test) WHERE is_test = TRUE;

-- Credit Notes (Gutschriften)
ALTER TABLE credit_notes     ADD COLUMN IF NOT EXISTS is_test BOOLEAN NOT NULL DEFAULT FALSE;
CREATE INDEX IF NOT EXISTS idx_credit_notes_is_test     ON credit_notes(is_test) WHERE is_test = TRUE;

-- Expenses (Ausgaben/Reparaturdepot/Stripe-Gebuehren)
ALTER TABLE expenses         ADD COLUMN IF NOT EXISTS is_test BOOLEAN NOT NULL DEFAULT FALSE;
CREATE INDEX IF NOT EXISTS idx_expenses_is_test         ON expenses(is_test) WHERE is_test = TRUE;

-- Email-Log
ALTER TABLE email_log        ADD COLUMN IF NOT EXISTS is_test BOOLEAN NOT NULL DEFAULT FALSE;
CREATE INDEX IF NOT EXISTS idx_email_log_is_test        ON email_log(is_test) WHERE is_test = TRUE;

-- Admin-Audit-Log
ALTER TABLE admin_audit_log  ADD COLUMN IF NOT EXISTS is_test BOOLEAN NOT NULL DEFAULT FALSE;
CREATE INDEX IF NOT EXISTS idx_admin_audit_log_is_test  ON admin_audit_log(is_test) WHERE is_test = TRUE;

-- Stripe-Transactions (Reconciliation)
ALTER TABLE stripe_transactions ADD COLUMN IF NOT EXISTS is_test BOOLEAN NOT NULL DEFAULT FALSE;
CREATE INDEX IF NOT EXISTS idx_stripe_transactions_is_test ON stripe_transactions(is_test) WHERE is_test = TRUE;

-- Kommentar fuer DB-Dokumentation
COMMENT ON COLUMN bookings.is_test      IS 'Test-Modus-Marker. Bei TRUE: generiert im Test-Modus, zaehlt nicht zu Live-Umsaetzen/Counter.';
COMMENT ON COLUMN invoices.is_test      IS 'Test-Rechnung (Rechnungsnr. mit TEST-Praefix, nicht in Reports/DATEV).';
COMMENT ON COLUMN credit_notes.is_test  IS 'Test-Gutschrift (nicht in Reports/DATEV).';
COMMENT ON COLUMN expenses.is_test      IS 'Test-Ausgabe (nicht in EUeR/USt-VA).';
COMMENT ON COLUMN email_log.is_test     IS 'Im Test-Modus versendete Mail.';
