-- ════════════════════════════════════════════════════════════════════
-- cam2rent Finanzen-/Buchhaltungs-Reset (Stufe A)
-- ════════════════════════════════════════════════════════════════════
-- Loescht NUR Buchhaltungs- und Finanzdaten:
--   - assets, purchases (+ items, attachments), expenses
--   - invoices, credit_notes, dunning_notices, stripe_transactions
--   - export_log
--   - invoice_counter (GoBD-Counter wird leer, naechster Aufruf reseeded)
--   - admin_settings: beleg_counter_*, period_locks
--
-- BLEIBT UNVERAENDERT:
--   - bookings, rental_agreements, damage_reports, email_log
--   - profiles, auth.users
--   - products, sets, accessories, product_units, accessory_units
--   - admin_users, admin_settings (ausser oben), legal_documents
--   - blog_*, social_*, coupons, suppliers
--   - admin_audit_log (GoBD-Pflicht)
--
-- VOR DEM AUSFUEHREN:
--   1. Supabase-Snapshot anlegen (Dashboard → Database → Backups)
--   2. Coolify kurz auf Wartung (verhindert dass parallel Cron-Jobs
--      AfA-Buchungen schreiben oder Webhooks Rechnungen anlegen)
--   3. Die DRY-RUN-Counts unten zuerst laufen lassen — Plausibilitaet
--      pruefen, ob die Zahlen zur erwarteten Test-Menge passen
--
-- NACH DEM AUSFUEHREN:
--   4. Storage-Bucket `purchase-invoices` manuell leeren (orphane PDFs)
--      Supabase Dashboard → Storage → purchase-invoices → alle markieren
--      → Delete. Andere Buckets bleiben.
--
-- Idempotent: kann ohne Schaden mehrfach laufen. Transaktional: bei
-- Fehler ROLLBACK auf null Aenderungen. Robust gegen fehlende Tabellen.
-- ════════════════════════════════════════════════════════════════════


-- ────────────────────────────────────────────────────────────────────
-- DRY-RUN: Counts BEFORE wipe (zuerst alleine ausfuehren!)
-- ────────────────────────────────────────────────────────────────────
-- SELECT 'assets'                   AS tabelle, COUNT(*) FROM assets
-- UNION ALL SELECT 'purchases',                 COUNT(*) FROM purchases
-- UNION ALL SELECT 'purchase_items',            COUNT(*) FROM purchase_items
-- UNION ALL SELECT 'purchase_attachments',      COUNT(*) FROM purchase_attachments
-- UNION ALL SELECT 'expenses',                  COUNT(*) FROM expenses
-- UNION ALL SELECT 'invoices',                  COUNT(*) FROM invoices
-- UNION ALL SELECT 'credit_notes',              COUNT(*) FROM credit_notes
-- UNION ALL SELECT 'dunning_notices',           COUNT(*) FROM dunning_notices
-- UNION ALL SELECT 'stripe_transactions',       COUNT(*) FROM stripe_transactions
-- UNION ALL SELECT 'export_log',                COUNT(*) FROM export_log
-- UNION ALL SELECT 'invoice_counter',           COUNT(*) FROM invoice_counter;
--
-- Sicherheitsnetz — wenn diese > 0 sind, bricht der Reset auch
-- bestehende ECHTE Live-Belege weg. Vorher pruefen!
--
-- SELECT COUNT(*) AS live_invoices FROM invoices WHERE COALESCE(is_test,FALSE)=FALSE;
-- SELECT COUNT(*) AS live_purchases FROM purchases WHERE COALESCE(is_test,FALSE)=FALSE;


BEGIN;

-- ────────────────────────────────────────────────────────────────────
-- Tabellen in FK-sicherer Reihenfolge leeren.
-- Reihenfolge wichtig:
--   purchase_attachments → purchase_items → expenses → dunning/credit
--   → invoices → assets → purchases → stripe → export_log
-- ────────────────────────────────────────────────────────────────────
DO $$
DECLARE
  tables_to_clear text[] := ARRAY[
    -- Children der Einkaufs-Pipeline
    'purchase_attachments',  -- ON DELETE CASCADE auf purchases, aber explizit zur Klarheit
    'purchase_items',        -- referenziert assets/expenses (SET NULL)

    -- Buchhaltungs-Children + Cache
    'expenses',              -- referenziert assets (SET NULL); inkl. AfA + GWG
    'dunning_notices',       -- NOT NULL FK auf invoices → muss vor invoices weg
    'credit_notes',          -- NOT NULL FK auf invoices → muss vor invoices weg
    'invoices',              -- nach allen Children
    'stripe_transactions',   -- Cache, keine FKs
    'export_log',            -- Export-Historie (DATEV/EUeR/ZIP)

    -- Anlagen + Einkaufs-Parents
    'assets',                -- assets.unit_id ON DELETE SET NULL → product_units bleiben
    'purchases',             -- assets.purchase_id ON DELETE SET NULL (assets schon leer)

    -- GoBD-Counter (naechster next_invoice_number() reseeded)
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


-- ────────────────────────────────────────────────────────────────────
-- admin_settings: Belegnummer-Counter (test + live, alle Jahre) +
-- Period-Locks (Monatsabschluss). Sonstige Settings bleiben.
-- ────────────────────────────────────────────────────────────────────
DELETE FROM admin_settings
 WHERE key LIKE 'beleg_counter_%'
    OR key = 'period_locks';


COMMIT;


-- ════════════════════════════════════════════════════════════════════
-- Verifikation (nach COMMIT separat ausfuehren — alle muessen 0 sein)
-- ════════════════════════════════════════════════════════════════════
-- SELECT 'assets'                   AS tabelle, COUNT(*) FROM assets
-- UNION ALL SELECT 'purchases',                 COUNT(*) FROM purchases
-- UNION ALL SELECT 'purchase_items',            COUNT(*) FROM purchase_items
-- UNION ALL SELECT 'purchase_attachments',      COUNT(*) FROM purchase_attachments
-- UNION ALL SELECT 'expenses',                  COUNT(*) FROM expenses
-- UNION ALL SELECT 'invoices',                  COUNT(*) FROM invoices
-- UNION ALL SELECT 'credit_notes',              COUNT(*) FROM credit_notes
-- UNION ALL SELECT 'dunning_notices',           COUNT(*) FROM dunning_notices
-- UNION ALL SELECT 'stripe_transactions',       COUNT(*) FROM stripe_transactions
-- UNION ALL SELECT 'export_log',                COUNT(*) FROM export_log
-- UNION ALL SELECT 'invoice_counter',           COUNT(*) FROM invoice_counter;
--
-- Diese muessen unveraendert sein:
--
-- SELECT 'bookings'         AS tabelle, COUNT(*) FROM bookings
-- UNION ALL SELECT 'profiles',           COUNT(*) FROM profiles
-- UNION ALL SELECT 'product_units',      COUNT(*) FROM product_units
-- UNION ALL SELECT 'accessory_units',    COUNT(*) FROM accessory_units
-- UNION ALL SELECT 'admin_users',        COUNT(*) FROM admin_users
-- UNION ALL SELECT 'admin_audit_log',    COUNT(*) FROM admin_audit_log
-- UNION ALL SELECT 'suppliers',          COUNT(*) FROM suppliers;
-- ════════════════════════════════════════════════════════════════════
