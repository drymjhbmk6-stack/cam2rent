-- ============================================================
-- cam2rent – Fulfillment-Erweiterung
-- Im Supabase SQL-Editor ausführen (einmalig)
-- ============================================================

-- Rückgabe-Felder zur bookings-Tabelle hinzufügen
ALTER TABLE bookings
  ADD COLUMN IF NOT EXISTS return_notes       TEXT,
  ADD COLUMN IF NOT EXISTS returned_at        TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS return_condition   TEXT DEFAULT 'gut',
  -- 'gut' | 'gebrauchsspuren' | 'beschaedigt'
  ADD COLUMN IF NOT EXISTS shipping_address   TEXT,
  -- Lieferadresse (Name + Straße + PLZ Ort), bei Buchung gespeichert
  ADD COLUMN IF NOT EXISTS tracking_return    TEXT;
  -- Rücksendungs-Tracking-Nummer (vom Kunden)
