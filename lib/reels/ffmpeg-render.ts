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
import type { PexelsVideo, PexelsVideoFile } from './pexels';

export interface RenderInput {
  script: ReelScript;
  templateType: 'stock_footage' | 'motion_graphics';
  clips?: Array<{ video: PexelsVideo; file: PexelsVideoFile }>; // nur für stock_footage
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
// Alpine: /usr/share/fonts/TTF/DejaVuSans-Bold.ttf (nach `apk add ttf-dejavu`)
// Debian/Ubuntu: /usr/share/fonts/truetype/dejavu/DejaVuSans-Bold.ttf
const FONT_PATH_PRIMARY = '/usr/share/fonts/TTF/DejaVuSans-Bold.ttf';

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

function detectFontPath(): string {
  // Wir prüfen nicht synchron; FFmpeg gibt klaren Fehler wenn Schrift fehlt.
  // Docker-Image installiert beide Pfade nicht — wir nutzen den Alpine-Standard nach `apk add ttf-dejavu`.
  return FONT_PATH_PRIMARY;
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
    const { stderr } = await runFfmpeg([
      '-y',
      '-hide_banner',
      '-loglevel', 'error',
      '-f', 'lavfi',
      '-t', String(duration),
      '-i', `color=c=${bgColor}:s=${TARGET_W}x${TARGET_H}:r=${TARGET_FPS}`,
      '-vf', `drawtext=fontfile='${font}':text='${text}':expansion=none:fontsize=140:fontcolor=white:x=(w-text_w)/2:y=(h-text_h)/2`,
      '-c:v', 'libx264',
      '-preset', 'veryfast',
      '-crf', '23',
      '-pix_fmt', 'yuv420p',
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

  const { stderr } = await runFfmpeg([
    '-y',
    '-hide_banner',
    '-loglevel', 'error',
    '-f', 'lavfi',
    '-t', String(duration),
    '-i', `color=c=${bgColor}:s=${TARGET_W}x${TARGET_H}:r=${TARGET_FPS}`,
    '-i', logoPath,
    '-filter_complex', filterComplex,
    '-c:v', 'libx264',
    '-preset', 'veryfast',
    '-crf', '23',
    '-pix_fmt', 'yuv420p',
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
        await downloadToFile(clip.file.link, srcPath);

        const filter = buildClipFilter(scene.text_overlay, scene.duration);
        const { stderr } = await runFfmpeg([
          '-y',
          '-hide_banner',
          '-loglevel', 'error',
          '-i', srcPath,
          '-vf', filter,
          '-an',
          '-c:v', 'libx264',
          '-preset', 'veryfast',
          '-crf', '23',
          '-pix_fmt', 'yuv420p',
          outPath,
        ]);
        fullLog += `\n[seg-${i}] ${stderr}`;
        segmentFiles.push(outPath);
      }

      // CTA-Frame (Farbe aus Template oder Fallback cam2rent-Blau)
      const ctaPath = path.join(workDir, `seg-cta.mp4`);
      const cta = buildCtaInput(input.script.cta_frame, input.script.cta_frame.duration, input.bgColorFrom ?? '#1E40AF');
      const { stderr: ctaLog } = await runFfmpeg([
        '-y',
        '-hide_banner',
        '-loglevel', 'error',
        ...cta.args,
        '-vf', cta.filter,
        '-c:v', 'libx264',
        '-preset', 'veryfast',
        '-crf', '23',
        '-pix_fmt', 'yuv420p',
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

        const { stderr } = await runFfmpeg([
          '-y',
          '-hide_banner',
          '-loglevel', 'error',
          '-f', 'lavfi',
          '-t', String(scene.duration),
          '-i', `color=c=${col}:s=${TARGET_W}x${TARGET_H}:r=${TARGET_FPS}`,
          '-vf', filter,
          '-c:v', 'libx264',
          '-preset', 'veryfast',
          '-crf', '23',
          '-pix_fmt', 'yuv420p',
          outPath,
        ]);
        fullLog += `\n[mg-${i}] ${stderr}`;
        segmentFiles.push(outPath);
      }

      // CTA am Ende
      const ctaPath = path.join(workDir, `seg-cta.mp4`);
      const cta = buildCtaInput(input.script.cta_frame, input.script.cta_frame.duration, input.bgColorTo ?? '#0F172A');
      const { stderr: ctaLog } = await runFfmpeg([
        '-y',
        '-hide_banner',
        '-loglevel', 'error',
        ...cta.args,
        '-vf', cta.filter,
        '-c:v', 'libx264',
        '-preset', 'veryfast',
        '-crf', '23',
        '-pix_fmt', 'yuv420p',
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
    const noAudioPath = path.join(workDir, 'out-noaudio.mp4');
    const { stderr: concatLog } = await runFfmpeg([
      '-y',
      '-hide_banner',
      '-loglevel', 'error',
      '-f', 'concat',
      '-safe', '0',
      '-i', concatListPath,
      '-c:v', 'libx264',
      '-preset', 'veryfast',
      '-crf', '23',
      '-pix_fmt', 'yuv420p',
      '-r', String(TARGET_FPS),
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

    // ── Thumbnail (Frame bei 1s) ────────────────────────────────────────────
    const thumbPath = path.join(workDir, 'thumb.jpg');
    const { stderr: thumbLog } = await runFfmpeg([
      '-y',
      '-hide_banner',
      '-loglevel', 'error',
      '-ss', '1',
      '-i', finalPath,
      '-frames:v', '1',
      '-q:v', '3',
      thumbPath,
    ]);
    fullLog += `\n[thumb] ${thumbLog}`;

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
