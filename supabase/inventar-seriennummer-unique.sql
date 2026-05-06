-- ============================================================
-- Migration: inventar_units.seriennummer global eindeutig
-- Erstellt: 2026-05-06
-- ============================================================
--
-- Geschaeftsregel:
--   - bezeichnung: darf mehrfach vorkommen (z.B. "Akku" 5x ist OK)
--   - inventar_code: einmalig (war schon UNIQUE)
--   - seriennummer:  einmalig (NEU — bisher nur indiziert, nicht eindeutig)
--
-- NULLs sind erlaubt und werden NICHT als Duplikate behandelt (Postgres
-- Default: NULL DISTINCT). Wer keine SN hat, kann das Feld leer lassen.
--
-- Idempotent: DROP CONSTRAINT IF EXISTS + ADD CONSTRAINT.
-- ============================================================

-- 1) Pruefen, ob bereits Duplikate existieren — bevor wir den Constraint
--    setzen koennen, muessen alle vorhandenen SN eindeutig sein.
DO $$
DECLARE
  v_dupe_count INT;
BEGIN
  SELECT COUNT(*) INTO v_dupe_count FROM (
    SELECT seriennummer
    FROM inventar_units
    WHERE seriennummer IS NOT NULL AND seriennummer <> ''
    GROUP BY seriennummer
    HAVING COUNT(*) > 1
  ) AS dupes;

  IF v_dupe_count > 0 THEN
    RAISE EXCEPTION 'Es existieren % Seriennummern mit Duplikaten. Vor dem Setzen des UNIQUE-Constraints bitte bereinigen. Liste anzeigen mit: SELECT seriennummer, COUNT(*) FROM inventar_units WHERE seriennummer IS NOT NULL AND seriennummer <> '''' GROUP BY seriennummer HAVING COUNT(*) > 1;', v_dupe_count;
  END IF;
END $$;

-- 2) UNIQUE-Constraint setzen
ALTER TABLE inventar_units
  DROP CONSTRAINT IF EXISTS inventar_units_seriennummer_unique;

ALTER TABLE inventar_units
  ADD CONSTRAINT inventar_units_seriennummer_unique
  UNIQUE (seriennummer);

-- 3) Index auf inventar_code (UNIQUE) wird vom UNIQUE-Constraint automatisch
--    angelegt — wir indizieren seriennummer zusaetzlich fuer schnelle Lookups
--    (Scan-Workflow). UNIQUE-Constraint legt zwar einen Index an, aber
--    explizite IF NOT EXISTS macht die Migration idempotent.
CREATE INDEX IF NOT EXISTS idx_inventar_units_seriennummer
  ON inventar_units(seriennummer)
  WHERE seriennummer IS NOT NULL;

COMMENT ON CONSTRAINT inventar_units_seriennummer_unique ON inventar_units IS
  'Seriennummer muss systemweit eindeutig sein (NULL erlaubt). Bezeichnung darf hingegen mehrfach vorkommen.';
