-- ────────────────────────────────────────────────────────────────────────────
-- Warteliste: Use-Case-Feld (optional)
-- ────────────────────────────────────────────────────────────────────────────
-- Ergänzt die Tabelle waitlist_subscriptions um ein optionales Freitextfeld,
-- in dem der Interessent angibt, wofür er die Kamera nutzen würde
-- (z.B. "Wassersport / Surfen / Tauchen", "Skifahren", eigener Text).
-- So kann das Sortiment gezielter geplant werden.

ALTER TABLE waitlist_subscriptions
  ADD COLUMN IF NOT EXISTS use_case TEXT;
