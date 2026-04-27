import { NextRequest, NextResponse } from 'next/server';
import { createServiceClient } from '@/lib/supabase';
import { checkAdminAuth } from '@/lib/admin-auth';
import { logAudit } from '@/lib/audit';

export const runtime = 'nodejs';

/**
 * POST /api/admin/reels/bulk
 * Body: { action: 'approve' | 'delete', ids: string[] }
 *
 * Bulk-Aktionen aus der Reels-Liste. Veröffentlichen ist NICHT enthalten —
 * das muss sequentiell laufen wegen Meta-Rate-Limits, geht weiter pro-Reel
 * über /api/admin/reels/[id]/publish.
 */
export async function POST(req: NextRequest) {
  if (!(await checkAdminAuth())) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  let body: { action?: string; ids?: unknown };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 });
  }

  const action = body.action;
  const ids = Array.isArray(body.ids) ? body.ids.filter((x): x is string => typeof x === 'string') : [];

  if (!action || !['approve', 'delete'].includes(action)) {
    return NextResponse.json({ error: "action muss 'approve' oder 'delete' sein" }, { status: 400 });
  }
  if (ids.length === 0) {
    return NextResponse.json({ error: 'ids ist leer' }, { status: 400 });
  }
  if (ids.length > 100) {
    return NextResponse.json({ error: 'Max 100 IDs pro Request' }, { status: 400 });
  }

  const supabase = createServiceClient();

  if (action === 'approve') {
    // Nur Reels mit erlaubtem Quell-Status freigeben
    const { data: rows, error: selErr } = await supabase
      .from('social_reels')
      .select('id, status, video_url')
      .in('id', ids);
    if (selErr) return NextResponse.json({ error: selErr.message }, { status: 500 });

    const allowedSrc = new Set(['pending_review', 'rendered', 'draft']);
    const eligibleIds = (rows ?? [])
      .filter((r) => allowedSrc.has(r.status) && Boolean(r.video_url))
      .map((r) => r.id);
    const skipped = ids.length - eligibleIds.length;

    if (eligibleIds.length === 0) {
      return NextResponse.json({ approved: 0, skipped, error: 'Keine freigabefähigen Reels in Auswahl' }, { status: 200 });
    }

    const { error: updErr } = await supabase
      .from('social_reels')
      .update({ status: 'approved' })
      .in('id', eligibleIds);
    if (updErr) return NextResponse.json({ error: updErr.message }, { status: 500 });

    await logAudit({
      action: 'reel.bulk_approve',
      entityType: 'social_reel',
      entityId: eligibleIds.join(','),
      changes: { count: eligibleIds.length, skipped },
      request: req,
    });

    return NextResponse.json({ approved: eligibleIds.length, skipped });
  }

  // action === 'delete' — best-effort Storage-Cleanup pro Reel + DB-Delete in einem Rutsch
  const storagePaths: string[] = [];
  for (const id of ids) {
    storagePaths.push(`${id}/video.mp4`, `${id}/thumb.jpg`);
  }
  try {
    await supabase.storage.from('social-reels').remove(storagePaths);
  } catch {
    /* ignore */
  }

  const { error: delErr } = await supabase.from('social_reels').delete().in('id', ids);
  if (delErr) return NextResponse.json({ error: delErr.message }, { status: 500 });

  await logAudit({
    action: 'reel.bulk_delete',
    entityType: 'social_reel',
    entityId: ids.join(','),
    changes: { count: ids.length },
    request: req,
  });

  return NextResponse.json({ deleted: ids.length });
}
