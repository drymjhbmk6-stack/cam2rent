-- ============================================================
-- Supabase: Custom Sets Tabelle + Storage Policies
-- ============================================================

-- SCHRITT 1 (manuell im Dashboard):
-- Supabase → Storage → "New Bucket"
-- Name: product-images | Public: JA | Max: 5 MB | MIME: image/*

-- SCHRITT 2: Storage Policies (hier ausführen NACHDEM Bucket erstellt wurde)

CREATE POLICY "Public read product images"
ON storage.objects FOR SELECT
USING (bucket_id = 'product-images');

CREATE POLICY "Allow upload product images"
ON storage.objects FOR INSERT
WITH CHECK (bucket_id = 'product-images');

CREATE POLICY "Allow delete product images"
ON storage.objects FOR DELETE
USING (bucket_id = 'product-images');

CREATE POLICY "Allow update product images"
ON storage.objects FOR UPDATE
USING (bucket_id = 'product-images');


-- SCHRITT 3: Custom Sets Tabelle

CREATE TABLE IF NOT EXISTS custom_sets (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE,
  camera_id TEXT NOT NULL,
  accessory_ids TEXT[] DEFAULT '{}',
  name TEXT DEFAULT 'Eigenes Set',
  created_at TIMESTAMPTZ DEFAULT now()
);

ALTER TABLE custom_sets ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can manage own sets" ON custom_sets
  FOR ALL USING (auth.uid() = user_id);
