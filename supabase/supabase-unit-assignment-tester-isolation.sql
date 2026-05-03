-- ============================================================
-- Test-/Live-Isolation bei Unit-Zuweisung
-- Erstellt: 2026-05-03
-- ============================================================
--
-- Problem: Wenn ein Tester-User (profiles.is_tester=true) auf der Live-
-- Seite bucht, wird die Buchung als is_test=true gespeichert. Die
-- Unit-Zuweisungs-RPCs (assign_free_unit, assign_free_accessory_units)
-- blockierten aber die zugewiesene Einheit auch fuer echte Live-
-- Buchungen → echter Kunde sah die Kamera als ausgebucht, obwohl nur
-- ein Test lief.
--
-- Fix: Bei der Suche nach freien Units werden nur Buchungen mit
-- gleichem is_test-Wert beruecksichtigt. Test- und Live-Buchungen leben
-- in getrennten "Universen", die sich nicht gegenseitig blockieren.
--
-- Idempotent (CREATE OR REPLACE FUNCTION).
-- ============================================================

-- ── Kameras (product_units) ─────────────────────────────────────────────
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
  v_is_test boolean;
BEGIN
  -- Advisory-Lock pro Produkt fuer die Dauer der Transaktion.
  PERFORM pg_advisory_xact_lock(hashtext('unit_assign:' || p_product_id));

  -- is_test der neu zu zuweisenden Buchung ermitteln (defensiv NULL → false)
  SELECT COALESCE(is_test, false) INTO v_is_test
  FROM bookings WHERE id = p_booking_id;
  v_is_test := COALESCE(v_is_test, false);

  -- Erste Unit finden, die nicht in einer ueberlappenden aktiven Buchung
  -- DESSELBEN is_test-Werts ist. Test- und Live-Buchungen sehen sich nicht.
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
        AND COALESCE(b.is_test, false) = v_is_test
    )
  ORDER BY u.created_at NULLS LAST, u.id
  LIMIT 1;

  IF v_unit_id IS NOT NULL THEN
    UPDATE bookings
    SET unit_id = v_unit_id
    WHERE id = p_booking_id;
  END IF;

  RETURN v_unit_id;
END;
$$;

GRANT EXECUTE ON FUNCTION assign_free_unit(text, date, date, text) TO authenticated, service_role;


-- ── Zubehoer (accessory_units) ──────────────────────────────────────────
CREATE OR REPLACE FUNCTION assign_free_accessory_units(
  p_accessory_id text,
  p_qty integer,
  p_rental_from date,
  p_rental_to date,
  p_booking_id text
) RETURNS uuid[]
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_assigned uuid[] := ARRAY[]::uuid[];
  v_unit_id uuid;
  v_is_test boolean;
BEGIN
  IF p_qty IS NULL OR p_qty <= 0 THEN
    RETURN v_assigned;
  END IF;

  PERFORM pg_advisory_xact_lock(hashtext('accessory_unit_assign:' || p_accessory_id));

  SELECT COALESCE(is_test, false) INTO v_is_test
  FROM bookings WHERE id = p_booking_id;
  v_is_test := COALESCE(v_is_test, false);

  FOR v_unit_id IN
    SELECT u.id
    FROM accessory_units u
    WHERE u.accessory_id = p_accessory_id
      AND u.status IN ('available', 'rented')
      AND NOT EXISTS (
        SELECT 1 FROM bookings b
        WHERE u.id = ANY(b.accessory_unit_ids)
          AND b.id <> p_booking_id
          AND b.status NOT IN ('cancelled', 'completed', 'returned')
          AND b.rental_from <= p_rental_to
          AND b.rental_to   >= p_rental_from
          AND COALESCE(b.is_test, false) = v_is_test
      )
    ORDER BY u.purchased_at ASC NULLS LAST, u.created_at ASC, u.id
    LIMIT p_qty
  LOOP
    v_assigned := array_append(v_assigned, v_unit_id);
  END LOOP;

  IF COALESCE(array_length(v_assigned, 1), 0) < p_qty THEN
    RETURN ARRAY[]::uuid[];
  END IF;

  UPDATE bookings
  SET accessory_unit_ids = COALESCE(accessory_unit_ids, '{}'::uuid[]) || v_assigned
  WHERE id = p_booking_id;

  UPDATE accessory_units
  SET status = 'rented'
  WHERE id = ANY(v_assigned);

  RETURN v_assigned;
END;
$$;

GRANT EXECUTE ON FUNCTION assign_free_accessory_units(text, integer, date, date, text)
  TO authenticated, service_role;
