-- ============================================================
-- Migration: product_units.label als Pflichtfeld + global UNIQUE
-- Erstellt: 2026-05-01
--
-- Hintergrund:
-- Die Bezeichnung (label) wird ab jetzt fuer den QR-Code-URL-Pfad
-- genutzt: cam2rent.de/admin/scan/<label>. Damit der Lookup
-- eindeutig ist, muss label global UNIQUE sein. Bisher war label
-- optional + duplizierbar.
--
-- Schritte:
-- 1) NULL-Labels werden mit <product_id>-<serial-short> aufgefuellt
-- 2) Doppelte Labels werden automatisch mit -2, -3 etc. suffixiert
-- 3) NOT NULL + UNIQUE-Constraint setzen
-- 4) Index fuer schnelle Scan-Lookups
--
-- Idempotent: Migration kann mehrfach ausgefuehrt werden.
-- ============================================================

-- 1. Backfill: Auto-Generate fuer NULL/leere Labels
UPDATE product_units
SET label = product_id || '-' || substring(serial_number FROM 1 FOR 4)
WHERE label IS NULL OR trim(label) = '';

-- 2. Doppelte Labels de-duplizieren (zweites/drittes Vorkommen bekommt Suffix)
WITH duplicates AS (
  SELECT id, label,
         ROW_NUMBER() OVER (PARTITION BY label ORDER BY created_at) AS rn
  FROM product_units
)
UPDATE product_units pu
SET label = pu.label || '-' || d.rn
FROM duplicates d
WHERE pu.id = d.id AND d.rn > 1;

-- 3a. NOT NULL setzen
ALTER TABLE product_units ALTER COLUMN label SET NOT NULL;

-- 3b. UNIQUE-Constraint setzen (idempotent)
DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'product_units_label_unique'
  ) THEN
    ALTER TABLE product_units ADD CONSTRAINT product_units_label_unique UNIQUE (label);
  END IF;
END $$;

-- 4. Index fuer Scan-Lookups (cam2rent.de/admin/scan/<label>)
CREATE INDEX IF NOT EXISTS idx_product_units_label ON product_units(label);

-- Sanity-Check (laeuft beim manuellen Ausfuehren mit, hilft beim Debuggen)
SELECT
  COUNT(*) AS total_units,
  COUNT(DISTINCT label) AS distinct_labels,
  COUNT(*) FILTER (WHERE label IS NULL) AS null_labels
FROM product_units;
