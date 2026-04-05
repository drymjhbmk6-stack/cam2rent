-- ═══════════════════════════════════════════════════════════════════════
-- cam2rent – Supabase Setup
-- Dieses SQL im Supabase Dashboard ausführen:
-- supabase.com → Dein Projekt → SQL Editor → New Query → einfügen → Run
-- ═══════════════════════════════════════════════════════════════════════

-- ─── Buchungen ────────────────────────────────────────────────────────────────

CREATE TABLE bookings (
  id                TEXT PRIMARY KEY,          -- z.B. BK-2026-00001
  payment_intent_id TEXT UNIQUE NOT NULL,      -- Stripe pi_xxx (verhindert Doppelbuchungen)
  product_id        TEXT NOT NULL,             -- z.B. "1" (aus data/products.ts)
  product_name      TEXT NOT NULL,             -- z.B. "GoPro Hero 13 Black"
  rental_from       DATE NOT NULL,             -- Mietbeginn
  rental_to         DATE NOT NULL,             -- Mietende
  days              INTEGER NOT NULL,          -- Anzahl Miettage (inkl.)
  delivery_mode     TEXT NOT NULL,             -- 'versand' | 'abholung'
  shipping_method   TEXT,                      -- 'standard' | 'express' | null bei Abholung
  shipping_price    DECIMAL(10,2) DEFAULT 0,   -- Versandkosten in €
  haftung           TEXT NOT NULL,             -- 'none' | 'standard' | 'premium'
  accessories       TEXT[] DEFAULT '{}',       -- z.B. ['tripod', 'sd64']
  price_rental      DECIMAL(10,2) DEFAULT 0,   -- Mietpreis in €
  price_accessories DECIMAL(10,2) DEFAULT 0,   -- Zubehörkosten in €
  price_haftung     DECIMAL(10,2) DEFAULT 0,   -- Haftungsschutz in €
  price_total       DECIMAL(10,2) NOT NULL,    -- Gesamtbetrag in €
  deposit           DECIMAL(10,2) DEFAULT 0,   -- Kaution in €
  status            TEXT DEFAULT 'confirmed',  -- 'confirmed' | 'cancelled' | 'completed'
  created_at        TIMESTAMPTZ DEFAULT NOW()
);

-- Index für schnelle Verfügbarkeitsabfragen
CREATE INDEX bookings_product_dates ON bookings (product_id, rental_from, rental_to, status);

-- ─── Row Level Security ───────────────────────────────────────────────────────
-- Wichtig: Service Role Key (im Backend) umgeht RLS automatisch.
-- Der Anon Key (Frontend) darf bookings nicht direkt lesen/schreiben.

ALTER TABLE bookings ENABLE ROW LEVEL SECURITY;

-- Keine öffentlichen Policies → alles über API-Routes mit Service Role Key
