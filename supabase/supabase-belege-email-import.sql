-- ============================================================================
-- Belege per E-Mail importieren — Schema-Ergaenzung (idempotent, additiv)
-- ============================================================================
--
-- Ermoeglicht den automatischen Import von Lieferanten-Rechnungen, die per
-- E-Mail an eine dedizierte Adresse (z.B. belege@cam2rent.de) geschickt bzw.
-- weitergeleitet werden. Der IMAP-Cron (inbound-email-poll) zweigt solche
-- Mails in die Beleg-Pipeline ab (lib/buchhaltung/inbound-beleg.ts) statt sie
-- ins Kunden-Nachrichtenpostfach zu schreiben.
--
-- 1. belege.email_message_id — Provenienz + Idempotenz pro E-Mail (eine Mail
--    darf bei mehreren Cron-Laeufen nur EINEN Beleg erzeugen). Partieller
--    Unique-Index, damit manuell/upload angelegte Belege (NULL) nicht kollidieren.
-- 2. belege.quelle CHECK um 'email' erweitern. Defensiv im Code: schlaegt der
--    Insert am Constraint fehl (Migration noch nicht durch), faellt der
--    Import auf quelle='upload' zurueck.
--
-- Ohne diese Migration laeuft der Import weiter (Code ist defensiv): der
-- email_message_id-Dedup entfaellt (dann greift nur der Datei-Hash-Dedup), und
-- quelle wird als 'upload' gespeichert.
-- ============================================================================

-- 1. Spalte email_message_id -------------------------------------------------
ALTER TABLE belege
  ADD COLUMN IF NOT EXISTS email_message_id TEXT;

-- Partieller Unique-Index: nur Belege mit gesetzter Message-ID sind eindeutig.
CREATE UNIQUE INDEX IF NOT EXISTS idx_belege_email_message_id
  ON belege (email_message_id)
  WHERE email_message_id IS NOT NULL;

-- 2. quelle-CHECK um 'email' erweitern ---------------------------------------
-- Inline-Single-Column-Checks heissen in Postgres <tabelle>_<spalte>_check.
ALTER TABLE belege DROP CONSTRAINT IF EXISTS belege_quelle_check;
ALTER TABLE belege
  ADD CONSTRAINT belege_quelle_check
  CHECK (quelle IN ('upload', 'manuell', 'stripe_sync', 'migration', 'email'));
