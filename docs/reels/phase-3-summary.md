# Reels Phase 3 — Pro-Szene-Re-Render-UI

**Ziel:** Admin kann eine einzelne Body-Szene in einem fertigen Reel austauschen, ohne das ganze Reel neu zu generieren (KI-Tokens + Stock-API-Quota gespart). Voraussetzung: Segmente werden bereits beim Initial-Render persistiert.

## Was sich aendert

### 3.1 Backend: Segmente persistieren
Pro Render landen ALLE Pro-Szene-Files zusaetzlich zum finalen `video.mp4` einzeln im Storage:
```
social-reels/{reelId}/
  ├── video.mp4              (final, public)
  ├── thumb.jpg              (public)
  ├── segments/
  │   ├── seg-0-intro.mp4
  │   ├── seg-1-body.mp4
  │   ├── seg-2-body.mp4
  │   ├── seg-3-cta.mp4
  │   └── seg-4-outro.mp4
  └── audio/
      ├── voice-1.mp3
      └── ...
```

`renderReel()` (in `lib/reels/ffmpeg-render.ts`) gibt jetzt zusaetzlich `segments: PersistedSegment[]` zurueck. Der Orchestrator laedt jeden Buffer in den Storage-Bucket hoch und schreibt eine Row in die neue Tabelle `social_reel_segments`.

**Migration:** `supabase/supabase-reel-segments.sql` (idempotent). Spalten: id, reel_id (FK CASCADE), index, kind (`intro|body|cta|outro`), storage_path, duration_seconds, scene_data JSONB, source_clip_data JSONB, has_voice, voice_storage_path, created_at, updated_at, UNIQUE(reel_id, index). RLS aktiviert (Service-Role only). Auto-Trigger fuer updated_at.

**Defensiv:** Wenn die Migration noch nicht durch ist, wird der DB-Insert mit Warning verworfen — der Initial-Render bleibt funktional, aber Phase-3-Tausch geht erst nach Migration.

### 3.2 Pro-Szene-Tausch
Neue Lib `lib/reels/segment-regenerator.ts` mit `regenerateBodySegment(opts)`:
1. Reel + alle Segmente aus DB laden, Status-Gate (kein Tausch wenn `published`).
2. Zielsegment validieren (muss `kind='body'` sein).
3. Stock-Clip suchen via `findClipForQuery` (mit `excludeIds` inkl. allen aktuellen Body-Clips → keine Duplikate im selben Reel).
4. Tmp-Workdir, neues Body-Segment rendern (gleiche Encode-Args wie Initial-Render: `STD_VIDEO_ENCODE_ARGS`, Ken-Burns aus `motion_style` des Templates).
5. Alle anderen Segmente aus Storage downloaden (intro, andere bodies, cta, outro).
6. Body+CTA mit xfade neu mergen (`buildBodyCtaWithCrossfade` aus Phase 2.1).
7. Final-Concat per Demuxer + `-c copy` (drei Files: intro/body-cta/outro).
8. Audio-Re-Mix: Voice-Track aus den persistierten `voice-N.mp3`-Files neu zusammenbauen + Music-URL ueberlagern.
9. Storage-Upload (overwrite): neues seg-N-body.mp4, neues video.mp4, neues thumb.jpg (falls erstes Body getauscht wurde).
10. DB-Updates: scene_data + source_clip_data, video_url, quality_metrics.

**Hilfsfunktionen** im Regenerator:
- `rebuildVoiceTrack`: laedt persistierte voice-Files, padded auf effective duration (mit xfade-Verkuerzung), concat'et zu `voice-track.m4a`.
- `mixFinalAudio`: identische Mix-Logik wie in `renderReel` (Voice+Musik / Voice / Musik / Stille).

**Exportierte Helper aus `ffmpeg-render.ts`** fuer Code-Wiederverwendung: `runFfmpeg`, `downloadToFile`, `buildClipFilter`, `buildBodyCtaWithCrossfade`, `pickKenBurnsVariant`, `STD_VIDEO_ENCODE_ARGS`, `TARGET_W/H/FPS`, `MotionStyle`, `ReelQualityMetrics`.

### API-Routen
- `GET /api/admin/reels/[id]/segments` — Liste aller Segmente eines Reels mit Storage-Public-URLs (cache-bust via `updated_at`).
- `POST /api/admin/reels/[id]/segments/[segmentId]` — triggert `regenerateBodySegment`. Body: `{ newSearchQuery?, newTextOverlay?, excludeClipIds?, confirm? }`. Status-Gate: `published` → 400, `scheduled` → 409 wenn `confirm` fehlt. Audit-Log `reel.regenerate_segment`.
- `GET /api/admin/reels/preview-stock?query=…&source=pexels|pixabay` — Live-Vorschau-Endpoint fuer Phase-3-x-Erweiterung (Modal mit Thumbnail-Auswahl). Liefert max 6 Treffer pro Quelle.

`maxDuration = 300` auf der Regenerate-Route — Render mit Pexels-Download kann bis ~60 s dauern.

### 3.3 Admin-UI
Auf `/admin/social/reels/[id]` neue Section **Szenen** unter Skript-Block. Layout:
- Grid (2/3/5 Spalten responsive) mit Mini-`<video>`-Vorschau pro Segment (HTML5 `<video preload="metadata">` zeigt ersten Frame als Poster).
- Pro Segment: Kind-Badge (Intro/Body/CTA/Outro), Index, Text-Overlay-Auszug, Dauer, Source-Info (Pexels/Pixabay + Aufloesung), Voice-Indicator (🔊).
- Pro **Body-Segment** zwei Buttons:
  - **🔄 Neuer Clip** — POST regenerate ohne `newSearchQuery` → System pickt einen neuen Clip mit der gleichen Query.
  - **✏️ Query** — oeffnet Modal mit Eingabefeld + aktuellem Search-Term, beim Submit POST mit `newSearchQuery`.
- Buttons disabled bei `regeneratingId !== null`, `status='published'` oder `status='rendering'`.
- Loading-Overlay auf der Karte waehrend Tausch laeuft (`bg-black/70` + Pulse-Text).
- Hinweis-Banner falls Reel pre-Phase-3 gerendert wurde („Szenen-Editor steht erst nach Neu-Render zur Verfuegung").
- Reel-Status `published` zeigt zusaetzlichen Sperr-Hinweis unter dem Grid.

### 3.4 Cleanup-Cron
Neuer Endpoint `/api/cron/reels-segment-cleanup`:
- Loescht `segments/` + `audio/` Unterordner fuer Reels mit `status='published'` UND `published_at < now() - 30 days`.
- Final `video.mp4` + `thumb.jpg` bleiben.
- Per Run max 50 Reels (Cron-Timeout-Schutz).
- `acquireCronLock('reels-segment-cleanup')` verhindert parallele Laeufe.
- DB-Rows in `social_reel_segments` werden ebenfalls geloescht (`ON DELETE CASCADE` greift bei reel_id-Delete; hier wird nur das Segment-Record geloescht, nicht das Reel).

**Crontab-Eintrag** (Hetzner, taeglich 04:00):
```
0 4 * * * curl -s -X POST -H "x-cron-secret: $CRON_SECRET" https://cam2rent.de/api/cron/reels-segment-cleanup
```

## Storage-Impact
- Pro Reel zusaetzlich ~10-20 MB Segmente + ~1-3 MB Voice-Files = ~15-25 MB on top.
- Bei 60 Reels/Monat × 20 MB ≈ 1.2 GB/Monat.
- Mit 30-Tage-Retention pendelt es sich bei ~1.2 GB ein, statt monatlich zu wachsen.

## Migrationen / Setup-TODO fuer Go-Live
1. **SQL** `supabase/supabase-reel-segments.sql` ausfuehren (idempotent).
2. **Crontab Hetzner** ergaenzen (siehe oben).
3. **Erstes neues Reel rendern** nach Deploy → in `/admin/social/reels/[id]` sollte die Szenen-Section erscheinen. Bei Reels von vor dem Deploy zeigt das UI den Hinweis-Banner.

## Bekannte Limitierungen + Phase-3.x-Ideen
- **Tausch nur fuer Body-Segmente** — Intro/CTA/Outro sind brand-fixiert, daher kein Tausch-UI dafuer.
- **Live-Vorschau im Query-Modal noch nicht aktiv:** Der `preview-stock`-Endpoint ist da und liefert die Top-6-Treffer, aber das Modal nutzt aktuell nur Text-Input + System-Pick. Phase 3.x: Modal um Thumbnail-Grid erweitern, Admin pickt einen spezifischen Clip → POST mit `forceClip`-Feld (im Regenerator zu ergaenzen).
- **Voice bleibt unveraendert** — wenn der Admin nur den Stock-Clip tauscht, bleibt der bestehende TTS-Voice fuer dieses Segment in Kraft. Wenn auch der Voice-Text neu sein soll, kommt das in einer zukuenftigen Iteration (TTS-Re-Render + Voice-Buffer-Replace).
- **Render-Zeit Tausch:** 30-60 s pro Segment-Tausch (1× neuer Clip-Download + 1× Body-Encode + 1× Body-CTA-Merge + 1× Final-Concat + 1× Audio-Mix). Status-Spinner im UI laeuft.

## Was als Naechstes sinnvoll waere
- Live-Vorschau im Query-Modal (Thumbnail-Grid) — der Endpoint ist schon da.
- Voice-Re-Render bei Text-Aenderung.
- Reel-Reset-Button („Alle Tausch-Aenderungen verwerfen, Original wiederherstellen") — koennte ueber Snapshot-Logik in Storage gehen.
- "Mehrere Szenen gleichzeitig tauschen" als Batch-Aktion — aktuell ist es seriell.
