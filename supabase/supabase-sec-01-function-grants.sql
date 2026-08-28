-- ════════════════════════════════════════════════════════════════════════
-- Sicherheit 01 — Ausführungsrechte der SECURITY-DEFINER-Funktionen
-- ════════════════════════════════════════════════════════════════════════
--
-- Behebt die Befunde K-2, K-3, H-3 und H-5 aus SECURITY-AUDIT.md.
--
-- PROBLEM 1 — Funktionen für jeden aufrufbar (K-2, H-3):
-- In PostgreSQL hat die Rolle PUBLIC standardmäßig EXECUTE auf neu angelegte
-- Funktionen. `anonymize_customer`, `cleanup_expired_data` und
-- `publish_legal_version` haben in ihren Migrationen KEIN REVOKE bekommen und
-- sind damit über die Supabase-RPC-Schnittstelle für `anon` aufrufbar — also
-- ohne jede Anmeldung. Konkret möglich war:
--   POST /rest/v1/rpc/anonymize_customer  {"customer_id":"<fremde-uuid>"}
--   POST /rest/v1/rpc/cleanup_expired_data
--   POST /rest/v1/rpc/publish_legal_version  (überschreibt AGB/Datenschutz)
--
-- PROBLEM 2 — Buchungen fremder Kunden manipulierbar (K-3):
-- Die drei `assign_free_*`-Funktionen sind SECURITY DEFINER (umgehen also die
-- RLS von `bookings`), führen `UPDATE bookings ... WHERE id = p_booking_id` aus,
-- sind explizit `TO authenticated` freigegeben und prüfen `auth.uid()` NICHT.
-- Jeder eingeloggte Kunde konnte damit fremde Buchungen ändern und über
-- `assign_free_accessory_units` den gesamten Gerätepool auf 'rented' setzen.
-- Die Buchungsnummer (C2R-YYWW-NNN) ist trivial erratbar.
--
-- PROBLEM 3 — fehlender search_path (H-5):
-- Ohne `SET search_path` kann ein Angreifer mit Schreibrecht auf ein beliebiges
-- Schema dort eine gleichnamige Tabelle anlegen und sie über den search_path vor
-- `public` schieben. Der Funktionskörper arbeitet dann auf den untergeschobenen
-- Objekten — mit den Rechten des Funktionseigentümers. Klassischer
-- Privilegieneskalationsweg bei SECURITY DEFINER.
--
-- WARUM DER ENTZUG GEFAHRLOS IST:
-- Eine Verfolgung aller 17 RPC-Aufrufstellen im Anwendungscode hat ergeben, dass
-- ausnahmslos jede über `createServiceClient()` (Service-Role) läuft — es gibt
-- keinen einzigen `.rpc()`-Aufruf aus einem Browser- oder Cookie-Auth-Client.
-- Die Wrapper `lib/unit-assignment.ts:81`, `lib/accessory-unit-assignment.ts:78`
-- und `lib/camera-unit-assignment.ts:91` erzeugen den Service-Client sogar selbst
-- im Funktionsrumpf. `anonymize_customer` und `cleanup_expired_data` werden von
-- TypeScript überhaupt nicht aufgerufen (`lib/anonymize-customer.ts` macht die
-- Anonymisierung vollständig in TS).
--
-- Vorbild für das Zielmuster: `erledigte supabase/supabase-check-email-rpc.sql:41-44`.
--
-- Idempotent. Nutzt `to_regprocedure()` — eine Funktion, die (etwa wegen einer nie
-- ausgeführten Migration) nicht existiert, wird stillschweigend übersprungen
-- statt die gesamte Migration abzubrechen.

-- ────────────────────────────────────────────────────────────────────────
-- Helfer: härtet eine Funktion, falls sie existiert
-- ────────────────────────────────────────────────────────────────────────
--   1. search_path fest auf `public` (bzw. den übergebenen Wert)
--   2. EXECUTE für PUBLIC, anon, authenticated entziehen
--   3. EXECUTE ausschließlich an service_role
--
-- Bewusst KEIN Entzug für `postgres`/den Owner — sonst könnten Migrationen und
-- Trigger die Funktion nicht mehr ausführen.

DO $$
DECLARE
  sig    TEXT;
  sigs   TEXT[] := ARRAY[
    -- Kamera-/Zubehör-Zuweisung (K-3). Mehrfach per CREATE OR REPLACE definiert,
    -- die Signatur ist über alle Definitionen identisch.
    'public.assign_free_unit(text,date,date,text)',
    'public.assign_free_accessory_units(text,integer,date,date,text)',
    'public.assign_free_camera_units(text,date,date,text)',
    -- Anonymisierung und Hard-Delete (K-2)
    'public.anonymize_customer(uuid)',
    'public.cleanup_expired_data()',
    -- Rechtstexte veröffentlichen (H-3)
    'public.publish_legal_version(uuid,text,text,text,uuid)',
    -- Besucherzähler: haben bereits search_path, aber kein REVOKE
    'public.increment_site_visit(date)',
    'public.increment_site_visit_hourly(date,smallint)',
    -- Belegnummernkreis (GoBD)
    'public.naechste_beleg_nummer(integer)'
  ];
  oid_found OID;
  n_done  INT := 0;
  n_skip  INT := 0;
BEGIN
  FOREACH sig IN ARRAY sigs LOOP
    oid_found := to_regprocedure(sig);

    IF oid_found IS NULL THEN
      n_skip := n_skip + 1;
      RAISE NOTICE 'übersprungen (nicht vorhanden): %', sig;
      CONTINUE;
    END IF;

    EXECUTE format('ALTER FUNCTION %s SET search_path = public', sig);
    EXECUTE format('REVOKE ALL ON FUNCTION %s FROM PUBLIC', sig);
    EXECUTE format('REVOKE ALL ON FUNCTION %s FROM anon', sig);
    EXECUTE format('REVOKE ALL ON FUNCTION %s FROM authenticated', sig);
    EXECUTE format('GRANT EXECUTE ON FUNCTION %s TO service_role', sig);

    n_done := n_done + 1;
    RAISE NOTICE 'gehärtet: %', sig;
  END LOOP;

  RAISE NOTICE '── % Funktion(en) gehärtet, % übersprungen ──', n_done, n_skip;
END$$;

-- ────────────────────────────────────────────────────────────────────────
-- handle_new_user() — Trigger auf auth.users
-- ────────────────────────────────────────────────────────────────────────
--
-- Getrennt behandelt, weil es eine TRIGGER-Funktion ist: Sie läuft bei JEDER
-- Kundenregistrierung und legt die `profiles`-Zeile an. Ein direkter RPC-Aufruf
-- ist bei Trigger-Funktionen ohnehin nicht möglich (PostgreSQL lehnt das ab),
-- ein REVOKE wäre also wirkungslos — der `search_path` ist hier aber trotzdem
-- wichtig, weil die Funktion `profiles` unqualifiziert referenziert.
--
-- Nur `SET search_path`, KEIN Rechteentzug: Der Trigger wird vom Auth-System
-- ausgeführt; ein zu enger Rechtekranz würde die Registrierung brechen.

DO $$
BEGIN
  IF to_regprocedure('public.handle_new_user()') IS NOT NULL THEN
    ALTER FUNCTION public.handle_new_user() SET search_path = public;
    RAISE NOTICE 'search_path gesetzt: handle_new_user()';
  ELSE
    RAISE NOTICE 'übersprungen (nicht vorhanden): handle_new_user()';
  END IF;
END$$;

-- ════════════════════════════════════════════════════════════════════════
-- Verifikation — nach dem Ausführen prüfen
-- ════════════════════════════════════════════════════════════════════════
--
-- Erwartung: anon_darf und auth_darf sind für ALLE Zeilen `false`,
-- search_path_config ist gesetzt (nicht NULL).

SELECT p.proname                                            AS funktion,
       pg_get_function_identity_arguments(p.oid)            AS argumente,
       p.proconfig                                          AS search_path_config,
       has_function_privilege('anon',          p.oid, 'EXECUTE') AS anon_darf,
       has_function_privilege('authenticated', p.oid, 'EXECUTE') AS auth_darf,
       has_function_privilege('service_role',  p.oid, 'EXECUTE') AS service_darf
  FROM pg_proc p
  JOIN pg_namespace n ON n.oid = p.pronamespace
 WHERE n.nspname = 'public' AND p.prosecdef
 ORDER BY p.proname;

-- ════════════════════════════════════════════════════════════════════════
-- Rollback (nur im Notfall)
-- ════════════════════════════════════════════════════════════════════════
--
-- GRANT EXECUTE ON FUNCTION public.assign_free_unit(text,date,date,text) TO authenticated;
-- GRANT EXECUTE ON FUNCTION public.assign_free_accessory_units(text,integer,date,date,text) TO authenticated;
-- GRANT EXECUTE ON FUNCTION public.assign_free_camera_units(text,date,date,text) TO authenticated;
--
-- Ein Rollback sollte NICHT nötig sein: Alle Aufrufer nutzen die Service-Role.
-- Falls nach dieser Migration die Kamera-/Zubehör-Zuweisung ausfällt, liegt die
-- Ursache mit hoher Wahrscheinlichkeit woanders — bitte erst das Ergebnis der
-- Verifikationsabfrage oben prüfen.

-- ════════════════════════════════════════════════════════════════════════
-- Zwei Beobachtungen am Rande (KEINE Änderung durch diese Migration)
-- ════════════════════════════════════════════════════════════════════════
--
-- 1. `cleanup_expired_data()` ist faktisch defekt: Sie beginnt mit
--    `DELETE FROM feedback ...`, aber eine Tabelle `feedback` existiert nicht
--    (Konto-Feedback läuft seit 2026-06-10 über `beta_feedback`). Ein Aufruf
--    würde also mit „relation feedback does not exist" abbrechen. Die Funktion
--    löscht ansonsten `bookings` und `profiles` — sie wäre destruktiv, wenn sie
--    repariert und aufgerufen würde. Sie hat keinen Aufrufer im Anwendungscode.
--    Empfehlung: ersatzlos droppen. Bewusst nicht Teil dieser Migration, weil ein
--    DROP eine eigene Entscheidung ist.
--
-- 2. `anonymize_customer(uuid)` wird vom Anwendungscode ebenfalls nicht genutzt —
--    `lib/anonymize-customer.ts` implementiert die Anonymisierung vollständig in
--    TypeScript (inkl. Storage-Bereinigung und E-Mail-Log-Scrubbing) und ist damit
--    deutlich umfassender als diese SQL-Funktion. Auch hier wäre ein DROP
--    vertretbar; der Rechteentzug oben reicht aber aus.
