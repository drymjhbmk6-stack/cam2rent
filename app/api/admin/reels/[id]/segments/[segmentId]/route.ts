/**
 * Phase 3.2 — POST /api/admin/reels/[id]/segments/[segmentId]/regenerate
 *
 * Tauscht ein einzelnes Body-Segment durch einen anderen Stock-Clip aus.
 * Optional kann eine andere Search-Query oder ein anderer Overlay-Text
 * uebergeben werden. Body wird neu gerendert, Body+CTA neu gemerged
 * (xfade), Audio neu gemischt, Final-Video + Thumbnail in Storage ersetzt.
 *
 * Body-Format:
 *   {
 *     newSearchQuery?: string,
 *     newTextOverlay?: string,
 *     excludeClipIds?: string[],
 *     confirm?: boolean   // bei status='scheduled' Pflicht
 *   }
 */

import { NextRequest, NextResponse } from 'next/server';
import { createServiceClient } from '@/lib/supabase';
import { checkAdminAuth } from '@/lib/admin-auth';
import { regenerateBodySegment } from '@/lib/reels/segment-regenerator';
import { logAudit } from '@/lib/audit';

export const runtime = 'nodejs';
// Render kann bei langsamem Pexels-Download bis zu 60 s dauern
export const maxDuration = 300;

export async function POST(req: NextRequest, ctx: { params: Promise<{ id: string; segmentId: string }> }) {
  if (!(await checkAdminAuth())) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }
  const { id: reelId, segmentId } = await ctx.params;
  const body = await req.json().catch(() => ({}));

  const supabase = createServiceClient();

  // Segment-Index aus segmentId-Row lesen (segmentId = social_reel_segments.id)
  const { data: segRow, error: segErr } = await supabase
    .from('social_reel_segments')
    .select('id, index, kind, reel_id')
    .eq('id', segmentId)
    .eq('reel_id', reelId)
    .maybeSingle();
  if (segErr || !segRow) {
    return NextResponse.json({ error: 'Segment nicht gefunden' }, { status: 404 });
  }
  if (segRow.kind !== 'body') {
    return NextResponse.json({ error: `Segment-Typ '${segRow.kind}' ist nicht tauschbar (nur Body)` }, { status: 400 });
  }

  // Status-Gate: scheduled erfordert confirm-Flag
  const { data: reelRow } = await supabase
    .from('social_reels')
    .select('status')
    .eq('id', reelId)
    .maybeSingle();
  if (!reelRow) {
    return NextResponse.json({ error: 'Reel nicht gefunden' }, { status: 404 });
  }
  if (reelRow.status === 'published') {
    return NextResponse.json({ error: 'Reel ist bereits veröffentlicht' }, { status: 400 });
  }
  if (reelRow.status === 'scheduled' && !body.confirm) {
    return NextResponse.json({
      error: 'Reel ist eingeplant — confirm-Flag im Body erforderlich',
      requiresConfirm: true,
    }, { status: 409 });
  }

  try {
    const result = await regenerateBodySegment({
      reelId,
      segmentIndex: segRow.index,
      newSearchQuery: typeof body.newSearchQuery === 'string' ? body.newSearchQuery : undefined,
      newTextOverlay: typeof body.newTextOverlay === 'string' ? body.newTextOverlay : undefined,
      excludeClipIds: Array.isArray(body.excludeClipIds) ? body.excludeClipIds : undefined,
    });

    await logAudit({
      action: 'reel.regenerate_segment',
      entityType: 'reel',
      entityId: reelId,
      changes: {
        segmentIndex: segRow.index,
        newClip: result.newClip,
      },
      request: req,
    }).catch(() => {});

    return NextResponse.json({
      ok: true,
      segmentIndex: result.segmentIndex,
      newClip: result.newClip,
      newVideoUrl: result.newVideoUrl,
      newThumbnailUrl: result.newThumbnailUrl,
      qualityMetrics: result.qualityMetrics,
      log: result.log,
    });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error('[reels/regenerate]', msg);
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
