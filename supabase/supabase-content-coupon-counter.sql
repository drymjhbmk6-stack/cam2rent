-- Atomarer Counter für UGC-Content-Coupon-Codes (idempotent).
--
-- Hintergrund: lib/customer-ugc.ts:generateCouponCode() erzeugte vorher
-- zufällige Codes wie `UGC-EFTR4P-2K7N` / `BONUS-EFTR4P-9X4M`. Unleserlich
-- und für den Kunden ohne Aussage. Neu: einheitliches Format
-- `C2R-CONTENT-001`, `-002`, … mit durchgehend fortlaufender Nummer
-- (kein Jahres-Reset).
--
-- Lösung: dedizierte Counter-Tabelle mit Primary Key auf (is_test) und eine
-- SECURITY DEFINER-Funktion, die über ON CONFLICT atomar inkrementiert.
-- Zwei parallele Aufrufer werden serialisiert; jeder bekommt eine eindeutige
-- Nummer. Gleiche Bauart wie `next_booking_counter`
-- (supabase-booking-id-counter.sql).
--
-- Separater Counter pro is_test-Wert: Test-Modus stört die Live-Sequenz nicht
-- (analog Buchungsnummern / Gutschriftnummern). Live-Codes:
-- `C2R-CONTENT-NNN`, Test-Codes: `TEST-C2R-CONTENT-NNN`.

CREATE TABLE IF NOT EXISTS content_coupon_counter (
  is_test BOOLEAN NOT NULL DEFAULT false,
  counter INTEGER NOT NULL DEFAULT 0,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY (is_test)
);

-- Seed aus existierenden Coupon-Codes. Idempotent: bei mehrfachem Lauf bleibt
-- der Counter auf dem Maximum aller bekannten Suffixe haengen. Heute (vor
-- erstem Lauf) sollte es noch keine `C2R-CONTENT-`-Codes geben → Counter
-- startet ab 1.
INSERT INTO content_coupon_counter (is_test, counter)
SELECT
  CASE WHEN code LIKE 'TEST-C2R-CONTENT-%' THEN true ELSE false END AS is_test,
  MAX(
    NULLIF(
      REGEXP_REPLACE(code, '^.*-(\d+)$', '\1'),
      ''
    )::INTEGER
  ) AS counter
FROM coupons
WHERE code ~ '^(TEST-)?C2R-CONTENT-\d+$'
GROUP BY is_test
ON CONFLICT (is_test)
DO UPDATE SET counter = GREATEST(content_coupon_counter.counter, EXCLUDED.counter);

-- Atomare Funktion: liefert die naechste freie Nummer pro is_test.
-- Garantie: zwei parallele Aufrufer bekommen unterschiedliche Werte (durch
-- Row-Level-Lock waehrend des UPSERTs).
CREATE OR REPLACE FUNCTION next_content_coupon_counter(
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
  INSERT INTO content_coupon_counter (is_test, counter, updated_at)
  VALUES (p_is_test, 1, NOW())
  ON CONFLICT (is_test)
  DO UPDATE SET
    counter = content_coupon_counter.counter + 1,
    updated_at = NOW()
  RETURNING counter INTO v_counter;
  RETURN v_counter;
END;
$$;

-- Service-Role darf die Funktion aufrufen; sonst niemand (Counter ist intern,
-- kein Endkunden-Lookup).
REVOKE ALL ON FUNCTION next_content_coupon_counter(BOOLEAN) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION next_content_coupon_counter(BOOLEAN) TO service_role;

-- RLS auf der Counter-Tabelle: service-role-only, andere Rollen sehen nichts.
ALTER TABLE content_coupon_counter ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "service_role_all" ON content_coupon_counter;
CREATE POLICY "service_role_all" ON content_coupon_counter
  FOR ALL
  TO service_role
  USING (true)
  WITH CHECK (true);
