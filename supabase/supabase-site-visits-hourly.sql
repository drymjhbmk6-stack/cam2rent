-- ════════════════════════════════════════════════════════════════════════
-- site_visits_hourly — cookieloser Besucherzähler pro Stunde
-- ════════════════════════════════════════════════════════════════════════
--
-- Zweck: Erweitert den täglichen cookielosen Zähler (`site_visits`) um eine
-- Stunden-Auflösung, damit das "Aufrufe heute nach Stunde"-Balkendiagramm die
-- cookielosen Besuche (ohne Cookie-Zustimmung) pro Stunde in Grün anzeigen kann.
--
-- Gleiche DSGVO-Logik wie `site_visits`: KEIN Personenbezug (keine IP, keine
-- visitor_id, kein Cookie) — nur pro (Tag, Stunde) eine Zähl-Zeile. Reine
-- anonyme Aggregat-Statistik, braucht keine Einwilligung.
--
-- Tag + Stunde sind Berlin-Zeit (Server reicht Datum + Stunde).
-- Idempotent: kann mehrfach ausgeführt werden.

CREATE TABLE IF NOT EXISTS site_visits_hourly (
  day    DATE     NOT NULL,
  hour   SMALLINT NOT NULL CHECK (hour >= 0 AND hour <= 23),
  visits BIGINT   NOT NULL DEFAULT 0,
  PRIMARY KEY (day, hour)
);

-- RLS: nur Service-Role (alle Zugriffe laufen über die API mit Service-Client).
ALTER TABLE site_visits_hourly ENABLE ROW LEVEL SECURITY;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public' AND tablename = 'site_visits_hourly'
      AND policyname = 'site_visits_hourly_service_role_all'
  ) THEN
    CREATE POLICY site_visits_hourly_service_role_all ON site_visits_hourly
      FOR ALL TO service_role USING (true) WITH CHECK (true);
  END IF;
END$$;

-- Atomarer Increment für (Tag, Stunde). Race-sicher über ON CONFLICT.
CREATE OR REPLACE FUNCTION increment_site_visit_hourly(p_day DATE, p_hour SMALLINT)
RETURNS void
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
AS $$
  INSERT INTO site_visits_hourly (day, hour, visits)
  VALUES (p_day, p_hour, 1)
  ON CONFLICT (day, hour) DO UPDATE SET visits = site_visits_hourly.visits + 1;
$$;
