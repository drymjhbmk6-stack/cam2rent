-- ==============================================================
-- Reel-Vorlage "Ankuendigung (Motion-Graphics)" nachlegen
-- ==============================================================
-- Idempotent: checkt ueber Name, damit Mehrfach-Ausfuehrung kein
-- Duplikat anlegt. Voraussetzung: supabase-reels.sql ist schon gelaufen.

INSERT INTO social_reel_templates (
  name,
  description,
  template_type,
  script_prompt,
  default_duration,
  default_hashtags,
  bg_color_from,
  bg_color_to,
  trigger_type,
  is_active
)
SELECT
  'Ankuendigung (Motion-Graphics)',
  'Schlichtes 15-Sekunden-Reel fuer Ankuendigungen (neue Kamera, Service-Update, News). Reine Motion-Graphics, keine Stock-Clips.',
  'motion_graphics',
  'Schreibe ein 15-Sekunden-Motion-Graphics-Skript fuer die cam2rent.de-Ankuendigung "{topic}". Struktur: (1) Aufmerksamkeits-Hook 2s ("Neu bei cam2rent" oder aehnlich), (2) 3 Szenen a 3-4s die die Ankuendigung in klaren Saetzen erklaeren (was ist neu, fuer wen, ab wann), (3) CTA 3s mit konkreter naechster Aktion ("Jetzt entdecken auf cam2rent.de"). Ton: freundlich-informativ, kein Marketing-Superlativ. Max 7 Worte pro Text-Overlay. Keywords: {keywords}.',
  15,
  ARRAY['cam2rent', 'ankuendigung', 'news']::TEXT[],
  '#0F172A',
  '#3B82F6',
  'manual',
  TRUE
WHERE NOT EXISTS (
  SELECT 1 FROM social_reel_templates WHERE name = 'Ankuendigung (Motion-Graphics)'
);

COMMIT;
