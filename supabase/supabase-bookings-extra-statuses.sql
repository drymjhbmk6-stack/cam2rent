-- ============================================================
-- Zwei neue Buchungs-Zwischenstatus blockieren das Inventar
-- Erstellt: 2026-05-23
-- ============================================================
--
-- Neu hinzugekommene Status-Werte auf bookings.status:
--   - preparing_shipment  (Label "Wird versendet")  — zwischen confirmed und shipped
--   - awaiting_pickup     (Label "Warten auf Abholung") — zwischen confirmed und picked_up
--
-- Beide muessen die race-sicheren Zuweisungs-RPCs (`assign_free_unit` +
-- `assign_free_camera_units`) als belegend kennen — sonst koennten Kameras,
-- die in diesen Zwischenstadien stecken, faelschlich an ueberlappende
-- Neubuchungen vergeben werden.
--
-- Das ist ein **idempotenter Status-Filter-Patch** der beiden RPC-Definitionen
-- aus `erledigte supabase/supabase-camera-unit-assignment.sql`. Body identisch
-- bis auf den `b.status IN (...)`-Block — beide neuen Status ergaenzt.
--
-- `assign_free_accessory_units` (accessory-unit-assignment-lock.sql) nutzt
-- einen NEGATIONS-Filter (NOT IN ('cancelled','completed','returned')) —
-- die neuen Status sind dort automatisch blockierend. Keine Anpassung noetig.
-- ============================================================

CREATE OR REPLACE FUNCTION assign_free_camera_units(
  p_product_id text,
  p_rental_from date,
  p_rental_to date,
  p_booking_id text
) RETURNS uuid[]
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_assigned uuid[] := ARRAY[]::uuid[];
  v_cameras jsonb;
  v_is_test boolean;
  v_idx int;
  v_elem jsonb;
  v_unit_id uuid;
  v_used uuid[] := ARRAY[]::uuid[];
  v_new jsonb := '[]'::jsonb;
  v_first_unit uuid;
BEGIN
  PERFORM pg_advisory_xact_lock(hashtext('unit_assign:' || p_product_id));

  SELECT COALESCE(is_test, false), cameras
    INTO v_is_test, v_cameras
  FROM bookings WHERE id = p_booking_id;
  v_is_test := COALESCE(v_is_test, false);

  IF v_cameras IS NULL OR jsonb_typeof(v_cameras) <> 'array' THEN
    RETURN v_assigned;
  END IF;

  SELECT COALESCE(array_agg((e->>'unit_id')::uuid), ARRAY[]::uuid[])
    INTO v_used
  FROM jsonb_array_elements(v_cameras) e
  WHERE e->>'unit_id' IS NOT NULL AND e->>'unit_id' <> '';

  FOR v_idx IN 0 .. jsonb_array_length(v_cameras) - 1 LOOP
    v_elem := v_cameras -> v_idx;

    IF (v_elem->>'product_id') = p_product_id
       AND (v_elem->>'unit_id' IS NULL OR v_elem->>'unit_id' = '') THEN

      SELECT u.id INTO v_unit_id
      FROM product_units u
      WHERE u.product_id = p_product_id
        AND u.status IN ('available', 'rented')
        AND NOT (u.id = ANY(v_used))
        AND NOT EXISTS (
          SELECT 1 FROM bookings b
          WHERE b.id <> p_booking_id
            AND b.status IN ('confirmed', 'preparing_shipment', 'awaiting_pickup', 'shipped', 'delivered', 'picked_up', 'active')
            AND b.rental_from <= p_rental_to
            AND b.rental_to   >= p_rental_from
            AND COALESCE(b.is_test, false) = v_is_test
            AND (
              b.unit_id = u.id
              OR EXISTS (
                SELECT 1
                FROM jsonb_array_elements(COALESCE(b.cameras, '[]'::jsonb)) be
                WHERE be->>'unit_id' = u.id::text
              )
            )
        )
      ORDER BY u.created_at NULLS LAST, u.id
      LIMIT 1;

      IF v_unit_id IS NOT NULL THEN
        v_elem := jsonb_set(v_elem, '{unit_id}', to_jsonb(v_unit_id::text));
        v_assigned := array_append(v_assigned, v_unit_id);
        v_used := array_append(v_used, v_unit_id);
      END IF;
    END IF;

    v_new := v_new || jsonb_build_array(v_elem);
  END LOOP;

  SELECT (e->>'unit_id')::uuid INTO v_first_unit
  FROM jsonb_array_elements(v_new) e
  WHERE e->>'unit_id' IS NOT NULL AND e->>'unit_id' <> ''
  LIMIT 1;

  UPDATE bookings
  SET cameras = v_new,
      unit_id = COALESCE(unit_id, v_first_unit)
  WHERE id = p_booking_id;

  RETURN v_assigned;
END;
$$;

GRANT EXECUTE ON FUNCTION assign_free_camera_units(text, date, date, text)
  TO authenticated, service_role;


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
  PERFORM pg_advisory_xact_lock(hashtext('unit_assign:' || p_product_id));

  SELECT COALESCE(is_test, false) INTO v_is_test
  FROM bookings WHERE id = p_booking_id;
  v_is_test := COALESCE(v_is_test, false);

  SELECT u.id INTO v_unit_id
  FROM product_units u
  WHERE u.product_id = p_product_id
    AND u.status IN ('available', 'rented')
    AND NOT EXISTS (
      SELECT 1 FROM bookings b
      WHERE b.status IN ('confirmed', 'preparing_shipment', 'awaiting_pickup', 'shipped', 'delivered', 'picked_up', 'active')
        AND b.id <> p_booking_id
        AND b.rental_from <= p_rental_to
        AND b.rental_to >= p_rental_from
        AND COALESCE(b.is_test, false) = v_is_test
        AND (
          b.unit_id = u.id
          OR EXISTS (
            SELECT 1
            FROM jsonb_array_elements(COALESCE(b.cameras, '[]'::jsonb)) be
            WHERE be->>'unit_id' = u.id::text
          )
        )
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

GRANT EXECUTE ON FUNCTION assign_free_unit(text, date, date, text)
  TO authenticated, service_role;
