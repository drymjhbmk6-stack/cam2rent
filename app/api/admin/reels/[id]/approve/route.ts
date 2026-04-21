import { NextRequest, NextResponse } from 'next/server';
import { createServiceClient } from '@/lib/supabase';
import { checkAdminAuth } from '@/lib/admin-auth';
import { logAudit } from '@/lib/audit';

export const runtime = 'nodejs';

/**
 * POST /api/admin/reels/[id]/approve
 * Setzt den Reel von pending_review auf approved — bereit zum Publishen.
 * Ohne Body: wird zur manuellen Veröffentlichung freigegeben.
 * Mit { scheduled_at }: wird für diesen Zeitpunkt eingeplant.
 */
export async function POST(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  if (!(await checkAdminAuth())) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }
  const { id } = await ctx.params;

  let body: { scheduled_at?: string } = {};
  try {
    body = await req.json();
  } catch {
    /* body optional */
  }

  const supabase = createServiceClient();
  const { data: reel } = await supabase.from('social_reels').select('status').eq('id', id).single();
  if (!reel) return NextResponse.json({ error: 'Nicht gefunden' }, { status: 404 });

  if (reel.status === 'published' || reel.status === 'publishing') {
    return NextResponse.json({ error: `Reel ist bereits ${reel.status}` }, { status: 400 });
  }

  const update: Record<string, unknown> = {
    status: body.scheduled_at ? 'scheduled' : 'approved',
    reviewed_at: new Date().toISOString(),
    error_message: null,
  };
  if (body.scheduled_at) update.scheduled_at = body.scheduled_at;

  const { data, error } = await supabase.from('social_reels').update(update).eq('id', id).select('*').single();
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  await logAudit({
    action: 'reel.approve',
    entityType: 'social_reel',
    entityId: id,
    changes: update,
    request: req,
  });

  return NextResponse.json({ reel: data });
}
