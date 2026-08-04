-- Gespeicherte Zahlungsmittel: Stripe-Customer pro Kunde
-- =====================================================================
-- Speichert die Stripe-Customer-ID pro Kunde, damit ein hinterlegtes
-- Zahlungsmittel (gespeicherte Karte) beim Buchen wiederverwendet werden kann
-- und der Kunde nicht bei jeder Buchung die Kartendaten neu eingeben muss.
--
-- Test/Live strikt getrennt: der Stripe-Customer lebt jeweils in genau EINEM
-- Stripe-Account (Test-Keys vs. Live-Keys). Deshalb zwei getrennte Spalten.
-- Tester-Konten (profiles.is_tester=true) nutzen ebenfalls die _test-Spalte.
--
-- WICHTIG — service-role-only:
-- Diese Spalten werden NICHT in den column-level GRANT UPDATE fuer die Rolle
-- 'authenticated' aufgenommen (siehe supabase-profiles-rls-column-level.sql).
-- Der Kunde darf seine Stripe-Customer-ID NICHT selbst setzen/aendern —
-- gesetzt wird sie ausschliesslich serverseitig (Service-Role) beim Anlegen
-- des Customers. SELECT der eigenen Zeile bleibt fuer die Anzeige erlaubt.
--
-- Idempotent (ADD COLUMN IF NOT EXISTS).

ALTER TABLE profiles ADD COLUMN IF NOT EXISTS stripe_customer_id TEXT;
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS stripe_customer_id_test TEXT;
