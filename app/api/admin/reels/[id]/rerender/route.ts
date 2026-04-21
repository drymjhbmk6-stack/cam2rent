import { NextRequest, NextResponse } from 'next/server';
import { createServiceClient } from '@/lib/supabase';
import { checkAdminAuth } from '@/lib/admin-auth';
import { generateReel } from '@/lib/reels/orchestrator';
import { logAudit } from '@/lib/audit';

export const runtime = 'nodejs';
export const maxDuration = 300;

/**
 * POST /api/admin/reels/[id]/rerender — bestehendes Reel mit demselben Topic neu rendern.
 * Benutzt die ai_prompt des existierenden Reels.
 */
export async function POST(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  if (!(await checkAdminAuth())) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }
  const { id } = await ctx.params;

  const supabase = createServiceClient();
  const { data: old } = await supabase.from('social_reels').select('*').eq('id', id).single();
  if (!old) return NextResponse.json({ error: 'Nicht gefunden' }, { status: 404 });

  // Neue Reel-Row wird erzeugt (alte bleibt erhalten für Vergleich/Audit)
  const promise = generateReel({
    topic: old.ai_prompt ?? old.caption ?? 'Reel neu rendern',
    templateId: old.template_id ?? undefined,
    templateType: old.template_type,
    platforms: old.platforms,
    fbAccountId: old.fb_account_id,
    igAccountId: old.ig_account_id,
    sourceType: 'rerender',
    sourceId: id,
    previewRequired: true,
  }).catch((err) => console.error('[reels/rerender]', err));

  const result = await Promise.race([
    promise,
    new Promise<null>((resolve) => setTimeout(() => resolve(null), 1500)),
  ]);

  await logAudit({
    action: 'reel.rerender',
    entityType: 'social_reel',
    entityId: id,
    request: req,
  });

  if (result && 'reelId' in result) {
    return NextResponse.json({ reelId: result.reelId, status: result.status }, { status: 202 });
  }
  return NextResponse.json({ started: true }, { status: 202 });
}
