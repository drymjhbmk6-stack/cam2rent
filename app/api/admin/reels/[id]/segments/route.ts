/**
 * Phase 3.2 — GET /api/admin/reels/[id]/segments
 *
 * Liefert die Liste persistierter Segmente fuer ein Reel (intro/body/cta/outro)
 * mit Storage-URLs, scene_data, source_clip_data. Wird vom Admin-UI fuer den
 * Szenen-Editor genutzt.
 */

import { NextRequest, NextResponse } from 'next/server';
import { createServiceClient } from '@/lib/supabase';
import { checkAdminAuth } from '@/lib/admin-auth';

export const runtime = 'nodejs';

export async function GET(_req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  if (!(await checkAdminAuth())) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }
  const { id } = await ctx.params;
  const supabase = createServiceClient();

  const { data, error } = await supabase
    .from('social_reel_segments')
    .select('id, reel_id, index, kind, storage_path, duration_seconds, scene_data, source_clip_data, has_voice, voice_storage_path, created_at, updated_at')
    .eq('reel_id', id)
    .order('index', { ascending: true });

  if (error) {
    if (error.message?.includes('does not exist') || error.message?.includes('relation')) {
      // Migration noch nicht durch
      return NextResponse.json({ segments: [], migrationMissing: true }, { status: 200 });
    }
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  // Pro Segment eine signed URL fuer Inline-Zugriff im Frontend erzeugen.
  // social-reels-Bucket ist public, daher reicht getPublicUrl. Cache-Bust via updated_at.
  const segmentsWithUrls = (data ?? []).map((seg) => {
    const { data: pubVid } = supabase.storage.from('social-reels').getPublicUrl(seg.storage_path);
    const cacheBust = seg.updated_at ? `?v=${new Date(seg.updated_at as string).getTime()}` : '';
    return {
      ...seg,
      storage_url: pubVid?.publicUrl ? pubVid.publicUrl + cacheBust : null,
    };
  });

  return NextResponse.json({ segments: segmentsWithUrls });
}
