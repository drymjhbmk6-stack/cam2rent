-- Sets: image_url Spalte hinzufügen
ALTER TABLE sets ADD COLUMN IF NOT EXISTS image_url TEXT DEFAULT NULL;
