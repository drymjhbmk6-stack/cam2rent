-- ═══════════════════════════════════════════════════════════════════════════
-- Aufgabe 15: Rückgabe-Checkliste
-- ═══════════════════════════════════════════════════════════════════════════

CREATE TABLE IF NOT EXISTS return_checklists (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  booking_id TEXT NOT NULL REFERENCES bookings(id),
  checked_by UUID,
  items JSONB NOT NULL DEFAULT '[]'::jsonb,
  -- items format: [{ "label": "Paket erhalten", "required": true, "checked": false, "comment": "", "photos": [] }]
  status TEXT NOT NULL DEFAULT 'in_progress' CHECK (status IN ('in_progress', 'completed', 'damage_reported')),
  completed_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(booking_id)
);

CREATE INDEX IF NOT EXISTS idx_return_checklists_booking ON return_checklists (booking_id);
CREATE INDEX IF NOT EXISTS idx_return_checklists_status ON return_checklists (status);

-- Default checklist template (stored in admin_config)
INSERT INTO admin_config (key, value)
VALUES ('return_checklist_template', '[
  {"label": "Paket erhalten", "required": true},
  {"label": "Kamera vorhanden und vollständig", "required": true},
  {"label": "Zubehör vollständig", "required": true},
  {"label": "Optische Prüfung: Keine Schäden sichtbar", "required": true},
  {"label": "Funktionsprüfung: Kamera funktioniert", "required": true},
  {"label": "SD-Karte geleert / entfernt", "required": false},
  {"label": "Gereinigt und einsatzbereit", "required": false}
]'::jsonb)
ON CONFLICT (key) DO NOTHING;
