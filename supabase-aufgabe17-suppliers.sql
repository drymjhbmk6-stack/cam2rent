-- ============================================================
-- Aufgabe 17: Lieferanten- und Einkaufsverwaltung
-- ============================================================

-- 1. Lieferanten
CREATE TABLE IF NOT EXISTS suppliers (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name            TEXT NOT NULL,
  contact_person  TEXT,
  email           TEXT,
  phone           TEXT,
  website         TEXT,
  supplier_number TEXT,
  notes           TEXT,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- 2. Einkäufe / Bestellungen
CREATE TABLE IF NOT EXISTS purchases (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  supplier_id     UUID REFERENCES suppliers(id),
  order_date      DATE NOT NULL,
  status          TEXT NOT NULL DEFAULT 'ordered'
                    CHECK (status IN ('ordered', 'shipped', 'delivered', 'cancelled')),
  invoice_number  TEXT,
  invoice_url     TEXT,
  total_amount    DECIMAL(10,2),
  notes           TEXT,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- 3. Positionen einer Bestellung
CREATE TABLE IF NOT EXISTS purchase_items (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  purchase_id     UUID NOT NULL REFERENCES purchases(id) ON DELETE CASCADE,
  product_name    TEXT NOT NULL,
  quantity        INTEGER NOT NULL DEFAULT 1,
  unit_price      DECIMAL(10,2) NOT NULL,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Indices
CREATE INDEX IF NOT EXISTS idx_purchases_supplier   ON purchases(supplier_id);
CREATE INDEX IF NOT EXISTS idx_purchases_order_date ON purchases(order_date);
CREATE INDEX IF NOT EXISTS idx_purchase_items_purchase ON purchase_items(purchase_id);

-- updated_at trigger (reuse if exists, otherwise create)
CREATE OR REPLACE FUNCTION set_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trg_suppliers_updated_at
  BEFORE UPDATE ON suppliers
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

CREATE TRIGGER trg_purchases_updated_at
  BEFORE UPDATE ON purchases
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();
