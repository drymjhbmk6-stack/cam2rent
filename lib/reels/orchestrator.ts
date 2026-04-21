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
import { generateReelScript, type ReelScript } from './script-ai';
import { findClipForQuery, type PexelsVideo, type PexelsVideoFile } from './pexels';
import { renderReel } from './ffmpeg-render';

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
    })
    .select('id')
    .single();

  if (insertError || !inserted) {
    throw new Error(`Konnte Reel-Row nicht anlegen: ${insertError?.message ?? 'unknown'}`);
  }
  const reelId = inserted.id as string;

  try {
    // ── 3. Skript generieren ────────────────────────────────────────────────
    const keywordsStr = (opts.keywords ?? []).join(', ');
    const script = await generateReelScript(
      tmpl.script_prompt,
      {
        topic: opts.topic,
        product_name: opts.productName ?? '',
        keywords: keywordsStr,
      },
      { postDate: opts.postDate }
    );

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
    let clips: Array<{ video: PexelsVideo; file: PexelsVideoFile }> | undefined;
    if (templateType === 'stock_footage') {
      clips = [];
      const seen = new Set<number>();
      for (const scene of script.scenes) {
        const match = await findClipForQuery(scene.search_query, seen);
        if (!match) {
          throw new Error(`Kein Pexels-Clip für Suchbegriff "${scene.search_query}" gefunden`);
        }
        clips.push(match);
        seen.add(match.video.id);
      }
    }

    // ── 5. Rendern ──────────────────────────────────────────────────────────
    const { videoBuffer, thumbnailBuffer, durationSeconds, log } = await renderReel({
      script,
      templateType,
      clips,
      musicUrl: settings.default_music_url?.trim() || undefined,
      bgColorFrom: tmpl.bg_color_from,
      bgColorTo: tmpl.bg_color_to,
    });

    // ── 6. Upload ───────────────────────────────────────────────────────────
    // Supabase-Bucket-Limit ist 50 MB. Unsere CRF-23-Renders liegen typisch bei
    // 10–20 MB fuer 20s — aber wir warnen bei >45 MB, damit wir das Problem
    // frueh sehen falls ein laengeres Reel ueber die Grenze geht.
    const sizeMb = videoBuffer.byteLength / (1024 * 1024);
    if (sizeMb > 45) {
      console.warn(`[reels/orchestrator] Video ist ${sizeMb.toFixed(1)} MB — Bucket-Limit 50 MB`);
    }

    const videoPath = `${reelId}/video.mp4`;
    const thumbPath = `${reelId}/thumb.jpg`;
    const videoUrl = await uploadToBucket(videoPath, videoBuffer, 'video/mp4');
    const thumbnailUrl = await uploadToBucket(thumbPath, thumbnailBuffer, 'image/jpeg');

    if (!videoUrl) {
      const hint = sizeMb > 45
        ? ` Video ist ${sizeMb.toFixed(1)} MB — evtl. ueber Bucket-Limit (50 MB). Dauer in admin_settings.reels_settings.max_duration reduzieren.`
        : ' Bucket "social-reels" angelegt und public? Service-Role-Key aktiv?';
      throw new Error(`Video-Upload fehlgeschlagen.${hint}`);
    }

    // ── 7. DB aktualisieren ─────────────────────────────────────────────────
    const needsReview = opts.previewRequired ?? settings.preview_required ?? true;
    const newStatus = needsReview ? 'pending_review' : 'rendered';

    await supabase
      .from('social_reels')
      .update({
        caption: script.caption,
        hashtags: script.hashtags,
        video_url: videoUrl,
        thumbnail_url: thumbnailUrl,
        duration_seconds: durationSeconds,
        script_json: script as unknown as Record<string, unknown>,
        render_log: log.slice(-4000),
        status: newStatus,
        error_message: null,
      })
      .eq('id', reelId);

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
