/**
 * Phase 3.2 — Pro-Szene-Regenerator.
 *
 * Tauscht ein einzelnes Body-Segment im Reel aus, ohne das ganze Reel neu zu
 * generieren (KI-Tokens + Stock-API-Quota gespart). Lädt alle persistierten
 * Segmente aus dem Storage, ersetzt das Body-Segment durch einen neuen Stock-
 * Clip, baut Body+CTA per xfade neu zusammen, concat'et mit Intro+Outro und
 * mischt den Audio-Track neu.
 *
 * Voraussetzung: SQL-Migration `supabase-reel-segments.sql` ist durch und der
 * Reel wurde mit Phase-3-Pipeline gerendert (Segmente + Voice in Storage).
 */

import { createServiceClient } from '@/lib/supabase';
import { writeFile, mkdir, rm, readFile } from 'fs/promises';
import { tmpdir } from 'os';
import path from 'path';
import {
  runFfmpeg,
  downloadToFile,
  buildClipFilter,
  buildBodyCtaWithCrossfade,
  pickKenBurnsVariant,
  STD_VIDEO_ENCODE_ARGS,
  TARGET_FPS,
  type ReelQualityMetrics,
  type MotionStyle,
} from './ffmpeg-render';
import { findClipForQuery, type StockClip } from './stock-sources';

const BUCKET = 'social-reels';
const XFADE_DURATION = 0.4;

interface SegmentRow {
  id: string;
  reel_id: string;
  index: number;
  kind: 'intro' | 'body' | 'cta' | 'outro';
  storage_path: string;
  duration_seconds: number;
  scene_data: Record<string, unknown> | null;
  source_clip_data: Record<string, unknown> | null;
  has_voice: boolean;
  voice_storage_path: string | null;
}

interface ReelRow {
  id: string;
  status: string;
  music_url: string | null;
  thumbnail_url: string | null;
  template_id: string | null;
  is_test: boolean;
  quality_metrics: ReelQualityMetrics | null;
}

export interface RegenerateBodyOptions {
  reelId: string;
  /** Index des zu tauschenden Body-Segments in social_reel_segments. */
  segmentIndex: number;
  /** Optional: andere Search-Query. Default: bisherige scene_data.search_query. */
  newSearchQuery?: string;
  /** Optional: anderen Overlay-Text. Default: bisheriger text_overlay. */
  newTextOverlay?: string;
  /** Optional: Stock-Clip-IDs die ausgeschlossen werden sollen (zusaetzlich zum aktuellen). */
  excludeClipIds?: string[];
}

export interface RegenerateBodyResult {
  segmentIndex: number;
  newClip: { source: string; externalId: string; width: number; height: number };
  newVideoUrl: string;
  newThumbnailUrl: string | null;
  qualityMetrics: ReelQualityMetrics;
  log: string;
}

async function uploadToBucket(storagePath: string, buffer: Buffer, contentType: string): Promise<string | null> {
  const supabase = createServiceClient();
  const { error } = await supabase.storage.from(BUCKET).upload(storagePath, buffer, { contentType, upsert: true });
  if (error) {
    throw new Error(`Storage-Upload fehlgeschlagen (${storagePath}): ${error.message}`);
  }
  const { data } = supabase.storage.from(BUCKET).getPublicUrl(storagePath);
  return data?.publicUrl ?? null;
}

async function downloadFromBucket(storagePath: string, destFile: string): Promise<void> {
  const supabase = createServiceClient();
  const { data, error } = await supabase.storage.from(BUCKET).download(storagePath);
  if (error || !data) {
    throw new Error(`Storage-Download fehlgeschlagen (${storagePath}): ${error?.message ?? 'no data'}`);
  }
  const buf = Buffer.from(await data.arrayBuffer());
  await writeFile(destFile, buf);
}

/**
 * Hauptfunktion: tauscht ein Body-Segment aus und mergt das Reel neu.
 */
export async function regenerateBodySegment(opts: RegenerateBodyOptions): Promise<RegenerateBodyResult> {
  const supabase = createServiceClient();

  // ── 1. Reel + alle Segmente laden ─────────────────────────────────────────
  const { data: reelData, error: reelErr } = await supabase
    .from('social_reels')
    .select('id, status, music_url, thumbnail_url, template_id, is_test, quality_metrics')
    .eq('id', opts.reelId)
    .maybeSingle();
  if (reelErr || !reelData) {
    throw new Error(`Reel ${opts.reelId} nicht gefunden: ${reelErr?.message ?? 'no data'}`);
  }
  const reel = reelData as ReelRow;
  if (reel.status === 'published') {
    throw new Error('Reel ist bereits veröffentlicht — Tausch nicht erlaubt. Lege ein neues Reel an.');
  }

  const { data: segData, error: segErr } = await supabase
    .from('social_reel_segments')
    .select('*')
    .eq('reel_id', opts.reelId)
    .order('index', { ascending: true });
  if (segErr) {
    throw new Error(`Segmente laden fehlgeschlagen: ${segErr.message}`);
  }
  const segments = (segData ?? []) as SegmentRow[];
  if (segments.length === 0) {
    throw new Error('Reel hat keine persistierten Segmente — wurde es vor Phase 3 gerendert? Bitte einmal komplett neu rendern.');
  }

  const target = segments.find((s) => s.index === opts.segmentIndex);
  if (!target) {
    throw new Error(`Segment mit Index ${opts.segmentIndex} nicht gefunden.`);
  }
  if (target.kind !== 'body') {
    throw new Error(`Segment ${opts.segmentIndex} ist '${target.kind}' — nur Body-Segmente sind tauschbar.`);
  }

  // Template fuer motion_style + bg_color laden
  let motionStyle: MotionStyle = 'kenburns';
  if (reel.template_id) {
    const { data: tmpl } = await supabase
      .from('social_reel_templates')
      .select('motion_style')
      .eq('id', reel.template_id)
      .maybeSingle();
    if (tmpl?.motion_style && ['static', 'kenburns', 'mixed'].includes(tmpl.motion_style as string)) {
      motionStyle = tmpl.motion_style as MotionStyle;
    }
  }

  // ── 2. Neuen Stock-Clip suchen ────────────────────────────────────────────
  const sceneData = (target.scene_data ?? {}) as Record<string, unknown>;
  const oldClip = (target.source_clip_data ?? {}) as Record<string, unknown>;
  const searchQuery = (opts.newSearchQuery?.trim() || (sceneData.search_query as string) || '').trim();
  if (!searchQuery) {
    throw new Error('Keine Search-Query verfuegbar — Segment hat keine scene_data.search_query und keine wurde uebergeben.');
  }
  const textOverlay = opts.newTextOverlay !== undefined
    ? opts.newTextOverlay
    : ((sceneData.text_overlay as string) ?? '');

  const exclude = new Set<string>();
  if (oldClip.externalId) exclude.add(oldClip.externalId as string);
  for (const id of opts.excludeClipIds ?? []) exclude.add(id);
  // Auch die andern Body-Clips ausschliessen, damit wir keine Duplikate im Reel bekommen
  for (const seg of segments) {
    if (seg.id === target.id) continue;
    const cd = (seg.source_clip_data ?? {}) as Record<string, unknown>;
    if (cd.externalId) exclude.add(cd.externalId as string);
  }

  const newClip: StockClip | null = await findClipForQuery(searchQuery, {
    seed: `${opts.reelId}:regen:${opts.segmentIndex}:${Date.now()}`,
    excludeIds: exclude,
    minHeight: 1080,
  });
  if (!newClip) {
    throw new Error(`Kein neuer Stock-Clip fuer Query "${searchQuery}" gefunden (Pexels + Pixabay erschoepft oder keine Treffer).`);
  }

  // ── 3. Tmp-Workdir + neues Body-Segment rendern ───────────────────────────
  const workDir = path.join(tmpdir(), `reel-regen-${opts.reelId}-${Date.now()}`);
  await mkdir(workDir, { recursive: true });
  let fullLog = `[regen] reel=${opts.reelId} seg=${opts.segmentIndex} oldClip=${oldClip.externalId ?? '-'} newClip=${newClip.externalId} query="${searchQuery}"`;

  try {
    // Neues Body-Segment rendern
    const newBodySrc = path.join(workDir, 'new-body-src.mp4');
    const newBodyOut = path.join(workDir, `seg-${target.index}-body.mp4`);
    await downloadToFile(newClip.downloadUrl, newBodySrc);

    const kenBurns = pickKenBurnsVariant(motionStyle, opts.reelId, target.index);
    const filter = buildClipFilter(textOverlay, target.duration_seconds, kenBurns);
    const { stderr: bodyLog } = await runFfmpeg([
      '-y', '-hide_banner', '-loglevel', 'error',
      '-i', newBodySrc,
      '-vf', filter,
      ...STD_VIDEO_ENCODE_ARGS,
      '-an',
      newBodyOut,
    ]);
    fullLog += `\n[new-body] motion=${kenBurns} ${bodyLog}`;

    // ── 4. Alle anderen Segmente aus Storage laden ─────────────────────────
    // (intro, andere bodies, cta, outro)
    const localPaths: Record<number, string> = {};
    for (const seg of segments) {
      if (seg.index === target.index) {
        localPaths[seg.index] = newBodyOut;
        continue;
      }
      const localPath = path.join(workDir, `seg-${seg.index}-${seg.kind}.mp4`);
      await downloadFromBucket(seg.storage_path, localPath);
      localPaths[seg.index] = localPath;
    }

    // ── 5. Body+CTA mit xfade neu mergen ──────────────────────────────────
    const bodyCtaSegments = segments
      .filter((s) => s.kind === 'body' || s.kind === 'cta')
      .sort((a, b) => a.index - b.index)
      .map((s) => ({ path: localPaths[s.index], duration: s.duration_seconds }));

    const bodyCtaPath = path.join(workDir, 'body-cta.mp4');
    const useXfade = bodyCtaSegments.length >= 2;
    const xfadeDur = useXfade ? XFADE_DURATION : 0;
    const { log: mergeLog } = await buildBodyCtaWithCrossfade(bodyCtaSegments, bodyCtaPath, xfadeDur);
    fullLog += `\n[body-cta-remerge] xfade=${xfadeDur}s ${mergeLog}`;

    // ── 6. Final-Concat: [intro?, body-cta, outro?] per Demuxer + -c copy ──
    const introSeg = segments.find((s) => s.kind === 'intro');
    const outroSeg = segments.find((s) => s.kind === 'outro');
    const concatList: string[] = [];
    if (introSeg) concatList.push(localPaths[introSeg.index]);
    concatList.push(bodyCtaPath);
    if (outroSeg) concatList.push(localPaths[outroSeg.index]);

    const concatTxtPath = path.join(workDir, 'concat.txt');
    await writeFile(concatTxtPath, concatList.map((p) => `file '${p.replace(/'/g, "\\'")}'`).join('\n'));
    const noAudioPath = path.join(workDir, 'out-noaudio.mp4');
    const { stderr: concatLog } = await runFfmpeg([
      '-y', '-hide_banner', '-loglevel', 'error',
      '-f', 'concat', '-safe', '0', '-i', concatTxtPath,
      '-c', 'copy', '-movflags', '+faststart',
      noAudioPath,
    ]);
    fullLog += `\n[concat] ${concatLog}`;

    // ── 7. Audio-Re-Mix ────────────────────────────────────────────────────
    // Voice-Track bauen aus den persistierten voice-N.mp3-Files (falls vorhanden).
    const voiceSegmentsForMix = segments
      .filter((s) => s.kind === 'body' || s.kind === 'cta')
      .sort((a, b) => a.index - b.index);
    const hasAnyVoice = voiceSegmentsForMix.some((s) => s.has_voice);

    let voiceTrackPath: string | undefined;
    if (hasAnyVoice) {
      try {
        voiceTrackPath = await rebuildVoiceTrack(workDir, segments, voiceSegmentsForMix, useXfade);
        fullLog += `\n[voice-rebuild] ok`;
      } catch (err) {
        fullLog += `\n[voice-rebuild-fail] ${err instanceof Error ? err.message : String(err)}`;
      }
    }

    // Final-Mix
    const finalPath = path.join(workDir, 'out-final.mp4');
    await mixFinalAudio(noAudioPath, voiceTrackPath, reel.music_url, finalPath, workDir);
    fullLog += `\n[final-mix] done`;

    // ── 8. Storage-Upload (overwrites) ─────────────────────────────────────
    const newBodyBuffer = await readFile(newBodyOut);
    const finalBuffer = await readFile(finalPath);

    // Neuer Body-Segment-File
    const newBodyStoragePath = target.storage_path;
    await uploadToBucket(newBodyStoragePath, newBodyBuffer, 'video/mp4');

    // Final-Video — gleicher Pfad, Cache-Bust kommt ueber updated_at im DB-Update
    const videoStoragePath = `${opts.reelId}/video.mp4`;
    const newVideoUrl = await uploadToBucket(videoStoragePath, finalBuffer, 'video/mp4');

    // Thumbnail neu falls erstes Body-Segment getauscht wurde
    let newThumbnailUrl: string | null = reel.thumbnail_url;
    const firstBody = segments.filter((s) => s.kind === 'body').sort((a, b) => a.index - b.index)[0];
    if (firstBody && firstBody.index === target.index) {
      const thumbPath = path.join(workDir, 'thumb.jpg');
      await runFfmpeg([
        '-y', '-hide_banner', '-loglevel', 'error',
        '-ss', '0.8', '-i', newBodyOut,
        '-frames:v', '1', '-q:v', '3',
        thumbPath,
      ]);
      const thumbBuffer = await readFile(thumbPath);
      const thumbStoragePath = `${opts.reelId}/thumb.jpg`;
      newThumbnailUrl = await uploadToBucket(thumbStoragePath, thumbBuffer, 'image/jpeg');
      fullLog += `\n[thumb-regen] body[0] tauschbar — Thumbnail neu generiert`;
    }

    // ── 9. DB-Updates ──────────────────────────────────────────────────────
    const newSourceClipData = {
      source: newClip.source,
      externalId: newClip.externalId,
      downloadUrl: newClip.downloadUrl,
      width: newClip.width,
      height: newClip.height,
      attribution: newClip.attribution,
      pageUrl: newClip.pageUrl,
    };
    const newSceneData = {
      ...sceneData,
      text_overlay: textOverlay,
      search_query: searchQuery,
    };

    const { error: segUpdErr } = await supabase
      .from('social_reel_segments')
      .update({
        scene_data: newSceneData,
        source_clip_data: newSourceClipData,
      })
      .eq('id', target.id);
    if (segUpdErr) throw new Error(`Segment-Row-Update fehlgeschlagen: ${segUpdErr.message}`);

    // Quality-Metrics aktualisieren (file_size + bitrate + render_duration neu)
    const oldMetrics = reel.quality_metrics ?? null;
    const fileSizeBytes = finalBuffer.byteLength;
    const totalDuration = oldMetrics?.duration_seconds ?? 0;
    const avgBitrateKbps = totalDuration > 0
      ? Math.round((fileSizeBytes * 8) / 1000 / totalDuration)
      : (oldMetrics?.avg_bitrate_kbps ?? 0);

    // Source-Resolutions aktualisieren — neuer Eintrag fuer das getauschte Segment
    const newSourceResolutions = (oldMetrics?.source_resolutions ?? []).map((r) =>
      r.index === target.index
        ? { index: target.index, width: newClip.width, height: newClip.height, source: newClip.source }
        : r
    );

    const newQualityMetrics: ReelQualityMetrics = {
      ...(oldMetrics ?? {
        file_size_bytes: 0,
        duration_seconds: 0,
        avg_bitrate_kbps: 0,
        segment_count: 0,
        source_resolutions: [],
        stock_sources: {},
        render_duration_seconds: 0,
        font_used: '',
        motion_style: 'kenburns',
      }),
      file_size_bytes: fileSizeBytes,
      avg_bitrate_kbps: avgBitrateKbps,
      source_resolutions: newSourceResolutions,
    };

    const reelUpdatePayload: Record<string, unknown> = {
      video_url: newVideoUrl,
      thumbnail_url: newThumbnailUrl,
      quality_metrics: newQualityMetrics as unknown as Record<string, unknown>,
    };
    const { error: reelUpdErr } = await supabase
      .from('social_reels')
      .update(reelUpdatePayload)
      .eq('id', opts.reelId);
    if (reelUpdErr) {
      // Falls quality_metrics-Spalte fehlt (Migration nicht durch), retry ohne
      if (reelUpdErr.message?.includes('quality_metrics')) {
        delete reelUpdatePayload.quality_metrics;
        await supabase.from('social_reels').update(reelUpdatePayload).eq('id', opts.reelId);
      } else {
        throw new Error(`Reel-Update fehlgeschlagen: ${reelUpdErr.message}`);
      }
    }

    return {
      segmentIndex: target.index,
      newClip: {
        source: newClip.source,
        externalId: newClip.externalId,
        width: newClip.width,
        height: newClip.height,
      },
      newVideoUrl: newVideoUrl ?? '',
      newThumbnailUrl,
      qualityMetrics: newQualityMetrics,
      log: fullLog.slice(-4000),
    };
  } finally {
    // Tmp aufraeumen — best-effort
    await rm(workDir, { recursive: true, force: true }).catch(() => {});
  }
}

/**
 * Voice-Track aus persistierten voice-N.mp3-Files neu zusammenbauen.
 * Reihenfolge: [intro-silence?, voice_body_0, voice_body_1, ..., voice_body_N-1, voice_cta]
 * Pro Body-Segment (ausser dem letzten) wird die Dauer um xfade gekuerzt fuer Sync.
 */
async function rebuildVoiceTrack(
  workDir: string,
  allSegments: SegmentRow[],
  bodyAndCtaSegments: SegmentRow[],
  useXfade: boolean
): Promise<string> {
  const introSeg = allSegments.find((s) => s.kind === 'intro');
  const xfade = useXfade ? XFADE_DURATION : 0;
  const paddedPaths: string[] = [];

  if (introSeg) {
    const silPath = path.join(workDir, 'voice-silence-intro.wav');
    await runFfmpeg([
      '-y', '-hide_banner', '-loglevel', 'error',
      '-f', 'lavfi',
      '-t', String(introSeg.duration_seconds),
      '-i', 'anullsrc=channel_layout=stereo:sample_rate=44100',
      silPath,
    ]);
    paddedPaths.push(silPath);
  }

  for (let i = 0; i < bodyAndCtaSegments.length; i++) {
    const seg = bodyAndCtaSegments[i];
    const isLast = i === bodyAndCtaSegments.length - 1;
    const effDur = !isLast && xfade > 0
      ? Math.max(0.5, seg.duration_seconds - xfade)
      : seg.duration_seconds;

    const paddedPath = path.join(workDir, `voice-pad-${i}.wav`);

    if (seg.has_voice && seg.voice_storage_path) {
      const mp3Path = path.join(workDir, `voice-${i}.mp3`);
      await downloadFromBucket(seg.voice_storage_path, mp3Path);
      await runFfmpeg([
        '-y', '-hide_banner', '-loglevel', 'error',
        '-i', mp3Path,
        '-af', `apad=whole_dur=${effDur}`,
        '-t', String(effDur),
        '-ar', '44100', '-ac', '2',
        paddedPath,
      ]);
    } else {
      // Stille fuer Segmente ohne Voice
      await runFfmpeg([
        '-y', '-hide_banner', '-loglevel', 'error',
        '-f', 'lavfi',
        '-t', String(effDur),
        '-i', 'anullsrc=channel_layout=stereo:sample_rate=44100',
        paddedPath,
      ]);
    }
    paddedPaths.push(paddedPath);
  }

  // Concat aller WAVs zu einem AAC-File
  const voiceConcatTxt = path.join(workDir, 'voice-concat.txt');
  await writeFile(voiceConcatTxt, paddedPaths.map((p) => `file '${p.replace(/'/g, "\\'")}'`).join('\n'));
  const voiceTrackPath = path.join(workDir, 'voice-track.m4a');
  await runFfmpeg([
    '-y', '-hide_banner', '-loglevel', 'error',
    '-f', 'concat', '-safe', '0', '-i', voiceConcatTxt,
    '-c:a', 'aac', '-b:a', '128k',
    '-ar', '44100', '-ac', '2',
    voiceTrackPath,
  ]);
  return voiceTrackPath;
}

/**
 * Audio-Mix mit gleichem Verhalten wie in renderReel:
 *   - Voice + Musik: Musik bei volume=0.25, mit Voice gemischt
 *   - Nur Voice: pur
 *   - Nur Musik: pur
 *   - Stille: anullsrc
 */
async function mixFinalAudio(
  noAudioPath: string,
  voiceTrackPath: string | undefined,
  musicUrl: string | null,
  finalPath: string,
  workDir: string
): Promise<void> {
  const hasMusic = Boolean(musicUrl);
  const hasVoice = Boolean(voiceTrackPath);

  if (hasMusic && hasVoice) {
    const musicPath = path.join(workDir, 'music.mp3');
    try {
      await downloadToFile(musicUrl as string, musicPath);
      await runFfmpeg([
        '-y', '-hide_banner', '-loglevel', 'error',
        '-i', noAudioPath,
        '-i', voiceTrackPath as string,
        '-i', musicPath,
        '-filter_complex', '[2:a]volume=0.25[m];[1:a][m]amix=inputs=2:duration=first:dropout_transition=0[a]',
        '-map', '0:v', '-map', '[a]',
        '-c:v', 'copy', '-c:a', 'aac', '-b:a', '128k',
        '-shortest',
        finalPath,
      ]);
      return;
    } catch {
      // Fallback: nur Voice
    }
  }
  if (hasVoice) {
    await runFfmpeg([
      '-y', '-hide_banner', '-loglevel', 'error',
      '-i', noAudioPath,
      '-i', voiceTrackPath as string,
      '-map', '0:v', '-map', '1:a',
      '-c:v', 'copy', '-c:a', 'aac', '-b:a', '128k',
      '-shortest',
      finalPath,
    ]);
    return;
  }
  if (hasMusic) {
    const musicPath = path.join(workDir, 'music.mp3');
    try {
      await downloadToFile(musicUrl as string, musicPath);
      await runFfmpeg([
        '-y', '-hide_banner', '-loglevel', 'error',
        '-i', noAudioPath, '-i', musicPath,
        '-map', '0:v', '-map', '1:a',
        '-shortest',
        '-c:v', 'copy', '-c:a', 'aac', '-b:a', '128k',
        finalPath,
      ]);
      return;
    } catch {
      // Fallback: stiller Track
    }
  }
  await runFfmpeg([
    '-y', '-hide_banner', '-loglevel', 'error',
    '-i', noAudioPath,
    '-f', 'lavfi',
    '-i', 'anullsrc=channel_layout=stereo:sample_rate=44100',
    '-shortest',
    '-c:v', 'copy', '-c:a', 'aac', '-b:a', '128k',
    finalPath,
  ]);
}

// TARGET_FPS wird aktuell im Regenerator nicht direkt benutzt, ist aber als Konstante
// importiert um Konsistenz mit ffmpeg-render.ts zu haben (kein no-unused-vars).
void TARGET_FPS;
