-- ════════════════════════════════════════════════════════════════════════
-- Sicherheit 05 — Bucket `damage-photos` privat schalten
-- ════════════════════════════════════════════════════════════════════════
--
-- Teil 2 von 2 zur Behebung von Befund K-5 (kritisch), schließt außerdem N-10.
--
-- ⚠️ ERST AUSFÜHREN, WENN BEIDES ERLEDIGT IST (Reihenfolge der beiden
--    untereinander egal):
--    1. supabase-sec-04-damage-photos-backfill.sql ist gelaufen (Verifikation
--       dort: 0 Zeilen mit `http%`), UND
--    2. der zugehörige Deploy ist live: Pfad-Regex in
--       app/api/admin/damage-photo-url + damage-attachment-url erweitert,
--       Anzeige über lib/damage-photo-path.ts statt direkter Public-URL.
--    Wird der Bucket vorher privat geschaltet, während das alte Frontend noch
--    läuft, liefern alle Alt-Fotos im Admin ein 403 (kein Datenverlust, aber
--    kaputte Vorschaubilder bis zum Deploy).
--
-- PROBLEM:
-- `erledigte supabase/supabase-schaeden.sql:48` legt den Bucket mit `public=true`
-- an, Zeile 60 setzt zusätzlich
--   CREATE POLICY "Public read access for damage photos"
--     ON storage.objects FOR SELECT USING (bucket_id = 'damage-photos');
-- ohne `TO`-Klausel — also für PUBLIC, damit auch für `anon`.
--
-- Schadensfotos zeigen regelmäßig Fahrzeuge, Wohnumgebungen und gelegentlich
-- Personen; der Dateiname enthält die Buchungsnummer. Beides zusammen ist ein
-- personenbezogenes Datum nach Art. 4 Nr. 1 DSGVO. Ein öffentlicher Bucket ist
-- damit ein Verstoß gegen Art. 32 Abs. 1 lit. b.
--
-- Die restriktiven Policies für diesen Bucket existieren bereits
-- (`erledigte supabase/supabase-storage-rls.sql:83-108`) — sie greifen aber nur,
-- solange der Bucket nicht öffentlich ist. Das `public`-Flag hat Vorrang.
--
-- Zusätzlich N-10: Der Bucket `signatures` (Unterschriftsbilder, gelesen in
-- `app/api/rental-contract/[bookingId]/route.ts:163`) wurde nie per Migration
-- angelegt, sondern laut `erledigte supabase/supabase-session15.sql:100` von Hand
-- im Dashboard — mit der Vorgabe „Public: false", die nie technisch geprüft
-- wurde. Dieses Skript zieht sie nach, falls nötig.
--
-- Idempotent.

-- ────────────────────────────────────────────────────────────────────────
-- SCHRITT 1 — Ist-Zustand (ändert nichts)
-- ────────────────────────────────────────────────────────────────────────
SELECT id AS bucket, public AS oeffentlich
  FROM storage.buckets
 ORDER BY public DESC, id;

-- ────────────────────────────────────────────────────────────────────────
-- SCHRITT 2 — Privat schalten
-- ────────────────────────────────────────────────────────────────────────
-- `product-images` und `blog-images` bleiben bewusst öffentlich: Ihre vollen
-- Public-URLs sind in der Datenbank persistiert (admin_config.products[].image,
-- sets.image_url, accessories.*) und werden über next/image ausgeliefert.

UPDATE storage.buckets SET public = false WHERE id = 'damage-photos'   AND public;
UPDATE storage.buckets SET public = false WHERE id = 'signatures'      AND public;

-- Die öffentliche Lese-Policy muss mit weg — sie würde sonst weiterhin
-- anonymen Abruf über die Objekt-API erlauben, unabhängig vom `public`-Flag.
DROP POLICY IF EXISTS "Public read access for damage photos" ON storage.objects;

-- ────────────────────────────────────────────────────────────────────────
-- SCHRITT 3 — Reste aufspüren
-- ────────────────────────────────────────────────────────────────────────
-- Zeigt alle verbliebenen Policies auf `damage-photos` und `signatures`.
-- Erwartung: nur noch die eigentümergebundenen Policies aus
-- supabase-storage-rls.sql („damage-photos select own" / „… insert own").
--
-- Bleibt hier eine Policy ohne `TO`-Klausel stehen (roles enthält `public`),
-- gehört sie zu Befund H-4 und wird in Paket 6
-- (supabase-sec-06-storage-policies.sql) behandelt — z. B. „Service role can
-- delete damage photos" aus supabase-schaeden.sql:65.
SELECT policyname, cmd, roles::text, qual
  FROM pg_policies
 WHERE schemaname = 'storage' AND tablename = 'objects'
   AND (qual ILIKE '%damage-photos%' OR with_check ILIKE '%damage-photos%'
     OR qual ILIKE '%signatures%'    OR with_check ILIKE '%signatures%')
 ORDER BY policyname;

-- ════════════════════════════════════════════════════════════════════════
-- Verifikation — Erwartung: `oeffentlich = false` für beide
-- ════════════════════════════════════════════════════════════════════════
SELECT id AS bucket, public AS oeffentlich
  FROM storage.buckets
 WHERE id IN ('damage-photos', 'signatures', 'contracts', 'id-documents');

-- Gegenprobe von außen (ohne Anmeldung, z. B. im privaten Browserfenster):
--   https://<projekt-ref>.supabase.co/storage/v1/object/public/damage-photos/<pfad>
--   → muss jetzt 400/404 liefern, vorher kam das Bild.

-- ════════════════════════════════════════════════════════════════════════
-- Smoke-Test nach dem Ausführen
-- ════════════════════════════════════════════════════════════════════════
--   /admin/schaeden → alter Schadensfall: Fotos laden (signierte URL)
--   /admin/schaeden → Fall MIT Zubehör-Schaden: Fotos laden
--                     (dreiteiliger Pfad <buchung>/<exemplar>/<datei>)
--   /admin/buchungen/<id> → Schadensmeldung: Fotos laden
--   Mietvertrag-PDF einer Altbuchung mit `contract_signature_url` herunterladen:
--     Unterschrift muss weiterhin im PDF erscheinen (signatures-Bucket).
--
-- Rollback:
--   UPDATE storage.buckets SET public = true WHERE id = 'damage-photos';
--   CREATE POLICY "Public read access for damage photos"
--     ON storage.objects FOR SELECT USING (bucket_id = 'damage-photos');
