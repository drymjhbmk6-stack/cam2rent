-- Belege: Duplikat-Erkennung pro Datei (file_hash) + asynchrone OCR-Verarbeitung
--
-- Idempotent: kann mehrfach ausgefuehrt werden, ohne Schaden anzurichten.
--
-- 1. beleg_anhaenge.file_hash: SHA-256-Hex der Datei-Bytes. Beim Upload prueft
--    der Server, ob ein Anhang mit gleichem Hash bereits existiert. Wenn ja
--    → 409 mit Verweis auf den Beleg, dem dieser Anhang gehoert.
--    Index ist KEIN UNIQUE: bei einem Race koennte der gleiche Hash kurz
--    doppelt landen — der Server filtert das beim naechsten Upload weg, ein
--    UNIQUE-Constraint wuerde aber eine Race-Insertion komplett brechen
--    statt nur eine Warnung anzuzeigen.
-- 2. belege.ocr_status: Lebenszyklus der KI-Analyse fuer den Bulk-Pfad.
--    'done' als Default, damit Altbestand und manuelle Belege automatisch
--    "fertig" sind und nicht in einer Pending-Anzeige haengen.

ALTER TABLE beleg_anhaenge
  ADD COLUMN IF NOT EXISTS file_hash TEXT;

CREATE INDEX IF NOT EXISTS idx_beleg_anhaenge_file_hash
  ON beleg_anhaenge(file_hash)
  WHERE file_hash IS NOT NULL;

ALTER TABLE belege
  ADD COLUMN IF NOT EXISTS ocr_status TEXT NOT NULL DEFAULT 'done',
  ADD COLUMN IF NOT EXISTS ocr_error TEXT,
  ADD COLUMN IF NOT EXISTS ocr_started_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS ocr_finished_at TIMESTAMPTZ;

-- CHECK-Constraint nachtraeglich anlegen, ohne dass IF NOT EXISTS kollidiert.
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'belege_ocr_status_check'
  ) THEN
    ALTER TABLE belege
      ADD CONSTRAINT belege_ocr_status_check
      CHECK (ocr_status IN ('pending','running','done','failed'));
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS idx_belege_ocr_status
  ON belege(ocr_status)
  WHERE ocr_status IN ('pending','running','failed');
