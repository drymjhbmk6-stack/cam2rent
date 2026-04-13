-- ============================================================
-- Migration: Seriennummern-basierte Kameraverwaltung
-- Erstellt: 2026-04-13
-- ============================================================

-- 1. Neue Tabelle product_units
CREATE TABLE IF NOT EXISTS product_units (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  product_id TEXT NOT NULL,
  serial_number TEXT NOT NULL,
  label TEXT,
  status TEXT DEFAULT 'available' CHECK (status IN ('available', 'rented', 'maintenance', 'retired')),
  notes TEXT,
  purchased_at DATE,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Index für schnelle Abfragen nach product_id
CREATE INDEX IF NOT EXISTS idx_product_units_product_id ON product_units(product_id);

-- Unique constraint: Seriennummer muss pro Produkt eindeutig sein
ALTER TABLE product_units ADD CONSTRAINT unique_serial_per_product UNIQUE (product_id, serial_number);

-- RLS aktivieren
ALTER TABLE product_units ENABLE ROW LEVEL SECURITY;

-- RLS Policies
CREATE POLICY "product_units_public_read" ON product_units
  FOR SELECT USING (true);

CREATE POLICY "product_units_admin_all" ON product_units
  FOR ALL USING (true) WITH CHECK (true);

-- 2. Neue Spalte unit_id in bookings
ALTER TABLE bookings ADD COLUMN IF NOT EXISTS unit_id UUID REFERENCES product_units(id);

-- Index für schnelle Zuordnungs-Abfragen
CREATE INDEX IF NOT EXISTS idx_bookings_unit_id ON bookings(unit_id);
