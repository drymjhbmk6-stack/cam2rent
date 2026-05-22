-- ============================================================
-- Migration-Status-Check (Stand 2026-05-23)
--
-- Read-only Script: prueft fuer jede offene Migration in /supabase, ob sie
-- gegen die aktuelle DB schon angewendet wurde. Liefert pro Migration eine
-- Zeile mit Status + Hinweis.
--
-- Status:
--   ERLEDIGT          Migration ist erkennbar angewendet (Tabelle/Spalte/etc. da)
--   OFFEN             Migration ist noch nicht angewendet
--   MANUELL           Nicht automatisch pruefbar (Backfill/Cleanup/RPC-Update)
--   NICHT AUSFUEHREN  Reset-/Notfall-Script, nicht im Normalbetrieb laufen lassen
--
-- Verwendung:
--   1. Im Supabase SQL-Editor oder via psql ausfuehren.
--   2. Alle Migrationen mit Status 'ERLEDIGT' koennen aus supabase/ in
--      'erledigte supabase/' verschoben werden.
--   3. Bei 'MANUELL' im Hinweis nachlesen, was zu pruefen ist.
-- ============================================================

WITH checks AS (

  -- ── Tabellen-Migrationen ────────────────────────────────────────────────
  SELECT 'supabase-angebote' AS migration,
         EXISTS (SELECT 1 FROM information_schema.tables
                 WHERE table_schema='public' AND table_name='angebote') AS done,
         'Tabelle angebote + bookings.offer_id' AS hinweis
  UNION ALL
  SELECT 'supabase-booking-interest',
         EXISTS (SELECT 1 FROM information_schema.tables
                 WHERE table_schema='public' AND table_name='booking_interest'),
         'Tabelle booking_interest'
  UNION ALL
  SELECT 'supabase-availability-alerts',
         EXISTS (SELECT 1 FROM information_schema.tables
                 WHERE table_schema='public' AND table_name='availability_alerts'),
         'Tabelle availability_alerts'
  UNION ALL
  SELECT 'supabase-calendar-notes',
         EXISTS (SELECT 1 FROM information_schema.tables
                 WHERE table_schema='public' AND table_name='calendar_notes'),
         'Tabelle calendar_notes'
  UNION ALL
  SELECT 'supabase-client-errors',
         EXISTS (SELECT 1 FROM information_schema.tables
                 WHERE table_schema='public' AND table_name='client_errors'),
         'Tabelle client_errors'
  UNION ALL
  SELECT 'supabase-purchase-attachments',
         EXISTS (SELECT 1 FROM information_schema.tables
                 WHERE table_schema='public' AND table_name='purchase_attachments'),
         'Tabelle purchase_attachments'
  UNION ALL
  SELECT 'supabase-booking-id-counter',
         EXISTS (SELECT 1 FROM information_schema.tables
                 WHERE table_schema='public' AND table_name='booking_id_counter'),
         'Tabelle booking_id_counter + RPC next_booking_counter'
  UNION ALL
  SELECT 'inventar-code-segmente',
         EXISTS (SELECT 1 FROM information_schema.tables
                 WHERE table_schema='public' AND table_name='inventar_code_segmente'),
         'Tabelle inventar_code_segmente'
  UNION ALL
  SELECT 'buchhaltung-konsolidierung',
         EXISTS (SELECT 1 FROM information_schema.tables
                 WHERE table_schema='public' AND table_name='belege')
         AND EXISTS (SELECT 1 FROM information_schema.tables
                 WHERE table_schema='public' AND table_name='inventar_units'),
         'Tabellen belege, beleg_positionen, inventar_units, ...'

  -- ── Spalten-Migrationen ────────────────────────────────────────────────
  UNION ALL
  SELECT 'supabase-sets-basic-for-products',
         EXISTS (SELECT 1 FROM information_schema.columns
                 WHERE table_schema='public' AND table_name='sets'
                   AND column_name='basic_for_product_ids'),
         'sets.basic_for_product_ids'
  UNION ALL
  SELECT 'supabase-bookings-tracking-carrier-return',
         EXISTS (SELECT 1 FROM information_schema.columns
                 WHERE table_schema='public' AND table_name='bookings'
                   AND column_name='tracking_carrier'),
         'bookings.tracking_carrier + return_tracking_*'
  UNION ALL
  SELECT 'supabase-bookings-edit-adjustment',
         EXISTS (SELECT 1 FROM information_schema.columns
                 WHERE table_schema='public' AND table_name='bookings'
                   AND column_name='adjustment_payment_link_id'),
         'bookings.adjustment_payment_link_id/amount/status/note'
  UNION ALL
  SELECT 'supabase-bookings-refund',
         EXISTS (SELECT 1 FROM information_schema.columns
                 WHERE table_schema='public' AND table_name='bookings'
                   AND column_name='refund_amount'),
         'bookings.refund_amount + refund_note + stripe_transactions.reconciliation_note'
  UNION ALL
  SELECT 'supabase-bookings-pack-weight',
         EXISTS (SELECT 1 FROM information_schema.columns
                 WHERE table_schema='public' AND table_name='bookings'
                   AND column_name='pack_weight_kg'),
         'bookings.pack_weight_kg'
  UNION ALL
  SELECT 'supabase-bookings-cameras',
         EXISTS (SELECT 1 FROM information_schema.columns
                 WHERE table_schema='public' AND table_name='bookings'
                   AND column_name='cameras'),
         'bookings.cameras JSONB'
  UNION ALL
  SELECT 'supabase-bookings-verkauf',
         EXISTS (SELECT 1 FROM information_schema.columns
                 WHERE table_schema='public' AND table_name='bookings'
                   AND column_name='booking_type'),
         'bookings.booking_type + sale_items'
  UNION ALL
  SELECT 'supabase-damage-reports-camera-unit',
         EXISTS (SELECT 1 FROM information_schema.columns
                 WHERE table_schema='public' AND table_name='damage_reports'
                   AND column_name='camera_unit_id'),
         'damage_reports.camera_unit_id'
  UNION ALL
  SELECT 'supabase-belege-content-dedup',
         EXISTS (SELECT 1 FROM information_schema.columns
                 WHERE table_schema='public' AND table_name='belege'
                   AND column_name='verdacht_duplikat_beleg_id'),
         'belege.verdacht_duplikat_beleg_id/grund/dismissed_at'
  UNION ALL
  SELECT 'supabase-belege-dedup-async-ocr',
         EXISTS (SELECT 1 FROM information_schema.columns
                 WHERE table_schema='public' AND table_name='belege'
                   AND column_name='ocr_status'),
         'belege.ocr_status + beleg_anhaenge.file_hash'
  UNION ALL
  SELECT 'supabase-expenses-purchase-id',
         EXISTS (SELECT 1 FROM information_schema.columns
                 WHERE table_schema='public' AND table_name='expenses'
                   AND column_name='purchase_id'),
         'expenses.purchase_id'
  UNION ALL
  SELECT 'supabase-assets-replacement-value-estimate',
         EXISTS (SELECT 1 FROM information_schema.columns
                 WHERE table_schema='public' AND table_name='assets'
                   AND column_name='replacement_value_estimate'),
         'assets.replacement_value_estimate'
  UNION ALL
  SELECT 'supabase-accessories-included-parts',
         EXISTS (SELECT 1 FROM information_schema.columns
                 WHERE table_schema='public' AND table_name='accessories'
                   AND column_name='included_parts'),
         'accessories.included_parts'
  UNION ALL
  SELECT 'supabase-accessories-is-bulk',
         EXISTS (SELECT 1 FROM information_schema.columns
                 WHERE table_schema='public' AND table_name='accessories'
                   AND column_name='is_bulk'),
         'accessories.is_bulk'
  UNION ALL
  SELECT 'supabase-accessory-specs',
         EXISTS (SELECT 1 FROM information_schema.columns
                 WHERE table_schema='public' AND table_name='accessories'
                   AND column_name='specs'),
         'accessories.specs JSONB'
  UNION ALL
  SELECT 'supabase-accessory-units-serial',
         EXISTS (SELECT 1 FROM information_schema.columns
                 WHERE table_schema='public' AND table_name='accessory_units'
                   AND column_name='serial_number'),
         'accessory_units.serial_number'
  UNION ALL
  SELECT 'supabase-buchhaltung-foundation',
         EXISTS (SELECT 1 FROM information_schema.columns
                 WHERE table_schema='public' AND table_name='invoices'
                   AND column_name='account_code'),
         'account_code + internal_beleg_no auf mehreren Tabellen'
  UNION ALL
  SELECT 'supabase-profiles-is-tester',
         EXISTS (SELECT 1 FROM information_schema.columns
                 WHERE table_schema='public' AND table_name='profiles'
                   AND column_name='is_tester'),
         'profiles.is_tester'
  UNION ALL
  SELECT 'supabase-inbound-email',
         EXISTS (SELECT 1 FROM information_schema.columns
                 WHERE table_schema='public' AND table_name='conversations'
                   AND column_name='source'),
         'conversations.source/customer_email + messages.body_html + message_attachments'
  UNION ALL
  SELECT 'supabase-inbound-email-per-employee',
         EXISTS (SELECT 1 FROM information_schema.columns
                 WHERE table_schema='public' AND table_name='admin_users'
                   AND column_name='inbox_address'),
         'admin_users.inbox_address + conversations.assigned_admin_user_id'

  -- ── Constraint/Index/Funktion-Migrationen ──────────────────────────────
  UNION ALL
  SELECT 'supabase-camera-unit-assignment',
         EXISTS (SELECT 1 FROM pg_proc p JOIN pg_namespace n ON p.pronamespace=n.oid
                 WHERE n.nspname='public' AND p.proname='assign_free_camera_units'),
         'RPC assign_free_camera_units (Multi-Kamera)'
  UNION ALL
  SELECT 'supabase-purchase-items-gwg',
         EXISTS (SELECT 1 FROM pg_constraint c JOIN pg_class t ON c.conrelid=t.oid
                 WHERE t.relname='purchase_items'
                   AND c.contype='c'
                   AND pg_get_constraintdef(c.oid) ILIKE '%gwg%'),
         'CHECK-Constraint purchase_items.classification um gwg erweitert'
  UNION ALL
  SELECT 'supabase-tech-debt-indizes',
         EXISTS (SELECT 1 FROM pg_indexes WHERE schemaname='public'
                 AND indexname='idx_invoices_test_date'),
         'Performance-Indizes (idx_invoices_test_date u.a.)'
  UNION ALL
  SELECT 'inventar-seriennummer-unique',
         EXISTS (SELECT 1 FROM pg_constraint
                 WHERE conname='inventar_units_seriennummer_unique'),
         'Unique-Constraint inventar_units.seriennummer'
  UNION ALL
  SELECT 'supabase-product-units-label-unique',
         EXISTS (SELECT 1 FROM pg_constraint
                 WHERE conname='product_units_label_unique'),
         'Unique-Constraint product_units.label'
  UNION ALL
  SELECT 'supabase-profiles-rls-column-level',
         EXISTS (SELECT 1 FROM pg_policies
                 WHERE schemaname='public' AND tablename='profiles'
                   AND policyname='users_update_own_profile'
                   AND with_check IS NOT NULL),
         'RLS-Policy mit WITH CHECK + Spalten-Level-GRANT'
  UNION ALL
  SELECT 'supabase-accessories-id-rename',
         EXISTS (SELECT 1 FROM pg_constraint
                 WHERE conname='accessory_units_accessory_id_fkey'
                   AND confupdtype='c'),
         'FK accessory_units.accessory_id mit ON UPDATE CASCADE'
  UNION ALL
  SELECT 'supabase-unit-assignment-tester-isolation',
         EXISTS (SELECT 1 FROM pg_proc p JOIN pg_namespace n ON p.pronamespace=n.oid
                 WHERE n.nspname='public' AND p.proname='assign_free_unit'
                   AND pg_get_functiondef(p.oid) ILIKE '%is_test%'),
         'RPC assign_free_unit mit Tester-Isolation (is_test im Body)'

), info AS (

  -- ── Backfill/Cleanup/Reset — nicht automatisch pruefbar ─────────────────
  SELECT 'supabase-belege-bezahl-datum-backfill' AS migration,
         'MANUELL' AS status,
         'Backfill-UPDATE auf belege — einmalig laufen lassen, danach erledigt' AS hinweis
  UNION ALL
  SELECT 'cleanup-asset-duplikate-beleg-position',
         'MANUELL',
         'Datenbereinigungs-Script — pruefen ob asset-Duplikate noch existieren'
  UNION ALL
  SELECT 'recovery-after-drop',
         'NICHT AUSFUEHREN',
         'Notfall-Script: legt Legacy-Tabellen wieder an. Nur nach Fehl-Drop.'
  UNION ALL
  SELECT 'finanzen-reset',
         'NICHT AUSFUEHREN',
         'RESET-Script — loescht alle Finanz-Daten. Nicht im Normalbetrieb.'
  UNION ALL
  SELECT 'go-live-reset',
         'NICHT AUSFUEHREN',
         'RESET-Script — loescht Test-Daten zum Go-Live. Nur einmalig manuell.'

)

SELECT migration,
       CASE WHEN done THEN 'ERLEDIGT' ELSE 'OFFEN' END AS status,
       hinweis
FROM checks
UNION ALL
SELECT migration, status, hinweis FROM info
ORDER BY
  CASE
    WHEN status='ERLEDIGT' THEN 1
    WHEN status='OFFEN' THEN 2
    WHEN status='MANUELL' THEN 3
    WHEN status='NICHT AUSFUEHREN' THEN 4
    ELSE 5
  END,
  migration;
