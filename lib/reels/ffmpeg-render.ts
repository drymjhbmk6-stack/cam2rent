/**
 * FFmpeg-basierter Reel-Renderer.
 *
 * Nutzt das system-installierte ffmpeg (im Dockerfile via `apk add ffmpeg`).
 * Keine NPM-Dependencies — wir sprechen direkt via child_process mit ffmpeg.
 *
 * Pipeline für Stock-Footage-Reels:
 *   1. Alle Pexels-Clips in /tmp herunterladen
 *   2. Jeden Clip: auf 1080x1920 croppen/scalen, auf Szenen-Dauer trimmen, Text-Overlay drawtext
 *   3. CTA-Frame aus Farb-Hintergrund + drawtext erzeugen (via -f lavfi color)
 *   4. Alle Segmente mit concat-demuxer zusammenfügen
 *   5. Musik-Track (optional) darunterlegen
 *
 * Pipeline für Motion-Graphics:
 *   Reine lavfi-Quellen (color, gradients) + drawtext pro Szene, zusammenconcat.
 *
 * Output: H.264 MP4, AAC Audio, 1080x1920 (9:16), 30 fps.
 */

import { spawn } from 'child_process';
import { writeFile, mkdir, rm, readFile, access } from 'fs/promises';
import { tmpdir } from 'os';
import path from 'path';
import type { ReelScript } from './script-ai';
import type { StockClip } from './stock-sources/types';
import { stableHash } from './stock-sources';

export type MotionStyle = 'static' | 'kenburns' | 'mixed';

export interface RenderInput {
  script: ReelScript;
  templateType: 'stock_footage' | 'motion_graphics';
  // Phase 1.5: StockClip ist die plattform-neutrale Form (Pexels + Pixabay).
  // Alter Pexels-spezifischer Typ ist im Re-Export `lib/reels/pexels.ts`
  // weiterhin verfuegbar fuer Backward-Compat.
  clips?: StockClip[]; // nur für stock_footage
  musicUrl?: string;                                            // optional
  bgColorFrom?: string;                                         // motion_graphics
  bgColorTo?: string;
  /**
   * Optional: Array aus MP3-Buffern, einer pro Szene + 1 fuer CTA (letzte).
   * Wenn gesetzt, wird der Voiceover als Audio-Track in das Video gemischt.
   * Reihenfolge: scenes[0], scenes[1], ..., cta_frame
   */
  voiceSegments?: Buffer[];
  /**
   * Intro/Outro-Frames mit cam2rent-Logo (Default beide AN, je 1.5s).
   * Optional ueber reels_settings.intro_enabled / outro_enabled deaktivierbar.
   */
  introEnabled?: boolean;   // Default: true
  outroEnabled?: boolean;   // Default: true
  introDuration?: number;   // Default: 1.5s
  outroDuration?: number;   // Default: 1.5s
  /**
   * Phase 2.2: Steuert den Ken-Burns-Effekt auf Stock-Clips.
   *   'static'   — kein Effekt (Status quo vor Phase 2).
   *   'kenburns' — pro Szene zufaellig Zoom-In / Zoom-Out / Pan-left / Pan-right.
   *   'mixed'    — pro Szene zufaellig 'static' oder 'kenburns'.
   * Default: 'kenburns'. Kommt vom Template (`social_reel_templates.motion_style`).
   */
  motionStyle?: MotionStyle;
  /**
   * Phase 2.2: Seed fuer die deterministische Effekt-Auswahl. Identische reelId
   * + sceneIdx → gleiche Variante bei Re-Render. Typisch: `social_reels.id`.
   */
  reelId?: string;
}

export interface ReelQualityMetrics {
  file_size_bytes: number;
  duration_seconds: number;
  avg_bitrate_kbps: number;
  segment_count: number;
  source_resolutions: Array<{ index: number; width: number; height: number; source: string }>;
  stock_sources: Record<string, number>;
  render_duration_seconds: number;
  font_used: string;
  motion_style: MotionStyle;
}

/**
 * Phase 3.1: Persisted-Segment-Info pro gerendertem Pro-Szene-File.
 * Caller (Orchestrator) lädt die Buffer in den Storage-Bucket hoch und
 * schreibt eine Row in `social_reel_segments`.
 */
export interface PersistedSegment {
  index: number;                                       // Position im Final-Reel (0 = intro)
  kind: 'intro' | 'body' | 'cta' | 'outro';
  buffer: Buffer;                                      // MP4-Bytes
  duration: number;                                    // Sekunden
  /** Body-Segmente: { text_overlay, search_query, voice_text } aus dem Skript */
  sceneData?: Record<string, unknown>;
  /** Body-Segmente mit Stock-Footage: { source, externalId, downloadUrl, width, height, attribution } */
  sourceClipData?: Record<string, unknown>;
}

export interface RenderResult {
  videoBuffer: Buffer;
  thumbnailBuffer: Buffer;
  durationSeconds: number;
  log: string; // FFmpeg-Stderr für Debugging
  /** Phase 2.5: strukturierte Render-Metriken fuer DB-Spalte `quality_metrics`. */
  qualityMetrics: ReelQualityMetrics;
  /** Phase 3.1: Buffer aller Pro-Szene-Files fuer Storage-Persistierung. */
  segments: PersistedSegment[];
}

// Phase 3: exportiert, damit segment-regenerator.ts dieselben Dimensionen + FPS nutzt.
export const TARGET_W = 1080;
export const TARGET_H = 1920;
export const TARGET_FPS = 30;

// Phase 1 (1.6): Inter Tight ist die primaere Marken-Schrift im Reel.
// Liegt im Repo unter assets/fonts/InterTight.ttf (Variable Font, OFL) und wird
// vom Dockerfile nach /usr/share/fonts/cam2rent/ kopiert. DejaVuSans-Bold bleibt
// als Fallback fuer lokale Dev-Renders ohne den Font-Install.
//
// Hinweis Variable Font: FreeType nutzt bei drawtext die Default-Instance (wght=400 = Regular).
// Mit `borderw=3` aus buildStackedDrawtext sieht der Output trotzdem deutlich kraeftiger aus
// als DejaVuSans-Bold und ist sichtbar moderner / brand-konsistent. Wenn echtes ExtraBold
// gewuenscht ist, kann eine statische Inter-Tight-ExtraBold-TTF spaeter unter gleichem
// Pfad hinterlegt werden (Phase 2 oder spaeter).
const FONT_PATH_PRIMARY = '/usr/share/fonts/cam2rent/InterTight.ttf';
const FONT_PATH_FALLBACK = '/usr/share/fonts/TTF/DejaVuSans-Bold.ttf';

// Phase 2.3: Pre-rendered CTA-Brand-Assets im Repo (siehe scripts/reels/generate-cta-assets.mjs).
// Werden vom Renderer als Overlay-Inputs benutzt — robuster als geq-Filter (Gradient) oder
// drawbox (kann keine Border-Radius). Pfade absolut ueber process.cwd(), damit sie sowohl
// im Docker-Standalone-Output als auch im local-dev-Mode aufloesen.
const CTA_GRADIENT_PATH = path.join(process.cwd(), 'assets', 'reels', 'cta-gradient.png');
const CTA_URL_PILL_PATH = path.join(process.cwd(), 'assets', 'reels', 'cta-url-pill.png');

// Phase 1 (1.2/1.3): Vereinheitlichte Video-Encode-Argumente fuer ALLE Pro-Segment-Encodes.
// Profile high + Level 4.0 + GOP=60 + sc_threshold=0 stellen sicher, dass alle Segmente
// bitstream-kompatibel sind und der Concat-Step mit `-c copy` ohne Re-Encode auskommt.
// preset=medium / crf=20 ersetzt veryfast/23 — sichtbar weniger Block-Artefakte in
// Bewegungs-Szenen, ~2x langsamer pro Segment, durch Wegfall des Concat-Re-Encodes
// netto aber nicht langsamer als der vorige Status.
// Datei-Groesse 30s-Reels: typisch 8-15 MB (gesund unter 50 MB Bucket-Limit).
export const STD_VIDEO_ENCODE_ARGS: string[] = [
  '-c:v', 'libx264',
  '-profile:v', 'high',
  '-level', '4.0',
  '-pix_fmt', 'yuv420p',
  '-r', String(TARGET_FPS),
  '-g', String(TARGET_FPS * 2),       // GOP = 2 Sekunden
  '-keyint_min', String(TARGET_FPS * 2),
  '-sc_threshold', '0',
  '-preset', 'medium',
  '-crf', '20',
];

/**
 * Escaping für FFmpeg drawtext-Filter. Quelle: https://ffmpeg.org/ffmpeg-filters.html#drawtext
 * Problematische Zeichen: : \ ' %
 */
function escapeDrawtext(s: string): string {
  return s
    .replace(/\\/g, '\\\\')
    .replace(/:/g, '\\:')
    .replace(/'/g, "\\'")
    .replace(/%/g, '\\%')
    .replace(/,/g, '\\,');
}

/**
 * Bricht Text greedy in Zeilen mit max `maxCharsPerLine` Zeichen um.
 * Zu lange Einzelworte werden nicht zerteilt (dann wird die Zeile etwas länger).
 */
function wrapText(raw: string, maxCharsPerLine: number): string[] {
  const words = raw.trim().split(/\s+/).filter(Boolean);
  if (words.length === 0) return [];
  const lines: string[] = [];
  let current = '';
  for (const word of words) {
    const candidate = current ? `${current} ${word}` : word;
    if (candidate.length <= maxCharsPerLine || !current) {
      current = candidate;
    } else {
      lines.push(current);
      current = word;
    }
  }
  if (current) lines.push(current);
  return lines;
}

/**
 * Wählt dynamisch Schriftgröße + Zeilen-Kapazität basierend auf Text-Länge.
 * Wir gehen grob von 0.55×fontsize als durchschnittliche Zeichen-Breite aus.
 * Safe-Area für Reels: ~84% der Bildbreite (16% Rand links/rechts).
 */
function pickFontSize(raw: string, maxFontSize: number, maxLines: number): { fontsize: number; maxCharsPerLine: number } {
  const safeWidthPx = TARGET_W * 0.84;
  const tryWith = (size: number) => {
    const charsPerLine = Math.max(10, Math.floor(safeWidthPx / (size * 0.55)));
    const lines = wrapText(raw, charsPerLine);
    return { fontsize: size, maxCharsPerLine: charsPerLine, lineCount: lines.length };
  };

  let current = tryWith(maxFontSize);
  // Verkleinere schrittweise bis die Zeilen-Anzahl unter maxLines liegt
  const minSize = Math.max(32, Math.round(maxFontSize * 0.5));
  while (current.lineCount > maxLines && current.fontsize > minSize) {
    current = tryWith(current.fontsize - 4);
  }
  return { fontsize: current.fontsize, maxCharsPerLine: current.maxCharsPerLine };
}

/**
 * Baut einen drawtext-Filter-String pro Zeile, vertikal gestapelt.
 * yCenterExpr: FFmpeg-Ausdruck für die Y-Mitte des Text-Blocks (z.B. "(h-text_h)/2").
 *              Wir rechnen selbst Offsets drauf — text_h nimmt FFmpeg pro Zeile einzeln.
 */
function buildStackedDrawtext(
  text: string,
  opts: {
    fontsize: number;
    maxLines: number;
    yCenterPx: number;         // absolute Y-Mitte des Blocks (Pixel)
    fontcolor?: string;
    borderw?: number;
    bordercolor?: string;
    box?: boolean;
    boxcolor?: string;
    boxborderw?: number;
  }
): string {
  const font = detectFontPath();
  const picked = pickFontSize(text, opts.fontsize, opts.maxLines);
  const lines = wrapText(text, picked.maxCharsPerLine);
  if (lines.length === 0) return 'null';

  const lineHeight = Math.round(picked.fontsize * 1.25);
  const totalHeight = lineHeight * lines.length;
  const topY = Math.round(opts.yCenterPx - totalHeight / 2);

  const fc = opts.fontcolor ?? 'white';
  const bw = opts.borderw ?? 3;
  const bc = opts.bordercolor ?? 'black@0.7';
  const useBox = opts.box === true;
  const boxcolor = opts.boxcolor ?? 'black@0.55';
  const boxborderw = opts.boxborderw ?? 20;

  return lines
    .map((line, i) => {
      const y = topY + i * lineHeight;
      const escaped = escapeDrawtext(line);
      const parts = [
        `drawtext=fontfile='${font}'`,
        `text='${escaped}'`,
        `expansion=none`,
        `fontsize=${picked.fontsize}`,
        `fontcolor=${fc}`,
        `borderw=${bw}`,
        `bordercolor=${bc}`,
        `x=(w-text_w)/2`,
        `y=${y}`,
      ];
      if (useBox) {
        parts.push(`box=1`, `boxcolor=${boxcolor}`, `boxborderw=${boxborderw}`);
      }
      return parts.join(':');
    })
    .join(',');
}

// Phase 3: exportierter Helper, damit `lib/reels/segment-regenerator.ts` denselben Spawn-Pfad nutzt.
export async function runFfmpeg(args: string[]): Promise<{ stderr: string }> {
  return new Promise((resolve, reject) => {
    const proc = spawn('ffmpeg', args, { stdio: ['ignore', 'ignore', 'pipe'] });
    let stderr = '';
    proc.stderr.on('data', (chunk) => (stderr += chunk.toString()));
    proc.on('error', reject);
    proc.on('close', (code) => {
      if (code === 0) resolve({ stderr });
      else reject(new Error(`ffmpeg exit ${code}:\n${stderr.slice(-2000)}`));
    });
  });
}

export async function downloadToFile(url: string, destPath: string): Promise<void> {
  // Hotfix: 60s-Timeout — Stock-Videos sind 5-30 MB, bei langsamer Hetzner-zu-
  // Pexels-Verbindung okay, aber ohne Timeout konnte der Render bei einem haengenden
  // Download ewig hocken bleiben (Reel auf status='rendering' fixiert).
  const res = await fetch(url, {
    signal: AbortSignal.timeout(60_000),
  }).catch((err) => {
    if (err?.name === 'TimeoutError' || err?.name === 'AbortError') {
      throw new Error(`Download Timeout (60s): ${url.slice(0, 120)}`);
    }
    throw err;
  });
  if (!res.ok) throw new Error(`Download fehlgeschlagen (${res.status}): ${url}`);
  const buf = Buffer.from(await res.arrayBuffer());
  await writeFile(destPath, buf);
}

// Phase 1 (1.6): Font-Pfad einmalig per existsSync probieren (Init-Phase, kein Hot-Path).
// Wenn Inter Tight verfuegbar ist (Production-Image), nutzen wir die — sonst Fallback auf
// DejaVu, damit lokale Dev-Renders + Pre-Inter-Tight-Builds weiter funktionieren.
let cachedFontPath: string | null = null;
function detectFontPath(): string {
  if (cachedFontPath) return cachedFontPath;
  // require statt import: detectFontPath ist sync, fs/promises waere awaitable
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const fs = require('node:fs') as typeof import('node:fs');
  cachedFontPath = fs.existsSync(FONT_PATH_PRIMARY) ? FONT_PATH_PRIMARY : FONT_PATH_FALLBACK;
  return cachedFontPath;
}

/**
 * Phase 2.2: Wuerfelt eine Ken-Burns-Variante deterministisch aus seed+sceneIdx.
 * Kombination aus reelId + Index garantiert: gleicher Re-Render → gleiche Variante.
 *
 * 'static'    — kein Effekt
 * 'zoom-in'   — Skalierung 1.0 → 1.08, zentriert
 * 'zoom-out'  — Skalierung 1.08 → 1.0, zentriert
 * 'pan-left'  — leichte horizontale Bewegung von rechts nach links bei Zoom 1.04
 * 'pan-right' — analog umgekehrt
 */
type KenBurnsVariant = 'static' | 'zoom-in' | 'zoom-out' | 'pan-left' | 'pan-right';

export function pickKenBurnsVariant(
  motionStyle: MotionStyle,
  seed: string,
  sceneIdx: number
): KenBurnsVariant {
  if (motionStyle === 'static') return 'static';
  const h = stableHash(`${seed}:${sceneIdx}`);
  if (motionStyle === 'mixed') {
    // 50/50 ob ueberhaupt Effekt
    if ((h & 1) === 0) return 'static';
  }
  // 4 Varianten (zoom-in, zoom-out, pan-left, pan-right)
  const variants: KenBurnsVariant[] = ['zoom-in', 'zoom-out', 'pan-left', 'pan-right'];
  return variants[(h >>> 1) % variants.length];
}

/**
 * Phase 2.2: Baut den zoompan-Filter-String fuer eine bestimmte Ken-Burns-Variante.
 *
 * Wir machen vorab `scale=2160x3840`, damit der zoompan Inner-Frame-Crop sauber
 * bleibt (sonst entstehen Pixel-Artefakte am Rand bei Sub-Pixel-Verschiebungen).
 * Output ist immer 1080x1920 @ 30 fps.
 *
 * Bei zoom-in startet zoom bei 1.0 und steigt linear bis 1.08 ueber durationFrames.
 * Bei zoom-out: zoom startet bei 1.08, faellt auf 1.0 (mit `1.08-...`-Ausdruck).
 * Pan-left/right: zoom konstant bei 1.04, x bewegt sich von einem Rand zum anderen.
 *
 * `iw` und `ih` referenzieren beim zoompan die hochskalierte Quelle (2160×3840).
 * Das Output-Pixel-Format `s=1080x1920` enthaelt den finalen Frame nach Zoom.
 */
function buildKenBurnsFilter(variant: KenBurnsVariant, durationSec: number): string | null {
  if (variant === 'static') return null;
  const frames = Math.max(1, Math.round(durationSec * TARGET_FPS));
  // Vorab-Upscale damit zoompan keine Pixel-Stretching-Artefakte erzeugt
  const preScale = `scale=${TARGET_W * 2}:${TARGET_H * 2}:flags=bicubic`;
  const sOut = `${TARGET_W}x${TARGET_H}`;

  switch (variant) {
    case 'zoom-in': {
      // 1.0 → 1.08 linear, zentriert
      const z = `'1.0+0.08*on/${frames}'`;
      return `${preScale},zoompan=z=${z}:d=${frames}:x='iw/2-(iw/zoom/2)':y='ih/2-(ih/zoom/2)':s=${sOut}:fps=${TARGET_FPS}`;
    }
    case 'zoom-out': {
      // 1.08 → 1.0 linear, zentriert
      const z = `'1.08-0.08*on/${frames}'`;
      return `${preScale},zoompan=z=${z}:d=${frames}:x='iw/2-(iw/zoom/2)':y='ih/2-(ih/zoom/2)':s=${sOut}:fps=${TARGET_FPS}`;
    }
    case 'pan-right': {
      // zoom 1.04 fest, x von links (0) nach rechts (iw - iw/zoom)
      const z = `'1.04'`;
      const x = `'(iw-iw/zoom)*on/${frames}'`;
      const y = `'ih/2-(ih/zoom/2)'`;
      return `${preScale},zoompan=z=${z}:d=${frames}:x=${x}:y=${y}:s=${sOut}:fps=${TARGET_FPS}`;
    }
    case 'pan-left': {
      // zoom 1.04 fest, x von rechts nach links
      const z = `'1.04'`;
      const x = `'(iw-iw/zoom)*(1-on/${frames})'`;
      const y = `'ih/2-(ih/zoom/2)'`;
      return `${preScale},zoompan=z=${z}:d=${frames}:x=${x}:y=${y}:s=${sOut}:fps=${TARGET_FPS}`;
    }
  }
}

/**
 * Baut einen FFmpeg-Filterkomplex für einen Stock-Footage-Clip:
 * - Auf 1080x1920 croppen (cover), 30fps
 * - Auf Szenen-Dauer trimmen
 * - Phase 2.2: optional Ken-Burns (Zoom oder Pan) auf der gecroppten Quelle
 * - Text-Overlay unten mit schwarzem Hintergrund (55% Opazität)
 */
export function buildClipFilter(
  sceneText: string,
  duration: number,
  kenBurns: KenBurnsVariant = 'static'
): string {
  const baseFilters = [
    `scale=${TARGET_W}:${TARGET_H}:force_original_aspect_ratio=increase`,
    `crop=${TARGET_W}:${TARGET_H}`,
    `fps=${TARGET_FPS}`,
    `trim=duration=${duration}`,
    `setpts=PTS-STARTPTS`,
  ];

  // Phase 2.2: Ken-Burns kommt NACH dem Crop, damit zoompan auf einem 1080x1920-
  // Frame-Stack arbeitet (statt auf der Original-Quelle, die andere Aspect-Ratio
  // haben kann).
  const kbFilter = buildKenBurnsFilter(kenBurns, duration);
  if (kbFilter) baseFilters.push(kbFilter);

  const trimmed = (sceneText || '').trim();
  if (!trimmed) return baseFilters.join(',');

  // Text-Overlay unten, mit schwarzem Hintergrund für Lesbarkeit.
  // yCenter auf ca. 85% Höhe → Text sitzt im unteren Drittel.
  const overlay = buildStackedDrawtext(trimmed, {
    fontsize: 56,
    maxLines: 3,
    yCenterPx: Math.round(TARGET_H * 0.82),
    borderw: 3,
    bordercolor: 'black@0.8',
    box: true,
    boxcolor: 'black@0.55',
    boxborderw: 20,
  });

  return [...baseFilters, overlay].filter((f) => f && f !== 'null').join(',');
}

/**
 * Phase 2.3: Voll gebrandeter CTA-Frame.
 *
 * Layout (von oben nach unten):
 *   - cta-gradient.png als Hintergrund (1080x1920, Navy → Blue)
 *   - Logo bei y=140, ~400px Breite, zentriert
 *   - Headline bei y=TARGET_H*0.46 (Inter Tight, 88pt, weiss)
 *   - Subline bei y=TARGET_H*0.60 (Inter Tight, 52pt, Cyan #06B6D4)
 *   - URL-Pill (cta-url-pill.png) bei y=TARGET_H-260, 720x140 zentriert
 *   - "cam2rent.de"-Text auf der Pill, 44pt, Dark Navy
 *
 * Fallback bei fehlenden Assets: einfacher Color-BG + drawtext (alter Look).
 *
 * Nutzt filter_complex mit drei Bild-Inputs. Output-Stream-Label: `[out]`.
 */
function buildCtaFrameInput(
  text: { headline: string; subline?: string },
  duration: number,
  logoPath: string | null,
  fallbackBgColor: string
): { inputArgs: string[]; filterComplex: string; outLabel: string } {
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const fs = require('node:fs') as typeof import('node:fs');
  const hasGradient = fs.existsSync(CTA_GRADIENT_PATH);
  const hasPill = fs.existsSync(CTA_URL_PILL_PATH);
  const hasLogo = Boolean(logoPath);
  const fullBranded = hasGradient && hasPill && hasLogo;

  if (!fullBranded) {
    // Fallback: alter Color-BG + drawtext (Status quo vor Phase 2.3).
    const col = fallbackBgColor.startsWith('#') ? `0x${fallbackBgColor.slice(1)}` : fallbackBgColor;
    const inputArgs = ['-f', 'lavfi', '-t', String(duration), '-i', `color=c=${col}:s=${TARGET_W}x${TARGET_H}:r=${TARGET_FPS}`];
    const parts: string[] = [];
    if (text.headline?.trim()) {
      parts.push(
        buildStackedDrawtext(text.headline, {
          fontsize: 88,
          maxLines: 3,
          yCenterPx: Math.round(TARGET_H * 0.42),
          borderw: 2,
          bordercolor: 'black@0.3',
        })
      );
    }
    if (text.subline?.trim()) {
      parts.push(
        buildStackedDrawtext(text.subline, {
          fontsize: 52,
          maxLines: 2,
          yCenterPx: Math.round(TARGET_H * 0.58),
          fontcolor: 'white@0.9',
          borderw: 2,
          bordercolor: 'black@0.3',
        })
      );
    }
    const filter = parts.filter((p) => p && p !== 'null').join(',') || 'null';
    return { inputArgs, filterComplex: `[0:v]${filter},format=yuv420p[out]`, outLabel: '[out]' };
  }

  // Voll gebrandeter Pfad — drei Bild-Inputs:
  //   [0:v] = Gradient (1080x1920 PNG)
  //   [1:v] = Logo (weiss auf transparent)
  //   [2:v] = URL-Pill (weiss mit alpha + Shadow)
  // Audio wird durch -an im Caller verworfen — keine lavfi-Audio-Source noetig.
  const inputArgs: string[] = [
    '-loop', '1', '-t', String(duration), '-r', String(TARGET_FPS), '-i', CTA_GRADIENT_PATH,
    '-loop', '1', '-t', String(duration), '-r', String(TARGET_FPS), '-i', logoPath as string,
    '-loop', '1', '-t', String(duration), '-r', String(TARGET_FPS), '-i', CTA_URL_PILL_PATH,
  ];

  // Headline + Subline drawtext-Filter
  const headlineDraw = text.headline?.trim()
    ? buildStackedDrawtext(text.headline, {
        fontsize: 88,
        maxLines: 3,
        yCenterPx: Math.round(TARGET_H * 0.46),
        fontcolor: 'white',
        borderw: 0,
      })
    : null;
  const sublineDraw = text.subline?.trim()
    ? buildStackedDrawtext(text.subline, {
        fontsize: 52,
        maxLines: 2,
        yCenterPx: Math.round(TARGET_H * 0.60),
        fontcolor: '0x06B6D4', // cam2rent Cyan
        borderw: 0,
      })
    : null;

  // URL-Pill-Text (statisch "cam2rent.de" — Pill-PNG ist Layout, Text via drawtext flexibel)
  const font = detectFontPath();
  const urlText = escapeDrawtext('cam2rent.de');
  const pillTopY = TARGET_H - 260; // Pill-Position
  const pillCenterY = pillTopY + 70; // Pill ist 140 hoch (mit Shadow), effektive Mitte
  const urlDraw = `drawtext=fontfile='${font}':text='${urlText}':expansion=none:fontsize=44:fontcolor=0x0F172A:x=(w-text_w)/2:y=${pillCenterY}-text_h/2`;

  // Filter-Chain bauen
  // [0:v] Gradient ist schon 1080x1920 → kein Scale noetig
  // [1:v] Logo wird auf 400 Breite skaliert
  // [2:v] Pill wird auf 720 Breite skaliert (entspricht Pill-PNG-Dimensionen)
  const chain: string[] = [];
  chain.push(`[0:v]format=yuv420p,scale=${TARGET_W}:${TARGET_H}[bg]`);
  chain.push(`[1:v]scale=400:-1[logo]`);
  chain.push(`[bg][logo]overlay=(W-w)/2:140[v1]`);

  let prevLabel = '[v1]';
  if (headlineDraw) {
    chain.push(`${prevLabel}${headlineDraw}[v2]`);
    prevLabel = '[v2]';
  }
  if (sublineDraw) {
    chain.push(`${prevLabel}${sublineDraw}[v3]`);
    prevLabel = '[v3]';
  }
  chain.push(`[2:v]scale=720:-1[pill]`);
  chain.push(`${prevLabel}[pill]overlay=(W-w)/2:${pillTopY}[v4]`);
  chain.push(`[v4]${urlDraw},format=yuv420p[out]`);

  const filterComplex = chain.join(';');
  return { inputArgs, filterComplex, outLabel: '[out]' };
}

/**
 * Findet den cam2rent-Logo-PNG-Pfad (weiss auf transparent, fuer dunkle Hintergruende).
 * Fallback-Reihenfolge: public/logo/png/logo-mono-weiss-1200w.png → logo-dark-1200w.png → icon-512.png.
 * Gibt null zurueck wenn nichts verfuegbar (dann nur Text-Intro).
 */
async function findLogoPath(): Promise<string | null> {
  const candidates = [
    'public/logo/png/logo-mono-weiss-1200w.png',
    'public/logo/png/logo-dark-1200w.png',
    'public/icon-512.png',
  ];
  for (const rel of candidates) {
    const abs = path.join(process.cwd(), rel);
    try {
      await access(abs);
      return abs;
    } catch { /* try next */ }
  }
  return null;
}

/**
 * Erzeugt einen Intro- oder Outro-Frame mit cam2rent-Logo auf dunklem Hintergrund.
 * type='outro' fuegt zusaetzlich den Tagline-Text "cam2rent.de" darunter ein.
 */
async function buildBrandingFrame(
  workDir: string,
  type: 'intro' | 'outro',
  duration: number,
  outPath: string,
  logoPath: string | null
): Promise<{ log: string }> {
  // cam2rent-Navy als Hintergrund
  const bgColor = '0x0F172A';
  const font = detectFontPath();

  // Phase 2.4: Outro nutzt jetzt das gleiche gebrandete Layout wie der CTA
  // (Gradient + Logo + URL-Pill + feste Subline). CTA und Outro verschmelzen
  // visuell zu einem zweiteiligen Endbild mit konsistenter Farbsprache.
  if (type === 'outro') {
    const cta = buildCtaFrameInput(
      { headline: '', subline: 'Action-Cam mieten in Berlin' },
      duration,
      logoPath,
      '#0F172A',
    );
    const { stderr } = await runFfmpeg([
      '-y',
      '-hide_banner',
      '-loglevel', 'error',
      ...cta.inputArgs,
      '-filter_complex', cta.filterComplex,
      '-map', cta.outLabel,
      ...STD_VIDEO_ENCODE_ARGS,
      '-an',
      outPath,
    ]);
    return { log: stderr };
  }

  // ── Intro-Frame (unveraendert): cam2rent-Logo zentriert auf Navy ─────────
  if (!logoPath) {
    // Fallback: nur Wortmarke als Text
    const text = escapeDrawtext('cam2rent.de');
    // Phase 1 (1.2): STD_VIDEO_ENCODE_ARGS fuer Concat-Kompatibilitaet
    const { stderr } = await runFfmpeg([
      '-y',
      '-hide_banner',
      '-loglevel', 'error',
      '-f', 'lavfi',
      '-t', String(duration),
      '-i', `color=c=${bgColor}:s=${TARGET_W}x${TARGET_H}:r=${TARGET_FPS}`,
      '-vf', `drawtext=fontfile='${font}':text='${text}':expansion=none:fontsize=140:fontcolor=white:x=(w-text_w)/2:y=(h-text_h)/2`,
      ...STD_VIDEO_ENCODE_ARGS,
      '-an',
      outPath,
    ]);
    return { log: stderr };
  }

  // Mit Logo-PNG ueberlagern, leichter Fade-In am Anfang
  const fadeFilter = `fade=t=in:st=0:d=0.3`;
  const filterComplex = [
    `[1:v]scale=700:-1[logo]`,
    `[0:v][logo]overlay=(W-w)/2:(H-h)/2-80,${fadeFilter}`,
  ].join(';');

  // Phase 1 (1.2): STD_VIDEO_ENCODE_ARGS fuer Concat-Kompatibilitaet
  const { stderr } = await runFfmpeg([
    '-y',
    '-hide_banner',
    '-loglevel', 'error',
    '-f', 'lavfi',
    '-t', String(duration),
    '-i', `color=c=${bgColor}:s=${TARGET_W}x${TARGET_H}:r=${TARGET_FPS}`,
    '-i', logoPath,
    '-filter_complex', filterComplex,
    ...STD_VIDEO_ENCODE_ARGS,
    '-an',
    outPath,
  ]);
  return { log: stderr };
}

/**
 * Phase 2.1: Body-Segmente + CTA mit xfade-Crossfade zu einem File mergen.
 *
 * Strategie: Zwischen jedem Paar aufeinanderfolgender Segmente ein 0.4s-fade.
 * Damit verkuerzt sich die Gesamtdauer um (N-1) * 0.4 — der Voice-Track muss
 * darauf angepasst sein (Caller setzt effectiveSceneDurations entsprechend).
 *
 * Filter-Aufbau (bei N=4 Segmenten, also 3 Crossfades):
 *   [0:v][1:v]xfade=fade:duration=0.4:offset=O0[v01]
 *   [v01][2:v]xfade=fade:duration=0.4:offset=O1[v012]
 *   [v012][3:v]xfade=fade:duration=0.4:offset=O2[out]
 *
 * Offsets: O_k = sum(durations[0..k]) - 0.4 — der Übergang startet 0.4s vor
 * dem Ende des bisherigen Streams, sodass beide Streams sich überlappen.
 *
 * Re-Encode ist hier zwingend (xfade braucht Pixel-Zugriff). Die Ausgabe
 * nutzt STD_VIDEO_ENCODE_ARGS, damit sie bitstream-kompatibel zu Intro+Outro
 * ist und der Final-Concat mit `-c copy` laeuft.
 */
export async function buildBodyCtaWithCrossfade(
  segments: { path: string; duration: number }[],
  outPath: string,
  xfadeDuration: number,
): Promise<{ log: string }> {
  if (segments.length === 0) {
    throw new Error('buildBodyCtaWithCrossfade: keine Segmente uebergeben');
  }
  if (segments.length === 1) {
    // Nur ein Segment — direkt kopieren, kein xfade noetig.
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const fs = require('node:fs') as typeof import('node:fs');
    fs.copyFileSync(segments[0].path, outPath);
    return { log: '[xfade] only 1 segment, no crossfade — copied directly' };
  }

  const inputArgs: string[] = [];
  for (const seg of segments) {
    inputArgs.push('-i', seg.path);
  }

  const transitions: string[] = [];
  let prevLabel = '[0:v]';
  let cumulative = 0;
  for (let i = 1; i < segments.length; i++) {
    cumulative += segments[i - 1].duration;
    const offset = (cumulative - xfadeDuration).toFixed(3);
    const isLast = i === segments.length - 1;
    const nextLabel = isLast ? '[xout]' : `[v${i}]`;
    transitions.push(
      `${prevLabel}[${i}:v]xfade=transition=fade:duration=${xfadeDuration}:offset=${offset}${nextLabel}`
    );
    prevLabel = nextLabel;
    cumulative -= xfadeDuration; // Ab dem 2. Übergang ist die kumulierte Dauer um xfade kürzer
  }

  // format=yuv420p am Ende stellt sicher, dass die Pixel-Format-Kompatibilität zur
  // STD_VIDEO_ENCODE_ARGS yuv420p-Pipeline gegeben ist.
  const filterComplex = transitions.join(';') + ';[xout]format=yuv420p[out]';

  const { stderr } = await runFfmpeg([
    '-y',
    '-hide_banner',
    '-loglevel', 'error',
    ...inputArgs,
    '-filter_complex', filterComplex,
    '-map', '[out]',
    ...STD_VIDEO_ENCODE_ARGS,
    '-an',
    outPath,
  ]);
  return { log: stderr };
}

/**
 * Haupt-Render-Funktion. Erzeugt MP4 + Thumbnail als Buffer im Speicher.
 */
export async function renderReel(input: RenderInput): Promise<RenderResult> {
  const renderStartedAt = Date.now();
  const workDir = path.join(tmpdir(), `reel-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`);
  await mkdir(workDir, { recursive: true });

  try {
    // Phase 2.1 + 3.1: Drei Tracking-Strukturen.
    //   - segmentFiles: das was am Ende per Concat-Demuxer (-c copy) zusammenkommt.
    //                   Enthaelt nur noch [intro?, body-cta, outro?].
    //   - bodyAndCtaSegments: Body-Szenen + CTA mit Dauer + scene/clip-Metadaten,
    //                   werden vor dem Final-Concat per xfade-Crossfade gemerged
    //                   und in Phase 3.1 zusaetzlich pro Stueck im Storage persistiert.
    //   - introPath / outroPath: separate Tracker fuer Storage-Persistierung
    //                   (in Phase 3 koennen einzelne Szenen getauscht werden, dann
    //                    werden Intro+Outro zur Re-Concat-Zeit aus Storage geladen).
    const segmentFiles: string[] = [];
    const bodyAndCtaSegments: Array<{
      path: string;
      duration: number;
      kind: 'body' | 'cta';
      sceneData?: Record<string, unknown>;
      sourceClipData?: Record<string, unknown>;
    }> = [];
    let introPath: string | null = null;
    let outroPath: string | null = null;
    let fullLog = '';

    // ── Intro-Frame (cam2rent-Logo) ─────────────────────────────────────────
    const introEnabled = input.introEnabled !== false; // Default: true
    const outroEnabled = input.outroEnabled !== false; // Default: true
    const introDuration = input.introDuration ?? 1.5;
    const outroDuration = input.outroDuration ?? 1.5;
    const logoPath = await findLogoPath();

    if (introEnabled) {
      introPath = path.join(workDir, 'intro.mp4');
      const { log } = await buildBrandingFrame(workDir, 'intro', introDuration, introPath, logoPath);
      fullLog += `\n[intro] ${log}`;
      segmentFiles.push(introPath);
    }

    // ── Szenen-Segmente rendern ─────────────────────────────────────────────
    // Phase 2.2: Ken-Burns-Variante deterministisch pro Szene auswuerfeln.
    const motionStyle: MotionStyle = input.motionStyle ?? 'kenburns';
    const motionSeed = input.reelId ?? `${Date.now()}`;

    if (input.templateType === 'stock_footage') {
      if (!input.clips || input.clips.length === 0) {
        throw new Error('Stock-Footage-Reel braucht Clips');
      }

      for (let i = 0; i < input.script.scenes.length; i++) {
        const scene = input.script.scenes[i];
        const clip = input.clips[i] ?? input.clips[input.clips.length - 1]; // Fallback letzter Clip
        if (!clip) continue;

        const srcPath = path.join(workDir, `clip-${i}.mp4`);
        const outPath = path.join(workDir, `seg-${i}.mp4`);
        // Phase 1.5: clip.downloadUrl statt clip.file.link (StockClip-Typ).
        await downloadToFile(clip.downloadUrl, srcPath);
        // Phase 1.5: Quell-Info im Log fuer spaetere quality_metrics-Auswertung.
        fullLog += `\n[seg-${i}] source=${clip.source} ext_id=${clip.externalId} res=${clip.width}x${clip.height}`;

        // Phase 2.2: Ken-Burns-Variante pro Szene (deterministisch).
        const kenBurns = pickKenBurnsVariant(motionStyle, motionSeed, i);
        if (kenBurns !== 'static') {
          fullLog += ` motion=${kenBurns}`;
        }
        const filter = buildClipFilter(scene.text_overlay, scene.duration, kenBurns);
        // Phase 1 (1.2): STD_VIDEO_ENCODE_ARGS — alle Pro-Segment-Encodes identisch,
        // damit der finale Concat mit `-c copy` ohne Re-Encode laeuft.
        const { stderr } = await runFfmpeg([
          '-y',
          '-hide_banner',
          '-loglevel', 'error',
          '-i', srcPath,
          '-vf', filter,
          ...STD_VIDEO_ENCODE_ARGS,
          '-an',
          outPath,
        ]);
        fullLog += `\n[seg-${i}] ${stderr}`;
        // Phase 2.1: Body-Segmente landen NICHT in segmentFiles, sondern in bodyAndCtaSegments
        // (xfade-Merge am Ende, Concat dann mit -c copy).
        // Phase 3.1: Scene + Clip-Metadaten dazu, fuer spaeteren Re-Render.
        bodyAndCtaSegments.push({
          path: outPath,
          duration: scene.duration,
          kind: 'body',
          sceneData: {
            text_overlay: scene.text_overlay ?? '',
            search_query: scene.search_query ?? '',
            voice_text: scene.voice_text ?? '',
            kind: scene.kind,
          },
          sourceClipData: {
            source: clip.source,
            externalId: clip.externalId,
            downloadUrl: clip.downloadUrl,
            width: clip.width,
            height: clip.height,
            attribution: clip.attribution,
            pageUrl: clip.pageUrl,
          },
        });
      }

      // CTA-Frame (Phase 2.3: voll gebrandet mit Gradient + Logo + URL-Pill,
      // Fallback auf alten Color-BG bei fehlenden Assets).
      const ctaPath = path.join(workDir, `seg-cta.mp4`);
      const cta = buildCtaFrameInput(
        input.script.cta_frame,
        input.script.cta_frame.duration,
        logoPath,
        input.bgColorFrom ?? '#1E40AF',
      );
      // Phase 1 (1.2): STD_VIDEO_ENCODE_ARGS
      const { stderr: ctaLog } = await runFfmpeg([
        '-y',
        '-hide_banner',
        '-loglevel', 'error',
        ...cta.inputArgs,
        '-filter_complex', cta.filterComplex,
        '-map', cta.outLabel,
        ...STD_VIDEO_ENCODE_ARGS,
        '-an',
        ctaPath,
      ]);
      fullLog += `\n[cta] ${ctaLog}`;
      bodyAndCtaSegments.push({
        path: ctaPath,
        duration: input.script.cta_frame.duration,
        kind: 'cta',
        sceneData: {
          headline: input.script.cta_frame.headline ?? '',
          subline: input.script.cta_frame.subline ?? '',
          voice_text: input.script.cta_frame.voice_text ?? '',
        },
      });
    } else {
      // ── Motion-Graphics — jede Szene ist ein Color-Frame mit drawtext ─────
      for (let i = 0; i < input.script.scenes.length; i++) {
        const scene = input.script.scenes[i];
        const outPath = path.join(workDir, `seg-${i}.mp4`);
        const col = (input.bgColorFrom ?? '#3B82F6').replace('#', '0x');

        // Text zentriert, mit Auto-Wrap und dynamischer Schriftgröße
        const trimmed = (scene.text_overlay || '').trim();
        const filter = trimmed
          ? buildStackedDrawtext(trimmed, {
              fontsize: 84,
              maxLines: 4,
              yCenterPx: Math.round(TARGET_H / 2),
              borderw: 2,
              bordercolor: 'black@0.2',
            })
          : 'null';

        // Phase 1 (1.2): STD_VIDEO_ENCODE_ARGS
        const { stderr } = await runFfmpeg([
          '-y',
          '-hide_banner',
          '-loglevel', 'error',
          '-f', 'lavfi',
          '-t', String(scene.duration),
          '-i', `color=c=${col}:s=${TARGET_W}x${TARGET_H}:r=${TARGET_FPS}`,
          '-vf', filter,
          ...STD_VIDEO_ENCODE_ARGS,
          '-an',
          outPath,
        ]);
        fullLog += `\n[mg-${i}] ${stderr}`;
        bodyAndCtaSegments.push({
          path: outPath,
          duration: scene.duration,
          kind: 'body',
          sceneData: {
            text_overlay: scene.text_overlay ?? '',
            voice_text: scene.voice_text ?? '',
            kind: scene.kind,
          },
        });
      }

      // CTA am Ende (Phase 2.3: gleicher gebrandeter Look wie im Stock-Pfad)
      const ctaPath = path.join(workDir, `seg-cta.mp4`);
      const cta = buildCtaFrameInput(
        input.script.cta_frame,
        input.script.cta_frame.duration,
        logoPath,
        input.bgColorTo ?? '#0F172A',
      );
      // Phase 1 (1.2): STD_VIDEO_ENCODE_ARGS
      const { stderr: ctaLog } = await runFfmpeg([
        '-y',
        '-hide_banner',
        '-loglevel', 'error',
        ...cta.inputArgs,
        '-filter_complex', cta.filterComplex,
        '-map', cta.outLabel,
        ...STD_VIDEO_ENCODE_ARGS,
        '-an',
        ctaPath,
      ]);
      fullLog += `\n[cta] ${ctaLog}`;
      bodyAndCtaSegments.push({
        path: ctaPath,
        duration: input.script.cta_frame.duration,
        kind: 'cta',
        sceneData: {
          headline: input.script.cta_frame.headline ?? '',
          subline: input.script.cta_frame.subline ?? '',
          voice_text: input.script.cta_frame.voice_text ?? '',
        },
      });
    }

    // ── Body+CTA mit Crossfade zu einem File mergen (Phase 2.1) ─────────────
    // Re-Encode hier zwingend (xfade braucht Pixel-Zugriff), aber die Ausgabe
    // nutzt STD_VIDEO_ENCODE_ARGS — bleibt damit bitstream-kompatibel zu
    // Intro+Outro. Final-Concat (3 Files) laeuft danach mit -c copy.
    const useXfade = bodyAndCtaSegments.length >= 2;
    const XFADE_DURATION = useXfade ? 0.4 : 0;
    const bodyCtaPath = path.join(workDir, 'body-cta.mp4');
    const { log: bodyCtaLog } = await buildBodyCtaWithCrossfade(
      bodyAndCtaSegments,
      bodyCtaPath,
      XFADE_DURATION,
    );
    fullLog += `\n[body-cta] xfade=${XFADE_DURATION}s segments=${bodyAndCtaSegments.length} ${bodyCtaLog}`;
    // Body-CTA-Block kommt zwischen Intro und Outro in der Concat-Liste
    segmentFiles.push(bodyCtaPath);

    // ── Outro-Frame (cam2rent-Logo + Tagline) ───────────────────────────────
    if (outroEnabled) {
      outroPath = path.join(workDir, 'outro.mp4');
      const { log } = await buildBrandingFrame(workDir, 'outro', outroDuration, outroPath, logoPath);
      fullLog += `\n[outro] ${log}`;
      segmentFiles.push(outroPath);
    }

    // ── Concat-Demuxer-Liste ────────────────────────────────────────────────
    const concatListPath = path.join(workDir, 'concat.txt');
    const concatContent = segmentFiles.map((p) => `file '${p.replace(/'/g, "\\'")}'`).join('\n');
    await writeFile(concatListPath, concatContent);

    // ── Endvideo zusammenbauen ──────────────────────────────────────────────
    // Phase 1 (1.2): Stream-Copy-Concat (kein Re-Encode).
    // Vorher: libx264 -preset veryfast -crf 23 → jeder Bitstream wurde nochmal
    // durch den Encoder geschickt = Generationenverlust + ~40% Render-Zeit-Penalty.
    // Jetzt: alle Pro-Segmente haben identische Encode-Args (STD_VIDEO_ENCODE_ARGS),
    // also kann der Concat-Demuxer die Bitstreams direkt aneinanderhaengen.
    const noAudioPath = path.join(workDir, 'out-noaudio.mp4');
    const { stderr: concatLog } = await runFfmpeg([
      '-y',
      '-hide_banner',
      '-loglevel', 'error',
      '-f', 'concat',
      '-safe', '0',
      '-i', concatListPath,
      '-c', 'copy',
      '-movflags', '+faststart',
      noAudioPath,
    ]);
    fullLog += `\n[concat] ${concatLog}`;

    // ── Voice-Track aus TTS-Segmenten bauen (falls vorhanden) ────────────────
    let voiceTrackPath: string | undefined;
    if (input.voiceSegments && input.voiceSegments.length > 0) {
      try {
        // Phase 2.1: Voice-Sync nach Crossfade.
        // Jeder xfade-Uebergang verkuerzt die Gesamt-Body+CTA-Dauer um XFADE_DURATION.
        // Damit Voice-Segmente den Szenen folgen, kuerzen wir alle ausser dem letzten
        // um XFADE_DURATION. Ohne xfade (1 Segment) bleiben die Originaldauern.
        const segDurations = bodyAndCtaSegments.map((s, i, arr) =>
          i < arr.length - 1 && XFADE_DURATION > 0
            ? Math.max(0.5, s.duration - XFADE_DURATION)
            : s.duration
        );

        // Pro Voice-Segment: MP3 schreiben, dann auf Szenendauer padden/trimmen als WAV.
        // Leere Buffer (kein voice_text fuer diese Szene) → Silence der Szenendauer.
        const paddedPaths: string[] = [];

        // Silence-Padding am Anfang fuer Intro (kein Voice waehrend Logo)
        if (introEnabled) {
          const silPath = path.join(workDir, 'voice-silence-intro.wav');
          await runFfmpeg([
            '-y',
            '-hide_banner',
            '-loglevel', 'error',
            '-f', 'lavfi',
            '-t', String(introDuration),
            '-i', 'anullsrc=channel_layout=stereo:sample_rate=44100',
            silPath,
          ]);
          paddedPaths.push(silPath);
        }
        for (let i = 0; i < input.voiceSegments.length; i++) {
          const dur = segDurations[i] ?? 3;
          const paddedPath = path.join(workDir, `voice-pad-${i}.wav`);
          const seg = input.voiceSegments[i];

          if (!seg || seg.length === 0) {
            // Nur Silence
            await runFfmpeg([
              '-y',
              '-hide_banner',
              '-loglevel', 'error',
              '-f', 'lavfi',
              '-t', String(dur),
              '-i', 'anullsrc=channel_layout=stereo:sample_rate=44100',
              paddedPath,
            ]);
          } else {
            const mp3Path = path.join(workDir, `voice-${i}.mp3`);
            await writeFile(mp3Path, seg);
            await runFfmpeg([
              '-y',
              '-hide_banner',
              '-loglevel', 'error',
              '-i', mp3Path,
              '-af', `apad=whole_dur=${dur}`,
              '-t', String(dur),
              '-ar', '44100',
              '-ac', '2',
              paddedPath,
            ]);
          }
          paddedPaths.push(paddedPath);
        }

        // Fehlende Szenen (wenn weniger voice-Segments als Szenen) mit Silence auffuellen
        // Zaehlung: paddedPaths beginnt ggf. mit 1 Intro-Silence, also Offset beachten
        const introOffset = introEnabled ? 1 : 0;
        const sceneCount = segDurations.length;
        for (let i = paddedPaths.length - introOffset; i < sceneCount; i++) {
          const dur = segDurations[i];
          const silPath = path.join(workDir, `voice-silence-${i}.wav`);
          await runFfmpeg([
            '-y',
            '-hide_banner',
            '-loglevel', 'error',
            '-f', 'lavfi',
            '-t', String(dur),
            '-i', `anullsrc=channel_layout=stereo:sample_rate=44100`,
            silPath,
          ]);
          paddedPaths.push(silPath);
        }

        // Silence-Padding am Ende fuer Outro
        if (outroEnabled) {
          const silPath = path.join(workDir, 'voice-silence-outro.wav');
          await runFfmpeg([
            '-y',
            '-hide_banner',
            '-loglevel', 'error',
            '-f', 'lavfi',
            '-t', String(outroDuration),
            '-i', 'anullsrc=channel_layout=stereo:sample_rate=44100',
            silPath,
          ]);
          paddedPaths.push(silPath);
        }

        // Alles konkatenieren zum Voice-Track
        const voiceListPath = path.join(workDir, 'voice-concat.txt');
        await writeFile(voiceListPath, paddedPaths.map((p) => `file '${p.replace(/'/g, "\\'")}'`).join('\n'));
        voiceTrackPath = path.join(workDir, 'voice-track.m4a');
        const { stderr: vLog } = await runFfmpeg([
          '-y',
          '-hide_banner',
          '-loglevel', 'error',
          '-f', 'concat',
          '-safe', '0',
          '-i', voiceListPath,
          '-c:a', 'aac',
          '-b:a', '128k',
          voiceTrackPath,
        ]);
        fullLog += `\n[voice-track] ${vLog}`;
      } catch (err) {
        fullLog += `\n[voice-track-skip] ${err instanceof Error ? err.message : 'unknown'}`;
        voiceTrackPath = undefined;
      }
    }

    // ── Audio final zusammenfuegen ──────────────────────────────────────────
    const finalPath = path.join(workDir, 'out-final.mp4');
    const hasMusic = Boolean(input.musicUrl);
    const hasVoice = Boolean(voiceTrackPath);

    if (hasMusic && hasVoice) {
      // Musik (-10dB) + Voice (0dB) mischen
      const musicPath = path.join(workDir, 'music.mp3');
      try {
        await downloadToFile(input.musicUrl!, musicPath);
        const { stderr: mixLog } = await runFfmpeg([
          '-y',
          '-hide_banner',
          '-loglevel', 'error',
          '-i', noAudioPath,
          '-i', voiceTrackPath!,
          '-i', musicPath,
          '-filter_complex', '[2:a]volume=0.25[m];[1:a][m]amix=inputs=2:duration=first:dropout_transition=0[a]',
          '-map', '0:v',
          '-map', '[a]',
          '-c:v', 'copy',
          '-c:a', 'aac',
          '-b:a', '128k',
          '-shortest',
          finalPath,
        ]);
        fullLog += `\n[mix-voice+music] ${mixLog}`;
      } catch (err) {
        fullLog += `\n[mix-fallback] ${err instanceof Error ? err.message : 'unknown'}`;
        // Fallback: nur Voice, ohne Musik
        await runFfmpeg([
          '-y',
          '-hide_banner',
          '-loglevel', 'error',
          '-i', noAudioPath,
          '-i', voiceTrackPath!,
          '-map', '0:v',
          '-map', '1:a',
          '-c:v', 'copy',
          '-c:a', 'aac',
          '-b:a', '128k',
          '-shortest',
          finalPath,
        ]);
      }
    } else if (hasVoice) {
      // Nur Voice
      const { stderr } = await runFfmpeg([
        '-y',
        '-hide_banner',
        '-loglevel', 'error',
        '-i', noAudioPath,
        '-i', voiceTrackPath!,
        '-map', '0:v',
        '-map', '1:a',
        '-c:v', 'copy',
        '-c:a', 'aac',
        '-b:a', '128k',
        '-shortest',
        finalPath,
      ]);
      fullLog += `\n[voice-only] ${stderr}`;
    } else if (hasMusic) {
      // Nur Musik (wie vorher)
      const musicPath = path.join(workDir, 'music.mp3');
      try {
        await downloadToFile(input.musicUrl!, musicPath);
        const { stderr: mixLog } = await runFfmpeg([
          '-y',
          '-hide_banner',
          '-loglevel', 'error',
          '-i', noAudioPath,
          '-i', musicPath,
          '-map', '0:v',
          '-map', '1:a',
          '-shortest',
          '-c:v', 'copy',
          '-c:a', 'aac',
          '-b:a', '128k',
          finalPath,
        ]);
        fullLog += `\n[mix] ${mixLog}`;
      } catch (err) {
        fullLog += `\n[mix-skip] ${err instanceof Error ? err.message : 'unknown'}`;
        const { stderr } = await runFfmpeg([
          '-y',
          '-hide_banner',
          '-loglevel', 'error',
          '-i', noAudioPath,
          '-f', 'lavfi',
          '-i', 'anullsrc=channel_layout=stereo:sample_rate=44100',
          '-shortest',
          '-c:v', 'copy',
          '-c:a', 'aac',
          '-b:a', '128k',
          finalPath,
        ]);
        fullLog += `\n[silent] ${stderr}`;
      }
    } else {
      // Stiller Track (wie vorher)
      const { stderr } = await runFfmpeg([
        '-y',
        '-hide_banner',
        '-loglevel', 'error',
        '-i', noAudioPath,
        '-f', 'lavfi',
        '-i', 'anullsrc=channel_layout=stereo:sample_rate=44100',
        '-shortest',
        '-c:v', 'copy',
        '-c:a', 'aac',
        '-b:a', '128k',
        finalPath,
      ]);
      fullLog += `\n[silent] ${stderr}`;
    }

    // ── Thumbnail (erstes Body-Segment) ─────────────────────────────────────
    // Phase 1 (1.1) + Phase 2.1: Snapshot kommt aus dem ersten Body-Segment-File
    // (nicht aus body-cta.mp4 oder finalPath), bei -ss 0.8 mittig in der ersten
    // Action-Szene. Bei 0 Body-Segmenten (theoretisch unmoeglich, da CTA immer da
    // ist) → Fallback auf finalPath bei -ss 1.
    const lastIdx = bodyAndCtaSegments.length - 1;
    // bodyAndCtaSegments hat mindestens den CTA an letzter Stelle. Wenn lastIdx >= 1,
    // ist Index 0 ein echtes Body-Segment.
    const hasBodySegment = lastIdx >= 1;
    const thumbSource = hasBodySegment ? bodyAndCtaSegments[0].path : finalPath;
    const thumbSeek = hasBodySegment ? '0.8' : '1';
    const thumbPath = path.join(workDir, 'thumb.jpg');
    const { stderr: thumbLog } = await runFfmpeg([
      '-y',
      '-hide_banner',
      '-loglevel', 'error',
      '-ss', thumbSeek,
      '-i', thumbSource,
      '-frames:v', '1',
      '-q:v', '3',
      thumbPath,
    ]);
    fullLog += `\n[thumb] source=${hasBodySegment ? `body[0]` : 'final'} seek=${thumbSeek}s ${thumbLog}`;

    const videoBuffer = await readFile(finalPath);
    const thumbnailBuffer = await readFile(thumbPath);

    // Phase 2.1: Gesamt-Dauer mit xfade-Verkuerzung. Pro Crossfade verschwinden
    // XFADE_DURATION Sekunden aus der Body+CTA-Strecke.
    const xfadeShrink = useXfade ? (bodyAndCtaSegments.length - 1) * XFADE_DURATION : 0;
    const contentDuration = bodyAndCtaSegments.reduce((s, seg) => s + seg.duration, 0) - xfadeShrink;
    const total = contentDuration + (introEnabled ? introDuration : 0) + (outroEnabled ? outroDuration : 0);

    // Phase 2.5: Strukturierte Quality-Metriken (siehe ReelQualityMetrics-Type).
    const fileSizeBytes = videoBuffer.byteLength;
    const avgBitrateKbps = total > 0
      ? Math.round((fileSizeBytes * 8) / 1000 / total)
      : 0;
    const stockSources: Record<string, number> = {};
    const sourceResolutions: ReelQualityMetrics['source_resolutions'] = [];
    if (input.clips) {
      input.clips.forEach((clip, i) => {
        stockSources[clip.source] = (stockSources[clip.source] ?? 0) + 1;
        sourceResolutions.push({
          index: i,
          width: clip.width,
          height: clip.height,
          source: clip.source,
        });
      });
    }
    const qualityMetrics: ReelQualityMetrics = {
      file_size_bytes: fileSizeBytes,
      duration_seconds: total,
      avg_bitrate_kbps: avgBitrateKbps,
      segment_count: bodyAndCtaSegments.length,
      source_resolutions: sourceResolutions,
      stock_sources: stockSources,
      render_duration_seconds: Math.round((Date.now() - renderStartedAt) / 100) / 10,
      font_used: detectFontPath() === FONT_PATH_PRIMARY ? 'Inter Tight' : 'DejaVuSans-Bold',
      motion_style: motionStyle,
    };

    // Phase 3.1: Persisted-Segment-Buffer fuer Storage-Upload sammeln.
    // Reihenfolge: [intro?, ...bodies+cta, outro?]. Index ist fortlaufend.
    const persistedSegments: PersistedSegment[] = [];
    let persistedIdx = 0;
    if (introPath) {
      persistedSegments.push({
        index: persistedIdx++,
        kind: 'intro',
        buffer: await readFile(introPath),
        duration: introDuration,
      });
    }
    for (const seg of bodyAndCtaSegments) {
      persistedSegments.push({
        index: persistedIdx++,
        kind: seg.kind,
        buffer: await readFile(seg.path),
        duration: seg.duration,
        sceneData: seg.sceneData,
        sourceClipData: seg.sourceClipData,
      });
    }
    if (outroPath) {
      persistedSegments.push({
        index: persistedIdx++,
        kind: 'outro',
        buffer: await readFile(outroPath),
        duration: outroDuration,
      });
    }

    return {
      videoBuffer,
      thumbnailBuffer,
      durationSeconds: total,
      log: fullLog,
      qualityMetrics,
      segments: persistedSegments,
    };
  } finally {
    // Temp-Verzeichnis aufräumen (best-effort)
    await rm(workDir, { recursive: true, force: true }).catch(() => {});
  }
}
