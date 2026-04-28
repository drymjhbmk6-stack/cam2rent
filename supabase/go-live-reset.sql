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
-- Komplett transaktional — bei Fehler ROLLBACK auf null Aenderungen.
-- ════════════════════════════════════════════════════════════════════

BEGIN;

-- ─────────────────────────────────────────────────────────────────
-- 1) Social-Modul (Children → Parents)
-- ─────────────────────────────────────────────────────────────────
DELETE FROM social_reel_segments;
DELETE FROM social_reel_plan;
DELETE FROM social_reel_templates;
DELETE FROM social_reels;
DELETE FROM social_editorial_plan;
DELETE FROM social_schedule;
DELETE FROM social_insights;
DELETE FROM social_series_parts;
DELETE FROM social_series;
DELETE FROM social_topics;
DELETE FROM social_posts;
DELETE FROM social_templates;
-- social_accounts BLEIBT (OAuth-Verbindung FB-Page + IG-Account)

-- ─────────────────────────────────────────────────────────────────
-- 2) Buchungs-Children (Tabellen mit FK auf bookings oder Kunden)
-- ─────────────────────────────────────────────────────────────────
DELETE FROM messages;
DELETE FROM conversations;
DELETE FROM rental_agreements;
DELETE FROM damage_reports;
DELETE FROM return_checklists;
DELETE FROM dunning_notices;
DELETE FROM credit_notes;
DELETE FROM invoices;
DELETE FROM stripe_transactions;
DELETE FROM email_log;

-- admin_audit_log hat einen GoBD-Schutz-Trigger, temporaer disablen
ALTER TABLE admin_audit_log DISABLE TRIGGER trg_prevent_audit_log_delete;
DELETE FROM admin_audit_log;
ALTER TABLE admin_audit_log ENABLE TRIGGER trg_prevent_audit_log_delete;

DELETE FROM abandoned_carts;
DELETE FROM reviews;
DELETE FROM favorites;
DELETE FROM customer_ugc_submissions;
DELETE FROM waitlist_subscriptions;
DELETE FROM newsletter_subscribers;
DELETE FROM customer_push_subscriptions;
DELETE FROM push_subscriptions;
DELETE FROM admin_notifications;
DELETE FROM beta_feedback;
DELETE FROM customer_notes;

-- ─────────────────────────────────────────────────────────────────
-- 3) Bookings selbst
-- ─────────────────────────────────────────────────────────────────
DELETE FROM bookings;

-- ─────────────────────────────────────────────────────────────────
-- 4) Anlagenverzeichnis — nur Test-Daten weg
-- ─────────────────────────────────────────────────────────────────
DELETE FROM expenses WHERE is_test = TRUE;
DELETE FROM purchase_items
 WHERE purchase_id IN (SELECT id FROM purchases WHERE is_test = TRUE);
DELETE FROM purchases WHERE is_test = TRUE;
DELETE FROM assets WHERE is_test = TRUE;

-- ─────────────────────────────────────────────────────────────────
-- 5) Counter zuruecksetzen
-- ─────────────────────────────────────────────────────────────────
UPDATE invoice_counter SET counter = 0;

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
