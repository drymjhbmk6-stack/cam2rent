-- Abweichende Liefer- und Rechnungsadresse pro Kundenprofil (Standard)
-- ---------------------------------------------------------------------------
-- Privatkunden koennen optional eine dauerhafte abweichende Lieferadresse
-- (delivery_*) und/oder Rechnungsadresse (billing_*) hinterlegen, die fuer
-- ALLE kuenftigen Buchungen als Default genutzt wird. Leer = Hauptadresse
-- (address_*) gilt.
--
-- Pro Buchung kann der Kunde diese Defaults im Checkout zusaetzlich
-- ueberschreiben (per-order) — das landet direkt auf bookings.shipping_address
-- bzw. bookings.invoice_name/invoice_address (keine neue Spalte noetig).
--
-- Idempotent.
-- ---------------------------------------------------------------------------

ALTER TABLE profiles
  ADD COLUMN IF NOT EXISTS delivery_name   TEXT,
  ADD COLUMN IF NOT EXISTS delivery_street TEXT,
  ADD COLUMN IF NOT EXISTS delivery_zip    TEXT,
  ADD COLUMN IF NOT EXISTS delivery_city   TEXT,
  ADD COLUMN IF NOT EXISTS billing_name    TEXT,
  ADD COLUMN IF NOT EXISTS billing_street  TEXT,
  ADD COLUMN IF NOT EXISTS billing_zip     TEXT,
  ADD COLUMN IF NOT EXISTS billing_city    TEXT;

-- Column-Level GRANT erweitern: der Kunde speichert sein Profil per
-- Browser-Client direkt (siehe supabase-profiles-rls-column-level.sql). Damit
-- die neuen Felder mitgeschrieben werden duerfen, muss UPDATE darauf zusaetzlich
-- an die authenticated-Rolle granted werden. Additiv zum bestehenden GRANT.
GRANT UPDATE (
  delivery_name, delivery_street, delivery_zip, delivery_city,
  billing_name, billing_street, billing_zip, billing_city
) ON profiles TO authenticated;
