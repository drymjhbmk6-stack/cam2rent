-- ════════════════════════════════════════════════════════════════════════
-- Sicherheit 02b — Tabellenrechte für `anon` generell entziehen
-- ════════════════════════════════════════════════════════════════════════
--
-- ⚠️ ERST AUSFÜHREN, NACHDEM supabase-sec-02-rls-nachtrag.sql gelaufen ist UND
--    der Shop-Smoke-Test dort erfolgreich war.
--    Bewusst eine eigene Datei: Falls nach der Ausführung etwas nicht mehr geht,
--    ist sofort klar, welcher der beiden Schritte die Ursache war.
--
-- ZWECK — struktureller Schutz statt Einzelfallreparatur:
-- Supabase vergibt per Default-Privileges `GRANT ALL ON ALL TABLES IN SCHEMA
-- public TO anon, authenticated`. Deshalb war jede Tabelle, bei der jemand das
-- `ENABLE ROW LEVEL SECURITY` vergessen hat, sofort öffentlich les- und
-- schreibbar (Befund K-1 — 15 Tabellen waren betroffen).
--
-- Dieses Skript dreht die Standardeinstellung um: Ohne ausdrückliches GRANT
-- kommt `anon` an gar keine Tabelle mehr. Eine künftig vergessene RLS-Aktivierung
-- ist damit kein Datenleck mehr, sondern nur noch ein fehlendes Feature.
-- Das ist die eigentliche Absicherung — Paket 02 repariert die bekannten Fälle,
-- dieses Paket verhindert die nächsten.
--
-- WARUM DAS NICHTS BRICHT (geprüft):
--   1. Kein Zugriff aus dem Browser. Alle `'use client'`-Dateien mit `.from(`
--      wurden geprüft — einziger Treffer ist `profiles`, und der läuft als
--      `authenticated` (nicht `anon`). `authenticated` wird hier NICHT angefasst.
--   2. Die einzige `TO anon`-Policy im gesamten Repo ist der INSERT auf
--      `page_views` (erledigte supabase/supabase-analytics.sql:34). Sie ist
--      faktisch toter Code: `app/api/track/route.ts:78` nutzt
--      `createServiceClient()`, der anon-Pfad wird nie beschritten.
--   3. Keine Realtime-Subscriptions (`.channel(` / `postgres_changes`) im Repo.
--   4. Shop-Daten (Produkte, Sets, Zubehör) kommen über API-Routen mit
--      Service-Role, nicht per Direktzugriff.
--
-- NICHT betroffen: Schema `auth` (Anmeldung/Registrierung laufen weiter),
-- Schema `storage` (eigene Policies), Rolle `authenticated`, Rolle `service_role`.
--
-- Idempotent.

-- Bestehende Tabellen
REVOKE ALL ON ALL TABLES     IN SCHEMA public FROM anon;
REVOKE ALL ON ALL SEQUENCES  IN SCHEMA public FROM anon;

-- Künftige Tabellen (verhindert, dass die Lücke erneut entsteht)
ALTER DEFAULT PRIVILEGES IN SCHEMA public REVOKE ALL ON TABLES    FROM anon;
ALTER DEFAULT PRIVILEGES IN SCHEMA public REVOKE ALL ON SEQUENCES FROM anon;

-- ════════════════════════════════════════════════════════════════════════
-- Verifikation — Erwartung: 0 Zeilen
-- ════════════════════════════════════════════════════════════════════════

SELECT table_name, privilege_type
  FROM information_schema.role_table_grants
 WHERE grantee = 'anon' AND table_schema = 'public'
 ORDER BY 1, 2;

-- ════════════════════════════════════════════════════════════════════════
-- Smoke-Test — bitte NACH dem Ausführen durchgehen
-- ════════════════════════════════════════════════════════════════════════
--   Als NICHT eingeloggter Besucher (privates Fenster):
--     Startseite · /kameras · eine Produktseite mit Kalender · /blog ·
--     ein Blogartikel · /agb (Rechtstexte) · Warenkorb befüllen
--   Als eingeloggter Kunde:
--     /konto/uebersicht (Profil laden und speichern) · /konto/buchungen
--
-- Rollback (sofort wirksam, falls etwas fehlt):
--   GRANT SELECT ON ALL TABLES IN SCHEMA public TO anon;
--   ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT SELECT ON TABLES TO anon;
--
-- Hinweis zur Fehlersuche: Fehlt `anon` das Tabellenrecht, liefert PostgREST
-- einen 401/permission-denied — im Gegensatz zu einem RLS-Deny, der still ein
-- leeres Array zurückgibt. Ein Ausfall wäre also gut sichtbar, nicht schleichend.
