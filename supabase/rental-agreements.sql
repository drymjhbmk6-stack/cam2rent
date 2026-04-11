-- ═══════════════════════════════════════════════════════════════════════════
-- cam2rent — Digitale Mietvertragsunterschrift
-- Neue Tabelle: rental_agreements (unveraenderlich)
-- Neue Spalten: bookings.contract_signed, contract_signed_at
-- ═══════════════════════════════════════════════════════════════════════════

-- Neue Spalten in bookings (falls noch nicht vorhanden)
ALTER TABLE bookings
  ADD COLUMN IF NOT EXISTS contract_signed BOOLEAN DEFAULT FALSE,
  ADD COLUMN IF NOT EXISTS contract_signed_at TIMESTAMPTZ;

-- Neue Tabelle: Vertragsdaten (unveraenderlich — kein UPDATE erlaubt)
CREATE TABLE IF NOT EXISTS rental_agreements (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  booking_id TEXT REFERENCES bookings(id) NOT NULL UNIQUE,
  pdf_url TEXT NOT NULL,
  contract_hash TEXT NOT NULL,
  signed_by_name TEXT NOT NULL,
  signed_at TIMESTAMPTZ NOT NULL,
  ip_address TEXT NOT NULL,
  signature_method TEXT NOT NULL
    CHECK (signature_method IN ('canvas', 'typed')),
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- RLS: Kunde sieht nur eigene Vertraege
ALTER TABLE rental_agreements ENABLE ROW LEVEL SECURITY;

CREATE POLICY "customers_own_contracts" ON rental_agreements
  FOR SELECT USING (
    booking_id IN (
      SELECT id FROM bookings WHERE user_id = auth.uid()
    )
  );

-- KEIN UPDATE-Policy — Vertraege sind unveraenderlich
-- Nur Service Role darf schreiben (via API Route)

-- Index fuer schnelle Lookup
CREATE INDEX IF NOT EXISTS idx_rental_agreements_booking_id
  ON rental_agreements(booking_id);

-- Supabase Storage Bucket: contracts
-- Name: contracts
-- Public: FALSE
-- Allowed MIME types: application/pdf
-- Max file size: 10MB
-- (Muss im Supabase Dashboard oder via CLI erstellt werden)
