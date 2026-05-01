-- ============================================================
-- Migration: accessory_units um Seriennummer ergaenzen +
--            exemplar_code global UNIQUE (analog product_units.label)
-- Erstellt: 2026-05-02
--
-- Hintergrund:
-- Zubehoer-Editor wird auf das Kamera-Pattern umgestellt:
-- - "Bezeichnung" (= bisheriger exemplar_code) bleibt Pflicht und wird
--   global UNIQUE (vorher nur unique pro accessory_id). Der QR-Code-URL-
--   Pfad nutzt diese Bezeichnung, deshalb global eindeutig noetig.
-- - Optionales Feld "Seriennummer" fuer Hersteller-S/N bei Akkus etc.
--
-- Schritte:
-- 1) Neue Spalte serial_number TEXT NULL
-- 2) Doppelte exemplar_codes auflisten (sollte 0 sein, weil bisher schon
--    per-accessory unique war + jeder code mit accessory_id-Praefix)
-- 3) Falls Doppelte: auto-suffixieren mit -2, -3 etc.
-- 4) UNIQUE-Constraint global setzen (zusaetzlich zu per-accessory)
-- 5) Index auf exemplar_code fuer schnelle Scan-Lookups
--
-- Idempotent.
-- ============================================================

-- 1. Neue Spalte serial_number
ALTER TABLE accessory_units ADD COLUMN IF NOT EXISTS serial_number TEXT;

-- 2. De-Duplizieren falls global Konflikte (defensiv, sollte trivial sein)
WITH duplicates AS (
  SELECT id, exemplar_code,
         ROW_NUMBER() OVER (PARTITION BY exemplar_code ORDER BY created_at) AS rn
  FROM accessory_units
)
UPDATE accessory_units au
SET exemplar_code = au.exemplar_code || '-' || d.rn
FROM duplicates d
WHERE au.id = d.id AND d.rn > 1;

-- 3. UNIQUE-Constraint global setzen (idempotent)
DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'accessory_units_exemplar_code_unique'
  ) THEN
    ALTER TABLE accessory_units
      ADD CONSTRAINT accessory_units_exemplar_code_unique UNIQUE (exemplar_code);
  END IF;
END $$;

-- 4. Index fuer Scan-Lookups (cam2rent.de/admin/scan/<exemplar_code>)
CREATE INDEX IF NOT EXISTS idx_accessory_units_exemplar_code
  ON accessory_units(exemplar_code);

-- Sanity-Check
SELECT
  COUNT(*) AS total_units,
  COUNT(DISTINCT exemplar_code) AS distinct_codes,
  COUNT(serial_number) AS with_serial
FROM accessory_units;
