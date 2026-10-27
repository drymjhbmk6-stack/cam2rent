-- Optionaler Firmenname pro Kundenprofil
-- ---------------------------------------------------------------------------
-- Ein Kunde kann (freiwillig) einen Firmennamen hinterlegen — bei der
-- Registrierung, spaeter im Kundenkonto oder durch den Admin in den
-- Stammdaten. Leer = Privatkunde, bisheriges Verhalten unveraendert.
--
-- Wirkung: der Firmenname wird auf der Rechnung zum Rechnungsempfaenger,
-- der Personenname rutscht dabei in die erste Adresszeile (uebliche
-- Geschaeftsbrief-Form, siehe lib/build-invoice-data.ts). Eine abweichende
-- Rechnungsadresse (bookings.invoice_name bzw. profiles.billing_name) hat
-- weiterhin Vorrang.
--
-- Pflichtfeld-Pruefungen (Stammdaten-Gate vor der Verifizierung) bleiben
-- unberuehrt — der Firmenname ist nie Pflicht.
--
-- Idempotent.
-- ---------------------------------------------------------------------------

ALTER TABLE profiles
  ADD COLUMN IF NOT EXISTS company_name TEXT;

-- Column-Level GRANT erweitern: der Kunde speichert sein Profil per
-- Browser-Client direkt (siehe supabase-profiles-rls-column-level.sql). Damit
-- der Firmenname aus dem Kundenkonto heraus gespeichert werden darf, muss
-- UPDATE auf diese Spalte zusaetzlich an die authenticated-Rolle granted
-- werden. Additiv zum bestehenden GRANT — sensible Spalten
-- (verification_status, blacklisted, is_tester, …) bleiben ungegrantet.
GRANT UPDATE (company_name) ON profiles TO authenticated;
