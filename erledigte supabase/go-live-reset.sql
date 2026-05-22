-- ════════════════════════════════════════════════════════════════════
-- cam2rent Go-Live DB-Reset
-- ════════════════════════════════════════════════════════════════════
-- Setzt die Datenbank fuer den Go-Live auf null:
--   - Alle Buchungen, Rechnungen, Gutschriften, Mahnungen, Mails,
--     Audit-Log, Stripe-Logs, Vertraege, Schaeden, Konversationen,
--     Bewertungen, Favoriten, UGC, Waitlist, Newsletter,
--     Push-Subs, Notifications, Beta-Feedback weg
--   - Social-Modul komplett (Posts, Reels, Themen, Serien, Plan)
--   - Anlagenverzeichnis: nur is_test=TRUE Eintraege weg
--   - admin_settings: nur Cron-Locks und Job-State weg
--   - invoice_counter zurueck auf null
--
-- BLEIBT:
--   - admin_users (Mitarbeiter), admin_settings (Konfig),
--     legal_documents, blog_*, accessories, sets, product_units,
--     accessory_units, social_accounts (OAuth zu FB/IG),
--     coupons, suppliers, echte Anlagen/Einkaeufe/Ausgaben
--
-- AUSSERHALB DIESES SKRIPTS NOTWENDIG:
--   1. Backup vorher (Supabase Dashboard → Database → Backups)
--   2. Coolify stoppen (Cron koennte sonst reinhauen)
--   3. auth.users separat (siehe Phase 2 im Plan)
--   4. Storage-Buckets manuell (Phase 3 im Plan)
--
-- Das Skript ist robust gegen fehlende Tabellen — falls eine Tabelle
-- in dieser DB nicht existiert, wird sie stillschweigend uebersprungen.
-- Komplett transaktional: bei Fehler ROLLBACK auf null Aenderungen.
-- ════════════════════════════════════════════════════════════════════

BEGIN;

-- ─────────────────────────────────────────────────────────────────
-- 1) Social-Modul + 2) Buchungs-Children + 3) Bookings + 5) Counter
--
-- Eine Schleife ueber eine geordnete Liste, FK-sicher von Children
-- zu Parents. Fehlende Tabellen werden uebersprungen (Notice).
-- ─────────────────────────────────────────────────────────────────
DO $$
DECLARE
  tables_to_clear text[] := ARRAY[
    -- Social-Modul (Children → Parents); social_accounts BLEIBT
    'social_reel_segments',
    'social_reel_plan',
    'social_reel_templates',
    'social_reels',
    'social_editorial_plan',
    'social_schedule',
    'social_insights',
    'social_series_parts',
    'social_series',
    'social_topics',
    'social_posts',
    'social_templates',

    -- Buchungs-Children
    'messages',
    'conversations',
    'rental_agreements',
    'damage_reports',
    'return_checklists',
    'dunning_notices',
    'credit_notes',
    'invoices',
    'stripe_transactions',
    'email_log',
    -- admin_audit_log siehe separater DO-Block (Trigger-Schutz)
    'abandoned_carts',
    'reviews',
    'favorites',
    'customer_ugc_submissions',
    'waitlist_subscriptions',
    'newsletter_subscribers',
    'customer_push_subscriptions',
    'push_subscriptions',
    'admin_notifications',
    'beta_feedback',
    'admin_customer_notes',
    'customer_notes',

    -- Bookings selbst (kommt nach allen Children)
    'bookings',

    -- Counter (komplett leeren — naechster next_invoice_number()
    -- Aufruf legt Jahres-Zeile mit last_number=1 wieder an)
    'invoice_counter'
  ];
  t        text;
  affected bigint;
BEGIN
  FOREACH t IN ARRAY tables_to_clear LOOP
    IF EXISTS (
      SELECT 1 FROM pg_tables
       WHERE schemaname = 'public' AND tablename = t
    ) THEN
      EXECUTE format('DELETE FROM public.%I', t);
      GET DIAGNOSTICS affected = ROW_COUNT;
      RAISE NOTICE '%: % rows deleted', t, affected;
    ELSE
      RAISE NOTICE '%: skipped (table does not exist)', t;
    END IF;
  END LOOP;
END $$;

-- ─────────────────────────────────────────────────────────────────
-- admin_audit_log hat einen GoBD-Schutz-Trigger gegen DELETE.
-- Trigger temporaer abschalten, leeren, wieder einschalten.
-- ─────────────────────────────────────────────────────────────────
DO $$
DECLARE
  affected bigint;
BEGIN
  IF EXISTS (
    SELECT 1 FROM pg_tables
     WHERE schemaname = 'public' AND tablename = 'admin_audit_log'
  ) THEN
    ALTER TABLE admin_audit_log DISABLE TRIGGER trg_prevent_audit_log_delete;
    DELETE FROM admin_audit_log;
    GET DIAGNOSTICS affected = ROW_COUNT;
    ALTER TABLE admin_audit_log ENABLE TRIGGER trg_prevent_audit_log_delete;
    RAISE NOTICE 'admin_audit_log: % rows deleted (trigger toggled)', affected;
  ELSE
    RAISE NOTICE 'admin_audit_log: skipped (table does not exist)';
  END IF;
END $$;

-- ─────────────────────────────────────────────────────────────────
-- 4) Anlagenverzeichnis — nur Test-Daten weg (is_test=TRUE)
-- ─────────────────────────────────────────────────────────────────
DO $$
DECLARE
  affected bigint;
BEGIN
  IF EXISTS (SELECT 1 FROM pg_tables WHERE schemaname='public' AND tablename='expenses') THEN
    DELETE FROM expenses WHERE is_test = TRUE;
    GET DIAGNOSTICS affected = ROW_COUNT;
    RAISE NOTICE 'expenses (is_test=true): % rows deleted', affected;
  END IF;

  IF EXISTS (SELECT 1 FROM pg_tables WHERE schemaname='public' AND tablename='purchase_items')
     AND EXISTS (SELECT 1 FROM pg_tables WHERE schemaname='public' AND tablename='purchases') THEN
    DELETE FROM purchase_items
     WHERE purchase_id IN (SELECT id FROM purchases WHERE is_test = TRUE);
    GET DIAGNOSTICS affected = ROW_COUNT;
    RAISE NOTICE 'purchase_items (linked to test purchases): % rows deleted', affected;
  END IF;

  IF EXISTS (SELECT 1 FROM pg_tables WHERE schemaname='public' AND tablename='purchases') THEN
    DELETE FROM purchases WHERE is_test = TRUE;
    GET DIAGNOSTICS affected = ROW_COUNT;
    RAISE NOTICE 'purchases (is_test=true): % rows deleted', affected;
  END IF;

  IF EXISTS (SELECT 1 FROM pg_tables WHERE schemaname='public' AND tablename='assets') THEN
    DELETE FROM assets WHERE is_test = TRUE;
    GET DIAGNOSTICS affected = ROW_COUNT;
    RAISE NOTICE 'assets (is_test=true): % rows deleted', affected;
  END IF;
END $$;

-- ─────────────────────────────────────────────────────────────────
-- 6) Transiente admin_settings-Keys (Cron-Locks + Job-State)
-- ─────────────────────────────────────────────────────────────────
DELETE FROM admin_settings
 WHERE key LIKE 'cron_lock_%'
    OR key IN ('social_plan_job', 'social_generation_status', 'blog_generation_status');

-- ─────────────────────────────────────────────────────────────────
-- 7) Live-Modus festschreiben (defensiv)
-- ─────────────────────────────────────────────────────────────────
UPDATE admin_settings
   SET value = jsonb_build_object('mode', 'live')
 WHERE key = 'environment_mode';

COMMIT;

-- ════════════════════════════════════════════════════════════════════
-- Verifikation (separat ausfuehren)
-- ════════════════════════════════════════════════════════════════════
-- Sollten alle 0 sein:
--
-- SELECT 'bookings' AS tabelle, COUNT(*) FROM bookings
-- UNION ALL SELECT 'invoices', COUNT(*) FROM invoices
-- UNION ALL SELECT 'credit_notes', COUNT(*) FROM credit_notes
-- UNION ALL SELECT 'rental_agreements', COUNT(*) FROM rental_agreements
-- UNION ALL SELECT 'damage_reports', COUNT(*) FROM damage_reports
-- UNION ALL SELECT 'email_log', COUNT(*) FROM email_log
-- UNION ALL SELECT 'admin_audit_log', COUNT(*) FROM admin_audit_log
-- UNION ALL SELECT 'social_posts', COUNT(*) FROM social_posts
-- UNION ALL SELECT 'social_reels', COUNT(*) FROM social_reels
-- UNION ALL SELECT 'profiles', COUNT(*) FROM profiles
-- UNION ALL SELECT 'auth.users', COUNT(*) FROM auth.users;
--
-- Sollten > 0 sein (Stamm/Konfig):
--
-- SELECT 'admin_users' AS tabelle, COUNT(*) FROM admin_users
-- UNION ALL SELECT 'admin_settings', COUNT(*) FROM admin_settings
-- UNION ALL SELECT 'product_units', COUNT(*) FROM product_units
-- UNION ALL SELECT 'accessory_units', COUNT(*) FROM accessory_units
-- UNION ALL SELECT 'legal_documents', COUNT(*) FROM legal_documents
-- UNION ALL SELECT 'blog_posts', COUNT(*) FROM blog_posts
-- UNION ALL SELECT 'social_accounts', COUNT(*) FROM social_accounts
-- UNION ALL SELECT 'assets (live)', COUNT(*) FROM assets WHERE is_test=FALSE
-- UNION ALL SELECT 'purchases (live)', COUNT(*) FROM purchases WHERE is_test=FALSE;
--
-- Sicherheitsnetz — keine is_test=TRUE Reste:
--
-- SELECT 'assets is_test=true', COUNT(*) FROM assets WHERE is_test=TRUE
-- UNION ALL SELECT 'purchases is_test=true', COUNT(*) FROM purchases WHERE is_test=TRUE
-- UNION ALL SELECT 'expenses is_test=true', COUNT(*) FROM expenses WHERE is_test=TRUE;
-- ════════════════════════════════════════════════════════════════════
