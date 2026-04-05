-- ============================================================
-- cam2rent – Sendcloud Versandlabel-Felder
-- Im Supabase SQL-Editor ausführen (einmalig)
-- ============================================================

ALTER TABLE bookings
  ADD COLUMN IF NOT EXISTS sendcloud_parcel_id        BIGINT,
  ADD COLUMN IF NOT EXISTS sendcloud_return_parcel_id BIGINT,
  ADD COLUMN IF NOT EXISTS label_url                  TEXT,
  ADD COLUMN IF NOT EXISTS return_label_url           TEXT;
