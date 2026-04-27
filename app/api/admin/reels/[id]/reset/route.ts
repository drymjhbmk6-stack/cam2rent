/**
 * POST /api/admin/reels/[id]/reset
 *
 * Bricht einen haengenden Render-Job ab. Setzt `status='failed'` mit einer
 * Begruendung, damit der Reel aus dem `rendering`-Limbo rauskommt und neu
 * gestartet werden kann.
 *
 * Zweck: Wenn der Background-Job (`generateReel`) abgestorben ist (Coolify-
 * Restart, OOM, FFmpeg-Hang, externer API-Timeout), bleibt das Reel sonst
 * dauerhaft auf `rendering` haengen. Diese Route entlastet den Admin sofort.
 */

import { NextRequest, NextResponse } from 'next/server';
import { createServiceClient } from '@/lib/supabase';
import { checkAdminAuth } from '@/lib/admin-auth';
import { logAudit } from '@/lib/audit';

export const runtime = 'nodejs';

export async function POST(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  if (!(await checkAdminAuth())) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }
  const { id } = await ctx.params;
  const supabase = createServiceClient();

  const { data: reel } = await supabase
    .from('social_reels')
    .select('id, status, render_log')
    .eq('id', id)
    .maybeSingle();
  if (!reel) {
    return NextResponse.json({ error: 'Reel nicht gefunden' }, { status: 404 });
  }

  // Nur 'rendering' (oder optional 'publishing') resetten — nichts Lebendes anfassen.
  if (reel.status !== 'rendering' && reel.status !== 'publishing') {
    return NextResponse.json({
      error: `Reset nur bei status='rendering' oder 'publishing' moeglich (aktuell: ${reel.status})`,
    }, { status: 400 });
  }

  const oldLog = (reel.render_log as string | null) ?? '';
  const note = `\n[reset] Manuell abgebrochen am ${new Date().toISOString()}`;
  const { error } = await supabase
    .from('social_reels')
    .update({
      status: 'failed',
      error_message: 'Render manuell abgebrochen (Render hing oder dauerte zu lange)',
      render_log: (oldLog + note).slice(-4000),
    })
    .eq('id', id);

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  await logAudit({
    action: 'reel.reset',
    entityType: 'reel',
    entityId: id,
    changes: { previousStatus: reel.status },
    request: req,
  }).catch(() => {});

  return NextResponse.json({ ok: true, previousStatus: reel.status });
}
