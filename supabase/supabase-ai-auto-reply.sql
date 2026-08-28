-- KI-Auto-Beantwortung von Kundenanfragen (idempotent, additiv)
--
-- Zwei Wege, wie eine eingehende Kundenanfrage beantwortet wird:
--   1. AUTOMATISCH  — einfache Standardfrage, hohe Sicherheit → Antwort geht
--      direkt raus (messages.ai_generated = true).
--   2. ENTWURF      — alles Unsichere/Heikle → Vorschlag landet in
--      conversations.ai_draft und wartet auf die Freigabe des Admins.
--
-- Ohne diese Migration laeuft das Nachrichten-Tool unveraendert weiter:
-- alle Schreib-/Lesepfade fangen die fehlenden Spalten defensiv ab, es wird
-- dann weder ein Entwurf gespeichert noch automatisch geantwortet.

-- ── Entwurf + Auto-Reply-Zaehler an der Konversation ───────────────────────

ALTER TABLE conversations
  ADD COLUMN IF NOT EXISTS ai_draft TEXT NULL;

ALTER TABLE conversations
  ADD COLUMN IF NOT EXISTS ai_draft_created_at TIMESTAMPTZ NULL;

-- Meta zum Entwurf: { kategorie, confidence, auto_faehig, grund, modell,
--                     eskalation: [...], quelle_nachricht_id }
ALTER TABLE conversations
  ADD COLUMN IF NOT EXISTS ai_draft_meta JSONB NULL;

-- Zeitpunkt der letzten AUTOMATISCH versendeten Antwort in diesem Thread.
ALTER TABLE conversations
  ADD COLUMN IF NOT EXISTS ai_last_auto_reply_at TIMESTAMPTZ NULL;

-- Wie oft in diesem Thread schon automatisch geantwortet wurde. Deckelt
-- Endlos-Schleifen mit Auto-Respondern der Gegenseite.
ALTER TABLE conversations
  ADD COLUMN IF NOT EXISTS ai_auto_reply_count INTEGER NOT NULL DEFAULT 0;

-- Offene Entwuerfe schnell finden (Badge + Filter in /admin/nachrichten).
CREATE INDEX IF NOT EXISTS idx_conversations_ai_draft_open
  ON conversations (ai_draft_created_at DESC)
  WHERE ai_draft IS NOT NULL;

-- ── Kennzeichnung der Nachricht selbst ─────────────────────────────────────

-- true = diese Admin-Nachricht wurde von der KI verfasst UND automatisch
-- versendet. Ein vom Admin freigegebener Entwurf zaehlt NICHT als KI-Nachricht
-- (er ist dann redigiert und verantwortet).
ALTER TABLE messages
  ADD COLUMN IF NOT EXISTS ai_generated BOOLEAN NOT NULL DEFAULT false;

COMMENT ON COLUMN conversations.ai_draft IS 'Von der KI vorgeschlagene Antwort, wartet auf Admin-Freigabe. NULL = kein offener Entwurf.';
COMMENT ON COLUMN conversations.ai_auto_reply_count IS 'Anzahl automatisch versendeter KI-Antworten in diesem Thread (Schleifen-Schutz).';
COMMENT ON COLUMN messages.ai_generated IS 'true = automatisch von der KI versendet (nicht vom Admin freigegeben).';
