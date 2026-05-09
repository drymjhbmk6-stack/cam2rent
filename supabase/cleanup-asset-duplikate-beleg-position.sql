-- ════════════════════════════════════════════════════════════════════
-- Cleanup: Asset-Duplikate per beleg_position_id entfernen
-- Erstellt: 2026-05-09
-- ════════════════════════════════════════════════════════════════════
--
-- HINTERGRUND:
-- Waehrend der Schema-Cache-Inkonsistenz (PostgREST cached "assets_neu"
-- als existent, INSERT scheitert dann mit Schema-Cache-Miss) konnte der
-- Asset-Auto-Generator beim Festschreiben eines Belegs dieselbe
-- beleg_position_id zweimal anlegen — einmal in `assets`, einmal in
-- `assets_neu` (oder zweimal in derselben Tabelle bei Retry).
--
-- Symptom in der UI: /admin/buchhaltung/anlagen zeigt zwei identische
-- Eintraege fuer dasselbe Anlagegut.
--
-- DIESES SCRIPT:
-- - Findet alle beleg_position_id mit > 1 Asset-Row (in assets +
--   assets_neu zusammengezaehlt)
-- - Behaelt pro beleg_position_id den AELTESTEN Eintrag (created_at ASC,
--   id ASC als Tiebreaker) — der hat die laengste Historie an
--   verknuepften afa_buchungen.
-- - Loescht alle anderen Duplikate. afa_buchungen mit FK auf das
--   geloeschte Asset gehen via ON DELETE CASCADE mit weg (das ist OK,
--   weil das aeltere Asset die kanonische AfA-Historie hat).
--
-- Idempotent: nach dem Cleanup gibt es pro beleg_position_id genau einen
-- Asset-Datensatz. Ein zweiter Lauf findet nichts mehr.
--
-- AUSFUEHREN VIA SUPABASE SQL EDITOR.
-- ════════════════════════════════════════════════════════════════════


DO $$
DECLARE
  has_assets       BOOLEAN;
  has_assets_neu   BOOLEAN;
  union_sql        TEXT;
  dup_count        INT;
  deleted_assets   INT := 0;
  deleted_neu      INT := 0;
BEGIN
  SELECT EXISTS (SELECT 1 FROM information_schema.tables
    WHERE table_schema='public' AND table_name='assets') INTO has_assets;
  SELECT EXISTS (SELECT 1 FROM information_schema.tables
    WHERE table_schema='public' AND table_name='assets_neu') INTO has_assets_neu;

  RAISE NOTICE 'assets existiert: % | assets_neu existiert: %', has_assets, has_assets_neu;

  -- Union der beiden Tabellen (nur die existierenden) als String zusammenbauen.
  IF has_assets AND has_assets_neu THEN
    union_sql :=
      'SELECT beleg_position_id, ''assets''::text AS src, id, created_at
       FROM public.assets WHERE beleg_position_id IS NOT NULL
       UNION ALL
       SELECT beleg_position_id, ''assets_neu''::text AS src, id, created_at
       FROM public.assets_neu WHERE beleg_position_id IS NOT NULL';
  ELSIF has_assets THEN
    union_sql :=
      'SELECT beleg_position_id, ''assets''::text AS src, id, created_at
       FROM public.assets WHERE beleg_position_id IS NOT NULL';
  ELSIF has_assets_neu THEN
    union_sql :=
      'SELECT beleg_position_id, ''assets_neu''::text AS src, id, created_at
       FROM public.assets_neu WHERE beleg_position_id IS NOT NULL';
  ELSE
    RAISE NOTICE 'Weder assets noch assets_neu existieren — nichts zu tun.';
    RETURN;
  END IF;

  -- ────────────────────────────────────────────────────────────────
  -- 1. DIAGNOSE: Anzahl beleg_position_id mit Duplikaten
  -- ────────────────────────────────────────────────────────────────
  EXECUTE format(
    'SELECT COUNT(*) FROM (
       SELECT beleg_position_id FROM (%s) all_rows
       GROUP BY beleg_position_id HAVING COUNT(*) > 1
     ) d', union_sql
  ) INTO dup_count;
  RAISE NOTICE 'Anzahl beleg_position_id mit Duplikaten (vor Cleanup): %', dup_count;

  IF dup_count = 0 THEN
    RAISE NOTICE 'Nichts zu cleanupen — fertig.';
    RETURN;
  END IF;

  -- ────────────────────────────────────────────────────────────────
  -- 2. CLEANUP — aeltesten Eintrag pro beleg_position_id behalten
  -- ────────────────────────────────────────────────────────────────
  -- "winners" ist die kanonische Liste pro beleg_position_id. Aus jeder
  -- der beiden Tabellen werden alle Zeilen geloescht, die nicht der
  -- Winner sind. Wenn der Winner aus der anderen Tabelle stammt, fliegt
  -- die ganze beleg_position_id-Gruppe aus dieser Tabelle raus.

  IF has_assets THEN
    EXECUTE format(
      'WITH winners AS (
         SELECT DISTINCT ON (beleg_position_id)
           beleg_position_id, src, id, created_at
         FROM (%s) all_rows
         ORDER BY beleg_position_id, created_at ASC NULLS LAST, id ASC
       )
       DELETE FROM public.assets a
       USING winners w
       WHERE a.beleg_position_id = w.beleg_position_id
         AND NOT (w.src = ''assets'' AND w.id = a.id)',
      union_sql
    );
    GET DIAGNOSTICS deleted_assets = ROW_COUNT;
    RAISE NOTICE 'Aus assets geloescht: % Zeile(n)', deleted_assets;
  END IF;

  IF has_assets_neu THEN
    EXECUTE format(
      'WITH winners AS (
         SELECT DISTINCT ON (beleg_position_id)
           beleg_position_id, src, id, created_at
         FROM (%s) all_rows
         ORDER BY beleg_position_id, created_at ASC NULLS LAST, id ASC
       )
       DELETE FROM public.assets_neu a
       USING winners w
       WHERE a.beleg_position_id = w.beleg_position_id
         AND NOT (w.src = ''assets_neu'' AND w.id = a.id)',
      union_sql
    );
    GET DIAGNOSTICS deleted_neu = ROW_COUNT;
    RAISE NOTICE 'Aus assets_neu geloescht: % Zeile(n)', deleted_neu;
  END IF;

  -- ────────────────────────────────────────────────────────────────
  -- 3. NACHKONTROLLE
  -- ────────────────────────────────────────────────────────────────
  EXECUTE format(
    'SELECT COUNT(*) FROM (
       SELECT beleg_position_id FROM (%s) all_rows
       GROUP BY beleg_position_id HAVING COUNT(*) > 1
     ) d', union_sql
  ) INTO dup_count;

  IF dup_count = 0 THEN
    RAISE NOTICE 'OK — alle Duplikate per beleg_position_id entfernt. Insgesamt geloescht: %', deleted_assets + deleted_neu;
  ELSE
    RAISE WARNING 'ACHTUNG — % beleg_position_id(s) haben immer noch Duplikate. Bitte manuell pruefen.', dup_count;
  END IF;
END $$;
