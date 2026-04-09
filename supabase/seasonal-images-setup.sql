-- ============================================
-- Saisonale Bilder — Storage Bucket Setup
-- ============================================
-- Fuehre dieses SQL in der Supabase SQL-Konsole aus.

-- 1. Storage Bucket fuer saisonale Bilder erstellen
INSERT INTO storage.buckets (id, name, public)
VALUES ('seasonal-images', 'seasonal-images', true)
ON CONFLICT (id) DO NOTHING;

-- 2. Oeffentlichen Lesezugriff erlauben (fuer next/image)
CREATE POLICY "Saisonale Bilder oeffentlich lesbar"
ON storage.objects FOR SELECT
USING (bucket_id = 'seasonal-images');

-- 3. Service-Role darf hochladen
CREATE POLICY "Service-Role darf saisonale Bilder hochladen"
ON storage.objects FOR INSERT
WITH CHECK (bucket_id = 'seasonal-images');

-- 4. Service-Role darf loeschen
CREATE POLICY "Service-Role darf saisonale Bilder loeschen"
ON storage.objects FOR DELETE
USING (bucket_id = 'seasonal-images');
