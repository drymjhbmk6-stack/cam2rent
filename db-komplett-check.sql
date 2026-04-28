-- ────────────────────────────────────────────────────────────────────────────
-- cam2rent — DB-Komplett-Check
-- ────────────────────────────────────────────────────────────────────────────
-- Einmal in Supabase → SQL Editor reinkopieren und ausführen.
-- Liest NUR — verändert nichts.
--
-- Liefert vier Ergebnisblöcke:
--   1. Übersicht: alle erwarteten Tabellen mit ✓/✗
--   2. Spalten-Checks für nachträglich hinzugefügte Spalten (is_test etc.)
--   3. Storage-Buckets
--   4. Zusammenfassung — wie viele Tabellen vorhanden vs. erwartet
--
-- Stand: 2026-04-28 — Tabellennamen mit der echten DB abgeglichen.
-- ────────────────────────────────────────────────────────────────────────────


-- ════ Block 1 ════════════════════════════════════════════════════════════════
-- Erwartete Tabellen — ✓ / ✗ pro Tabelle, gruppiert nach Modul
-- ════════════════════════════════════════════════════════════════════════════
WITH expected(modul, tabelle) AS (
  VALUES
    -- Kern
    ('Kern',           'profiles'),
    ('Kern',           'admin_settings'),
    ('Kern',           'admin_config'),
    ('Kern',           'admin_users'),
    ('Kern',           'admin_sessions'),
    ('Kern',           'admin_audit_log'),
    ('Kern',           'admin_notifications'),

    -- Buchungen
    ('Buchungen',      'bookings'),
    ('Buchungen',      'rental_agreements'),
    ('Buchungen',      'product_units'),
    ('Buchungen',      'damage_reports'),
    ('Buchungen',      'return_checklists'),

    -- Katalog
    ('Katalog',        'accessories'),
    ('Katalog',        'sets'),
    ('Katalog',        'suppliers'),

    -- Kunden
    ('Kunden',         'admin_customer_notes'),
    ('Kunden',         'waitlist_subscriptions'),
    ('Kunden',         'customer_ugc_submissions'),
    ('Kunden',         'newsletter_subscribers'),
    ('Kunden',         'customer_push_subscriptions'),

    -- Buchhaltung
    ('Buchhaltung',    'invoices'),
    ('Buchhaltung',    'invoice_counter'),
    ('Buchhaltung',    'credit_notes'),
    ('Buchhaltung',    'dunning_notices'),
    ('Buchhaltung',    'stripe_transactions'),
    ('Buchhaltung',    'expenses'),
    ('Buchhaltung',    'export_log'),

    -- Anlagen
    ('Anlagen',        'assets'),
    ('Anlagen',        'purchases'),
    ('Anlagen',        'purchase_items'),

    -- E-Mail / Kommunikation
    ('Kommunikation',  'email_log'),
    ('Kommunikation',  'messages'),
    ('Kommunikation',  'conversations'),
    ('Kommunikation',  'push_subscriptions'),

    -- Aktionen
    ('Aktionen',       'coupons'),

    -- Bewertungen / Beta
    ('Feedback',       'reviews'),
    ('Feedback',       'beta_feedback'),

    -- Blog
    ('Blog',           'blog_posts'),
    ('Blog',           'blog_categories'),
    ('Blog',           'blog_comments'),
    ('Blog',           'blog_schedule'),
    ('Blog',           'blog_auto_topics'),
    ('Blog',           'blog_series'),
    ('Blog',           'blog_series_parts'),

    -- Social Media
    ('Social',         'social_accounts'),
    ('Social',         'social_posts'),
    ('Social',         'social_templates'),
    ('Social',         'social_schedule'),
    ('Social',         'social_insights'),
    ('Social',         'social_topics'),
    ('Social',         'social_series'),
    ('Social',         'social_series_parts'),
    ('Social',         'social_editorial_plan'),

    -- Reels
    ('Reels',          'social_reels'),
    ('Reels',          'social_reel_templates'),
    ('Reels',          'social_reel_plan'),
    ('Reels',          'social_reel_segments'),

    -- Rechtstexte
    ('Legal',          'legal_documents'),
    ('Legal',          'legal_document_versions'),

    -- Analytics
    ('Analytics',      'page_views')
)
SELECT
  e.modul                                              AS "Modul",
  e.tabelle                                            AS "Tabelle",
  CASE WHEN t.table_name IS NULL THEN '✗ FEHLT' ELSE '✓ vorhanden' END AS "Status"
FROM expected e
LEFT JOIN information_schema.tables t
  ON t.table_schema = 'public'
 AND t.table_name   = e.tabelle
ORDER BY
  CASE WHEN t.table_name IS NULL THEN 0 ELSE 1 END,
  e.modul,
  e.tabelle;


-- ════ Block 2 ════════════════════════════════════════════════════════════════
-- Wichtige Spalten-Checks (nachträglich per ALTER TABLE hinzugefügt)
-- ════════════════════════════════════════════════════════════════════════════
WITH col_checks(beschreibung, t, c) AS (
  VALUES
    ('Push-Subscriptions: admin_user_id (Permission-Filter)', 'push_subscriptions',    'admin_user_id'),
    ('Reel-Templates: motion_style (Phase 2)',                'social_reel_templates', 'motion_style'),
    ('Reels: quality_metrics (Phase 2)',                      'social_reels',          'quality_metrics'),
    ('Bookings: is_test (Test/Live-Toggle)',                  'bookings',              'is_test'),
    ('Bookings: verification_required',                       'bookings',              'verification_required'),
    ('Bookings: early_service_consent_at (§ 356 BGB)',        'bookings',              'early_service_consent_at'),
    ('Bookings: stripe_payment_link_id',                      'bookings',              'stripe_payment_link_id'),
    ('Bookings: pack_status (4-Augen Versand-Pack)',          'bookings',              'pack_status'),
    ('Bookings: unit_id (Seriennummer-Tracking)',             'bookings',              'unit_id'),
    ('Invoices: is_test',                                     'invoices',              'is_test'),
    ('Email-Log: is_test',                                    'email_log',             'is_test'),
    ('Social-Posts: fb_image_position',                       'social_posts',          'fb_image_position'),
    ('Social-Posts: fb_permalink',                            'social_posts',          'fb_permalink'),
    ('Purchase-Items: classification (KI-OCR)',               'purchase_items',        'classification'),
    ('Bookings: sendcloud_parcel_id',                         'bookings',              'sendcloud_parcel_id')
)
SELECT
  cc.beschreibung                                        AS "Check",
  cc.t                                                   AS "Tabelle",
  cc.c                                                   AS "Spalte",
  CASE
    WHEN col.column_name IS NOT NULL THEN '✓ vorhanden'
    WHEN tab.table_name  IS NULL     THEN '⚠ Tabelle fehlt'
    ELSE '✗ Spalte fehlt'
  END                                                    AS "Status"
FROM col_checks cc
LEFT JOIN information_schema.tables tab
  ON tab.table_schema = 'public' AND tab.table_name = cc.t
LEFT JOIN information_schema.columns col
  ON col.table_schema = 'public' AND col.table_name = cc.t AND col.column_name = cc.c
ORDER BY
  CASE WHEN col.column_name IS NULL THEN 0 ELSE 1 END,
  cc.t, cc.c;


-- ════ Block 3 ════════════════════════════════════════════════════════════════
-- Storage-Buckets (manuell anzulegen — werden NICHT durch Migrationen erstellt)
-- ════════════════════════════════════════════════════════════════════════════
WITH expected_buckets(name) AS (
  VALUES
    ('product-images'),
    ('set-images'),
    ('blog-images'),
    ('id-documents'),
    ('contracts'),
    ('damage-photos'),
    ('legal-documents'),
    ('packing-photos'),
    ('customer-ugc'),
    ('purchase-invoices'),
    ('social-reels')
)
SELECT
  eb.name                                                AS "Bucket",
  CASE WHEN b.id IS NULL THEN '✗ FEHLT (manuell anlegen)' ELSE '✓ vorhanden' END AS "Status",
  COALESCE(b.public::text, '—')                          AS "Public",
  COALESCE(b.file_size_limit::text, '—')                 AS "Size-Limit"
FROM expected_buckets eb
LEFT JOIN storage.buckets b ON b.id = eb.name
ORDER BY
  CASE WHEN b.id IS NULL THEN 0 ELSE 1 END,
  eb.name;


-- ════ Block 4 ════════════════════════════════════════════════════════════════
-- Zusammenfassung
-- ════════════════════════════════════════════════════════════════════════════
WITH expected(tabelle) AS (
  VALUES
    -- Kern
    ('profiles'),('admin_settings'),('admin_config'),('admin_users'),
    ('admin_sessions'),('admin_audit_log'),('admin_notifications'),
    -- Buchungen
    ('bookings'),('rental_agreements'),('product_units'),('damage_reports'),
    ('return_checklists'),
    -- Katalog
    ('accessories'),('sets'),('suppliers'),
    -- Kunden
    ('admin_customer_notes'),('waitlist_subscriptions'),('customer_ugc_submissions'),
    ('newsletter_subscribers'),('customer_push_subscriptions'),
    -- Buchhaltung
    ('invoices'),('invoice_counter'),('credit_notes'),('dunning_notices'),
    ('stripe_transactions'),('expenses'),('export_log'),
    -- Anlagen
    ('assets'),('purchases'),('purchase_items'),
    -- Kommunikation
    ('email_log'),('messages'),('conversations'),('push_subscriptions'),
    -- Aktionen
    ('coupons'),
    -- Feedback
    ('reviews'),('beta_feedback'),
    -- Blog
    ('blog_posts'),('blog_categories'),('blog_comments'),('blog_schedule'),
    ('blog_auto_topics'),('blog_series'),('blog_series_parts'),
    -- Social
    ('social_accounts'),('social_posts'),('social_templates'),('social_schedule'),
    ('social_insights'),('social_topics'),('social_series'),('social_series_parts'),
    ('social_editorial_plan'),
    -- Reels
    ('social_reels'),('social_reel_templates'),('social_reel_plan'),('social_reel_segments'),
    -- Legal
    ('legal_documents'),('legal_document_versions'),
    -- Analytics
    ('page_views')
)
SELECT
  COUNT(*)                                                              AS "Erwartet",
  COUNT(*) FILTER (WHERE t.table_name IS NOT NULL)                      AS "Vorhanden",
  COUNT(*) FILTER (WHERE t.table_name IS NULL)                          AS "Fehlend",
  ROUND(100.0 * COUNT(*) FILTER (WHERE t.table_name IS NOT NULL) / COUNT(*), 1) || ' %' AS "Quote"
FROM expected e
LEFT JOIN information_schema.tables t
  ON t.table_schema = 'public' AND t.table_name = e.tabelle;
