-- =====================================================================
-- supabase-check-email-rpc.sql
--
-- Ersetzt das ineffiziente und Enumeration-anfällige
-- supabase.auth.admin.listUsers({ perPage: 1000 }) — Pattern aus
-- /api/auth/check-email und /api/auth/express-signup.
--
-- Vorher: pro Anfrage werden bis zu 1000 Auth-User geladen, der Server-Code
-- iteriert und vergleicht E-Mails. Skaliert nicht über 1000 Kunden, frisst
-- Supabase-Auth-API-Quota und bei IP-Rotation lassen sich praktisch alle
-- Adressen offenlegen.
--
-- Nachher: ein gezielter Postgres-Lookup pro E-Mail — O(1) bei Index, kein
-- Daten-Leak, gleiche UX-Antwort {exists: boolean}.
--
-- Idempotent: kann mehrfach ausgeführt werden, CREATE OR REPLACE.
-- =====================================================================

CREATE OR REPLACE FUNCTION public.check_email_exists(p_email text)
RETURNS boolean
LANGUAGE sql
-- SECURITY DEFINER: Funktion läuft mit den Rechten ihres Owners (postgres),
-- damit sie auf auth.users zugreifen kann, ohne der service_role direkten
-- auth-Schema-Zugriff zu geben.
SECURITY DEFINER
-- Stable: gleiche Eingabe -> gleiche Ausgabe innerhalb einer Statement,
-- erlaubt Postgres das Caching innerhalb komplexer Queries.
STABLE
SET search_path = public, auth
AS $$
  SELECT EXISTS (
    SELECT 1 FROM auth.users
    WHERE lower(email) = lower(p_email)
      AND email IS NOT NULL
  );
$$;

-- Nur die service_role darf die Funktion aufrufen — der API-Server ist die
-- einzige Stelle, die /api/auth/check-email + /api/auth/express-signup
-- aufruft. Authenticated/anon User dürfen nicht über die Funktion enumerieren.
REVOKE ALL ON FUNCTION public.check_email_exists(text) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.check_email_exists(text) FROM authenticated;
REVOKE ALL ON FUNCTION public.check_email_exists(text) FROM anon;
GRANT EXECUTE ON FUNCTION public.check_email_exists(text) TO service_role;

COMMENT ON FUNCTION public.check_email_exists(text) IS
  'O(1)-Lookup ob eine E-Mail in auth.users existiert. Wird vom App-Server
   genutzt, um Express-Signup ohne komplette User-Liste zu prüfen.
   service_role-only.';
