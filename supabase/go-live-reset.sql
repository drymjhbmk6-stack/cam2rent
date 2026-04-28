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
--   - invoice_counter zurueck auf 0
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
-- Helper: leert eine Tabelle nur wenn sie existiert.
-- TEMP-Funktion lebt nur fuer diese Session, wird automatisch
-- mit COMMIT/ROLLBACK weggeraeumt.
-- ─────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION pg_temp.del_if(tbl text) RETURNS void AS $$
DECLARE
  rows_affected bigint;
BEGIN
  IF EXISTS (
    SELECT 1 FROM pg_tables
     WHERE schemaname = 'public' AND tablename = tbl
  ) THEN
    EXECUTE format('DELETE FROM public.%I', tbl);
    GET DIAGNOSTICS rows_affected = ROW_COUNT;
    RAISE NOTICE '%: % rows deleted', tbl, rows_affected;
  ELSE
    RAISE NOTICE '%: table does not exist (skipped)', tbl;
  END IF;
END $$ LANGUAGE plpgsql;

-- ─────────────────────────────────────────────────────────────────
-- 1) Social-Modul (Children → Parents)
-- ─────────────────────────────────────────────────────────────────
SELECT pg_temp.del_if('social_reel_segments');
SELECT pg_temp.del_if('social_reel_plan');
SELECT pg_temp.del_if('social_reel_templates');
SELECT pg_temp.del_if('social_reels');
SELECT pg_temp.del_if('social_editorial_plan');
SELECT pg_temp.del_if('social_schedule');
SELECT pg_temp.del_if('social_insights');
SELECT pg_temp.del_if('social_series_parts');
SELECT pg_temp.del_if('social_series');
SELECT pg_temp.del_if('social_topics');
SELECT pg_temp.del_if('social_posts');
SELECT pg_temp.del_if('social_templates');
-- social_accounts BLEIBT (OAuth-Verbindung FB-Page + IG-Account)

-- ─────────────────────────────────────────────────────────────────
-- 2) Buchungs-Children (Tabellen mit FK auf bookings oder Kunden)
-- ─────────────────────────────────────────────────────────────────
SELECT pg_temp.del_if('messages');
SELECT pg_temp.del_if('conversations');
SELECT pg_temp.del_if('rental_agreements');
SELECT pg_temp.del_if('damage_reports');
SELECT pg_temp.del_if('return_checklists');
SELECT pg_temp.del_if('dunning_notices');
SELECT pg_temp.del_if('credit_notes');
SELECT pg_temp.del_if('invoices');
SELECT pg_temp.del_if('stripe_transactions');
SELECT pg_temp.del_if('email_log');

-- admin_audit_log hat einen GoBD-Schutz-Trigger, temporaer disablen
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM pg_tables
     WHERE schemaname = 'public' AND tablename = 'admin_audit_log'
  ) THEN
    ALTER TABLE admin_audit_log DISABLE TRIGGER trg_prevent_audit_log_delete;
    DELETE FROM admin_audit_log;
    ALTER TABLE admin_audit_log ENABLE TRIGGER trg_prevent_audit_log_delete;
    RAISE NOTICE 'admin_audit_log: cleared (trigger toggled)';
  END IF;
END $$;

SELECT pg_temp.del_if('abandoned_carts');
SELECT pg_temp.del_if('reviews');
SELECT pg_temp.del_if('favorites');
SELECT pg_temp.del_if('customer_ugc_submissions');
SELECT pg_temp.del_if('waitlist_subscriptions');
SELECT pg_temp.del_if('newsletter_subscribers');
SELECT pg_temp.del_if('customer_push_subscriptions');
SELECT pg_temp.del_if('push_subscriptions');
SELECT pg_temp.del_if('admin_notifications');
SELECT pg_temp.del_if('beta_feedback');
SELECT pg_temp.del_if('admin_customer_notes');
SELECT pg_temp.del_if('customer_notes');

-- ─────────────────────────────────────────────────────────────────
-- 3) Bookings selbst
-- ─────────────────────────────────────────────────────────────────
SELECT pg_temp.del_if('bookings');

-- ─────────────────────────────────────────────────────────────────
-- 4) Anlagenverzeichnis — nur Test-Daten weg
-- ─────────────────────────────────────────────────────────────────
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_tables WHERE schemaname='public' AND tablename='expenses') THEN
    DELETE FROM expenses WHERE is_test = TRUE;
  END IF;
  IF EXISTS (SELECT 1 FROM pg_tables WHERE schemaname='public' AND tablename='purchase_items')
     AND EXISTS (SELECT 1 FROM pg_tables WHERE schemaname='public' AND tablename='purchases') THEN
    DELETE FROM purchase_items
     WHERE purchase_id IN (SELECT id FROM purchases WHERE is_test = TRUE);
  END IF;
  IF EXISTS (SELECT 1 FROM pg_tables WHERE schemaname='public' AND tablename='purchases') THEN
    DELETE FROM purchases WHERE is_test = TRUE;
  END IF;
  IF EXISTS (SELECT 1 FROM pg_tables WHERE schemaname='public' AND tablename='assets') THEN
    DELETE FROM assets WHERE is_test = TRUE;
  END IF;
END $$;

-- ─────────────────────────────────────────────────────────────────
-- 5) Counter zuruecksetzen
-- invoice_counter ist pro Jahr partitioniert (year, last_number).
-- Komplett leeren — beim naechsten next_invoice_number()-Aufruf
-- wird die Zeile fuer das Jahr automatisch wieder mit 1 angelegt.
-- ─────────────────────────────────────────────────────────────────
SELECT pg_temp.del_if('invoice_counter');

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
