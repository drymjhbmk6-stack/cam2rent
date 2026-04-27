/**
 * Reel-Orchestrator — vom Topic zum fertigen DB-Eintrag.
 *
 * Schritte:
 *   1. Template laden (oder Default)
 *   2. Claude-Skript generieren (generateReelScript)
 *   3. Pro Szene einen Pexels-Clip suchen (stock_footage)
 *   4. FFmpeg-Render ausführen
 *   5. MP4 + Thumbnail in Supabase Storage (Bucket: social-reels) hochladen
 *   6. social_reels-Row mit status='rendered' (bzw. 'pending_review') schreiben
 *
 * Wichtige Eigenschaft: Kein Auto-Publish. Die Row wird explizit als
 * Entwurf/pending_review erstellt — der Admin muss freigeben.
 */

import { createServiceClient } from '@/lib/supabase';
import { isTestMode } from '@/lib/env-mode';
import { createAdminNotification } from '@/lib/admin-notifications';
import { generateReelScript, type ReelScript } from './script-ai';
// Phase 1.5: Multi-Source-Stock-Footage (Pexels + Pixabay) statt direktem Pexels-Aufruf.
import { findClipForQuery, type StockClip } from './stock-sources';
import { renderReel } from './ffmpeg-render';
import { generateSpeechFromSettings, type TTSProvider, type TTSVoice, type TTSModel, type TTSStyle, type ElevenLabsModel } from './tts';

export interface GenerateReelOptions {
  templateId?: string;
  templateType?: 'stock_footage' | 'motion_graphics';
  topic: string;                         // Pflicht: Was soll das Reel zeigen?
  productName?: string;
  keywords?: string[];
  platforms?: string[];
  fbAccountId?: string | null;
  igAccountId?: string | null;
  sourceType?: string;
  sourceId?: string;
  previewRequired?: boolean;             // Default true
  postDate?: Date;
  musicId?: string | null;               // Optional: ueberschreibt default_music_url
}

export interface GenerateReelResult {
  reelId: string;
  status: string;
  script: ReelScript;
  videoUrl: string | null;
  thumbnailUrl: string | null;
  error?: string;
}

const BUCKET = 'social-reels';

interface ReelsSettings {
  auto_mode?: 'semi' | 'voll';
  preview_required?: boolean;
  default_template_id?: string | null;
  default_music_url?: string;
  max_duration?: number;
  voice_enabled?: boolean;
  voice_provider?: TTSProvider;
  voice_name?: TTSVoice;
  voice_model?: TTSModel;
  voice_style?: TTSStyle;
  elevenlabs_api_key?: string;
  elevenlabs_voice_id?: string;
  elevenlabs_voice_name?: string;
  elevenlabs_model_id?: ElevenLabsModel;
  elevenlabs_stability?: number;
  elevenlabs_similarity_boost?: number;
  elevenlabs_style?: number;
  elevenlabs_speaker_boost?: boolean;
  intro_enabled?: boolean;
  outro_enabled?: boolean;
  intro_duration?: number;
  outro_duration?: number;
}

async function loadSettings(): Promise<ReelsSettings> {
  const supabase = createServiceClient();
  const { data } = await supabase.from('admin_settings').select('value').eq('key', 'reels_settings').maybeSingle();
  if (!data?.value) return {};
  try {
    // value kann String oder Objekt sein (je nach Supabase-Client-Version)
    return typeof data.value === 'string' ? JSON.parse(data.value) : (data.value as ReelsSettings);
  } catch {
    return {};
  }
}

interface TemplateRow {
  id: string;
  name: string;
  template_type: 'stock_footage' | 'motion_graphics';
  script_prompt: string;
  default_duration: number;
  default_hashtags: string[];
  bg_color_from: string;
  bg_color_to: string;
  // Phase 2.2: optional, kann fehlen wenn Template aus alter Migration stammt
  motion_style?: 'static' | 'kenburns' | 'mixed';
}

async function loadTemplate(templateId: string | undefined): Promise<TemplateRow | null> {
  const supabase = createServiceClient();
  const query = templateId
    ? supabase.from('social_reel_templates').select('*').eq('id', templateId).maybeSingle()
    : supabase.from('social_reel_templates').select('*').eq('is_active', true).order('created_at', { ascending: true }).limit(1).maybeSingle();
  const { data } = await query;
  return (data as TemplateRow | null) ?? null;
}

async function uploadToBucket(path: string, buffer: Buffer, contentType: string): Promise<string | null> {
  const supabase = createServiceClient();
  const { error } = await supabase.storage.from(BUCKET).upload(path, buffer, { contentType, upsert: true });
  if (error) {
    console.warn('[reels/orchestrator] Upload-Fehler:', error.message);
    return null;
  }
  const { data } = supabase.storage.from(BUCKET).getPublicUrl(path);
  return data?.publicUrl ?? null;
}

/**
 * Schreibt einen Phasen-Marker live in `render_log`, damit der Admin im UI
 * sehen kann wo ein haengender Render gerade klemmt (statt erst am Ende einen
 * grossen Block zu kriegen). Append-Pattern — bei concurrent Updates koennten
 * Zeilen verloren gehen, aber waehrend eines Renders gibt's nur einen Writer.
 * Best-effort: Fehler werden geschluckt, damit Logging nie den Render abbricht.
 */
async function phaseLog(reelId: string, phase: string, extra?: string): Promise<void> {
  try {
    const supabase = createServiceClient();
    const { data } = await supabase
      .from('social_reels')
      .select('render_log')
      .eq('id', reelId)
      .maybeSingle();
    const oldLog = (data?.render_log as string | null) ?? '';
    const ts = new Date().toISOString().slice(11, 19); // HH:MM:SS
    const line = `[phase ${ts}] ${phase}${extra ? ` · ${extra}` : ''}`;
    const newLog = (oldLog ? `${oldLog}\n${line}` : line).slice(-4000);
    await supabase.from('social_reels').update({ render_log: newLog }).eq('id', reelId);
  } catch {
    /* swallow — Logging darf den Render nie killen */
  }
}

export async function generateReel(opts: GenerateReelOptions): Promise<GenerateReelResult> {
  const supabase = createServiceClient();
  const settings = await loadSettings();
  const testMode = await isTestMode();

  // ── 1. Template laden ─────────────────────────────────────────────────────
  const tmpl = await loadTemplate(opts.templateId ?? settings.default_template_id ?? undefined);
  if (!tmpl) {
    throw new Error('Kein Reel-Template gefunden. Lege mindestens eins an (/admin/social/reels/vorlagen).');
  }
  const templateType = opts.templateType ?? tmpl.template_type;

  // ── 1a. Musik-URL ermitteln: music_id überschreibt default_music_url ────
  let resolvedMusicUrl: string | undefined;
  let resolvedMusicId: string | null = null;
  if (opts.musicId) {
    const { data: track } = await supabase.from('social_reel_music').select('id, url').eq('id', opts.musicId).maybeSingle();
    if (track?.url) {
      resolvedMusicUrl = track.url;
      resolvedMusicId = track.id;
    }
  }
  if (!resolvedMusicUrl) {
    // Kein explizites music_id → is_default Track suchen
    const { data: def } = await supabase.from('social_reel_music').select('id, url').eq('is_default', true).maybeSingle();
    if (def?.url) {
      resolvedMusicUrl = def.url;
      resolvedMusicId = def.id;
    }
  }
  if (!resolvedMusicUrl) {
    // Fallback auf globalen Legacy-Setting
    resolvedMusicUrl = settings.default_music_url?.trim() || undefined;
  }

  // ── 2. Draft-Row anlegen (damit wir bei Fehlern was zum Aktualisieren haben) ──
  const { data: inserted, error: insertError } = await supabase
    .from('social_reels')
    .insert({
      status: 'rendering',
      template_id: tmpl.id,
      template_type: templateType,
      caption: '',
      hashtags: [],
      platforms: opts.platforms ?? ['facebook', 'instagram'],
      fb_account_id: opts.fbAccountId ?? null,
      ig_account_id: opts.igAccountId ?? null,
      source_type: opts.sourceType ?? 'manual',
      source_id: opts.sourceId ?? null,
      ai_generated: true,
      ai_prompt: opts.topic,
      is_test: testMode,
      music_id: resolvedMusicId,
      music_url: resolvedMusicUrl ?? null,
    })
    .select('id')
    .single();

  if (insertError || !inserted) {
    throw new Error(`Konnte Reel-Row nicht anlegen: ${insertError?.message ?? 'unknown'}`);
  }
  const reelId = inserted.id as string;

  try {
    // Phasen-Marker live in render_log — bei einem Hang sieht der Admin sofort wo's klemmt.
    await phaseLog(reelId, 'started', `topic="${opts.topic.slice(0, 60)}"`);

    // ── 3. Skript generieren ────────────────────────────────────────────────
    await phaseLog(reelId, 'script_generation_start');
    const keywordsStr = (opts.keywords ?? []).join(', ');
    const script = await generateReelScript(
      tmpl.script_prompt,
      {
        topic: opts.topic,
        product_name: opts.productName ?? '',
        keywords: keywordsStr,
      },
      { postDate: opts.postDate, voiceStyle: settings.voice_style ?? 'normal' }
    );
    await phaseLog(reelId, 'script_generated', `${script.scenes.length} szenen, ${script.duration}s gesamt`);

    // Dauer-Cap (Reels dürfen max 90s auf IG, wir limitieren konservativ)
    const maxDur = settings.max_duration ?? 30;
    if (script.duration > maxDur) {
      // Proportional trimmen: nicht kritisch, aber signalisiert Claude-Issue
      const factor = maxDur / script.duration;
      script.scenes = script.scenes.map((s) => ({ ...s, duration: Math.max(1, Math.round(s.duration * factor)) }));
      script.cta_frame.duration = Math.max(2, Math.round(script.cta_frame.duration * factor));
      script.duration = script.scenes.reduce((a, b) => a + b.duration, 0) + script.cta_frame.duration;
    }

    // ── 4. Clips suchen (nur stock_footage) ─────────────────────────────────
    // Phase 1.5: Multi-Source — pickt Pexels oder Pixabay deterministisch via reelId-Hash
    // (gleicher Reel = gleiche Primaerquelle bei Re-Render). Quell-Verteilung wird
    // sichtbar, sobald PIXABAY_API_KEY in admin_settings.reels_settings gesetzt ist.
    let clips: StockClip[] | undefined;
    const sourceCounts: Record<string, number> = {};
    if (templateType === 'stock_footage') {
      await phaseLog(reelId, 'stock_search_start', `${script.scenes.length} szenen`);
      clips = [];
      const seen = new Set<string>();
      for (let sceneIdx = 0; sceneIdx < script.scenes.length; sceneIdx++) {
        const scene = script.scenes[sceneIdx];
        await phaseLog(reelId, `stock_search:${sceneIdx + 1}/${script.scenes.length}`, `query="${scene.search_query.slice(0, 50)}"`);
        const clip = await findClipForQuery(scene.search_query, {
          seed: `${reelId}:${sceneIdx}`,
          excludeIds: seen,
          minHeight: 1080,
        });
        if (!clip) {
          throw new Error(`Kein Stock-Clip fuer Suchbegriff "${scene.search_query}" gefunden (Pexels + Pixabay)`);
        }
        clips.push(clip);
        seen.add(clip.externalId);
        sourceCounts[clip.source] = (sourceCounts[clip.source] ?? 0) + 1;
      }
      await phaseLog(reelId, 'stock_search_done', Object.entries(sourceCounts).map(([k, v]) => `${k}=${v}`).join(' '));
    }

    // ── 5a. Voice-Over generieren (wenn aktiviert) ──────────────────────────
    let voiceSegments: Buffer[] | undefined;
    if (settings.voice_enabled) {
      const provider: TTSProvider = settings.voice_provider ?? 'openai';
      await phaseLog(reelId, 'voice_generation_start', `provider=${provider}`);
      try {
        const texts: string[] = [
          ...script.scenes.map((s) => (s.voice_text?.trim() || s.text_overlay?.trim() || '')),
          (script.cta_frame.voice_text?.trim() || script.cta_frame.headline?.trim() || ''),
        ];
        const generated: Buffer[] = [];
        for (const t of texts) {
          if (!t) {
            generated.push(Buffer.alloc(0));
            continue;
          }
          const buf = await generateSpeechFromSettings(t, settings);
          generated.push(buf);
        }
        if (generated.some((b) => b.length > 0)) {
          voiceSegments = generated;
        }
        await phaseLog(reelId, 'voice_generation_done', `${generated.filter((b) => b.length > 0).length}/${generated.length} segs`);
      } catch (err) {
        await phaseLog(reelId, 'voice_generation_failed', err instanceof Error ? err.message.slice(0, 80) : 'unknown');
        console.warn('[reels/orchestrator] TTS-Fehler, Video wird ohne Voice gerendert:', err);
      }
    }

    // ── 5b. Rendern ─────────────────────────────────────────────────────────
    // Phase 2.2: motionStyle aus Template (oder Default 'kenburns'), reelId als
    // Seed fuer deterministische Ken-Burns-Variante pro Szene.
    const motionStyleResolved: 'static' | 'kenburns' | 'mixed' = tmpl.motion_style ?? 'kenburns';
    await phaseLog(reelId, 'ffmpeg_start', `motion=${motionStyleResolved} type=${templateType}`);
    const { videoBuffer, thumbnailBuffer, durationSeconds, log, qualityMetrics, segments: persistedSegments } = await renderReel({
      script,
      templateType,
      clips,
      musicUrl: resolvedMusicUrl,
      voiceSegments,
      bgColorFrom: tmpl.bg_color_from,
      bgColorTo: tmpl.bg_color_to,
      introEnabled: settings.intro_enabled !== false, // Default: true
      outroEnabled: settings.outro_enabled !== false, // Default: true
      introDuration: settings.intro_duration ?? 1.5,
      outroDuration: settings.outro_duration ?? 1.5,
      motionStyle: motionStyleResolved,
      reelId,
    });

    // ── 6. Upload ───────────────────────────────────────────────────────────
    // Supabase-Bucket-Limit ist 50 MB. Unsere CRF-23-Renders liegen typisch bei
    // 10–20 MB fuer 20s — aber wir warnen bei >45 MB, damit wir das Problem
    // frueh sehen falls ein laengeres Reel ueber die Grenze geht.
    const sizeMb = videoBuffer.byteLength / (1024 * 1024);
    if (sizeMb > 45) {
      console.warn(`[reels/orchestrator] Video ist ${sizeMb.toFixed(1)} MB — Bucket-Limit 50 MB`);
    }
    await phaseLog(reelId, 'ffmpeg_done', `${sizeMb.toFixed(1)} MB · ${durationSeconds.toFixed(1)}s`);

    const videoPath = `${reelId}/video.mp4`;
    const thumbPath = `${reelId}/thumb.jpg`;
    await phaseLog(reelId, 'video_upload_start');
    const videoUrl = await uploadToBucket(videoPath, videoBuffer, 'video/mp4');
    const thumbnailUrl = await uploadToBucket(thumbPath, thumbnailBuffer, 'image/jpeg');
    await phaseLog(reelId, 'video_upload_done');

    if (!videoUrl) {
      const hint = sizeMb > 45
        ? ` Video ist ${sizeMb.toFixed(1)} MB — evtl. ueber Bucket-Limit (50 MB). Dauer in admin_settings.reels_settings.max_duration reduzieren.`
        : ' Bucket "social-reels" angelegt und public? Service-Role-Key aktiv?';
      throw new Error(`Video-Upload fehlgeschlagen.${hint}`);
    }

    await phaseLog(reelId, 'segments_persist_start', `${persistedSegments.length} segs`);
    // ── 6b. Phase 3.1: Pro-Szene-Persistierung ──────────────────────────────
    // Body-Tausch in Phase 3 braucht die Original-Segment-Files. Jedes Segment
    // landet unter {reelId}/segments/seg-{index}-{kind}.mp4. Voice-Buffer pro
    // Szene unter {reelId}/audio/voice-{index}.mp3.
    // Defensiv: Wenn die Migration `social_reel_segments` noch nicht durch ist,
    // ueberspringen wir den DB-Insert mit Warning. Der Initial-Render bleibt
    // dann funktional, aber Segment-Tausch geht erst nach Migration.
    let segmentsPersisted = 0;
    try {
      const segmentRows: Array<Record<string, unknown>> = [];
      for (const seg of persistedSegments) {
        const segStoragePath = `${reelId}/segments/seg-${seg.index}-${seg.kind}.mp4`;
        await uploadToBucket(segStoragePath, seg.buffer, 'video/mp4');

        // Voice-Buffer fuer dieses Segment (nur bei Body/CTA und wenn voiceSegments existieren)
        // Voice-Index-Mapping: voiceSegments hat Reihenfolge [scene_0, ..., scene_N-1, cta]
        // also Index in voiceSegments = (seg.index - introOffset) wenn body/cta
        let voiceStoragePath: string | null = null;
        let hasVoice = false;
        if (voiceSegments && (seg.kind === 'body' || seg.kind === 'cta')) {
          const introOffset = (settings.intro_enabled !== false) ? 1 : 0;
          const voiceIdx = seg.index - introOffset;
          const voiceBuf = voiceSegments[voiceIdx];
          if (voiceBuf && voiceBuf.length > 0) {
            voiceStoragePath = `${reelId}/audio/voice-${seg.index}.mp3`;
            await uploadToBucket(voiceStoragePath, voiceBuf, 'audio/mpeg');
            hasVoice = true;
          }
        }

        segmentRows.push({
          reel_id: reelId,
          index: seg.index,
          kind: seg.kind,
          storage_path: segStoragePath,
          duration_seconds: seg.duration,
          scene_data: seg.sceneData ?? null,
          source_clip_data: seg.sourceClipData ?? null,
          has_voice: hasVoice,
          voice_storage_path: voiceStoragePath,
        });
      }
      // Erst alte Rows fuer dieses Reel loeschen (idempotent bei Re-Render),
      // dann neu inserten. ON DELETE CASCADE auf reel_id sorgt fuer Auto-Cleanup
      // wenn das Reel komplett geloescht wird.
      const { error: delErr } = await supabase.from('social_reel_segments').delete().eq('reel_id', reelId);
      if (delErr && !delErr.message?.includes('does not exist') && !delErr.message?.includes('relation')) {
        throw delErr;
      }
      const { error: insErr } = await supabase.from('social_reel_segments').insert(segmentRows);
      if (insErr) {
        if (insErr.message?.includes('does not exist') || insErr.message?.includes('relation')) {
          console.warn('[reels/orchestrator] social_reel_segments-Tabelle fehlt — Phase-3-Migration noch nicht durch?');
        } else {
          throw insErr;
        }
      } else {
        segmentsPersisted = segmentRows.length;
      }
    } catch (err) {
      console.warn('[reels/orchestrator] Segment-Persistierung fehlgeschlagen:', err);
      await phaseLog(reelId, 'segments_persist_failed', err instanceof Error ? err.message.slice(0, 80) : 'unknown');
    }
    await phaseLog(reelId, 'segments_persisted', `${segmentsPersisted}/${persistedSegments.length}`);

    // ── 7. DB aktualisieren ─────────────────────────────────────────────────
    const needsReview = opts.previewRequired ?? settings.preview_required ?? true;
    const newStatus = needsReview ? 'pending_review' : 'rendered';

    // Audio-Hinweis im render_log dokumentieren, damit im Detail-UI sichtbar
    const provider = settings.voice_provider ?? 'openai';
    const voiceLabel = provider === 'elevenlabs'
      ? (settings.elevenlabs_voice_name || settings.elevenlabs_voice_id || 'unknown')
      : (settings.voice_name ?? 'nova');
    const modelLabel = provider === 'elevenlabs'
      ? (settings.elevenlabs_model_id ?? 'eleven_multilingual_v2')
      : (settings.voice_model ?? 'tts-1');
    const audioStatus = voiceSegments
      ? `Voice-Track: AN (${provider}: Stimme=${voiceLabel}, Modell=${modelLabel})`
      : settings.voice_enabled
        ? `Voice-Track: angefordert aber fehlgeschlagen (siehe Log)`
        : `Voice-Track: AUS (Setting voice_enabled=false)`;
    const musicStatus = settings.default_music_url?.trim()
      ? `Musik: AN (${settings.default_music_url.trim()})`
      : `Musik: AUS (keine default_music_url gesetzt)`;
    const audioHeader = `[audio] ${audioStatus} · ${musicStatus}`;
    // Phase 1.5: Quell-Verteilung im Log dokumentieren (Pexels vs. Pixabay).
    const sourceSummary = Object.entries(sourceCounts).length > 0
      ? `[stock-sources] ${Object.entries(sourceCounts).map(([k, v]) => `${k}=${v}`).join(' · ')}`
      : '[stock-sources] none (motion_graphics)';
    // Phase 3.1: Persistierungs-Status im Log dokumentieren.
    const segmentsSummary = `[segments] persisted=${segmentsPersisted}/${persistedSegments.length}`;

    // Kritisches Update: Status + Video + Caption muessen gesetzt werden,
    // sonst bleibt das Reel auf 'rendering' haengen. quality_metrics ist
    // optional und wird in einem zweiten Schritt geschrieben — falls die
    // Migration noch nicht durch ist, soll der Hauptzustand trotzdem stehen.
    const criticalPayload: Record<string, unknown> = {
      caption: script.caption,
      hashtags: script.hashtags,
      video_url: videoUrl,
      thumbnail_url: thumbnailUrl,
      duration_seconds: Math.round(durationSeconds),
      script_json: script as unknown as Record<string, unknown>,
      render_log: `${audioHeader}\n${sourceSummary}\n${segmentsSummary}\n${log}`.slice(-4000),
      status: newStatus,
      error_message: null,
    };
    const { error: updateError } = await supabase
      .from('social_reels')
      .update(criticalPayload)
      .eq('id', reelId);
    if (updateError) {
      await phaseLog(reelId, 'final_update_failed', updateError.message?.slice(0, 100) ?? 'unknown');
      throw new Error(`Final UPDATE failed: ${updateError.message ?? 'unknown'}`);
    }
    await phaseLog(reelId, 'render_complete', `status=${newStatus}`);

    // Push-Notification: nur bei pending_review (Admin muss reviewen).
    // Im 'rendered'-Modus (Auto-Publish) waere die Notification redundant.
    if (newStatus === 'pending_review') {
      const topicShort = opts.topic.length > 60 ? opts.topic.slice(0, 60) + '…' : opts.topic;
      await createAdminNotification(supabase, {
        type: 'reel_ready',
        title: 'Reel fertig zum Reviewen',
        message: topicShort,
        link: `/admin/social/reels/${reelId}`,
      });
    }

    // Optional: Quality-Metrics in eigener Spalte. Wenn die Migration noch
    // nicht ausgefuehrt ist (Spalte fehlt), wird der Fehler nur geloggt — der
    // Reel ist trotzdem im richtigen Status.
    try {
      const { error: metricsError } = await supabase
        .from('social_reels')
        .update({ quality_metrics: qualityMetrics as unknown as Record<string, unknown> })
        .eq('id', reelId);
      if (metricsError && !metricsError.message?.includes('quality_metrics')) {
        console.warn('[reels/orchestrator] quality_metrics-Update fehlgeschlagen:', metricsError.message);
      }
    } catch (err) {
      console.warn('[reels/orchestrator] quality_metrics-Update Exception:', err);
    }

    return { reelId, status: newStatus, script, videoUrl, thumbnailUrl };
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    await supabase
      .from('social_reels')
      .update({ status: 'failed', error_message: msg.slice(0, 1000) })
      .eq('id', reelId);
    return {
      reelId,
      status: 'failed',
      script: {} as ReelScript,
      videoUrl: null,
      thumbnailUrl: null,
      error: msg,
    };
  }
}
