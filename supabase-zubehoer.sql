-- ============================================================
-- Session 12: Zubehör-Tabelle + Sets-Erweiterung
-- Im Supabase SQL-Editor ausführen (einmalig)
-- ============================================================

-- ── Zubehör-Tabelle ───────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS accessories (
  id               TEXT PRIMARY KEY,
  name             TEXT NOT NULL,
  category         TEXT NOT NULL DEFAULT 'sonstiges',
  description      TEXT,
  pricing_mode     TEXT NOT NULL DEFAULT 'perDay' CHECK (pricing_mode IN ('perDay', 'flat')),
  price            DECIMAL(10,2) NOT NULL DEFAULT 0,
  available_qty    INTEGER NOT NULL DEFAULT 1,
  available        BOOLEAN NOT NULL DEFAULT true,
  image_url        TEXT,
  sort_order       INTEGER NOT NULL DEFAULT 0,
  created_at       TIMESTAMPTZ DEFAULT NOW()
);

ALTER TABLE accessories ENABLE ROW LEVEL SECURITY;

CREATE POLICY "accessories_public_read" ON accessories
  FOR SELECT USING (true);

CREATE POLICY "accessories_service_write" ON accessories
  FOR ALL USING (auth.role() = 'service_role');

-- Seed aus data/accessories.ts
INSERT INTO accessories (id, name, category, description, pricing_mode, price, available_qty, available, sort_order) VALUES
  ('tripod',  'Mini-Stativ',    'stative',       'Flexibles Gorilla-Pod Stativ, universell',        'perDay', 2.00, 3, true, 1),
  ('sd64',    'SD-Karte 64 GB', 'speicherkarten', 'SanDisk Extreme, Class 10, 4K-ready',             'perDay', 1.00, 5, true, 2),
  ('sd128',   'SD-Karte 128 GB','speicherkarten', 'SanDisk Extreme Pro, Class 10, 4K-ready',         'perDay', 1.50, 3, true, 3),
  ('battery', 'Extra Akku',     'akkus',          'Original-Ersatzakku für die Kamera',              'perDay', 2.00, 6, true, 4)
ON CONFLICT (id) DO NOTHING;

-- ── Sets-Tabelle erweitern ────────────────────────────────────────────────────
-- Neue Spalten für vollständige Set-Verwaltung im Admin

ALTER TABLE sets
  ADD COLUMN IF NOT EXISTS name        TEXT,
  ADD COLUMN IF NOT EXISTS description TEXT,
  ADD COLUMN IF NOT EXISTS badge       TEXT,
  ADD COLUMN IF NOT EXISTS badge_color TEXT,
  ADD COLUMN IF NOT EXISTS tag         TEXT,
  ADD COLUMN IF NOT EXISTS product_ids TEXT[] DEFAULT '{}',
  ADD COLUMN IF NOT EXISTS accessory_items JSONB DEFAULT '[]',
  -- [{"id": "sd64", "qty": 1}, {"id": "battery", "qty": 2}]
  ADD COLUMN IF NOT EXISTS image_url   TEXT,
  ADD COLUMN IF NOT EXISTS sort_order  INTEGER NOT NULL DEFAULT 0;

-- Statische Set-Metadaten einmalig in DB übertragen
UPDATE sets SET name = 'Basic Set',       description = 'Das Starterpaket für einfache Aufnahmen.',              sort_order = 1 WHERE id = 'basic';
UPDATE sets SET name = 'Fahrrad Set',     description = 'Perfekt für Mountainbike- und Rennradtouren.',          badge = 'Beliebt', badge_color = 'blue', sort_order = 2 WHERE id = 'fahrrad';
UPDATE sets SET name = 'Ski Set',         description = 'Für spektakuläre Aufnahmen auf der Piste.',             sort_order = 3 WHERE id = 'ski';
UPDATE sets SET name = 'Motorrad Set',    description = 'Halterungen und Zubehör für Motorradtouren.',           sort_order = 4 WHERE id = 'motorrad';
UPDATE sets SET name = 'Taucher Set',     description = 'Wasserdicht bis 40 m – für Schnorcheln und Tauchen.',  badge = 'Wasserdicht', badge_color = 'teal', tag = 'Wasserdicht', sort_order = 5 WHERE id = 'taucher';
UPDATE sets SET name = 'Vlogging Set',    description = 'Mikrofon, Stativ und Speicher für Content Creator.',   sort_order = 6 WHERE id = 'vlogging';
UPDATE sets SET name = 'Allrounder Set',  description = 'Das komplette Paket für jeden Einsatz.',               badge = 'Komplett', sort_order = 7 WHERE id = 'allrounder';
