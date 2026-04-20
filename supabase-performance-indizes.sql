-- Performance-Indizes auf häufig gequerten Spalten
-- Erstellt 2026-04-20 im Rahmen des Performance-Audits.
--
-- HINWEIS: CREATE INDEX CONCURRENTLY darf nicht in einer Transaction laufen,
-- der Supabase SQL-Editor wickelt aber alles automatisch in eine Transaction.
-- Deshalb hier ohne CONCURRENTLY — läuft als Batch, sperrt die Tabellen für
-- wenige Sekunden. Bei cam2rent-Traffic (<1 QPS) ist das unkritisch.
-- Dank `IF NOT EXISTS` kann das Skript beliebig oft wiederholt werden.

-- Admin-Queries nach Kundenbuchungen (Kunden-Detail, Historie)
CREATE INDEX IF NOT EXISTS idx_bookings_user_id
  ON bookings(user_id);

-- Zeitfenster-Filter (Analytics, Buchhaltung, Dashboard)
CREATE INDEX IF NOT EXISTS idx_bookings_created_at
  ON bookings(created_at DESC);

-- Produkt-/Zeitraum-Overlap-Queries (Verfügbarkeit, Unit-Assignment)
CREATE INDEX IF NOT EXISTS idx_bookings_product_period
  ON bookings(product_id, rental_from, rental_to);

-- Inline-Laden von E-Mail-Protokollen in Buchungsdetails
CREATE INDEX IF NOT EXISTS idx_email_log_booking_id
  ON email_log(booking_id);

-- Duplikat-Prüfung + Dashboard-Listen für Blog
CREATE INDEX IF NOT EXISTS idx_blog_posts_status_created
  ON blog_posts(status, created_at DESC);

-- Cron-Publishing: `.eq('status','scheduled').lte('scheduled_at', now)`
CREATE INDEX IF NOT EXISTS idx_social_posts_status_sched
  ON social_posts(status, scheduled_at);

-- Waitlist-Admin-Seite nach Produkt gruppieren
CREATE INDEX IF NOT EXISTS idx_waitlist_product_id
  ON waitlist_subscriptions(product_id);

-- Vertrags-Lookup pro Buchung (Bestätigungs-Mail-Anhang)
CREATE INDEX IF NOT EXISTS idx_rental_agreements_booking_id
  ON rental_agreements(booking_id);
