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
}

export interface RenderResult {
  videoBuffer: Buffer;
  thumbnailBuffer: Buffer;
  durationSeconds: number;
  log: string; // FFmpeg-Stderr für Debugging
}

const TARGET_W = 1080;
const TARGET_H = 1920;
const TARGET_FPS = 30;

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

// Phase 1 (1.2/1.3): Vereinheitlichte Video-Encode-Argumente fuer ALLE Pro-Segment-Encodes.
// Profile high + Level 4.0 + GOP=60 + sc_threshold=0 stellen sicher, dass alle Segmente
// bitstream-kompatibel sind und der Concat-Step mit `-c copy` ohne Re-Encode auskommt.
// preset=medium / crf=20 ersetzt veryfast/23 — sichtbar weniger Block-Artefakte in
// Bewegungs-Szenen, ~2x langsamer pro Segment, durch Wegfall des Concat-Re-Encodes
// netto aber nicht langsamer als der vorige Status.
// Datei-Groesse 30s-Reels: typisch 8-15 MB (gesund unter 50 MB Bucket-Limit).
const STD_VIDEO_ENCODE_ARGS: string[] = [
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

async function runFfmpeg(args: string[]): Promise<{ stderr: string }> {
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

async function downloadToFile(url: string, destPath: string): Promise<void> {
  const res = await fetch(url);
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
 * Baut einen FFmpeg-Filterkomplex für einen Stock-Footage-Clip:
 * - Auf 1080x1920 croppen (cover), 30fps
 * - Auf Szenen-Dauer trimmen
 * - Text-Overlay unten mit schwarzem Hintergrund (80% Opazität)
 */
function buildClipFilter(sceneText: string, duration: number): string {
  const baseFilters = [
    `scale=${TARGET_W}:${TARGET_H}:force_original_aspect_ratio=increase`,
    `crop=${TARGET_W}:${TARGET_H}`,
    `fps=${TARGET_FPS}`,
    `trim=duration=${duration}`,
    `setpts=PTS-STARTPTS`,
  ];

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
 * CTA-Frame aus solid-color-Hintergrund + drawtext.
 * Nutzt `lavfi` color-Source, damit kein Input-Video nötig ist.
 */
function buildCtaInput(text: { headline: string; subline?: string }, duration: number, bgColor: string): { args: string[]; filter: string } {
  // Hex → FFmpeg color syntax (remove #)
  const col = bgColor.startsWith('#') ? `0x${bgColor.slice(1)}` : bgColor;
  const args = ['-f', 'lavfi', '-t', String(duration), '-i', `color=c=${col}:s=${TARGET_W}x${TARGET_H}:r=${TARGET_FPS}`];

  // Headline auf 40% Höhe, Subline auf 58% Höhe — beide werden bei Bedarf umgebrochen/verkleinert.
  const parts: string[] = [];
  if (text.headline?.trim()) {
    parts.push(
      buildStackedDrawtext(text.headline, {
        fontsize: 88,
        maxLines: 3,
        yCenterPx: Math.round(TARGET_H * 0.4),
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
  return { args, filter };
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

  // Mit Logo-PNG ueberlagern
  // Logo auf ~700px Breite skalieren (genug Raum, aber nicht randlos)
  // Leichter Fade-In beim Intro, Fade-Out beim Outro fuer smootheren Uebergang
  const fadeFilter = type === 'intro'
    ? `fade=t=in:st=0:d=0.3`
    : `fade=t=out:st=${Math.max(0, duration - 0.3)}:d=0.3`;

  const taglineText = type === 'outro' ? escapeDrawtext('Action-Cam mieten auf cam2rent.de') : '';
  const taglineFilter = taglineText
    ? `,drawtext=fontfile='${font}':text='${taglineText}':expansion=none:fontsize=48:fontcolor=white@0.85:x=(w-text_w)/2:y=h/2+240`
    : '';

  const filterComplex = [
    `[1:v]scale=700:-1[logo]`,
    `[0:v][logo]overlay=(W-w)/2:(H-h)/2-80${taglineFilter},${fadeFilter}`,
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
 * Haupt-Render-Funktion. Erzeugt MP4 + Thumbnail als Buffer im Speicher.
 */
export async function renderReel(input: RenderInput): Promise<RenderResult> {
  const workDir = path.join(tmpdir(), `reel-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`);
  await mkdir(workDir, { recursive: true });

  try {
    const segmentFiles: string[] = [];
    let fullLog = '';

    // ── Intro-Frame (cam2rent-Logo) ─────────────────────────────────────────
    const introEnabled = input.introEnabled !== false; // Default: true
    const outroEnabled = input.outroEnabled !== false; // Default: true
    const introDuration = input.introDuration ?? 1.5;
    const outroDuration = input.outroDuration ?? 1.5;
    const logoPath = await findLogoPath();

    if (introEnabled) {
      const introPath = path.join(workDir, 'intro.mp4');
      const { log } = await buildBrandingFrame(workDir, 'intro', introDuration, introPath, logoPath);
      fullLog += `\n[intro] ${log}`;
      segmentFiles.push(introPath);
    }

    // ── Szenen-Segmente rendern ─────────────────────────────────────────────
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

        const filter = buildClipFilter(scene.text_overlay, scene.duration);
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
        segmentFiles.push(outPath);
      }

      // CTA-Frame (Farbe aus Template oder Fallback cam2rent-Blau)
      const ctaPath = path.join(workDir, `seg-cta.mp4`);
      const cta = buildCtaInput(input.script.cta_frame, input.script.cta_frame.duration, input.bgColorFrom ?? '#1E40AF');
      // Phase 1 (1.2): STD_VIDEO_ENCODE_ARGS
      const { stderr: ctaLog } = await runFfmpeg([
        '-y',
        '-hide_banner',
        '-loglevel', 'error',
        ...cta.args,
        '-vf', cta.filter,
        ...STD_VIDEO_ENCODE_ARGS,
        '-an',
        ctaPath,
      ]);
      fullLog += `\n[cta] ${ctaLog}`;
      segmentFiles.push(ctaPath);
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
        segmentFiles.push(outPath);
      }

      // CTA am Ende
      const ctaPath = path.join(workDir, `seg-cta.mp4`);
      const cta = buildCtaInput(input.script.cta_frame, input.script.cta_frame.duration, input.bgColorTo ?? '#0F172A');
      // Phase 1 (1.2): STD_VIDEO_ENCODE_ARGS
      const { stderr: ctaLog } = await runFfmpeg([
        '-y',
        '-hide_banner',
        '-loglevel', 'error',
        ...cta.args,
        '-vf', cta.filter,
        ...STD_VIDEO_ENCODE_ARGS,
        '-an',
        ctaPath,
      ]);
      fullLog += `\n[cta] ${ctaLog}`;
      segmentFiles.push(ctaPath);
    }

    // ── Outro-Frame (cam2rent-Logo + Tagline) ───────────────────────────────
    if (outroEnabled) {
      const outroPath = path.join(workDir, 'outro.mp4');
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
        // Jede Szenen-Dauer ermitteln (scenes + cta)
        const segDurations = [
          ...input.script.scenes.map((s) => s.duration),
          input.script.cta_frame.duration,
        ];

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
    // Phase 1 (1.1): Vorher zog `-ss 1 -i finalPath` den Frame mitten aus dem
    // 1.5s-Intro = jedes Thumbnail zeigte das Logo. Jetzt: erstes Body-Segment
    // bei 0.8s — mittig in der ersten Action-Szene, vermeidet Fade-In-Effekte.
    // Reihenfolge in segmentFiles: [intro?, ...bodies, cta, outro?].
    const introOffset = introEnabled ? 1 : 0;
    const outroOffset = outroEnabled ? 1 : 0;
    const ctaIndexInSegs = segmentFiles.length - 1 - outroOffset;
    const firstBodyIndex = introOffset;
    const hasBodySegment = firstBodyIndex < ctaIndexInSegs;
    const thumbSource = hasBodySegment ? segmentFiles[firstBodyIndex] : finalPath;
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
    fullLog += `\n[thumb] source=${hasBodySegment ? `body[${firstBodyIndex}]` : 'final'} seek=${thumbSeek}s ${thumbLog}`;

    const videoBuffer = await readFile(finalPath);
    const thumbnailBuffer = await readFile(thumbPath);

    const contentDuration = input.script.scenes.reduce((s, sc) => s + sc.duration, 0) + input.script.cta_frame.duration;
    const total = contentDuration + (introEnabled ? introDuration : 0) + (outroEnabled ? outroDuration : 0);

    return { videoBuffer, thumbnailBuffer, durationSeconds: total, log: fullLog };
  } finally {
    // Temp-Verzeichnis aufräumen (best-effort)
    await rm(workDir, { recursive: true, force: true }).catch(() => {});
  }
}
