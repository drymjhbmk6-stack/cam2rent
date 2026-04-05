-- ─── Session 10: Versandlogik ─────────────────────────────────────────────────
--
-- Ausführen im Supabase SQL-Editor (supabase.com → dein Projekt → SQL Editor)
--
-- Was hier passiert:
-- 1. Drei neue Spalten in der bookings-Tabelle für Versand-Tracking
-- 2. Status 'shipped' wird als gültiger Wert ergänzt
-- 3. customer_email-Spalte wird hinzugefügt (falls noch nicht vorhanden)
--
-- ─────────────────────────────────────────────────────────────────────────────

-- 1. Tracking-Spalten hinzufügen
ALTER TABLE bookings
  ADD COLUMN IF NOT EXISTS tracking_number  TEXT,
  ADD COLUMN IF NOT EXISTS tracking_url     TEXT,
  ADD COLUMN IF NOT EXISTS shipped_at       TIMESTAMPTZ;

-- 2. customer_email hinzufügen (wird für Versand-E-Mail benötigt)
ALTER TABLE bookings
  ADD COLUMN IF NOT EXISTS customer_email   TEXT,
  ADD COLUMN IF NOT EXISTS customer_name    TEXT;

-- 3. Index auf Status (hilft der Admin-Abfrage)
CREATE INDEX IF NOT EXISTS bookings_status_idx ON bookings (status);

-- ─── Fertig ───────────────────────────────────────────────────────────────────
-- Mögliche Status-Werte nach dieser Migration:
--   confirmed  → Buchung bestätigt, noch nicht versendet
--   shipped    → Versendet, Tracking-Nummer vorhanden
--   completed  → Kamera zurückgekommen, Buchung abgeschlossen
--   cancelled  → Storniert
-- ─────────────────────────────────────────────────────────────────────────────
