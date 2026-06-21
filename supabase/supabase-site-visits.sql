-- ════════════════════════════════════════════════════════════════════════
-- site_visits — cookieloser Besucherzähler (consent-unabhängig)
-- ════════════════════════════════════════════════════════════════════════
--
-- Zweck: Ein einfacher Besucherzähler, der JEDEN Besuch zählt — egal ob der
-- Cookie-Banner akzeptiert wurde oder nicht. Anders als `page_views` (das per
-- § 25 TTDSG nur bei Cookie-Consent='all' befüllt wird) speichert diese Tabelle
-- KEINEN Personenbezug: keine IP, keine visitor_id, kein Cookie — nur pro Tag
-- eine Zähl-Zeile. Damit ist es reine anonyme Aggregat-Statistik (gleiche
-- DSGVO-Logik wie `blog_views` / `blog_posts.view_count`) und braucht keine
-- Einwilligung.
--
-- Gezählt wird pro Browser-Session genau einmal (sessionStorage-Flag im
-- Client, kein Cookie). Tagesgrenze ist Berlin-Zeit (Server reicht das Datum).
--
-- Idempotent: kann mehrfach ausgeführt werden.

CREATE TABLE IF NOT EXISTS site_visits (
  day    DATE PRIMARY KEY,
  visits BIGINT NOT NULL DEFAULT 0
);

-- RLS: nur Service-Role (alle Zugriffe laufen über die API mit Service-Client).
ALTER TABLE site_visits ENABLE ROW LEVEL SECURITY;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public' AND tablename = 'site_visits'
      AND policyname = 'site_visits_service_role_all'
  ) THEN
    CREATE POLICY site_visits_service_role_all ON site_visits
      FOR ALL TO service_role USING (true) WITH CHECK (true);
  END IF;
END$$;

-- Atomarer Increment für den übergebenen Tag (Berlin-Datum aus der API).
-- Race-sicher über ON CONFLICT — parallele Besuche zählen korrekt hoch.
CREATE OR REPLACE FUNCTION increment_site_visit(p_day DATE)
RETURNS void
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
AS $$
  INSERT INTO site_visits (day, visits)
  VALUES (p_day, 1)
  ON CONFLICT (day) DO UPDATE SET visits = site_visits.visits + 1;
$$;
