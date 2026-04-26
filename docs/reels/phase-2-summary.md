# Reels Phase 2 — Stilistische Aufwertung

**Ziel:** Reels sehen nicht mehr nach „Stock-Footage-Generator" aus. Crossfades, Ken-Burns, gebrandete CTAs + Outro, strukturierte Metriken in DB.

## Was sich aendert

### 2.1 Crossfades zwischen Body-Szenen + CTA
Der Concat-Schritt aus Phase 1 (`-c copy` ueber alle Pro-Segmente) wird jetzt zweistufig:
1. **Body-Szenen + CTA** werden separat in `bodyAndCtaSegments` gesammelt und mit `xfade=transition=fade:duration=0.4` zu **einem File** `body-cta.mp4` zusammengefuehrt. Re-Encode hier zwingend (xfade braucht Pixel-Zugriff), aber die Ausgabe nutzt `STD_VIDEO_ENCODE_ARGS` aus Phase 1 — bleibt damit bitstream-kompatibel.
2. **Final-Concat** der drei Files `[intro?, body-cta.mp4, outro?]` laeuft weiterhin per Demuxer + `-c copy` — also **kein** Re-Encode am Endpunkt.

**Voice-Sync-Fix:** Jeder xfade verkuerzt die Body+CTA-Strecke um 0.4 s. Damit der TTS-Voice-Track auf den Szenen sitzt, wird im Voice-Track-Build die Dauer aller Segmente _ausser_ dem letzten um 0.4 s gekuerzt (Mindestwert 0.5 s). Die finalen Audio-/Video-Stroeme bleiben sauber synchron.

**Edge-Case:** Bei nur 1 Body+CTA-Segment (z.B. CTA-only) wird kein xfade ausgefuehrt — `body-cta.mp4` ist dann nur ein 1:1-Copy, kein Re-Encode.

Hard-Cuts bleiben weiterhin zwischen Intro→Body und CTA→Outro — xfade dort wirkt unruhig wegen der kurzen Branding-Frames.

### 2.2 Ken-Burns-Effekt auf Stock-Clips
Stock-Clips bekommen pro Szene einen subtilen Zoom oder Pan, deterministisch via `reelId + sceneIdx`-Hash (FNV-1a). Vier Varianten:
- `zoom-in`: Skala 1.0 → 1.08 ueber Szenen-Dauer
- `zoom-out`: Skala 1.08 → 1.0
- `pan-left`: Zoom 1.04 fest, x-Bewegung von rechts nach links
- `pan-right`: analog umgekehrt

Implementierung mit `zoompan`-Filter, vorher `scale=2160x3840` damit zoompan auf einer 2x-Quelle arbeitet (vermeidet Pixel-Stretch-Artefakte am Rand).

**Performance-Aufschlag:** ~15-25 % Render-Zeit pro Szene auf CPX32. Bei 30s-Reel: +10-15 s. Akzeptabel.

**Konfiguration pro Template:** Neues Feld `social_reel_templates.motion_style` mit Werten `'static'` | `'kenburns'` (Default) | `'mixed'` (~50/50). Migration: `supabase/supabase-reels-motion-style.sql`. Im Admin-UI (`/admin/social/reels/vorlagen`) ist das Feld als Dropdown im Template-Editor sichtbar.

### 2.3 + 2.4 CTA + Outro mit echtem Branding
Beide Frames nutzen jetzt das gleiche Layout — verschmelzen visuell zu einem zweiteiligen Endbild:
- **Hintergrund**: Pre-rendered `assets/reels/cta-gradient.png` (1080x1920, vertikaler Gradient `#0F172A` → `#1E40AF`)
- **Logo**: oben mittig, ~400 px Breite, `findLogoPath()`-Fallback-Chain
- **Headline**: bei y=46 % Hoehe, Inter Tight 88pt, weiss
- **Subline**: bei y=60 % Hoehe, Inter Tight 52pt, Cyan `#06B6D4`
- **URL-Pill**: pre-rendered `assets/reels/cta-url-pill.png` (720x140, weiss mit 28px Border-Radius + Drop-Shadow), unten zentriert
- **Pill-Text**: "cam2rent.de" via `drawtext` auf der Pill, 44pt Dark Navy

Outro nutzt **fest** `headline=''` + `subline='Action-Cam mieten in Berlin'`.

**Pre-rendered Assets** statt FFmpeg-`geq`: `geq` ist zu langsam fuer Full-HD-Gradients (~4 s/Frame), Pre-rendered PNG-Overlay ist zero-cost. `drawbox` kann zudem keine Border-Radius — Pill-PNG mit Alpha-Channel loest das ohne Extra-Filter.

**Generator-Skript:** `scripts/reels/generate-cta-assets.mjs` (Sharp-basiert). Wird einmalig ausgefuehrt, beide PNGs landen committed im Repo. Re-Run bei Brandfarben-Aenderung.

**Fallback** bei fehlenden Assets (lokales Dev ohne Generator-Lauf): alter Color-BG + drawtext-Layout. Erkannt via `existsSync` der beiden PNGs + Logo-Pfad. So brechen lokale Renders nicht.

### 2.5 Quality-Metrics in DB
Neue Spalte `social_reels.quality_metrics JSONB` (Migration `supabase/supabase-reels-quality-metrics.sql`). Pro Render geschrieben:

```ts
{
  file_size_bytes: number,
  duration_seconds: number,
  avg_bitrate_kbps: number,
  segment_count: number,                     // Body + CTA
  source_resolutions: [{ index, width, height, source }],
  stock_sources: { pexels: N, pixabay: M },
  render_duration_seconds: number,           // Wall-Clock fuer renderReel
  font_used: 'Inter Tight' | 'DejaVuSans-Bold',
  motion_style: 'static' | 'kenburns' | 'mixed'
}
```

**Defensiver DB-Write:** Wenn die Migration `quality_metrics` noch nicht ausgefuehrt ist, fangen wir den Spalten-Fehler ab und fallen auf das alte UPDATE ohne `quality_metrics` zurueck. Kein Rollback noetig.

**Admin-UI:** Auf `/admin/social/reels/[id]` neuer collapsible Block „Render-Metriken" zwischen Skript und Render-Log. Default eingeklappt, zeigt Datei-Groesse / Bitrate / Render-Zeit / Stock-Source-Verteilung / Font / Motion-Style.

## Vorher / Nachher (Erwartung)

| Metrik | Vorher (Phase 1) | Nachher (Phase 2) |
|---|---|---|
| Übergänge zwischen Body-Szenen | Hard-Cut | 0.4 s Crossfade |
| Stock-Clip-Bewegung | Static (gecroppt + getrimmt) | Ken-Burns (Zoom oder Pan, pro Szene zufällig) |
| CTA-Layout | Color-BG + 2 drawtext-Zeilen | Gradient + Logo + Headline + Subline + URL-Pill |
| Outro-Layout | Logo zentriert auf Navy + Tagline | Identisch zu CTA, nur feste Subline |
| Quality-Metriken in DB | nur `render_log` (Text) | `quality_metrics` JSONB strukturiert |
| Render-Zeit 30s-Reel | -30 % vs. Status quo | +10-15 % wegen zoompan + xfade-Re-Encode → vermutlich ähnlich Status quo |
| Datei-Größe 30s-Reel | 8-15 MB | 8-18 MB (Crossfades + Ken-Burns durch Re-Encode minimal größer) |

## Migrationen / Setup-TODO fuer Go-Live
1. **SQL** `supabase/supabase-reels-motion-style.sql` ausfuehren (idempotent, ergaenzt nur die Spalte mit Default `'kenburns'`).
2. **SQL** `supabase/supabase-reels-quality-metrics.sql` ausfuehren (idempotent).
3. **Docker-Image neu bauen** — Dockerfile ist unveraendert seit Phase 1, aber `assets/reels/`-Ordner ist neu im Repo (wird per `COPY . .` mitkopiert).
4. Optional: Wenn die Brandfarben sich aendern → `node scripts/reels/generate-cta-assets.mjs` ausfuehren + neue PNGs committen.

## Bekannte Limitierungen

- `xfade` mit `duration=0.4` verkuerzt die Voice-Track-Dauer pro Segment um 0.4 s. Bei sehr kurzen Szenen (< 1 s) wuerde das den Voice fast komplett killen — wir haben einen Floor von 0.5 s, sodass kein Voice-Segment unter 0.5 s padded wird. Bei normalen 3-6 s-Szenen ist die Verkuerzung kaum hoerbar.
- Variable Fonts wie Inter Tight rendern in FreeType immer als Default-Instance (Regular bei wght=400). Phase 2 nutzt das weiterhin — echtes ExtraBold erfordert eine statische TTF.
- Re-Encode bei xfade fuehrt zu marginal anderem Output (visuell identisch). Erste manuelle Stichprobe nach Deploy: `ffprobe out.mp4` auf `bit_rate` + Frame-Count.

## Was als Naechstes kommt (Phase 3)
- Pro-Szene-Persistierung in `social-reels/{reelId}/segments/seg-N-*.mp4`
- Neue Tabelle `social_reel_segments`
- API-Routen fuer Segment-Tausch
- Admin-UI: Szenen-Editor unter dem Video-Player
- Cleanup-Cron fuer alte published Reels (≥ 30 Tage)
