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
import { writeFile, mkdir, rm, readFile } from 'fs/promises';
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
  const font = detectFontPath();
  const text = escapeDrawtext(sceneText || '');

  return [
    `scale=${TARGET_W}:${TARGET_H}:force_original_aspect_ratio=increase`,
    `crop=${TARGET_W}:${TARGET_H}`,
    `fps=${TARGET_FPS}`,
    `trim=duration=${duration}`,
    `setpts=PTS-STARTPTS`,
    text
      ? `drawtext=fontfile='${font}':text='${text}':fontsize=56:fontcolor=white:borderw=3:bordercolor=black@0.8:x=(w-text_w)/2:y=h-text_h-180:box=1:boxcolor=black@0.55:boxborderw=24`
      : 'null',
  ]
    .filter(Boolean)
    .join(',');
}

/**
 * CTA-Frame aus solid-color-Hintergrund + drawtext.
 * Nutzt `lavfi` color-Source, damit kein Input-Video nötig ist.
 */
function buildCtaInput(text: { headline: string; subline?: string }, duration: number, bgColor: string): { args: string[]; filter: string } {
  const font = detectFontPath();
  const headline = escapeDrawtext(text.headline);
  const subline = escapeDrawtext(text.subline ?? '');

  // Hex → FFmpeg color syntax (remove #)
  const col = bgColor.startsWith('#') ? `0x${bgColor.slice(1)}` : bgColor;

  const args = ['-f', 'lavfi', '-t', String(duration), '-i', `color=c=${col}:s=${TARGET_W}x${TARGET_H}:r=${TARGET_FPS}`];

  const filter = [
    `drawtext=fontfile='${font}':text='${headline}':fontsize=88:fontcolor=white:x=(w-text_w)/2:y=(h/2)-80:borderw=2:bordercolor=black@0.3`,
    subline
      ? `drawtext=fontfile='${font}':text='${subline}':fontsize=52:fontcolor=white@0.9:x=(w-text_w)/2:y=(h/2)+40`
      : 'null',
  ]
    .filter((f) => f !== 'null')
    .join(',');

  return { args, filter };
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

        const font = detectFontPath();
        const text = escapeDrawtext(scene.text_overlay || '');
        const filter = text
          ? `drawtext=fontfile='${font}':text='${text}':fontsize=84:fontcolor=white:x=(w-text_w)/2:y=(h-text_h)/2:borderw=2:bordercolor=black@0.2`
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

    // ── Audio optional dazu mischen ─────────────────────────────────────────
    const finalPath = path.join(workDir, 'out-final.mp4');
    if (input.musicUrl) {
      const musicPath = path.join(workDir, 'music.mp3');
      try {
        await downloadToFile(input.musicUrl, musicPath);
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
        // Musik-Fehler: fallback auf stummes Video
        fullLog += `\n[mix-skip] ${err instanceof Error ? err.message : 'unknown'}`;
        // Einfaches AAC-Silent-Track drüberlegen, sonst akzeptieren Meta-APIs das Video nicht immer
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
      // Stiller Track
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

    const total = input.script.scenes.reduce((s, sc) => s + sc.duration, 0) + input.script.cta_frame.duration;

    return { videoBuffer, thumbnailBuffer, durationSeconds: total, log: fullLog };
  } finally {
    // Temp-Verzeichnis aufräumen (best-effort)
    await rm(workDir, { recursive: true, force: true }).catch(() => {});
  }
}
