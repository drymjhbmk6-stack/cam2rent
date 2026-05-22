-- Angebots-Buendel (Kamera + Zubehoer Festpreis-Aktionen, Stand 2026-05-22)
--
-- Ein "Angebot" ist ein kuratiertes Festpreis-Buendel aus EINER Kamera
-- (mehrere Kamera-Optionen mit je eigenem Preis moeglich) + enthaltenem
-- Zubehoer. valid_from/valid_until ist Verkaufs- UND Mietfenster: das Angebot
-- ist nur in dem Zeitraum buchbar und der gewaehlte Mietzeitraum muss
-- komplett hineinfallen.
--
-- pricing_mode:
--   'flat'   = camera_options[].price ist der Komplettpreis fuer genau
--              fixed_days Tage (Kunde waehlt nur das Startdatum-Fenster).
--   'perDay' = camera_options[].price ist der Komplettpreis pro Tag.
-- In beiden Faellen ersetzt der Preis die normale Kamerapreis-Berechnung
-- inklusive des enthaltenen Zubehoers (all-in). Haftungsschutz + Versand
-- laufen weiterhin normal obendrauf.
--
-- camera_options:  [{ "product_id": "...", "price": 49.0,
--                     "accessory_items": [{ "accessory_id": "...", "qty": 1 }] }]
-- Das enthaltene Zubehoer wird PRO Kamera gepflegt — verschiedene Kameras
-- haben unterschiedliches Zubehoer (eigene Akkus, Tauchgehaeuse etc.).
--
-- Idempotent. Defensiver Code-Pfad in der API greift, falls die Migration
-- noch nicht durch ist (Angebote-Features inaktiv, normaler Flow unberuehrt).

CREATE TABLE IF NOT EXISTS angebote (
  id              TEXT PRIMARY KEY,
  name            TEXT NOT NULL,
  description     TEXT,
  valid_from      TIMESTAMPTZ,
  valid_until     TIMESTAMPTZ,
  pricing_mode    TEXT NOT NULL DEFAULT 'flat' CHECK (pricing_mode IN ('flat', 'perDay')),
  fixed_days      INT,
  camera_options  JSONB NOT NULL DEFAULT '[]',
  image_url       TEXT,
  badge           TEXT,
  badge_color     TEXT,
  sort_order      INT NOT NULL DEFAULT 0,
  active          BOOLEAN NOT NULL DEFAULT true,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_angebote_active_valid
  ON angebote (active, valid_until);

-- RLS: alle Zugriffe laufen ueber den Service-Role-Client (bypassed RLS).
-- Enable ohne Policy = kein anon/authenticated-Zugriff.
ALTER TABLE angebote ENABLE ROW LEVEL SECURITY;

-- Verknuepfung Buchung -> Angebot (nullbar; nur gesetzt bei Angebots-Buchungen).
ALTER TABLE bookings ADD COLUMN IF NOT EXISTS offer_id TEXT;
