-- ============================================================================
-- Aufgabe 12: Verfügbarkeitskalender – Tabellen
-- ============================================================================

-- Gesperrte Zeiträume (z. B. Wartung, Feiertage, manuelle Blockierung)
CREATE TABLE IF NOT EXISTS product_blocked_dates (
  id          UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  product_id  TEXT        NOT NULL,
  start_date  DATE        NOT NULL,
  end_date    DATE        NOT NULL,
  reason      TEXT,
  blocked_by  UUID,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Index für schnelles Abfragen nach Produkt + Zeitraum
CREATE INDEX IF NOT EXISTS idx_blocked_dates_product
  ON product_blocked_dates (product_id, start_date, end_date);

-- Inventar: einzelne Geräte-Einheiten pro Produkt
CREATE TABLE IF NOT EXISTS product_inventory (
  id            UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  product_id    TEXT        NOT NULL,
  serial_number TEXT,
  label         TEXT,
  status        TEXT        NOT NULL DEFAULT 'available'
                            CHECK (status IN ('available', 'rented', 'maintenance', 'defective')),
  notes         TEXT,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at    TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_inventory_product
  ON product_inventory (product_id, status);

-- RLS aktivieren
ALTER TABLE product_blocked_dates ENABLE ROW LEVEL SECURITY;
ALTER TABLE product_inventory ENABLE ROW LEVEL SECURITY;

-- Öffentlicher Lesezugriff für blocked_dates (Kalender ist public)
CREATE POLICY "Blocked dates are viewable by everyone"
  ON product_blocked_dates FOR SELECT
  USING (true);

-- Service-Role hat vollen Zugriff
CREATE POLICY "Service role full access on blocked_dates"
  ON product_blocked_dates FOR ALL
  USING (true)
  WITH CHECK (true);

CREATE POLICY "Inventory viewable by service role"
  ON product_inventory FOR ALL
  USING (true)
  WITH CHECK (true);
