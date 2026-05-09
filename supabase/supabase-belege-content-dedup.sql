-- Belege: Inhaltsbasierte Duplikat-Erkennung
--
-- Idempotent: kann mehrfach ausgefuehrt werden, ohne Schaden anzurichten.
--
-- Ergaenzt den bestehenden file_hash-basierten Check (siehe
-- supabase-belege-dedup-async-ocr.sql). Der Hash-Check schlaegt nur an, wenn
-- die EXAKT GLEICHE Datei zweimal hochgeladen wird. Realer Fall: gleiche
-- Amazon-Rechnung als PDF + Screenshot, oder zweimal aus dem Mail-Client mit
-- unterschiedlichen Metadaten — Hash unterschiedlich, Inhalt identisch.
--
-- Daher: nach OCR-Abschluss prueft der Server zusaetzlich auf
--   strict: gleicher Lieferant + gleiche Rechnungsnummer-Lieferant
--   soft:   gleicher Lieferant + gleiches Beleg-Datum + gleiche Brutto-Summe
-- Beim Treffer wird verdacht_duplikat_beleg_id gesetzt. UI zeigt einen Banner,
-- Festschreiben ist geblockt bis Admin "Kein Duplikat" bestaetigt.

ALTER TABLE belege
  ADD COLUMN IF NOT EXISTS verdacht_duplikat_beleg_id UUID
    REFERENCES belege(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS verdacht_duplikat_grund TEXT,
  ADD COLUMN IF NOT EXISTS verdacht_duplikat_dismissed_at TIMESTAMPTZ;

-- Partial index — nur die paar Belege mit aktivem Verdacht.
CREATE INDEX IF NOT EXISTS idx_belege_verdacht_duplikat
  ON belege(verdacht_duplikat_beleg_id)
  WHERE verdacht_duplikat_beleg_id IS NOT NULL;
