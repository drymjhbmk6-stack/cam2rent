-- ════════════════════════════════════════════════════════════════════════
-- Sicherheit 03 — Wirkungslose RLS-Richtlinien auf service_role einschränken
-- ════════════════════════════════════════════════════════════════════════
--
-- Behebt die Befunde K-4 und H-2 aus SECURITY-AUDIT.md (kritisch bzw. hoch).
--
-- PROBLEM:
-- 22 Richtlinien wurden als `FOR ALL USING (true) WITH CHECK (true)` angelegt —
-- ohne `TO`-Klausel. PostgreSQL wertet eine Richtlinie ohne `TO` für die Rolle
-- PUBLIC aus, also auch für `anon` und `authenticated`. Der Kommentar in den
-- Migrationen sagt zwar durchweg „service role", die Richtlinien sind aber
-- faktisch offen.
--
-- `ENABLE ROW LEVEL SECURITY` in Kombination mit `USING (true)` für PUBLIC ist
-- funktional identisch mit GAR KEINER RLS.
--
-- Besonders schwer wiegen:
--   - `damage_reports`  → Schadensberichte mit Buchungsbezug, anonym les- UND
--                          schreibbar (Befund K-4, eigenständig kritisch)
--   - `coupons`         → Gutscheine anlegbar, `used_count` zurücksetzbar; die
--                          sorgfältig gebaute atomare RPC `increment_coupon_if_
--                          available` wird damit vollständig umgangen
--   - `belege`, `beleg_positionen`, `afa_buchungen`, `beleg_nummer_counter`
--                       → GoBD-relevante Buchführungsdaten
--   - `lieferanten`     → Lieferantenstammdaten (contact_person, email, phone)
--
-- LÖSUNG:
-- `ALTER POLICY ... TO service_role`. Bewusst kein DROP + CREATE: `ALTER POLICY`
-- ändert nur den Rollenbezug, lässt die USING-/WITH-CHECK-Ausdrücke unangetastet
-- und hinterlässt zu keinem Zeitpunkt eine Tabelle ohne Richtlinie.
--
-- ⚠️ WAS BEWUSST NICHT ANGEFASST WIRD:
-- Nicht jedes `USING (true)` ist falsch. Öffentliche LESE-Richtlinien auf
-- Katalogdaten sind beabsichtigt und müssen bleiben, sonst bricht der Shop:
--   accessories_public_read · product_units_public_read · sets · admin_config ·
--   legal_documents · legal_document_versions · product_blocked_dates
-- Der Filter unten erfasst deshalb ausschließlich Richtlinien mit
--   cmd = 'ALL'  UND  qual = 'true'  UND  Rolle PUBLIC.
-- Eine `FOR SELECT`-Richtlinie wird nie erfasst, ebenso wenig eine mit einer
-- echten Bedingung (z. B. `auth.role() = 'service_role'`) oder eine, die bereits
-- korrekt `TO service_role` gesetzt hat.
--
-- Die Migration arbeitet dynamisch gegen den IST-Zustand der Datenbank statt
-- gegen eine fest verdrahtete Namensliste — dadurch erfasst sie auch
-- Richtlinien, die zwischenzeitlich umbenannt oder per `recovery-after-drop.sql`
-- neu angelegt wurden.
--
-- Idempotent: Ein zweiter Lauf findet nichts mehr zu tun.

-- ────────────────────────────────────────────────────────────────────────
-- SCHRITT 1 — Vorschau: Was wird geändert?
-- ────────────────────────────────────────────────────────────────────────
-- Diese Abfrage ändert nichts. Ergebnis vor Schritt 2 kurz durchsehen —
-- es sollten nur Verwaltungstabellen auftauchen, keine Katalog-Lesezugriffe.

SELECT tablename    AS tabelle,
       policyname   AS richtlinie,
       cmd          AS operation,
       roles::text  AS aktuelle_rollen
  FROM pg_policies
 WHERE schemaname = 'public'
   AND cmd = 'ALL'
   AND qual = 'true'
   AND 'public' = ANY(roles)
 ORDER BY tablename, policyname;

-- ────────────────────────────────────────────────────────────────────────
-- SCHRITT 2 — Umstellung
-- ────────────────────────────────────────────────────────────────────────

DO $$
DECLARE
  r     RECORD;
  n_fix INT := 0;
BEGIN
  FOR r IN
    SELECT tablename, policyname
      FROM pg_policies
     WHERE schemaname = 'public'
       AND cmd = 'ALL'            -- nur FOR ALL, niemals FOR SELECT
       AND qual = 'true'          -- nur bedingungslose Richtlinien
       AND 'public' = ANY(roles)  -- nur solche ohne TO-Klausel
     ORDER BY tablename, policyname
  LOOP
    EXECUTE format('ALTER POLICY %I ON public.%I TO service_role',
                   r.policyname, r.tablename);
    n_fix := n_fix + 1;
    RAISE NOTICE 'eingeschränkt auf service_role: %.%', r.tablename, r.policyname;
  END LOOP;

  RAISE NOTICE '── % Richtlinie(n) auf service_role eingeschränkt ──', n_fix;
END$$;

-- ════════════════════════════════════════════════════════════════════════
-- Verifikation
-- ════════════════════════════════════════════════════════════════════════
--
-- 1) Erwartung: 0 Zeilen. (Entspricht Abfrage 3 aus SECURITY-AUDIT.md.)
SELECT tablename, policyname, roles::text, cmd, qual, with_check
  FROM pg_policies
 WHERE schemaname = 'public'
   AND (qual = 'true' OR with_check = 'true')
   AND (   'public'        = ANY(roles)
        OR 'anon'          = ANY(roles)
        OR 'authenticated' = ANY(roles))
 ORDER BY tablename;

-- 2) Gegenprobe: Die öffentlichen LESE-Richtlinien müssen erhalten geblieben
--    sein — sonst brechen Shop und Rechtstexte. Erwartung: mehrere Zeilen,
--    jeweils cmd = 'SELECT'.
SELECT tablename, policyname, cmd, roles::text
  FROM pg_policies
 WHERE schemaname = 'public' AND cmd = 'SELECT' AND qual = 'true'
 ORDER BY tablename;

-- ════════════════════════════════════════════════════════════════════════
-- Smoke-Test nach dem Ausführen
-- ════════════════════════════════════════════════════════════════════════
--   Shop (ausgeloggt): Startseite · /kameras · Produktseite mit Kalender · /agb
--   Admin: /admin/buchhaltung (Cockpit + Belegliste) · /admin/inventar ·
--          /admin/zubehoer · /admin/gutscheine · /admin/schaeden
--
-- Rollback (pro Richtlinie, nur im Notfall):
--   ALTER POLICY <richtlinie> ON public.<tabelle> TO public;
