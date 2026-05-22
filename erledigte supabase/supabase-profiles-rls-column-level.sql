-- Profiles RLS: Spalten-Level-GRANT statt blanket UPDATE.
--
-- Problem (Audit Sweep 6, Vuln 1):
-- Die alte Policy `users_update_own_profile` auf `profiles FOR UPDATE`
-- erlaubte einem authentifizierten Kunden, JEDE Spalte seines Profils
-- via Supabase-Browser-Client zu schreiben — inklusive der Admin-Felder
-- `verification_status`, `blacklisted`, `is_tester`, `id_front_url`,
-- `verified_at`, `verified_by`, `anonymized`, `deleted_at`.
--
-- Folgen ohne Fix:
-- - Kunde setzt sich selbst auf `verification_status='verified'` und
--   bucht ohne Ausweis-Upload.
-- - Kunde hebt eine Admin-Schwarze-Liste (`blacklisted=false`) auf.
-- - Kunde setzt `is_tester=true` und schaltet damit auf Stripe-Test-Keys
--   um — Buchung mit Testkarte, faellt aus EUeR/DATEV raus.
--
-- Fix: nur freigegebene Spalten via GRANT, sensible Spalten gehen nur
-- noch ueber Service-Role-API-Routen.

BEGIN;

-- 1) Alte Policy entfernen
DROP POLICY IF EXISTS "users_update_own_profile" ON profiles;

-- 2) Blanket-Rechte zuruecknehmen
REVOKE UPDATE ON profiles FROM authenticated;

-- 3) Explizit nur die Spalten, die der Kunde selbst aendern darf.
--    Bei Bedarf ergaenzen — alle anderen muessen ueber service-role-API laufen.
GRANT UPDATE (
  full_name,
  phone,
  address_street,
  address_zip,
  address_city,
  updated_at
) ON profiles TO authenticated;

-- 4) Neue Policy mit sowohl USING als auch WITH CHECK
CREATE POLICY "users_update_own_profile"
  ON profiles FOR UPDATE
  USING (auth.uid() = id)
  WITH CHECK (auth.uid() = id);

COMMIT;

-- Verifikation:
-- Nach der Migration sollte folgender Snippet im Browser-Client der
-- Customer-Seite einen 403 / "permission denied" werfen:
--
--   await supabase.from('profiles')
--     .update({ verification_status: 'verified', is_tester: true })
--     .eq('id', user.id);
--
-- Waehrend ein normaler Address-Update weiter funktioniert:
--
--   await supabase.from('profiles')
--     .update({ full_name: 'Neuer Name', phone: '+49 ...' })
--     .eq('id', user.id);
