# Reels Phase 1 — Quick Wins

**Ziel:** Sichtbare Verbesserungen in der Reels-Pipeline ohne stilistische Risiken. Jeder Punkt isoliert testbar, kein Eingriff in die Skript-Generierung.

## Was sich aendert

### 1.1 Thumbnail-Bug gefixt
Bisher ergab `-ss 1 -i finalPath` immer einen Frame mitten im 1.5s-Intro → alle Thumbnails zeigten das Logo. Jetzt: Snapshot aus dem **ersten Body-Segment** (vor Concat) bei `-ss 0.8` — mittig in der ersten Action-Szene, vermeidet Fade-In-Effekte. Fallback auf finalPath nur bei Reels ohne Body-Segmente.

`lib/reels/ffmpeg-render.ts` Thumbnail-Stage ist jetzt:
```
-ss 0.8 -i seg-0.mp4 -frames:v 1 -q:v 3
```

### 1.2 Doppel-Encode eliminiert
Frueher wurden Pro-Segment-Encodes (libx264 veryfast/23) beim Concat ein zweites Mal durch den Encoder geschickt — Generationenverlust + ~40% Render-Zeit-Penalty. Jetzt:

- Neue Konstante `STD_VIDEO_ENCODE_ARGS` in `lib/reels/ffmpeg-render.ts` mit `profile:v=high level=4.0 pix_fmt=yuv420p r=30 g=60 keyint_min=60 sc_threshold=0`. Vereinheitlicht alle 5 Pro-Segment-Encodes (Intro, Outro, Stock-Body, Stock-CTA, Motion-Graphics-Body, MG-CTA).
- Concat-Step jetzt `-c copy -movflags +faststart` (Stream-Copy, kein Re-Encode).

### 1.3 Encoder-Parameter aufgewertet
Pro-Segment-Encode: `-preset medium -crf 20` (vorher `veryfast/23`). Sichtbar weniger Block-Artefakte, ~2x langsamer pro Segment, durch Wegfall des Concat-Re-Encodes netto aber nicht langsamer als der vorige Status.

### 1.4 Pexels-Aufloesungs-Floor
`pickBestVideoFile` (jetzt in `lib/reels/stock-sources/pexels.ts`) ignoriert Datei-Varianten unter **1080 px in der kuerzeren Dimension**. Sub-1080p-Treffer werden uebersprungen — bei Pexels meist mehrere passende Varianten pro Video, selten ein Problem.

### 1.5 Multi-Source Stock Footage (Pexels + Pixabay)
Neue Architektur unter `lib/reels/stock-sources/`:
- `types.ts` — `StockClip` + `StockSource` Interface
- `pexels.ts` — Refactor (Pexels-spezifische API + StockSource-Adapter)
- `pixabay.ts` — Pixabay Videos API als zweite Quelle (NEU)
- `index.ts` — `findClipForQuery({ seed, excludeIds, minHeight })` — waehlt deterministisch via reelId-Hash zwischen verfuegbaren Quellen

Verhalten:
- Wenn nur Pexels-Key gesetzt: 100% Pexels (= Status quo).
- Wenn beide Keys gesetzt: 50/50 deterministisch pro Reel; bei < 3 Treffern in der Primaerquelle wird die andere als Fallback befragt.
- `lib/reels/pexels.ts` bleibt als schmaler Re-Export erhalten (Backward-Compat).
- `render_log` enthaelt jetzt eine Zeile `[stock-sources] pexels=N pixabay=M` plus pro Segment `[seg-i] source=… ext_id=… res=…`.

Migration: `supabase/supabase-reels-pixabay-key.sql` ergaenzt das JSON-Setting `reels_settings` um `pixabay_api_key` (leer als Default).

### 1.6 Inter Tight als Marken-Schrift
Inter Tight Variable Font (OFL, Google Fonts) liegt jetzt unter `assets/fonts/InterTight.ttf` (~570 KB). Dockerfile kopiert sie nach `/usr/share/fonts/cam2rent/InterTight.ttf` und ruft `fc-cache -fv` auf. `detectFontPath()` prueft beim ersten Aufruf via `existsSync` und faellt auf `DejaVuSans-Bold` zurueck, falls Inter Tight nicht da ist (lokale Dev-Renders ohne Docker-Image).

**Hinweis Variable Font:** FreeType liest die Default-Instance (wght=400 = Regular). Mit `borderw=3` aus `buildStackedDrawtext` wirkt der Output trotzdem deutlich kraeftiger und ist sichtbar moderner als DejaVu. Falls echtes ExtraBold gewuenscht ist, kann eine statische Inter-Tight-ExtraBold-TTF spaeter unter gleichem Pfad hinterlegt werden — kein Code-Change noetig.

## Vorher / Nachher (Erwartung — wird nach Coolify-Deploy gegen reale Reels validiert)

| Metrik | Vorher | Nachher (Erwartung) |
|---|---|---|
| Thumbnail | Logo-Frame | Action-Frame aus Body-Segment |
| Pro-Segment-Encode | veryfast / crf 23 | medium / crf 20 |
| Concat-Encode | veryfast / crf 23 (Re-Encode!) | -c copy (Stream-Copy) |
| Render-Zeit 30s Reel | ~70-80 s | -30% durch Wegfall des Re-Encodes |
| Datei-Groesse 30s Reel | ~5-10 MB | ~8-15 MB (medium/crf 20 + faststart) |
| Stock-Aufloesung | 720p moeglich (auf 1080p hochskaliert) | min. 1080 px in kuerzerer Dimension |
| Stock-Quellen | Pexels only | Pexels + Pixabay (sobald Key gesetzt) |
| Schrift | DejaVuSans-Bold (Alpine-Default) | Inter Tight (mit Fallback auf DejaVu) |

**Validierungs-Plan nach Deploy:**
1. 3x 30s-Reel rendern, Render-Zeit gemittelt vergleichen.
2. ffprobe-Output (`bit_rate`, `width`, `height`) protokollieren.
3. 5 Reels rendern, Thumbnails sichten — alle unterschiedlich, keines mit Logo.
4. Pixabay-Key in `admin_settings.reels_settings.pixabay_api_key` setzen, 10 Reels rendern, Quell-Verteilung im `render_log` pruefen.

## Migrationen / Setup-TODO fuer Go-Live
1. **SQL** `supabase/supabase-reels-pixabay-key.sql` ausfuehren (idempotent, ergaenzt nur `pixabay_api_key`-Default in JSON-Setting).
2. **Optional** `PIXABAY_API_KEY` als Env in Coolify hinterlegen ODER unter `/admin/social/reels/vorlagen` (Einstellungen) eintragen. Solange leer: Pexels-only-Verhalten (keine Aenderung).
3. **Docker-Image neu bauen** — Dockerfile installiert jetzt `fontconfig` zusaetzlich und kopiert Inter Tight ins Image. Alter Image-Tag bricht nicht (Fallback auf DejaVu).

## Bekannte Limitierungen

- Inter Tight wird als Variable Font (Regular-Default) gerendert. Echtes ExtraBold-Rendering erfordert eine statische TTF (kann spaeter ohne Code-Change nachgereicht werden).
- Pixabay liefert teils nur 960×540 oder Sub-1080p — wird durch den Floor in `pickBestPixabayFile` gefiltert. Bei sehr spezifischen Search-Queries kann Pixabay leer ausgehen → Fallback auf Pexels greift automatisch.
- `-c copy`-Concat erfordert bitstream-kompatible Segmente. Falls in der Praxis Concat-Fehler (`Non-monotonous DTS`) auftauchen, ist der naechste Schritt: temporaerer Fallback auf Re-Encode mit `STD_VIDEO_ENCODE_ARGS` (Daten bleiben trotzdem `medium/crf 20`).

## Was als Naechstes kommt (Phase 2)

- Crossfades zwischen Body-Szenen (xfade-Filter, akzeptiert dafuer Re-Encode am Concat-Step zurueck — netto trotzdem schneller als Status quo).
- Ken-Burns-Effekt (zoompan) auf Stock-Clips, deterministisch via Reel-ID-Hash.
- CTA + Outro mit Gradient-Hintergrund + Logo + URL-Pill.
- Quality-Metriken in neuer Spalte `social_reels.quality_metrics` (JSONB).
