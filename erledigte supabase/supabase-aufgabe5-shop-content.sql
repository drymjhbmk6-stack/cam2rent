-- =============================================================
-- Aufgabe 5: Shop Page Content (Shop Updater / CMS)
-- =============================================================

-- Tabelle: shop_page_content
CREATE TABLE IF NOT EXISTS shop_page_content (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  page TEXT NOT NULL,
  section TEXT NOT NULL,
  content JSONB NOT NULL DEFAULT '{}',
  is_active BOOLEAN DEFAULT true,
  sort_order INTEGER DEFAULT 0,
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  updated_by UUID,
  UNIQUE(page, section)
);

-- Index fuer schnelle Abfragen nach Seite
CREATE INDEX IF NOT EXISTS idx_shop_page_content_page ON shop_page_content(page);

-- Trigger: updated_at automatisch aktualisieren
CREATE OR REPLACE FUNCTION update_shop_page_content_timestamp()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_shop_page_content_updated ON shop_page_content;
CREATE TRIGGER trg_shop_page_content_updated
  BEFORE UPDATE ON shop_page_content
  FOR EACH ROW
  EXECUTE FUNCTION update_shop_page_content_timestamp();

-- RLS aktivieren
ALTER TABLE shop_page_content ENABLE ROW LEVEL SECURITY;

-- Lesen: Jeder darf lesen (fuer das Frontend)
CREATE POLICY "shop_page_content_read" ON shop_page_content
  FOR SELECT USING (true);

-- Schreiben: Nur authentifizierte Benutzer (Admins)
CREATE POLICY "shop_page_content_write" ON shop_page_content
  FOR ALL USING (auth.role() = 'authenticated');

-- Standardinhalte einfuegen
INSERT INTO shop_page_content (page, section, content, is_active, sort_order) VALUES
  ('startseite', 'hero', '{
    "ueberschrift": "Action-Cams mieten statt kaufen",
    "untertitel": "Hochwertige Action-Kameras ab 9,90 €/Tag. Mit Haftungsschutz, schnell geliefert, flexibel.",
    "cta_text": "Kameras entdecken",
    "cta_link": "/kameras"
  }', true, 0),
  ('startseite', 'news_banner', '{
    "enabled": true,
    "messages": [
      {"id": "1", "text": "Neu im Shop: GoPro Hero 13 Black", "active": true},
      {"id": "2", "text": "Jetzt Sets buchen und sparen", "active": true},
      {"id": "3", "text": "Kostenloser Standardversand ab 50 € Bestellwert", "active": true}
    ]
  }', true, 1),
  ('startseite', 'usps', '{
    "items": [
      {"icon": "shield", "text": "Mit Haftungsschutz"},
      {"icon": "truck", "text": "Kostenloser Versand"},
      {"icon": "clock", "text": "24h Lieferung"},
      {"icon": "star", "text": "Top-bewerteter Service"}
    ]
  }', true, 2),
  ('startseite', 'reviews_config', '{
    "show_reviews": true,
    "count": 6
  }', true, 3)
ON CONFLICT (page, section) DO NOTHING;
