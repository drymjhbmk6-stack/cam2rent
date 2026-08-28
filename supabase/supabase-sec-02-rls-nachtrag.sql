-- ════════════════════════════════════════════════════════════════════════
-- Sicherheit 02 — Row Level Security für 15 ungeschützte Tabellen
-- ════════════════════════════════════════════════════════════════════════
--
-- Behebt Befund K-1 aus SECURITY-AUDIT.md (kritisch).
--
-- PROBLEM:
-- 15 Tabellen haben in ihren Migrationen NIE ein `ENABLE ROW LEVEL SECURITY`
-- bekommen. Supabase vergibt per Default-Privileges
-- `GRANT ALL ON ALL TABLES IN SCHEMA public TO anon, authenticated`, und ein
-- globales REVOKE existiert im Repo nicht. Eine Tabelle ohne RLS ist damit über
-- die öffentliche PostgREST-Schnittstelle mit dem `anon`-Key — der
-- konstruktionsbedingt im Browser-Bundle liegt — vollständig les- UND schreibbar.
--
-- Konkret war ohne jede Anmeldung möglich:
--   GET  /rest/v1/invoices?select=*       → alle Rechnungen inkl. Kunden-E-Mail
--   GET  /rest/v1/beta_feedback?select=*  → Testerdaten mit Klarnamen und E-Mail
--   POST /rest/v1/invoice_counter         → Manipulation des GoBD-Nummernkreises
--
-- DSGVO: Verletzung von Art. 32 Abs. 1 lit. b (Vertraulichkeit). Ein
-- erfolgreicher Abruf wäre nach Art. 33 meldepflichtig.
--
-- WARUM EINE REINE SERVICE-ROLE-POLICY GENÜGT:
-- Eine Prüfung aller 66 Dateien mit `.from('<tabelle>')` hat ergeben, dass jeder
-- einzelne Zugriff auf diese 15 Tabellen über `createServiceClient()` läuft.
-- Insbesondere:
--   - Das Blog ist server-gerendert (app/blog/page.tsx:28,
--     app/blog/[slug]/page.tsx:19 — beide Service-Role, ISR/SSR). Die
--     Client-Pagination geht über /api/blog/posts, ebenfalls Service-Role.
--     Die `status='published'`-Filterung passiert bereits im Code.
--   - `invoices` wird von KEINEM Kundenpfad gelesen; /api/invoice/[bookingId]
--     erzeugt das PDF on-the-fly aus der `bookings`-Zeile.
--   - `admin_notifications` läuft über /api/admin/notifications. Wichtig:
--     Admins sind KEINE Supabase-Auth-User (eigenes admin_token-Cookie), eine
--     `auth.uid()`-Policy würde für sie also nie greifen.
-- Es wird deshalb KEINE öffentliche SELECT-Policy benötigt.
--
-- ⚠️ FÜR DIE ZUKUNFT: Wer eine dieser Tabellen später aus dem Browser lesen will,
-- bekommt von PostgREST bei RLS-Deny ein leeres Array statt eines Fehlers — das
-- schlägt also STILL fehl. In dem Fall hier eine passende Policy ergänzen.
--
-- KEIN `FORCE ROW LEVEL SECURITY`: Das würde zusätzlich den Tabelleneigentümer
-- erfassen und Migrationen sowie SECURITY-DEFINER-Funktionen brechen.
-- `service_role` besitzt BYPASSRLS, die Policy unten ist daher genau genommen
-- redundant — sie wird trotzdem gesetzt, weil das dem etablierten Muster im Repo
-- entspricht (Vorlage: supabase/supabase-blog-views.sql:36-45) und die Absicht
-- explizit dokumentiert.
--
-- Idempotent. Läuft ohne Wirkung erneut durch.

DO $$
DECLARE
  t        TEXT;
  tabellen TEXT[] := ARRAY[
    -- Buchhaltung / Finanzen
    'invoices',            -- Rechnungen: sent_to_email, Beträge, pdf_url
    'invoice_counter',     -- GoBD-Rechnungsnummernkreis
    'suppliers',           -- Lieferanten: contact_person, email, phone
    'purchases',           -- Einkaufsbelege
    'purchase_items',      -- Einkaufspreise
    -- Kundennahe Daten
    'beta_feedback',       -- tester_name, tester_email, Freitextantworten
    'blog_comments',       -- author_name, author_email, Kommentartext
    'return_checklists',   -- Rückgabeprotokolle mit Buchungsbezug
    'admin_notifications', -- Benachrichtigungen mit Kunden-/Buchungsbezug
    -- Redaktion
    'blog_posts',
    'blog_categories',
    'blog_auto_topics',
    'blog_schedule',
    'blog_series',
    'blog_series_parts'
  ];
  n_rls    INT := 0;
  n_pol    INT := 0;
  n_skip   INT := 0;
BEGIN
  FOREACH t IN ARRAY tabellen LOOP
    -- Tabelle vorhanden? (Manche Migrationen sind evtl. nie gelaufen.)
    IF NOT EXISTS (SELECT 1 FROM information_schema.tables
                    WHERE table_schema = 'public' AND table_name = t) THEN
      n_skip := n_skip + 1;
      RAISE NOTICE 'übersprungen (Tabelle fehlt): %', t;
      CONTINUE;
    END IF;

    -- RLS aktivieren (idempotent: nur wenn noch nicht aktiv)
    IF NOT EXISTS (SELECT 1 FROM pg_class c
                     JOIN pg_namespace n ON n.oid = c.relnamespace
                    WHERE n.nspname = 'public' AND c.relname = t
                      AND c.relrowsecurity) THEN
      EXECUTE format('ALTER TABLE public.%I ENABLE ROW LEVEL SECURITY', t);
      n_rls := n_rls + 1;
      RAISE NOTICE 'RLS aktiviert: %', t;
    END IF;

    -- Service-Role-Policy (idempotent)
    IF NOT EXISTS (SELECT 1 FROM pg_policies
                    WHERE schemaname = 'public' AND tablename = t
                      AND policyname = t || '_service_role_all') THEN
      EXECUTE format(
        'CREATE POLICY %I ON public.%I FOR ALL TO service_role '
        'USING (true) WITH CHECK (true)',
        t || '_service_role_all', t);
      n_pol := n_pol + 1;
    END IF;
  END LOOP;

  RAISE NOTICE '── RLS aktiviert: % · Policies angelegt: % · übersprungen: % ──',
               n_rls, n_pol, n_skip;
END$$;

-- ════════════════════════════════════════════════════════════════════════
-- Verifikation
-- ════════════════════════════════════════════════════════════════════════
--
-- 1) Tabellen ohne RLS — Erwartung: KEINE der 15 oben ist noch dabei.
SELECT c.relname AS tabelle_ohne_rls
  FROM pg_class c
  JOIN pg_namespace n ON n.oid = c.relnamespace
 WHERE n.nspname = 'public' AND c.relkind = 'r' AND c.relrowsecurity = false
 ORDER BY 1;

-- 2) Gegenprobe: die 15 Tabellen mit ihrem jetzigen Zustand.
SELECT c.relname                                        AS tabelle,
       c.relrowsecurity                                 AS rls_aktiv,
       (SELECT count(*) FROM pg_policies p
         WHERE p.schemaname='public' AND p.tablename=c.relname) AS policies
  FROM pg_class c
  JOIN pg_namespace n ON n.oid = c.relnamespace
 WHERE n.nspname = 'public'
   AND c.relname IN ('invoices','invoice_counter','suppliers','purchases',
                     'purchase_items','beta_feedback','blog_comments',
                     'return_checklists','admin_notifications','blog_posts',
                     'blog_categories','blog_auto_topics','blog_schedule',
                     'blog_series','blog_series_parts')
 ORDER BY 1;

-- ════════════════════════════════════════════════════════════════════════
-- Smoke-Test nach dem Ausführen (im Browser)
-- ════════════════════════════════════════════════════════════════════════
--   Startseite · /kameras · eine Produktseite · /blog · ein Blogartikel
--   Admin: /admin/buchhaltung (Rechnungen) · /admin/blog/artikel · /admin/einkauf
--
-- Rollback (nur im Notfall, pro Tabelle):
--   ALTER TABLE public.<tabelle> DISABLE ROW LEVEL SECURITY;
