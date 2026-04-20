-- ────────────────────────────────────────────────────────────────────────────
-- Supabase-Storage Row-Level-Security für sensible Buckets
-- ────────────────────────────────────────────────────────────────────────────
--
-- Schützt Verträge, Ausweisdokumente und Schadensfotos vor unberechtigtem
-- Zugriff durch direkte Storage-URLs.
--
-- WICHTIG: Vor der Ausführung bitte im Supabase-Dashboard prüfen:
--   Storage → <bucket> → Public: MUSS auf OFF stehen.
--   Wenn der Bucket public ist, greift RLS nicht — jeder mit URL kann lesen.
--
-- Buckets die hier abgesichert werden:
--   - contracts         (Mietvertrag-PDFs mit Kundendaten + Unterschrift)
--   - id-documents      (Personalausweis-Fotos)
--   - damage-photos     (Fotos aus Schadensmeldungen)
--
-- Buckets die public bleiben (Design-Entscheidung):
--   - product-images    (Produktfotos — sollen im Shop sichtbar sein)
--   - blog-images       (Blog-Artikel-Bilder)
-- ────────────────────────────────────────────────────────────────────────────

-- ── Hilfsfunktion: Admin-Check per Service-Role ────────────────────────────
-- Storage-RLS ermöglicht keinen direkten Zugriff auf unsere Admin-Cookies,
-- aber der Service-Role-Key umgeht RLS komplett — Admin-Routes rufen Storage
-- über Service-Role auf. Für die anonyme/Kunden-Rolle muss die Zuordnung
-- über auth.uid() vs. erste Pfad-Komponente geprüft werden.
--
-- Konvention für Datei-Pfade:
--   id-documents:    <user_id>/front.jpg, <user_id>/back.jpg
--   contracts:       <year>/<booking_id>.pdf   (Zuordnung via bookings-Tabelle)
--   damage-photos:   <booking_id>/<random>.jpg (Zuordnung via bookings-Tabelle)

-- ── Bucket: id-documents ────────────────────────────────────────────────────
-- Nur der Besitzer der user_id im Pfad UND Admin (über Service-Role) dürfen.
DROP POLICY IF EXISTS "id-documents select own" ON storage.objects;
CREATE POLICY "id-documents select own"
  ON storage.objects FOR SELECT
  USING (
    bucket_id = 'id-documents'
    AND auth.uid() IS NOT NULL
    AND (storage.foldername(name))[1] = auth.uid()::text
  );

DROP POLICY IF EXISTS "id-documents insert own" ON storage.objects;
CREATE POLICY "id-documents insert own"
  ON storage.objects FOR INSERT
  WITH CHECK (
    bucket_id = 'id-documents'
    AND auth.uid() IS NOT NULL
    AND (storage.foldername(name))[1] = auth.uid()::text
  );

DROP POLICY IF EXISTS "id-documents update own" ON storage.objects;
CREATE POLICY "id-documents update own"
  ON storage.objects FOR UPDATE
  USING (
    bucket_id = 'id-documents'
    AND auth.uid() IS NOT NULL
    AND (storage.foldername(name))[1] = auth.uid()::text
  );

-- ── Bucket: contracts ───────────────────────────────────────────────────────
-- Zugriff nur wenn die bookingId im Pfad zu einer Buchung des auth.uid() gehört.
DROP POLICY IF EXISTS "contracts select own" ON storage.objects;
CREATE POLICY "contracts select own"
  ON storage.objects FOR SELECT
  USING (
    bucket_id = 'contracts'
    AND auth.uid() IS NOT NULL
    AND EXISTS (
      SELECT 1 FROM public.bookings b
       WHERE b.user_id = auth.uid()
         AND b.id = split_part(
                     split_part(storage.objects.name, '/', 2),  -- <year>/<bookingId>.pdf
                     '.', 1
                   )
    )
  );

-- Inserts und Updates auf contracts laufen ausschließlich über den
-- Service-Role (aus der API) — keine User-Policy nötig.

-- ── Bucket: damage-photos ───────────────────────────────────────────────────
DROP POLICY IF EXISTS "damage-photos select own" ON storage.objects;
CREATE POLICY "damage-photos select own"
  ON storage.objects FOR SELECT
  USING (
    bucket_id = 'damage-photos'
    AND auth.uid() IS NOT NULL
    AND EXISTS (
      SELECT 1 FROM public.bookings b
       WHERE b.user_id = auth.uid()
         AND b.id = (storage.foldername(storage.objects.name))[1]
    )
  );

DROP POLICY IF EXISTS "damage-photos insert own" ON storage.objects;
CREATE POLICY "damage-photos insert own"
  ON storage.objects FOR INSERT
  WITH CHECK (
    bucket_id = 'damage-photos'
    AND auth.uid() IS NOT NULL
    AND EXISTS (
      SELECT 1 FROM public.bookings b
       WHERE b.user_id = auth.uid()
         AND b.id = (storage.foldername(storage.objects.name))[1]
    )
  );

-- ── Prüfliste nach Ausführung ───────────────────────────────────────────────
-- Im Supabase-Dashboard → Storage → jeweils bucket anklicken:
--   1. contracts, id-documents, damage-photos: "Public" muss OFF sein
--   2. "Authenticated users" können NUR eigene Daten lesen (oberhalb getestet)
--   3. Service-Role (aus API-Routes) hat weiterhin vollen Zugriff
--
-- Test mit einem echten Kunden-Account:
--   fetch('https://<project>.supabase.co/storage/v1/object/contracts/2026/<fremde-booking>.pdf')
--   → muss 403/404 liefern. Wenn 200 kommt, ist RLS nicht aktiv.
