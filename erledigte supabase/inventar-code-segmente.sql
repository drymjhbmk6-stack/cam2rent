-- ============================================================
-- Migration: inventar_code_segmente — strukturierter Code-Builder
-- Erstellt: 2026-05-06 · Aktualisiert: 2026-05-06
-- ============================================================
--
-- Inventar-Code-Format: [Kategorie]-[Hersteller]-[Name]-[NN]
-- Beispiel: STO-SAN-128-01 (Speichermedien, SanDisk, 128 GB, Stueck #1)
--
-- Diese Tabelle haelt die ersten beiden Segmente als wiederverwendbare
-- Stammdaten (Kategorie + Hersteller). Das dritte Segment (Name) wird
-- dynamisch aus existierenden inventar_units extrahiert. Das vierte
-- Segment (Laufende Nummer) wird per Lookup berechnet.
--
-- Idempotent: ALTER TABLE / CREATE TABLE IF NOT EXISTS / ON CONFLICT.
-- Kann mehrfach ausgefuehrt werden.
-- ============================================================

CREATE TABLE IF NOT EXISTS inventar_code_segmente (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  typ         TEXT NOT NULL CHECK (typ IN ('kategorie','hersteller')),
  code        TEXT NOT NULL,
  label       TEXT NOT NULL,
  sort_order  INT  NOT NULL DEFAULT 0,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT inventar_code_segmente_unique UNIQUE (typ, code),
  CONSTRAINT inventar_code_segmente_code_format CHECK (code ~ '^[A-Z0-9]{2,5}$')
);

CREATE INDEX IF NOT EXISTS idx_inventar_code_segmente_typ ON inventar_code_segmente(typ);

ALTER TABLE inventar_code_segmente ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "inventar_code_segmente service role" ON inventar_code_segmente;
CREATE POLICY "inventar_code_segmente service role" ON inventar_code_segmente
  FOR ALL USING (true) WITH CHECK (true);

-- Updated-At Trigger (nutzt set_updated_at() falls vorhanden, sonst Skip)
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_proc WHERE proname = 'set_updated_at') THEN
    DROP TRIGGER IF EXISTS trg_inventar_code_segmente_updated_at ON inventar_code_segmente;
    EXECUTE 'CREATE TRIGGER trg_inventar_code_segmente_updated_at
             BEFORE UPDATE ON inventar_code_segmente
             FOR EACH ROW EXECUTE FUNCTION set_updated_at()';
  END IF;
END $$;


-- ────────────────────────────────────────────────────────────────────────────
-- 1. Alt-Seed bereinigen — Codes aus der ersten Migrations-Iteration, die
--    nicht in der neuen kuratierten Liste sind. Bestehende Inventar-Codes
--    in inventar_units bleiben unangetastet (kein FK), nur das Dropdown
--    verliert die Vorschlaege.
-- ────────────────────────────────────────────────────────────────────────────
DELETE FROM inventar_code_segmente
WHERE typ = 'kategorie'
  AND code IN ('AKK','HAL','KAB','MIK','SET','SON','VER');

DELETE FROM inventar_code_segmente
WHERE typ = 'hersteller'
  AND code IN ('INS','PEK','RDE','SAM','SNY','ULZ');


-- ────────────────────────────────────────────────────────────────────────────
-- 2. Kategorien (Position 1 im Code)
-- ────────────────────────────────────────────────────────────────────────────
-- Reihenfolge laut Stammdaten-Liste 2026-05-06.
-- Bei bestehenden Eintraegen: label + sort_order aktualisieren.
INSERT INTO inventar_code_segmente (typ, code, label, sort_order) VALUES
  ('kategorie', 'CAM', 'Kameras (Body)',           1),
  ('kategorie', 'LEN', 'Objektive (Lens)',         2),
  ('kategorie', 'LIT', 'Licht / Beleuchtung',      3),
  ('kategorie', 'AUD', 'Audio',                    4),
  ('kategorie', 'STA', 'Stative & Stabilisierung', 5),
  ('kategorie', 'MON', 'Monitore',                 6),
  ('kategorie', 'STO', 'Speichermedien',           7),
  ('kategorie', 'BAT', 'Akkus & Stromversorgung',  8),
  ('kategorie', 'RIG', 'Rigs & Cages',             9),
  ('kategorie', 'CAB', 'Kabel & Adapter',         10),
  ('kategorie', 'CAS', 'Cases & Taschen',         11),
  ('kategorie', 'MIS', 'Sonstiges',               12)
ON CONFLICT (typ, code) DO UPDATE
  SET label = EXCLUDED.label,
      sort_order = EXCLUDED.sort_order,
      updated_at = NOW();


-- ────────────────────────────────────────────────────────────────────────────
-- 3. Hersteller (Position 2 im Code) — auf 3 Buchstaben normiert
-- ────────────────────────────────────────────────────────────────────────────
-- Spalten-Reihenfolge aus dem Screenshot:
--   Spalte 1 (1-11):  Kamera-Hersteller (Sony bis Zeiss)
--   Spalte 2 (12-21): Licht/Audio (Godox bis Shure)
--   Spalte 3 (22-31): Mounts/Stabilizer/Storage (Manfrotto bis Hollyland)
--   No-Name am Ende (99).
INSERT INTO inventar_code_segmente (typ, code, label, sort_order) VALUES
  -- Spalte 1: Kameras
  ('hersteller', 'SON', 'Sony',         1),
  ('hersteller', 'CAN', 'Canon',        2),
  ('hersteller', 'NIK', 'Nikon',        3),
  ('hersteller', 'FUJ', 'Fujifilm',     4),
  ('hersteller', 'PAN', 'Panasonic',    5),
  ('hersteller', 'BMD', 'Blackmagic',   6),
  ('hersteller', 'GPR', 'GoPro',        7),
  ('hersteller', 'LEI', 'Leica',        8),
  ('hersteller', 'SIG', 'Sigma',        9),
  ('hersteller', 'TAM', 'Tamron',      10),
  ('hersteller', 'ZEI', 'Zeiss',       11),
  -- Spalte 2: Licht / Audio
  ('hersteller', 'GOD', 'Godox',       12),
  ('hersteller', 'APU', 'Aputure',     13),
  ('hersteller', 'NAN', 'Nanlite',     14),
  ('hersteller', 'PRO', 'Profoto',     15),
  ('hersteller', 'ROD', 'Rode',        16),
  ('hersteller', 'SEN', 'Sennheiser',  17),
  ('hersteller', 'ZOO', 'Zoom',        18),
  ('hersteller', 'RYC', 'Rycote',      19),
  ('hersteller', 'TAS', 'Tascam',      20),
  ('hersteller', 'SHU', 'Shure',       21),
  -- Spalte 3: Mounts / Stabilizer / Storage / Accessoires
  ('hersteller', 'MAN', 'Manfrotto',   22),
  ('hersteller', 'SAC', 'Sachtler',    23),
  ('hersteller', 'SMA', 'SmallRig',    24),
  ('hersteller', 'PEL', 'Peli',        25),
  ('hersteller', 'TIL', 'Tilta',       26),
  ('hersteller', 'DJI', 'DJI',         27),
  ('hersteller', 'ATO', 'Atomos',      28),
  ('hersteller', 'SAN', 'SanDisk',     29),
  ('hersteller', 'ANG', 'Angelbird',   30),
  ('hersteller', 'HOL', 'Hollyland',   31),
  -- Fallback fuer No-Name / Generika
  ('hersteller', 'GEN', 'No Name',     99)
ON CONFLICT (typ, code) DO UPDATE
  SET label = EXCLUDED.label,
      sort_order = EXCLUDED.sort_order,
      updated_at = NOW();
