-- ============================================================
-- Session 11: Admin Preiskonfiguration
-- Im Supabase SQL-Editor ausführen (einmalig)
-- ============================================================

-- Tabelle für Admin-Konfiguration (Schlüssel → JSON-Wert)
CREATE TABLE IF NOT EXISTS admin_config (
  key        TEXT PRIMARY KEY,
  value      JSONB NOT NULL,
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Trigger: updated_at automatisch aktualisieren
CREATE OR REPLACE FUNCTION update_admin_config_timestamp()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS set_admin_config_timestamp ON admin_config;
CREATE TRIGGER set_admin_config_timestamp
  BEFORE UPDATE ON admin_config
  FOR EACH ROW EXECUTE FUNCTION update_admin_config_timestamp();

-- Startwerte eintragen (nur wenn noch nicht vorhanden)
INSERT INTO admin_config (key, value) VALUES

  ('shipping', '{
    "freeShippingThreshold": 50,
    "standardPrice": 5.99,
    "expressPrice": 12.99
  }'),

  ('haftung', '{
    "standard": 15,
    "premium": 25
  }'),

  ('product_prices', '{
    "1": { "d1": 13,  "d2": 22, "d3": 31, "d7": 69, "d14": 93,  "d30": 149, "deposit": 150 },
    "2": { "d1": 10,  "d2": 17, "d3": 24, "d7": 55, "d14": 80,  "d30": 120, "deposit": 120 },
    "3": { "d1": 12,  "d2": 20, "d3": 28, "d7": 65, "d14": 90,  "d30": 135, "deposit": 140 },
    "4": { "d1": 14,  "d2": 24, "d3": 33, "d7": 75, "d14": 100, "d30": 150, "deposit": 160 },
    "5": { "d1": 15,  "d2": 26, "d3": 36, "d7": 80, "d14": 108, "d30": 160, "deposit": 180 },
    "6": { "d1": 17,  "d2": 29, "d3": 40, "d7": 90, "d14": 121, "d30": 175, "deposit": 200 }
  }')

ON CONFLICT (key) DO NOTHING;

-- Row Level Security: nur per Service-Role-Key schreibbar (aus API-Routes)
ALTER TABLE admin_config ENABLE ROW LEVEL SECURITY;

-- Lesen für alle (wird vom Client-API genutzt)
CREATE POLICY "admin_config_read" ON admin_config
  FOR SELECT USING (true);

-- Schreiben nur für Service Role (API-Routes mit SUPABASE_SERVICE_ROLE_KEY)
CREATE POLICY "admin_config_write" ON admin_config
  FOR ALL USING (auth.role() = 'service_role');
