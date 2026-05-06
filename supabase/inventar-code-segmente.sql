-- ============================================================
-- Migration: inventar_code_segmente — strukturierter Code-Builder
-- Erstellt: 2026-05-06
-- ============================================================
--
-- Inventar-Code-Format: [Kategorie]-[Hersteller]-[Name]-[NN]
-- Beispiel: STO-SAN-128-01 (Speichermedien, SanDisk, 128 GB, Stueck #1)
--
-- Diese Tabelle haelt die ersten beiden Segmente als wiederverwendbare
-- Stammdaten (Kategorie + Hersteller). Das dritte Segment (Name) wird
-- dynamisch aus existierenden inventar_units extrahiert. Das vierte
-- Segment (Laufende Nummer) wird per Lookup berechnet.
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

-- Updated-At Trigger (nutzt set_updated_at() falls vorhanden, sonst inline)
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_proc WHERE proname = 'set_updated_at') THEN
    DROP TRIGGER IF EXISTS trg_inventar_code_segmente_updated_at ON inventar_code_segmente;
    EXECUTE 'CREATE TRIGGER trg_inventar_code_segmente_updated_at
             BEFORE UPDATE ON inventar_code_segmente
             FOR EACH ROW EXECUTE FUNCTION set_updated_at()';
  END IF;
END $$;

-- ── Seed: Standard-Kategorien ───────────────────────────────────────────────
INSERT INTO inventar_code_segmente (typ, code, label, sort_order) VALUES
  ('kategorie', 'CAM', 'Kamera',         1),
  ('kategorie', 'STO', 'Speichermedien', 2),
  ('kategorie', 'AKK', 'Akku',           3),
  ('kategorie', 'BAT', 'Ladegeraet',     4),
  ('kategorie', 'HAL', 'Halterung',      5),
  ('kategorie', 'STA', 'Stativ',         6),
  ('kategorie', 'KAB', 'Kabel',          7),
  ('kategorie', 'MIK', 'Mikrofon',       8),
  ('kategorie', 'SET', 'Set',            9),
  ('kategorie', 'VER', 'Verbrauch',     10),
  ('kategorie', 'SON', 'Sonstiges',     11)
ON CONFLICT (typ, code) DO NOTHING;

-- ── Seed: Standard-Hersteller ───────────────────────────────────────────────
INSERT INTO inventar_code_segmente (typ, code, label, sort_order) VALUES
  ('hersteller', 'GPR', 'GoPro',     1),
  ('hersteller', 'DJI', 'DJI',       2),
  ('hersteller', 'INS', 'Insta360',  3),
  ('hersteller', 'SAN', 'SanDisk',   4),
  ('hersteller', 'SAM', 'Samsung',   5),
  ('hersteller', 'SNY', 'Sony',      6),
  ('hersteller', 'RDE', 'RØDE',      7),
  ('hersteller', 'ULZ', 'Ulanzi',    8),
  ('hersteller', 'PEK', 'Peak Design', 9),
  ('hersteller', 'GEN', 'Generisch', 99)
ON CONFLICT (typ, code) DO NOTHING;
