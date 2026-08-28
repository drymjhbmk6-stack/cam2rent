-- ════════════════════════════════════════════════════════════════════════
-- Sicherheit 04 — Schadensfotos: Legacy-URLs auf Storage-Pfade umstellen
-- ════════════════════════════════════════════════════════════════════════
--
-- Teil 1 von 2 zur Behebung von Befund K-5 (kritisch) aus SECURITY-AUDIT.md.
-- Teil 2 ist supabase-sec-05-damage-photos-private.sql.
--
-- PROBLEM:
-- Der Bucket `damage-photos` ist öffentlich (`erledigte supabase/supabase-schaeden.sql:48`)
-- und trägt zusätzlich eine `FOR SELECT USING (bucket_id='damage-photos')`-Policy
-- ohne `TO`-Klausel. Schadensfotos — teils mit Personen, Fahrzeugen, Wohnorten —
-- sind damit für jeden abrufbar, der eine URL kennt oder rät.
--
-- Reihenfolge:
--
--   1. DIESES SKRIPT und der Deploy — in BELIEBIGER Reihenfolge
--   2. sec-05-…-private.sql  → Bucket privat + öffentliche Policy entfernen
--      (ZULETZT, und erst wenn beides oben erledigt ist)
--
-- WARUM SCHRITT 1 IN BEIDER REIHENFOLGE FUNKTIONIERT:
-- Der Anzeige-Helfer `lib/damage-photo-path.ts` normalisiert im Frontend jeden
-- Eintrag zum Storage-Pfad — eine Alt-URL genauso wie einen bereits migrierten
-- Pfad. Das Admin-UI lädt dadurch immer über `/api/admin/damage-photo-url`, und
-- signierte URLs funktionieren auch auf einem noch öffentlichen Bucket. Es gibt
-- also kein Zeitfenster mit kaputten Bildern, egal was zuerst passiert.
--
-- Der Backfill bleibt trotzdem nötig: Ohne ihn stehen weiterhin vollständige
-- Public-URLs in der Datenbank — sie wären nach dem Privatschalten zwar wertlos,
-- aber sie sind bis dahin ein direkt nutzbarer, unsignierter Zugriffsweg, und sie
-- machen jede spätere Auswertung der Spalte unnötig fehleranfällig.
--
-- WAS UMGESTELLT WIRD:
-- Bis Sweep 9 wurde die volle Public-URL gespeichert, seither der Storage-Pfad
-- (`app/api/damage-report/route.ts:163`). Beide Formen liegen gemischt in der
-- Tabelle. Betroffen sind ZWEI Spalten, die konsistent bleiben müssen:
--   - `photos`                 TEXT[]  — alle Fotos des Schadensfalls
--   - `customer_visible_paths` JSONB   — Teilmenge davon, die der Kunde sieht
-- Das Admin-UI markiert ein Foto per `customer_visible_paths.includes(photo)` als
-- freigegeben (`app/admin/schaeden/page.tsx:413`), und der Mailversand wählt die
-- Anhänge genauso aus (`lib/damage-attachments.ts:182`). Würde nur eine der beiden
-- Spalten migriert, verlöre jede Freigabe ihre Zuordnung — der Kunde bekäme seine
-- Fotos nicht mehr, ohne dass es irgendwo auffällt.
--
-- Dokument-Anhänge (`attachments[].path`) bleiben unangetastet: Der Bucket
-- `damage-attachments` war von Anfang an privat, dort standen nie URLs.
--
-- ⚠️ `attachments` und `customer_visible_paths` stammen aus
-- `supabase/supabase-damage-reports-attachments.sql`, das noch als offene
-- Migration im Repo liegt. Ob es gelaufen ist, lässt sich von außen nicht sagen —
-- der Anwendungscode hat dafür einen defensiven Fallback
-- (`app/api/admin/damage/route.ts:243`). Dieses Skript prüft die Spalten deshalb
-- zur Laufzeit und überspringt sie, falls sie fehlen.
--
-- Idempotent: Ein zweiter Lauf findet nichts mehr zu tun.

-- ────────────────────────────────────────────────────────────────────────
-- SCHRITT 1 — Vorschau (ändert nichts)
-- ────────────────────────────────────────────────────────────────────────
DO $$
DECLARE
  n_fotos   BIGINT;
  n_frei    BIGINT := NULL;
  hat_cvp   BOOLEAN;
BEGIN
  hat_cvp := EXISTS (SELECT 1 FROM information_schema.columns
                      WHERE table_schema='public' AND table_name='damage_reports'
                        AND column_name='customer_visible_paths');

  SELECT count(*) INTO n_fotos
    FROM damage_reports
   WHERE photos IS NOT NULL
     AND EXISTS (SELECT 1 FROM unnest(photos) AS p WHERE p LIKE 'http%');

  IF hat_cvp THEN
    EXECUTE $q$
      SELECT count(*) FROM damage_reports
       WHERE jsonb_typeof(customer_visible_paths) = 'array'
         AND customer_visible_paths::text LIKE '%http%'
    $q$ INTO n_frei;
  END IF;

  RAISE NOTICE 'Zeilen mit Legacy-URLs in photos: %', n_fotos;
  IF hat_cvp THEN
    RAISE NOTICE 'Zeilen mit Legacy-URLs in customer_visible_paths: %', n_frei;
  ELSE
    RAISE NOTICE 'Spalte customer_visible_paths existiert nicht — wird übersprungen.';
  END IF;
END$$;

-- ────────────────────────────────────────────────────────────────────────
-- SCHRITT 2 — Umstellung
-- ────────────────────────────────────────────────────────────────────────
-- `split_part(url, '/damage-photos/', 2)` schneidet alles vor dem Bucketnamen ab;
-- das zweite split_part entfernt einen etwaigen Query-String. Die Reihenfolge der
-- Array-Elemente wird über WITH ORDINALITY ausdrücklich erhalten — sie ist die
-- Verbindung zwischen Foto und Freigabe.
--
-- Beide UPDATEs laufen in EINER Transaktion: Die zwei Spalten dürfen nie in
-- unterschiedlichem Zustand zurückbleiben.

BEGIN;

-- 2a) photos TEXT[]
UPDATE damage_reports
   SET photos = ARRAY(
         SELECT CASE
                  WHEN t.p LIKE 'http%/damage-photos/%'
                    THEN split_part(split_part(t.p, '/damage-photos/', 2), '?', 1)
                  ELSE t.p
                END
           FROM unnest(photos) WITH ORDINALITY AS t(p, ord)
          ORDER BY t.ord
       )
 WHERE photos IS NOT NULL
   AND EXISTS (SELECT 1 FROM unnest(photos) AS p WHERE p LIKE 'http%/damage-photos/%');

-- 2b) customer_visible_paths JSONB (nur falls die Spalte existiert)
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.columns
              WHERE table_schema='public' AND table_name='damage_reports'
                AND column_name='customer_visible_paths') THEN
    EXECUTE $q$
      UPDATE damage_reports
         SET customer_visible_paths = COALESCE((
               SELECT jsonb_agg(
                        CASE
                          WHEN t.v LIKE 'http%/damage-photos/%'
                            THEN split_part(split_part(t.v, '/damage-photos/', 2), '?', 1)
                          ELSE t.v
                        END
                        ORDER BY t.ord)
                 FROM jsonb_array_elements_text(customer_visible_paths)
                      WITH ORDINALITY AS t(v, ord)
             ), '[]'::jsonb)
       WHERE jsonb_typeof(customer_visible_paths) = 'array'
         AND customer_visible_paths::text LIKE '%/damage-photos/%'
    $q$;
  END IF;
END$$;

COMMIT;

-- ════════════════════════════════════════════════════════════════════════
-- Verifikation
-- ════════════════════════════════════════════════════════════════════════
--
-- 1) Erwartung: 0 Zeilen. Zeigt Reste, die das Muster nicht getroffen hat
--    (z. B. URL eines anderen Buckets) — die wären von Hand zu prüfen.
SELECT id, booking_id, photos
  FROM damage_reports
 WHERE photos IS NOT NULL
   AND EXISTS (SELECT 1 FROM unnest(photos) AS p WHERE p LIKE 'http%');

-- 2) Gegenprobe der Freigabe-Zuordnung. Erwartung: Hinweis „0 verwaiste
--    Freigaben". Kommt hier etwas anderes, ist eine Zuordnung verloren
--    gegangen → NICHT weitermachen, Snapshot zurückspielen.
DO $$
DECLARE n_orphan BIGINT;
BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns
                  WHERE table_schema='public' AND table_name='damage_reports'
                    AND column_name='customer_visible_paths') THEN
    RAISE NOTICE 'customer_visible_paths existiert nicht — Prüfung entfällt.';
    RETURN;
  END IF;

  EXECUTE $q$
    SELECT count(*)
      FROM damage_reports d
      CROSS JOIN LATERAL jsonb_array_elements_text(d.customer_visible_paths) AS v(pfad)
     WHERE jsonb_typeof(d.customer_visible_paths) = 'array'
       AND NOT (v.pfad = ANY(COALESCE(d.photos, ARRAY[]::text[])))
       AND NOT EXISTS (
             SELECT 1 FROM jsonb_array_elements(COALESCE(d.attachments, '[]'::jsonb)) AS a
              WHERE a->>'path' = v.pfad)
  $q$ INTO n_orphan;

  RAISE NOTICE '% verwaiste Freigabe(n)', n_orphan;
  IF n_orphan > 0 THEN
    RAISE WARNING 'Freigaben ohne passendes Foto/Dokument gefunden — bitte vor '
                  'dem naechsten Schritt pruefen!';
  END IF;
END$$;

-- ════════════════════════════════════════════════════════════════════════
-- Smoke-Test nach dem Ausführen
-- ════════════════════════════════════════════════════════════════════════
--   /admin/schaeden → einen ALTEN Schadensfall öffnen: Fotos müssen laden,
--     die Markierung „🔓 Kunde" / „🔒 intern" muss unverändert stehen.
--   /admin/buchungen/<id> → Schadensmeldung in der Buchung: Fotos müssen laden.
--
-- Rollback:
--   Kein automatischer Rückweg — die ursprüngliche URL ließe sich zwar aus dem
--   Pfad rekonstruieren, das ist aber nur nötig, wenn der Bucket öffentlich
--   bleiben soll. Deshalb VOR dem Lauf einen Supabase-Snapshot anlegen.
--   Manuell je Zeile:
--     UPDATE damage_reports SET photos = ARRAY(
--       SELECT 'https://<projekt-ref>.supabase.co/storage/v1/object/public/damage-photos/' || p
--         FROM unnest(photos) AS p)
--      WHERE id = '<id>';
