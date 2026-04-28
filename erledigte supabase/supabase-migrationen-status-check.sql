-- ────────────────────────────────────────────────────────────────────────────
-- Supabase-Migrationen: Status-Check
-- ────────────────────────────────────────────────────────────────────────────
-- Einmal im Supabase → SQL Editor ausführen. Das Ergebnis ist eine Tabelle
-- mit je einer Zeile pro Migration und Status "ERLEDIGT" oder "OFFEN".
--
-- Wenn eine Zeile "ERLEDIGT" zeigt, kann die zugehörige SQL-Datei im Repo
-- in den Ordner "erledigte supabase/" verschoben werden.
--
-- Dieses Script ändert NICHTS in der DB — nur Lesen.
-- ────────────────────────────────────────────────────────────────────────────

WITH checks AS (

  -- 1. supabase-social.sql (5 Kern-Tabellen)
  SELECT
    'supabase-social.sql' AS migration,
    CASE
      WHEN COUNT(*) FILTER (WHERE table_name IN (
        'social_accounts', 'social_posts', 'social_templates',
        'social_schedule', 'social_insights'
      )) = 5 THEN 'ERLEDIGT'
      ELSE 'OFFEN (' || COUNT(*) FILTER (WHERE table_name IN (
        'social_accounts', 'social_posts', 'social_templates',
        'social_schedule', 'social_insights'
      ))::text || '/5 Tabellen vorhanden)'
    END AS status
  FROM information_schema.tables
  WHERE table_schema = 'public'

  UNION ALL

  -- 2. supabase-social-extended.sql (4 Erweiterungs-Tabellen)
  SELECT
    'supabase-social-extended.sql',
    CASE
      WHEN COUNT(*) FILTER (WHERE table_name IN (
        'social_topics', 'social_series', 'social_series_parts',
        'social_editorial_plan'
      )) = 4 THEN 'ERLEDIGT'
      ELSE 'OFFEN (' || COUNT(*) FILTER (WHERE table_name IN (
        'social_topics', 'social_series', 'social_series_parts',
        'social_editorial_plan'
      ))::text || '/4 Tabellen vorhanden)'
    END
  FROM information_schema.tables
  WHERE table_schema = 'public'

  UNION ALL

  -- 3. supabase-social-image-position.sql (2 Spalten auf social_posts)
  SELECT
    'supabase-social-image-position.sql',
    CASE
      WHEN COUNT(*) FILTER (WHERE column_name IN (
        'fb_image_position', 'ig_image_position'
      )) = 2 THEN 'ERLEDIGT'
      WHEN NOT EXISTS (
        SELECT 1 FROM information_schema.tables
        WHERE table_schema = 'public' AND table_name = 'social_posts'
      ) THEN 'VORAUSSETZUNG FEHLT (social_posts nicht da)'
      ELSE 'OFFEN'
    END
  FROM information_schema.columns
  WHERE table_schema = 'public' AND table_name = 'social_posts'

  UNION ALL

  -- 4. supabase-social-permalinks.sql (2 Spalten auf social_posts)
  SELECT
    'supabase-social-permalinks.sql',
    CASE
      WHEN COUNT(*) FILTER (WHERE column_name IN (
        'fb_permalink', 'ig_permalink'
      )) = 2 THEN 'ERLEDIGT'
      WHEN NOT EXISTS (
        SELECT 1 FROM information_schema.tables
        WHERE table_schema = 'public' AND table_name = 'social_posts'
      ) THEN 'VORAUSSETZUNG FEHLT (social_posts nicht da)'
      ELSE 'OFFEN'
    END
  FROM information_schema.columns
  WHERE table_schema = 'public' AND table_name = 'social_posts'

  UNION ALL

  -- 5. supabase-waitlist.sql (Tabelle waitlist_subscriptions)
  SELECT
    'supabase-waitlist.sql',
    CASE
      WHEN COUNT(*) = 1 THEN 'ERLEDIGT'
      ELSE 'OFFEN'
    END
  FROM information_schema.tables
  WHERE table_schema = 'public' AND table_name = 'waitlist_subscriptions'

  UNION ALL

  -- 6. supabase-performance-indizes.sql (8 Indizes)
  SELECT
    'supabase-performance-indizes.sql',
    CASE
      WHEN COUNT(*) = 8 THEN 'ERLEDIGT'
      ELSE 'OFFEN (' || COUNT(*)::text || '/8 Indizes vorhanden)'
    END
  FROM pg_indexes
  WHERE schemaname = 'public'
    AND indexname IN (
      'idx_bookings_user_id',
      'idx_bookings_created_at',
      'idx_bookings_product_period',
      'idx_email_log_booking_id',
      'idx_blog_posts_status_created',
      'idx_social_posts_status_sched',
      'idx_waitlist_product_id',
      'idx_rental_agreements_booking_id'
    )

  UNION ALL

  -- 7. supabase-coupon-atomic-increment.sql (RPC-Funktion)
  SELECT
    'supabase-coupon-atomic-increment.sql',
    CASE
      WHEN COUNT(*) = 1 THEN 'ERLEDIGT'
      ELSE 'OFFEN'
    END
  FROM pg_proc p
  JOIN pg_namespace n ON n.oid = p.pronamespace
  WHERE n.nspname = 'public'
    AND p.proname = 'increment_coupon_if_available'

  UNION ALL

  -- 8. supabase-invoice-numbers-gobd.sql (Counter-Tabelle + RPC)
  SELECT
    'supabase-invoice-numbers-gobd.sql',
    CASE
      WHEN (
        SELECT COUNT(*) FROM information_schema.tables
        WHERE table_schema = 'public' AND table_name = 'invoice_counter'
      ) = 1
       AND (
        SELECT COUNT(*) FROM pg_proc p
        JOIN pg_namespace n ON n.oid = p.pronamespace
        WHERE n.nspname = 'public' AND p.proname = 'next_invoice_number'
      ) = 1
      THEN 'ERLEDIGT'
      ELSE 'OFFEN'
    END

  UNION ALL

  -- 9. supabase-storage-rls.sql (3 Policies auf storage.objects)
  SELECT
    'supabase-storage-rls.sql',
    CASE
      WHEN COUNT(*) >= 3 THEN 'ERLEDIGT'
      ELSE 'OFFEN (' || COUNT(*)::text || '/>=3 Policies vorhanden)'
    END
  FROM pg_policies
  WHERE schemaname = 'storage'
    AND tablename = 'objects'
    AND policyname IN (
      'id-documents select own',
      'contracts select own',
      'damage-photos select own'
    )
)
SELECT migration, status
  FROM checks
 ORDER BY
   CASE status WHEN 'ERLEDIGT' THEN 1 ELSE 0 END,
   migration;
