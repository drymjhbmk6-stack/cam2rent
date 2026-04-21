import { NextResponse } from 'next/server';
import { createServiceClient } from '@/lib/supabase';
import { checkAdminAuth } from '@/lib/admin-auth';
import { spawn } from 'child_process';

export const runtime = 'nodejs';

/**
 * GET /api/admin/reels/diagnose
 *
 * Zeigt den Zustand aller Voraussetzungen fuer Reel-Generierung
 * (ohne API-Keys zu leaken). Hilft beim Debuggen wenn ein Reel fehlschlaegt.
 */
export async function GET() {
  if (!(await checkAdminAuth())) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const supabase = createServiceClient();

  // ── blog_settings (enthaelt Anthropic-Key) ────────────────────────────────
  const blogResult = await supabase.from('admin_settings').select('value').eq('key', 'blog_settings').maybeSingle();
  let blogSettings: { valueType: string; parsedOk: boolean; keys: string[]; anthropicPresent: boolean; anthropicLength: number; openaiPresent: boolean } | { error: string } | { missing: true };

  if (blogResult.error) {
    blogSettings = { error: blogResult.error.message };
  } else if (!blogResult.data) {
    blogSettings = { missing: true };
  } else {
    let parsed: Record<string, unknown> = {};
    let parsedOk = false;
    try {
      parsed = typeof blogResult.data.value === 'string' ? JSON.parse(blogResult.data.value) : (blogResult.data.value as Record<string, unknown>);
      parsedOk = typeof parsed === 'object' && parsed !== null;
    } catch { /* parsedOk stays false */ }
    const anth = typeof parsed.anthropic_api_key === 'string' ? parsed.anthropic_api_key : '';
    const oai = typeof parsed.openai_api_key === 'string' ? parsed.openai_api_key : '';
    blogSettings = {
      valueType: typeof blogResult.data.value,
      parsedOk,
      keys: parsedOk ? Object.keys(parsed) : [],
      anthropicPresent: anth.trim().length > 0,
      anthropicLength: anth.length,
      openaiPresent: oai.trim().length > 0,
    };
  }

  // ── reels_settings (enthaelt Pexels-Key) ──────────────────────────────────
  const reelsResult = await supabase.from('admin_settings').select('value').eq('key', 'reels_settings').maybeSingle();
  let reelsSettings: { valueType: string; parsedOk: boolean; keys: string[]; pexelsPresent: boolean; pexelsSource: 'db' | 'env' | 'none'; previewRequired: unknown; maxDuration: unknown } | { error: string } | { missing: true };

  if (reelsResult.error) {
    reelsSettings = { error: reelsResult.error.message };
  } else if (!reelsResult.data) {
    reelsSettings = { missing: true };
  } else {
    let parsed: Record<string, unknown> = {};
    let parsedOk = false;
    try {
      parsed = typeof reelsResult.data.value === 'string' ? JSON.parse(reelsResult.data.value) : (reelsResult.data.value as Record<string, unknown>);
      parsedOk = typeof parsed === 'object' && parsed !== null;
    } catch { /* parsedOk stays false */ }
    const pex = typeof parsed.pexels_api_key === 'string' ? parsed.pexels_api_key.trim() : '';
    const pexelsSource = pex ? 'db' : (process.env.PEXELS_API_KEY?.trim() ? 'env' : 'none');
    reelsSettings = {
      valueType: typeof reelsResult.data.value,
      parsedOk,
      keys: parsedOk ? Object.keys(parsed) : [],
      pexelsPresent: pexelsSource !== 'none',
      pexelsSource,
      previewRequired: parsed.preview_required,
      maxDuration: parsed.max_duration,
    };
  }

  // ── Storage-Bucket ────────────────────────────────────────────────────────
  const bucket = await supabase.storage.getBucket('social-reels');
  const bucketInfo = bucket.error
    ? { error: bucket.error.message }
    : { exists: true, public: bucket.data?.public, sizeLimit: bucket.data?.file_size_limit };

  // ── ffmpeg binary ─────────────────────────────────────────────────────────
  const ffmpegInfo = await new Promise<{ available: boolean; version?: string; error?: string }>((resolve) => {
    const proc = spawn('ffmpeg', ['-version'], { stdio: ['ignore', 'pipe', 'pipe'] });
    let out = '';
    proc.stdout.on('data', (c) => (out += c.toString()));
    proc.on('error', (err) => resolve({ available: false, error: err.message }));
    proc.on('close', (code) => {
      if (code === 0) {
        const first = out.split('\n')[0] ?? '';
        resolve({ available: true, version: first.trim() });
      } else {
        resolve({ available: false, error: `exit ${code}` });
      }
    });
  });

  // ── Templates ──────────────────────────────────────────────────────────────
  const tpl = await supabase.from('social_reel_templates').select('id, name, template_type, is_active').eq('is_active', true);
  const templatesInfo = tpl.error ? { error: tpl.error.message } : { count: tpl.data?.length ?? 0, active: tpl.data ?? [] };

  return NextResponse.json({
    blogSettings,
    reelsSettings,
    bucket: bucketInfo,
    ffmpeg: ffmpegInfo,
    templates: templatesInfo,
  });
}
