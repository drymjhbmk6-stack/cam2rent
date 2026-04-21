import { NextRequest, NextResponse } from 'next/server';
import { createServiceClient } from '@/lib/supabase';
import { checkAdminAuth } from '@/lib/admin-auth';
import { generateReel } from '@/lib/reels/orchestrator';
import { logAudit } from '@/lib/audit';

export const runtime = 'nodejs';
export const maxDuration = 300;

/** GET /api/admin/reels?status=&limit=&offset= */
export async function GET(req: NextRequest) {
  if (!(await checkAdminAuth())) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }
  const url = new URL(req.url);
  const status = url.searchParams.get('status');
  const limit = Math.min(100, Number(url.searchParams.get('limit') ?? '50'));
  const offset = Number(url.searchParams.get('offset') ?? '0');

  const supabase = createServiceClient();
  let query = supabase
    .from('social_reels')
    .select('id, caption, hashtags, thumbnail_url, video_url, duration_seconds, template_type, status, scheduled_at, published_at, error_message, ai_generated, is_test, created_at, updated_at, fb_reel_id, ig_reel_id, fb_permalink, ig_permalink', { count: 'exact' })
    .order('created_at', { ascending: false })
    .range(offset, offset + limit - 1);

  if (status) query = query.eq('status', status);

  const { data, error, count } = await query;
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ reels: data ?? [], total: count ?? 0 });
}

/**
 * POST /api/admin/reels  → Neues Reel generieren (async im Hintergrund).
 * Body: { topic, templateId?, templateType?, productName?, keywords?, platforms?, fbAccountId?, igAccountId? }
 *
 * Gibt sofort die Reel-ID zurück. Status kann via GET /api/admin/reels/[id] gepollt werden.
 */
export async function POST(req: NextRequest) {
  if (!(await checkAdminAuth())) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  let body: Record<string, unknown>;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 });
  }

  const topic = typeof body.topic === 'string' ? body.topic.trim() : '';
  if (!topic) {
    return NextResponse.json({ error: 'Feld "topic" ist Pflicht' }, { status: 400 });
  }

  const opts = {
    topic,
    templateId: typeof body.templateId === 'string' ? body.templateId : undefined,
    templateType: body.templateType === 'motion_graphics' ? 'motion_graphics' as const : body.templateType === 'stock_footage' ? 'stock_footage' as const : undefined,
    productName: typeof body.productName === 'string' ? body.productName : undefined,
    keywords: Array.isArray(body.keywords) ? body.keywords.filter((k): k is string => typeof k === 'string') : undefined,
    platforms: Array.isArray(body.platforms) ? body.platforms.filter((p): p is string => typeof p === 'string') : undefined,
    fbAccountId: typeof body.fbAccountId === 'string' ? body.fbAccountId : null,
    igAccountId: typeof body.igAccountId === 'string' ? body.igAccountId : null,
    musicId: typeof body.musicId === 'string' && body.musicId.length > 0 ? body.musicId : null,
    sourceType: 'manual',
    previewRequired: true,
  };

  // Fire-and-forget: der Render dauert 30-90s, daher async
  // Client pollt GET /api/admin/reels/[id] für Status-Updates
  const promise = generateReel(opts).catch((err) => {
    console.error('[reels/generate] Hintergrund-Fehler:', err);
  });

  // Wir warten kurz, um mindestens die Draft-ID zu bekommen
  const result = await Promise.race([
    promise,
    new Promise<null>((resolve) => setTimeout(() => resolve(null), 1500)),
  ]);

  await logAudit({
    action: 'reel.generate',
    entityType: 'social_reel',
    entityLabel: topic,
    changes: { templateId: opts.templateId, templateType: opts.templateType },
    request: req,
  });

  if (result && 'reelId' in result) {
    return NextResponse.json({ reelId: result.reelId, status: result.status }, { status: 202 });
  }

  // Wenn 1.5s nicht gereicht haben, läuft der Job noch. Client muss die Liste pollen.
  return NextResponse.json({ started: true, message: 'Render läuft im Hintergrund — siehe Reels-Liste' }, { status: 202 });
}
