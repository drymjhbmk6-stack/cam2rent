-- Atomarer Buchungsnummer-Counter (idempotent).
--
-- Hintergrund: generateBookingId() nutzt(e) `COUNT(*)` auf bookings, was zwei
-- Probleme hat:
--   1) Race: zwei parallele Aufrufer sehen denselben Count und bekommen
--      dieselbe Nummer.
--   2) Drift: wenn eine Buchung mit unerwartetem `is_test`-Wert in derselben
--      Woche existiert (z.B. weil ein Cron oder Webhook in einem anderen
--      Modus geschrieben hat), filtert die Query sie aus → Counter springt
--      zurueck auf 001 obwohl die ID schon vergeben ist.
--
-- Loesung: dedizierte Counter-Tabelle mit Primary Key auf (year_week, is_test)
-- und eine SECURITY DEFINER-Funktion, die ueber ON CONFLICT atomar inkrementiert.
-- Zwei parallele Calls werden serialisiert; jeder bekommt eine eindeutige Nummer.
--
-- Initial-Seed: damit der Counter nicht bei 1 startet (wuerde mit existierenden
-- Buchungen kollidieren), wird er aus dem aktuellen Maximum-Suffix pro Woche
-- + is_test gefuellt.

CREATE TABLE IF NOT EXISTS booking_id_counter (
  year_week TEXT NOT NULL,             -- "YYWW", z.B. "2620"
  is_test BOOLEAN NOT NULL DEFAULT false,
  counter INTEGER NOT NULL DEFAULT 0,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY (year_week, is_test)
);

-- Seed aus existierenden Buchungen. Idempotent: bei mehrfachem Lauf
-- bleibt der Counter auf dem Maximum aller bekannten Suffixe haengen.
INSERT INTO booking_id_counter (year_week, is_test, counter)
SELECT
  -- year_week aus der ID extrahieren. Format: "C2R-YYWW-NNN" oder "TEST-C2R-YYWW-NNN"
  CASE
    WHEN id LIKE 'TEST-C2R-%' THEN SUBSTRING(id FROM 10 FOR 4)
    WHEN id LIKE 'C2R-%' THEN SUBSTRING(id FROM 5 FOR 4)
    ELSE NULL
  END AS year_week,
  COALESCE(is_test, false) AS is_test,
  -- Maximum-Suffix aus den letzten 3+ Ziffern
  MAX(
    NULLIF(
      REGEXP_REPLACE(id, '^.*-(\d+)$', '\1'),
      ''
    )::INTEGER
  ) AS counter
FROM bookings
WHERE id ~ '^(TEST-)?C2R-\d{4}-\d{3,}$'
GROUP BY year_week, is_test
ON CONFLICT (year_week, is_test)
DO UPDATE SET counter = GREATEST(booking_id_counter.counter, EXCLUDED.counter);

-- Atomare Funktion: liefert die naechste freie Nummer pro (year_week, is_test).
-- Garantie: zwei parallele Aufrufer bekommen unterschiedliche Werte (durch
-- Row-Level-Lock waehrend des UPSERTs).
CREATE OR REPLACE FUNCTION next_booking_counter(
  p_year_week TEXT,
  p_is_test BOOLEAN DEFAULT false
)
RETURNS INTEGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_counter INTEGER;
BEGIN
  INSERT INTO booking_id_counter (year_week, is_test, counter, updated_at)
  VALUES (p_year_week, p_is_test, 1, NOW())
  ON CONFLICT (year_week, is_test)
  DO UPDATE SET
    counter = booking_id_counter.counter + 1,
    updated_at = NOW()
  RETURNING counter INTO v_counter;
  RETURN v_counter;
END;
$$;

-- Service-Role darf die Funktion aufrufen; sonst niemand (Bookings-Counter ist
-- intern, kein Endkunden-Lookup).
REVOKE ALL ON FUNCTION next_booking_counter(TEXT, BOOLEAN) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION next_booking_counter(TEXT, BOOLEAN) TO service_role;

-- RLS auf der Counter-Tabelle: service-role-only, andere Rollen sehen nichts.
ALTER TABLE booking_id_counter ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "service_role_all" ON booking_id_counter;
CREATE POLICY "service_role_all" ON booking_id_counter
  FOR ALL
  TO service_role
  USING (true)
  WITH CHECK (true);
