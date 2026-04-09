# cam2rent Blog-System — Komplette Dokumentation (Stand: 09.04.2026)

## Uebersicht

Vollautomatisches KI-Blog-System fuer cam2rent.de mit:
- KI-Artikelgenerierung (Claude/Anthropic)
- KI-Bildgenerierung (DALL-E 3/OpenAI)
- 3-stufigem Faktencheck
- Redaktionsplan mit Drag&Drop
- Semi/Voll-Automatik mit Cron-Jobs
- Blog-Serien
- Mediathek
- Kommentare mit Moderation

---

## Datenbankstruktur (Supabase)

### Tabellen (alle angelegt):
- `blog_posts` — Artikel (title, slug, content, status, scheduled_at, schedule_id, series_id, series_part, ai_generated, featured_image etc.)
- `blog_categories` — Kategorien (name, slug, color)
- `blog_comments` — Kommentare mit Moderation (pending/approved/rejected)
- `blog_auto_topics` — Einzelthemen-Pool
- `blog_series` — Artikelserien (title, total_parts, generated_parts, status)
- `blog_series_parts` — Teile einer Serie
- `blog_schedule` — Redaktionsplan (topic, scheduled_date, scheduled_time, status, reviewed, post_id)

### SQL-Migrationen (alle ausgefuehrt):
- `supabase/blog-tables.sql` — Grundtabellen
- `supabase/blog-series.sql` — Serien-Erweiterung
- `supabase/blog-schedule.sql` — Redaktionsplan

### Storage Bucket:
- `blog-images` (PUBLIC) — Alle Blog-Bilder (KI-generiert + manuell hochgeladen)

---

## API-Routes

### Admin Blog:
- `POST /api/admin/blog/posts` — CRUD Posts
- `GET/PUT/DELETE /api/admin/blog/posts/[id]` — Einzelner Post
- `GET/POST /api/admin/blog/categories` — Kategorien
- `PUT/DELETE /api/admin/blog/categories/[id]` — Einzelne Kategorie
- `GET/PUT/DELETE /api/admin/blog/comments` — Kommentar-Moderation
- `POST /api/admin/blog/generate` — KI-Artikelgenerierung (Claude)
- `POST /api/admin/blog/generate-image` — KI-Bildgenerierung (DALL-E 3)
- `POST /api/admin/blog/factcheck` — 3-stufiger Faktencheck
- `GET/POST /api/admin/blog/images` — Unsplash-Bildsuche + Download
- `POST /api/admin/blog/upload` — Manueller Bild-Upload
- `GET/POST/DELETE /api/admin/blog/auto-topics` — Einzelthemen-Pool
- `GET/POST /api/admin/blog/series` — Serien CRUD
- `PUT/DELETE /api/admin/blog/series/[id]` — Einzelne Serie
- `GET/POST/PUT/DELETE /api/admin/blog/schedule` — Redaktionsplan
- `GET/POST/DELETE /api/admin/blog/media` — Mediathek (alle Bilder)

### Cron:
- `POST /api/cron/blog-generate` — Automatische Artikelgenerierung
  - Params: `?secret=CRON_SECRET` + optional `&force=true`
  - Prueft Redaktionsplan → Serien → Themenpool (Prioritaet)
  - Intelligenter Scheduler: Wochentage, Zeitfenster, Zufallsminute
  - 3-stufiger Faktencheck nach Generierung
  - DALL-E Bildgenerierung
  - Max 5 Artikel pro Tag (Duplikat-Schutz)
- `POST /api/cron/blog-publish` — Geplante Posts veroeffentlichen
  - Semi-Modus: Nur wenn Gesehen-Haken gesetzt
  - Voll-Modus: Automatisch bei faelligem Datum
  - Loescht veroeffentlichte Eintraege aus Zeitplan + loggt in admin_audit_log

### Public:
- `GET /api/blog/posts` — Blog-Liste (published, paginiert)
- `GET /api/blog/posts/[slug]` — Einzelner Post + View-Counter
- `GET/POST /api/blog/comments` — Kommentare lesen/schreiben

---

## Admin-Seiten (/admin/blog/)

### Sidebar-Navigation:
1. Dashboard — Statistiken + Live-Ampel
2. Zeitplan — Redaktionsplan (2 Tabs: Einzelthemen + Serien)
3. Artikel — Liste + Editor
4. Themen — Kategorien + Einzelthemen + Serien
5. Mediathek — Alle Bilder
6. Kommentare — Moderation
7. Einstellungen — API Keys + Auto-Generierung + KI-Kontext

### Dashboard Features:
- 6 Statistik-Karten (Gesamt, Live, Entwuerfe, Geplant, Kommentare, Views)
- Live-Ampel: Gruen (generiert), Gelb (wartet), Rot (deaktiviert)
- Letzte 5 Artikel

### Zeitplan Features:
- Tab 1: Einzelthemen — KI-Plan generieren + aus Themenpool importieren
- Tab 2: Serien — Serien-Teile in Zeitplan einfuegen
- Drag&Drop fuer Reihenfolge
- Datum + Uhrzeit inline anpassbar (aktualisiert auch blog_posts.scheduled_at)
- Gesehen-Checkbox (gruener Haken)
- Status-Badges: Geplant / Generiert / Gesehen / Live / Ueberfaellig / Heute

### Artikel-Editor Features:
- Titel + Slug (auto-generiert)
- MarkdownEditor mit Toolbar
- KI-Generierung Panel (Thema, Ton, Laenge)
- Automatischer Faktencheck nach Generierung (3 Durchgaenge)
- Manueller Faktencheck-Button
- Vorher/Nachher-Vergleich der Aenderungen
- 4 Titelbild-Optionen: Hochladen, Unsplash, Mediathek, KI-generieren
- Link-Manager (Links bearbeiten, entfernen, Produkt-Links einfuegen)
- Vorschau-Button (oeffnet /blog/preview/[id])
- Status: Entwurf / Veroeffentlicht / Geplant
- SEO: Titel, Beschreibung, Zeichenzaehler
- Kategorie, Tags, Autor

### Einstellungen:
- API Keys: Anthropic (Text), OpenAI (Bilder), Unsplash (optional)
- KI-Standardeinstellungen: Ton, Laenge, Autor
- Zusatz-Kontext fuer die KI (Freitext — Produkte, Preise, Aktionen)
- Auto-Generierung: Semi/Voll-Modus
- Intervall: Taeglich/Woechentlich/Alle 2 Wochen/Monatlich
- Wochentag-Auswahl (Mo-So, Mehrfachauswahl)
- Uhrzeit-Zeitfenster (von/bis)
- Vorlaufzeit: 1-7 Tage vorher generieren
- Cron-URLs angezeigt

---

## Public-Seiten

### /blog — Uebersicht:
- Dark Hero-Section
- Kategorie-Filter (sticky, scrollbar)
- Featured-Artikel (erster Post gross, 2-spaltig)
- Artikel-Grid (3 Spalten Desktop)
- Pagination
- Light/Dark-Mode Support

### /blog/[slug] — Artikelseite:
- Breadcrumb (Home / Blog / Kategorie)
- Hero: Badge-Pill, Titel, Excerpt, Author-Avatar, Gradient-Divider
- Featured Image (aspect 2:1)
- Markdown-Content mit Custom-Renderern:
  - H2 mit Cyan-Balken
  - Blockquotes als farbige Info-Boxen (Tipp/Wichtig/Fazit/Info)
  - Tabellen im dunklen Design mit Hover
  - Listen mit Cyan-Dots
  - Code-Highlighting
- CTA-Box ("Kameras entdecken")
- Tags als Pills
- Verwandte Artikel (gleiche Kategorie)
- Kommentar-Formular + genehmigte Kommentare
- JSON-LD Structured Data (BlogPosting)
- SEO Metadata + OpenGraph
- Light/Dark-Mode Support

### /blog/preview/[id] — Vorschau:
- Zeigt Artikel wie live (auch Entwuerfe)
- Gelber Preview-Banner mit Bearbeiten/Live-Links

### Sitemap:
- Blog-Posts dynamisch in sitemap.ts integriert

---

## KI-Generierung Details

### Text (Claude Sonnet):
- Redaktioneller Stil, du-Ansprache, keine KI-Floskeln
- Blockquote-Boxen: Tipp, Wichtig, Fazit, Gut zu wissen (min. 2-3 pro Artikel)
- Tabellen nur bei Vergleichen
- Lead-Absatz am Anfang
- Echte Shop-Produkte werden automatisch geladen + im Prompt erwaehnt
- Admin-Kontext (Freitext aus Einstellungen) wird mitgegeben
- Aktuelles Jahr + Monat im Prompt
- Keine veralteten Produkte

### Bild (DALL-E 3):
- HD Qualitaet, 1792x1024 (Landscape)
- Stil: "Shot on Sony A7IV, 35mm, f/2.8, golden hour"
- KEINE Kameras/Elektronik im Bild (sieht fake aus)
- Nur Aktivitaeten/Szenen (Surfen, Berge, Tauchen etc.)
- National Geographic / Red Bull Magazin Look

### Faktencheck (3 Durchgaenge):
1. Faktenpruefer — Erfundene Specs/Preise entfernen
2. Qualitaetsredakteur — Superlative/Marketing-Luegen entschaerfen
3. Chefredakteur — Finale Pruefung, keine "Versicherung"
- Korrigiert Text selbststaendig
- Vorher/Nachher-Vergleich im Editor (rot/gruen)

---

## Server-Konfiguration

### Cron-Jobs (Hetzner Server 178.104.117.135):
```
0 * * * * curl -s -X POST "https://test.cam2rent.de/api/cron/blog-generate?secret=Kamera2026!"
*/10 * * * * curl -s -X POST "https://test.cam2rent.de/api/cron/blog-publish?secret=Kamera2026!"
```

### Environment Variables (Coolify):
- `CRON_SECRET=Kamera2026!`

### Blog-Einstellungen (in admin_settings als JSON unter key "blog_settings"):
- anthropic_api_key
- openai_api_key
- unsplash_access_key
- default_tone, default_length, default_author
- auto_generate (boolean)
- auto_generate_mode (semi/voll)
- auto_generate_interval (daily/weekly/biweekly/monthly)
- auto_generate_weekdays (string[])
- auto_generate_time_from, auto_generate_time_to
- auto_generate_topic
- schedule_days_before (1-7)
- ki_context (Freitext)

---

## NPM Pakete (hinzugefuegt):
- `@anthropic-ai/sdk` — Claude API
- `openai` — DALL-E 3 API
- `remark-gfm` — Tabellen-Support in Markdown

---

## Blog-Komponenten (/components/blog/):
- `BlogCallout.tsx` — Farbige Info-Boxen (Tipp/Wichtig/Fazit/Info)
- `BlogVersusCard.tsx` — VS-Karte (Cyan vs Purple)
- `BlogSpecsTable.tsx` — Specs-Tabelle mit Winner-Badges
- `BlogCTA.tsx` — CTA-Box mit Buttons
- `BlogVerdict.tsx` — "Unser Urteil" Fazit-Box
- `BlogTypeCards.tsx` — "Fuer wen?" Karten
- `index.ts` — Re-exports

## Admin Blog-Komponenten (/components/admin/blog/):
- `ArticleEditor.tsx` — Haupteditor (KI, Bild, Faktencheck, Links, Mediathek)
- `LinkManager.tsx` — Links verwalten + Produkt-Links

---

## Bekannte Issues / Offene Punkte:
1. Aeltere Artikel (vor Bug-Fixes) haben schedule_id=null und status=draft statt scheduled — muessen manuell in DB gefixt werden
2. Timezone: Neue Artikel werden korrekt in Europe/Berlin umgerechnet. Alte Artikel haben UTC-Zeiten.
3. Bilder werden manchmal nicht generiert wenn OpenAI API Fehler auftreten — imageError Feld in der Cron-Antwort zeigt den Grund

## Semi vs Voll Modus:
- Semi: Cron generiert als scheduled, aber Publish-Cron veroeffentlicht NUR wenn Gesehen-Haken im Zeitplan gesetzt
- Voll: Cron generiert als scheduled, Publish-Cron veroeffentlicht automatisch am geplanten Datum

## Generierungs-Flow (Cron):
1. Redaktionsplan pruefen (hoechste Prio)
2. Serien-Teile pruefen
3. Themenpool pruefen
4. Text generieren (Claude)
5. 3x Faktencheck (Claude)
6. Bild generieren (DALL-E 3)
7. Artikel speichern (scheduled + scheduled_at)
8. Schedule-Eintrag auf "generated" setzen
9. Live-Ampel auf "idle" setzen

## Publish-Flow (Cron alle 10 Min):
1. Posts mit status=scheduled + scheduled_at<=now finden
2. Semi: nur wenn zugehoeriger Schedule-Eintrag reviewed=true
3. Voll: immer
4. Status auf published setzen
5. Schedule-Eintrag loggen (admin_audit_log) + loeschen
