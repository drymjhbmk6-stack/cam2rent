-- ─── Race-sichere Unit-Zuweisung ──────────────────────────────────────────
--
-- Fix für Race Condition in lib/unit-assignment.ts:
-- Ohne Lock können zwei parallele Buchungen dieselbe freie Unit finden
-- und zugewiesen bekommen → physisch nur eine Kamera vorhanden, aber
-- zweimal verbucht.
--
-- Lösung: pg_advisory_xact_lock auf product_id serialisiert die
-- Zuweisung pro Produkt. Die Find-and-Update-Logik läuft atomar in
-- einer Transaktion.
--
-- Ausführen im Supabase SQL-Editor.
-- ──────────────────────────────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION assign_free_unit(
  p_product_id text,
  p_rental_from date,
  p_rental_to date,
  p_booking_id text
) RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_unit_id uuid;
BEGIN
  -- Advisory-Lock pro Produkt für die Dauer der Transaktion.
  -- Zwei parallele Buchungen desselben Produkts warten aufeinander.
  PERFORM pg_advisory_xact_lock(hashtext('unit_assign:' || p_product_id));

  -- Erste Unit finden, die nicht in einer überlappenden aktiven Buchung ist.
  SELECT u.id INTO v_unit_id
  FROM product_units u
  WHERE u.product_id = p_product_id
    AND u.status IN ('available', 'rented')
    AND NOT EXISTS (
      SELECT 1 FROM bookings b
      WHERE b.unit_id = u.id
        AND b.status IN ('confirmed', 'shipped', 'active')
        AND b.id <> p_booking_id
        AND b.rental_from <= p_rental_to
        AND b.rental_to >= p_rental_from
    )
  ORDER BY u.created_at NULLS LAST, u.id
  LIMIT 1;

  -- Falls frei gefunden: Buchung aktualisieren
  IF v_unit_id IS NOT NULL THEN
    UPDATE bookings
    SET unit_id = v_unit_id
    WHERE id = p_booking_id;
  END IF;

  RETURN v_unit_id;
END;
$$;

-- Ausführungsrecht für authentifizierte Rollen + Service-Role.
GRANT EXECUTE ON FUNCTION assign_free_unit(text, date, date, text) TO authenticated, service_role;
