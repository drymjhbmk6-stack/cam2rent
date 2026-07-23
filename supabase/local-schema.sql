--
-- PostgreSQL database dump
--

\restrict Wq5HgAx2KbqffFcbZsSZ0EM4ndze1F6gFj0dKBO6HFFKI1LujhgIhRgauFmS7tk

-- Dumped from database version 17.6
-- Dumped by pg_dump version 17.6

SET statement_timeout = 0;
SET lock_timeout = 0;
SET idle_in_transaction_session_timeout = 0;
SET transaction_timeout = 0;
SET client_encoding = 'UTF8';
SET standard_conforming_strings = on;
SELECT pg_catalog.set_config('search_path', '', false);
SET check_function_bodies = false;
SET xmloption = content;
SET client_min_messages = warning;
SET row_security = off;

--
-- Name: public; Type: SCHEMA; Schema: -; Owner: -
--

CREATE SCHEMA public;


--
-- Name: SCHEMA public; Type: COMMENT; Schema: -; Owner: -
--

COMMENT ON SCHEMA public IS 'standard public schema';


--
-- Name: anonymize_customer(uuid); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.anonymize_customer(customer_id uuid) RETURNS void
    LANGUAGE plpgsql SECURITY DEFINER
    AS $$
BEGIN
  UPDATE profiles SET
    full_name = 'Gelöschter Kunde',
    phone = NULL,
    address_street = NULL,
    address_zip = NULL,
    address_city = NULL,
    anonymized = TRUE,
    deleted_at = NOW(),
    updated_at = NOW()
  WHERE id = customer_id;
END;
$$;


--
-- Name: assign_free_accessory_units(text, integer, date, date, text); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.assign_free_accessory_units(p_accessory_id text, p_qty integer, p_rental_from date, p_rental_to date, p_booking_id text) RETURNS uuid[]
    LANGUAGE plpgsql SECURITY DEFINER
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


--
-- Name: assign_free_camera_units(text, date, date, text); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.assign_free_camera_units(p_product_id text, p_rental_from date, p_rental_to date, p_booking_id text) RETURNS uuid[]
    LANGUAGE plpgsql SECURITY DEFINER
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

  -- Bereits in DIESER Buchung belegte Units (Doppelnutzung vermeiden)
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
            AND b.status IN ('confirmed', 'shipped', 'delivered', 'picked_up', 'active')
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


--
-- Name: assign_free_unit(text, date, date, text); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.assign_free_unit(p_product_id text, p_rental_from date, p_rental_to date, p_booking_id text) RETURNS uuid
    LANGUAGE plpgsql SECURITY DEFINER
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
        AND b.status IN ('confirmed', 'shipped', 'delivered', 'picked_up', 'active')
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


--
-- Name: check_email_exists(text); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.check_email_exists(p_email text) RETURNS boolean
    LANGUAGE sql STABLE SECURITY DEFINER
    SET search_path TO 'public', 'auth'
    AS $$
  SELECT EXISTS (
    SELECT 1 FROM auth.users
    WHERE lower(email) = lower(p_email)
      AND email IS NOT NULL
  );
$$;


--
-- Name: FUNCTION check_email_exists(p_email text); Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON FUNCTION public.check_email_exists(p_email text) IS 'O(1)-Lookup ob eine E-Mail in auth.users existiert. Wird vom App-Server
   genutzt, um Express-Signup ohne komplette User-Liste zu prüfen.
   service_role-only.';


--
-- Name: cleanup_expired_data(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.cleanup_expired_data() RETURNS integer
    LANGUAGE plpgsql SECURITY DEFINER
    AS $$
DECLARE
  deleted_count INTEGER := 0;
  cutoff TIMESTAMPTZ := NOW() - INTERVAL '10 years';
BEGIN
  -- Feedback löschen (älteste zuerst)
  DELETE FROM feedback WHERE created_at < cutoff;
  GET DIAGNOSTICS deleted_count = ROW_COUNT;

  -- Reviews löschen
  DELETE FROM reviews WHERE created_at < cutoff;

  -- Messages löschen
  DELETE FROM messages WHERE created_at < cutoff;

  -- Conversations ohne Messages löschen
  DELETE FROM conversations WHERE created_at < cutoff
    AND id NOT IN (SELECT DISTINCT conversation_id FROM messages);

  -- Damage reports löschen
  DELETE FROM damage_reports WHERE created_at < cutoff;

  -- Buchungen löschen
  DELETE FROM bookings WHERE created_at < cutoff;

  -- Anonymisierte Profile mit abgelaufener Frist löschen
  DELETE FROM profiles WHERE created_at < cutoff AND anonymized = TRUE;

  RETURN deleted_count;
END;
$$;


--
-- Name: cleanup_old_admin_notifications(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.cleanup_old_admin_notifications() RETURNS void
    LANGUAGE plpgsql
    AS $$
BEGIN
  DELETE FROM admin_notifications
  WHERE created_at < NOW() - INTERVAL '90 days';
END;
$$;


--
-- Name: customer_ugc_set_updated_at(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.customer_ugc_set_updated_at() RETURNS trigger
    LANGUAGE plpgsql
    AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$;


--
-- Name: generate_referral_code(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.generate_referral_code() RETURNS trigger
    LANGUAGE plpgsql
    AS $$
BEGIN
  IF NEW.referral_code IS NULL THEN
    NEW.referral_code := 'REF-' || SUBSTR(MD5(RANDOM()::TEXT), 1, 8);
  END IF;
  RETURN NEW;
END;
$$;


--
-- Name: handle_new_user(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.handle_new_user() RETURNS trigger
    LANGUAGE plpgsql SECURITY DEFINER
    AS $$
BEGIN
  INSERT INTO profiles (id, full_name)
  VALUES (NEW.id, NEW.raw_user_meta_data->>'full_name')
  ON CONFLICT (id) DO NOTHING;
  RETURN NEW;
END;
$$;


--
-- Name: increment_blog_view(uuid, boolean); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.increment_blog_view(p_post_id uuid, p_is_bot boolean) RETURNS void
    LANGUAGE sql
    AS $$
  UPDATE blog_posts
  SET view_count     = COALESCE(view_count, 0) + 1,
      bot_view_count = COALESCE(bot_view_count, 0) + (CASE WHEN p_is_bot THEN 1 ELSE 0 END)
  WHERE id = p_post_id;
$$;


--
-- Name: increment_coupon_if_available(text); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.increment_coupon_if_available(p_code text) RETURNS TABLE(coupon_id uuid, applied boolean, used_count integer, max_uses integer)
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
DECLARE
  v_id UUID;
  v_max INT;
  v_used INT;
  v_active BOOLEAN;
  v_valid_from TIMESTAMPTZ;
  v_valid_until TIMESTAMPTZ;
BEGIN
  -- Zeile mit Lock holen (FOR UPDATE serialisiert parallele Aufrufe).
  SELECT id, c.max_uses, c.used_count, c.active, c.valid_from, c.valid_until
    INTO v_id, v_max, v_used, v_active, v_valid_from, v_valid_until
    FROM coupons c
   WHERE LOWER(c.code) = LOWER(p_code)
   FOR UPDATE;

  IF v_id IS NULL THEN
    -- Kein Coupon mit diesem Code.
    RETURN;
  END IF;

  -- Grund-Plausibilität (inaktiv / abgelaufen / noch nicht gültig)
  IF NOT COALESCE(v_active, TRUE) THEN
    coupon_id := v_id; applied := FALSE; used_count := v_used; max_uses := v_max;
    RETURN NEXT; RETURN;
  END IF;
  IF v_valid_from IS NOT NULL AND v_valid_from > NOW() THEN
    coupon_id := v_id; applied := FALSE; used_count := v_used; max_uses := v_max;
    RETURN NEXT; RETURN;
  END IF;
  IF v_valid_until IS NOT NULL AND v_valid_until < NOW() THEN
    coupon_id := v_id; applied := FALSE; used_count := v_used; max_uses := v_max;
    RETURN NEXT; RETURN;
  END IF;

  -- max_uses-Check unter Lock
  IF v_max IS NOT NULL AND v_used >= v_max THEN
    coupon_id := v_id; applied := FALSE; used_count := v_used; max_uses := v_max;
    RETURN NEXT; RETURN;
  END IF;

  -- Alles OK → inkrementieren
  UPDATE coupons SET used_count = used_count + 1 WHERE id = v_id;

  coupon_id := v_id;
  applied := TRUE;
  used_count := v_used + 1;
  max_uses := v_max;
  RETURN NEXT;
END;
$$;


--
-- Name: increment_site_visit(date); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.increment_site_visit(p_day date) RETURNS void
    LANGUAGE sql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
  INSERT INTO site_visits (day, visits)
  VALUES (p_day, 1)
  ON CONFLICT (day) DO UPDATE SET visits = site_visits.visits + 1;
$$;


--
-- Name: increment_site_visit_hourly(date, smallint); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.increment_site_visit_hourly(p_day date, p_hour smallint) RETURNS void
    LANGUAGE sql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
  INSERT INTO site_visits_hourly (day, hour, visits)
  VALUES (p_day, p_hour, 1)
  ON CONFLICT (day, hour) DO UPDATE SET visits = site_visits_hourly.visits + 1;
$$;


--
-- Name: naechste_beleg_nummer(integer); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.naechste_beleg_nummer(p_jahr integer) RETURNS text
    LANGUAGE plpgsql
    AS $$
DECLARE
  v_neue_nummer INT;
BEGIN
  INSERT INTO beleg_nummer_counter (jahr, letzte_nummer)
  VALUES (p_jahr, 1)
  ON CONFLICT (jahr) DO UPDATE
    SET letzte_nummer = beleg_nummer_counter.letzte_nummer + 1,
        updated_at = NOW()
  RETURNING letzte_nummer INTO v_neue_nummer;

  RETURN 'EK-' || p_jahr || '-' || LPAD(v_neue_nummer::TEXT, 6, '0');
END;
$$;


--
-- Name: newsletter_subscribers_set_updated_at(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.newsletter_subscribers_set_updated_at() RETURNS trigger
    LANGUAGE plpgsql
    AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$;


--
-- Name: next_booking_counter(text, boolean); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.next_booking_counter(p_year_week text, p_is_test boolean DEFAULT false) RETURNS integer
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
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


--
-- Name: next_content_coupon_counter(boolean); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.next_content_coupon_counter(p_is_test boolean DEFAULT false) RETURNS integer
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
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


--
-- Name: next_credit_note_number(integer); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.next_credit_note_number(p_year integer DEFAULT (EXTRACT(year FROM now()))::integer) RETURNS text
    LANGUAGE plpgsql
    AS $$
DECLARE
  seq_name TEXT;
  next_val BIGINT;
BEGIN
  seq_name := 'credit_note_seq_' || p_year;

  -- Sequenz erstellen falls noch nicht vorhanden
  BEGIN
    EXECUTE format('CREATE SEQUENCE IF NOT EXISTS %I START 1', seq_name);
  EXCEPTION WHEN duplicate_table THEN
    -- Sequenz existiert bereits
    NULL;
  END;

  EXECUTE format('SELECT nextval(%L)', seq_name) INTO next_val;
  RETURN 'GS-' || p_year || '-' || LPAD(next_val::TEXT, 6, '0');
END;
$$;


--
-- Name: next_invoice_number(integer); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.next_invoice_number(p_year integer) RETURNS integer
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
DECLARE
  v_next INT;
BEGIN
  INSERT INTO invoice_counter (year, last_number) VALUES (p_year, 1)
    ON CONFLICT (year)
    DO UPDATE SET last_number = invoice_counter.last_number + 1,
                  updated_at = now()
    RETURNING last_number INTO v_next;
  RETURN v_next;
END;
$$;


--
-- Name: prevent_audit_log_mutation(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.prevent_audit_log_mutation() RETURNS trigger
    LANGUAGE plpgsql
    AS $$
BEGIN
  RAISE EXCEPTION 'Audit-Log-Einträge dürfen nicht geändert oder gelöscht werden.';
  RETURN NULL;
END;
$$;


--
-- Name: publish_legal_version(uuid, text, text, text, uuid); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.publish_legal_version(p_document_id uuid, p_content text, p_format text DEFAULT 'markdown'::text, p_change_note text DEFAULT NULL::text, p_user_id uuid DEFAULT NULL::uuid) RETURNS uuid
    LANGUAGE plpgsql SECURITY DEFINER
    AS $$
DECLARE
  v_next_version INT;
  v_new_id UUID;
BEGIN
  -- Nächste Versionsnummer berechnen
  SELECT COALESCE(MAX(version_number), 0) + 1
    INTO v_next_version
    FROM legal_document_versions
    WHERE document_id = p_document_id;

  -- Bisherige aktuelle Version deaktivieren
  UPDATE legal_document_versions
    SET is_current = false
    WHERE document_id = p_document_id AND is_current = true;

  -- Neue Version einfügen
  INSERT INTO legal_document_versions (
    document_id, version_number, content, content_format,
    change_note, published_by, is_current, published_at
  )
  VALUES (
    p_document_id, v_next_version, p_content, p_format,
    p_change_note, p_user_id, true, now()
  )
  RETURNING id INTO v_new_id;

  -- current_version_id aktualisieren
  UPDATE legal_documents
    SET current_version_id = v_new_id,
        updated_at = now()
    WHERE id = p_document_id;

  RETURN v_new_id;
END;
$$;


--
-- Name: retention_until(timestamp with time zone); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.retention_until(created timestamp with time zone) RETURNS timestamp with time zone
    LANGUAGE plpgsql IMMUTABLE
    AS $$
BEGIN
  RETURN created + INTERVAL '10 years';
END;
$$;


--
-- Name: set_updated_at(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.set_updated_at() RETURNS trigger
    LANGUAGE plpgsql
    AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;


--
-- Name: set_updated_at_reels(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.set_updated_at_reels() RETURNS trigger
    LANGUAGE plpgsql
    AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;


--
-- Name: social_reel_segments_set_updated_at(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.social_reel_segments_set_updated_at() RETURNS trigger
    LANGUAGE plpgsql
    AS $$
BEGIN
  NEW.updated_at := now();
  RETURN NEW;
END;
$$;


--
-- Name: touch_admin_users_updated_at(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.touch_admin_users_updated_at() RETURNS trigger
    LANGUAGE plpgsql
    AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$;


--
-- Name: touch_employee_personal_updated_at(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.touch_employee_personal_updated_at() RETURNS trigger
    LANGUAGE plpgsql
    AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$;


--
-- Name: update_admin_config_timestamp(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.update_admin_config_timestamp() RETURNS trigger
    LANGUAGE plpgsql
    AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$;


--
-- Name: update_shop_page_content_timestamp(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.update_shop_page_content_timestamp() RETURNS trigger
    LANGUAGE plpgsql
    AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$;


SET default_tablespace = '';

SET default_table_access_method = heap;

--
-- Name: abandoned_carts; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.abandoned_carts (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    user_id uuid NOT NULL,
    email text NOT NULL,
    items jsonb DEFAULT '[]'::jsonb NOT NULL,
    cart_total numeric DEFAULT 0,
    created_at timestamp with time zone DEFAULT now(),
    updated_at timestamp with time zone DEFAULT now(),
    reminder_sent_at timestamp with time zone,
    recovered boolean DEFAULT false
);


--
-- Name: accessories; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.accessories (
    id text NOT NULL,
    name text NOT NULL,
    category text DEFAULT 'sonstiges'::text NOT NULL,
    description text,
    pricing_mode text DEFAULT 'perDay'::text NOT NULL,
    price numeric(10,2) DEFAULT 0 NOT NULL,
    available_qty integer DEFAULT 1 NOT NULL,
    available boolean DEFAULT true NOT NULL,
    image_url text,
    sort_order integer DEFAULT 0 NOT NULL,
    created_at timestamp with time zone DEFAULT now(),
    internal boolean DEFAULT false,
    upgrade_group text,
    is_upgrade_base boolean DEFAULT false,
    included_parts_images text[] DEFAULT '{}'::text[],
    included_parts text[] DEFAULT '{}'::text[] NOT NULL,
    is_bulk boolean DEFAULT false NOT NULL,
    allow_multi_qty boolean DEFAULT false NOT NULL,
    max_qty_per_booking integer,
    replacement_value numeric(10,2) DEFAULT 0 NOT NULL,
    specs jsonb DEFAULT '{}'::jsonb NOT NULL,
    migrated_to_units boolean DEFAULT false NOT NULL,
    compatible_product_ids text[] DEFAULT '{}'::text[],
    CONSTRAINT accessories_pricing_mode_check CHECK ((pricing_mode = ANY (ARRAY['perDay'::text, 'flat'::text])))
);


--
-- Name: COLUMN accessories.included_parts; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.accessories.included_parts IS 'Bestandteile dieses Zubehoers (z.B. "2x Sender", "1x Windschutz"). Reine Anzeige fuer Pack-Workflow + Packliste, kein eigenes Inventar.';


--
-- Name: COLUMN accessories.is_bulk; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.accessories.is_bulk IS 'Sammel-Zubehoer (Verbrauchsmaterial). Wenn TRUE: kein Exemplar-Tracking, ein Sammel-QR, manuelle Mengen + Auto-Decrement bei Buchung.';


--
-- Name: COLUMN accessories.allow_multi_qty; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.accessories.allow_multi_qty IS 'Wenn true: Kunde kann im Buchungsflow per Stepper >1 Stueck buchen.';


--
-- Name: COLUMN accessories.max_qty_per_booking; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.accessories.max_qty_per_booking IS 'Optional: Obergrenze pro Buchung. NULL = nur Lagerbestand zaehlt.';


--
-- Name: COLUMN accessories.replacement_value; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.accessories.replacement_value IS 'Wiederbeschaffungswert (Neupreis) in EUR — Obergrenze der Ersatzpflicht bei Totalschaden/Verlust. Wird im Mietvertrag-PDF als Zeitwert pro Zubehoer und in der Set-Summe verwendet.';


--
-- Name: COLUMN accessories.specs; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.accessories.specs IS 'Kategorie-spezifische Spezifikationen. Felder: weight_g (alle), mah (Akku), storage_gb (Speicher), nd_values text[] (Filter), length_min_cm + length_max_cm (Stative/Selfie-Sticks).';


--
-- Name: COLUMN accessories.compatible_product_ids; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.accessories.compatible_product_ids IS 'Leeres Array = universal (passt zu allen Kameras). Gefüllt = nur für diese Produkt-IDs.';


--
-- Name: accessory_units; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.accessory_units (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    accessory_id text NOT NULL,
    exemplar_code text NOT NULL,
    status text DEFAULT 'available'::text NOT NULL,
    notes text,
    purchased_at date,
    retired_at date,
    retirement_reason text,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    serial_number text,
    CONSTRAINT accessory_units_status_check CHECK ((status = ANY (ARRAY['available'::text, 'rented'::text, 'maintenance'::text, 'damaged'::text, 'lost'::text, 'retired'::text])))
);


--
-- Name: accessories_with_stats; Type: VIEW; Schema: public; Owner: -
--

CREATE VIEW public.accessories_with_stats AS
 SELECT a.id,
    a.name,
    a.category,
    a.description,
    a.pricing_mode,
    a.price,
    a.available_qty,
    a.available,
    a.image_url,
    a.sort_order,
    a.created_at,
    a.internal,
    a.upgrade_group,
    a.is_upgrade_base,
    a.included_parts_images,
    a.included_parts,
    a.is_bulk,
    a.allow_multi_qty,
    a.max_qty_per_booking,
    a.replacement_value,
    a.specs,
    a.migrated_to_units,
    COALESCE(u.available_count, (0)::bigint) AS units_available_count,
    COALESCE(u.rented_count, (0)::bigint) AS units_rented_count,
    COALESCE(u.maintenance_count, (0)::bigint) AS units_maintenance_count,
    COALESCE(u.damaged_count, (0)::bigint) AS units_damaged_count,
    COALESCE(u.lost_count, (0)::bigint) AS units_lost_count,
    COALESCE(u.retired_count, (0)::bigint) AS units_retired_count,
    COALESCE(u.total_count, (0)::bigint) AS units_total_count,
    u.oldest_purchase_date,
    u.newest_purchase_date
   FROM (public.accessories a
     LEFT JOIN ( SELECT accessory_units.accessory_id,
            count(*) FILTER (WHERE (accessory_units.status = 'available'::text)) AS available_count,
            count(*) FILTER (WHERE (accessory_units.status = 'rented'::text)) AS rented_count,
            count(*) FILTER (WHERE (accessory_units.status = 'maintenance'::text)) AS maintenance_count,
            count(*) FILTER (WHERE (accessory_units.status = 'damaged'::text)) AS damaged_count,
            count(*) FILTER (WHERE (accessory_units.status = 'lost'::text)) AS lost_count,
            count(*) FILTER (WHERE (accessory_units.status = 'retired'::text)) AS retired_count,
            count(*) AS total_count,
            min(accessory_units.purchased_at) AS oldest_purchase_date,
            max(accessory_units.purchased_at) AS newest_purchase_date
           FROM public.accessory_units
          GROUP BY accessory_units.accessory_id) u ON ((u.accessory_id = a.id)));


--
-- Name: admin_audit_log; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.admin_audit_log (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    admin_user_id uuid,
    admin_user_name text,
    action text NOT NULL,
    entity_type text NOT NULL,
    entity_id text,
    entity_label text,
    details jsonb,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    is_test boolean DEFAULT false NOT NULL
);


--
-- Name: admin_config; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.admin_config (
    key text NOT NULL,
    value jsonb NOT NULL,
    updated_at timestamp with time zone DEFAULT now()
);


--
-- Name: admin_customer_notes; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.admin_customer_notes (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    customer_id uuid NOT NULL,
    content text NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: admin_notifications; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.admin_notifications (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    type text NOT NULL,
    title text NOT NULL,
    message text,
    link text,
    is_read boolean DEFAULT false NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: admin_sessions; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.admin_sessions (
    token text NOT NULL,
    user_id uuid NOT NULL,
    expires_at timestamp with time zone NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    last_used_at timestamp with time zone DEFAULT now() NOT NULL,
    user_agent text,
    ip_address text
);


--
-- Name: admin_settings; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.admin_settings (
    key text NOT NULL,
    value text NOT NULL,
    updated_at timestamp with time zone DEFAULT now()
);


--
-- Name: admin_users; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.admin_users (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    email text NOT NULL,
    password_hash text NOT NULL,
    name text NOT NULL,
    role text DEFAULT 'employee'::text NOT NULL,
    permissions jsonb DEFAULT '[]'::jsonb NOT NULL,
    is_active boolean DEFAULT true NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    last_login_at timestamp with time zone,
    created_by uuid,
    username text,
    inbox_address text,
    CONSTRAINT admin_users_role_check CHECK ((role = ANY (ARRAY['owner'::text, 'employee'::text])))
);


--
-- Name: afa_buchungen; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.afa_buchungen (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    asset_id uuid NOT NULL,
    buchungsdatum date NOT NULL,
    afa_betrag numeric(10,2) NOT NULL,
    buchwert_nach numeric(12,2) NOT NULL,
    typ text DEFAULT 'monatlich'::text NOT NULL,
    notizen text,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT afa_buchungen_typ_check CHECK ((typ = ANY (ARRAY['monatlich'::text, 'jaehrlich'::text, 'sonderafa'::text, 'sofort'::text])))
);


--
-- Name: angebote; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.angebote (
    id text NOT NULL,
    name text NOT NULL,
    description text,
    valid_from timestamp with time zone,
    valid_until timestamp with time zone,
    pricing_mode text DEFAULT 'flat'::text NOT NULL,
    fixed_days integer,
    camera_options jsonb DEFAULT '[]'::jsonb NOT NULL,
    image_url text,
    badge text,
    badge_color text,
    sort_order integer DEFAULT 0 NOT NULL,
    active boolean DEFAULT true NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    published_from timestamp with time zone,
    CONSTRAINT angebote_pricing_mode_check CHECK ((pricing_mode = ANY (ARRAY['flat'::text, 'perDay'::text])))
);


--
-- Name: assets; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.assets (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    kind text NOT NULL,
    name text NOT NULL,
    description text,
    serial_number text,
    manufacturer text,
    model text,
    purchase_price numeric(10,2) NOT NULL,
    purchase_date date NOT NULL,
    supplier_id uuid,
    purchase_id uuid,
    useful_life_months integer DEFAULT 36 NOT NULL,
    depreciation_method text DEFAULT 'linear'::text NOT NULL,
    residual_value numeric(10,2) DEFAULT 0,
    current_value numeric(10,2) NOT NULL,
    last_depreciation_at date,
    product_id text,
    unit_id uuid,
    status text DEFAULT 'active'::text NOT NULL,
    disposed_at date,
    disposal_proceeds numeric(10,2),
    is_test boolean DEFAULT false NOT NULL,
    notes text,
    created_at timestamp with time zone DEFAULT now(),
    updated_at timestamp with time zone DEFAULT now(),
    account_code text,
    accessory_unit_id uuid,
    replacement_value_estimate numeric,
    CONSTRAINT assets_depreciation_method_check CHECK ((depreciation_method = ANY (ARRAY['linear'::text, 'none'::text, 'immediate'::text]))),
    CONSTRAINT assets_kind_check CHECK ((kind = ANY (ARRAY['rental_camera'::text, 'rental_accessory'::text, 'office_equipment'::text, 'tool'::text, 'other'::text]))),
    CONSTRAINT assets_status_check CHECK ((status = ANY (ARRAY['active'::text, 'disposed'::text, 'sold'::text, 'lost'::text])))
);


--
-- Name: COLUMN assets.accessory_unit_id; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.assets.accessory_unit_id IS 'FK auf accessory_units(id) wenn kind=rental_accessory. Parallel zu unit_id (für product_units/Kameras). Mietvertrag zieht bei Schaden den current_value als WBW.';


--
-- Name: COLUMN assets.replacement_value_estimate; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.assets.replacement_value_estimate IS 'Tatsaechlicher Wiederbeschaffungswert in EUR (unabhaengig vom steuerlichen Buchwert). NULL = current_value als Default verwenden. Bei GWG-Sofortabschreibung typisch = purchase_price.';


--
-- Name: assets_neu; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.assets_neu (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    beleg_position_id uuid NOT NULL,
    bezeichnung text NOT NULL,
    art text DEFAULT 'sonstiges'::text NOT NULL,
    anschaffungsdatum date NOT NULL,
    anschaffungskosten_netto numeric(12,2) NOT NULL,
    afa_methode text NOT NULL,
    nutzungsdauer_monate integer,
    aktueller_buchwert numeric(12,2) NOT NULL,
    restwert numeric(12,2) DEFAULT 0 NOT NULL,
    status text DEFAULT 'aktiv'::text NOT NULL,
    notizen text,
    is_test boolean DEFAULT false NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT assets_neu_afa_methode_check CHECK ((afa_methode = ANY (ARRAY['linear'::text, 'sofort_gwg'::text, 'keine'::text]))),
    CONSTRAINT assets_neu_art_check CHECK ((art = ANY (ARRAY['kamera'::text, 'zubehoer'::text, 'buero'::text, 'werkzeug'::text, 'sonstiges'::text]))),
    CONSTRAINT assets_neu_status_check CHECK ((status = ANY (ARRAY['aktiv'::text, 'verkauft'::text, 'ausgemustert'::text, 'verloren'::text])))
);


--
-- Name: availability_alerts; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.availability_alerts (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    alert_type text NOT NULL,
    product_id text,
    product_name text,
    set_id text,
    set_name text,
    accessory_id text,
    accessory_name text,
    rental_from date,
    rental_to date,
    customer_user_id uuid,
    customer_email text,
    occurrence_count integer DEFAULT 1 NOT NULL,
    first_seen_at timestamp with time zone DEFAULT now() NOT NULL,
    last_seen_at timestamp with time zone DEFAULT now() NOT NULL,
    resolved_at timestamp with time zone,
    resolved_by uuid,
    resolved_note text,
    is_test boolean DEFAULT false NOT NULL,
    details jsonb,
    CONSTRAINT availability_alerts_alert_type_check CHECK ((alert_type = ANY (ARRAY['no_basic_set'::text, 'basic_set_unavailable'::text, 'set_unavailable'::text, 'accessory_unavailable'::text])))
);


--
-- Name: beleg_anhaenge; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.beleg_anhaenge (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    beleg_id uuid NOT NULL,
    storage_path text NOT NULL,
    dateiname text NOT NULL,
    typ text DEFAULT 'rechnung'::text NOT NULL,
    size_bytes bigint,
    mime_type text,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    file_hash text,
    CONSTRAINT beleg_anhaenge_typ_check CHECK ((typ = ANY (ARRAY['rechnung'::text, 'quittung'::text, 'lieferschein'::text, 'sonstiges'::text])))
);


--
-- Name: beleg_nummer_counter; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.beleg_nummer_counter (
    jahr integer NOT NULL,
    letzte_nummer integer DEFAULT 0 NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: beleg_positionen; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.beleg_positionen (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    beleg_id uuid NOT NULL,
    reihenfolge integer DEFAULT 0 NOT NULL,
    bezeichnung text NOT NULL,
    menge integer DEFAULT 1 NOT NULL,
    einzelpreis_netto numeric(12,2) NOT NULL,
    mwst_satz numeric(4,2) DEFAULT 19.00 NOT NULL,
    gesamt_netto numeric(12,2) GENERATED ALWAYS AS (((menge)::numeric * einzelpreis_netto)) STORED,
    gesamt_brutto numeric(12,2) GENERATED ALWAYS AS ((((menge)::numeric * einzelpreis_netto) * ((1)::numeric + (mwst_satz / (100)::numeric)))) STORED,
    klassifizierung text DEFAULT 'pending'::text NOT NULL,
    kategorie text,
    folgekosten_asset_id uuid,
    ki_vorschlag jsonb,
    locked boolean DEFAULT false NOT NULL,
    notizen text,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT beleg_positionen_klassifizierung_check CHECK ((klassifizierung = ANY (ARRAY['pending'::text, 'afa'::text, 'gwg'::text, 'ausgabe'::text, 'verbrauch'::text, 'ignoriert'::text]))),
    CONSTRAINT beleg_positionen_menge_check CHECK ((menge > 0))
);


--
-- Name: belege; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.belege (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    beleg_nr text NOT NULL,
    interne_beleg_no text,
    lieferant_id uuid,
    beleg_datum date NOT NULL,
    bezahl_datum date,
    rechnungsnummer_lieferant text,
    summe_netto numeric(12,2) DEFAULT 0 NOT NULL,
    summe_brutto numeric(12,2) DEFAULT 0 NOT NULL,
    status text DEFAULT 'offen'::text NOT NULL,
    quelle text NOT NULL,
    ist_eigenbeleg boolean DEFAULT false NOT NULL,
    eigenbeleg_grund text,
    notizen text,
    is_test boolean DEFAULT false NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    festgeschrieben_at timestamp with time zone,
    verdacht_duplikat_beleg_id uuid,
    verdacht_duplikat_grund text,
    verdacht_duplikat_dismissed_at timestamp with time zone,
    ocr_status text DEFAULT 'done'::text NOT NULL,
    ocr_error text,
    ocr_started_at timestamp with time zone,
    ocr_finished_at timestamp with time zone,
    CONSTRAINT belege_eigenbeleg_grund_check CHECK (((ist_eigenbeleg = false) OR ((ist_eigenbeleg = true) AND (eigenbeleg_grund IS NOT NULL)))),
    CONSTRAINT belege_ocr_status_check CHECK ((ocr_status = ANY (ARRAY['pending'::text, 'running'::text, 'done'::text, 'failed'::text]))),
    CONSTRAINT belege_quelle_check CHECK ((quelle = ANY (ARRAY['upload'::text, 'manuell'::text, 'stripe_sync'::text, 'migration'::text]))),
    CONSTRAINT belege_status_check CHECK ((status = ANY (ARRAY['offen'::text, 'teilweise'::text, 'klassifiziert'::text, 'festgeschrieben'::text])))
);


--
-- Name: beta_feedback; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.beta_feedback (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    tester_name text,
    tester_email text,
    wants_gutschein boolean DEFAULT false,
    answers jsonb DEFAULT '{}'::jsonb,
    user_agent text,
    created_at timestamp with time zone DEFAULT now()
);


--
-- Name: blog_auto_topics; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.blog_auto_topics (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    topic text NOT NULL,
    keywords text[],
    category_id uuid,
    tone text DEFAULT 'informativ'::text,
    target_length text DEFAULT 'mittel'::text,
    used boolean DEFAULT false,
    used_at timestamp with time zone,
    created_at timestamp with time zone DEFAULT now()
);


--
-- Name: blog_categories; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.blog_categories (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    name text NOT NULL,
    slug text NOT NULL,
    description text,
    color text DEFAULT '#06b6d4'::text,
    sort_order integer DEFAULT 0,
    created_at timestamp with time zone DEFAULT now()
);


--
-- Name: blog_comments; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.blog_comments (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    post_id uuid NOT NULL,
    author_name text NOT NULL,
    author_email text NOT NULL,
    content text NOT NULL,
    status text DEFAULT 'pending'::text NOT NULL,
    created_at timestamp with time zone DEFAULT now(),
    CONSTRAINT blog_comments_status_check CHECK ((status = ANY (ARRAY['pending'::text, 'approved'::text, 'rejected'::text])))
);


--
-- Name: blog_posts; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.blog_posts (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    title text NOT NULL,
    slug text NOT NULL,
    content text DEFAULT ''::text NOT NULL,
    excerpt text DEFAULT ''::text,
    featured_image text,
    featured_image_alt text DEFAULT ''::text,
    category_id uuid,
    tags text[] DEFAULT '{}'::text[],
    status text DEFAULT 'draft'::text NOT NULL,
    seo_title text,
    seo_description text,
    author text DEFAULT 'cam2rent'::text,
    ai_generated boolean DEFAULT false,
    ai_prompt text,
    ai_model text,
    view_count integer DEFAULT 0,
    reading_time_min integer DEFAULT 5,
    published_at timestamp with time zone,
    scheduled_at timestamp with time zone,
    created_at timestamp with time zone DEFAULT now(),
    updated_at timestamp with time zone DEFAULT now(),
    bot_view_count integer DEFAULT 0 NOT NULL,
    schedule_id uuid,
    series_id uuid,
    series_part integer,
    CONSTRAINT blog_posts_status_check CHECK ((status = ANY (ARRAY['draft'::text, 'published'::text, 'scheduled'::text])))
);


--
-- Name: blog_schedule; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.blog_schedule (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    post_id uuid,
    topic text NOT NULL,
    keywords text[],
    category_id uuid,
    tone text DEFAULT 'informativ'::text,
    target_length text DEFAULT 'mittel'::text,
    scheduled_date date NOT NULL,
    scheduled_time time without time zone DEFAULT '09:00:00'::time without time zone,
    sort_order integer DEFAULT 0,
    status text DEFAULT 'planned'::text NOT NULL,
    reviewed boolean DEFAULT false,
    reviewed_at timestamp with time zone,
    generated_at timestamp with time zone,
    created_at timestamp with time zone DEFAULT now(),
    CONSTRAINT blog_schedule_status_check CHECK ((status = ANY (ARRAY['planned'::text, 'generating'::text, 'generated'::text, 'reviewed'::text, 'published'::text, 'skipped'::text])))
);


--
-- Name: blog_series; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.blog_series (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    title text NOT NULL,
    slug text NOT NULL,
    description text DEFAULT ''::text,
    category_id uuid,
    tone text DEFAULT 'informativ'::text,
    target_length text DEFAULT 'mittel'::text,
    total_parts integer DEFAULT 3 NOT NULL,
    generated_parts integer DEFAULT 0,
    status text DEFAULT 'active'::text NOT NULL,
    created_at timestamp with time zone DEFAULT now(),
    CONSTRAINT blog_series_status_check CHECK ((status = ANY (ARRAY['active'::text, 'paused'::text, 'completed'::text])))
);


--
-- Name: blog_series_parts; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.blog_series_parts (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    series_id uuid NOT NULL,
    part_number integer NOT NULL,
    topic text NOT NULL,
    keywords text[],
    post_id uuid,
    used boolean DEFAULT false,
    used_at timestamp with time zone,
    created_at timestamp with time zone DEFAULT now()
);


--
-- Name: blog_views; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.blog_views (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    post_id uuid,
    slug text,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    is_bot boolean DEFAULT false NOT NULL
);


--
-- Name: booking_id_counter; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.booking_id_counter (
    year_week text NOT NULL,
    is_test boolean DEFAULT false NOT NULL,
    counter integer DEFAULT 0 NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: booking_interest; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.booking_interest (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    product_id text,
    product_name text,
    set_id text,
    set_name text,
    accessories jsonb DEFAULT '[]'::jsonb NOT NULL,
    rental_from date,
    rental_to date,
    rental_days integer,
    delivery_mode text,
    haftung text,
    is_test boolean DEFAULT false NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: bookings; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.bookings (
    id text NOT NULL,
    payment_intent_id text NOT NULL,
    product_id text NOT NULL,
    product_name text NOT NULL,
    rental_from date NOT NULL,
    rental_to date NOT NULL,
    days integer NOT NULL,
    delivery_mode text NOT NULL,
    shipping_method text,
    shipping_price numeric(10,2) DEFAULT 0,
    haftung text NOT NULL,
    accessories text[] DEFAULT '{}'::text[],
    price_rental numeric(10,2) DEFAULT 0,
    price_accessories numeric(10,2) DEFAULT 0,
    price_haftung numeric(10,2) DEFAULT 0,
    price_total numeric(10,2) NOT NULL,
    deposit numeric(10,2) DEFAULT 0,
    status text DEFAULT 'confirmed'::text,
    created_at timestamp with time zone DEFAULT now(),
    user_id uuid,
    customer_email text,
    customer_name text,
    deposit_intent_id text,
    deposit_status text DEFAULT 'none'::text,
    suspicious boolean DEFAULT false,
    suspicious_reasons text[] DEFAULT '{}'::text[],
    coupon_code text,
    discount_amount numeric(10,2) DEFAULT 0,
    duration_discount numeric(10,2) DEFAULT 0,
    loyalty_discount numeric(10,2) DEFAULT 0,
    unit_id uuid,
    contract_signed boolean DEFAULT false,
    contract_signed_at timestamp with time zone,
    accessory_items jsonb,
    accessory_unit_ids uuid[] DEFAULT '{}'::uuid[] NOT NULL,
    offer_id text,
    deleted_at timestamp with time zone,
    stripe_payment_link_id text,
    notes text,
    cameras jsonb,
    adjustment_payment_link_id text,
    adjustment_amount numeric,
    adjustment_status text,
    adjustment_note text,
    invoice_name text,
    invoice_address text,
    liability_override jsonb,
    pack_weight_kg numeric,
    refund_amount numeric DEFAULT 0 NOT NULL,
    refund_note text,
    tracking_carrier text,
    return_tracking_number text,
    return_tracking_url text,
    return_tracking_carrier text,
    booking_type text DEFAULT 'miete'::text NOT NULL,
    sale_items jsonb,
    wbw_final jsonb,
    wbw_finalized boolean DEFAULT false NOT NULL,
    wbw_finalized_at timestamp with time zone,
    wbw_email_sent_at timestamp with time zone,
    is_test boolean DEFAULT false NOT NULL,
    return_notes text,
    returned_at timestamp with time zone,
    return_condition text DEFAULT 'gut'::text,
    shipping_address text,
    tracking_return text,
    handover_data jsonb,
    pack_status text,
    pack_packed_by text,
    pack_packed_by_user_id uuid,
    pack_packed_at timestamp with time zone,
    pack_packed_signature text,
    pack_packed_items jsonb,
    pack_packed_condition jsonb,
    pack_checked_by text,
    pack_checked_by_user_id uuid,
    pack_checked_at timestamp with time zone,
    pack_checked_signature text,
    pack_checked_items jsonb,
    pack_checked_notes text,
    pack_photo_url text,
    repair_until timestamp with time zone,
    sendcloud_parcel_id bigint,
    sendcloud_return_parcel_id bigint,
    label_url text,
    return_label_url text,
    original_rental_to date,
    extension_payment_intent_id text,
    extended_at timestamp with time zone,
    contract_signature_url text,
    contract_signer_name text,
    verification_required boolean DEFAULT false NOT NULL,
    verification_gate_passed_at timestamp with time zone,
    tracking_number text,
    tracking_url text,
    shipped_at timestamp with time zone,
    early_service_consent_at timestamp with time zone,
    early_service_consent_ip text,
    contract_locked boolean DEFAULT false NOT NULL,
    pickup_coordination_reminded_at timestamp with time zone,
    return_coordination_reminded_at timestamp with time zone,
    early_bird_discount numeric DEFAULT 0,
    return_arrived_at timestamp with time zone,
    ship_date_override date,
    return_due_date_override date,
    special_discount numeric DEFAULT 0,
    CONSTRAINT bookings_booking_type_check CHECK ((booking_type = ANY (ARRAY['miete'::text, 'kauf'::text]))),
    CONSTRAINT bookings_return_tracking_carrier_check CHECK (((return_tracking_carrier IS NULL) OR (return_tracking_carrier = ANY (ARRAY['DHL'::text, 'DPD'::text])))),
    CONSTRAINT bookings_tracking_carrier_check CHECK (((tracking_carrier IS NULL) OR (tracking_carrier = ANY (ARRAY['DHL'::text, 'DPD'::text]))))
);


--
-- Name: COLUMN bookings.accessory_items; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.bookings.accessory_items IS 'Zubehoer mit Stueckzahl: [{accessory_id: string, qty: int}]. Authoritative Quelle, accessories(text[]) bleibt als Legacy-View mit unique IDs erhalten.';


--
-- Name: COLUMN bookings.cameras; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.bookings.cameras IS 'Pro physischer Kamera ein Eintrag {product_id,product_name,unit_id|null}. NULL = Legacy (aus product_name/unit_id ableiten).';


--
-- Name: COLUMN bookings.adjustment_payment_link_id; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.bookings.adjustment_payment_link_id IS 'Stripe Payment Link ID der letzten Nachzahlung aus einer Buchungsbearbeitung.';


--
-- Name: COLUMN bookings.adjustment_amount; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.bookings.adjustment_amount IS 'Letzte Preisdifferenz aus Buchungsbearbeitung (positiv = Nachzahlung, negativ = Erstattung).';


--
-- Name: COLUMN bookings.adjustment_status; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.bookings.adjustment_status IS 'pending_payment | paid | refunded | refund_pending';


--
-- Name: COLUMN bookings.pack_weight_kg; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.bookings.pack_weight_kg IS 'Beim Packen erfasstes ungefaehres Paketgewicht in kg. Befuellt das Versandetikett vor. NULL = noch nicht erfasst.';


--
-- Name: COLUMN bookings.tracking_carrier; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.bookings.tracking_carrier IS 'Carrier des Hin-Versands (DHL/DPD). Wird beim Versand gesetzt; manuelle Korrektur via /admin/buchungen/[id] regeneriert tracking_url.';


--
-- Name: COLUMN bookings.return_tracking_number; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.bookings.return_tracking_number IS 'Trackingnummer des Rueck-Versands (Retoure).';


--
-- Name: COLUMN bookings.return_tracking_url; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.bookings.return_tracking_url IS 'Auto-generierte Verfolgungs-URL fuer return_tracking_number.';


--
-- Name: COLUMN bookings.return_tracking_carrier; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.bookings.return_tracking_carrier IS 'Carrier des Rueck-Versands (DHL/DPD).';


--
-- Name: COLUMN bookings.is_test; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.bookings.is_test IS 'Test-Modus-Marker. Bei TRUE: generiert im Test-Modus, zaehlt nicht zu Live-Umsaetzen/Counter.';


--
-- Name: COLUMN bookings.handover_data; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.bookings.handover_data IS 'Digitales Übergabeprotokoll als JSONB: { completedAt, location, condition: { tested, noDamage, otherNote }, items: [{name, ok}], photoPath, signatures: { landlord: {dataUrl, name, signedAt, ip}, renter: {...} } }';


--
-- Name: COLUMN bookings.pack_status; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.bookings.pack_status IS 'Versand-Packing-Workflow: NULL=offen, packed=Packer fertig, checked=Kontrolleur fertig (PDF-bereit).';


--
-- Name: COLUMN bookings.pack_packed_by_user_id; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.bookings.pack_packed_by_user_id IS '4-Augen-Tracking: admin_users.id des Packers. NULL nur bei Master-Passwort-Login (Notfall-Fallback auf Namensvergleich).';


--
-- Name: COLUMN bookings.pack_checked_by_user_id; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.bookings.pack_checked_by_user_id IS '4-Augen-Tracking: admin_users.id des Kontrolleurs. Server prueft id != pack_packed_by_user_id wenn beide gesetzt.';


--
-- Name: COLUMN bookings.pack_photo_url; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.bookings.pack_photo_url IS 'Pfad in Storage-Bucket packing-photos. Foto vom gepackten Paket als 4-Augen-Nachweis. Wird im Admin via Signed URL angezeigt.';


--
-- Name: COLUMN bookings.verification_required; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.bookings.verification_required IS 'TRUE wenn Ausweis-Check noch fehlt. Wird bei Express-Signup-Buchungen gesetzt.';


--
-- Name: COLUMN bookings.verification_gate_passed_at; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.bookings.verification_gate_passed_at IS 'Zeitpunkt an dem Admin den Versand freigegeben hat (Ausweis ok).';


--
-- Name: COLUMN bookings.early_service_consent_at; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.bookings.early_service_consent_at IS 'Zeitpunkt der Zustimmung gemäß § 356 Abs. 4 BGB zur vorzeitigen Leistungserbringung';


--
-- Name: COLUMN bookings.early_service_consent_ip; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.bookings.early_service_consent_ip IS 'IP-Adresse zum Zeitpunkt der Zustimmung (Beweiskraft)';


--
-- Name: COLUMN bookings.ship_date_override; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.bookings.ship_date_override IS 'Optionaler Override: Versand-/Uebergabe-Tag vor Mietbeginn. NULL = aus booking_buffer_days berechnen.';


--
-- Name: COLUMN bookings.return_due_date_override; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.bookings.return_due_date_override IS 'Optionaler Override: Rueckgabe-Soll-Datum nach Mietende. NULL = aus booking_buffer_days berechnen.';


--
-- Name: calendar_notes; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.calendar_notes (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    note_date date NOT NULL,
    text text NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: cart_holds; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.cart_holds (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    user_id uuid NOT NULL,
    cart_item_id text NOT NULL,
    product_id text NOT NULL,
    rental_from date NOT NULL,
    rental_to date NOT NULL,
    delivery_mode text DEFAULT 'versand'::text NOT NULL,
    product_name text,
    is_test boolean DEFAULT false NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    expires_at timestamp with time zone DEFAULT (now() + '00:30:00'::interval) NOT NULL
);


--
-- Name: client_errors; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.client_errors (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    digest text,
    message text,
    stack text,
    url text,
    user_agent text,
    user_id uuid,
    is_admin boolean DEFAULT false NOT NULL,
    ip_address text,
    context jsonb,
    is_test boolean DEFAULT false NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: content_coupon_counter; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.content_coupon_counter (
    is_test boolean DEFAULT false NOT NULL,
    counter integer DEFAULT 0 NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: conversations; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.conversations (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    customer_id uuid,
    subject text NOT NULL,
    booking_id text,
    last_message_at timestamp with time zone DEFAULT now() NOT NULL,
    closed boolean DEFAULT false NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    deleted_at timestamp with time zone,
    assigned_admin_user_id uuid,
    inbox_address text,
    customer_email text,
    customer_name text,
    source text DEFAULT 'account'::text NOT NULL,
    email_message_id text,
    CONSTRAINT conversations_source_check CHECK ((source = ANY (ARRAY['account'::text, 'email'::text])))
);


--
-- Name: coupons; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.coupons (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    code text NOT NULL,
    type text NOT NULL,
    value numeric(10,2) NOT NULL,
    description text DEFAULT ''::text NOT NULL,
    target_type text DEFAULT 'all'::text NOT NULL,
    target_id text,
    target_group_id text,
    target_name text,
    target_user_email text,
    valid_from timestamp with time zone,
    valid_until timestamp with time zone,
    max_uses integer,
    used_count integer DEFAULT 0 NOT NULL,
    min_order_value numeric(10,2),
    once_per_customer boolean DEFAULT false NOT NULL,
    not_combinable boolean DEFAULT false NOT NULL,
    active boolean DEFAULT true NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT coupons_target_type_check CHECK ((target_type = ANY (ARRAY['all'::text, 'accessory'::text, 'group'::text, 'user'::text]))),
    CONSTRAINT coupons_type_check CHECK ((type = ANY (ARRAY['percent'::text, 'fixed'::text])))
);


--
-- Name: credit_note_seq_2026; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.credit_note_seq_2026
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: credit_notes; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.credit_notes (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    credit_note_number text NOT NULL,
    invoice_id uuid NOT NULL,
    booking_id text NOT NULL,
    net_amount numeric(10,2) NOT NULL,
    tax_amount numeric(10,2) DEFAULT 0 NOT NULL,
    gross_amount numeric(10,2) NOT NULL,
    tax_mode text DEFAULT 'kleinunternehmer'::text NOT NULL,
    tax_rate numeric(5,2) DEFAULT 0,
    reason text NOT NULL,
    reason_category text,
    status text DEFAULT 'pending_review'::text,
    pdf_url text,
    stripe_refund_id text,
    refund_status text DEFAULT 'not_applicable'::text,
    notes text,
    created_by text,
    approved_by text,
    approved_at timestamp with time zone,
    sent_at timestamp with time zone,
    created_at timestamp with time zone DEFAULT now(),
    account_code text,
    internal_beleg_no text,
    is_test boolean DEFAULT false NOT NULL,
    CONSTRAINT credit_notes_reason_category_check CHECK ((reason_category = ANY (ARRAY['cancellation'::text, 'complaint'::text, 'goodwill'::text, 'correction'::text, 'other'::text]))),
    CONSTRAINT credit_notes_refund_status_check CHECK ((refund_status = ANY (ARRAY['pending'::text, 'succeeded'::text, 'failed'::text, 'not_applicable'::text]))),
    CONSTRAINT credit_notes_status_check CHECK ((status = ANY (ARRAY['pending_review'::text, 'approved'::text, 'sent'::text, 'rejected'::text]))),
    CONSTRAINT credit_notes_tax_mode_check CHECK ((tax_mode = ANY (ARRAY['kleinunternehmer'::text, 'regelbesteuerung'::text])))
);


--
-- Name: COLUMN credit_notes.is_test; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.credit_notes.is_test IS 'Test-Gutschrift (nicht in Reports/DATEV).';


--
-- Name: custom_sets; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.custom_sets (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    user_id uuid,
    camera_id text NOT NULL,
    accessory_ids text[] DEFAULT '{}'::text[],
    name text DEFAULT 'Eigenes Set'::text,
    created_at timestamp with time zone DEFAULT now()
);


--
-- Name: customer_login_history; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.customer_login_history (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    user_id uuid NOT NULL,
    email text,
    ip text,
    user_agent text,
    created_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: customer_push_subscriptions; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.customer_push_subscriptions (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    endpoint text NOT NULL,
    p256dh text NOT NULL,
    auth text NOT NULL,
    user_agent text,
    user_id uuid,
    email text,
    topics text[] DEFAULT ARRAY['all'::text] NOT NULL,
    is_test boolean DEFAULT false NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    last_used_at timestamp with time zone
);


--
-- Name: customer_ugc_submissions; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.customer_ugc_submissions (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    booking_id text NOT NULL,
    user_id uuid,
    customer_email text,
    customer_name text,
    file_paths text[] DEFAULT '{}'::text[] NOT NULL,
    file_kinds text[] DEFAULT '{}'::text[] NOT NULL,
    file_sizes bigint[] DEFAULT '{}'::bigint[] NOT NULL,
    caption text,
    consent_use_website boolean DEFAULT false NOT NULL,
    consent_use_social boolean DEFAULT false NOT NULL,
    consent_use_blog boolean DEFAULT false NOT NULL,
    consent_use_marketing boolean DEFAULT false NOT NULL,
    consent_name_visible boolean DEFAULT false NOT NULL,
    consent_text_version integer DEFAULT 1 NOT NULL,
    consent_at timestamp with time zone DEFAULT now() NOT NULL,
    consent_ip text,
    status text DEFAULT 'pending'::text NOT NULL,
    admin_note text,
    rejected_reason text,
    reviewed_at timestamp with time zone,
    reviewed_by uuid,
    reward_coupon_code text,
    bonus_coupon_code text,
    featured_at timestamp with time zone,
    featured_channel text,
    featured_reference text,
    withdrawn_at timestamp with time zone,
    withdrawn_reason text,
    is_test boolean DEFAULT false NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT customer_ugc_submissions_status_check CHECK ((status = ANY (ARRAY['pending'::text, 'approved'::text, 'featured'::text, 'rejected'::text, 'withdrawn'::text])))
);


--
-- Name: damage_reports; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.damage_reports (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    booking_id text NOT NULL,
    reported_by text DEFAULT 'customer'::text NOT NULL,
    description text NOT NULL,
    photos text[] DEFAULT '{}'::text[],
    damage_amount numeric(10,2),
    deposit_retained numeric(10,2),
    status text DEFAULT 'open'::text NOT NULL,
    admin_notes text,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    resolved_at timestamp with time zone,
    attachments jsonb DEFAULT '[]'::jsonb NOT NULL,
    customer_visible_paths jsonb DEFAULT '[]'::jsonb NOT NULL,
    resolution_note text,
    deleted_at timestamp with time zone,
    accessory_unit_id uuid,
    camera_unit_id uuid
);


--
-- Name: COLUMN damage_reports.accessory_unit_id; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.damage_reports.accessory_unit_id IS 'FK auf accessory_units(id) wenn die Schadensmeldung ein einzelnes Zubehoer-Exemplar betrifft. NULL = generischer Buchungs-Schaden (z.B. Kamera oder pauschal).';


--
-- Name: dunning_notices; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.dunning_notices (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    invoice_id uuid NOT NULL,
    level integer NOT NULL,
    fee_amount numeric(10,2) DEFAULT 0,
    pdf_url text,
    sent_at timestamp with time zone,
    sent_to_email text,
    status text DEFAULT 'draft'::text,
    notes text,
    created_by text,
    created_at timestamp with time zone DEFAULT now(),
    custom_text text,
    new_due_date date,
    CONSTRAINT dunning_notices_level_check CHECK (((level >= 1) AND (level <= 3))),
    CONSTRAINT dunning_notices_status_check CHECK ((status = ANY (ARRAY['draft'::text, 'sent'::text, 'paid'::text, 'escalated'::text])))
);


--
-- Name: email_log; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.email_log (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    booking_id text,
    customer_email text NOT NULL,
    email_type text NOT NULL,
    sent_at timestamp with time zone DEFAULT now() NOT NULL,
    status text DEFAULT 'sent'::text NOT NULL,
    resend_message_id text,
    is_test boolean DEFAULT false NOT NULL,
    subject text,
    error_message text,
    CONSTRAINT email_log_status_check CHECK ((status = ANY (ARRAY['sent'::text, 'failed'::text])))
);


--
-- Name: COLUMN email_log.is_test; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.email_log.is_test IS 'Im Test-Modus versendete Mail.';


--
-- Name: employee_appointments; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.employee_appointments (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    admin_user_id uuid NOT NULL,
    title text NOT NULL,
    description text,
    location text,
    starts_at timestamp with time zone NOT NULL,
    ends_at timestamp with time zone,
    all_day boolean DEFAULT false NOT NULL,
    color text,
    reminder_minutes_before integer,
    reminder_push boolean DEFAULT true NOT NULL,
    reminder_email boolean DEFAULT false NOT NULL,
    reminder_sent_at timestamp with time zone,
    shared_with uuid[] DEFAULT '{}'::uuid[] NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    series_id uuid
);


--
-- Name: employee_notes; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.employee_notes (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    admin_user_id uuid NOT NULL,
    title text DEFAULT ''::text NOT NULL,
    content text DEFAULT ''::text NOT NULL,
    pinned boolean DEFAULT false NOT NULL,
    color text,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    checklist jsonb DEFAULT '[]'::jsonb NOT NULL,
    pages jsonb DEFAULT '[]'::jsonb NOT NULL,
    shared_read uuid[] DEFAULT '{}'::uuid[] NOT NULL,
    shared_with uuid[] DEFAULT '{}'::uuid[] NOT NULL,
    attachments jsonb DEFAULT '[]'::jsonb NOT NULL
);


--
-- Name: expenses; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.expenses (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    expense_date date NOT NULL,
    category text NOT NULL,
    description text NOT NULL,
    vendor text,
    net_amount numeric(10,2) NOT NULL,
    tax_amount numeric(10,2) DEFAULT 0,
    gross_amount numeric(10,2) NOT NULL,
    receipt_url text,
    payment_method text,
    notes text,
    created_by text,
    created_at timestamp with time zone DEFAULT now(),
    asset_id uuid,
    account_code text,
    internal_beleg_no text,
    is_test boolean DEFAULT false NOT NULL,
    purchase_id uuid,
    source_type text,
    source_id text,
    deleted_at timestamp with time zone,
    CONSTRAINT expenses_category_check CHECK ((category = ANY (ARRAY['stripe_fees'::text, 'shipping'::text, 'software'::text, 'hardware'::text, 'marketing'::text, 'office'::text, 'travel'::text, 'insurance'::text, 'legal'::text, 'depreciation'::text, 'asset_purchase'::text, 'other'::text])))
);


--
-- Name: COLUMN expenses.is_test; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.expenses.is_test IS 'Test-Ausgabe (nicht in EUeR/USt-VA).';


--
-- Name: COLUMN expenses.purchase_id; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.expenses.purchase_id IS 'Optionale Verknuepfung zur Lieferantenrechnung (purchases) als Beleg-Nachweis. NULL = kein Einkauf zugeordnet.';


--
-- Name: export_log; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.export_log (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    export_type text NOT NULL,
    period_from date NOT NULL,
    period_to date NOT NULL,
    row_count integer DEFAULT 0 NOT NULL,
    total_amount numeric(10,2),
    exported_by text NOT NULL,
    exported_at timestamp with time zone DEFAULT now(),
    file_name text,
    CONSTRAINT export_log_export_type_check CHECK ((export_type = ANY (ARRAY['datev'::text, 'euer'::text, 'umsatzliste'::text, 'rechnungen_zip'::text, 'ustva'::text])))
);


--
-- Name: favorites; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.favorites (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    user_id uuid NOT NULL,
    product_id text NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: firmware_checks; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.firmware_checks (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    product_id text NOT NULL,
    brand text NOT NULL,
    model text NOT NULL,
    latest_version text,
    source_url text,
    release_date date,
    status text DEFAULT 'ok'::text NOT NULL,
    error_message text,
    last_checked_at timestamp with time zone DEFAULT now() NOT NULL,
    last_changed_at timestamp with time zone,
    seen_version text,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT firmware_checks_status_check CHECK ((status = ANY (ARRAY['ok'::text, 'error'::text, 'unsupported'::text])))
);


--
-- Name: inventar_code_segmente; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.inventar_code_segmente (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    typ text NOT NULL,
    code text NOT NULL,
    label text NOT NULL,
    sort_order integer DEFAULT 0 NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT inventar_code_segmente_code_format CHECK ((code ~ '^[A-Z0-9]{2,5}$'::text)),
    CONSTRAINT inventar_code_segmente_typ_check CHECK ((typ = ANY (ARRAY['kategorie'::text, 'hersteller'::text])))
);


--
-- Name: inventar_units; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.inventar_units (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    bezeichnung text NOT NULL,
    typ text NOT NULL,
    tracking_mode text NOT NULL,
    produkt_id uuid,
    seriennummer text,
    inventar_code text,
    bestand integer,
    kaufpreis_netto numeric(10,2),
    kaufdatum date,
    wiederbeschaffungswert numeric(10,2),
    wbw_manuell_gesetzt boolean DEFAULT false NOT NULL,
    status text DEFAULT 'verfuegbar'::text NOT NULL,
    qr_code_url text,
    beleg_status text DEFAULT 'verknuepft'::text NOT NULL,
    notizen text,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    installed_firmware text,
    CONSTRAINT inventar_units_beleg_status_check CHECK ((beleg_status = ANY (ARRAY['verknuepft'::text, 'beleg_fehlt'::text]))),
    CONSTRAINT inventar_units_status_check CHECK ((status = ANY (ARRAY['verfuegbar'::text, 'vermietet'::text, 'wartung'::text, 'defekt'::text, 'ausgemustert'::text]))),
    CONSTRAINT inventar_units_tracking_check CHECK ((((tracking_mode = 'individual'::text) AND (bestand IS NULL)) OR ((tracking_mode = 'bulk'::text) AND (bestand IS NOT NULL) AND (bestand >= 0)))),
    CONSTRAINT inventar_units_tracking_mode_check CHECK ((tracking_mode = ANY (ARRAY['individual'::text, 'bulk'::text]))),
    CONSTRAINT inventar_units_typ_check CHECK ((typ = ANY (ARRAY['kamera'::text, 'zubehoer'::text, 'verbrauch'::text])))
);


--
-- Name: inventar_verknuepfung; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.inventar_verknuepfung (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    beleg_position_id uuid NOT NULL,
    inventar_unit_id uuid NOT NULL,
    stueck_anteil integer DEFAULT 1 NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT inventar_verknuepfung_stueck_anteil_check CHECK ((stueck_anteil > 0))
);


--
-- Name: invoice_counter; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.invoice_counter (
    year integer NOT NULL,
    last_number integer DEFAULT 0 NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: invoice_versions; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.invoice_versions (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    booking_id text NOT NULL,
    invoice_number text NOT NULL,
    version_number integer NOT NULL,
    is_current boolean DEFAULT true NOT NULL,
    lines jsonb DEFAULT '{}'::jsonb NOT NULL,
    gross_amount numeric DEFAULT 0 NOT NULL,
    net_amount numeric DEFAULT 0 NOT NULL,
    tax_amount numeric DEFAULT 0 NOT NULL,
    reason text,
    trigger_source text DEFAULT 'manual'::text NOT NULL,
    pdf_path text,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    created_by text,
    sent_to_customer_at timestamp with time zone,
    sent_to_email text
);


--
-- Name: invoices; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.invoices (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    booking_id text NOT NULL,
    invoice_number text NOT NULL,
    invoice_date date DEFAULT CURRENT_DATE NOT NULL,
    pdf_url text,
    net_amount numeric(10,2) NOT NULL,
    tax_amount numeric(10,2) DEFAULT 0 NOT NULL,
    gross_amount numeric(10,2) NOT NULL,
    sent_to_email text,
    sent_at timestamp with time zone,
    created_at timestamp with time zone DEFAULT now(),
    account_code text,
    internal_beleg_no text,
    is_test boolean DEFAULT false NOT NULL,
    payment_status text DEFAULT 'open'::text,
    paid_at timestamp with time zone,
    payment_notes text,
    due_date date,
    payment_method text,
    tax_mode text DEFAULT 'kleinunternehmer'::text NOT NULL,
    tax_rate numeric(5,2) DEFAULT 0,
    status text DEFAULT 'paid'::text,
    notes text,
    CONSTRAINT invoices_payment_status_check CHECK ((payment_status = ANY (ARRAY['open'::text, 'paid'::text, 'overdue'::text, 'cancelled'::text, 'partial'::text]))),
    CONSTRAINT invoices_status_check CHECK ((status = ANY (ARRAY['paid'::text, 'open'::text, 'overdue'::text, 'cancelled'::text, 'partially_paid'::text]))),
    CONSTRAINT invoices_tax_mode_check CHECK ((tax_mode = ANY (ARRAY['kleinunternehmer'::text, 'regelbesteuerung'::text])))
);


--
-- Name: COLUMN invoices.is_test; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.invoices.is_test IS 'Test-Rechnung (Rechnungsnr. mit TEST-Praefix, nicht in Reports/DATEV).';


--
-- Name: legal_document_versions; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.legal_document_versions (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    document_id uuid NOT NULL,
    version_number integer DEFAULT 1 NOT NULL,
    content text NOT NULL,
    content_format text DEFAULT 'markdown'::text NOT NULL,
    change_note text,
    published_at timestamp with time zone DEFAULT now(),
    published_by uuid,
    is_current boolean DEFAULT false NOT NULL,
    CONSTRAINT legal_document_versions_content_format_check CHECK ((content_format = ANY (ARRAY['markdown'::text, 'html'::text])))
);


--
-- Name: legal_documents; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.legal_documents (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    slug text NOT NULL,
    title text NOT NULL,
    current_version_id uuid,
    created_at timestamp with time zone DEFAULT now(),
    updated_at timestamp with time zone DEFAULT now()
);


--
-- Name: lieferanten; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.lieferanten (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    name text NOT NULL,
    adresse text,
    ust_id text,
    email text,
    notizen text,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: message_attachments; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.message_attachments (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    message_id uuid NOT NULL,
    storage_path text NOT NULL,
    filename text NOT NULL,
    mime_type text,
    size_bytes bigint,
    created_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: messages; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.messages (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    conversation_id uuid NOT NULL,
    sender_type text NOT NULL,
    sender_id uuid NOT NULL,
    body text NOT NULL,
    read boolean DEFAULT false NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    deleted_at timestamp with time zone,
    body_html text,
    email_message_id text,
    email_in_reply_to text,
    CONSTRAINT messages_sender_type_check CHECK ((sender_type = ANY (ARRAY['customer'::text, 'admin'::text])))
);


--
-- Name: migration_audit; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.migration_audit (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    alte_tabelle text NOT NULL,
    alte_id text NOT NULL,
    neue_tabelle text NOT NULL,
    neue_id uuid NOT NULL,
    migration_datum timestamp with time zone DEFAULT now() NOT NULL,
    notizen text
);


--
-- Name: newsletter_subscribers; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.newsletter_subscribers (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    email text NOT NULL,
    confirm_token text,
    confirm_token_expires_at timestamp with time zone,
    confirmed boolean DEFAULT false NOT NULL,
    confirmed_at timestamp with time zone,
    confirmed_ip text,
    source text,
    signup_ip text,
    signup_user_agent text,
    unsubscribed boolean DEFAULT false NOT NULL,
    unsubscribed_at timestamp with time zone,
    unsubscribe_token text DEFAULT encode(extensions.gen_random_bytes(24), 'hex'::text) NOT NULL,
    is_test boolean DEFAULT false NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: page_views; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.page_views (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    visitor_id text NOT NULL,
    session_id text NOT NULL,
    path text NOT NULL,
    referrer text,
    user_agent text,
    device_type text,
    browser text,
    os text,
    utm_source text,
    utm_medium text,
    utm_campaign text,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    country text,
    region text,
    city text,
    CONSTRAINT page_views_device_type_check CHECK ((device_type = ANY (ARRAY['desktop'::text, 'mobile'::text, 'tablet'::text])))
);


--
-- Name: product_blocked_dates; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.product_blocked_dates (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    product_id text NOT NULL,
    start_date date NOT NULL,
    end_date date NOT NULL,
    reason text,
    blocked_by uuid,
    created_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: product_inventory; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.product_inventory (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    product_id text NOT NULL,
    serial_number text,
    label text,
    status text DEFAULT 'available'::text NOT NULL,
    notes text,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT product_inventory_status_check CHECK ((status = ANY (ARRAY['available'::text, 'rented'::text, 'maintenance'::text, 'defective'::text])))
);


--
-- Name: product_units; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.product_units (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    product_id text NOT NULL,
    serial_number text NOT NULL,
    label text NOT NULL,
    status text DEFAULT 'available'::text,
    notes text,
    purchased_at date,
    created_at timestamp with time zone DEFAULT now(),
    CONSTRAINT product_units_status_check CHECK ((status = ANY (ARRAY['available'::text, 'rented'::text, 'maintenance'::text, 'retired'::text])))
);


--
-- Name: produkte; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.produkte (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    name text NOT NULL,
    marke text,
    modell text,
    default_wbw numeric(10,2),
    ist_vermietbar boolean DEFAULT true NOT NULL,
    bild_url text,
    created_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: profiles; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.profiles (
    id uuid NOT NULL,
    full_name text,
    phone text,
    address_street text,
    address_zip text,
    address_city text,
    created_at timestamp with time zone DEFAULT now(),
    updated_at timestamp with time zone DEFAULT now(),
    verification_status text DEFAULT 'none'::text,
    id_front_url text,
    id_back_url text,
    verified_at timestamp with time zone,
    verified_by text,
    blacklisted boolean DEFAULT false,
    blacklist_reason text,
    blacklisted_at timestamp with time zone,
    referral_code text,
    booking_count integer DEFAULT 0 NOT NULL,
    deleted_at timestamp with time zone,
    anonymized boolean DEFAULT false,
    country text DEFAULT 'DE'::text NOT NULL,
    delivery_name text,
    delivery_street text,
    delivery_zip text,
    delivery_city text,
    billing_name text,
    billing_street text,
    billing_zip text,
    billing_city text,
    is_tester boolean DEFAULT false NOT NULL,
    unverified_warning_sent_at timestamp with time zone,
    inactive_warning_sent_at timestamp with time zone,
    deactivated_at timestamp with time zone,
    special_discount_percent integer,
    special_discount_reason text,
    special_discount_valid_until date,
    special_discount_set_by text,
    special_discount_set_at timestamp with time zone,
    CONSTRAINT profiles_special_discount_percent_chk CHECK (((special_discount_percent IS NULL) OR ((special_discount_percent >= 0) AND (special_discount_percent <= 100))))
);


--
-- Name: COLUMN profiles.is_tester; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.profiles.is_tester IS 'Tester-Konto: Buchungen mit is_test=true, Stripe-Test-Keys, kein Verification-Gate, [TEST]-Prefix in Mails.';


--
-- Name: purchase_attachments; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.purchase_attachments (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    purchase_id uuid NOT NULL,
    storage_path text NOT NULL,
    filename text NOT NULL,
    mime_type text NOT NULL,
    size_bytes bigint,
    kind text DEFAULT 'other'::text NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT purchase_attachments_kind_check CHECK ((kind = ANY (ARRAY['invoice'::text, 'receipt'::text, 'delivery_note'::text, 'other'::text])))
);


--
-- Name: purchase_items; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.purchase_items (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    purchase_id uuid NOT NULL,
    product_name text NOT NULL,
    quantity integer DEFAULT 1 NOT NULL,
    unit_price numeric(10,2) NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    asset_id uuid,
    expense_id uuid,
    classification text,
    tax_rate numeric(5,2),
    net_price numeric(10,2),
    ai_suggestion jsonb,
    account_code text,
    CONSTRAINT purchase_items_classification_check CHECK ((classification = ANY (ARRAY['asset'::text, 'gwg'::text, 'expense'::text, 'pending'::text, 'ignored'::text])))
);


--
-- Name: purchases; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.purchases (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    supplier_id uuid,
    order_date date NOT NULL,
    status text DEFAULT 'ordered'::text NOT NULL,
    invoice_number text,
    invoice_url text,
    total_amount numeric(10,2),
    notes text,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    payment_method text,
    invoice_storage_path text,
    invoice_date date,
    ai_extracted_at timestamp with time zone,
    ai_raw_response jsonb,
    net_amount numeric(10,2),
    tax_amount numeric(10,2),
    is_test boolean DEFAULT false NOT NULL,
    internal_beleg_no text,
    CONSTRAINT purchases_status_check CHECK ((status = ANY (ARRAY['ordered'::text, 'shipped'::text, 'delivered'::text, 'cancelled'::text])))
);


--
-- Name: push_subscriptions; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.push_subscriptions (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    endpoint text NOT NULL,
    p256dh text NOT NULL,
    auth text NOT NULL,
    user_agent text,
    device_label text,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    last_used_at timestamp with time zone,
    admin_user_id uuid
);


--
-- Name: referrals; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.referrals (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    referrer_user_id text NOT NULL,
    referral_code text NOT NULL,
    referred_email text,
    referred_booking_id text,
    reward_coupon_id uuid,
    status text DEFAULT 'pending'::text NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT referrals_status_check CHECK ((status = ANY (ARRAY['pending'::text, 'completed'::text, 'rewarded'::text])))
);


--
-- Name: rental_agreements; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.rental_agreements (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    booking_id text NOT NULL,
    pdf_url text NOT NULL,
    contract_hash text NOT NULL,
    signed_by_name text NOT NULL,
    signed_at timestamp with time zone NOT NULL,
    ip_address text NOT NULL,
    signature_method text NOT NULL,
    created_at timestamp with time zone DEFAULT now(),
    CONSTRAINT rental_agreements_signature_method_check CHECK ((signature_method = ANY (ARRAY['canvas'::text, 'typed'::text])))
);


--
-- Name: return_checklists; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.return_checklists (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    booking_id text NOT NULL,
    checked_by uuid,
    items jsonb DEFAULT '[]'::jsonb NOT NULL,
    status text DEFAULT 'in_progress'::text NOT NULL,
    completed_at timestamp with time zone,
    created_at timestamp with time zone DEFAULT now(),
    CONSTRAINT return_checklists_status_check CHECK ((status = ANY (ARRAY['in_progress'::text, 'completed'::text, 'damage_reported'::text])))
);


--
-- Name: reviews; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.reviews (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    booking_id text NOT NULL,
    user_id uuid NOT NULL,
    product_id text NOT NULL,
    rating integer NOT NULL,
    title text,
    text text,
    created_at timestamp with time zone DEFAULT now(),
    approved boolean DEFAULT false,
    admin_reply text,
    admin_reply_at timestamp with time zone,
    deleted_at timestamp with time zone,
    CONSTRAINT reviews_rating_check CHECK (((rating >= 1) AND (rating <= 5)))
);


--
-- Name: sets; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.sets (
    id text NOT NULL,
    pricing_mode text DEFAULT 'perDay'::text NOT NULL,
    price numeric(10,2) DEFAULT 0 NOT NULL,
    available boolean DEFAULT true NOT NULL,
    updated_at timestamp with time zone DEFAULT now(),
    image_url text,
    basic_for_product_ids text[] DEFAULT '{}'::text[] NOT NULL,
    name text,
    description text,
    badge text,
    badge_color text,
    tag text,
    product_ids text[] DEFAULT '{}'::text[],
    accessory_items jsonb DEFAULT '[]'::jsonb,
    sort_order integer DEFAULT 0 NOT NULL,
    CONSTRAINT sets_pricing_mode_check CHECK ((pricing_mode = ANY (ARRAY['perDay'::text, 'flat'::text])))
);


--
-- Name: shop_page_content; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.shop_page_content (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    page text NOT NULL,
    section text NOT NULL,
    content jsonb DEFAULT '{}'::jsonb NOT NULL,
    is_active boolean DEFAULT true,
    sort_order integer DEFAULT 0,
    updated_at timestamp with time zone DEFAULT now(),
    updated_by uuid
);


--
-- Name: site_visits; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.site_visits (
    day date NOT NULL,
    visits bigint DEFAULT 0 NOT NULL
);


--
-- Name: site_visits_hourly; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.site_visits_hourly (
    day date NOT NULL,
    hour smallint NOT NULL,
    visits bigint DEFAULT 0 NOT NULL,
    CONSTRAINT site_visits_hourly_hour_check CHECK (((hour >= 0) AND (hour <= 23)))
);


--
-- Name: social_accounts; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.social_accounts (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    platform text NOT NULL,
    external_id text NOT NULL,
    name text NOT NULL,
    username text,
    picture_url text,
    access_token text NOT NULL,
    token_expires_at timestamp with time zone,
    linked_account_id uuid,
    is_active boolean DEFAULT true NOT NULL,
    last_used_at timestamp with time zone,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT social_accounts_platform_check CHECK ((platform = ANY (ARRAY['facebook'::text, 'instagram'::text])))
);


--
-- Name: social_editorial_plan; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.social_editorial_plan (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    post_id uuid,
    topic text NOT NULL,
    angle text,
    prompt text,
    keywords text[] DEFAULT '{}'::text[] NOT NULL,
    category text,
    template_id uuid,
    series_id uuid,
    series_part_id uuid,
    platforms text[] DEFAULT '{facebook,instagram}'::text[] NOT NULL,
    with_image boolean DEFAULT true NOT NULL,
    scheduled_date date NOT NULL,
    scheduled_time time without time zone DEFAULT '10:00:00'::time without time zone NOT NULL,
    sort_order integer DEFAULT 0 NOT NULL,
    status text DEFAULT 'planned'::text NOT NULL,
    reviewed boolean DEFAULT false NOT NULL,
    reviewed_at timestamp with time zone,
    generated_at timestamp with time zone,
    published_at timestamp with time zone,
    error_message text,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT social_editorial_plan_status_check CHECK ((status = ANY (ARRAY['planned'::text, 'generating'::text, 'generated'::text, 'reviewed'::text, 'published'::text, 'skipped'::text, 'failed'::text])))
);


--
-- Name: social_insights; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.social_insights (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    post_id uuid NOT NULL,
    platform text NOT NULL,
    reach integer DEFAULT 0 NOT NULL,
    impressions integer DEFAULT 0 NOT NULL,
    likes integer DEFAULT 0 NOT NULL,
    comments integer DEFAULT 0 NOT NULL,
    shares integer DEFAULT 0 NOT NULL,
    saves integer DEFAULT 0 NOT NULL,
    clicks integer DEFAULT 0 NOT NULL,
    engagement_rate numeric(5,2),
    fetched_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT social_insights_platform_check CHECK ((platform = ANY (ARRAY['facebook'::text, 'instagram'::text])))
);


--
-- Name: social_posts; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.social_posts (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    caption text DEFAULT ''::text NOT NULL,
    hashtags text[] DEFAULT '{}'::text[] NOT NULL,
    media_urls text[] DEFAULT '{}'::text[] NOT NULL,
    media_type text DEFAULT 'image'::text NOT NULL,
    link_url text,
    platforms text[] DEFAULT '{}'::text[] NOT NULL,
    fb_account_id uuid,
    ig_account_id uuid,
    fb_post_id text,
    ig_post_id text,
    status text DEFAULT 'draft'::text NOT NULL,
    scheduled_at timestamp with time zone,
    published_at timestamp with time zone,
    error_message text,
    retry_count integer DEFAULT 0 NOT NULL,
    source_type text DEFAULT 'manual'::text NOT NULL,
    source_id text,
    template_id uuid,
    ai_generated boolean DEFAULT false NOT NULL,
    ai_prompt text,
    ai_model text,
    created_by text,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    fb_image_position text DEFAULT 'center center'::text NOT NULL,
    ig_image_position text DEFAULT 'center center'::text NOT NULL,
    fb_permalink text,
    ig_permalink text,
    CONSTRAINT social_posts_media_type_check CHECK ((media_type = ANY (ARRAY['image'::text, 'carousel'::text, 'video'::text, 'reel'::text, 'story'::text, 'text'::text]))),
    CONSTRAINT social_posts_source_type_check CHECK ((source_type = ANY (ARRAY['manual'::text, 'auto_blog'::text, 'auto_product'::text, 'auto_set'::text, 'auto_voucher'::text, 'auto_seasonal'::text, 'auto_schedule'::text]))),
    CONSTRAINT social_posts_status_check CHECK ((status = ANY (ARRAY['draft'::text, 'scheduled'::text, 'publishing'::text, 'published'::text, 'failed'::text, 'partial'::text])))
);


--
-- Name: COLUMN social_posts.fb_image_position; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.social_posts.fb_image_position IS 'CSS object-position fuer Facebook-Preview/Publish (z.B. "50% 50%")';


--
-- Name: COLUMN social_posts.ig_image_position; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.social_posts.ig_image_position IS 'CSS object-position fuer Instagram-Preview/Publish (z.B. "50% 50%")';


--
-- Name: social_reel_music; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.social_reel_music (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    name text NOT NULL,
    url text NOT NULL,
    storage_path text,
    mood text,
    duration_seconds integer,
    source text,
    attribution text,
    is_default boolean DEFAULT false NOT NULL,
    created_at timestamp with time zone DEFAULT now(),
    updated_at timestamp with time zone DEFAULT now()
);


--
-- Name: social_reel_plan; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.social_reel_plan (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    scheduled_date date NOT NULL,
    scheduled_time time without time zone DEFAULT '10:00:00'::time without time zone NOT NULL,
    topic text NOT NULL,
    angle text,
    keywords text[] DEFAULT '{}'::text[] NOT NULL,
    template_id uuid,
    reel_id uuid,
    status text DEFAULT 'planned'::text NOT NULL,
    error_message text,
    created_at timestamp with time zone DEFAULT now(),
    updated_at timestamp with time zone DEFAULT now(),
    CONSTRAINT social_reel_plan_status_check CHECK ((status = ANY (ARRAY['planned'::text, 'generating'::text, 'generated'::text, 'reviewed'::text, 'published'::text, 'skipped'::text, 'failed'::text])))
);


--
-- Name: social_reel_segments; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.social_reel_segments (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    reel_id uuid NOT NULL,
    index integer NOT NULL,
    kind text NOT NULL,
    storage_path text NOT NULL,
    duration_seconds numeric NOT NULL,
    scene_data jsonb,
    source_clip_data jsonb,
    has_voice boolean DEFAULT false NOT NULL,
    voice_storage_path text,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT social_reel_segments_kind_check CHECK ((kind = ANY (ARRAY['intro'::text, 'body'::text, 'cta'::text, 'outro'::text])))
);


--
-- Name: social_reel_templates; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.social_reel_templates (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    name text NOT NULL,
    description text,
    template_type text DEFAULT 'stock_footage'::text NOT NULL,
    script_prompt text NOT NULL,
    default_duration integer DEFAULT 20 NOT NULL,
    default_hashtags text[] DEFAULT '{}'::text[] NOT NULL,
    bg_color_from text DEFAULT '#3B82F6'::text,
    bg_color_to text DEFAULT '#1E40AF'::text,
    trigger_type text,
    is_active boolean DEFAULT true NOT NULL,
    created_at timestamp with time zone DEFAULT now(),
    updated_at timestamp with time zone DEFAULT now(),
    motion_style text DEFAULT 'kenburns'::text NOT NULL,
    CONSTRAINT social_reel_templates_motion_style_check CHECK ((motion_style = ANY (ARRAY['static'::text, 'kenburns'::text, 'mixed'::text]))),
    CONSTRAINT social_reel_templates_template_type_check CHECK ((template_type = ANY (ARRAY['stock_footage'::text, 'motion_graphics'::text])))
);


--
-- Name: social_reels; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.social_reels (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    caption text DEFAULT ''::text NOT NULL,
    hashtags text[] DEFAULT '{}'::text[] NOT NULL,
    link_url text,
    video_url text,
    thumbnail_url text,
    duration_seconds integer,
    template_type text DEFAULT 'stock_footage'::text NOT NULL,
    script_json jsonb,
    render_log text,
    platforms text[] DEFAULT '{facebook,instagram}'::text[] NOT NULL,
    fb_account_id uuid,
    ig_account_id uuid,
    fb_reel_id text,
    ig_reel_id text,
    fb_permalink text,
    ig_permalink text,
    status text DEFAULT 'draft'::text NOT NULL,
    scheduled_at timestamp with time zone,
    published_at timestamp with time zone,
    reviewed_at timestamp with time zone,
    approved_by text,
    error_message text,
    retry_count integer DEFAULT 0 NOT NULL,
    source_type text,
    source_id text,
    template_id uuid,
    ai_generated boolean DEFAULT false NOT NULL,
    ai_prompt text,
    is_test boolean DEFAULT false NOT NULL,
    created_at timestamp with time zone DEFAULT now(),
    updated_at timestamp with time zone DEFAULT now(),
    music_id uuid,
    music_url text,
    quality_metrics jsonb,
    CONSTRAINT social_reels_status_check CHECK ((status = ANY (ARRAY['draft'::text, 'rendering'::text, 'rendered'::text, 'pending_review'::text, 'approved'::text, 'scheduled'::text, 'publishing'::text, 'published'::text, 'partial'::text, 'failed'::text]))),
    CONSTRAINT social_reels_template_type_check CHECK ((template_type = ANY (ARRAY['stock_footage'::text, 'motion_graphics'::text])))
);


--
-- Name: social_schedule; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.social_schedule (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    name text NOT NULL,
    template_id uuid,
    frequency text NOT NULL,
    day_of_week integer,
    day_of_month integer,
    hour_of_day integer DEFAULT 9 NOT NULL,
    minute integer DEFAULT 0 NOT NULL,
    context_json jsonb DEFAULT '{}'::jsonb,
    is_active boolean DEFAULT true NOT NULL,
    last_run_at timestamp with time zone,
    next_run_at timestamp with time zone,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT social_schedule_day_of_month_check CHECK (((day_of_month >= 1) AND (day_of_month <= 31))),
    CONSTRAINT social_schedule_day_of_week_check CHECK (((day_of_week >= 0) AND (day_of_week <= 6))),
    CONSTRAINT social_schedule_frequency_check CHECK ((frequency = ANY (ARRAY['daily'::text, 'weekly'::text, 'monthly'::text]))),
    CONSTRAINT social_schedule_hour_of_day_check CHECK (((hour_of_day >= 0) AND (hour_of_day <= 23))),
    CONSTRAINT social_schedule_minute_check CHECK (((minute >= 0) AND (minute <= 59)))
);


--
-- Name: social_series; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.social_series (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    title text NOT NULL,
    description text DEFAULT ''::text,
    platforms text[] DEFAULT '{facebook,instagram}'::text[] NOT NULL,
    total_parts integer DEFAULT 3 NOT NULL,
    generated_parts integer DEFAULT 0 NOT NULL,
    status text DEFAULT 'active'::text NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT social_series_status_check CHECK ((status = ANY (ARRAY['active'::text, 'paused'::text, 'completed'::text])))
);


--
-- Name: social_series_parts; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.social_series_parts (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    series_id uuid NOT NULL,
    part_number integer NOT NULL,
    topic text NOT NULL,
    angle text,
    keywords text[] DEFAULT '{}'::text[] NOT NULL,
    post_id uuid,
    used boolean DEFAULT false NOT NULL,
    used_at timestamp with time zone,
    created_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: social_templates; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.social_templates (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    name text NOT NULL,
    description text,
    trigger_type text NOT NULL,
    platforms text[] DEFAULT '{facebook,instagram}'::text[] NOT NULL,
    media_type text DEFAULT 'image'::text NOT NULL,
    caption_prompt text NOT NULL,
    image_prompt text,
    default_hashtags text[] DEFAULT '{}'::text[] NOT NULL,
    is_active boolean DEFAULT true NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT social_templates_trigger_type_check CHECK ((trigger_type = ANY (ARRAY['manual'::text, 'blog_publish'::text, 'product_added'::text, 'set_added'::text, 'voucher_created'::text, 'seasonal'::text, 'scheduled'::text])))
);


--
-- Name: social_topics; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.social_topics (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    topic text NOT NULL,
    angle text,
    keywords text[] DEFAULT '{}'::text[] NOT NULL,
    category text,
    platforms text[] DEFAULT '{facebook,instagram}'::text[] NOT NULL,
    with_image boolean DEFAULT true NOT NULL,
    used boolean DEFAULT false NOT NULL,
    used_at timestamp with time zone,
    used_post_id uuid,
    created_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: stripe_transactions; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.stripe_transactions (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    stripe_payment_intent_id text NOT NULL,
    stripe_charge_id text,
    amount numeric(10,2) NOT NULL,
    fee numeric(10,2) DEFAULT 0 NOT NULL,
    net numeric(10,2) DEFAULT 0 NOT NULL,
    currency text DEFAULT 'EUR'::text,
    status text NOT NULL,
    payment_method text,
    booking_id text,
    match_status text DEFAULT 'unmatched'::text,
    stripe_created_at timestamp with time zone NOT NULL,
    synced_at timestamp with time zone DEFAULT now(),
    reconciliation_note text,
    is_test boolean DEFAULT false NOT NULL,
    CONSTRAINT stripe_transactions_match_status_check CHECK ((match_status = ANY (ARRAY['matched'::text, 'unmatched'::text, 'manual'::text, 'refunded'::text])))
);


--
-- Name: suppliers; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.suppliers (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    name text NOT NULL,
    contact_person text,
    email text,
    phone text,
    website text,
    supplier_number text,
    notes text,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: waitlist_subscriptions; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.waitlist_subscriptions (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    product_id text NOT NULL,
    email text NOT NULL,
    source text,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    notified_at timestamp with time zone,
    use_case text
);


--
-- Name: abandoned_carts abandoned_carts_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.abandoned_carts
    ADD CONSTRAINT abandoned_carts_pkey PRIMARY KEY (id);


--
-- Name: accessories accessories_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.accessories
    ADD CONSTRAINT accessories_pkey PRIMARY KEY (id);


--
-- Name: accessory_units accessory_units_exemplar_code_unique; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.accessory_units
    ADD CONSTRAINT accessory_units_exemplar_code_unique UNIQUE (exemplar_code);


--
-- Name: accessory_units accessory_units_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.accessory_units
    ADD CONSTRAINT accessory_units_pkey PRIMARY KEY (id);


--
-- Name: admin_audit_log admin_audit_log_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.admin_audit_log
    ADD CONSTRAINT admin_audit_log_pkey PRIMARY KEY (id);


--
-- Name: admin_config admin_config_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.admin_config
    ADD CONSTRAINT admin_config_pkey PRIMARY KEY (key);


--
-- Name: admin_customer_notes admin_customer_notes_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.admin_customer_notes
    ADD CONSTRAINT admin_customer_notes_pkey PRIMARY KEY (id);


--
-- Name: admin_notifications admin_notifications_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.admin_notifications
    ADD CONSTRAINT admin_notifications_pkey PRIMARY KEY (id);


--
-- Name: admin_sessions admin_sessions_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.admin_sessions
    ADD CONSTRAINT admin_sessions_pkey PRIMARY KEY (token);


--
-- Name: admin_settings admin_settings_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.admin_settings
    ADD CONSTRAINT admin_settings_pkey PRIMARY KEY (key);


--
-- Name: admin_users admin_users_email_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.admin_users
    ADD CONSTRAINT admin_users_email_key UNIQUE (email);


--
-- Name: admin_users admin_users_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.admin_users
    ADD CONSTRAINT admin_users_pkey PRIMARY KEY (id);


--
-- Name: afa_buchungen afa_buchungen_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.afa_buchungen
    ADD CONSTRAINT afa_buchungen_pkey PRIMARY KEY (id);


--
-- Name: angebote angebote_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.angebote
    ADD CONSTRAINT angebote_pkey PRIMARY KEY (id);


--
-- Name: assets_neu assets_neu_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.assets_neu
    ADD CONSTRAINT assets_neu_pkey PRIMARY KEY (id);


--
-- Name: assets assets_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.assets
    ADD CONSTRAINT assets_pkey PRIMARY KEY (id);


--
-- Name: availability_alerts availability_alerts_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.availability_alerts
    ADD CONSTRAINT availability_alerts_pkey PRIMARY KEY (id);


--
-- Name: beleg_anhaenge beleg_anhaenge_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.beleg_anhaenge
    ADD CONSTRAINT beleg_anhaenge_pkey PRIMARY KEY (id);


--
-- Name: beleg_nummer_counter beleg_nummer_counter_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.beleg_nummer_counter
    ADD CONSTRAINT beleg_nummer_counter_pkey PRIMARY KEY (jahr);


--
-- Name: beleg_positionen beleg_positionen_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.beleg_positionen
    ADD CONSTRAINT beleg_positionen_pkey PRIMARY KEY (id);


--
-- Name: belege belege_beleg_nr_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.belege
    ADD CONSTRAINT belege_beleg_nr_key UNIQUE (beleg_nr);


--
-- Name: belege belege_interne_beleg_no_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.belege
    ADD CONSTRAINT belege_interne_beleg_no_key UNIQUE (interne_beleg_no);


--
-- Name: belege belege_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.belege
    ADD CONSTRAINT belege_pkey PRIMARY KEY (id);


--
-- Name: beta_feedback beta_feedback_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.beta_feedback
    ADD CONSTRAINT beta_feedback_pkey PRIMARY KEY (id);


--
-- Name: blog_auto_topics blog_auto_topics_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.blog_auto_topics
    ADD CONSTRAINT blog_auto_topics_pkey PRIMARY KEY (id);


--
-- Name: blog_categories blog_categories_name_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.blog_categories
    ADD CONSTRAINT blog_categories_name_key UNIQUE (name);


--
-- Name: blog_categories blog_categories_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.blog_categories
    ADD CONSTRAINT blog_categories_pkey PRIMARY KEY (id);


--
-- Name: blog_categories blog_categories_slug_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.blog_categories
    ADD CONSTRAINT blog_categories_slug_key UNIQUE (slug);


--
-- Name: blog_comments blog_comments_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.blog_comments
    ADD CONSTRAINT blog_comments_pkey PRIMARY KEY (id);


--
-- Name: blog_posts blog_posts_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.blog_posts
    ADD CONSTRAINT blog_posts_pkey PRIMARY KEY (id);


--
-- Name: blog_posts blog_posts_slug_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.blog_posts
    ADD CONSTRAINT blog_posts_slug_key UNIQUE (slug);


--
-- Name: blog_schedule blog_schedule_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.blog_schedule
    ADD CONSTRAINT blog_schedule_pkey PRIMARY KEY (id);


--
-- Name: blog_series_parts blog_series_parts_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.blog_series_parts
    ADD CONSTRAINT blog_series_parts_pkey PRIMARY KEY (id);


--
-- Name: blog_series_parts blog_series_parts_series_id_part_number_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.blog_series_parts
    ADD CONSTRAINT blog_series_parts_series_id_part_number_key UNIQUE (series_id, part_number);


--
-- Name: blog_series blog_series_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.blog_series
    ADD CONSTRAINT blog_series_pkey PRIMARY KEY (id);


--
-- Name: blog_series blog_series_slug_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.blog_series
    ADD CONSTRAINT blog_series_slug_key UNIQUE (slug);


--
-- Name: blog_views blog_views_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.blog_views
    ADD CONSTRAINT blog_views_pkey PRIMARY KEY (id);


--
-- Name: booking_id_counter booking_id_counter_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.booking_id_counter
    ADD CONSTRAINT booking_id_counter_pkey PRIMARY KEY (year_week, is_test);


--
-- Name: booking_interest booking_interest_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.booking_interest
    ADD CONSTRAINT booking_interest_pkey PRIMARY KEY (id);


--
-- Name: bookings bookings_payment_intent_id_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.bookings
    ADD CONSTRAINT bookings_payment_intent_id_key UNIQUE (payment_intent_id);


--
-- Name: bookings bookings_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.bookings
    ADD CONSTRAINT bookings_pkey PRIMARY KEY (id);


--
-- Name: calendar_notes calendar_notes_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.calendar_notes
    ADD CONSTRAINT calendar_notes_pkey PRIMARY KEY (id);


--
-- Name: cart_holds cart_holds_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.cart_holds
    ADD CONSTRAINT cart_holds_pkey PRIMARY KEY (id);


--
-- Name: client_errors client_errors_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.client_errors
    ADD CONSTRAINT client_errors_pkey PRIMARY KEY (id);


--
-- Name: content_coupon_counter content_coupon_counter_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.content_coupon_counter
    ADD CONSTRAINT content_coupon_counter_pkey PRIMARY KEY (is_test);


--
-- Name: conversations conversations_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.conversations
    ADD CONSTRAINT conversations_pkey PRIMARY KEY (id);


--
-- Name: coupons coupons_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.coupons
    ADD CONSTRAINT coupons_pkey PRIMARY KEY (id);


--
-- Name: credit_notes credit_notes_credit_note_number_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.credit_notes
    ADD CONSTRAINT credit_notes_credit_note_number_key UNIQUE (credit_note_number);


--
-- Name: credit_notes credit_notes_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.credit_notes
    ADD CONSTRAINT credit_notes_pkey PRIMARY KEY (id);


--
-- Name: custom_sets custom_sets_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.custom_sets
    ADD CONSTRAINT custom_sets_pkey PRIMARY KEY (id);


--
-- Name: customer_login_history customer_login_history_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.customer_login_history
    ADD CONSTRAINT customer_login_history_pkey PRIMARY KEY (id);


--
-- Name: customer_push_subscriptions customer_push_subscriptions_endpoint_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.customer_push_subscriptions
    ADD CONSTRAINT customer_push_subscriptions_endpoint_key UNIQUE (endpoint);


--
-- Name: customer_push_subscriptions customer_push_subscriptions_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.customer_push_subscriptions
    ADD CONSTRAINT customer_push_subscriptions_pkey PRIMARY KEY (id);


--
-- Name: customer_ugc_submissions customer_ugc_submissions_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.customer_ugc_submissions
    ADD CONSTRAINT customer_ugc_submissions_pkey PRIMARY KEY (id);


--
-- Name: damage_reports damage_reports_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.damage_reports
    ADD CONSTRAINT damage_reports_pkey PRIMARY KEY (id);


--
-- Name: dunning_notices dunning_notices_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.dunning_notices
    ADD CONSTRAINT dunning_notices_pkey PRIMARY KEY (id);


--
-- Name: email_log email_log_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.email_log
    ADD CONSTRAINT email_log_pkey PRIMARY KEY (id);


--
-- Name: employee_appointments employee_appointments_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.employee_appointments
    ADD CONSTRAINT employee_appointments_pkey PRIMARY KEY (id);


--
-- Name: employee_notes employee_notes_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.employee_notes
    ADD CONSTRAINT employee_notes_pkey PRIMARY KEY (id);


--
-- Name: expenses expenses_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.expenses
    ADD CONSTRAINT expenses_pkey PRIMARY KEY (id);


--
-- Name: export_log export_log_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.export_log
    ADD CONSTRAINT export_log_pkey PRIMARY KEY (id);


--
-- Name: favorites favorites_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.favorites
    ADD CONSTRAINT favorites_pkey PRIMARY KEY (id);


--
-- Name: favorites favorites_user_id_product_id_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.favorites
    ADD CONSTRAINT favorites_user_id_product_id_key UNIQUE (user_id, product_id);


--
-- Name: firmware_checks firmware_checks_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.firmware_checks
    ADD CONSTRAINT firmware_checks_pkey PRIMARY KEY (id);


--
-- Name: firmware_checks firmware_checks_product_id_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.firmware_checks
    ADD CONSTRAINT firmware_checks_product_id_key UNIQUE (product_id);


--
-- Name: inventar_code_segmente inventar_code_segmente_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.inventar_code_segmente
    ADD CONSTRAINT inventar_code_segmente_pkey PRIMARY KEY (id);


--
-- Name: inventar_code_segmente inventar_code_segmente_unique; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.inventar_code_segmente
    ADD CONSTRAINT inventar_code_segmente_unique UNIQUE (typ, code);


--
-- Name: inventar_units inventar_units_inventar_code_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.inventar_units
    ADD CONSTRAINT inventar_units_inventar_code_key UNIQUE (inventar_code);


--
-- Name: inventar_units inventar_units_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.inventar_units
    ADD CONSTRAINT inventar_units_pkey PRIMARY KEY (id);


--
-- Name: inventar_units inventar_units_seriennummer_unique; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.inventar_units
    ADD CONSTRAINT inventar_units_seriennummer_unique UNIQUE (seriennummer);


--
-- Name: CONSTRAINT inventar_units_seriennummer_unique ON inventar_units; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON CONSTRAINT inventar_units_seriennummer_unique ON public.inventar_units IS 'Seriennummer muss systemweit eindeutig sein (NULL erlaubt). Bezeichnung darf hingegen mehrfach vorkommen.';


--
-- Name: inventar_verknuepfung inventar_verknuepfung_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.inventar_verknuepfung
    ADD CONSTRAINT inventar_verknuepfung_pkey PRIMARY KEY (id);


--
-- Name: inventar_verknuepfung inventar_verknuepfung_unique; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.inventar_verknuepfung
    ADD CONSTRAINT inventar_verknuepfung_unique UNIQUE (beleg_position_id, inventar_unit_id);


--
-- Name: invoice_counter invoice_counter_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.invoice_counter
    ADD CONSTRAINT invoice_counter_pkey PRIMARY KEY (year);


--
-- Name: invoice_versions invoice_versions_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.invoice_versions
    ADD CONSTRAINT invoice_versions_pkey PRIMARY KEY (id);


--
-- Name: invoices invoices_invoice_number_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.invoices
    ADD CONSTRAINT invoices_invoice_number_key UNIQUE (invoice_number);


--
-- Name: invoices invoices_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.invoices
    ADD CONSTRAINT invoices_pkey PRIMARY KEY (id);


--
-- Name: legal_document_versions legal_document_versions_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.legal_document_versions
    ADD CONSTRAINT legal_document_versions_pkey PRIMARY KEY (id);


--
-- Name: legal_documents legal_documents_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.legal_documents
    ADD CONSTRAINT legal_documents_pkey PRIMARY KEY (id);


--
-- Name: legal_documents legal_documents_slug_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.legal_documents
    ADD CONSTRAINT legal_documents_slug_key UNIQUE (slug);


--
-- Name: lieferanten lieferanten_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.lieferanten
    ADD CONSTRAINT lieferanten_pkey PRIMARY KEY (id);


--
-- Name: message_attachments message_attachments_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.message_attachments
    ADD CONSTRAINT message_attachments_pkey PRIMARY KEY (id);


--
-- Name: messages messages_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.messages
    ADD CONSTRAINT messages_pkey PRIMARY KEY (id);


--
-- Name: migration_audit migration_audit_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.migration_audit
    ADD CONSTRAINT migration_audit_pkey PRIMARY KEY (id);


--
-- Name: newsletter_subscribers newsletter_subscribers_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.newsletter_subscribers
    ADD CONSTRAINT newsletter_subscribers_pkey PRIMARY KEY (id);


--
-- Name: page_views page_views_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.page_views
    ADD CONSTRAINT page_views_pkey PRIMARY KEY (id);


--
-- Name: product_blocked_dates product_blocked_dates_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.product_blocked_dates
    ADD CONSTRAINT product_blocked_dates_pkey PRIMARY KEY (id);


--
-- Name: product_inventory product_inventory_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.product_inventory
    ADD CONSTRAINT product_inventory_pkey PRIMARY KEY (id);


--
-- Name: product_units product_units_label_unique; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.product_units
    ADD CONSTRAINT product_units_label_unique UNIQUE (label);


--
-- Name: product_units product_units_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.product_units
    ADD CONSTRAINT product_units_pkey PRIMARY KEY (id);


--
-- Name: produkte produkte_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.produkte
    ADD CONSTRAINT produkte_pkey PRIMARY KEY (id);


--
-- Name: profiles profiles_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.profiles
    ADD CONSTRAINT profiles_pkey PRIMARY KEY (id);


--
-- Name: profiles profiles_referral_code_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.profiles
    ADD CONSTRAINT profiles_referral_code_key UNIQUE (referral_code);


--
-- Name: purchase_attachments purchase_attachments_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.purchase_attachments
    ADD CONSTRAINT purchase_attachments_pkey PRIMARY KEY (id);


--
-- Name: purchase_items purchase_items_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.purchase_items
    ADD CONSTRAINT purchase_items_pkey PRIMARY KEY (id);


--
-- Name: purchases purchases_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.purchases
    ADD CONSTRAINT purchases_pkey PRIMARY KEY (id);


--
-- Name: push_subscriptions push_subscriptions_endpoint_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.push_subscriptions
    ADD CONSTRAINT push_subscriptions_endpoint_key UNIQUE (endpoint);


--
-- Name: push_subscriptions push_subscriptions_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.push_subscriptions
    ADD CONSTRAINT push_subscriptions_pkey PRIMARY KEY (id);


--
-- Name: referrals referrals_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.referrals
    ADD CONSTRAINT referrals_pkey PRIMARY KEY (id);


--
-- Name: rental_agreements rental_agreements_booking_id_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.rental_agreements
    ADD CONSTRAINT rental_agreements_booking_id_key UNIQUE (booking_id);


--
-- Name: rental_agreements rental_agreements_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.rental_agreements
    ADD CONSTRAINT rental_agreements_pkey PRIMARY KEY (id);


--
-- Name: return_checklists return_checklists_booking_id_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.return_checklists
    ADD CONSTRAINT return_checklists_booking_id_key UNIQUE (booking_id);


--
-- Name: return_checklists return_checklists_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.return_checklists
    ADD CONSTRAINT return_checklists_pkey PRIMARY KEY (id);


--
-- Name: reviews reviews_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.reviews
    ADD CONSTRAINT reviews_pkey PRIMARY KEY (id);


--
-- Name: sets sets_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.sets
    ADD CONSTRAINT sets_pkey PRIMARY KEY (id);


--
-- Name: shop_page_content shop_page_content_page_section_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.shop_page_content
    ADD CONSTRAINT shop_page_content_page_section_key UNIQUE (page, section);


--
-- Name: shop_page_content shop_page_content_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.shop_page_content
    ADD CONSTRAINT shop_page_content_pkey PRIMARY KEY (id);


--
-- Name: site_visits_hourly site_visits_hourly_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.site_visits_hourly
    ADD CONSTRAINT site_visits_hourly_pkey PRIMARY KEY (day, hour);


--
-- Name: site_visits site_visits_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.site_visits
    ADD CONSTRAINT site_visits_pkey PRIMARY KEY (day);


--
-- Name: social_accounts social_accounts_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.social_accounts
    ADD CONSTRAINT social_accounts_pkey PRIMARY KEY (id);


--
-- Name: social_accounts social_accounts_platform_external_id_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.social_accounts
    ADD CONSTRAINT social_accounts_platform_external_id_key UNIQUE (platform, external_id);


--
-- Name: social_editorial_plan social_editorial_plan_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.social_editorial_plan
    ADD CONSTRAINT social_editorial_plan_pkey PRIMARY KEY (id);


--
-- Name: social_insights social_insights_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.social_insights
    ADD CONSTRAINT social_insights_pkey PRIMARY KEY (id);


--
-- Name: social_insights social_insights_post_id_platform_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.social_insights
    ADD CONSTRAINT social_insights_post_id_platform_key UNIQUE (post_id, platform);


--
-- Name: social_posts social_posts_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.social_posts
    ADD CONSTRAINT social_posts_pkey PRIMARY KEY (id);


--
-- Name: social_reel_music social_reel_music_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.social_reel_music
    ADD CONSTRAINT social_reel_music_pkey PRIMARY KEY (id);


--
-- Name: social_reel_plan social_reel_plan_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.social_reel_plan
    ADD CONSTRAINT social_reel_plan_pkey PRIMARY KEY (id);


--
-- Name: social_reel_segments social_reel_segments_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.social_reel_segments
    ADD CONSTRAINT social_reel_segments_pkey PRIMARY KEY (id);


--
-- Name: social_reel_segments social_reel_segments_reel_id_index_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.social_reel_segments
    ADD CONSTRAINT social_reel_segments_reel_id_index_key UNIQUE (reel_id, index);


--
-- Name: social_reel_templates social_reel_templates_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.social_reel_templates
    ADD CONSTRAINT social_reel_templates_pkey PRIMARY KEY (id);


--
-- Name: social_reels social_reels_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.social_reels
    ADD CONSTRAINT social_reels_pkey PRIMARY KEY (id);


--
-- Name: social_schedule social_schedule_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.social_schedule
    ADD CONSTRAINT social_schedule_pkey PRIMARY KEY (id);


--
-- Name: social_series_parts social_series_parts_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.social_series_parts
    ADD CONSTRAINT social_series_parts_pkey PRIMARY KEY (id);


--
-- Name: social_series_parts social_series_parts_series_id_part_number_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.social_series_parts
    ADD CONSTRAINT social_series_parts_series_id_part_number_key UNIQUE (series_id, part_number);


--
-- Name: social_series social_series_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.social_series
    ADD CONSTRAINT social_series_pkey PRIMARY KEY (id);


--
-- Name: social_templates social_templates_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.social_templates
    ADD CONSTRAINT social_templates_pkey PRIMARY KEY (id);


--
-- Name: social_topics social_topics_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.social_topics
    ADD CONSTRAINT social_topics_pkey PRIMARY KEY (id);


--
-- Name: stripe_transactions stripe_transactions_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.stripe_transactions
    ADD CONSTRAINT stripe_transactions_pkey PRIMARY KEY (id);


--
-- Name: stripe_transactions stripe_transactions_stripe_payment_intent_id_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.stripe_transactions
    ADD CONSTRAINT stripe_transactions_stripe_payment_intent_id_key UNIQUE (stripe_payment_intent_id);


--
-- Name: suppliers suppliers_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.suppliers
    ADD CONSTRAINT suppliers_pkey PRIMARY KEY (id);


--
-- Name: accessory_units unique_exemplar_code_per_accessory; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.accessory_units
    ADD CONSTRAINT unique_exemplar_code_per_accessory UNIQUE (accessory_id, exemplar_code);


--
-- Name: product_units unique_serial_per_product; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.product_units
    ADD CONSTRAINT unique_serial_per_product UNIQUE (product_id, serial_number);


--
-- Name: waitlist_subscriptions waitlist_subscriptions_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.waitlist_subscriptions
    ADD CONSTRAINT waitlist_subscriptions_pkey PRIMARY KEY (id);


--
-- Name: waitlist_subscriptions waitlist_subscriptions_product_id_email_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.waitlist_subscriptions
    ADD CONSTRAINT waitlist_subscriptions_product_id_email_key UNIQUE (product_id, email);


--
-- Name: blog_views_created_at_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX blog_views_created_at_idx ON public.blog_views USING btree (created_at);


--
-- Name: blog_views_is_bot_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX blog_views_is_bot_idx ON public.blog_views USING btree (is_bot);


--
-- Name: blog_views_slug_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX blog_views_slug_idx ON public.blog_views USING btree (slug);


--
-- Name: bookings_booking_type_kauf_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX bookings_booking_type_kauf_idx ON public.bookings USING btree (created_at DESC) WHERE (booking_type = 'kauf'::text);


--
-- Name: bookings_payment_link_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX bookings_payment_link_idx ON public.bookings USING btree (stripe_payment_link_id);


--
-- Name: bookings_product_dates; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX bookings_product_dates ON public.bookings USING btree (product_id, rental_from, rental_to, status);


--
-- Name: bookings_status_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX bookings_status_idx ON public.bookings USING btree (status);


--
-- Name: bookings_user_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX bookings_user_id ON public.bookings USING btree (user_id);


--
-- Name: cart_holds_expires_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX cart_holds_expires_idx ON public.cart_holds USING btree (expires_at);


--
-- Name: cart_holds_product_active_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX cart_holds_product_active_idx ON public.cart_holds USING btree (product_id, expires_at);


--
-- Name: cart_holds_user_item_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX cart_holds_user_item_idx ON public.cart_holds USING btree (user_id, cart_item_id);


--
-- Name: coupons_active_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX coupons_active_idx ON public.coupons USING btree (active) WHERE (active = true);


--
-- Name: coupons_code_upper_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX coupons_code_upper_idx ON public.coupons USING btree (upper(code));


--
-- Name: customer_login_history_user_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX customer_login_history_user_idx ON public.customer_login_history USING btree (user_id, created_at DESC);


--
-- Name: idx_abandoned_carts_pending; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_abandoned_carts_pending ON public.abandoned_carts USING btree (updated_at) WHERE ((reminder_sent_at IS NULL) AND (recovered = false));


--
-- Name: idx_abandoned_carts_user; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_abandoned_carts_user ON public.abandoned_carts USING btree (user_id);


--
-- Name: idx_accessory_units_accessory_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_accessory_units_accessory_id ON public.accessory_units USING btree (accessory_id);


--
-- Name: idx_accessory_units_exemplar_code; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_accessory_units_exemplar_code ON public.accessory_units USING btree (exemplar_code);


--
-- Name: idx_accessory_units_purchased_at; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_accessory_units_purchased_at ON public.accessory_units USING btree (purchased_at);


--
-- Name: idx_accessory_units_status; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_accessory_units_status ON public.accessory_units USING btree (status);


--
-- Name: idx_admin_audit_log_is_test; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_admin_audit_log_is_test ON public.admin_audit_log USING btree (is_test) WHERE (is_test = true);


--
-- Name: idx_admin_customer_notes_customer_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_admin_customer_notes_customer_id ON public.admin_customer_notes USING btree (customer_id);


--
-- Name: idx_admin_notifications_created; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_admin_notifications_created ON public.admin_notifications USING btree (created_at DESC);


--
-- Name: idx_admin_notifications_unread; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_admin_notifications_unread ON public.admin_notifications USING btree (is_read, created_at DESC);


--
-- Name: idx_admin_sessions_expires; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_admin_sessions_expires ON public.admin_sessions USING btree (expires_at);


--
-- Name: idx_admin_sessions_user; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_admin_sessions_user ON public.admin_sessions USING btree (user_id);


--
-- Name: idx_admin_users_active; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_admin_users_active ON public.admin_users USING btree (is_active) WHERE is_active;


--
-- Name: idx_admin_users_email; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_admin_users_email ON public.admin_users USING btree (email);


--
-- Name: idx_admin_users_inbox_address; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX idx_admin_users_inbox_address ON public.admin_users USING btree (lower(inbox_address)) WHERE (inbox_address IS NOT NULL);


--
-- Name: idx_admin_users_username_lower; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX idx_admin_users_username_lower ON public.admin_users USING btree (lower(username)) WHERE (username IS NOT NULL);


--
-- Name: idx_afa_buchungen_asset; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_afa_buchungen_asset ON public.afa_buchungen USING btree (asset_id);


--
-- Name: idx_afa_buchungen_datum; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_afa_buchungen_datum ON public.afa_buchungen USING btree (buchungsdatum DESC);


--
-- Name: idx_angebote_active_valid; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_angebote_active_valid ON public.angebote USING btree (active, valid_until);


--
-- Name: idx_assets_accessory_unit; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_assets_accessory_unit ON public.assets USING btree (accessory_unit_id) WHERE (accessory_unit_id IS NOT NULL);


--
-- Name: idx_assets_is_test; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_assets_is_test ON public.assets USING btree (is_test) WHERE (is_test = true);


--
-- Name: idx_assets_kind; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_assets_kind ON public.assets USING btree (kind);


--
-- Name: idx_assets_neu_beleg_position; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_assets_neu_beleg_position ON public.assets_neu USING btree (beleg_position_id);


--
-- Name: idx_assets_neu_is_test; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_assets_neu_is_test ON public.assets_neu USING btree (is_test) WHERE (is_test = true);


--
-- Name: idx_assets_neu_methode; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_assets_neu_methode ON public.assets_neu USING btree (afa_methode);


--
-- Name: idx_assets_neu_status; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_assets_neu_status ON public.assets_neu USING btree (status);


--
-- Name: idx_assets_purchase; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_assets_purchase ON public.assets USING btree (purchase_id);


--
-- Name: idx_assets_status; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_assets_status ON public.assets USING btree (status);


--
-- Name: idx_assets_supplier; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_assets_supplier ON public.assets USING btree (supplier_id);


--
-- Name: idx_assets_unit; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_assets_unit ON public.assets USING btree (unit_id);


--
-- Name: idx_audit_alt; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_audit_alt ON public.migration_audit USING btree (alte_tabelle, alte_id);


--
-- Name: idx_audit_log_admin_user_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_audit_log_admin_user_id ON public.admin_audit_log USING btree (admin_user_id);


--
-- Name: idx_audit_log_created_at; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_audit_log_created_at ON public.admin_audit_log USING btree (created_at DESC);


--
-- Name: idx_audit_log_entity_type; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_audit_log_entity_type ON public.admin_audit_log USING btree (entity_type);


--
-- Name: idx_audit_neu; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_audit_neu ON public.migration_audit USING btree (neue_tabelle, neue_id);


--
-- Name: idx_availability_alerts_dedupe; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_availability_alerts_dedupe ON public.availability_alerts USING btree (alert_type, product_id, set_id, accessory_id, rental_from, rental_to) WHERE (resolved_at IS NULL);


--
-- Name: idx_availability_alerts_open; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_availability_alerts_open ON public.availability_alerts USING btree (last_seen_at DESC) WHERE (resolved_at IS NULL);


--
-- Name: idx_beleg_anhaenge_beleg; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_beleg_anhaenge_beleg ON public.beleg_anhaenge USING btree (beleg_id);


--
-- Name: idx_beleg_anhaenge_file_hash; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_beleg_anhaenge_file_hash ON public.beleg_anhaenge USING btree (file_hash) WHERE (file_hash IS NOT NULL);


--
-- Name: idx_beleg_positionen_beleg; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_beleg_positionen_beleg ON public.beleg_positionen USING btree (beleg_id);


--
-- Name: idx_beleg_positionen_folgekosten; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_beleg_positionen_folgekosten ON public.beleg_positionen USING btree (folgekosten_asset_id) WHERE (folgekosten_asset_id IS NOT NULL);


--
-- Name: idx_beleg_positionen_klassifizierung; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_beleg_positionen_klassifizierung ON public.beleg_positionen USING btree (klassifizierung);


--
-- Name: idx_belege_datum; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_belege_datum ON public.belege USING btree (beleg_datum DESC);


--
-- Name: idx_belege_is_test; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_belege_is_test ON public.belege USING btree (is_test) WHERE (is_test = true);


--
-- Name: idx_belege_lieferant; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_belege_lieferant ON public.belege USING btree (lieferant_id);


--
-- Name: idx_belege_ocr_status; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_belege_ocr_status ON public.belege USING btree (ocr_status) WHERE (ocr_status = ANY (ARRAY['pending'::text, 'running'::text, 'failed'::text]));


--
-- Name: idx_belege_status; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_belege_status ON public.belege USING btree (status);


--
-- Name: idx_belege_verdacht_duplikat; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_belege_verdacht_duplikat ON public.belege USING btree (verdacht_duplikat_beleg_id) WHERE (verdacht_duplikat_beleg_id IS NOT NULL);


--
-- Name: idx_blocked_dates_product; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_blocked_dates_product ON public.product_blocked_dates USING btree (product_id, start_date, end_date);


--
-- Name: idx_blog_comments_post; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_blog_comments_post ON public.blog_comments USING btree (post_id);


--
-- Name: idx_blog_comments_status; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_blog_comments_status ON public.blog_comments USING btree (status);


--
-- Name: idx_blog_posts_published_at; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_blog_posts_published_at ON public.blog_posts USING btree (published_at DESC);


--
-- Name: idx_blog_posts_scheduled; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_blog_posts_scheduled ON public.blog_posts USING btree (scheduled_at) WHERE (status = 'scheduled'::text);


--
-- Name: idx_blog_posts_series; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_blog_posts_series ON public.blog_posts USING btree (series_id) WHERE (series_id IS NOT NULL);


--
-- Name: idx_blog_posts_slug; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_blog_posts_slug ON public.blog_posts USING btree (slug);


--
-- Name: idx_blog_posts_status; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_blog_posts_status ON public.blog_posts USING btree (status);


--
-- Name: idx_blog_posts_status_created; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_blog_posts_status_created ON public.blog_posts USING btree (status, created_at DESC);


--
-- Name: idx_blog_schedule_date; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_blog_schedule_date ON public.blog_schedule USING btree (scheduled_date);


--
-- Name: idx_blog_schedule_status; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_blog_schedule_status ON public.blog_schedule USING btree (status);


--
-- Name: idx_blog_series_parts_series; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_blog_series_parts_series ON public.blog_series_parts USING btree (series_id);


--
-- Name: idx_blog_series_status; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_blog_series_status ON public.blog_series USING btree (status);


--
-- Name: idx_booking_interest_created; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_booking_interest_created ON public.booking_interest USING btree (created_at DESC);


--
-- Name: idx_booking_interest_product; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_booking_interest_product ON public.booking_interest USING btree (product_id);


--
-- Name: idx_bookings_accessories; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_bookings_accessories ON public.bookings USING gin (accessories);


--
-- Name: idx_bookings_accessory_unit_ids; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_bookings_accessory_unit_ids ON public.bookings USING gin (accessory_unit_ids);


--
-- Name: idx_bookings_created_at; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_bookings_created_at ON public.bookings USING btree (created_at DESC);


--
-- Name: idx_bookings_deleted_at; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_bookings_deleted_at ON public.bookings USING btree (deleted_at) WHERE (deleted_at IS NOT NULL);


--
-- Name: idx_bookings_deposit_intent; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_bookings_deposit_intent ON public.bookings USING btree (deposit_intent_id) WHERE (deposit_intent_id IS NOT NULL);


--
-- Name: idx_bookings_handover_completed_at; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_bookings_handover_completed_at ON public.bookings USING btree (((handover_data ->> 'completedAt'::text))) WHERE (handover_data IS NOT NULL);


--
-- Name: idx_bookings_is_test; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_bookings_is_test ON public.bookings USING btree (is_test) WHERE (is_test = true);


--
-- Name: idx_bookings_product_period; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_bookings_product_period ON public.bookings USING btree (product_id, rental_from, rental_to);


--
-- Name: idx_bookings_return_arrived_pending; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_bookings_return_arrived_pending ON public.bookings USING btree (delivery_mode, status) WHERE (return_arrived_at IS NULL);


--
-- Name: idx_bookings_suspicious; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_bookings_suspicious ON public.bookings USING btree (suspicious) WHERE (suspicious = true);


--
-- Name: idx_bookings_unit_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_bookings_unit_id ON public.bookings USING btree (unit_id);


--
-- Name: idx_bookings_user_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_bookings_user_id ON public.bookings USING btree (user_id);


--
-- Name: idx_bookings_verification_pending; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_bookings_verification_pending ON public.bookings USING btree (rental_from) WHERE ((verification_required = true) AND (verification_gate_passed_at IS NULL));


--
-- Name: idx_bookings_verification_rental_from; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_bookings_verification_rental_from ON public.bookings USING btree (rental_from) WHERE (verification_required = true);


--
-- Name: idx_calendar_notes_date; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_calendar_notes_date ON public.calendar_notes USING btree (note_date);


--
-- Name: idx_client_errors_created_at; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_client_errors_created_at ON public.client_errors USING btree (created_at DESC);


--
-- Name: idx_client_errors_digest; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_client_errors_digest ON public.client_errors USING btree (digest) WHERE (digest IS NOT NULL);


--
-- Name: idx_client_errors_url; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_client_errors_url ON public.client_errors USING btree (url) WHERE (url IS NOT NULL);


--
-- Name: idx_conversations_assigned_admin; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_conversations_assigned_admin ON public.conversations USING btree (assigned_admin_user_id) WHERE (assigned_admin_user_id IS NOT NULL);


--
-- Name: idx_conversations_customer; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_conversations_customer ON public.conversations USING btree (customer_id);


--
-- Name: idx_conversations_customer_email; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_conversations_customer_email ON public.conversations USING btree (lower(customer_email)) WHERE (customer_email IS NOT NULL);


--
-- Name: idx_conversations_last_message; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_conversations_last_message ON public.conversations USING btree (last_message_at DESC);


--
-- Name: idx_credit_notes_booking; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_credit_notes_booking ON public.credit_notes USING btree (booking_id);


--
-- Name: idx_credit_notes_created; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_credit_notes_created ON public.credit_notes USING btree (created_at);


--
-- Name: idx_credit_notes_internal_beleg_no; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_credit_notes_internal_beleg_no ON public.credit_notes USING btree (internal_beleg_no) WHERE (internal_beleg_no IS NOT NULL);


--
-- Name: idx_credit_notes_invoice; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_credit_notes_invoice ON public.credit_notes USING btree (invoice_id);


--
-- Name: idx_credit_notes_is_test; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_credit_notes_is_test ON public.credit_notes USING btree (is_test) WHERE (is_test = true);


--
-- Name: idx_credit_notes_status; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_credit_notes_status ON public.credit_notes USING btree (status);


--
-- Name: idx_customer_push_email; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_customer_push_email ON public.customer_push_subscriptions USING btree (lower(email)) WHERE (email IS NOT NULL);


--
-- Name: idx_customer_push_user; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_customer_push_user ON public.customer_push_subscriptions USING btree (user_id);


--
-- Name: idx_customer_ugc_booking; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_customer_ugc_booking ON public.customer_ugc_submissions USING btree (booking_id);


--
-- Name: idx_customer_ugc_featured; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_customer_ugc_featured ON public.customer_ugc_submissions USING btree (featured_at DESC) WHERE (featured_at IS NOT NULL);


--
-- Name: idx_customer_ugc_status; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_customer_ugc_status ON public.customer_ugc_submissions USING btree (status, created_at DESC);


--
-- Name: idx_customer_ugc_unique_active; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX idx_customer_ugc_unique_active ON public.customer_ugc_submissions USING btree (booking_id) WHERE (status = ANY (ARRAY['pending'::text, 'approved'::text, 'featured'::text]));


--
-- Name: idx_customer_ugc_user; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_customer_ugc_user ON public.customer_ugc_submissions USING btree (user_id);


--
-- Name: idx_damage_reports_accessory_unit; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_damage_reports_accessory_unit ON public.damage_reports USING btree (accessory_unit_id) WHERE (accessory_unit_id IS NOT NULL);


--
-- Name: idx_damage_reports_booking_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_damage_reports_booking_id ON public.damage_reports USING btree (booking_id);


--
-- Name: idx_damage_reports_camera_unit_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_damage_reports_camera_unit_id ON public.damage_reports USING btree (camera_unit_id) WHERE (camera_unit_id IS NOT NULL);


--
-- Name: idx_damage_reports_created_at; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_damage_reports_created_at ON public.damage_reports USING btree (created_at DESC);


--
-- Name: idx_damage_reports_status; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_damage_reports_status ON public.damage_reports USING btree (status);


--
-- Name: idx_dunning_invoice; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_dunning_invoice ON public.dunning_notices USING btree (invoice_id);


--
-- Name: idx_dunning_level; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_dunning_level ON public.dunning_notices USING btree (level);


--
-- Name: idx_dunning_status; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_dunning_status ON public.dunning_notices USING btree (status);


--
-- Name: idx_email_log_booking_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_email_log_booking_id ON public.email_log USING btree (booking_id);


--
-- Name: idx_email_log_booking_type; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_email_log_booking_type ON public.email_log USING btree (booking_id, email_type);


--
-- Name: idx_email_log_is_test; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_email_log_is_test ON public.email_log USING btree (is_test) WHERE (is_test = true);


--
-- Name: idx_email_log_sent_at; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_email_log_sent_at ON public.email_log USING btree (sent_at DESC);


--
-- Name: idx_employee_appointments_pending_reminder; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_employee_appointments_pending_reminder ON public.employee_appointments USING btree (starts_at) WHERE ((reminder_minutes_before IS NOT NULL) AND (reminder_sent_at IS NULL));


--
-- Name: idx_employee_appointments_series; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_employee_appointments_series ON public.employee_appointments USING btree (series_id) WHERE (series_id IS NOT NULL);


--
-- Name: idx_employee_appointments_shared; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_employee_appointments_shared ON public.employee_appointments USING gin (shared_with);


--
-- Name: idx_employee_appointments_user_starts; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_employee_appointments_user_starts ON public.employee_appointments USING btree (admin_user_id, starts_at);


--
-- Name: idx_employee_notes_shared_read; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_employee_notes_shared_read ON public.employee_notes USING gin (shared_read);


--
-- Name: idx_employee_notes_shared_with; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_employee_notes_shared_with ON public.employee_notes USING gin (shared_with);


--
-- Name: idx_employee_notes_user; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_employee_notes_user ON public.employee_notes USING btree (admin_user_id, pinned DESC, updated_at DESC);


--
-- Name: idx_expenses_account_code; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_expenses_account_code ON public.expenses USING btree (account_code) WHERE (account_code IS NOT NULL);


--
-- Name: idx_expenses_asset; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_expenses_asset ON public.expenses USING btree (asset_id);


--
-- Name: idx_expenses_category; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_expenses_category ON public.expenses USING btree (category);


--
-- Name: idx_expenses_category_active; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_expenses_category_active ON public.expenses USING btree (category) WHERE (deleted_at IS NULL);


--
-- Name: idx_expenses_date; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_expenses_date ON public.expenses USING btree (expense_date);


--
-- Name: idx_expenses_internal_beleg_no; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_expenses_internal_beleg_no ON public.expenses USING btree (internal_beleg_no) WHERE (internal_beleg_no IS NOT NULL);


--
-- Name: idx_expenses_is_test; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_expenses_is_test ON public.expenses USING btree (is_test) WHERE (is_test = true);


--
-- Name: idx_expenses_purchase_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_expenses_purchase_id ON public.expenses USING btree (purchase_id) WHERE (purchase_id IS NOT NULL);


--
-- Name: idx_expenses_source; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX idx_expenses_source ON public.expenses USING btree (source_type, source_id) WHERE (source_type IS NOT NULL);


--
-- Name: idx_export_log_date; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_export_log_date ON public.export_log USING btree (exported_at);


--
-- Name: idx_export_log_type; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_export_log_type ON public.export_log USING btree (export_type);


--
-- Name: idx_favorites_product; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_favorites_product ON public.favorites USING btree (product_id);


--
-- Name: idx_favorites_user; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_favorites_user ON public.favorites USING btree (user_id);


--
-- Name: idx_firmware_checks_last_changed; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_firmware_checks_last_changed ON public.firmware_checks USING btree (last_changed_at DESC NULLS LAST);


--
-- Name: idx_firmware_checks_status; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_firmware_checks_status ON public.firmware_checks USING btree (status);


--
-- Name: idx_inv_verkn_position; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_inv_verkn_position ON public.inventar_verknuepfung USING btree (beleg_position_id);


--
-- Name: idx_inv_verkn_unit; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_inv_verkn_unit ON public.inventar_verknuepfung USING btree (inventar_unit_id);


--
-- Name: idx_inventar_code_segmente_typ; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_inventar_code_segmente_typ ON public.inventar_code_segmente USING btree (typ);


--
-- Name: idx_inventar_units_beleg_status; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_inventar_units_beleg_status ON public.inventar_units USING btree (beleg_status);


--
-- Name: idx_inventar_units_produkt; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_inventar_units_produkt ON public.inventar_units USING btree (produkt_id);


--
-- Name: idx_inventar_units_seriennummer; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_inventar_units_seriennummer ON public.inventar_units USING btree (seriennummer) WHERE (seriennummer IS NOT NULL);


--
-- Name: idx_inventar_units_status; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_inventar_units_status ON public.inventar_units USING btree (status);


--
-- Name: idx_inventar_units_typ; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_inventar_units_typ ON public.inventar_units USING btree (typ);


--
-- Name: idx_inventar_verknuepfung_beleg_position; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_inventar_verknuepfung_beleg_position ON public.inventar_verknuepfung USING btree (beleg_position_id);


--
-- Name: idx_inventory_product; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_inventory_product ON public.product_inventory USING btree (product_id, status);


--
-- Name: idx_invoice_versions_booking; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_invoice_versions_booking ON public.invoice_versions USING btree (booking_id, version_number);


--
-- Name: idx_invoices_account_code; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_invoices_account_code ON public.invoices USING btree (account_code) WHERE (account_code IS NOT NULL);


--
-- Name: idx_invoices_booking_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_invoices_booking_id ON public.invoices USING btree (booking_id);


--
-- Name: idx_invoices_due_date; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_invoices_due_date ON public.invoices USING btree (due_date);


--
-- Name: idx_invoices_internal_beleg_no; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_invoices_internal_beleg_no ON public.invoices USING btree (internal_beleg_no) WHERE (internal_beleg_no IS NOT NULL);


--
-- Name: idx_invoices_invoice_date; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_invoices_invoice_date ON public.invoices USING btree (invoice_date);


--
-- Name: idx_invoices_is_test; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_invoices_is_test ON public.invoices USING btree (is_test) WHERE (is_test = true);


--
-- Name: idx_invoices_payment_status; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_invoices_payment_status ON public.invoices USING btree (payment_status);


--
-- Name: idx_invoices_status; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_invoices_status ON public.invoices USING btree (status);


--
-- Name: idx_invoices_test_date; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_invoices_test_date ON public.invoices USING btree (is_test, invoice_date DESC);


--
-- Name: idx_legal_documents_slug; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_legal_documents_slug ON public.legal_documents USING btree (slug);


--
-- Name: idx_legal_versions_current; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_legal_versions_current ON public.legal_document_versions USING btree (document_id) WHERE (is_current = true);


--
-- Name: idx_legal_versions_doc_version; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_legal_versions_doc_version ON public.legal_document_versions USING btree (document_id, version_number DESC);


--
-- Name: idx_lieferanten_name; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_lieferanten_name ON public.lieferanten USING btree (name);


--
-- Name: idx_message_attachments_message; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_message_attachments_message ON public.message_attachments USING btree (message_id);


--
-- Name: idx_messages_conversation; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_messages_conversation ON public.messages USING btree (conversation_id, created_at);


--
-- Name: idx_messages_email_message_id; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX idx_messages_email_message_id ON public.messages USING btree (email_message_id) WHERE (email_message_id IS NOT NULL);


--
-- Name: idx_messages_sender; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_messages_sender ON public.messages USING btree (sender_id);


--
-- Name: idx_messages_unread; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_messages_unread ON public.messages USING btree (read) WHERE (read = false);


--
-- Name: idx_newsletter_confirm_token; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_newsletter_confirm_token ON public.newsletter_subscribers USING btree (confirm_token) WHERE (confirm_token IS NOT NULL);


--
-- Name: idx_newsletter_email_lower; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_newsletter_email_lower ON public.newsletter_subscribers USING btree (lower(email));


--
-- Name: idx_newsletter_unique_confirmed; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX idx_newsletter_unique_confirmed ON public.newsletter_subscribers USING btree (lower(email)) WHERE ((confirmed = true) AND (unsubscribed = false));


--
-- Name: idx_newsletter_unsubscribe_token; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_newsletter_unsubscribe_token ON public.newsletter_subscribers USING btree (unsubscribe_token);


--
-- Name: idx_page_views_country; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_page_views_country ON public.page_views USING btree (country);


--
-- Name: idx_page_views_country_region; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_page_views_country_region ON public.page_views USING btree (country, region);


--
-- Name: idx_page_views_created_at; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_page_views_created_at ON public.page_views USING btree (created_at DESC);


--
-- Name: idx_page_views_path; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_page_views_path ON public.page_views USING btree (path);


--
-- Name: idx_page_views_session_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_page_views_session_id ON public.page_views USING btree (session_id);


--
-- Name: idx_page_views_visitor_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_page_views_visitor_id ON public.page_views USING btree (visitor_id);


--
-- Name: idx_product_units_label; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_product_units_label ON public.product_units USING btree (label);


--
-- Name: idx_product_units_product_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_product_units_product_id ON public.product_units USING btree (product_id);


--
-- Name: idx_produkte_name; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_produkte_name ON public.produkte USING btree (name);


--
-- Name: idx_profiles_blacklisted; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_profiles_blacklisted ON public.profiles USING btree (blacklisted) WHERE (blacklisted = true);


--
-- Name: idx_profiles_deactivated_at; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_profiles_deactivated_at ON public.profiles USING btree (deactivated_at) WHERE (deactivated_at IS NOT NULL);


--
-- Name: idx_profiles_deleted_at; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_profiles_deleted_at ON public.profiles USING btree (deleted_at) WHERE (deleted_at IS NOT NULL);


--
-- Name: idx_profiles_inactive_warning; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_profiles_inactive_warning ON public.profiles USING btree (inactive_warning_sent_at) WHERE (inactive_warning_sent_at IS NOT NULL);


--
-- Name: idx_profiles_unverified_warning; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_profiles_unverified_warning ON public.profiles USING btree (unverified_warning_sent_at) WHERE (unverified_warning_sent_at IS NOT NULL);


--
-- Name: idx_profiles_verification_status; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_profiles_verification_status ON public.profiles USING btree (verification_status);


--
-- Name: idx_purchase_attachments_purchase; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_purchase_attachments_purchase ON public.purchase_attachments USING btree (purchase_id);


--
-- Name: idx_purchase_items_account_code; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_purchase_items_account_code ON public.purchase_items USING btree (account_code) WHERE (account_code IS NOT NULL);


--
-- Name: idx_purchase_items_asset; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_purchase_items_asset ON public.purchase_items USING btree (asset_id);


--
-- Name: idx_purchase_items_classification; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_purchase_items_classification ON public.purchase_items USING btree (classification);


--
-- Name: idx_purchase_items_expense; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_purchase_items_expense ON public.purchase_items USING btree (expense_id);


--
-- Name: idx_purchase_items_purchase; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_purchase_items_purchase ON public.purchase_items USING btree (purchase_id);


--
-- Name: idx_purchases_internal_beleg_no; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_purchases_internal_beleg_no ON public.purchases USING btree (internal_beleg_no) WHERE (internal_beleg_no IS NOT NULL);


--
-- Name: idx_purchases_is_test; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_purchases_is_test ON public.purchases USING btree (is_test) WHERE (is_test = true);


--
-- Name: idx_purchases_order_date; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_purchases_order_date ON public.purchases USING btree (order_date);


--
-- Name: idx_purchases_supplier; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_purchases_supplier ON public.purchases USING btree (supplier_id);


--
-- Name: idx_push_subscriptions_user; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_push_subscriptions_user ON public.push_subscriptions USING btree (admin_user_id);


--
-- Name: idx_rental_agreements_booking_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_rental_agreements_booking_id ON public.rental_agreements USING btree (booking_id);


--
-- Name: idx_return_checklists_booking; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_return_checklists_booking ON public.return_checklists USING btree (booking_id);


--
-- Name: idx_return_checklists_status; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_return_checklists_status ON public.return_checklists USING btree (status);


--
-- Name: idx_reviews_booking_id; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX idx_reviews_booking_id ON public.reviews USING btree (booking_id);


--
-- Name: idx_reviews_product_approved; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_reviews_product_approved ON public.reviews USING btree (product_id) WHERE (approved = true);


--
-- Name: idx_reviews_user_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_reviews_user_id ON public.reviews USING btree (user_id);


--
-- Name: idx_sets_basic_for_product_ids; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_sets_basic_for_product_ids ON public.sets USING gin (basic_for_product_ids);


--
-- Name: idx_shop_page_content_page; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_shop_page_content_page ON public.shop_page_content USING btree (page);


--
-- Name: idx_social_posts_status_sched; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_social_posts_status_sched ON public.social_posts USING btree (status, scheduled_at);


--
-- Name: idx_social_reel_segments_kind; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_social_reel_segments_kind ON public.social_reel_segments USING btree (kind);


--
-- Name: idx_social_reel_segments_reel_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_social_reel_segments_reel_id ON public.social_reel_segments USING btree (reel_id);


--
-- Name: idx_stripe_transactions_is_test; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_stripe_transactions_is_test ON public.stripe_transactions USING btree (is_test) WHERE (is_test = true);


--
-- Name: idx_stripe_tx_booking; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_stripe_tx_booking ON public.stripe_transactions USING btree (booking_id);


--
-- Name: idx_stripe_tx_created; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_stripe_tx_created ON public.stripe_transactions USING btree (stripe_created_at);


--
-- Name: idx_stripe_tx_match; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_stripe_tx_match ON public.stripe_transactions USING btree (match_status);


--
-- Name: idx_waitlist_product_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_waitlist_product_id ON public.waitlist_subscriptions USING btree (product_id);


--
-- Name: push_subscriptions_created_at_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX push_subscriptions_created_at_idx ON public.push_subscriptions USING btree (created_at DESC);


--
-- Name: referrals_code_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX referrals_code_idx ON public.referrals USING btree (referral_code);


--
-- Name: referrals_referrer_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX referrals_referrer_idx ON public.referrals USING btree (referrer_user_id);


--
-- Name: social_accounts_active_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX social_accounts_active_idx ON public.social_accounts USING btree (is_active) WHERE (is_active = true);


--
-- Name: social_editorial_plan_date_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX social_editorial_plan_date_idx ON public.social_editorial_plan USING btree (scheduled_date, scheduled_time);


--
-- Name: social_editorial_plan_generating_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX social_editorial_plan_generating_idx ON public.social_editorial_plan USING btree (generated_at) WHERE (status = 'generating'::text);


--
-- Name: social_editorial_plan_status_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX social_editorial_plan_status_idx ON public.social_editorial_plan USING btree (status) WHERE (status = ANY (ARRAY['planned'::text, 'generated'::text, 'reviewed'::text]));


--
-- Name: social_insights_post_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX social_insights_post_idx ON public.social_insights USING btree (post_id);


--
-- Name: social_posts_published_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX social_posts_published_idx ON public.social_posts USING btree (published_at DESC) WHERE (status = 'published'::text);


--
-- Name: social_posts_scheduled_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX social_posts_scheduled_idx ON public.social_posts USING btree (scheduled_at) WHERE (status = 'scheduled'::text);


--
-- Name: social_posts_source_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX social_posts_source_idx ON public.social_posts USING btree (source_type, source_id);


--
-- Name: social_posts_status_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX social_posts_status_idx ON public.social_posts USING btree (status);


--
-- Name: social_reel_music_default_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX social_reel_music_default_idx ON public.social_reel_music USING btree (is_default) WHERE (is_default = true);


--
-- Name: social_reel_music_mood_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX social_reel_music_mood_idx ON public.social_reel_music USING btree (mood);


--
-- Name: social_reel_plan_date_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX social_reel_plan_date_idx ON public.social_reel_plan USING btree (scheduled_date);


--
-- Name: social_reel_plan_status_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX social_reel_plan_status_idx ON public.social_reel_plan USING btree (status);


--
-- Name: social_reels_created_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX social_reels_created_idx ON public.social_reels USING btree (created_at DESC);


--
-- Name: social_reels_is_test_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX social_reels_is_test_idx ON public.social_reels USING btree (is_test);


--
-- Name: social_reels_music_id_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX social_reels_music_id_idx ON public.social_reels USING btree (music_id);


--
-- Name: social_reels_scheduled_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX social_reels_scheduled_idx ON public.social_reels USING btree (scheduled_at) WHERE (scheduled_at IS NOT NULL);


--
-- Name: social_reels_status_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX social_reels_status_idx ON public.social_reels USING btree (status);


--
-- Name: social_schedule_next_run_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX social_schedule_next_run_idx ON public.social_schedule USING btree (next_run_at) WHERE (is_active = true);


--
-- Name: social_series_parts_series_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX social_series_parts_series_idx ON public.social_series_parts USING btree (series_id, part_number);


--
-- Name: social_topics_open_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX social_topics_open_idx ON public.social_topics USING btree (created_at DESC) WHERE (used = false);


--
-- Name: uniq_invoice_versions_current; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX uniq_invoice_versions_current ON public.invoice_versions USING btree (booking_id) WHERE is_current;


--
-- Name: waitlist_subscriptions_created_at_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX waitlist_subscriptions_created_at_idx ON public.waitlist_subscriptions USING btree (created_at DESC);


--
-- Name: waitlist_subscriptions_product_id_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX waitlist_subscriptions_product_id_idx ON public.waitlist_subscriptions USING btree (product_id);


--
-- Name: admin_config set_admin_config_timestamp; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER set_admin_config_timestamp BEFORE UPDATE ON public.admin_config FOR EACH ROW EXECUTE FUNCTION public.update_admin_config_timestamp();


--
-- Name: social_accounts social_accounts_updated_at; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER social_accounts_updated_at BEFORE UPDATE ON public.social_accounts FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();


--
-- Name: social_editorial_plan social_editorial_plan_updated_at; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER social_editorial_plan_updated_at BEFORE UPDATE ON public.social_editorial_plan FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();


--
-- Name: social_posts social_posts_updated_at; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER social_posts_updated_at BEFORE UPDATE ON public.social_posts FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();


--
-- Name: social_reel_music social_reel_music_updated_at; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER social_reel_music_updated_at BEFORE UPDATE ON public.social_reel_music FOR EACH ROW EXECUTE FUNCTION public.set_updated_at_reels();


--
-- Name: social_reel_plan social_reel_plan_updated_at; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER social_reel_plan_updated_at BEFORE UPDATE ON public.social_reel_plan FOR EACH ROW EXECUTE FUNCTION public.set_updated_at_reels();


--
-- Name: social_reel_templates social_reel_templates_updated_at; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER social_reel_templates_updated_at BEFORE UPDATE ON public.social_reel_templates FOR EACH ROW EXECUTE FUNCTION public.set_updated_at_reels();


--
-- Name: social_reels social_reels_updated_at; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER social_reels_updated_at BEFORE UPDATE ON public.social_reels FOR EACH ROW EXECUTE FUNCTION public.set_updated_at_reels();


--
-- Name: social_schedule social_schedule_updated_at; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER social_schedule_updated_at BEFORE UPDATE ON public.social_schedule FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();


--
-- Name: social_series social_series_updated_at; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER social_series_updated_at BEFORE UPDATE ON public.social_series FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();


--
-- Name: social_templates social_templates_updated_at; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER social_templates_updated_at BEFORE UPDATE ON public.social_templates FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();


--
-- Name: accessory_units trg_accessory_units_updated_at; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER trg_accessory_units_updated_at BEFORE UPDATE ON public.accessory_units FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();


--
-- Name: admin_users trg_admin_users_updated_at; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER trg_admin_users_updated_at BEFORE UPDATE ON public.admin_users FOR EACH ROW EXECUTE FUNCTION public.touch_admin_users_updated_at();


--
-- Name: assets_neu trg_assets_neu_updated_at; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER trg_assets_neu_updated_at BEFORE UPDATE ON public.assets_neu FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();


--
-- Name: assets trg_assets_updated_at; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER trg_assets_updated_at BEFORE UPDATE ON public.assets FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();


--
-- Name: beleg_positionen trg_beleg_positionen_updated_at; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER trg_beleg_positionen_updated_at BEFORE UPDATE ON public.beleg_positionen FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();


--
-- Name: belege trg_belege_updated_at; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER trg_belege_updated_at BEFORE UPDATE ON public.belege FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();


--
-- Name: customer_ugc_submissions trg_customer_ugc_updated_at; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER trg_customer_ugc_updated_at BEFORE UPDATE ON public.customer_ugc_submissions FOR EACH ROW EXECUTE FUNCTION public.customer_ugc_set_updated_at();


--
-- Name: employee_appointments trg_employee_appointments_updated_at; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER trg_employee_appointments_updated_at BEFORE UPDATE ON public.employee_appointments FOR EACH ROW EXECUTE FUNCTION public.touch_employee_personal_updated_at();


--
-- Name: employee_notes trg_employee_notes_updated_at; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER trg_employee_notes_updated_at BEFORE UPDATE ON public.employee_notes FOR EACH ROW EXECUTE FUNCTION public.touch_employee_personal_updated_at();


--
-- Name: profiles trg_generate_referral_code; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER trg_generate_referral_code BEFORE INSERT ON public.profiles FOR EACH ROW EXECUTE FUNCTION public.generate_referral_code();


--
-- Name: inventar_code_segmente trg_inventar_code_segmente_updated_at; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER trg_inventar_code_segmente_updated_at BEFORE UPDATE ON public.inventar_code_segmente FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();


--
-- Name: inventar_units trg_inventar_units_updated_at; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER trg_inventar_units_updated_at BEFORE UPDATE ON public.inventar_units FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();


--
-- Name: lieferanten trg_lieferanten_updated_at; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER trg_lieferanten_updated_at BEFORE UPDATE ON public.lieferanten FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();


--
-- Name: newsletter_subscribers trg_newsletter_updated_at; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER trg_newsletter_updated_at BEFORE UPDATE ON public.newsletter_subscribers FOR EACH ROW EXECUTE FUNCTION public.newsletter_subscribers_set_updated_at();


--
-- Name: admin_audit_log trg_prevent_audit_log_delete; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER trg_prevent_audit_log_delete BEFORE DELETE ON public.admin_audit_log FOR EACH ROW EXECUTE FUNCTION public.prevent_audit_log_mutation();


--
-- Name: admin_audit_log trg_prevent_audit_log_update; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER trg_prevent_audit_log_update BEFORE UPDATE ON public.admin_audit_log FOR EACH ROW EXECUTE FUNCTION public.prevent_audit_log_mutation();


--
-- Name: purchases trg_purchases_updated_at; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER trg_purchases_updated_at BEFORE UPDATE ON public.purchases FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();


--
-- Name: shop_page_content trg_shop_page_content_updated; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER trg_shop_page_content_updated BEFORE UPDATE ON public.shop_page_content FOR EACH ROW EXECUTE FUNCTION public.update_shop_page_content_timestamp();


--
-- Name: suppliers trg_suppliers_updated_at; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER trg_suppliers_updated_at BEFORE UPDATE ON public.suppliers FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();


--
-- Name: social_reel_segments trigger_social_reel_segments_updated_at; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER trigger_social_reel_segments_updated_at BEFORE UPDATE ON public.social_reel_segments FOR EACH ROW EXECUTE FUNCTION public.social_reel_segments_set_updated_at();


--
-- Name: accessory_units accessory_units_accessory_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.accessory_units
    ADD CONSTRAINT accessory_units_accessory_id_fkey FOREIGN KEY (accessory_id) REFERENCES public.accessories(id) ON UPDATE CASCADE ON DELETE CASCADE;


--
-- Name: admin_customer_notes admin_customer_notes_customer_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.admin_customer_notes
    ADD CONSTRAINT admin_customer_notes_customer_id_fkey FOREIGN KEY (customer_id) REFERENCES public.profiles(id) ON DELETE CASCADE;


--
-- Name: admin_sessions admin_sessions_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.admin_sessions
    ADD CONSTRAINT admin_sessions_user_id_fkey FOREIGN KEY (user_id) REFERENCES public.admin_users(id) ON DELETE CASCADE;


--
-- Name: admin_users admin_users_created_by_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.admin_users
    ADD CONSTRAINT admin_users_created_by_fkey FOREIGN KEY (created_by) REFERENCES public.admin_users(id) ON DELETE SET NULL;


--
-- Name: afa_buchungen afa_buchungen_asset_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.afa_buchungen
    ADD CONSTRAINT afa_buchungen_asset_id_fkey FOREIGN KEY (asset_id) REFERENCES public.assets_neu(id) ON DELETE CASCADE;


--
-- Name: assets assets_accessory_unit_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.assets
    ADD CONSTRAINT assets_accessory_unit_id_fkey FOREIGN KEY (accessory_unit_id) REFERENCES public.accessory_units(id) ON DELETE SET NULL;


--
-- Name: assets_neu assets_neu_beleg_position_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.assets_neu
    ADD CONSTRAINT assets_neu_beleg_position_id_fkey FOREIGN KEY (beleg_position_id) REFERENCES public.beleg_positionen(id) ON DELETE CASCADE;


--
-- Name: assets assets_purchase_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.assets
    ADD CONSTRAINT assets_purchase_id_fkey FOREIGN KEY (purchase_id) REFERENCES public.purchases(id) ON DELETE SET NULL;


--
-- Name: assets assets_supplier_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.assets
    ADD CONSTRAINT assets_supplier_id_fkey FOREIGN KEY (supplier_id) REFERENCES public.suppliers(id) ON DELETE SET NULL;


--
-- Name: assets assets_unit_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.assets
    ADD CONSTRAINT assets_unit_id_fkey FOREIGN KEY (unit_id) REFERENCES public.product_units(id) ON DELETE SET NULL;


--
-- Name: beleg_anhaenge beleg_anhaenge_beleg_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.beleg_anhaenge
    ADD CONSTRAINT beleg_anhaenge_beleg_id_fkey FOREIGN KEY (beleg_id) REFERENCES public.belege(id) ON DELETE CASCADE;


--
-- Name: beleg_positionen beleg_positionen_beleg_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.beleg_positionen
    ADD CONSTRAINT beleg_positionen_beleg_id_fkey FOREIGN KEY (beleg_id) REFERENCES public.belege(id) ON DELETE CASCADE;


--
-- Name: beleg_positionen beleg_positionen_folgekosten_asset_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.beleg_positionen
    ADD CONSTRAINT beleg_positionen_folgekosten_asset_id_fkey FOREIGN KEY (folgekosten_asset_id) REFERENCES public.assets_neu(id) ON DELETE SET NULL;


--
-- Name: belege belege_lieferant_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.belege
    ADD CONSTRAINT belege_lieferant_id_fkey FOREIGN KEY (lieferant_id) REFERENCES public.lieferanten(id) ON DELETE RESTRICT;


--
-- Name: belege belege_verdacht_duplikat_beleg_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.belege
    ADD CONSTRAINT belege_verdacht_duplikat_beleg_id_fkey FOREIGN KEY (verdacht_duplikat_beleg_id) REFERENCES public.belege(id) ON DELETE SET NULL;


--
-- Name: blog_auto_topics blog_auto_topics_category_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.blog_auto_topics
    ADD CONSTRAINT blog_auto_topics_category_id_fkey FOREIGN KEY (category_id) REFERENCES public.blog_categories(id) ON DELETE SET NULL;


--
-- Name: blog_comments blog_comments_post_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.blog_comments
    ADD CONSTRAINT blog_comments_post_id_fkey FOREIGN KEY (post_id) REFERENCES public.blog_posts(id) ON DELETE CASCADE;


--
-- Name: blog_posts blog_posts_category_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.blog_posts
    ADD CONSTRAINT blog_posts_category_id_fkey FOREIGN KEY (category_id) REFERENCES public.blog_categories(id) ON DELETE SET NULL;


--
-- Name: blog_posts blog_posts_schedule_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.blog_posts
    ADD CONSTRAINT blog_posts_schedule_id_fkey FOREIGN KEY (schedule_id) REFERENCES public.blog_schedule(id) ON DELETE SET NULL;


--
-- Name: blog_posts blog_posts_series_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.blog_posts
    ADD CONSTRAINT blog_posts_series_id_fkey FOREIGN KEY (series_id) REFERENCES public.blog_series(id) ON DELETE SET NULL;


--
-- Name: blog_schedule blog_schedule_category_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.blog_schedule
    ADD CONSTRAINT blog_schedule_category_id_fkey FOREIGN KEY (category_id) REFERENCES public.blog_categories(id) ON DELETE SET NULL;


--
-- Name: blog_schedule blog_schedule_post_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.blog_schedule
    ADD CONSTRAINT blog_schedule_post_id_fkey FOREIGN KEY (post_id) REFERENCES public.blog_posts(id) ON DELETE SET NULL;


--
-- Name: blog_series blog_series_category_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.blog_series
    ADD CONSTRAINT blog_series_category_id_fkey FOREIGN KEY (category_id) REFERENCES public.blog_categories(id) ON DELETE SET NULL;


--
-- Name: blog_series_parts blog_series_parts_post_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.blog_series_parts
    ADD CONSTRAINT blog_series_parts_post_id_fkey FOREIGN KEY (post_id) REFERENCES public.blog_posts(id) ON DELETE SET NULL;


--
-- Name: blog_series_parts blog_series_parts_series_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.blog_series_parts
    ADD CONSTRAINT blog_series_parts_series_id_fkey FOREIGN KEY (series_id) REFERENCES public.blog_series(id) ON DELETE CASCADE;


--
-- Name: bookings bookings_unit_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.bookings
    ADD CONSTRAINT bookings_unit_id_fkey FOREIGN KEY (unit_id) REFERENCES public.product_units(id);


--
-- Name: bookings bookings_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.bookings
    ADD CONSTRAINT bookings_user_id_fkey FOREIGN KEY (user_id) REFERENCES auth.users(id);


--
-- Name: client_errors client_errors_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.client_errors
    ADD CONSTRAINT client_errors_user_id_fkey FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE SET NULL;


--
-- Name: conversations conversations_assigned_admin_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.conversations
    ADD CONSTRAINT conversations_assigned_admin_user_id_fkey FOREIGN KEY (assigned_admin_user_id) REFERENCES public.admin_users(id) ON DELETE SET NULL;


--
-- Name: conversations conversations_booking_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.conversations
    ADD CONSTRAINT conversations_booking_id_fkey FOREIGN KEY (booking_id) REFERENCES public.bookings(id);


--
-- Name: conversations conversations_customer_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.conversations
    ADD CONSTRAINT conversations_customer_id_fkey FOREIGN KEY (customer_id) REFERENCES auth.users(id) ON DELETE CASCADE;


--
-- Name: credit_notes credit_notes_invoice_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.credit_notes
    ADD CONSTRAINT credit_notes_invoice_id_fkey FOREIGN KEY (invoice_id) REFERENCES public.invoices(id);


--
-- Name: custom_sets custom_sets_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.custom_sets
    ADD CONSTRAINT custom_sets_user_id_fkey FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE;


--
-- Name: customer_push_subscriptions customer_push_subscriptions_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.customer_push_subscriptions
    ADD CONSTRAINT customer_push_subscriptions_user_id_fkey FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE SET NULL;


--
-- Name: customer_ugc_submissions customer_ugc_submissions_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.customer_ugc_submissions
    ADD CONSTRAINT customer_ugc_submissions_user_id_fkey FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE SET NULL;


--
-- Name: damage_reports damage_reports_accessory_unit_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.damage_reports
    ADD CONSTRAINT damage_reports_accessory_unit_id_fkey FOREIGN KEY (accessory_unit_id) REFERENCES public.accessory_units(id) ON DELETE SET NULL;


--
-- Name: damage_reports damage_reports_booking_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.damage_reports
    ADD CONSTRAINT damage_reports_booking_id_fkey FOREIGN KEY (booking_id) REFERENCES public.bookings(id) ON DELETE CASCADE;


--
-- Name: damage_reports damage_reports_camera_unit_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.damage_reports
    ADD CONSTRAINT damage_reports_camera_unit_id_fkey FOREIGN KEY (camera_unit_id) REFERENCES public.product_units(id);


--
-- Name: dunning_notices dunning_notices_invoice_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.dunning_notices
    ADD CONSTRAINT dunning_notices_invoice_id_fkey FOREIGN KEY (invoice_id) REFERENCES public.invoices(id);


--
-- Name: email_log email_log_booking_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.email_log
    ADD CONSTRAINT email_log_booking_id_fkey FOREIGN KEY (booking_id) REFERENCES public.bookings(id) ON DELETE CASCADE;


--
-- Name: employee_appointments employee_appointments_admin_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.employee_appointments
    ADD CONSTRAINT employee_appointments_admin_user_id_fkey FOREIGN KEY (admin_user_id) REFERENCES public.admin_users(id) ON DELETE CASCADE;


--
-- Name: employee_notes employee_notes_admin_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.employee_notes
    ADD CONSTRAINT employee_notes_admin_user_id_fkey FOREIGN KEY (admin_user_id) REFERENCES public.admin_users(id) ON DELETE CASCADE;


--
-- Name: expenses expenses_asset_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.expenses
    ADD CONSTRAINT expenses_asset_id_fkey FOREIGN KEY (asset_id) REFERENCES public.assets(id) ON DELETE SET NULL;


--
-- Name: expenses expenses_purchase_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.expenses
    ADD CONSTRAINT expenses_purchase_id_fkey FOREIGN KEY (purchase_id) REFERENCES public.purchases(id) ON DELETE SET NULL;


--
-- Name: favorites favorites_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.favorites
    ADD CONSTRAINT favorites_user_id_fkey FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE;


--
-- Name: legal_documents fk_legal_documents_current_version; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.legal_documents
    ADD CONSTRAINT fk_legal_documents_current_version FOREIGN KEY (current_version_id) REFERENCES public.legal_document_versions(id);


--
-- Name: inventar_units inventar_units_produkt_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.inventar_units
    ADD CONSTRAINT inventar_units_produkt_id_fkey FOREIGN KEY (produkt_id) REFERENCES public.produkte(id) ON DELETE SET NULL;


--
-- Name: inventar_verknuepfung inventar_verknuepfung_beleg_position_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.inventar_verknuepfung
    ADD CONSTRAINT inventar_verknuepfung_beleg_position_id_fkey FOREIGN KEY (beleg_position_id) REFERENCES public.beleg_positionen(id) ON DELETE CASCADE;


--
-- Name: inventar_verknuepfung inventar_verknuepfung_inventar_unit_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.inventar_verknuepfung
    ADD CONSTRAINT inventar_verknuepfung_inventar_unit_id_fkey FOREIGN KEY (inventar_unit_id) REFERENCES public.inventar_units(id) ON DELETE CASCADE;


--
-- Name: legal_document_versions legal_document_versions_document_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.legal_document_versions
    ADD CONSTRAINT legal_document_versions_document_id_fkey FOREIGN KEY (document_id) REFERENCES public.legal_documents(id) ON DELETE CASCADE;


--
-- Name: legal_document_versions legal_document_versions_published_by_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.legal_document_versions
    ADD CONSTRAINT legal_document_versions_published_by_fkey FOREIGN KEY (published_by) REFERENCES auth.users(id);


--
-- Name: message_attachments message_attachments_message_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.message_attachments
    ADD CONSTRAINT message_attachments_message_id_fkey FOREIGN KEY (message_id) REFERENCES public.messages(id) ON DELETE CASCADE;


--
-- Name: messages messages_conversation_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.messages
    ADD CONSTRAINT messages_conversation_id_fkey FOREIGN KEY (conversation_id) REFERENCES public.conversations(id) ON DELETE CASCADE;


--
-- Name: profiles profiles_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.profiles
    ADD CONSTRAINT profiles_id_fkey FOREIGN KEY (id) REFERENCES auth.users(id) ON DELETE CASCADE;


--
-- Name: purchase_attachments purchase_attachments_purchase_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.purchase_attachments
    ADD CONSTRAINT purchase_attachments_purchase_id_fkey FOREIGN KEY (purchase_id) REFERENCES public.purchases(id) ON DELETE CASCADE;


--
-- Name: purchase_items purchase_items_asset_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.purchase_items
    ADD CONSTRAINT purchase_items_asset_id_fkey FOREIGN KEY (asset_id) REFERENCES public.assets(id) ON DELETE SET NULL;


--
-- Name: purchase_items purchase_items_expense_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.purchase_items
    ADD CONSTRAINT purchase_items_expense_id_fkey FOREIGN KEY (expense_id) REFERENCES public.expenses(id) ON DELETE SET NULL;


--
-- Name: purchase_items purchase_items_purchase_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.purchase_items
    ADD CONSTRAINT purchase_items_purchase_id_fkey FOREIGN KEY (purchase_id) REFERENCES public.purchases(id) ON DELETE CASCADE;


--
-- Name: purchases purchases_supplier_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.purchases
    ADD CONSTRAINT purchases_supplier_id_fkey FOREIGN KEY (supplier_id) REFERENCES public.suppliers(id);


--
-- Name: push_subscriptions push_subscriptions_admin_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.push_subscriptions
    ADD CONSTRAINT push_subscriptions_admin_user_id_fkey FOREIGN KEY (admin_user_id) REFERENCES public.admin_users(id) ON DELETE CASCADE;


--
-- Name: referrals referrals_reward_coupon_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.referrals
    ADD CONSTRAINT referrals_reward_coupon_id_fkey FOREIGN KEY (reward_coupon_id) REFERENCES public.coupons(id);


--
-- Name: rental_agreements rental_agreements_booking_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.rental_agreements
    ADD CONSTRAINT rental_agreements_booking_id_fkey FOREIGN KEY (booking_id) REFERENCES public.bookings(id);


--
-- Name: return_checklists return_checklists_booking_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.return_checklists
    ADD CONSTRAINT return_checklists_booking_id_fkey FOREIGN KEY (booking_id) REFERENCES public.bookings(id);


--
-- Name: reviews reviews_booking_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.reviews
    ADD CONSTRAINT reviews_booking_id_fkey FOREIGN KEY (booking_id) REFERENCES public.bookings(id) ON DELETE CASCADE;


--
-- Name: social_accounts social_accounts_linked_account_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.social_accounts
    ADD CONSTRAINT social_accounts_linked_account_id_fkey FOREIGN KEY (linked_account_id) REFERENCES public.social_accounts(id) ON DELETE SET NULL;


--
-- Name: social_editorial_plan social_editorial_plan_post_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.social_editorial_plan
    ADD CONSTRAINT social_editorial_plan_post_id_fkey FOREIGN KEY (post_id) REFERENCES public.social_posts(id) ON DELETE SET NULL;


--
-- Name: social_editorial_plan social_editorial_plan_series_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.social_editorial_plan
    ADD CONSTRAINT social_editorial_plan_series_id_fkey FOREIGN KEY (series_id) REFERENCES public.social_series(id) ON DELETE SET NULL;


--
-- Name: social_editorial_plan social_editorial_plan_series_part_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.social_editorial_plan
    ADD CONSTRAINT social_editorial_plan_series_part_id_fkey FOREIGN KEY (series_part_id) REFERENCES public.social_series_parts(id) ON DELETE SET NULL;


--
-- Name: social_editorial_plan social_editorial_plan_template_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.social_editorial_plan
    ADD CONSTRAINT social_editorial_plan_template_id_fkey FOREIGN KEY (template_id) REFERENCES public.social_templates(id) ON DELETE SET NULL;


--
-- Name: social_insights social_insights_post_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.social_insights
    ADD CONSTRAINT social_insights_post_id_fkey FOREIGN KEY (post_id) REFERENCES public.social_posts(id) ON DELETE CASCADE;


--
-- Name: social_posts social_posts_fb_account_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.social_posts
    ADD CONSTRAINT social_posts_fb_account_id_fkey FOREIGN KEY (fb_account_id) REFERENCES public.social_accounts(id) ON DELETE SET NULL;


--
-- Name: social_posts social_posts_ig_account_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.social_posts
    ADD CONSTRAINT social_posts_ig_account_id_fkey FOREIGN KEY (ig_account_id) REFERENCES public.social_accounts(id) ON DELETE SET NULL;


--
-- Name: social_posts social_posts_template_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.social_posts
    ADD CONSTRAINT social_posts_template_id_fkey FOREIGN KEY (template_id) REFERENCES public.social_templates(id) ON DELETE SET NULL;


--
-- Name: social_reel_plan social_reel_plan_reel_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.social_reel_plan
    ADD CONSTRAINT social_reel_plan_reel_id_fkey FOREIGN KEY (reel_id) REFERENCES public.social_reels(id) ON DELETE SET NULL;


--
-- Name: social_reel_plan social_reel_plan_template_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.social_reel_plan
    ADD CONSTRAINT social_reel_plan_template_id_fkey FOREIGN KEY (template_id) REFERENCES public.social_reel_templates(id) ON DELETE SET NULL;


--
-- Name: social_reel_segments social_reel_segments_reel_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.social_reel_segments
    ADD CONSTRAINT social_reel_segments_reel_id_fkey FOREIGN KEY (reel_id) REFERENCES public.social_reels(id) ON DELETE CASCADE;


--
-- Name: social_reels social_reels_fb_account_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.social_reels
    ADD CONSTRAINT social_reels_fb_account_id_fkey FOREIGN KEY (fb_account_id) REFERENCES public.social_accounts(id) ON DELETE SET NULL;


--
-- Name: social_reels social_reels_ig_account_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.social_reels
    ADD CONSTRAINT social_reels_ig_account_id_fkey FOREIGN KEY (ig_account_id) REFERENCES public.social_accounts(id) ON DELETE SET NULL;


--
-- Name: social_reels social_reels_music_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.social_reels
    ADD CONSTRAINT social_reels_music_id_fkey FOREIGN KEY (music_id) REFERENCES public.social_reel_music(id) ON DELETE SET NULL;


--
-- Name: social_reels social_reels_template_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.social_reels
    ADD CONSTRAINT social_reels_template_id_fkey FOREIGN KEY (template_id) REFERENCES public.social_reel_templates(id) ON DELETE SET NULL;


--
-- Name: social_schedule social_schedule_template_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.social_schedule
    ADD CONSTRAINT social_schedule_template_id_fkey FOREIGN KEY (template_id) REFERENCES public.social_templates(id) ON DELETE CASCADE;


--
-- Name: social_series_parts social_series_parts_post_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.social_series_parts
    ADD CONSTRAINT social_series_parts_post_id_fkey FOREIGN KEY (post_id) REFERENCES public.social_posts(id) ON DELETE SET NULL;


--
-- Name: social_series_parts social_series_parts_series_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.social_series_parts
    ADD CONSTRAINT social_series_parts_series_id_fkey FOREIGN KEY (series_id) REFERENCES public.social_series(id) ON DELETE CASCADE;


--
-- Name: social_topics social_topics_used_post_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.social_topics
    ADD CONSTRAINT social_topics_used_post_id_fkey FOREIGN KEY (used_post_id) REFERENCES public.social_posts(id) ON DELETE SET NULL;


--
-- Name: page_views Allow anonymous inserts; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Allow anonymous inserts" ON public.page_views FOR INSERT TO authenticated, anon WITH CHECK (true);


--
-- Name: page_views Block public selects; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Block public selects" ON public.page_views FOR SELECT USING (false);


--
-- Name: product_blocked_dates Blocked dates are viewable by everyone; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Blocked dates are viewable by everyone" ON public.product_blocked_dates FOR SELECT USING (true);


--
-- Name: product_inventory Inventory viewable by service role; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Inventory viewable by service role" ON public.product_inventory USING (true) WITH CHECK (true);


--
-- Name: credit_notes Service role full access; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Service role full access" ON public.credit_notes USING ((auth.role() = 'service_role'::text));


--
-- Name: dunning_notices Service role full access; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Service role full access" ON public.dunning_notices USING ((auth.role() = 'service_role'::text));


--
-- Name: expenses Service role full access; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Service role full access" ON public.expenses USING ((auth.role() = 'service_role'::text));


--
-- Name: export_log Service role full access; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Service role full access" ON public.export_log USING ((auth.role() = 'service_role'::text));


--
-- Name: stripe_transactions Service role full access; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Service role full access" ON public.stripe_transactions USING ((auth.role() = 'service_role'::text));


--
-- Name: product_blocked_dates Service role full access on blocked_dates; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Service role full access on blocked_dates" ON public.product_blocked_dates USING (true) WITH CHECK (true);


--
-- Name: damage_reports Service role full access on damage_reports; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Service role full access on damage_reports" ON public.damage_reports USING (true) WITH CHECK (true);


--
-- Name: email_log Service role full access on email_log; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Service role full access on email_log" ON public.email_log USING ((auth.role() = 'service_role'::text)) WITH CHECK ((auth.role() = 'service_role'::text));


--
-- Name: custom_sets Users can manage own sets; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Users can manage own sets" ON public.custom_sets USING ((auth.uid() = user_id));


--
-- Name: abandoned_carts; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.abandoned_carts ENABLE ROW LEVEL SECURITY;

--
-- Name: abandoned_carts abandoned_carts_service; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY abandoned_carts_service ON public.abandoned_carts USING ((auth.role() = 'service_role'::text));


--
-- Name: accessories; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.accessories ENABLE ROW LEVEL SECURITY;

--
-- Name: accessories accessories_public_read; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY accessories_public_read ON public.accessories FOR SELECT USING (true);


--
-- Name: accessories accessories_service_write; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY accessories_service_write ON public.accessories USING ((auth.role() = 'service_role'::text));


--
-- Name: accessory_units; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.accessory_units ENABLE ROW LEVEL SECURITY;

--
-- Name: accessory_units accessory_units service role; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "accessory_units service role" ON public.accessory_units USING (true) WITH CHECK (true);


--
-- Name: admin_audit_log; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.admin_audit_log ENABLE ROW LEVEL SECURITY;

--
-- Name: admin_config; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.admin_config ENABLE ROW LEVEL SECURITY;

--
-- Name: admin_config admin_config_read; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY admin_config_read ON public.admin_config FOR SELECT USING (true);


--
-- Name: admin_config admin_config_write; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY admin_config_write ON public.admin_config USING ((auth.role() = 'service_role'::text));


--
-- Name: admin_customer_notes; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.admin_customer_notes ENABLE ROW LEVEL SECURITY;

--
-- Name: admin_sessions; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.admin_sessions ENABLE ROW LEVEL SECURITY;

--
-- Name: admin_settings; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.admin_settings ENABLE ROW LEVEL SECURITY;

--
-- Name: admin_users; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.admin_users ENABLE ROW LEVEL SECURITY;

--
-- Name: afa_buchungen; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.afa_buchungen ENABLE ROW LEVEL SECURITY;

--
-- Name: afa_buchungen afa_buchungen service role; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "afa_buchungen service role" ON public.afa_buchungen USING (true) WITH CHECK (true);


--
-- Name: angebote; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.angebote ENABLE ROW LEVEL SECURITY;

--
-- Name: assets; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.assets ENABLE ROW LEVEL SECURITY;

--
-- Name: assets assets service role; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "assets service role" ON public.assets USING (true) WITH CHECK (true);


--
-- Name: assets_neu; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.assets_neu ENABLE ROW LEVEL SECURITY;

--
-- Name: assets_neu assets_neu service role; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "assets_neu service role" ON public.assets_neu USING (true) WITH CHECK (true);


--
-- Name: availability_alerts; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.availability_alerts ENABLE ROW LEVEL SECURITY;

--
-- Name: beleg_anhaenge; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.beleg_anhaenge ENABLE ROW LEVEL SECURITY;

--
-- Name: beleg_anhaenge beleg_anhaenge service role; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "beleg_anhaenge service role" ON public.beleg_anhaenge USING (true) WITH CHECK (true);


--
-- Name: beleg_nummer_counter; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.beleg_nummer_counter ENABLE ROW LEVEL SECURITY;

--
-- Name: beleg_nummer_counter beleg_nummer_counter service role; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "beleg_nummer_counter service role" ON public.beleg_nummer_counter USING (true) WITH CHECK (true);


--
-- Name: beleg_positionen; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.beleg_positionen ENABLE ROW LEVEL SECURITY;

--
-- Name: beleg_positionen beleg_positionen service role; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "beleg_positionen service role" ON public.beleg_positionen USING (true) WITH CHECK (true);


--
-- Name: belege; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.belege ENABLE ROW LEVEL SECURITY;

--
-- Name: belege belege service role; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "belege service role" ON public.belege USING (true) WITH CHECK (true);


--
-- Name: blog_views; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.blog_views ENABLE ROW LEVEL SECURITY;

--
-- Name: blog_views blog_views_service_role_all; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY blog_views_service_role_all ON public.blog_views TO service_role USING (true) WITH CHECK (true);


--
-- Name: booking_id_counter; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.booking_id_counter ENABLE ROW LEVEL SECURITY;

--
-- Name: booking_interest; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.booking_interest ENABLE ROW LEVEL SECURITY;

--
-- Name: bookings; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.bookings ENABLE ROW LEVEL SECURITY;

--
-- Name: calendar_notes; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.calendar_notes ENABLE ROW LEVEL SECURITY;

--
-- Name: cart_holds; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.cart_holds ENABLE ROW LEVEL SECURITY;

--
-- Name: cart_holds cart_holds_service_role_all; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY cart_holds_service_role_all ON public.cart_holds TO service_role USING (true) WITH CHECK (true);


--
-- Name: client_errors; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.client_errors ENABLE ROW LEVEL SECURITY;

--
-- Name: content_coupon_counter; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.content_coupon_counter ENABLE ROW LEVEL SECURITY;

--
-- Name: conversations; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.conversations ENABLE ROW LEVEL SECURITY;

--
-- Name: coupons; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.coupons ENABLE ROW LEVEL SECURITY;

--
-- Name: coupons coupons_service_all; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY coupons_service_all ON public.coupons USING (true) WITH CHECK (true);


--
-- Name: credit_notes; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.credit_notes ENABLE ROW LEVEL SECURITY;

--
-- Name: custom_sets; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.custom_sets ENABLE ROW LEVEL SECURITY;

--
-- Name: customer_login_history; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.customer_login_history ENABLE ROW LEVEL SECURITY;

--
-- Name: customer_login_history customer_login_history_service_role_all; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY customer_login_history_service_role_all ON public.customer_login_history TO service_role USING (true) WITH CHECK (true);


--
-- Name: customer_push_subscriptions; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.customer_push_subscriptions ENABLE ROW LEVEL SECURITY;

--
-- Name: customer_ugc_submissions; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.customer_ugc_submissions ENABLE ROW LEVEL SECURITY;

--
-- Name: rental_agreements customers_own_contracts; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY customers_own_contracts ON public.rental_agreements FOR SELECT USING ((booking_id IN ( SELECT bookings.id
   FROM public.bookings
  WHERE (bookings.user_id = auth.uid()))));


--
-- Name: damage_reports; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.damage_reports ENABLE ROW LEVEL SECURITY;

--
-- Name: dunning_notices; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.dunning_notices ENABLE ROW LEVEL SECURITY;

--
-- Name: email_log; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.email_log ENABLE ROW LEVEL SECURITY;

--
-- Name: employee_appointments; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.employee_appointments ENABLE ROW LEVEL SECURITY;

--
-- Name: employee_notes; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.employee_notes ENABLE ROW LEVEL SECURITY;

--
-- Name: expenses; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.expenses ENABLE ROW LEVEL SECURITY;

--
-- Name: export_log; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.export_log ENABLE ROW LEVEL SECURITY;

--
-- Name: favorites; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.favorites ENABLE ROW LEVEL SECURITY;

--
-- Name: firmware_checks; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.firmware_checks ENABLE ROW LEVEL SECURITY;

--
-- Name: inventar_code_segmente; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.inventar_code_segmente ENABLE ROW LEVEL SECURITY;

--
-- Name: inventar_code_segmente inventar_code_segmente service role; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "inventar_code_segmente service role" ON public.inventar_code_segmente USING (true) WITH CHECK (true);


--
-- Name: inventar_units; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.inventar_units ENABLE ROW LEVEL SECURITY;

--
-- Name: inventar_units inventar_units service role; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "inventar_units service role" ON public.inventar_units USING (true) WITH CHECK (true);


--
-- Name: inventar_verknuepfung; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.inventar_verknuepfung ENABLE ROW LEVEL SECURITY;

--
-- Name: inventar_verknuepfung inventar_verknuepfung service role; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "inventar_verknuepfung service role" ON public.inventar_verknuepfung USING (true) WITH CHECK (true);


--
-- Name: invoice_versions; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.invoice_versions ENABLE ROW LEVEL SECURITY;

--
-- Name: invoice_versions invoice_versions_service_insert; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY invoice_versions_service_insert ON public.invoice_versions FOR INSERT WITH CHECK ((auth.role() = 'service_role'::text));


--
-- Name: invoice_versions invoice_versions_service_read; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY invoice_versions_service_read ON public.invoice_versions FOR SELECT USING ((auth.role() = 'service_role'::text));


--
-- Name: invoice_versions invoice_versions_service_update; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY invoice_versions_service_update ON public.invoice_versions FOR UPDATE USING ((auth.role() = 'service_role'::text)) WITH CHECK ((auth.role() = 'service_role'::text));


--
-- Name: legal_document_versions; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.legal_document_versions ENABLE ROW LEVEL SECURITY;

--
-- Name: legal_documents; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.legal_documents ENABLE ROW LEVEL SECURITY;

--
-- Name: legal_documents legal_documents_select; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY legal_documents_select ON public.legal_documents FOR SELECT USING (true);


--
-- Name: legal_document_versions legal_versions_no_delete; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY legal_versions_no_delete ON public.legal_document_versions FOR DELETE USING (false);


--
-- Name: legal_document_versions legal_versions_no_update; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY legal_versions_no_update ON public.legal_document_versions FOR UPDATE USING (false);


--
-- Name: legal_document_versions legal_versions_select; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY legal_versions_select ON public.legal_document_versions FOR SELECT USING (true);


--
-- Name: lieferanten; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.lieferanten ENABLE ROW LEVEL SECURITY;

--
-- Name: lieferanten lieferanten service role; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "lieferanten service role" ON public.lieferanten USING (true) WITH CHECK (true);


--
-- Name: message_attachments; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.message_attachments ENABLE ROW LEVEL SECURITY;

--
-- Name: messages; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.messages ENABLE ROW LEVEL SECURITY;

--
-- Name: migration_audit; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.migration_audit ENABLE ROW LEVEL SECURITY;

--
-- Name: migration_audit migration_audit service role; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "migration_audit service role" ON public.migration_audit USING (true) WITH CHECK (true);


--
-- Name: newsletter_subscribers; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.newsletter_subscribers ENABLE ROW LEVEL SECURITY;

--
-- Name: page_views; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.page_views ENABLE ROW LEVEL SECURITY;

--
-- Name: product_blocked_dates; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.product_blocked_dates ENABLE ROW LEVEL SECURITY;

--
-- Name: product_inventory; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.product_inventory ENABLE ROW LEVEL SECURITY;

--
-- Name: product_units; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.product_units ENABLE ROW LEVEL SECURITY;

--
-- Name: product_units product_units_admin_all; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY product_units_admin_all ON public.product_units USING (true) WITH CHECK (true);


--
-- Name: product_units product_units_public_read; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY product_units_public_read ON public.product_units FOR SELECT USING (true);


--
-- Name: produkte; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.produkte ENABLE ROW LEVEL SECURITY;

--
-- Name: produkte produkte service role; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "produkte service role" ON public.produkte USING (true) WITH CHECK (true);


--
-- Name: profiles; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;

--
-- Name: purchase_attachments; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.purchase_attachments ENABLE ROW LEVEL SECURITY;

--
-- Name: push_subscriptions; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.push_subscriptions ENABLE ROW LEVEL SECURITY;

--
-- Name: referrals; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.referrals ENABLE ROW LEVEL SECURITY;

--
-- Name: referrals referrals_service_all; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY referrals_service_all ON public.referrals USING (true) WITH CHECK (true);


--
-- Name: rental_agreements; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.rental_agreements ENABLE ROW LEVEL SECURITY;

--
-- Name: reviews; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.reviews ENABLE ROW LEVEL SECURITY;

--
-- Name: reviews reviews_insert_own; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY reviews_insert_own ON public.reviews FOR INSERT WITH CHECK ((auth.uid() = user_id));


--
-- Name: reviews reviews_select_approved; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY reviews_select_approved ON public.reviews FOR SELECT USING ((approved = true));


--
-- Name: reviews reviews_select_own; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY reviews_select_own ON public.reviews FOR SELECT USING ((auth.uid() = user_id));


--
-- Name: reviews reviews_service; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY reviews_service ON public.reviews USING ((auth.role() = 'service_role'::text));


--
-- Name: client_errors service_all_client_errors; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY service_all_client_errors ON public.client_errors TO service_role USING (true) WITH CHECK (true);


--
-- Name: purchase_attachments service_all_purchase_attachments; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY service_all_purchase_attachments ON public.purchase_attachments TO service_role USING (true) WITH CHECK (true);


--
-- Name: booking_id_counter service_role_all; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY service_role_all ON public.booking_id_counter TO service_role USING (true) WITH CHECK (true);


--
-- Name: content_coupon_counter service_role_all; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY service_role_all ON public.content_coupon_counter TO service_role USING (true) WITH CHECK (true);


--
-- Name: social_reel_segments service_role_all; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY service_role_all ON public.social_reel_segments USING ((auth.role() = 'service_role'::text)) WITH CHECK ((auth.role() = 'service_role'::text));


--
-- Name: firmware_checks service_role_all_firmware_checks; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY service_role_all_firmware_checks ON public.firmware_checks USING ((auth.role() = 'service_role'::text)) WITH CHECK ((auth.role() = 'service_role'::text));


--
-- Name: customer_push_subscriptions service_role_only; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY service_role_only ON public.customer_push_subscriptions USING (false);


--
-- Name: customer_ugc_submissions service_role_only; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY service_role_only ON public.customer_ugc_submissions USING (false);


--
-- Name: newsletter_subscribers service_role_only; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY service_role_only ON public.newsletter_subscribers USING (false);


--
-- Name: sets; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.sets ENABLE ROW LEVEL SECURITY;

--
-- Name: sets sets_public_read; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY sets_public_read ON public.sets FOR SELECT USING (true);


--
-- Name: shop_page_content; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.shop_page_content ENABLE ROW LEVEL SECURITY;

--
-- Name: shop_page_content shop_page_content_read; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY shop_page_content_read ON public.shop_page_content FOR SELECT USING (true);


--
-- Name: shop_page_content shop_page_content_write; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY shop_page_content_write ON public.shop_page_content USING ((auth.role() = 'authenticated'::text));


--
-- Name: site_visits; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.site_visits ENABLE ROW LEVEL SECURITY;

--
-- Name: site_visits_hourly; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.site_visits_hourly ENABLE ROW LEVEL SECURITY;

--
-- Name: site_visits_hourly site_visits_hourly_service_role_all; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY site_visits_hourly_service_role_all ON public.site_visits_hourly TO service_role USING (true) WITH CHECK (true);


--
-- Name: site_visits site_visits_service_role_all; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY site_visits_service_role_all ON public.site_visits TO service_role USING (true) WITH CHECK (true);


--
-- Name: social_accounts; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.social_accounts ENABLE ROW LEVEL SECURITY;

--
-- Name: social_editorial_plan; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.social_editorial_plan ENABLE ROW LEVEL SECURITY;

--
-- Name: social_insights; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.social_insights ENABLE ROW LEVEL SECURITY;

--
-- Name: social_posts; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.social_posts ENABLE ROW LEVEL SECURITY;

--
-- Name: social_reel_music; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.social_reel_music ENABLE ROW LEVEL SECURITY;

--
-- Name: social_reel_plan; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.social_reel_plan ENABLE ROW LEVEL SECURITY;

--
-- Name: social_reel_segments; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.social_reel_segments ENABLE ROW LEVEL SECURITY;

--
-- Name: social_reel_templates; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.social_reel_templates ENABLE ROW LEVEL SECURITY;

--
-- Name: social_reels; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.social_reels ENABLE ROW LEVEL SECURITY;

--
-- Name: social_schedule; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.social_schedule ENABLE ROW LEVEL SECURITY;

--
-- Name: social_series; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.social_series ENABLE ROW LEVEL SECURITY;

--
-- Name: social_series_parts; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.social_series_parts ENABLE ROW LEVEL SECURITY;

--
-- Name: social_templates; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.social_templates ENABLE ROW LEVEL SECURITY;

--
-- Name: social_topics; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.social_topics ENABLE ROW LEVEL SECURITY;

--
-- Name: stripe_transactions; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.stripe_transactions ENABLE ROW LEVEL SECURITY;

--
-- Name: favorites users_delete_own_favorites; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY users_delete_own_favorites ON public.favorites FOR DELETE USING ((auth.uid() = user_id));


--
-- Name: conversations users_insert_own_conversations; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY users_insert_own_conversations ON public.conversations FOR INSERT WITH CHECK ((auth.uid() = customer_id));


--
-- Name: favorites users_insert_own_favorites; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY users_insert_own_favorites ON public.favorites FOR INSERT WITH CHECK ((auth.uid() = user_id));


--
-- Name: messages users_insert_own_messages; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY users_insert_own_messages ON public.messages FOR INSERT WITH CHECK (((auth.uid() = sender_id) AND (sender_type = 'customer'::text)));


--
-- Name: profiles users_insert_own_profile; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY users_insert_own_profile ON public.profiles FOR INSERT WITH CHECK ((auth.uid() = id));


--
-- Name: bookings users_read_own_bookings; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY users_read_own_bookings ON public.bookings FOR SELECT USING ((auth.uid() = user_id));


--
-- Name: conversations users_read_own_conversations; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY users_read_own_conversations ON public.conversations FOR SELECT USING ((auth.uid() = customer_id));


--
-- Name: favorites users_read_own_favorites; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY users_read_own_favorites ON public.favorites FOR SELECT USING ((auth.uid() = user_id));


--
-- Name: messages users_read_own_messages; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY users_read_own_messages ON public.messages FOR SELECT USING ((conversation_id IN ( SELECT conversations.id
   FROM public.conversations
  WHERE (conversations.customer_id = auth.uid()))));


--
-- Name: profiles users_read_own_profile; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY users_read_own_profile ON public.profiles FOR SELECT USING ((auth.uid() = id));


--
-- Name: profiles users_update_own_profile; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY users_update_own_profile ON public.profiles FOR UPDATE USING ((auth.uid() = id)) WITH CHECK ((auth.uid() = id));


--
-- Name: waitlist_subscriptions; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.waitlist_subscriptions ENABLE ROW LEVEL SECURITY;

--
-- PostgreSQL database dump complete
--

\unrestrict Wq5HgAx2KbqffFcbZsSZ0EM4ndze1F6gFj0dKBO6HFFKI1LujhgIhRgauFmS7tk

